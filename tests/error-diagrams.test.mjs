import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('all frequent-error diagrams share typography, headings and paired-card geometry', () => {
  const diagrams = [
    ['agents-mistakes', 4], ['langchain-errors', 3], ['mcp-errors', 3],
    ['openai-errors', 4], ['oci-errors', 5], ['database-misconceptions', 4],
  ];
  let sharedStyle, sharedHeadings;
  for (const [name, count] of diagrams) {
    const svg = readFileSync(new URL(`../assets/diagrams/${name}.svg`, import.meta.url), 'utf8');
    const style = svg.match(/<style>([\s\S]*?)<\/style>/)?.[1];
    const headings = svg.match(/<g class="column-headings">([\s\S]*?)<\/g>/)?.[1];
    assert.ok(style && headings, `${name}: missing comparison style or headings`);
    sharedStyle ??= style;
    sharedHeadings ??= headings;
    assert.equal(style, sharedStyle, `${name}: inconsistent palette or typography`);
    assert.equal(headings, sharedHeadings, `${name}: inconsistent column labels or icons`);
    assert.match(headings, />Error o confusión<\/text>/);
    assert.match(headings, />Qué comprobar<\/text>/);
    assert.match(svg, new RegExp(`viewBox="0 0 1200 ${190 + 116 * count}"`));
    const rows = svg.split('<g class="comparison-row"').slice(1);
    assert.equal(rows.length, count, `${name}: preserve every existing comparison`);
    for (const [index, row] of rows.entries()) {
      assert.ok(row.startsWith(` transform="translate(0 ${154 + 116 * index})">`));
      assert.match(row, /<rect x="56" width="480" height="96" rx="16"\/>/);
      assert.match(row, /<rect x="624" width="520" height="96" rx="16"\/>/);
      assert.match(row, /<path d="M553 48h50m-13-9 13 9-13 9" class="arrow"\/>/);
      for (const column of ['mistake', 'correction']) {
        const cell = row.match(new RegExp(`<g class="${column}">([\\s\\S]*?)<\\/g>`))?.[1];
        assert.ok(cell, `${name}: missing ${column} cell`);
        const labels = [...cell.matchAll(/<text x="(\d+)" y="(\d+)">([^<]+)<\/text>/g)];
        assert.ok(labels.length === 1 || labels.length === 2, `${name}: one or two readable lines`);
        assert.deepEqual(labels.map(([, x]) => Number(x)), labels.map(() => column === 'mistake' ? 82 : 650));
        assert.deepEqual(labels.map(([, , y]) => Number(y)), labels.length === 1 ? [57] : [40, 74]);
      }
    }
  }
});
