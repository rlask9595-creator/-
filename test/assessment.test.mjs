import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessChart} from '../chart-assessment.mjs';
import {analyzeSequence} from '../sequence-policy.mjs';
const base=[10,12,15,12,11,12,15.2,12,11,12,13];
const seq=(values)=>({scale:'price',quality:'high',limitations:'',candles:values.map((v,i)=>({label:`관찰 봉 ${i+1}`,x:(i+1)/200,high:v+.5,low:v-.5,close:v,date:null,ma20:null,completed:true,volumeExpansion:'unknown'}))});
const raw=(s)=>({readable:true,evidenceQuality:'medium',signal:'buy',title:'모델 의견',summary:'모델 관찰',trend:'고저점 상승',pattern:'반복 저항',volume:'거래량 미확인',support:'관찰 지지',resistance:'관찰 저항',reasons:['모델 관찰 근거'],priceSequence:s,historicalWindows:[],chartOverview:[{location:'왼쪽',regime:'range',evidence:'비슷한 고점 반복'}],priceContext:{precision:'relative',support:'직전 조정 저점',resistance:'이전 고점 구간',evidence:'형태 관찰'}});
test('unknown final candle preserves historical candidates and valid prior analysis',()=>{
 const r=assessChart(raw(seq([...base,16,17])),{position:'none',lastBarState:'unknown'});
 assert.equal(r.current.title,'신규 진입 대기');assert.ok(r.historical.some(e=>e.stage==='breakout'));assert.equal(r.current.usableBars,12);assert.equal(r.current.context.lastBarSource,'unknown');
});
test('user close confirmation overrides only final candle and is attributed',()=>{
 const s=seq([...base,16]);s.candles.at(-1).completed=false;
 const r=assessChart(raw(s),{lastBarState:'closed'});
 assert.equal(r.current.title,'조건부 진입 검토');assert.equal(r.current.context.lastBarSource,'user');
 assert.equal(assessChart(raw(s),{lastBarState:'open'}).current.signal,'hold');
});
test('global low quality does not wipe locally readable candles or model observations',()=>{
 const r=assessChart({...raw(seq([...base,16])),evidenceQuality:'low'},{lastBarState:'closed'});
 assert.equal(r.current.signal,'buy');assert.equal(r.diagnostics.provider.support,'관찰 지지');assert.ok(r.historical.length);
});
test('unreadable current region preserves independently readable historical window',()=>{
 const r=raw({scale:'unreadable',quality:'low',limitations:'오른쪽 봉 겹침',candles:[]});
 r.historicalWindows=[{location:'왼쪽 전환',context:'long_range',sequence:seq([...base,16,17])}];
 const a=assessChart(r,{lastBarState:'unknown'});
 assert.equal(a.current.title,'판독 정보 부족');assert.ok(a.historical.length);assert.equal(a.historical[0].patternKind,'장기 횡보 최초 돌파');assert.match(a.levels.support,/순서 미검증/);
});
test('an internal unreadable candle starts a new segment instead of deleting all later history',()=>{
 const s=seq([...base,16,0,...base,16]);s.candles[12].close=null;
 const r=analyzeSequence(s);assert.equal(r.events.filter(e=>e.stage==='breakout').length,2);assert.equal(r.gaps.length,1);
});
test('sharp structural damage does not wait for a rebound, but needs combined evidence',()=>{
 const s=seq([...base,16,19,22,20,21,23,25,10]);s.candles.at(-1).volumeExpansion='observed';
 assert.equal(analyzeSequence(s,'holding').stage,'sharp');assert.equal(analyzeSequence(s,'holding').signal,'sell');
 s.candles.at(-1).volumeExpansion='unknown';assert.notEqual(analyzeSequence(s,'holding').stage,'sharp');
});
test('pullback holding former resistance and recovery is a separate candidate',()=>{
 const r=analyzeSequence(seq([...base,16,18,16.3,17.5]));assert.equal(r.stage,'retest');assert.ok(r.events.some(e=>e.stage==='retest'));
});
test('separate rising consolidation can form a second breakout',()=>{
 const r=analyzeSequence(seq([...base,16,18,19,22,19,18,19,22.1,19,18,19,20,23]));
 assert.equal(r.events.filter(e=>e.stage==='breakout').length,2);
});
test('failure is distinct from unmet and unavailable; first correction recovery does not force sale',()=>{
 const failed=assessChart(raw(seq([...base,16,15])),{lastBarState:'closed'});assert.ok(failed.current.evidence.some(e=>e.status==='실패'));
 const unmet=assessChart(raw(seq(base)),{lastBarState:'closed'});assert.ok(unmet.current.evidence.some(e=>e.status==='미충족'));
 const unavailable=assessChart(raw(seq([])),{});assert.equal(unavailable.current.title,'판독 정보 부족');assert.equal(unavailable.historyStatus,'unavailable');
});
test('immutable prefix event history including rapid loss and subsequent new structure',()=>{
 const s=seq([...base,16,19,22,20,21,23,25,10,12,14,11,10,12,14,11,10,12,15]);s.candles[18].volumeExpansion='observed';
 const full=analyzeSequence(s).events;
 for(let n=1;n<=s.candles.length;n++)assert.deepEqual(analyzeSequence({...s,candles:s.candles.slice(0,n)}).events,full.filter(e=>e.confirmedAt<n));
});
test('readable sideways candles without a pattern are waiting, not information shortage',()=>{
 const r=assessChart(raw(seq([10,10,10,10,10,10,10])),{lastBarState:'closed'});
 assert.equal(r.current.title,'신규 진입 대기');assert.equal(r.historyStatus,'conditions_not_met');
});
test('a higher nearby historical resistance can coexist with a valid breakout and waiting',()=>{
 const r=raw(seq([...base,16]));
 const old=seq([10,13,17,13,12,13,17.2,13,12,13,15,18]);old.candles.forEach((b,i)=>{b.label='과거 '+i;b.x=i/1000;});
 r.historicalWindows=[{location:'이전 높은 저항',context:'long_range',sequence:old}];
 const a=assessChart(r,{lastBarState:'closed'});assert.equal(a.current.breakout.valid,true);assert.equal(a.current.title,'신규 진입 대기');assert.match(a.current.summary,/과거 저항/);
});
test('months-long resumption context labels only a price-confirmed historical breakout',()=>{
 const r=raw(seq([]));r.historicalWindows=[{location:'이전 조정 구간',context:'multi_month',sequence:seq([...base,16])}];
 const a=assessChart(r,{});assert.equal(a.historical[0].patternKind,'수개월 조정 후 상승 재개');
 r.historicalWindows[0].sequence=seq(base);assert.equal(assessChart(r,{}).historical.length,0);
});
test('model uncertainty about closing cannot mark all historical candles incomplete',()=>{
 const s=seq([...base,16,17]);s.candles.forEach(b=>b.completed=false);
 const r=assessChart(raw(s),{lastBarState:'unknown'});assert.ok(r.historical.some(e=>e.stage==='breakout'));assert.equal(r.diagnostics.policy.normalizedHistorical,12);assert.equal(r.current.signal,'hold');
});
