import {test} from 'node:test';import assert from 'node:assert/strict';
import {applyPatternPolicy} from '../analysis-policy.mjs';
import {lockJudgment,validateJudgment,evaluateLater} from '../public/review.mjs';
const seq=()=>[10,12,15,12,11,12,15.2,12,11,12,13,16,17].map((v,i)=>({label:`과거 봉 ${i+1}`,date:`2001-01-${String(i+1).padStart(2,'0')}`,x:.1+i*.07,high:v+.5,low:v-.5,close:v,completed:true,ma20:null,volumeExpansion:'unknown'}));
const raw=()=>({symbol:null,timeframe:'일봉',readable:true,evidenceQuality:'medium',signal:'buy',title:'모델 의견',summary:'관찰',trend:'횡보 뒤 상승',pattern:'돌파',volume:'확인 불가',reasons:['관찰'],risks:[],observation:{visiblePeriod:'오래된 구간',endpointDate:'2001-01-13',endpointLabel:'오른쪽 끝 봉',endpointX:.94,endpointEvidence:'차트 맨 오른쪽',priceAxisReadable:true,rightEdgeStructure:'돌파 이후 봉',unreadable:[],priceLabels:[{text:'999',role:'quote_line',location:'가로선',evidence:'봉과 분리된 선'}]},priceSequence:{scale:'price',quality:'high',limitations:'',candles:seq()},chartOverview:[],historicalWindows:[],priceContext:{precision:'unknown',support:'',resistance:'',evidence:''},model:'mock-model',policyVersion:'test-version',analyzedAt:'2026-11-05T00:00:00Z'});
const context={analysisMode:'historical',referenceDate:'2001-01-13',lastBarState:'unknown',position:'none',period:'중기 · 1~3개월',uploadedAt:'2026-11-05T00:00:00Z'};
test('old dates remain valid and upload time differs from chart reference',()=>{
 const r=applyPatternPolicy(raw(),context);assert.equal(r.title,'당시 신규 진입 대기');assert.equal(r.reference.date,'2001-01-13');assert.equal(r.reference.uploadedAt,'2026-11-05T00:00:00Z');assert.equal(r.reference.usedLast,'과거 봉 12');assert.deepEqual(r.reference.excluded,['과거 봉 13']);assert.ok(r.assessment.historical.length);
});
test('unknown symbol and date do not erase readable price structure',()=>{
 const r=raw();r.observation.endpointDate=null;r.priceSequence.candles.forEach(b=>b.date=null);
 applyPatternPolicy(r,{...context,referenceDate:null,lastBarState:'closed'});assert.notEqual(r.title,'판독 정보 부족');assert.match(r.reference.heading,/이미지의 마지막 분석 대상 봉 기준/);
});
test('changing non-candle quote observations leaves price decisions unchanged',()=>{
 const a=raw(),b=raw();b.observation.priceLabels[0].text='111111';
 applyPatternPolicy(a,context);applyPatternPolicy(b,context);assert.equal(a.signal,b.signal);assert.equal(a.title,b.title);assert.deepEqual(a.sequence.events,b.sequence.events);
});
test('wrong middle-chart extraction is explicitly rejected as current evidence',()=>{
 const r=raw();r.priceSequence.candles.forEach((b,i)=>b.x=i*.03);applyPatternPolicy(r,context);
 assert.equal(r.title,'판독 정보 부족');assert.equal(r.assessment.diagnostics.endpointMismatch,true);assert.match(r.summary,/오른쪽 끝/);
});
test('a historical window error never becomes the current shortage explanation',()=>{
 const r=raw();r.priceSequence.candles=[];r.historicalWindows=[{location:'중간 구간',context:'unknown',sequence:{scale:'unreadable',quality:'low',limitations:'과거 가격축 불가',candles:[]}}];
 applyPatternPolicy(r,context);assert.doesNotMatch(r.summary,/중간 구간|과거 가격축/);assert.match(r.assessment.historicalUnavailable[0],/중간 구간/);
});
test('first judgment is frozen, verifiable and never modified by later evaluation',async()=>{
 const first=applyPatternPolicy(raw(),{...context,lastBarState:'closed'});const record=await lockJudgment(first),before=JSON.stringify(record);
 first.title='다른 화면';assert.notEqual(record.payload.title,first.title);assert.equal(await validateJudgment(record),true);
 const later=applyPatternPolicy(raw(),{...context,referenceDate:'2001-02-01',lastBarState:'closed'});
 later.priceSequence.candles=[{date:'2001-01-14',label:'이후 봉 1',close:18},{date:'2001-01-15',label:'이후 봉 2',close:14}];
 const report=await evaluateLater(record,later);assert.equal(JSON.stringify(record),before);assert.equal(report.originalHash,record.sha256);assert.equal(report.rows.length,4);assert.match(report.rows[2].answer,/복귀/);
 const changed=JSON.parse(before);changed.payload.title='변조';assert.equal(await validateJudgment(changed),false);
});
test('missing follow-up dates produce unknown ordering, no invented returns',async()=>{
 const record=await lockJudgment(applyPatternPolicy(raw(),context));const later=applyPatternPolicy(raw(),context);later.priceSequence.candles.forEach(b=>b.date=null);
 const r=await evaluateLater(record,later);assert.equal(r.observations,0);assert.ok(r.missing.length);assert.equal(r.returnPercentage,undefined);
});
