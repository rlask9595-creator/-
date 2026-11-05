import { analyzeSequence, sequenceSchema, stages } from './sequence-policy.mjs';
const str={type:'string'};
const choice=values=>({type:'string',enum:values});
const object=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
export const overviewSchema={type:'array',maxItems:12,items:object({location:str,regime:choice(['range','up','pullback','down','unknown']),evidence:str})};
export const windowsSchema={type:'array',maxItems:6,items:object({location:str,context:choice(['long_range','pause','multi_month','retest','decline','unknown']),sequence:{...sequenceSchema,properties:{...sequenceSchema.properties,candles:{...sequenceSchema.properties.candles,maxItems:180}}}})};
export const priceContextSchema=object({precision:choice(['exact','approximate','relative','unknown']),support:str,resistance:str,evidence:str});
const historicalStages=['breakout','retest','failed','warning','sell','damaged','sharp'];
export function assessChart(raw, context={}) {
  const source=raw.priceSequence;
  const lastBarState=context.lastBarState || 'unknown';
  const currentSource=source?structuredClone(source):null;
  const normalizedHistorical=(currentSource?.candles.slice(0,-1)||[]).filter(b=>!b.completed).length;
  if(currentSource?.candles.length) {
    currentSource.candles.slice(0,-1).forEach(b=>b.completed=true);
    currentSource.candles.at(-1).completed=lastBarState==='closed';
  }
  const current=analyzeSequence(raw.readable?currentSource:null,context.position);
  const historical=[];
  const unavailable=[];
  const addEvents=(r,location,kind='unknown')=>{
    for(const event of r.events.filter(e=>historicalStages.includes(e.stage))) {
      const candidate={...event,window:location,source:'extracted_candles',status:event.stage==='failed'?'failed':'confirmed'};
      if(event.stage==='breakout') candidate.patternKind=({long_range:'장기 횡보 최초 돌파',pause:'상승 중 짧은 횡보 재돌파',multi_month:'수개월 조정 후 상승 재개'})[kind] || event.patternKind;
      const duplicate=historical.find(e=>e.stage===candidate.stage && e.x!=null && candidate.x!=null && Math.abs(e.x-candidate.x)<.001 && e.confirmation.split(' (')[0]===candidate.confirmation.split(' (')[0]);
      if(!duplicate) historical.push(candidate);
    }
  };
  addEvents(current,'현재 구간');
  for(const window of raw.historicalWindows||[]) {
    // Historical windows contain only old bars; never override their actual readability.
    // If they overlap the current endpoint, the user-supplied closing status applies there too.
    const s=structuredClone(window.sequence), endpoint=source?.candles.at(-1);
    for(const b of s.candles) b.completed=endpoint && ((b.x!=null && b.x===endpoint.x) || b.label===endpoint.label)?lastBarState==='closed':true;
    const result=analyzeSequence(s,context.position);
    addEvents(result,window.location,window.context);
    if(result.stage==='unknown') unavailable.push(`${window.location}: ${s.limitations || '연속 봉 판독 근거 부족'}`);
  }
  historical.sort((a,b)=>(a.x??1)-(b.x??1));
  const sufficient=current.usableBars>=5 && source?.quality!=='low' && source?.scale!=='unreadable';
  const finalBars=currentSource?.candles.filter(b=>b.completed && Number.isFinite(b.close))||[];
  const last=finalBars.at(-1);
  const widths=finalBars.slice(-20).map(b=>b.high-b.low).sort((a,b)=>a-b);
  const width=widths[Math.floor(widths.length/2)]||0;
  const overhead=(raw.historicalWindows||[]).filter(w=>w.sequence.scale==='price').flatMap(w=>analyzeSequence(w.sequence).events).map(e=>e.resistance?.high).filter(v=>source?.scale==='price' && last && Number.isFinite(v) && v>last.close && v-last.close<=2*width).sort((a,b)=>a-b)[0];
  if(overhead!=null && context.position!=='holding') {current.entry=false;current.signal='hold';}

  if(!raw.readable) unavailable.push('차트 이미지 판독 불가');
  if(!source?.candles.length) unavailable.push('최근 구간의 연속 봉이 추출되지 않음');
  if(source?.quality==='low') unavailable.push(`최근 구간 봉 판독 품질 부족: ${source.limitations || '개별 봉의 고가·저가·종가 확인 필요'}`);
  if(source?.scale==='relative') unavailable.push('가격축 확인 불가: 가격 대신 직전 고점·저점 위치 사용');
  if(source?.limitations) unavailable.push(source.limitations);
  if(current.gaps.length) unavailable.push(...current.gaps.map(g=>`최근 구간 ${g.index+1}번째 봉: ${g.reason}`));
  if(lastBarState!=='closed') unavailable.push(lastBarState==='open'?'사용자 선택: 마지막 봉 진행 중. 이전 완성봉 기준 분석':'마지막 봉 상태 모름: 마지막 봉을 제외하고 분석');
  const signal=sufficient?current.signal:'hold';
  const title=!sufficient?'분석 정보 부족':context.position==='holding'?(signal==='sell'?'비중 축소 검토':'보유 유지'):signal==='buy'?'조건부 진입 검토':'신규 진입 대기';
  const event=current.events.at(-1);
  let summary=!sufficient?`현재 판단에 필요한 연속 봉이 부족합니다. ${unavailable[0]||'최근 고점·저점이 보이도록 확대해 주세요.'}`:event?.fact || '최근 완성봉에서 진입을 확인할 종가 돌파가 아직 나타나지 않았습니다.';
  if(sufficient && overhead==null && current.breakout?.valid && !current.entry && ['breakout','maintained','retest'].includes(current.stage)) summary=lastBarState!=='closed'?`저항 ${current.resistance} 종가 돌파는 확인됐지만 마지막 봉의 마감이 확인되지 않아 신규 진입은 기다립니다.`:`돌파 흐름은 유지되지만 가격이 돌파 구간 ${current.resistance}에서 멀어져 신규 진입은 기다립니다.`;
  if(overhead!=null) summary+=` 위쪽의 과거 저항 약 ${Number(overhead.toPrecision(4)).toLocaleString('ko-KR')} 부근이 가까워 추가 종가 돌파를 기다립니다.`;

  if(sufficient && lastBarState!=='closed' && !current.breakout?.valid) summary+=' 마지막 봉을 제외한 판단입니다.';
  const breakoutStatus=current.breakout?(current.breakout.valid?'확인':'실패'):sufficient?'미충족':'확인 불가';
  const evidence=[
    {status:sufficient?'확인':'확인 불가',text:sufficient?(event?.fact||`최근 완성봉 ${current.usableBars}개 판독; 진입을 확인할 종가 돌파는 아직 미충족`):'최근 구간의 연속 봉 판독 근거가 부족함'},
    {status:breakoutStatus,text:current.breakout?(current.breakout.valid?`저항 종가 돌파 확인: ${current.breakout.confirmation}`:'돌파 뒤 종가가 기존 저항 안으로 복귀'):sufficient?'현재 구간에서 반복 저항의 종가 돌파 조건 미충족':'저항 종가 돌파 판단에 필요한 봉 근거 부족'},
    {status:lastBarState==='closed'?'확인':'관찰 중',text:lastBarState==='closed'?'마지막 봉 마감 완료 — 사용자 제공 정보':lastBarState==='open'?'마지막 봉 진행 중 — 사용자 제공 정보':'마지막 봉 마감 상태 모름 — 해당 봉 제외'}
  ];
  const rawObservation={signal:raw.signal,title:raw.title,summary:raw.summary,trend:raw.trend,pattern:raw.pattern,support:raw.support,resistance:raw.resistance,reasons:raw.reasons,quality:raw.evidenceQuality,sequenceQuality:source?.quality,extractedBars:source?.candles.length||0,unclosedBars:source?.candles.filter(b=>!b.completed).length||0,windows:(raw.historicalWindows||[]).map(w=>({location:w.location,quality:w.sequence.quality,bars:w.sequence.candles.length}))};
  const observed=raw.priceContext;
  const levels={precision:source?.scale==='price'?'approximate':source?.scale==='relative'?'relative':'unknown',support:current.support,resistance:current.resistance,source:'봉 순서에서 확인'};
  if(!levels.support && observed?.support && observed.precision!=='unknown') levels.support=`${observed.support} (이미지 관찰·순서 미검증)`;
  if(!levels.resistance && observed?.resistance && observed.precision!=='unknown') levels.resistance=`${observed.resistance} (이미지 관찰·순서 미검증)`;
  if(levels.precision==='unknown' && observed) levels.precision=observed.precision;
  const overview=(raw.chartOverview||[]);
  return {current:{...current,signal,title,summary,evidence,context:{period:context.period,position:context.position||'none',lastBarState,lastBarSource:lastBarState==='unknown'?'unknown':'user'},nextStep:sufficient?(overhead!=null?`위쪽 저항 약 ${Number(overhead.toPrecision(4)).toLocaleString('ko-KR')}를 종가로 넘고 유지하는지 확인하세요.`:current.breakout?.valid && !current.entry && ['breakout','maintained','retest'].includes(current.stage)?`돌파 구간 ${current.resistance} 위에서 종가 지지를 유지하는지, 눌림 뒤 단기 고점을 다시 회복하는지 확인하세요.${lastBarState!=='closed'?' 마지막 봉의 마감 상태도 확인해 주세요.':''}`:current.nextStep):'최근 고점·저점과 가격축이 보이는 구간을 확대해 다시 분석하세요. 확인된 과거 후보는 아래에 별도로 남겨두었습니다.'},historical,unavailable:[...new Set(unavailable)],overview,levels,
    historyStatus:historical.length?'confirmed':(raw.historicalWindows||[]).some(w=>w.sequence.quality!=='low'&&w.sequence.candles.length>=5)||current.usableBars>=5?'conditions_not_met':'unavailable',
    diagnostics:{schema:'valid',provider:rawObservation,policy:{signal,title,stage:current.stage,usableBars:current.usableBars,excluded:current.gaps,historicalCount:historical.length,lastBarState,normalizedHistorical},display:{title,summary,evidence},note:'요청별 메모리 내 비교. 이미지·API 키 미포함. 원문 응답·사용자 이미지·API 키를 로그나 파일에 저장하지 않음.'}};
}
