const $ = selector => document.querySelector(selector);
let image = null;
let uploadedAt=null;
let analyzedImage=null;
const reviewReady=import('/review.mjs');
let lockedJudgment=null;
let apiKey = '';
let serverConfigured = false;
let position = 'none';
let controller = null;
let currentResult = null;
let demoVisible = false;
let fileVersion = 0;
const history = [];
const labels = { buy: '매수 검토', hold: '보류', sell: '매도 검토' };
const qualityLabels = { high: '높음', medium: '보통', low: '낮음' };
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function error(message = '') {
  $('#error').textContent = message;
  $('#error').hidden = !message;
}
function updateConnection() {
  const connected = serverConfigured || Boolean(apiKey);
  $('#connection-dot').classList.toggle('connected', connected);
  $('#connection-label').textContent = connected ? '분석 연결 준비됨' : '분석 연결 설정';
}
function showSettings() { $('#api-key').value = apiKey; $('#settings-dialog').showModal(); }
$('#settings-button').addEventListener('click', showSettings);
for (const button of document.querySelectorAll('.close-dialog')) button.addEventListener('click', () => button.closest('dialog').close());
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
$('#settings-form').addEventListener('submit', event => {
  event.preventDefault(); apiKey = $('#api-key').value.trim(); $('#api-key').value = ''; updateConnection(); $('#settings-dialog').close(); error();
});
$('#settings-dialog').addEventListener('close', () => { $('#api-key').value = ''; });
$('#clear-key').addEventListener('click', () => { apiKey = ''; $('#api-key').value = ''; updateConnection(); $('#settings-dialog').close(); });
fetch('/api/status').then(response => { if (!response.ok) throw new Error(); return response.json(); }).then(data => {
  serverConfigured = data.configured; updateConnection();
  if (serverConfigured) { $('#key-note').textContent = '서버에 API 키가 설정되어 있습니다. 서버 키가 우선 사용되며, 이 화면의 키 삭제는 서버 설정에 영향을 주지 않습니다.'; $('#api-key').disabled = true; }
}).catch(() => { $('#connection-label').textContent = '서버 연결 확인 필요'; });

function setPosition(value) {
  position = value;
  for (const [id, selected] of [['#not-holding', value === 'none'], ['#holding', value === 'holding']]) { $(id).classList.toggle('selected', selected); $(id).setAttribute('aria-pressed', String(selected)); }
  clearResult();
}
$('#not-holding').addEventListener('click', () => setPosition('none'));
$('#holding').addEventListener('click', () => setPosition('holding'));
$('#period').addEventListener('change', clearResult);
$('#last-bar-state').addEventListener('change', clearResult);
$('#analysis-mode').addEventListener('change',()=>{$('#historical-options').hidden=$('#analysis-mode').value!=='historical';clearResult();updateReview();});
$('#reference-date').addEventListener('change',()=>{$('#scope-confirmed').checked=false;clearResult();});
document.addEventListener('chart-scope-change',clearResult);
function syncAnalysisActions() {
  $('#hero-sample-button').firstChild.textContent = image ? '내 차트 분석 ' : '예시 살펴보기 ';
  $('#sample-button').firstChild.textContent = image ? '내 차트 분석하기 ' : '예시 분석 살펴보기 ';
}
function clearResult() {
  syncAnalysisActions();
  currentResult = null; demoVisible = false; analyzedImage=null;
  $('.result-panel').hidden = true;
  $('#analysis-result').hidden = true; $('#empty-state').hidden = false; $('#result-badge').textContent = 'OUTPUT';
  updateReview();
}
async function loadFile(file, { source = 'file' } = {}) {
  if (!file || controller) return;
  const version = ++fileVersion;
  error();
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return error('PNG, JPG, WEBP 이미지만 지원합니다.');
  if (file.size > 8 * 1024 * 1024) return error('이미지는 8MB 이하로 올려 주세요.');
  try {
    const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    const probe = new Image(); probe.src = data; await probe.decode();
    if (probe.naturalWidth < 100 || probe.naturalHeight < 100) return error('가격과 패턴을 읽을 수 있도록 100 × 100px 이상의 이미지를 올려 주세요.');
    if (version !== fileVersion) return;
    image = data; uploadedAt=new Date().toISOString(); await ChartScope.reset(data);
    if(version!==fileVersion)return;
    $('#chart-preview').src = data; $('#file-name').textContent = `${file.name} · ${(file.size / 1024).toFixed(0)} KB`;
    $('#preview').hidden = false; $('#drop-zone').hidden = true; $('#analyze-button').disabled = false;
    clearResult();
    $('#upload-status').textContent = source === 'clipboard' ? '스크린샷이 준비되었습니다. 새 캡처를 붙여넣으면 교체됩니다.' : '이미지가 준비되었습니다. 스크린샷 붙여넣기로도 교체할 수 있어요.';
    $('#upload-status').hidden = false;
    return true;
  } catch { if (version === fileVersion) error('이미지를 읽을 수 없습니다. 다른 파일로 다시 시도해 주세요.'); }
}
$('#enlarge-chart').addEventListener('click', () => { if (!image) return; $('#chart-large').src=image; $('#chart-dialog').classList.remove('zoomed'); $('#chart-dialog').showModal(); });
$('#chart-zoom-toggle').addEventListener('click', () => $('#chart-dialog').classList.toggle('zoomed'));
$('#choose-image').addEventListener('click', () => $('#file-input').click());
$('#replace-image').addEventListener('click', () => $('#file-input').click());
$('#file-input').addEventListener('change', event => { loadFile(event.target.files[0]); event.target.value = ''; });
$('#remove-image').addEventListener('click', () => {
  fileVersion++; image = null; uploadedAt=null; ChartScope.reset(null); $('#chart-preview').removeAttribute('src'); $('#preview').hidden = true; $('#drop-zone').hidden = false; $('#analyze-button').disabled = true; $('#upload-status').hidden = true; $('#upload-status').textContent = ''; error(); clearResult();
});
for (const type of ['dragenter', 'dragover']) $('#drop-zone').addEventListener(type, event => { event.preventDefault(); $('#drop-zone').classList.add('dragover'); });
for (const type of ['dragleave', 'drop']) $('#drop-zone').addEventListener(type, event => { event.preventDefault(); $('#drop-zone').classList.remove('dragover'); });
$('#drop-zone').addEventListener('drop', event => loadFile(event.dataTransfer.files[0]));
// Only handle an explicit paste gesture; never request clipboard-read access.
// Text fields and dialogs retain their normal paste behavior (including API keys).
document.addEventListener('paste', async event => {
  if (event.defaultPrevented || document.querySelector('dialog[open]')) return;
  const target = event.target;
  if (target instanceof Element && (target.closest('input, textarea') || target.isContentEditable)) return;
  const clipboard = event.clipboardData;
  if (!clipboard) return;
  const item = Array.from(clipboard.items || []).find(item => item.kind === 'file' && item.type.startsWith('image/'));
  const file = item?.getAsFile() || Array.from(clipboard.files || []).find(file => file.type.startsWith('image/'));
  if (!file) return;
  event.preventDefault();
  if (controller) return;
  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[file.type] || 'image';
  const screenshot = new File([file], `스크린샷.${extension}`, { type: file.type });
  if (await loadFile(screenshot, { source: 'clipboard' })) {
    $('#preview').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
  }
});
// Prevent a dropped file outside the target from navigating away from the app.
window.addEventListener('dragover', event => event.preventDefault());
window.addEventListener('drop', event => event.preventDefault());
function busy(value) {
  if (value) { $('.result-panel').hidden = false; $('.result-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  $('#loading-state').hidden = !value;
  $('#analyze-button').disabled = value || !image;
  $('#analyze-label').textContent = value ? '분석 중…' : '차트 분석하기';
  for (const selector of ['#analysis-mode','#reference-date','#scope-confirmed','#edit-scope','#period', '#last-bar-state', '#not-holding', '#holding', '#remove-image', '#replace-image', '#choose-image', '#sample-button', '#hero-sample-button']) $(selector).disabled = value;
  $('.result-panel').setAttribute('aria-busy', String(value));
}
$('#analyze-button').addEventListener('click', async () => {
  if (!image || controller) return;
  if (!serverConfigured && !apiKey) { clearResult(); error('실제 분석을 위해 연결 설정에서 API 키를 입력해 주세요.'); showSettings(); return; }
  clearResult(); error(); $('#empty-state').hidden = true; $('#analysis-result').hidden = true; $('#result-badge').textContent = 'ANALYZING';
  controller = new AbortController(); busy(true);
  try {
    const analysisMode=$('#analysis-mode').value, referenceDate=analysisMode==='historical'?$('#reference-date').value:null;
    if(referenceDate && !$('#scope-confirmed').checked)throw new Error('기준일의 마지막 봉 위치를 범위 편집에서 선택하거나, 해당 날짜에서 끝나는 이미지인지 확인해 주세요.');
    const prepared=await ChartScope.prepare();
    const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ ...prepared, uploadedAt, analysisMode, referenceDate, scopeConfirmed:$('#scope-confirmed').checked, period: $('#period').value, lastBarState:$('#last-bar-state').value, position, ...(apiKey ? { apiKey } : {}) }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '분석에 실패했습니다. 다시 시도해 주세요.');
    analyzedImage=prepared.image;
    const entry = { result, analysisMode,referenceDate,uploadedAt, period: $('#period').value, lastBarState:$('#last-bar-state').value, position, image:prepared.image };
    history.unshift(entry); if (history.length > 5) history.pop();
    $('#history-count').textContent = history.length;
    renderResult(result, false); updateReview();
  } catch (err) {
    error(err.name === 'AbortError' ? '분석을 취소했습니다.' : err.message);
    $('#empty-state').hidden = false; $('#result-badge').textContent = 'OUTPUT';
  } finally { controller = null; busy(false); }
});
$('#cancel-button').addEventListener('click', () => controller?.abort());

function renderResult(result, demo) {
  function historicalEntries(result, demo) {
  if (demo || !image || !result.sequence) return '';
  const entries = result.assessment?.historical || result.sequence.events.filter(e => e.stage === 'breakout');
  const markers = entries.map((e,i) => Number.isFinite(e.x) && e.x>=0 && e.x<=1 ? `<line x1="${e.x*100}%" x2="${e.x*100}%" y1="34" y2="100%"/><circle cx="${e.x*100}%" cy="18" r="14"/><text x="${e.x*100}%" y="24">${i+1}</text>` : '').join('');
  return `<div class="result-section-title">관찰된 과거 매수·매도 후보</div><p>완성봉에서 확인한 가격 움직임입니다. 매수 후보와 매도 경고를 구분합니다. 분석 기준 시점의 신규 진입 의견이나 수익이 보장된 최적 매수점은 아닙니다. 이미지 중간 후보의 당시 검증은 그 오른쪽을 가린 별도 입력이 필요합니다. 표시 위치는 이미지 판독에 따른 근사 위치입니다.</p>${entries.length ? `<div class="chart-annotation"><img src="${escape(analyzedImage||image)}" alt="과거 돌파 확인 위치가 표시된 업로드 차트"><svg  aria-hidden="true">${markers}</svg></div><ol class="result-list">${entries.map(e=>`<li>${escape(e.confirmation)} · ${escape(e.patternKind||e.label)} · ${['sell','damaged','sharp'].includes(e.stage)?'비중 축소 검토':e.stage==='failed'?'돌파 실패':e.stage==='warning'?'첫 경고':e.entryCandidate||e.stage==='retest'?'매수 후보':'추가 확인 필요'} — ${escape(e.fact)} / 형성: ${escape(e.formation)} / 판단 변경: ${escape(e.invalidation||'해당 지지·저항 회복 또는 이탈')} ${e.x==null?' (이미지 좌표 미확인: 위치선 생략)':''}</li>`).join('')}</ol>` : `<p>${result.assessment?.historyStatus==='conditions_not_met'?'조건 미충족 · 판독한 구간에서 규칙을 충족하는 과거 후보가 확인되지 않았습니다.':'확인 불가 · 과거 구간의 연속 봉 정보가 부족합니다. 패턴이 없다는 뜻은 아닙니다.'}</p>`}`;
}
  currentResult = result; demoVisible = demo;
  $('.result-panel').hidden = false;
  $('#empty-state').hidden = true; $('#analysis-result').hidden = false; $('#result-badge').textContent = demo ? 'SAMPLE / 예시' : 'ANALYSIS';
  const list = (items, cls = '') => `<ul class="result-list ${cls}">${items.map(item => `<li>${escape(item)}</li>`).join('')}</ul>`;
  const a=result.assessment, current=a?.current;
  const insight = (label, value) => `<div class="insight"><div class="insight-label">${label}</div><p>${escape(value)}</p></div>`;
  $('#analysis-result').innerHTML = `<div class="result-content">
    ${demo ? '<div class="sample-notice">예시 전용 · 가상 차트와 미리 작성한 설명입니다. 업로드한 이미지의 분석 결과가 아닙니다.</div><img class="sample-thumb" src="/sample.svg" alt="예시용 가상 종목의 상승 추세 차트">' : ''}
    ${result.reference?`<p class="reference-heading">${escape(result.reference.heading)}</p><p class="reference-detail">분석 대상: ${escape(result.reference.target)} · 실제 사용한 마지막 봉: ${escape(result.reference.usedLast)}${result.reference.excluded.length?' · 제외: '+escape(result.reference.excluded.join(', ')):''}<br>업로드: ${escape(result.reference.uploadedAt?new Date(result.reference.uploadedAt).toLocaleString('ko-KR'):'확인 불가')} · 기준일 출처: ${escape(result.reference.dateSource==='user'?'사용자 입력':result.reference.dateSource==='image'?'이미지 날짜축':'미확인')}</p>`:''}
    <div class="result-meta"><span>${escape(result.symbol || '종목 확인 불가')} <span> / </span> ${escape(result.timeframe || '시간축 확인 불가')} · ${escape(current?.context.period || $('#period').value)} · ${current?.context.position==='holding'?'보유 중':'미보유'}</span><span>${demo ? '가상 데이터' : new Date(result.analyzedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span></div>
    <div class="signal-card ${escape(result.signal)}"><div class="signal-top"><span class="signal-tag">${result.reference?.mode==='historical'?'당시 판단':'현재 행동'} · 입력 차트 기준</span><span class="quality">이미지 근거 품질 ${escape(qualityLabels[result.evidenceQuality])} · 수익 확률 아님</span></div><h3>${escape(result.title)}</h3><p class="decision-reason">${escape(result.summary)}</p>
    <div class="decision-evidence"><h4>판단 근거</h4>${list(current?current.evidence.map(e=>e.status+' · '+e.text):result.reasons)}</div>
    <div class="decision-next"><h4>${result.reference?.mode==='historical'?'그 이후 확인해야 할 조건':'다음 확인 조건'}</h4><p>${escape(result.nextStep)}</p></div>
    <div class="decision-change"><h4>판단이 바뀌는 조건</h4><p>${escape(result.invalidation)}</p></div></div>
    <div class="result-section-title">상세 분석 · 차트에서 읽은 흐름 <button id="copy-result">결과 복사 ↗</button></div>
    ${result.observation?`<div class="result-section-title">먼저 확인한 이미지 정보</div>${list(['보이는 기간: '+result.observation.visiblePeriod,'분석 기준 위치: '+result.observation.endpointLabel+' — '+result.observation.endpointEvidence,'오른쪽 끝 구조: '+result.observation.rightEdgeStructure,'가격축: '+(result.observation.priceAxisReadable?'판독 가능':'정확값 미확인'),...result.observation.priceLabels.map(p=>p.text+' · '+({last_candle:'마지막 봉 연결 후보',quote_line:'별도 현재가·수평선',cursor:'커서 값',average_cost:'평균 매입가',indicator:'지표 값',unknown:'역할 미확인'})[p.role]+' · '+p.location+' — '+p.evidence)])}`:''}
    ${a?.overview.length?`<div class="result-section-title">전체 차트의 구간 흐름</div>${list(a.overview.map(r=>r.location+' · '+({range:'횡보',up:'상승',pullback:'조정',down:'하락',unknown:'확인 불가'})[r.regime]+' — '+r.evidence))}`:''}
    <div class="insight-grid">${insight('01 / 추세', result.trend)}${insight('02 / 패턴', result.pattern)}${insight('03 / 거래량', result.volume)}</div>
    <p class="price-precision">가격 표시: ${escape(({exact:'정확값 · 이미지 관찰',approximate:'근사 구간',relative:'상대 위치',unknown:'확인 불가'})[a?.levels.precision]||'이미지 관찰')}</p><div class="levels"><div><span>지지선</span><strong>${escape(result.support || '확인 불가')}</strong></div><div><span>저항선</span><strong>${escape(result.resistance || '확인 불가')}</strong></div></div>
    ${historicalEntries(result, demo)}
    ${a?.historicalUnavailable?.length?`<details><summary>과거 구간에서 판독하지 못한 항목</summary>${list(a.historicalUnavailable)}</details>`:''}
    ${a?.unavailable.length?`<div class="result-section-title">판단할 수 없는 항목</div>${list(a.unavailable)}`:''}
    <div class="result-section-title">함께 살펴볼 위험</div>${list(result.risks, 'risk-list')}
    ${a?`<details class="analysis-diagnostics"><summary>분석 과정 확인 · AI 관찰 / 서버 판단 / 화면 표시</summary><p>이 요청의 분석 필드만 표시합니다. 이미지와 API 키는 포함하지 않습니다.</p><pre>${escape(JSON.stringify(a.diagnostics,null,2))}</pre></details>`:''}
    <p class="result-disclaimer">판독 근거 수준은 수익 확률이 아닙니다. 이미지 촬영 이후의 시장 변화는 반영하지 않습니다.</p>
  </div>`;
  $('#copy-result').addEventListener('click', copyResult);
}
async function copyResult() {
  if (!currentResult) return;
  const r = currentResult;
  const text = `${demoVisible ? '[예시 · 실제 분석 아님]\n' : ''}Chart Signal | ${labels[r.signal]}\n${r.reference?.heading||''}\n${r.title}\n${r.summary}\n${r.assessment?'분석 과정 비교\n'+JSON.stringify(r.assessment.diagnostics,null,2):''}\n${r.sequence ? '신호 기록 (형성 / 최초 확인)\n' + r.sequence.events.map(e => e.label + ': ' + e.formation + ' / ' + e.confirmation + ' · ' + e.fact).join('\n') : ''}\n\n${r.patternStatus ? '패턴 점검: ' + r.pattern + '\n위치: ' + r.patternLocation + '\n' + r.patternEvidence.map(v => '- ' + v).join('\n') + '\n후속 확인: ' + r.confirmation + '\n' : ''}추세: ${r.trend}\n패턴: ${r.pattern}\n거래량: ${r.volume}\n지지선: ${r.support || '확인 불가'}\n저항선: ${r.resistance || '확인 불가'}\n\n${r.maEvidence ? '지표 점검\n' + r.indicatorSummary + '\n갭: ' + r.gapZone + '\n' + r.gapEvidence.join('\n') + '\n5기간: ' + r.ma5 + '\n20기간: ' + r.ma20 + '\n60기간: ' + r.ma60 + '\n120기간: ' + r.ma120 + '\n' + r.maEvidence.join('\n') + '\n볼린저\n' + r.bbEvidence.join('\n') + '\n\n' : ''}근거\n${r.reasons.map(v => '- ' + v).join('\n')}\n\n위험\n${r.risks.map(v => '- ' + v).join('\n')}\n\n다음 확인: ${r.nextStep}\n무효화 조건: ${r.invalidation}\n\n이미지 기반 참고 자료이며 수익을 보장하지 않습니다.`;
  try { await navigator.clipboard.writeText(text); $('#copy-result').textContent = '복사 완료 ✓'; }
  catch { $('#copy-result').textContent = '복사 불가 · 브라우저 권한 확인'; }
}
const sample = {
  chartInterval:'unknown',gapType:'unknown',gapFill:'unknown',gapRetest:'unconfirmed',gapZone:'가상 예시에는 갭 경계가 표시되어 있지 않습니다.',gapEvidence:['봉 사이 고저 범위 확인 불가','갭 메움 여부 확인 불가','지지·저항 재접근 확인 불가'],ma5Cross:'unknown',ma5Slope:'unknown',ma20Slope:'unknown',maConfirmation:'unavailable',ma5:'5기간선 미표시',ma20:'20기간선 미표시',ma60:'60기간선 미표시',ma120:'120기간선 미표시',maEvidence:['기간 범례 없음','선의 기울기와 돌파를 추정하지 않음','미표시 지표는 매매 근거에 포함하지 않음'],bbPosition:'unknown',bbRegime:'unknown',bbConfirmation:'unavailable',bbEvidence:['볼린저 밴드 미표시','상하단 위치 확인 불가','재진입·추세 여부 확인 불가'],indicatorSummary:'가상 예시에는 이동평균·볼린저 밴드가 없습니다. 실제 분석에서는 표시된 지표만 점검합니다.',
  patternType: 'none', patternStatus: 'not_found', patternBias: 'neutral', priorTrend: 'up', candleDirection: 'unknown', patternLocation: '가상 선 차트의 오른쪽 구간', confirmation: '봉차트가 없어 캔들 패턴은 판독할 수 없습니다. 예시 저항 돌파를 기다리는 상황입니다.', patternEvidence: ['가상 선 차트이므로 몸통과 꼬리가 표시되지 않습니다.', '반전형·지속형 봉 패턴을 확정하지 않습니다.', '이 예시는 실제 AI 분석이 아닙니다.'],
  readable: true, signal: 'hold', title: '돌파 확인까지, 한 템포 기다리기',
  summary: '가상 예시에서는 저점이 높아지는 흐름이 보이지만, 전고점 부근의 저항을 넘었다고 보기 어렵습니다. 추가 확인 후 진입을 검토하는 관점입니다.',
  symbol: 'DEMO · 가상 종목', timeframe: '일봉 · 예시', evidenceQuality: 'medium',
  trend: '저점이 높아지는 완만한 상승 흐름', pattern: '전고점 저항 구간에 재접근', volume: '최근 거래량 증가가 뚜렷하지 않음', support: '₩48,000 · 예시', resistance: '₩52,000 · 예시',
  reasons: ['연속된 저점 상승은 매수세 유입 가능성을 시사합니다.', '직전 고점 돌파와 거래량 동반 여부는 아직 확인이 필요합니다.'],
  risks: ['저항 구간에서 되돌림이 나올 수 있습니다.', '차트만으로 뉴스·실적·시장 급변을 판단할 수 없습니다.'],
  nextStep: '가상 저항선 ₩52,000 위에서 종가가 형성되고 거래량이 증가하는지 확인합니다.',
  invalidation: '가상 지지선 ₩48,000 아래로 종가가 내려가면 상승 흐름을 재검토합니다.'
};
$('#sample-button').addEventListener('click', () => {
  if (controller) return;
  if (image) { $('#analyze-button').click(); return; }
  renderResult(sample, true);
});
$('#history-button').addEventListener('click', () => {
  const list = $('#history-list'); list.replaceChildren();
  if (!history.length) { const p = document.createElement('p'); p.textContent = '아직 완료한 분석이 없습니다.'; p.className = 'dialog-note'; list.append(p); }
  history.forEach(entry => {
    const button = document.createElement('button'); button.className = 'history-item';
    const title = document.createElement('strong'); title.textContent = `${labels[entry.result.signal]} · ${entry.result.symbol || '종목 미확인'}`;
    const meta = document.createElement('span'); meta.textContent = `${entry.period} / ${entry.position === 'holding' ? '보유 중' : '미보유'} / ${new Date(entry.result.analyzedAt).toLocaleTimeString('ko-KR')}`;
    button.append(title, meta);
    button.addEventListener('click', () => {
      if (controller) return;
      fileVersion++; image = entry.image; analyzedImage=entry.image; uploadedAt=entry.uploadedAt; ChartScope.reset(image); $('#analysis-mode').value=entry.analysisMode||'latest';$('#reference-date').value=entry.referenceDate||'';$('#historical-options').hidden=$('#analysis-mode').value!=='historical'; position = entry.position; $('#period').value = entry.period; $('#last-bar-state').value=entry.lastBarState || 'unknown';
      for (const [id, selected] of [['#not-holding', position === 'none'], ['#holding', position === 'holding']]) { $(id).classList.toggle('selected', selected); $(id).setAttribute('aria-pressed', String(selected)); }
      $('#chart-preview').src = image; $('#file-name').textContent = '세션 기록의 차트 이미지'; $('#preview').hidden = false; $('#drop-zone').hidden = true; $('#analyze-button').disabled = false;
      $('#upload-status').hidden = true;
      syncAnalysisActions(); renderResult(entry.result, false); updateReview(); error(); $('#history-dialog').close();
    });
    list.append(button);
  });
  $('#history-dialog').showModal();
});

$('#hero-sample-button').addEventListener('click', () => {
  if (controller) return;
  $('#sample-button').click();
  $('.result-panel').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
});

function updateReview(){
  $('#review-panel').hidden=$('#analysis-mode').value!=='historical' && !lockedJudgment;
  $('#review-status').textContent=lockedJudgment?`고정된 최초 판단: ${lockedJudgment.payload.reference.heading} / ${lockedJudgment.payload.title} / ${lockedJudgment.payload.policyVersion} / ${lockedJudgment.payload.model}`:'과거 차트 분석을 마친 뒤 최초 판단을 고정하세요. 고정 후 이후 차트를 새로 올려 별도로 분석할 수 있습니다.';
  $('#lock-judgment').disabled=!!lockedJudgment || !currentResult || currentResult.reference?.mode!=='historical';
  $('#export-judgment').disabled=!lockedJudgment;$('#compare-later').disabled=!lockedJudgment || !currentResult;$('#clear-judgment').disabled=!lockedJudgment;
}
const judgmentKey='chart-signal-locked-judgment-v1';
reviewReady.then(async r=>{try{const saved=localStorage.getItem(judgmentKey);if(saved){const value=JSON.parse(saved);if(await r.validateJudgment(value))lockedJudgment=value;else error('저장된 최초 판단의 무결성을 확인할 수 없습니다.');}}catch{error('이 브라우저에서 고정 판단 저장소를 읽을 수 없습니다.');}updateReview();});
$('#lock-judgment').addEventListener('click',async()=>{try{if(lockedJudgment)throw new Error('기존 최초 판단을 덮어쓰지 않습니다. 새 검증은 고정을 해제한 뒤 시작하세요.');const r=await reviewReady;const record=await r.lockJudgment(currentResult);localStorage.setItem(judgmentKey,JSON.stringify(record));lockedJudgment=record;$('#review-output').replaceChildren();updateReview();}catch(e){error(e.message);}});
$('#export-judgment').addEventListener('click',()=>{if(!lockedJudgment)return;const link=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(lockedJudgment,null,2)],{type:'application/json'}));link.href=url;link.download='chart-signal-judgment.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('#import-judgment').addEventListener('click',()=>$('#judgment-file').click());
$('#judgment-file').addEventListener('change',async e=>{try{if(lockedJudgment)throw new Error('현재 고정 판단을 먼저 내보내고 고정을 해제해 주세요.');const file=e.target.files[0];if(!file)return;if(file.size>2*1024*1024)throw new Error('판단 파일은 2MB 이하만 지원합니다.');const value=JSON.parse(await file.text()),r=await reviewReady;if(!await r.validateJudgment(value))throw new Error('유효한 판단 파일이 아닙니다.');localStorage.setItem(judgmentKey,JSON.stringify(value));lockedJudgment=value;updateReview();}catch(err){error(err.message);}finally{e.target.value='';}});
$('#clear-judgment').addEventListener('click',()=>{localStorage.removeItem(judgmentKey);lockedJudgment=null;$('#review-output').replaceChildren();updateReview();});
$('#compare-later').addEventListener('click',async()=>{try{const r=await reviewReady,evaluation=await r.evaluateLater(lockedJudgment,currentResult);$('#review-output').innerHTML=`<h3>사후 평가 · 최초 판단 유지</h3><p>${escape(evaluation.originalTitle)} / ${escape(evaluation.originalVersion)} / ${escape(evaluation.originalModel)}</p><p>당시 조건: ${escape(evaluation.originalConditions)}</p>${evaluation.rows.map(row=>`<h4>${escape(row.question)}</h4><p>${escape(row.answer)}</p>`).join('')}<p>${escape(evaluation.missing.join(' · '))}</p><p>${escape(evaluation.note)}</p>`;}catch(e){error(e.message);}});
