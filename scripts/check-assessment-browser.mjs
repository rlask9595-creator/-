// Synthetic API fixture; requires Chromium and a running app. CHART_TEST_PORT defaults to 3000.
import { readFileSync } from 'node:fs';
const fixture=JSON.parse(readFileSync(new URL('../test/fixtures/assessment-ui.json',import.meta.url),'utf8'));
// Requires a running app on localhost:3001 and /usr/bin/chromium. API responses are mocked.
import { spawn } from 'node:child_process';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import assert from 'node:assert/strict';
const profile = await mkdtemp('/tmp/chart-chromium-');
const browser = spawn('/usr/bin/chromium', ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--no-proxy-server', '--remote-debugging-port=9223', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let ws;
try {
 let targets;
 for (let i=0; i<60;i++) { try { targets=await (await fetch('http://127.0.0.1:9223/json')).json(); break; } catch { await new Promise(r=>setTimeout(r,150)); } }
 assert.ok(targets, 'Browser started');
 ws = new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 let id=0; const pending=new Map(); const errors=[];
 ws.addEventListener('message',event=> { const m=JSON.parse(event.data); if(m.id) {const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);} if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text); });
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async expression=> {const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{for(let i=0;i<70;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw new Error('Timed out: '+expression);};
 await send('Runtime.enable'); await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:'http://127.0.0.1:'+(process.env.CHART_TEST_PORT||'3000')});
 await wait(`document.querySelector('#sample-button') && document.readyState==='complete'`);
 await evaluate(`document.fonts.ready.then(()=>true)`);
 assert.equal(await evaluate(`document.fonts.check('500 14px Pretendard')`),true);
 assert.equal(await evaluate(`document.querySelector('#analyze-button').disabled`),true);
 assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`),true);
 let shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile('/tmp/chart-signal-desktop.png',Buffer.from(shot.data,'base64'));
 await evaluate(`document.querySelector('#hero-sample-button').click()`);
 await evaluate(`window.scrollTo({top:0,behavior:'instant'})`);
 assert.equal(await evaluate(`!document.querySelector('#analysis-result').hidden && !!document.querySelector('.sample-notice')`),true);
 await new Promise(r=>setTimeout(r,300));
 let resultShot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile('/tmp/chart-signal-result.png',Buffer.from(resultShot.data,'base64'));
 await evaluate(`loadFile(new File(['test'], 'invalid.svg', {type:'image/svg+xml'}))`);
 assert.match(await evaluate(`document.querySelector('#error').textContent`),/PNG/);
 await evaluate(`new Promise(resolve=> { const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=600;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1200,600);ctx.strokeStyle='#ddd';for(let y=80;y<600;y+=80){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1200,y);ctx.stroke();}const closes=[10,12,15,12,11,12,15.2,12,11,12,13,16,19];closes.forEach((v,i)=>{const x=60+i*84,y=550-v*22;ctx.strokeStyle=i&&v<closes[i-1]?'#3286d2':'#ed6551';ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.moveTo(x,y-22);ctx.lineTo(x,y+22);ctx.stroke();ctx.fillRect(x-10,y-10,20,20);});ctx.fillStyle='#665749';ctx.font='18px sans-serif';ctx.fillText('SYNTHETIC CHART / UI TEST',30,35);canvas.toBlob(async blob=>{await loadFile(new File([blob],'test-chart.png',{type:'image/png'}));resolve();}); })`);
 assert.equal(await evaluate(`document.querySelector('#analyze-button').disabled`),false);
 assert.equal(await evaluate(`document.querySelector('#analysis-result').hidden`),true);
 assert.match(await evaluate(`document.querySelector('#hero-sample-button').textContent`),/내 차트 분석/);
 await evaluate(`document.querySelector('#hero-sample-button').click()`);
 assert.equal(await evaluate(`document.querySelector('#settings-dialog').open`),true);
 let modalShot=await send('Page.captureScreenshot',{format:'png'});await writeFile('/tmp/chart-signal-settings.png',Buffer.from(modalShot.data,'base64'));
 await evaluate(`document.querySelector('#api-key').value='browser-test-key';document.querySelector('#settings-form').requestSubmit()`);
 assert.equal(await evaluate(`document.querySelector('#settings-dialog').open`),false);
 assert.equal(await evaluate(`sessionStorage.length + localStorage.length`),0);
 await evaluate(`window.originalFetch=window.fetch;window.sentImages=[];window.fetch=async(url,options)=>{if(url!=='/api/analyze')return originalFetch(url,options);sentImages.push(JSON.parse(options.body).image);return Response.json({...sample,...${JSON.stringify(fixture)},symbol:'업로드 응답 테스트 종목',analyzedAt:new Date().toISOString()});};document.querySelector('#hero-sample-button').click()`);
 await wait(`document.querySelector('#history-count').textContent==='1'`);
 assert.equal(await evaluate(`document.querySelector('.sample-notice')===null`),true);
 assert.equal(await evaluate(`sentImages.length===1 && sentImages[0]===document.querySelector('#chart-preview').src`),true);
 assert.match(await evaluate(`document.querySelector('.result-meta').textContent`),/업로드 응답 테스트 종목/);
 assert.equal(await evaluate(`document.querySelector('#result-badge').textContent`),'ANALYSIS');
 assert.equal(await evaluate(`document.querySelector('.signal-card h3').textContent`),'신규 진입 대기');
 assert.equal(await evaluate(`document.querySelectorAll('.decision-evidence li').length`),3);
 assert.match(await evaluate(`document.querySelector('.decision-next').textContent`),/다음 확인 조건/);
 assert.equal(await evaluate(`document.querySelectorAll('.chart-annotation line').length`),1);
 for(const width of [320,390,768,1440]) {
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
  assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true,'Result fits '+width);
  const clip=await evaluate(`(()=>{const r=document.querySelector('.result-content').getBoundingClientRect(),c=document.querySelector('.signal-card').getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:c.bottom-r.top+24,scale:1};})()`);
  const card=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip});await writeFile('/tmp/chart-v3-card-'+width+'.png',Buffer.from(card.data,'base64'));
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile('/tmp/chart-v3-'+width+'.png',Buffer.from(shot.data,'base64'));
 }

 await evaluate(`document.querySelector('#history-button').click()`);
 assert.equal(await evaluate(`document.querySelectorAll('.history-item').length`),1);
 await evaluate(`document.querySelector('.history-item').click()`);
 assert.equal(await evaluate(`document.querySelector('#history-dialog').open`),false);
 await evaluate(`window.fetch=async()=>Response.json({error:'테스트 연결 실패'},{status:429});document.querySelector('#sample-button').click()`);
 await wait(`document.querySelector('#error').textContent==='테스트 연결 실패'`);
 assert.equal(await evaluate(`document.querySelector('#analysis-result').hidden && document.querySelector('#result-badge').textContent !== 'SAMPLE / 예시' && currentResult===null`),true);
 assert.equal(await evaluate(`document.querySelector('#analyze-button').disabled`),false);
 await evaluate(`document.querySelector('#remove-image').click()`);
 assert.match(await evaluate(`document.querySelector('#hero-sample-button').textContent`),/예시 살펴보기/);
 assert.equal(await evaluate(`document.querySelector('#analyze-button').disabled`),true);
 for(const width of [320,360,690,768,850,1024,1280]) {
 await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
 assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`),true, 'No horizontal overflow at '+width);
 }
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`),true);
 await evaluate(`window.scrollTo({top:0,behavior:'instant'})`);
 shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile('/tmp/chart-signal-mobile.png',Buffer.from(shot.data,'base64'));
 assert.deepEqual(errors,[]);
 console.log('PASS: Upload routes both sample buttons to actual image request, missing key prompts settings, quota errors never show demo, removal restores demo; Desktop/mobile layout, sample labeling, invalid upload, image preview, API settings, no key persistence, result rendering, history, error recovery, removal; no browser exceptions.');
} finally {ws?.close();browser.kill();await new Promise(r=>browser.once('exit',r));await rm(profile,{recursive:true,force:true});}
