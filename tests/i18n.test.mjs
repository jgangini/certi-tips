import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { segmentId, sourceDigest, validateManifest, engineDigest, loadTranslations } from '../scripts/i18n.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const record = (text, context = 'text') => ({ id: segmentId(text, context), text, context });

test('translation identities include context and source; duplicate records fail closed', () => {
  assert.notEqual(segmentId('Hola', 'text'), segmentId('Hola', 'svg'));
  assert.notEqual(segmentId('Hola', 'text'), segmentId('Hola!', 'text'));
  const item = record('Hola');
  assert.equal(validateManifest({ version: 1, segments: [item] }).size, 1);
  assert.throws(() => validateManifest({ version: 1, segments: [item, item] }), /duplicated/);
  assert.throws(() => validateManifest({ version: 1, segments: [{ ...item, text: 'cambio' }] }), /Invalid/);
  assert.throws(() => validateManifest({ version: 1, sourceRoot: '../other', segments: [] }), /source/);
  assert.throws(() => validateManifest({ version: 1, sourceRoot: '', segments: [] }), /source/);
});

test('the build rejects missing, stale and corrupt generated dictionaries', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'certitips-i18n-'));
  try {
    await mkdir(path.join(root, 'data'), { recursive: true });
    await mkdir(path.join(root, 'data/es'));
    await writeFile(path.join(root, 'data/i18n.json'), '{"version":1}');
    await writeFile(path.join(root, 'requirements-i18n.txt'), 'pinned==1');
    const manifest = { version: 1, segments: [record('Hola')] };
    const translations = { [manifest.segments[0].id]: 'Hello' };
    const entry = { version: 1, sourceDigest: sourceDigest(manifest), engineDigest: await engineDigest(root), translations, translationDigest: digest(JSON.stringify(Object.entries(translations).sort())), svg: {} };
    for (const locale of ['en', 'pt', 'it']) {
      await mkdir(path.join(root, 'data', locale));
      await writeFile(path.join(root, 'data', locale, 'translations.json'), JSON.stringify({ ...entry, locale }));
    }
    assert.equal((await loadTranslations(root, manifest)).en[manifest.segments[0].id], 'Hello');
    await writeFile(path.join(root, 'data/es/new.svg'), '<svg/>');
    await assert.rejects(loadTranslations(root, manifest), /SVG coverage/);
    await rm(path.join(root, 'data/es/new.svg'));
    await assert.rejects(loadTranslations(root, { ...manifest, segments: [record('Cambio')] }), /Stale/);
    await writeFile(path.join(root, 'data/en/translations.json'), JSON.stringify({ ...entry, locale: 'en', translations: { [manifest.segments[0].id]: 'Altered' } }));
    await assert.rejects(loadTranslations(root, manifest), /Corrupt/);
    await writeFile(path.join(root, 'data/i18n.json'), '{"version":2}');
    await assert.rejects(loadTranslations(root, manifest), /Stale/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('offline engine preserves literals, retries markers and grouped SVG labels', async () => {
  const localPython = path.resolve('output/i18n-venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const python = process.env.I18N_PYTHON || (existsSync(localPython) ? localPython : 'python');
  const source = String.raw`
import sys, json, hashlib, tempfile
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0, 'scripts')
from i18n_models import ArgosModel, pieces, protected_pattern, model_files
from types import SimpleNamespace
from i18n_svg import svg_units, render_svg, validate_svg
import i18n
from i18n import Translator, validate_translation, manifest_records, source_digest

pattern = protected_pattern(['OCI', 'OpenAI'])

class DecodingFixture:
    def translate_batch(self, batches, **options):
        result = []
        for words in batches:
            source = ' '.join(words)
            output = ['repeated'] * 768 if 'ZXQ' in source or source == 'Texto irrecuperable' else {'Consulta':'Consult', 'y revisa':'and check'}[source].split()
            result.append(SimpleNamespace(hypotheses=[output]))
        return result

bounded = ArgosModel.__new__(ArgosModel)
bounded.encode, bounded.decode = str.split, lambda words: ' '.join(words)
bounded.translator = DecodingFixture()
assert bounded.translate(['Consulta ZXQ0XZ y revisa ZXQ1XZ.']) == ['Consult ZXQ0XZ and check ZXQ1XZ.']
try:
    bounded.translate(['Texto irrecuperable'])
    raise AssertionError('An untranslatable natural fragment must still block publication')
except ValueError as error:
    assert 'decoding limit' in str(error)
text = 'Usa OCI con {count}, response.output_text y https://example.com/docs.'
parts = pieces(text, pattern)
assert ''.join(value for value, _ in parts) == text
assert all(not translate for value, translate in parts if value in ['OCI', '{count}', 'response.output_text', 'https://example.com/docs.'])
assert Translator.restore('Use ZXQ0XZ with Z X Q 1 X Z.', ['OCI', '{count}']) == 'Use OCI with {count}.'
assert Translator.restore('A ZXQ0XZthese candidates', ['RAG']) == 'A RAG these candidates'
validate_translation('Precisión: 95 por ciento', 'Accuracy: 95%', pattern)
validate_translation('Data Security\nSeguridad', 'Data Security\nSecurity', pattern)
validate_translation('CertiTips', 'Stack.CertiTips', protected_pattern(['CertiTips']))
assert pieces('f-07 2–3', pattern) == [('f-07', False), (' ', False), ('2–3', False)]
try:
    Translator.restore('missing', ['OCI'])
    raise AssertionError('missing marker accepted')
except ValueError: pass
for source, target in [('el contexto pertinente.', 'The information referred to in Article 3 of Regulation EC 1065 shall be submitted to the Commission and the Commission.'), ('PRUEBAS', 'FURTHER FURTHER'), ('2 instancias', '2')]:
    try:
        validate_translation(source, target, pattern)
        raise AssertionError('hallucinated expansion/repetition accepted')
    except ValueError: pass
try:
    validate_translation(text, 'Use cloud', pattern)
    raise AssertionError('missing literals accepted')
except ValueError: pass

class FakeModel:
    calls = 0
    def __init__(self, *args): pass
    def translate(self, texts):
        FakeModel.calls += len(texts)
        return [text.replace('Hola', 'Hello') for text in texts]
i18n.ArgosModel = FakeModel
with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    config = {'engineRevision':1, 'protectedTerms':['OCI'], 'overrides':{'en':{},'pt':{},'it':{}}, 'models':[{'sha256':'0'*64}], 'glossary':{'nube':{'en':'cloud','pt':'nuvem','it':'nuvola'}}}
    text = 'Hola nube OCI {count}'
    identity = hashlib.sha256(('text\0'+text).encode()).hexdigest()
    records = [{'id':identity,'text':text,'context':'text'}]
    first = Translator(root, config, 'digest').blocks('en', records)
    assert first[identity] == 'Hello cloud OCI {count}'
    calls = FakeModel.calls
    config['glossary']['nube']['en'] = 'cloud platform'
    warm = Translator(root, config, 'new digest').blocks('en', records)
    assert warm[identity] == 'Hello cloud platform OCI {count}' and FakeModel.calls == calls
    config['protectedTerms'].append('Hola')
    changed = Translator(root, config, 'changed digest').blocks('en', records)
    assert changed[identity] == 'Hola cloud platform OCI {count}' and FakeModel.calls == calls
    config['overrides']['en'][text] = 'Hola reviewed OCI {count}'
    calls = FakeModel.calls
    assert Translator(root, config, 'override digest').blocks('en', records)[identity] == 'Hola reviewed OCI {count}' and FakeModel.calls == calls
    config['protectedTerms'].append('deployments')
    config['glossary']['despliegues'] = {'en':'deployments','pt':'implantações','it':'distribuzioni'}
    translator = Translator(root, config, 'collision digest')
    assert translator.restore(*translator.mask('deployments', 'pt', {'deployments'})) == 'deployments'
    assert translator.restore(*translator.mask('deployments', 'pt')) == 'implantações'
    cache = root / 'models'
    cache.mkdir()
    (cache / 'bad.argosmodel').write_bytes(b'not a model')
    try:
        model_files(cache, {'id':'bad','sha256':'0'*64})
        raise AssertionError('corrupt cached model accepted')
    except ValueError: pass
    with patch('i18n_models.urllib.request.urlopen', side_effect=OSError('offline')):
        try:
            model_files(cache, {'id':'missing','sha256':'0'*64,'url':'https://data.argosopentech.com/argospm/v1/missing.argosmodel'})
            raise AssertionError('failed download accepted')
        except OSError: pass
    assert not (cache / 'missing.argosmodel').exists() and not (cache / 'missing.download').exists()

svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 200"><title>Hola nube</title><text id="label" x="10" y="40"><tspan x="10">Hola</tspan><tspan x="10" dy="30">nube</tspan></text><rect aria-label="Hola nube" width="100" height="40"/></svg>'
units = svg_units(svg)
assert len(units) == 3 and {unit['segment']['text'] for unit in units} == {'Hola nube'}
result = render_svg(svg, units, {unit['segment']['id']: 'Hello cloud' for unit in units})
tree = validate_svg(result, 'fixture.svg')
assert 'Hola' not in result and 'Hello' in result and 'cloud' in result
assert 'id="label" x="10" y="40"' in result and 'dy="30"' in result
from i18n_svg import repartition
phrase = 'The physical representation implements the rule and retains its date.'
lines = repartition(phrase.split(), [34, 28])
assert len(lines) == 2 and ' '.join(lines) == phrase and all(len(line) < len(phrase) for line in lines)
for unsafe in ['<svg><image href="photo.png"/></svg>', '<svg><image href="data:image/png;base64,AAAA"/></svg>', '<svg><image href="https://example.com/raster.svg"/></svg>', '<svg><use href="photo.png"/></svg>', '<!DOCTYPE svg><svg/>']:
    try:
        validate_svg(unsafe, 'unsafe.svg')
        raise AssertionError('unsafe SVG accepted')
    except ValueError: pass

bad = {'id':'0'*64, 'text':'Hola', 'context':'text'}
try:
    manifest_records({'version':1,'segments':[bad]})
    raise AssertionError('wrong source hash accepted')
except ValueError: pass
print('Offline i18n checks passed; no models, downloads or APIs called')
`;
  const { stdout } = await promisify(execFile)(python, ['-c', source], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
  assert.match(stdout, /Offline i18n checks passed/);
});
