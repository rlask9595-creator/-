const string={type:'string'}, nullable={type:['string','null']};
const obj=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
export const observationSchema=obj({visiblePeriod:string,endpointDate:nullable,endpointLabel:string,endpointX:{type:['number','null']},endpointEvidence:string,priceAxisReadable:{type:'boolean'},rightEdgeStructure:string,unreadable:{type:'array',items:string},priceLabels:{type:'array',maxItems:12,items:obj({text:string,role:{type:'string',enum:['last_candle','quote_line','cursor','average_cost','indicator','unknown']},location:string,evidence:string})}});
export const REFERENCE_INSTRUCTIONS=`
[관찰 우선 / 분석 기준 시점]
분석 기준은 오직 입력 이미지의 가장 오른쪽 분석 대상 봉이다. 실제 오늘 날짜와 달라도 오래된 데이터 오류나 정보 부족 사유가 아니다. 먼저 observation에 종목(기존 symbol), 시간축(timeframe), 보이는 기간, 오른쪽 끝 봉의 위치·날짜·가격 표시의 역할·오른쪽 끝 구조를 관찰한 뒤 priceSequence를 추출한다. 왼쪽 상단 종목명이 일부 가려져도 읽히는 문자는 보존하고 임의 종목으로 보완하지 않는다.
priceSequence 마지막 봉의 x는 observation.endpointX와 일치해야 한다. 과거 중간의 큰 상승 구간을 최근 구간으로 바꾸지 않는다. endpointDate와 각 봉 date는 YYYY-MM-DD를 확실히 읽을 때만 기록하며 아니면 null이다. 날짜 미판독은 가격 구조 미판독이 아니다.
priceLabels의 last_candle은 오른쪽 끝 몸통/꼬리와 수직 높이 및 연결 위치가 맞는 값만 해당한다. 화면 상단 현재가, 별도 수평선, 과거 커서 OHLC, 평균가, 지표값은 역할을 따로 적고 봉 종가 추출에 사용하지 않는다. 역할이 확실하지 않으면 unknown이다. 마감 여부는 사용자 설정을 따르며 라벨이 있다고 확정 종가로 단정하지 않는다.
과거 시점 검증에서는 이미지 밖 시세·뉴스·실적·종목의 이후 실제 결과를 사용하지 않는다. 외부 검색은 제공되지 않는다. 등락률 주석, 전체기간 매물대, 화면 밖 현재가 수평선, 평균 매입가는 당시 패턴 판단 근거에서 제외한다. 이미지 내부 과거 후보는 전체 화면 관찰에 의한 탐색이며 그 시점 이후를 실제로 가린 별도 입력 검증과 구분한다.
보조 확대 이미지가 있으면 같은 입력 이미지의 오른쪽 구간을 잘라 확대한 것이다. 전체 이미지의 시간축/가격축과 함께 확인하되 확대가 새 정보를 만들지는 않는다. 모든 x는 첫 번째 전체 입력 이미지 좌표로 반환한다. 관찰 불가한 숫자나 날짜를 채우지 않는다.
`;
export function validDate(value) {return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;}
export function referenceContext(result,context,current) {
 const observation=result.observation;
 const target=result.priceSequence?.candles.at(-1);
 const historical=context.analysisMode==='historical';
 const date=context.referenceDate || (validDate(observation?.endpointDate)?observation.endpointDate:null);
 const completed=result.priceSequence?.candles.filter((b,i,a)=>i<a.length-1 || context.lastBarState==='closed').filter(b=>[b.high,b.low,b.close].every(Number.isFinite))||[];
 const used=completed.at(-1);
 return {mode:historical?'historical':'latest',date,dateSource:context.referenceDate?'user':date?'image':'unknown',heading:`${historical?'과거 시점 검증':'최신 차트 분석'} · ${date?'기준일 '+date:'이미지의 마지막 분석 대상 봉 기준'}`,target:observation?.endpointLabel||target?.label||'이미지의 마지막 분석 대상 봉',usedLast:used?.label||'확인 불가',usedLastDate:validDate(used?.date)?used.date:null,excluded:context.lastBarState==='closed'?[]:[target?.label||'마지막 분석 대상 봉'],uploadedAt:context.uploadedAt||null,receivedAt:context.receivedAt||null,scope:context.imageScope||null,scopeBasis:'입력 이미지에 보이는 정보만 사용',historicalSignals:'중간 과거 후보는 탐색 결과. 해당 시점 오른쪽을 가린 별도 입력 전에는 당시 정보만의 검증이 아님'};
}
export function endpointMismatch(raw) {
 const x=raw.observation?.endpointX,last=raw.priceSequence?.candles.at(-1)?.x;
 return Number.isFinite(x) && Number.isFinite(last) && Math.abs(x-last)>.05;
}
