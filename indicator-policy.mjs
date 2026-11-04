const choice = values => ({ type: 'string', enum: values });
const note = { type: 'string' };
const evidence = { type: 'array', items: { type: 'string' } };
export const indicatorProperties = {
  chartInterval: choice(['daily', 'other', 'unknown']),
  gapType: choice(['up', 'down', 'none', 'unknown']),
  gapFill: choice(['unfilled', 'partial', 'filled', 'unknown']),
  gapRetest: choice(['support_held', 'resistance_held', 'failed', 'unconfirmed']),
  gapZone: note, gapEvidence: evidence,
  ma5Cross: choice(['up', 'down', 'none', 'unknown']),
  ma5Slope: choice(['up', 'down', 'flat', 'unknown']),
  ma20Slope: choice(['up', 'down', 'flat', 'unknown']),
  maConfirmation: choice(['confirmed', 'pending', 'unavailable']),
  ma5: note, ma20: note, ma60: note, ma120: note, maEvidence: evidence,
  bbPosition: choice(['upper', 'lower', 'above_middle', 'below_middle', 'outside_upper', 'outside_lower', 'unknown']),
  bbRegime: choice(['trend', 'range', 'squeeze', 'unknown']),
  bbConfirmation: choice(['bullish_reentry', 'bearish_reentry', 'pending', 'unavailable']),
  bbEvidence: evidence, indicatorSummary: note
};
export const INDICATOR_INSTRUCTIONS = `
[추가 기준: 갭·이동평균·볼린저 밴드 / 기존 봉패턴과 통합]
보이는 지표만 평가한다. 없는 지표는 unavailable/unknown 및 '표시되지 않아 확인 불가'로 표시한다. 원본 OHLC 없이 5/20/60/120 이동평균이나 표준편차를 직접 계산한 것처럼 쓰지 않는다. 선 색깔만으로 기간이나 지표를 추측하지 말고 범례·설정으로 식별한다. 일봉인지 먼저 chartInterval로 구분하며 분봉의 5기간선을 5일선이라 부르지 않는다. 거래 세션·수정주가/기업행사/데이터 누락 때문에 생긴 단절 가능성을 이미지로 배제할 수 없으면 한계로 쓴다. 갭에서 악재·호재·수급 주체의 존재를 사실로 추정하지 않는다.
[갭]
상승갭은 인접한 앞 봉 고가보다 뒤 봉 저가가 높은 경우, 하락갭은 앞 봉 저가보다 뒤 봉 고가가 낮은 경우로 판단한다. 단순 전일 종가 대비 시가 차이와 구분한다. 일봉이 아니면 인접 봉 가격 공백으로만 표현한다. gapZone에는 양쪽 경계와 관찰 위치를 적되 숫자를 읽지 못하면 상대 위치를 사용한다. 갭을 형성한 방향과 이후 가격 반응을 분리한다.
상승갭은 지지 후보, 하락갭은 저항 후보이다. 실제 재접근에서 반등/반락한 후속 종가가 확인되어야 gapRetest를 support_held/resistance_held로 표시한다. 재접근 전이면 unconfirmed. gapFill은 미진입 unfilled, 일부 진입 partial, 반대편 경계까지 가격이 도달한 완전 메움 filled, 미확인 unknown으로 구분한다. 장중 꼬리로 메운 것과 종가로 경계 이탈한 것을 evidence에서 구분한다. 메운 갭은 기존 공백 자체의 지지·저항 근거가 약화되나, 메움만으로 추세 반전이나 그 가격대의 영구 무효를 단정하지 않는다. 완전 메움이면 옛 갭을 현재의 유효한 지지/저항으로 활용하지 않는다. gapEvidence 3~5개: 형성 기준·시점, 메움 상태, 실제 재접근/실패/미확인.
[이동평균]
일봉에서 5일선은 단기 심리, 20일선은 중기 추세, 60일선은 비교적 긴 수급 흐름의 참고선, 120일선은 장기 흐름의 참고선으로 설명한다. 이는 시장의 통칭이지 60일 이탈이 실제 공급 초과나 120일 이탈이 경기 악화를 증명하는 것은 아니다. SMA/EMA 설정을 구분하고 식별 불가한 방식은 미확인으로 적는다.
ma5/ma20/ma60/ma120 각각에 식별 근거, 가격의 위/아래 위치, 최근 기울기, 최근 종가 돌파/이탈 여부와 반증 조건을 간결히 기록한다. 없는 선은 확인 불가. '위에 있다'와 '최근 아래에서 위로 돌파했다'는 다르다. 선행·후행 봉이 없거나 현재 봉이 진행 중이면 돌파 확정 금지.
5선 전략은 종가의 상향돌파+5선의 상승 기울기 전환을 동시에 확인할 때 매수 후보, 하향돌파+하락 기울기 전환을 동시에 확인할 때 매도 후보이다. 단일 터치/순간 돌파는 pending. maConfirmation=confirmed는 식별된 5선과 완성된 최근 봉의 돌파, 기울기, 이후 유지가 함께 보일 때만 사용한다. 단기 휩쏘와 확인이 늦어지는 비용을 risks에 반영한다.
20선은 중기 방향 확인에 사용하고 최근 종가의 이탈/회복과 기울기를 나눠 본다. 돌파 하나로 추세 전환이 확정된다고 말하지 않는다. 60·120선도 위치·기울기·재접근을 보조 근거로만 사용한다. maEvidence 3~5개에 식별 근거, 5선 돌파/기울기 동시 확인 또는 미확인, 20선 방향과의 정합성, 60·120선과 투자 기간상의 한계를 적는다.
[볼린저 밴드]
통상 20기간 이동평균 ±2표준편차이나 화면에서 설정을 확인할 때만 해당 설정으로 확정한다. 중심선·상하단 위치와 밴드 폭의 수축/확대, 추세/횡보를 구분한다. 이미지로 수치화한 표준편차나 돌파 확률을 만들지 않는다. 정규분포의 ±2σ 약95%라는 설명은 주가의 미래 분포나 상·하단 돌파 확률 각2.5%를 보장하지 않는다. 주가는 비정규·변동성 군집 특성이 있어 밴드 바깥에 머물 수도 있다.
횡보장에서 하단 접근은 매수 관찰 후보, 상단 접근은 매도 관찰 후보일 뿐이다. bbConfirmation=bullish_reentry는 하단 접촉/이탈 후 밴드 안으로 재진입하고 후속 종가 반등이 보일 때, bearish_reentry는 상단에서 반대 움직임이 보일 때만 사용한다. 터치뿐이면 pending. 강한 추세에서는 밴드 워킹이 가능하므로 상단=매도/하단=매수로 자동 판정하지 않는다. 수축은 변동성 확대 가능성의 단서일 뿐 방향 신호가 아니다. 중심선 위/아래와 기울기는 추세 보조 근거다. bbEvidence 3~5개에 선 식별·위치·시장 상태·재진입 확인/미확인을 적는다.
[최종 통합: 이 절은 기존 7번의 '봉패턴만 매매 근거' 제한을 확장한다]
매수/매도는 (A) 확인된 봉패턴 또는 (B) 위 조건이 모두 확인된 5선 돌파+기울기이며 20선 방향까지 같은 경우에만 검토한다. A의 봉 색상 불명확은 A를 사용할 수 없다는 뜻이며 B까지 막지는 않는다. 봉패턴이 없어도 B가 충족되면 판단할 수 있다. 갭과 볼린저만으로 매수/매도를 확정하지 않는다.
확인된 근거들이 서로 반대면 hold. 20선이 반대 방향이면 보류하고 단기/중기 충돌을 설명한다. 횡보장의 확인된 밴드 재진입, 유효한 미메움 갭 재시험이 반대 방향이어도 보류한다. 불명확한 지표를 일치 근거로 세지 않는다. 장기 보유 선택에 단기 5선만 보고 의견을 확정하지 말고 60/120선 확인 부족을 설명한다. indicatorSummary에 일치/상충/미확인과 최종 의견의 근거를 정리한다. 모델이 선택한 hold를 지표만으로 매수/매도로 승격하지 않는다.
`;

export function indicatorVotes(r) {
  const enough = rows => rows.length >= 3 && rows.every(row => row.trim());
  const ma = r.maConfirmation === 'confirmed' && enough(r.maEvidence)
    && ['up','down'].includes(r.ma5Cross) && r.ma5Slope === r.ma5Cross && r.ma20Slope === r.ma5Cross
    && r.chartInterval !== 'unknown' ? (r.ma5Cross === 'up' ? 'bullish' : 'bearish') : null;
  const opposing = [];
  if (r.ma20Slope === 'up') opposing.push('bullish');
  if (r.ma20Slope === 'down') opposing.push('bearish');
  if (enough(r.gapEvidence) && r.gapFill === 'unfilled') {
    if (r.gapType === 'up' && r.gapRetest === 'support_held') opposing.push('bullish');
    if (r.gapType === 'down' && r.gapRetest === 'resistance_held') opposing.push('bearish');
  }
  if (enough(r.bbEvidence) && r.bbRegime === 'range') {
    if (r.bbConfirmation === 'bullish_reentry') opposing.push('bullish');
    if (r.bbConfirmation === 'bearish_reentry') opposing.push('bearish');
  }
  return { ma, opposing };
}
