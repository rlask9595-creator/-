import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeSequence} from '../sequence-policy.mjs';
export const base=[10,12,15,12,11,12,15.2,12,11,12,13];
export function fixture(values=base) { return {scale:'price',quality:'high',limitations:'合成 OHLC',candles:values.map((v,i)=>({label:`봉 ${i+1}`,x:(i+1)/180,high:v+.5,low:v-.5,close:v,completed:true,ma20:null}))}; }
test('wick above resistance is not a closing breakout',()=>{
 const s=fixture([...base,15]); s.candles.at(-1).high=17;
 const r=analyzeSequence(s); assert.equal(r.stage,'wick'); assert.equal(r.signal,'hold');
});
test('closing breakout followed by return to box warns of failure',()=>{
 assert.equal(analyzeSequence(fixture([...base,16])).signal,'buy');
 const r=analyzeSequence(fixture([...base,16,15])); assert.equal(r.stage,'failed'); assert.equal(r.signal,'hold'); assert.equal(r.breakout.valid,false);
});
test('old breakout remains valid while extended new entry waits',()=>{
 const r=analyzeSequence(fixture([...base,16,18,21])); assert.equal(r.breakout.valid,true); assert.equal(r.entry,false); assert.equal(r.signal,'hold');
});
test('first correction and rebound cannot sell; new high cancels failure',()=>{
 const s=fixture([...base,16,19,22,20,18,19,21,24]);
 s.candles.forEach(b=>b.ma20=20.5);
 assert.equal(analyzeSequence({...s,candles:s.candles.slice(0,15)},'holding').stage,'warning');
 const bounce=analyzeSequence({...s,candles:s.candles.slice(0,17)},'holding'); assert.equal(bounce.stage,'rebound'); assert.equal(bounce.signal,'hold');
 const r=analyzeSequence(s,'holding'); assert.equal(r.signal,'hold'); assert.ok(r.events.some(e=>e.stage==='trend' && /해제/.test(e.fact)));
});
test('lower high confirmed on rollover, then correction low breach damages structure',()=>{
 const s=fixture([...base,16,19,22,20,18,19,21,19,17]); s.candles.forEach(b=>b.ma20=20.5);
 const before=analyzeSequence({...s,candles:s.candles.slice(0,-2)},'holding'); assert.equal(before.stage,'rebound');
 const rollover=analyzeSequence({...s,candles:s.candles.slice(0,-1)},'holding'); assert.equal(rollover.stage,'lower');
 assert.equal(rollover.events.at(-1).formedAt,17); assert.equal(rollover.events.at(-1).confirmedAt,18);
 const r=analyzeSequence(s,'holding'); assert.equal(r.stage,'damaged'); assert.equal(r.signal,'sell'); assert.equal(analyzeSequence(s,'none').signal,'hold');
});
test('appending candles never alters earlier events or first confirmation index',()=>{
 const s=fixture([...base,16,19,22,20,18,19,21,19,17,16,18,20,17,16,18,20,17,16,18,21]); s.candles.forEach(b=>b.ma20=20.5);
 const full=analyzeSequence(s).events;
 for(let n=1;n<=s.candles.length;n++) assert.deepEqual(analyzeSequence({...s,candles:s.candles.slice(0,n)}).events,full.filter(e=>e.confirmedAt<n));
});
test('incomplete or low-quality evidence cannot authorize entry',()=>{
 const s=fixture([...base,16]); s.candles.at(-1).completed=false;
 assert.equal(analyzeSequence(s).signal,'hold'); assert.equal(analyzeSequence({...s,quality:'low'}).stage,'unknown');
});
test('loss of rebound support before correction low is a reduction signal',()=>{
 const s=fixture([...base,16,19,22,20,18,19,20,18.8,19.5,20,21,20,19,18]); s.candles.forEach(b=>b.ma20=20.5);
 const r=analyzeSequence(s,'holding'); assert.equal(r.stage,'sell'); assert.equal(r.signal,'sell');
 const d=fixture([...s.candles.map(b=>b.close),17]); d.candles.forEach(b=>b.ma20=20.5);
 assert.equal(analyzeSequence(d,'holding').stage,'damaged');
});
test('a fresh structure after damage is evaluated separately',()=>{
 const s=fixture([...base,16,19,22,20,18,19,21,19,17,12,13,15,13,12,13,15.2,13,12,13,14,16]); s.candles.forEach(b=>b.ma20=20.5);
 const r=analyzeSequence(s); assert.equal(r.stage,'breakout'); assert.equal(r.signal,'buy');
 assert.ok(r.events.some(e=>e.stage==='damaged')); assert.ok(r.events.at(-1).resistance.sources.every(i=>i>19));
});
test('same sequence with price scale unavailable uses relative positions',()=>{
 const r=analyzeSequence({...fixture([...base,16]),scale:'relative'}); assert.match(r.resistance,/가격 아님/); assert.doesNotMatch(r.resistance,/원/);
});
test('historical markers use confirmation coordinates and distinguish extended breakouts',()=>{
 const s=fixture([...base,16]);s.candles.at(-1).x=.75;
 const e=analyzeSequence(s).events.at(-1); assert.equal(e.x,.75);assert.equal(e.entryCandidate,true);
 s.candles.at(-1).close=20;s.candles.at(-1).high=21;
 const extended=analyzeSequence(s).events.at(-1);assert.equal(extended.stage,'breakout');assert.equal(extended.entryCandidate,false);
 s.candles.at(-1).x=9;assert.equal(analyzeSequence(s).events.at(-1).x,null);
});
