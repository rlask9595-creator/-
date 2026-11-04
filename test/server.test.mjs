import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT7sAAAAASUVORK5CYII=';
const request = { image, period: '중기 · 1~3개월', position: 'none' };
const indicators = {chartInterval:'daily',gapType:'unknown',gapFill:'unknown',gapRetest:'unconfirmed',gapZone:'확인 불가',gapEvidence:['경계 미확인','메움 미확인','재시험 미확인'],ma5Cross:'unknown',ma5Slope:'unknown',ma20Slope:'unknown',maConfirmation:'unavailable',ma5:'확인 불가',ma20:'확인 불가',ma60:'확인 불가',ma120:'확인 불가',maEvidence:['5선 미표시','20선 미표시','60/120선 미표시'],bbPosition:'unknown',bbRegime:'unknown',bbConfirmation:'unavailable',bbEvidence:['밴드 미표시','위치 미확인','후속 반응 미확인'],indicatorSummary:'지표 확인 불가'};
const result = { ...indicators, patternType: 'reversal', patternStatus: 'confirmed', patternBias: 'bullish', priorTrend: 'down', candleDirection: 'known', patternLocation: '오른쪽 끝 4~2번째 봉', confirmation: '후속 종가가 패턴 고점 위에서 형성됨', patternEvidence: ['하락 뒤 2봉 몸통 장악', '후속 종가 돌파 관찰', '양음 방향 확인'], readable: true, signal: 'buy', title: '상승 확인', summary: '조건부 의견', symbol: null, timeframe: null, evidenceQuality: 'medium', trend: '상승', pattern: '확인 불가', volume: '확인 불가', support: null, resistance: null, reasons: ['저점 상승'], risks: ['돌파 실패'], nextStep: '거래량 확인', invalidation: '지지 이탈' };
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
    assert.deepEqual(await (await fetch(url + '/api/status')).json(), { configured: false, model: 'gpt-4.1-mini' });
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

test('unconfirmed, missing context or contradictory pattern evidence cannot produce a directional signal', async () => {
  for (const patch of [{patternStatus:'candidate'}, {patternStatus:'not_found'}, {patternBias:'bearish'}, {priorTrend:'unclear'}, {candleDirection:'unknown'}, {evidenceQuality:'low'}, {patternType:'none'}, {priorTrend:'up'}, {confirmation:''}, {patternEvidence:[]}] ) {
    await withServer({apiKey:'test', fetcher:async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({...result,...patch})}]}]})}, async url=>{
      const response=await post(url); assert.equal(response.status,200); const data=await response.json();
      assert.equal(data.signal,'hold'); assert.match(data.title,/보류/); assert.equal(data.policyVersion,'technical-v3');
    });
  }
});
test('confirmed bearish continuation supports sell; missing or invalid evidence is rejected', async () => {
  const bearish={...result,signal:'sell',patternBias:'bearish',patternType:'continuation',priorTrend:'down'};
  await withServer({apiKey:'test',fetcher:async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(bearish)}]}]})},async url=>{assert.equal((await (await post(url)).json()).signal,'sell');});
  for(const patch of [{patternStatus:'guaranteed'},{patternEvidence:[{}]},{confirmation:null}]) {
    await withServer({apiKey:'test',fetcher:async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({...result,...patch})}]}]})},async url=>{assert.equal((await post(url)).status,502);});
  }
});

test('confirmed MA5 cross+slope with matching MA20 supports a signal without a candle pattern', async () => {
  for (const direction of ['up','down']) {
    const candidate={...result,signal:direction==='up'?'buy':'sell',patternStatus:'not_found',patternType:'none',patternBias:'neutral',candleDirection:'unknown',maConfirmation:'confirmed',ma5Cross:direction,ma5Slope:direction,ma20Slope:direction};
    await withServer({apiKey:'test',fetcher:async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(candidate)}]}]})},async url=>{assert.equal((await (await post(url)).json()).signal,candidate.signal);});
  }
});
test('gap or band touch alone, MA conflicts and unconfirmed MA crossings stay on hold', async () => {
  const base={...result,patternStatus:'not_found',patternType:'none',patternBias:'neutral',maConfirmation:'confirmed',ma5Cross:'up',ma5Slope:'up',ma20Slope:'up'};
  for (const data of [
    {...base,ma5Slope:'flat'}, {...base,ma20Slope:'down'}, {...base,maConfirmation:'pending'}, {...base,chartInterval:'unknown'},
    {...base,maConfirmation:'unavailable',gapType:'up',gapFill:'unfilled',gapRetest:'support_held'},
    {...base,maConfirmation:'unavailable',bbPosition:'lower',bbRegime:'range',bbConfirmation:'pending'},
    {...base,gapType:'down',gapFill:'unfilled',gapRetest:'resistance_held'},
    {...base,bbRegime:'range',bbConfirmation:'bearish_reentry'},
    {...result,ma20Slope:'down'}
  ]) await withServer({apiKey:'test',fetcher:async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(data)}]}]})},async url=>{assert.equal((await (await post(url)).json()).signal,'hold');});
});
test('filled gaps and band touch in a trend do not independently veto a confirmed pattern', async () => {
  for (const patch of [{gapType:'down',gapFill:'filled',gapRetest:'resistance_held'}, {bbRegime:'trend',bbPosition:'upper',bbConfirmation:'pending'}]) {
    await withServer({apiKey:'test',fetcher:async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({...result,...patch})}]}]})},async url=>{assert.equal((await (await post(url)).json()).signal,'buy');});
  }
});
