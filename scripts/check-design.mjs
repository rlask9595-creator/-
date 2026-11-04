import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const baseline = JSON.parse(await readFile(new URL('design/baseline/manifest.json', root), 'utf8'));
const changed = [];
for (const [name, expected] of Object.entries(baseline)) {
  const [file, part] = name.split('#');
  let content = await readFile(new URL(file, root));
  if (part === 'renderResult') {
    const source = content.toString();
    if (!source.includes('function renderResult(result, demo) {') || !source.includes('async function copyResult()')) {
      changed.push(name); continue;
    }
    content = source.split('function renderResult(result, demo) {')[1].split('async function copyResult()')[0];
  }
  if (createHash('sha256').update(content).digest('hex') !== expected) changed.push(name);
}
if (changed.length) {
  console.error('디자인 기준 변경 감지:\n' + changed.join('\n') + '\nAGENTS.md를 확인하세요. 사용자의 명시적인 디자인 변경 요청 없이 기준 파일을 갱신하거나 검사를 우회하지 마세요.');
  process.exitCode = 1;
} else console.log('PASS: 승인된 화면의 HTML, CSS, 폰트, 예시 이미지 및 결과 템플릿 유지');
