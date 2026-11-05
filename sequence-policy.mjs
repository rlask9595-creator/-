// All decisions use only the prefix ending at the confirming completed candle.
export const SEQUENCE_INSTRUCTIONS = `
[최우선: 가격 순서 판독]
기존 봉패턴·지표 의견보다 가격 순서가 우선이다. 이동평균과 거래량은 보조이며 5일선 이탈/첫 음봉/RSI만으로 매도하지 않는다.
priceSequence에 화면 왼쪽부터 오른쪽까지 연속된 봉을 빠짐없이 추출한다(최대 180개). 임의로 주요 봉만 골라서는 안 된다. 밀집하여 개별 봉을 읽지 못하면 scale=unreadable, candles=[]로 반환하고 확대 요청한다.
각 봉의 high,low,close는 축이 읽히면 대략적인 가격, 읽히지 않으면 동일한 상대 좌표(위로 갈수록 큰 값)를 쓴다. scale=price/relative/unreadable. 임의 날짜/정확한 가격 금지. label은 읽히는 날짜 또는 '왼쪽부터 N번째 봉'. completed는 마감 확인 시에만 true; 오른쪽 끝 마감이 불확실하면 false. ma20은 명시된 20일선만 같은 좌표로 추출하고 없으면 null.
커서 선택값, 평균 매입가, 수평 안내선, 화면 상단 OHLC를 최신 봉 값 또는 지지저항으로 사용하지 않는다. 누락·판독 불확실 또는 봉 색상·몸통의 어느 쪽이 종가인지 알 수 없으면 limitations에 적고 quality=low로 한다. 최종 판정은 서버가 추출 봉의 순서로 계산한다. 미래 봉으로 이전 신호를 앞당기지 않는다. 거래량과 이동평균 설명에 단독 매매 권고를 넣지 않는다.
`;
const candleProperties = {label:{type:'string'},high:{type:'number'},low:{type:'number'},close:{type:'number'},completed:{type:'boolean'},ma20:{type:['number','null']}};
export const sequenceSchema = {type:'object',additionalProperties:false,properties:{scale:{type:'string',enum:['price','relative','unreadable']},quality:{type:'string',enum:['high','medium','low']},limitations:{type:'string'},candles:{type:'array',maxItems:180,items:{type:'object',additionalProperties:false,properties:candleProperties,required:Object.keys(candleProperties)}}},required:['scale','quality','limitations','candles']};
export const stages = {unknown:'판독 보류',pullback:'눌림 관찰',wick:'돌파 미확인',breakout:'돌파 매수 후보',maintained:'돌파 유지',failed:'돌파 실패 경고',trend:'추세 유지',warning:'첫 경고',rebound:'반등 시도',lower:'낮은 고점 확인',sell:'비중 축소·매도 검토',damaged:'중기 상승 구조 훼손'};
export function analyzeSequence(sequence, position='none') {
  const bars=sequence?.candles || [], events=[], highs=[], lows=[];
  let stage='unknown', zone=null, breakout=null, warning=null, peak=null, cycle=0, last=null;
  const usable=sequence && sequence.scale!=='unreadable' && sequence.quality!=='low';
  const location=i=>i==null?'확인 불가':`${bars[i].label} (왼쪽부터 ${i+1}번째 봉)`;
  const level=v=>v==null?'확인 불가':sequence.scale==='price'?`약 ${Number(v.toPrecision(4)).toLocaleString('ko-KR')}`:`상대 높이 ${v.toFixed(1)} (가격 아님)`;
  function emit(next,i,formation=i,fact='') { if(stage!==next) { stage=next; events.push({stage:next,label:stages[next],formedAt:formation,confirmedAt:i,formation:location(formation),confirmation:location(i),fact,resistance:zone?{low:zone.low,high:zone.high,sources:zone.points.map(p=>p.i)}:null}); } }
  if(usable) for(let i=0;i<bars.length;i++) {
    const b=bars[i], prev=bars[i-1];
    if(!b.completed || ![b.high,b.low,b.close].every(Number.isFinite) || b.low>b.close || b.close>b.high) break;
    last=i;
    // Two right-hand bars confirm a swing; its location is never its confirmation time.
    if(i>=4) {
      const p=i-2, window=bars.slice(i-4,i+1);
      if(p>=cycle && window.every((x,j)=>j===2 || x.high<bars[p].high)) highs.push({i:p,v:bars[p].high});
      if(p>=cycle && window.every((x,j)=>j===2 || x.low>bars[p].low)) lows.push({i:p,v:bars[p].low});
    }
    const ranges=bars.slice(Math.max(cycle,i-19),i+1).map(x=>x.high-x.low).sort((a,b)=>a-b);
    const range=Math.max(ranges[Math.floor(ranges.length/2)]||0,Math.abs(b.close)*0.001,0.0001);
    const hs=highs.filter(x=>x.i>=cycle), ls=lows.filter(x=>x.i>=cycle);
    const support=ls.at(-1);
    const rising=hs.length>=2 && ls.length>=2 && hs.at(-1).v>hs.at(-2).v && ls.at(-1).v>ls.at(-2).v;
    if(!breakout && hs.length>=2) {
      const h=hs.at(-1), matches=hs.filter(x=>Math.abs(x.v-h.v)<=range*0.75 && h.i-x.i>=3);
      if(matches.length) { const points=[...matches,h]; zone={low:Math.min(...points.map(x=>x.v)),high:Math.max(...points.map(x=>x.v)),points}; }
    }
    if(!peak || b.high>peak.v) peak={i,v:b.high};
    if(warning) {
      if(b.close>warning.peak.v) { warning=null; emit('trend',i,i,'이전 고점 종가 회복으로 반등 실패 시나리오 해제'); }
      else {
        if(!warning.bounce) {
          if(b.low<warning.low.v) warning.low={i,v:b.low};
          if(i>warning.at && b.close>prev.high) { warning.bounce={i,v:b.high}; warning.base=warning.low.v; emit('rebound',i,i,'첫 하락 뒤 직전 봉 고가를 종가로 회복; 낮은 고점은 아직 미확정'); }
        } else {
          if(b.high>warning.bounce.v) { warning.bounce={i,v:b.high}; warning.lower=false; emit('rebound',i,i,'반등 고점 갱신; 꺾임 재확인 전까지 반등 시도'); }
          if(!warning.lower && i>warning.bounce.i && b.close<prev.low) { warning.lower=true; emit('lower',i,warning.bounce.i,'반등이 직전 봉 저가 아래 종가로 꺾임'); }
          if(warning.lower) {
            if(b.close<warning.low.v) {
              emit('damaged',i,warning.bounce.i,`낮은 고점 확인 뒤 이전 조정 저점 ${level(warning.low.v)} 종가 이탈`);
              cycle=i; zone=null; breakout=null; peak={i,v:b.high}; warning=null;
            } else if(b.close<warning.base) emit('sell',i,warning.bounce.i,`낮은 고점 뒤 반등 지지 ${level(warning.base)} 종가 이탈`);
            else if(stage!=='sell') emit('lower',i,warning.bounce.i,'낮은 고점 확인; 반등 지지 종가 이탈 대기');
          }
          const bounceLow=ls.filter(x=>x.i>warning?.low.i && x.i<warning?.bounce.i).at(-1);
          if(warning && bounceLow) warning.base=Math.max(warning.base,bounceLow.v);
        }
        continue;
      }
    }
    if(breakout && b.close<=zone.high) { breakout.valid=false; emit('failed',i,i,'돌파 후 종가가 저항 구간 안 또는 아래로 복귀'); }
    const steep=peak && peak.v-Math.min(...bars.slice(Math.max(cycle,i-20),i+1).map(x=>x.low))>=4*range;
    const lostSupport=support && b.close<support.v && prev?.close>=support.v;
    const lostMA=b.ma20!=null && prev?.ma20!=null && b.close<b.ma20 && prev.close>=prev.ma20;
    if(steep && (lostSupport || lostMA) && i>peak.i) {
      warning={at:i,peak:{...peak},low:{i,v:b.low},reclaim:lostSupport?support.v:b.ma20};
      emit('warning',i,peak.i,`${lostSupport?'주요 지지':'20일선'} 이탈. ${level(warning.reclaim)} 회복 관찰; 첫 하락만으로 매도하지 않음`); continue;
    }
    if(zone && !breakout && b.close>zone.high) {
      const adjusted=bars.slice(zone.points.at(-1).i+1,i).some(x=>x.close<zone.low-range);
      if(adjusted) { breakout={at:i,valid:true,range}; emit('breakout',i,i,'반복 저항 형성 후 조정·회복, 완성봉 종가가 구간 상단 돌파'); }
    } else if(breakout?.valid && i>breakout.at && b.close>zone.high) emit('maintained',i,breakout.at,'후속 완성봉 종가가 기존 저항 위 유지');
    else if(!breakout && zone && b.high>zone.high && b.close<=zone.high) emit('wick',i,i,'윗꼬리만 저항 상단 통과; 종가 돌파 미확인');
    else if(rising && !breakout) emit('trend',i,hs.at(-1).i,'확인된 고점·저점 상승 구조');
    else if(!breakout && peak.i<i && b.close<peak.v && stage!=='damaged') emit('pullback',i,i,support && b.low<=support.v?'지지 접촉 관찰; 저점 방어와 단기 고점 회복을 별도 확인':'상승 고점 이후 조정; 저점 방어·단기 고점 회복 미확인');
  }
  const b=last==null?null:bars[last], incomplete=last!==bars.length-1;
  const entry=!!(breakout?.valid && b && b.close>zone.high && b.close-zone.high<=2*breakout.range && ['breakout','maintained'].includes(stage) && !incomplete);
  const signal=position==='holding'?(['sell','damaged'].includes(stage)?'sell':'hold'):(entry?'buy':'hold');
  const defended=lows.filter(x=>x.i>=cycle).at(-1);
  const shortHigh=highs.filter(x=>x.i>=cycle).at(-1);
  const defense=defended && last!=null && bars.slice(defended.i+1,last+1).every(x=>x.low>=defended.v);
  const recovery=shortHigh && b && b.close>shortHigh.v;
  const event=events.at(-1), perspective=position==='holding'?'보유자':'미보유자';
  const pattern=warning?'상승 후 조정·반등':breakout?'저항 돌파 구조':zone?'반복 저항·조정':'고점·저점 구조';
  const next=warning?`반등 진행 여부와 지지 ${level(warning.base??warning.low.v)} 종가 이탈 확인. 경고 해소: ${level(warning.reclaim)} 회복, 실패 시나리오 해제: 이전 고점 ${level(warning.peak.v)} 종가 회복.`:zone?`${level(zone.high)} 위 완성봉 종가와 이후 유지·되돌림 지지 확인`:'확인 가능한 연속 봉에서 반복 고점·조정 저점과 회복을 관찰';
  const invalidation=warning?`이전 고점 ${level(warning.peak.v)} 종가 회복 시 실패 시나리오 해제`:zone?`돌파 후 ${level(zone.high)} 아래 종가 복귀 시 돌파 판단 무효`:'새로운 고점·저점 구조가 확인되면 재평가';
  return {stage,signal,events,entry,breakout:breakout?{...breakout,confirmation:location(breakout.at)}:null,
    title:`${pattern} / ${stages[stage]} / ${perspective}`,
    summary:`${position==='holding'?(stage==='unknown'?'판단 보류':signal==='sell'?'비중 축소·매도 검토':'보유 유지·경고 관찰'):(entry?'신규 진입 후보':'신규 진입 대기')}. 기존 돌파: ${breakout?.valid?'유효':'미확인 또는 실패'} / 현재 신규 진입: ${entry?'후보':'대기'}. ${incomplete?'마지막 봉 미완성 또는 판독 단절로 신규 신호 보류.':''}`,
    pattern, nextStep:next,invalidation,
    support:lows.filter(x=>x.i>=cycle).length?level(lows.filter(x=>x.i>=cycle).at(-1).v):null,resistance:zone?`${level(zone.low)} ~ ${level(zone.high)}`:null,
    reasons:[`① 앞서 형성된 지지·저항: ${zone?zone.points.map(x=>location(x.i)).join(', ')+`의 반복 고점 ${level(zone.low)} ~ ${level(zone.high)}`:'반복 저항 미확인'}`,
    `② 판단을 바꾼 봉: 형성 ${event?.formation||'미확인'} / 최초 확인 ${event?.confirmation||'미확인'}. ${event?.fact||'충분한 순서 근거 없음'}`,
    `③ 지금 확인된 사실: ${stages[stage]}. 저점 방어: ${defense?"확인된 조정 저점 이후 유지":"미확인"}; 단기 고점 종가 회복: ${recovery?"확인":"미확인"}. ${breakout?`돌파 최초 확인 ${location(breakout.at)}; 현재 신규 진입과 별도 평가.`:''} ${sequence?.limitations||''}`,
    `④ 다음에 확인할 조건: ${next}`,`⑤ 판단 무효 조건: ${invalidation}`]};
}
