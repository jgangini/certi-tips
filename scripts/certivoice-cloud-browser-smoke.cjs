// Real controller and UI with mocked API/audio; no inference, microphone or screenshots.
async (page) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const base = new URL('/certitips/', page.url()).href, calls = [], errors = [];
  const tts = { model: 'fish-audio/drama-3', voice: 'f3a2b90078d54a65af4b95f63bc7798e', name: 'Sheila' };
  const literal = 'Oracle estima el tenancy. SaaS e IaaS em São Paulo.';
  let action = null, hold = false, release, fail = false, pending = false;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://127.0.0.1:18741/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const headers = { 'access-control-allow-origin': new URL(base).origin, 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'x-certichat,content-type,traceparent,x-request-id' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path === '/api/events') return route.fulfill({ status: 204, headers });
    const body = request.postDataJSON(); calls.push({ path, body });
    if (path === '/api/speech') {
      if (hold) await new Promise(resolve => { release = resolve; });
      try { return await route.fulfill({ status: fail ? 502 : 200, headers, json: fail ? {code:'voice_speech'} : { requestId: body.requestId, audio: { ...tts, format: 'mp3', data: 'SUQzAAAAAA==' } } }); }
      catch { return; } // Explicit Exit may have aborted this request.
    }
    if (path === '/api/voice' && pending) return route.fulfill({status:409,headers,json:{code:'request_pending'}});
    if (path === '/api/voice') return route.fulfill({ headers, json: {requestId:body.requestId, answer:action ? '' : literal, transcript:'Explica', educational:!action, action, sources:[], quota:{remaining:20}, contentVersion:'test'} });
    return route.fulfill({ headers, json: {mode:'LOCAL',authenticated:true,verificationRequired:false,available:true,voice:{enabled:true,maxSeconds:30,tts},quota:{remaining:20}} });
  });
  await page.addInitScript(() => {
    window.__nativeCalls = 0; window.__starts = 0; window.__captures = 0;
    if (sessionStorage.getItem('__cloudIOS')) Object.defineProperty(navigator, 'userAgent', {configurable:true,value:'iPhone'});
    window.addEventListener('certivoice:state', event => { window.__voiceState = event.detail; });
    const node = () => ({connect(){},disconnect(){}});
    class AudioEngine {
      constructor() { window.__ctx=this; this.sampleRate=16000; this.currentTime=0; this.state='running';this.destination={};this.audioWorklet={addModule:async()=>{}}; }
      resume() {this.state='running';return Promise.resolve();}
      suspend() {this.state='suspended';return Promise.resolve();}
      createMediaStreamSource(){return node();}
      createGain(){return {...node(),gain:{}};}
      async decodeAudioData(bytes){ if(window.__holdDecode)await new Promise(resolve=>{window.__releaseDecode=resolve;}); if (new Uint8Array(bytes)[0]!==73) throw new Error('MP3 missing'); return {duration:20,sampleRate:16000,getChannelData:()=>new Float32Array(32000).fill(.1)}; }
      createBufferSource(){const source={...node(),start(){window.__output=source;window.__starts++;},stop(){source.stopped=true;}};return source;}
    }
    window.AudioContext=AudioEngine;
    window.AudioWorkletNode=class {constructor(){this.port={};window.__port=this.port;}connect(){}disconnect(){}};
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{window.__captures++;const track={enabled:true,stop(){this.stopped=true;}};window.__track=track;return {getTracks:()=>[track],getAudioTracks:()=>[track]};}}});
    Object.defineProperty(navigator,'permissions',{configurable:true,value:{query:async()=>({state:'granted'})}});
    window.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
    Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>{window.__nativeCalls++;return [{name:'Microsoft Sabina',lang:'es-MX'}];},speak:()=>{window.__nativeCalls++;},cancel(){},speaking:false,pending:false}});
    window.__talk=()=>{const emit=value=>window.__port.onmessage?.({data:new Float32Array(2048).fill(value)});for(let i=0;i<3;i++)emit(.1);for(let i=0;i<8;i++)emit(0);};
    window.__end=()=>window.__output.onended?.();
  });
  const wave=page.locator('deep-chat [data-certivoice-icon="start"]').locator('..');
  const mute=page.locator('deep-chat [data-certivoice-icon="mute"]').locator('..');
  const exit=page.locator('deep-chat [data-certivoice-icon="exit"]').locator('..');
  const start=async()=>{await page.locator('[data-chat-open]').click();await wave.click();await page.waitForFunction(()=>window.__voiceState?.phase==='listening');};
  const speaking=()=>page.waitForFunction(()=>window.__voiceState?.phase==='speaking');
  for (const ios of [false,true]) {
    await page.goto(base+'es/'); await page.evaluate(ios=>{sessionStorage.clear();if(ios)sessionStorage.setItem('__cloudIOS','1');},ios);await page.reload();
    await page.setViewportSize(ios ? {width:394,height:852} : {width:1440,height:900});
    await page.waitForFunction(()=>window.__voiceState?.enabled);
    await start();
    for(const theme of ['light','dark']) for(const reduced of [false,true]) {
      await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
      const edge=await page.evaluate(({theme})=>{
        document.documentElement.dataset.theme=theme;
        const root=document.querySelector('[data-voice-edge]'),cutout=root.querySelector('.voice-edge-cutout');
        root.style.setProperty('--voice-level','0');const base=cutout.getBBox().x,radius=parseFloat(getComputedStyle(cutout).rx);
        root.style.setProperty('--voice-level','1');const peak=cutout.getBBox().x,peakRadius=parseFloat(getComputedStyle(cutout).rx);root.style.removeProperty('--voice-level');
        return {base,peak,radius,peakRadius,mask:root.querySelector('.voice-edge-colors').getAttribute('mask')};
      },{theme});
      assert(Math.abs(edge.base-12)<.1&&Math.abs(edge.peak-(reduced?12:13.2))<.1&&edge.peak/edge.base<=1.101&&edge.peakRadius/edge.radius<=1.101&&edge.mask==='url(#voice-edge-mask)','Edge thickness or movement exceeded the 10 percent bound: '+JSON.stringify(edge));
    }
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(()=>window.__talk());await speaking();
    assert(calls.filter(c=>c.path==='/api/voice').at(-1).body.audioOutput==='browser','Cloud TTS changed the educational reasoning path');
    assert(calls.filter(c=>c.path==='/api/speech').at(-1).body.text===literal,'Mixed-language text was rewritten');
    assert(await page.evaluate(()=>window.__nativeCalls===0),'Cloud narration called a native voice');
    if(ios)assert(await page.evaluate(()=>window.__track.stopped),'iOS capture was not released before playback');
    await mute.click();
    assert(await page.evaluate(()=>window.__voiceState.muted&&window.__voiceState.phase==='speaking'&&!window.__output.stopped),'Mute interrupted narration');
    await mute.click();await page.evaluate(()=>window.__end());await page.waitForFunction(()=>window.__voiceState.phase==='listening');
    action={name:'videos'};await page.evaluate(()=>window.__talk());
    await page.waitForURL(/certitube/);await speaking();
    assert(calls.filter(c=>c.path==='/api/speech').at(-1).body.text.includes('Página abierta'),'Navigation confirmation missed the pinned voice');
    await page.evaluate(()=>window.__end());await page.waitForFunction(()=>window.__voiceState.phase==='listening');
    action=null;pending=true;
    await page.evaluate(()=>window.__talk());
    await page.waitForFunction(()=>window.__voiceState.phase==='thinking');
    await page.waitForTimeout(1200);
    const recovering = calls.filter(c=>c.path==='/api/voice').slice(-2);
    assert(recovering.length===2 && JSON.stringify(recovering[0].body)===JSON.stringify(recovering[1].body),'Pending recovery regenerated UUID/audio/context');
    assert(await page.evaluate(()=>window.__voiceState.active&&!window.__voiceState.error),'Pending response was converted into a paused error');
    await page.evaluate(()=>window.__talk());await page.waitForFunction(()=>!window.__voiceState.active&&window.__voiceState.retry);
    const captures=await page.evaluate(()=>window.__captures);
    await wave.click();await page.waitForFunction(()=>window.__voiceState.phase==='thinking');
    assert(await page.evaluate(n=>window.__captures===n,captures),'Resume opened another capture while recovering an existing request');
    assert(JSON.stringify(calls.filter(c=>c.path==='/api/voice').at(-1).body)===JSON.stringify(recovering[0].body),'Resume changed the original pending request');
    pending=false;await speaking();await page.evaluate(()=>window.__end());await page.waitForFunction(()=>window.__voiceState.phase==='listening');
    pending=true;await page.evaluate(()=>window.__talk());await page.waitForFunction(()=>window.__voiceState.phase==='thinking');
    await exit.click();const closedCalls=calls.filter(c=>c.path==='/api/voice').length;await page.waitForTimeout(1200);
    assert(calls.filter(c=>c.path==='/api/voice').length===closedCalls && await page.evaluate(()=>!window.__voiceState.active),'Exit allowed a late pending replay');
    pending=false;await start();
    action=null;const decodingStarts=await page.evaluate(()=>{window.__holdDecode=true;window.__talk();return window.__starts;});
    await page.waitForFunction(()=>window.__releaseDecode);
    await page.evaluate(()=>{window.dispatchEvent(new CustomEvent('certivoice:command',{detail:'interrupt'}));window.__holdDecode=false;window.__releaseDecode();});
    await page.waitForFunction(()=>window.__voiceState.phase==='listening');
    assert(await page.evaluate(n=>window.__starts===n,decodingStarts),'Late decoded audio ignored explicit interruption');
    action=null;hold=true;release=null;const before=calls.length;
    await page.evaluate(()=>window.__talk());await page.waitForFunction(()=>window.__voiceState.phase==='thinking');
    await page.waitForTimeout(80);
    assert(calls.slice(before).some(c=>c.path==='/api/speech'),'Pending synthesis was not requested');
    const starts=await page.evaluate(()=>window.__starts);await exit.click();hold=false;release?.();await page.waitForTimeout(100);
    assert(await page.evaluate(n=>!window.__voiceState.active&&window.__starts===n,starts),'Late audio revived closed chat');
    assert(await page.locator('#certichat-panel').isHidden(),'X did not close chat');
    fail=true;await start();await page.evaluate(()=>window.__talk());await page.waitForFunction(()=>window.__voiceState.phase==='paused'&&window.__voiceState.error);
    assert(await page.evaluate(()=>window.__nativeCalls===0),'Provider failure silently changed the voice');
    await exit.click();fail=false;
  }
  assert(errors.length===0,errors.join('; '));
  return {checks:40,platforms:['desktop','iPhone simulation'],tts,paidInferences:0,screenshots:0};
}
