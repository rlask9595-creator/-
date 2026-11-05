const $ = selector => document.querySelector(selector);
let image = null;
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
function clearResult() {
  currentResult = null; demoVisible = false;
  $('.result-panel').hidden = true;
  $('#analysis-result').hidden = true; $('#empty-state').hidden = false; $('#result-badge').textContent = 'OUTPUT';
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
    image = data;
    $('#chart-preview').src = data; $('#file-name').textContent = `${file.name} · ${(file.size / 1024).toFixed(0)} KB`;
    $('#preview').hidden = false; $('#drop-zone').hidden = true; $('#analyze-button').disabled = false;
    clearResult();
    $('#upload-status').textContent = source === 'clipboard' ? '스크린샷이 준비되었습니다. 새 캡처를 붙여넣으면 교체됩니다.' : '이미지가 준비되었습니다. 스크린샷 붙여넣기로도 교체할 수 있어요.';
    $('#upload-status').hidden = false;
    return true;
  } catch { if (version === fileVersion) error('이미지를 읽을 수 없습니다. 다른 파일로 다시 시도해 주세요.'); }
}
$('#choose-image').addEventListener('click', () => $('#file-input').click());
$('#replace-image').addEventListener('click', () => $('#file-input').click());
$('#file-input').addEventListener('change', event => { loadFile(event.target.files[0]); event.target.value = ''; });
$('#remove-image').addEventListener('click', () => {
  fileVersion++; image = null; $('#chart-preview').removeAttribute('src'); $('#preview').hidden = true; $('#drop-zone').hidden = false; $('#analyze-button').disabled = true; $('#upload-status').hidden = true; $('#upload-status').textContent = ''; error(); clearResult();
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
  for (const selector of ['#period', '#not-holding', '#holding', '#remove-image', '#replace-image', '#choose-image', '#sample-button']) $(selector).disabled = value;
  $('.result-panel').setAttribute('aria-busy', String(value));
}
$('#analyze-button').addEventListener('click', async () => {
  if (!image || controller) return;
  if (!serverConfigured && !apiKey) { error('실제 분석을 위해 연결 설정에서 API 키를 입력해 주세요.'); showSettings(); return; }
  error(); $('#empty-state').hidden = true; $('#analysis-result').hidden = true; $('#result-badge').textContent = 'ANALYZING';
  controller = new AbortController(); busy(true);
  try {
    const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ image, period: $('#period').value, position, ...(apiKey ? { apiKey } : {}) }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '분석에 실패했습니다. 다시 시도해 주세요.');
    const entry = { result, period: $('#period').value, position, image };
    history.unshift(entry); if (history.length > 5) history.pop();
    $('#history-count').textContent = history.length;
    renderResult(result, false);
  } catch (err) {
    error(err.name === 'AbortError' ? '분석을 취소했습니다.' : err.message);
    $('#empty-state').hidden = false; $('#result-badge').textContent = 'OUTPUT';
  } finally { controller = null; busy(false); }
});
$('#cancel-button').addEventListener('click', () => controller?.abort());

function renderResult(result, demo) {
  currentResult = result; demoVisible = demo;
  $('.result-panel').hidden = false;
  $('#empty-state').hidden = true; $('#analysis-result').hidden = false; $('#result-badge').textContent = demo ? 'SAMPLE / 예시' : 'ANALYSIS';
  const list = (items, cls = '') => `<ul class="result-list ${cls}">${items.map(item => `<li>${escape(item)}</li>`).join('')}</ul>`;
  const insight = (label, value) => `<div class="insight"><div class="insight-label">${label}</div><p>${escape(value)}</p></div>`;
  $('#analysis-result').innerHTML = `<div class="result-content">
    ${demo ? '<div class="sample-notice">예시 전용 · 가상 차트와 미리 작성한 설명입니다. 업로드한 이미지의 분석 결과가 아닙니다.</div><img class="sample-thumb" src="/sample.svg" alt="예시용 가상 종목의 상승 추세 차트">' : ''}
    <div class="result-meta"><span>${escape(result.symbol || '종목 확인 불가')} <span> / </span> ${escape(result.timeframe || '시간축 확인 불가')}</span><span>${demo ? '가상 데이터' : new Date(result.analyzedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span></div>
    <div class="signal-card ${escape(result.signal)}"><div class="signal-top"><span class="signal-tag">${escape(labels[result.signal])} · ${result.readable ? '조건부 기술적 의견' : '판독 어려움'}</span><span class="quality">판독 근거 ${escape(qualityLabels[result.evidenceQuality])}</span></div><h3>${escape(result.title)}</h3><p>${escape(result.summary)}</p></div>
    <div class="result-section-title">차트에서 읽은 흐름 <button id="copy-result">결과 복사 ↗</button></div>
    <div class="insight-grid">${insight('01 / 추세', result.trend)}${insight('02 / 패턴', result.pattern)}${insight('03 / 거래량', result.volume)}</div>
    <div class="levels"><div><span>지지선</span><strong>${escape(result.support || '확인 불가')}</strong></div><div><span>저항선</span><strong>${escape(result.resistance || '확인 불가')}</strong></div></div>
    <div class="result-section-title">판단의 근거</div>${list(result.reasons)}
    <div class="result-section-title">함께 살펴볼 위험</div>${list(result.risks, 'risk-list')}
    <div class="next-step"><h4>↗ 다음으로 확인할 것</h4><p>${escape(result.nextStep)}</p></div>
    <p class="invalidation">판단 무효화 조건 · ${escape(result.invalidation)}</p>
    <p class="result-disclaimer">판독 근거 수준은 수익 확률이 아닙니다. 이미지 촬영 이후의 시장 변화는 반영하지 않습니다.</p>
  </div>`;
  $('#copy-result').addEventListener('click', copyResult);
}
async function copyResult() {
  if (!currentResult) return;
  const r = currentResult;
  const text = `${demoVisible ? '[예시 · 실제 분석 아님]\n' : ''}Chart Signal | ${labels[r.signal]}\n${r.title}\n${r.summary}\n${r.sequence ? '신호 기록 (형성 / 최초 확인)\n' + r.sequence.events.map(e => e.label + ': ' + e.formation + ' / ' + e.confirmation + ' · ' + e.fact).join('\n') : ''}\n\n${r.patternStatus ? '패턴 점검: ' + r.pattern + '\n위치: ' + r.patternLocation + '\n' + r.patternEvidence.map(v => '- ' + v).join('\n') + '\n후속 확인: ' + r.confirmation + '\n' : ''}추세: ${r.trend}\n패턴: ${r.pattern}\n거래량: ${r.volume}\n지지선: ${r.support || '확인 불가'}\n저항선: ${r.resistance || '확인 불가'}\n\n${r.maEvidence ? '지표 점검\n' + r.indicatorSummary + '\n갭: ' + r.gapZone + '\n' + r.gapEvidence.join('\n') + '\n5기간: ' + r.ma5 + '\n20기간: ' + r.ma20 + '\n60기간: ' + r.ma60 + '\n120기간: ' + r.ma120 + '\n' + r.maEvidence.join('\n') + '\n볼린저\n' + r.bbEvidence.join('\n') + '\n\n' : ''}근거\n${r.reasons.map(v => '- ' + v).join('\n')}\n\n위험\n${r.risks.map(v => '- ' + v).join('\n')}\n\n다음 확인: ${r.nextStep}\n무효화 조건: ${r.invalidation}\n\n이미지 기반 참고 자료이며 수익을 보장하지 않습니다.`;
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
$('#sample-button').addEventListener('click', () => { if (!controller) renderResult(sample, true); });
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
      fileVersion++; image = entry.image; position = entry.position; $('#period').value = entry.period;
      for (const [id, selected] of [['#not-holding', position === 'none'], ['#holding', position === 'holding']]) { $(id).classList.toggle('selected', selected); $(id).setAttribute('aria-pressed', String(selected)); }
      $('#chart-preview').src = image; $('#file-name').textContent = '세션 기록의 차트 이미지'; $('#preview').hidden = false; $('#drop-zone').hidden = true; $('#analyze-button').disabled = false;
      $('#upload-status').hidden = true;
      renderResult(entry.result, false); error(); $('#history-dialog').close();
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
