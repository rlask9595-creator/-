const isDate=v=>typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v;
const freeze=value=>{if(value && typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;};
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(v=>v.toString(16).padStart(2,'0')).join('');
export async function lockJudgment(result) {
 if(result.reference?.mode!=='historical') throw new Error('과거 시점 검증 결과를 먼저 생성해 주세요.');
 const payload=structuredClone(Object.fromEntries(['symbol','timeframe','title','signal','summary','nextStep','invalidation','reference','policyVersion','model','analyzedAt','transport','priceSequence','assessment'].filter(k=>result[k]!==undefined).map(k=>[k,result[k]])));
 return freeze({format:'chart-signal-judgment-v1',lockedAt:new Date().toISOString(),sha256:await digest(payload),payload});
}
export async function validateJudgment(record) {return !!record && record.format==='chart-signal-judgment-v1' && typeof record.sha256==='string' && await digest(record.payload)===record.sha256;}
export async function evaluateLater(record,later) {
 if(!await validateJudgment(record)) throw new Error('최초 판단 파일의 무결성을 확인할 수 없습니다.');
 const first=record.payload, date=first.reference?.date;
 const missing=[];
 if(first.symbol && later.symbol && first.symbol!==later.symbol) throw new Error('종목명이 다릅니다. 같은 종목의 이후 차트를 사용해 주세요.');
 if(!first.symbol || !later.symbol) missing.push('같은 종목인지 자동 확인 불가');
 if(!date) missing.push('최초 기준일 미확인: 이후 봉의 시간 순서 확인 불가');
 const all=later.priceSequence?.candles||[];
 const after=all.filter((b,i)=>isDate(b.date) && isDate(date) && (b.date>date || (b.date===date && first.reference.excluded?.length)) && (i<all.length-1 || later.assessment?.current.context.lastBarState==='closed') && Number.isFinite(b.close));
 const zone=first.assessment?.current.breakout ? first.assessment?.current.events.findLast(e=>e.resistance)?.resistance : first.assessment?.historical?.findLast(e=>e.resistance)?.resistance;
 const scaleKnown=first.priceSequence?.scale==='price' && later.priceSequence?.scale==='price';
 if(!after.length) missing.push('기준일 이후 날짜와 종가를 함께 읽을 수 있는 봉 없음');
 if(!scaleKnown) missing.push('서로 비교할 수 있는 가격축 수치 부족');
 const simple=['wick','pullback','unknown'].includes(first.assessment?.current.stage);
 const chronological=after.every((b,i)=>i===0 || b.date>after[i-1].date);
 if(!chronological)missing.push('날짜 중복 또는 역순으로 사건의 선후 확인 불가');
 const crossings=chronological && scaleKnown && zone && date?after.map(b=>({date:b.date,label:b.label,above:b.close>zone.high,below:b.close<zone.low})):[];
 const entry=crossings.find(b=>b.above), invalid=crossings.find(b=>b.below);
 const order=entry && invalid?(entry.date===invalid.date?'같은 날짜여서 선후 확인 불가':entry.date<invalid.date?'가격 상단 돌파 후 하단 이탈':'가격 하단 이탈이 먼저 발생'):invalid?'관찰된 범위에서는 하단 이탈만 확인':entry?'관찰된 범위에서는 상단 돌파만 확인':'확인 불가';
 const additional=(later.assessment?.historical||[]).filter(e=>isDate(e.confirmedDate)&&date&&e.confirmedDate>date&&['failed','sharp','damaged'].includes(e.stage)).map(e=>e.confirmedDate+' '+e.label);
 const failure=entry && crossings.find(b=>b.date>entry.date && b.below);
 return {originalHash:record.sha256,originalTitle:first.title,originalConditions:first.nextStep,originalInvalidation:first.invalidation,originalVersion:first.policyVersion,originalModel:first.model,laterVersion:later.policyVersion,laterModel:later.model,evaluatedAt:new Date().toISOString(),observations:after.length,
 rows:[{question:'당시 진입 조건이 이후 충족됐는가?',answer:entry?`${entry.label}: 당시 저항 상단의 종가 돌파 관찰. ${simple?'가격 조건 확인이며 추가 유지 조건은 별도 확인 필요':'눌림·회복 등 복합 조건의 전체 충족은 확인 불가'}`:'확인 불가 또는 관찰 범위 내 상단 돌파 미검출'},
 {question:'무효화 조건이 먼저 발생했는가?',answer:order+' (가격 구간 조건만 비교; 원래 무효화 문장 전체의 자동 검증은 아님)'},
 {question:'돌파 이후 유지됐는가, 실패했는가?',answer:failure?`${failure.label}: 저항 구간 하단 아래 종가 복귀 관찰`:entry?'관찰된 이후 봉에서 하단 복귀 미검출; 미래 유지 보장은 아님':'돌파 이후의 확인 가능한 봉 부족'},
 {question:'예측하지 못한 움직임은 무엇인가?',answer:additional.length?'이후 추가 관찰: '+additional.join(', ')+'. 원래 조건에 포함됐는지는 고정된 판단과 비교하세요.':'날짜가 확인된 추가 실패·급락 신호를 찾지 못했습니다. 예상 밖 움직임이 없었다는 뜻은 아닙니다. 이미지 자료만으로 정확한 수익률·적중률을 산출하지 않습니다.'}],missing,note:'사후 평가만 추가합니다. 최초 판단은 수정하지 않습니다. 관찰된 날짜의 일부 봉만 읽혔다면 사건의 실제 최초 발생과 선후는 확정할 수 없습니다.'};
}
