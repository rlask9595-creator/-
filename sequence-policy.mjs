// All decisions use only the prefix ending at the confirming completed candle.
export const SEQUENCE_INSTRUCTIONS = `
[최우선: 가격 순서 판독]
기존 봉패턴·지표 의견보다 가격 순서가 우선이다. 이동평균과 거래량은 보조이며 5일선 이탈/첫 음봉/RSI만으로 매도하지 않는다.
먼저 chartOverview에 전체 차트를 횡보·상승·조정·하락 구간으로 나누고 각 구간의 위치와 눈으로 관찰한 근거를 적는다. 현재 priceSequence는 오른쪽 끝을 포함하는 최근 연속 봉 최대 80개를 추출한다. 긴 차트 전체를 180개로 축약하거나 모든 봉 추출 불가라는 이유로 전체를 버리지 않는다. historicalWindows에는 관찰된 전환 구간의 선행 저항·조정부터 후속 확인까지 연속된 봉 구간을 최대 6개, 구간당 최대 180개 추출한다. 구간 내부의 봉을 임의로 생략하거나 일정 간격으로 샘플링하지 않는다. 총 추출 봉은 가급적 300개 이하. 국소 판독이 불가능한 구간만 low/unreadable로 처리한다. 역사 구간 선택은 미래 상승폭이 아닌 그 구간의 반복 고점·저점과 종가 확인에 근거한다. 같은 원본 봉은 동일한 label과 x로 표시한다.
과거 봉은 마감된 자료로 처리한다. 마지막 봉 상태는 사용자 선택을 따르며 모름이면 마지막 봉만 제외한다. 과거 봉까지 마감 불명확으로 처리하지 않는다. 과거 신호에는 전체기간 매물대/미래 가격 표시/평균 매입가/커서 OHLC를 근거로 쓰지 않는다.
각 봉의 x는 전체 원본 이미지 폭에서 봉 중심의 가로 위치를 0~1로 표현한다. 읽히지 않으면 null이며 균등 간격으로 만들어내지 않는다.
각 봉의 high,low,close는 축이 읽히면 대략적인 가격, 읽히지 않으면 동일한 상대 좌표(위로 갈수록 큰 값)를 쓴다. scale=price/relative/unreadable. 임의 날짜/정확한 가격 금지. label은 읽히는 날짜 또는 '왼쪽부터 N번째 봉'. completed는 마감 확인 시에만 true; 오른쪽 끝 마감이 불확실하면 false. ma20은 명시된 20일선만 같은 좌표로 추출하고 없으면 null.
커서 선택값, 평균 매입가, 수평 안내선, 화면 상단 OHLC를 최신 봉 값 또는 지지저항으로 사용하지 않는다. 해당 국소 구간의 봉 모양까지 읽을 수 없을 때만 quality=low로 한다. 가격축 미확인은 relative로 처리하며 마지막 봉 불확실 때문에 이전 구간의 quality를 낮추지 않는다. limitations에는 실제 부족 항목을 적는다. 최종 판정은 서버가 추출 봉의 순서로 계산한다. 미래 봉으로 이전 신호를 앞당기지 않는다. 거래량과 이동평균 설명에 단독 매매 권고를 넣지 않는다.
`;
const candleProperties = {label:{type:'string'},x:{type:['number','null']},high:{type:['number','null']},low:{type:['number','null']},close:{type:['number','null']},completed:{type:'boolean'},ma20:{type:['number','null']},volumeExpansion:{type:'string',enum:['observed','not_observed','unknown']}};
export const sequenceSchema = {type:'object',additionalProperties:false,properties:{scale:{type:'string',enum:['price','relative','unreadable']},quality:{type:'string',enum:['high','medium','low']},limitations:{type:'string'},candles:{type:'array',maxItems:180,items:{type:'object',additionalProperties:false,properties:candleProperties,required:Object.keys(candleProperties)}}},required:['scale','quality','limitations','candles']};
export const stages = {unknown:'판독 보류',pullback:'눌림 관찰',wick:'돌파 미확인',breakout:'돌파 매수 후보',maintained:'돌파 유지',failed:'돌파 실패 경고',trend:'추세 유지',warning:'첫 경고',rebound:'반등 시도',lower:'낮은 고점 확인',sell:'비중 축소·매도 검토',damaged:'중기 상승 구조 훼손',sharp:'급격한 추세 훼손',retest:'눌림 지지 후 회복'};
export function analyzeSequence(sequence, position='none') {
  const bars=sequence?.candles || [], events=[], highs=[], lows=[];
  let stage='unknown', zone=null, breakout=null, warning=null, peak=null, cycle=0, last=null, touched=null;
  const gaps=[];
  const usable=sequence && sequence.scale!=='unreadable' && sequence.quality!=='low';
  const location=i=>i==null?'확인 불가':`${bars[i].label} (추출 구간 내 ${i+1}번째 봉)`;
  const level=v=>v==null?'확인 불가':sequence.scale==='price'?`약 ${Number(v.toPrecision(4)).toLocaleString('ko-KR')}`:'해당 봉의 고점·저점 구간 (가격축 확인 불가)';
  function emit(next,i,formation=i,fact='') { if(stage!==next) { stage=next; events.push({stage:next,label:stages[next],formedAt:formation,confirmedAt:i,formation:location(formation),confirmation:location(i),x:Number.isFinite(bars[i].x)&&bars[i].x>=0&&bars[i].x<=1?bars[i].x:null,entryCandidate:next==='breakout' && breakout && bars[i].close-zone.high<=2*breakout.range,fact,invalidation:['sell','damaged','sharp','warning','failed'].includes(next)?`이탈한 구간 ${level(warning?.reclaim??zone?.high??bars[formation].low)} 종가 회복 및 이전 고점 회복 시 하락 시나리오 재검토`:zone?`${level(zone.high)} 종가 재이탈 시 돌파 판단 재검토`:'이탈한 주요 지지와 이전 고점 회복 시 하락 판단 재검토',patternKind:next==='breakout'?(zone.points.at(-1).i-zone.points[0].i>=40?'장기 횡보 돌파':events.some(e=>['breakout','retest'].includes(e.stage))?'상승 중 재돌파':'반복 저항 최초 돌파'):stages[next],resistance:zone?{low:zone.low,high:zone.high,sources:zone.points.map(p=>p.i)}:null}); } }
  if(usable) for(let i=0;i<bars.length;i++) {
    const b=bars[i], prev=bars[i-1];
    if(!b.completed || ![b.high,b.low,b.close].every(Number.isFinite) || b.low>b.close || b.close>b.high) {
      gaps.push({index:i,reason:!b.completed?'마감 미확인':'봉 수치 판독 불가'});
      if(i===bars.length-1) break;
      cycle=i+1; zone=null; breakout=null; warning=null; peak=null; touched=null;stage='unknown';last=null;continue;
    }
    last=i;
    // Two right-hand bars confirm a swing; its location is never its confirmation time.
    if(i-cycle>=4) {
      const p=i-2, window=bars.slice(i-4,i+1);
      if(p>=cycle && window.every((x,j)=>j===2 || x.high<bars[p].high)) highs.push({i:p,v:bars[p].high});
      if(p>=cycle && window.every((x,j)=>j===2 || x.low>bars[p].low)) lows.push({i:p,v:bars[p].low});
    }
    const ranges=bars.slice(Math.max(cycle,i-19),i+1).map(x=>x.high-x.low).sort((a,b)=>a-b);
    const range=Math.max(ranges[Math.floor(ranges.length/2)]||0,Math.abs(b.close)*0.001,0.0001);
    const hs=highs.filter(x=>x.i>=cycle), ls=lows.filter(x=>x.i>=cycle);
    const support=ls.at(-1);
    const rising=hs.length>=2 && ls.length>=2 && hs.at(-1).v>hs.at(-2).v && ls.at(-1).v>ls.at(-2).v;
    if(hs.length>=2) {
      const h=hs.at(-1), matches=hs.filter(x=>Math.abs(x.v-h.v)<=range*0.75 && h.i-x.i>=3);
      if(matches.length && (!breakout || matches.every(x=>x.i>breakout.at+2))) { const points=[...matches,h]; breakout=null; touched=null;zone={low:Math.min(...points.map(x=>x.v)),high:Math.max(...points.map(x=>x.v)),points}; }
    }
    if(!peak || b.high>peak.v) peak={i,v:b.high};
    const previousRanges=bars.slice(Math.max(cycle,i-20),i).map(x=>x.high-x.low).sort((a,b)=>a-b);
    const typical=previousRanges[Math.floor(previousRanges.length/2)]||range;
    if(support && prev && prev.close>=support.v && b.close<support.v && prev.close-b.close>=2*typical && b.volumeExpansion==='observed') {
      emit('sharp',i,support.i,`주요 지지 ${level(support.v)} 종가 이탈, 최근 봉폭 대비 큰 하락과 거래량 증가 관찰 (이미지 근사)`);
      cycle=i; zone=null; breakout=null; warning=null; touched=null; peak={i,v:b.high};continue;
    }
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
    if(breakout?.valid && b.close<=zone.high) { breakout.valid=false; emit('failed',i,i,'돌파 후 종가가 저항 구간 안 또는 아래로 복귀'); }
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
    } else if(breakout?.valid && i>breakout.at && b.close>zone.high) {
      if(b.low<=zone.high+range*.5 && touched==null) touched=i;
      if(touched!=null && i>touched && b.close>prev.high) emit('retest',i,touched,'이전 저항 부근에서 종가 지지를 유지한 뒤 직전 봉 고가 회복');
      else if(stage!=='retest') emit('maintained',i,breakout.at,'후속 완성봉 종가가 기존 저항 위 유지');
    }
    else if(!breakout && zone && b.high>zone.high && b.close<=zone.high) emit('wick',i,i,'윗꼬리만 저항 상단 통과; 종가 돌파 미확인');
    else if(rising && !breakout) emit('trend',i,hs.at(-1).i,'확인된 고점·저점 상승 구조');
    else if(!breakout && peak.i<i && b.close<peak.v && !['damaged','sharp'].includes(stage)) emit('pullback',i,i,support && b.low<=support.v?'지지 접촉 관찰; 저점 방어와 단기 고점 회복을 별도 확인':'상승 고점 이후 조정; 저점 방어·단기 고점 회복 미확인');
  }
  const b=last==null?null:bars[last], incomplete=last!==bars.length-1;
  const entry=!!(breakout?.valid && b && b.close>zone.high && b.close-zone.high<=2*breakout.range && ['breakout','maintained','retest'].includes(stage) && !incomplete);
  const signal=position==='holding'?(['sell','damaged','sharp'].includes(stage)?'sell':'hold'):(entry?'buy':'hold');
  const defended=lows.filter(x=>x.i>=cycle).at(-1);
  const shortHigh=highs.filter(x=>x.i>=cycle).at(-1);
  const defense=defended && last!=null && bars.slice(defended.i+1,last+1).every(x=>x.low>=defended.v);
  const recovery=shortHigh && b && b.close>shortHigh.v;
  const event=events.at(-1), perspective=position==='holding'?'보유자':'미보유자';
  const pattern=warning?'상승 후 조정·반등':breakout?'저항 돌파 구조':zone?'반복 저항·조정':'고점·저점 구조';
  const next=warning?`반등 진행 여부와 지지 ${level(warning.base??warning.low.v)} 종가 이탈 확인. 경고 해소: ${level(warning.reclaim)} 회복, 실패 시나리오 해제: 이전 고점 ${level(warning.peak.v)} 종가 회복.`:zone?`${level(zone.high)} 위 완성봉 종가와 이후 유지·되돌림 지지 확인`:'확인 가능한 연속 봉에서 반복 고점·조정 저점과 회복을 관찰';
  const invalidation=warning?`이전 고점 ${level(warning.peak.v)} 종가 회복 시 실패 시나리오 해제`:zone?`돌파 후 ${level(zone.high)} 아래 종가 복귀 시 돌파 판단 무효`:'새로운 고점·저점 구조가 확인되면 재평가';
  return {stage,signal,events,entry,gaps,usableBars:last==null?0:last-cycle+1,incomplete,breakout:breakout?{...breakout,confirmation:location(breakout.at)}:null,
    title:`${pattern} / ${stages[stage]} / ${perspective}`,
    summary:`${position==='holding'?(stage==='unknown'?'판단 보류':signal==='sell'?'비중 축소·매도 검토':'보유 유지·경고 관찰'):(entry?'신규 진입 후보':'신규 진입 대기')}. 기존 돌파: ${breakout?breakout.valid?'유효':'돌파 실패':'돌파 조건 미충족 또는 근거 미확인'} / 현재 신규 진입: ${entry?'후보':'대기'}. ${incomplete?'마지막 봉 미완성 또는 판독 단절로 신규 신호 보류.':''}`,
    pattern, nextStep:next,invalidation,
    support:lows.filter(x=>x.i>=cycle).length?level(lows.filter(x=>x.i>=cycle).at(-1).v):null,resistance:zone?`${level(zone.low)} ~ ${level(zone.high)}`:null,
    reasons:[`① 앞서 형성된 지지·저항: ${zone?zone.points.map(x=>location(x.i)).join(', ')+`의 반복 고점 ${level(zone.low)} ~ ${level(zone.high)}`:'반복 저항 미확인'}`,
    `② 판단을 바꾼 봉: 형성 ${event?.formation||'미확인'} / 최초 확인 ${event?.confirmation||'미확인'}. ${event?.fact||'충분한 순서 근거 없음'}`,
    `③ 지금 확인된 사실: ${stages[stage]}. 저점 방어: ${defense?"확인된 조정 저점 이후 유지":"미확인"}; 단기 고점 종가 회복: ${recovery?"확인":"미확인"}. ${breakout?`돌파 최초 확인 ${location(breakout.at)}; 현재 신규 진입과 별도 평가.`:''} ${sequence?.limitations||''}`,
    `④ 다음에 확인할 조건: ${next}`,`⑤ 판단 무효 조건: ${invalidation}`]};
}
