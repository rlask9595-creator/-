import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT7sAAAAASUVORK5CYII=';
const request = { image, period: '중기 · 1~3개월', position: 'none', lastBarState:'closed' };
const indicators = {chartInterval:'daily',gapType:'unknown',gapFill:'unknown',gapRetest:'unconfirmed',gapZone:'확인 불가',gapEvidence:['경계 미확인','메움 미확인','재시험 미확인'],ma5Cross:'unknown',ma5Slope:'unknown',ma20Slope:'unknown',maConfirmation:'unavailable',ma5:'확인 불가',ma20:'확인 불가',ma60:'확인 불가',ma120:'확인 불가',maEvidence:['5선 미표시','20선 미표시','60/120선 미표시'],bbPosition:'unknown',bbRegime:'unknown',bbConfirmation:'unavailable',bbEvidence:['밴드 미표시','위치 미확인','후속 반응 미확인'],indicatorSummary:'지표 확인 불가'};
const priceSequence={scale:'price',quality:'high',limitations:'테스트 합성 봉',candles:[10,12,15,12,11,12,15.2,12,11,12,13,16].map((v,i)=>({label:`봉 ${i+1}`,x:(i+1)/180,high:v+.5,low:v-.5,close:v,completed:true,ma20:null,volumeExpansion:'unknown'}))};
const result = { chartOverview:[],historicalWindows:[],priceContext:{precision:'unknown',support:'',resistance:'',evidence:''},priceSequence, ...indicators, patternType: 'reversal', patternStatus: 'confirmed', patternBias: 'bullish', priorTrend: 'down', candleDirection: 'known', patternLocation: '오른쪽 끝 4~2번째 봉', confirmation: '후속 종가가 패턴 고점 위에서 형성됨', patternEvidence: ['하락 뒤 2봉 몸통 장악', '후속 종가 돌파 관찰', '양음 방향 확인'], readable: true, signal: 'buy', title: '상승 확인', summary: '조건부 의견', symbol: null, timeframe: null, evidenceQuality: 'medium', trend: '상승', pattern: '확인 불가', volume: '확인 불가', support: null, resistance: null, reasons: ['저점 상승'], risks: ['돌파 실패'], nextStep: '거래량 확인', invalidation: '지지 이탈' };
async function withServer(options, fn) {
  const server = createApp(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
function post(url, body = request, extra = {}) { return fetch(url + '/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) }); }
test('serves app, connection state and restrictive headers; keeps environment files private', async () => {
  await withServer({ apiKey: '' }, async url => {
    const response = await fetch(url); assert.equal(response.status, 200); assert.match(await response.text(), /차트 분석하기/); assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.deepEqual(await (await fetch(url + '/api/status')).json(), { configured: false, model: 'gpt-4.1-mini', policyVersion: 'price-sequence-v3', deploymentCommit: process.env.RENDER_GIT_COMMIT || null });
    assert.equal((await fetch(url + '/.env')).status, 404);
    assert.equal((await post(url)).status, 503);
  });
});
test('rejects malformed images, oversized images and invalid analysis settings before calling provider', async () => {
  let calls = 0;
  await withServer({ apiKey: 'test-key', fetcher: () => { calls++; throw new Error(); } }, async url => {
    for (const body of [{...request, image: 'invalid'}, {...request, image: 'data:image/png;base64,aGVsbG8='}, {...request, period: 'anything'}, {...request, position: 'unknown'}, {...request, image: 'data:image/png;base64,' + Buffer.alloc(8 * 1024 * 1024 + 1).toString('base64')}]) assert.equal((await post(url, body)).status, 400);
    assert.equal(calls, 0);
    assert.equal((await post(url, request, { Origin: 'https://evil.example' })).status, 403);
  });
});
test('sends image and context to vision API; disables provider storage; returns structured result', async () => {
  await withServer({ apiKey: 'test-key', fetcher: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    const body = JSON.parse(options.body); assert.equal(body.store, false); assert.equal(body.input[0].content[1].image_url, image); assert.match(body.input[0].content[0].text, /중기/); assert.equal(body.text.format.strict, true);
    return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(result) }] }] });
  } }, async url => { const response = await post(url); assert.equal(response.status, 200); const data = await response.json(); assert.equal(data.signal, 'buy'); assert.ok(data.analyzedAt); });
});
test('unreadable chart forces hold and removes price levels', async () => {
  await withServer({ apiKey: '', fetcher: async (_url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer browser-key');
    return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ ...result, readable: false, support: '123', resistance: '456' }) }] }] });
  } }, async url => { const response = await post(url, { ...request, apiKey: 'browser-key' }); const data = await response.json(); assert.equal(data.signal, 'hold'); assert.equal(data.evidenceQuality, 'low'); assert.equal(data.support, null); });
});
test('reports authentication, quota and network failures without leaking provider details', async () => {
  for (const status of [401, 403, 429, 500]) await withServer({ apiKey: 'secret-test', fetcher: async () => new Response('private upstream error secret-test', { status }) }, async url => { const response = await post(url); assert.equal(response.status, status === 429 ? 429 : 502); assert.doesNotMatch(await response.text(), /secret-test|private upstream/); });
  await withServer({ apiKey: 'test', fetcher: async () => { throw new Error('private'); } }, async url => { const response = await post(url); assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /private/); });
});
test('refusal, partial output and invalid response fields cannot become a trading signal', async () => {
  for (const value of ['not json', '{}', JSON.stringify({ ...result, signal: '<script>' }), JSON.stringify({ ...result, reasons: 'not an array' })]) await withServer({ apiKey: 'test', fetcher: async () => Response.json({ output: [{ content: [{ type: 'output_text', text: value }] }] }) }, async url => { assert.equal((await post(url)).status, 502); });
});

test('MA and candle opinions cannot independently authorize trading', async () => {
  for (const patch of [{priceSequence:{...priceSequence,candles:[]}}, {priceSequence:{...priceSequence,quality:'low'}}]) {
    await withServer({apiKey:'test',fetcher:async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({...result,maConfirmation:'confirmed',ma5Cross:'up',ma5Slope:'up',ma20Slope:'up',...patch})}]}]})},async url=>{
      const r=await (await post(url)).json(); assert.equal(r.signal,'hold'); assert.equal(r.policyVersion,'price-sequence-v3');
    });
  }
});
test('server decides from price sequence and requested position, ignoring provider verdict',async()=>{
  await withServer({apiKey:'test',fetcher:async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({...result,signal:'sell',ma20Slope:'down'})}]}]})},async url=>{
    const fresh=await (await post(url)).json(); assert.equal(fresh.signal,'buy'); assert.equal(fresh.reasons.length,3); assert.equal(fresh.title,'조건부 진입 검토');
    const holder=await (await post(url,{...request,position:'holding'})).json(); assert.equal(holder.signal,'hold'); assert.equal(holder.title,'보유 유지'); assert.ok(holder.sequence.events.length);
  });
});
test('malformed nested extraction and excessive candles rejected',async()=>{
 for(const priceSequence of [{}, {...result.priceSequence,candles:[{...result.priceSequence.candles[0],high:'wrong'}]}, {...result.priceSequence,candles:Array(181).fill(result.priceSequence.candles[0])}]) {
 await withServer({apiKey:'test',fetcher:async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({...result,priceSequence})}]}]})},async url=>assert.equal((await post(url)).status,502));
 }
});
test('last bar choice reaches model, diagnostics compare original and final without image or key',async()=>{
 await withServer({apiKey:'private-test-key',fetcher:async(_url,options)=>{
   const body=JSON.parse(options.body);assert.match(body.input[0].content[0].text,/모름/);
   return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({...result,signal:'sell',title:'원래 모델 제목'})}]}]});
 }},async url=>{
   const data=await(await post(url,{...request,lastBarState:'unknown'})).json();
   assert.equal(data.assessment.diagnostics.provider.title,'원래 모델 제목');assert.equal(data.assessment.diagnostics.provider.signal,'sell');
   assert.equal(data.title,data.assessment.diagnostics.display.title);assert.notEqual(data.title,'원래 모델 제목');
   assert.doesNotMatch(JSON.stringify(data.assessment.diagnostics),/private-test-key|data:image|apiKey/);
   assert.equal(data.assessment.current.context.lastBarState,'unknown');
 });
});
test('missing observation fields are a schema error, never pattern absence',async()=>{
 const malformed={...result};delete malformed.historicalWindows;
 await withServer({apiKey:'test',fetcher:async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(malformed)}]}]})},async url=>{
   const response=await post(url);assert.equal(response.status,502);assert.equal((await response.json()).code,'MODEL_SCHEMA_INVALID');
   assert.equal((await post(url,{...request,lastBarState:'guess'})).status,400);
 });
});
test('truncated provider output is reported as incomplete, never no pattern',async()=>{
 await withServer({apiKey:'test',fetcher:async()=>Response.json({status:'incomplete',output:[]})},async url=>{
   const response=await post(url);assert.equal(response.status,502);assert.equal((await response.json()).code,'MODEL_OUTPUT_INCOMPLETE');
 });
});
