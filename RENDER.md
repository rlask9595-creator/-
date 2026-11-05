# Render 배포

GitHub 저장소: https://github.com/rlask9595-creator/-

Render에서 **New → Web Service → Git Provider**를 선택하고 위 저장소를 연결합니다. Static Site가 아니라 Web Service를 선택하세요.

| 항목 | 입력값 |
| --- | --- |
| Name | `chart-signal` (변경 가능) |
| Branch | `main` |
| Language / Runtime | `Node` |
| Root Directory | **빈칸** (저장소 최상위) |
| Build Command | `npm ci && npm test` |
| Start Command | `npm start` |
| Health Check Path | `/api/status` |

`/workspace/-`는 개발 환경의 경로이므로 Root Directory에 입력하지 않습니다.

## 환경변수

| 이름 | 값 | 용도 |
| --- | --- | --- |
| `NODE_VERSION` | `24.22.1` | 개발 환경에서 검증한 Node 버전. `.node-version`에도 지정되어 있습니다. |
| `NODE_ENV` | `production` | 운영 환경 표시 |
| `CHART_API_KEY` | 본인의 OpenAI API 키 | 서버에서 실제 차트 이미지를 분석할 때 사용. Render Environment에서만 입력하세요. |

`PORT`는 **직접 추가하지 마세요.** Render가 제공하는 값을 앱이 읽고 `0.0.0.0`에서 수신합니다.

`CHART_API_KEY`가 없으면 앱의 예시 화면은 동작하고 실제 분석은 앱의 '분석 연결 설정'에 본인의 키를 입력해 사용할 수 있습니다. 기존 `OPENAI_API_KEY`도 지원하지만 두 키를 중복 등록할 필요는 없습니다. 서버 키가 있으면 브라우저 입력 키보다 우선합니다.

키는 GitHub, render.yaml, README, ZIP에 넣지 않습니다. `render.yaml`의 `sync: false`는 Render에서 사용자가 값을 입력하도록 지정하는 설정이며 실제 키 값이 아닙니다.

## 배포 후 확인

1. Deploy Web Service를 실행합니다.
2. Render가 제공한 HTTPS 서비스 주소를 엽니다.
3. `/api/status`에서 JSON 응답을 확인합니다. `configured: true`는 서버 키가 존재한다는 뜻이며 키의 유효성·잔액·분석 품질 확인 결과는 아닙니다.
4. 차트를 캡처해 Ctrl+V 또는 ⌘V로 붙여넣고 분석합니다. 실제 분석에는 OpenAI API 사용 권한과 잔액이 필요하며 API 요금이 발생합니다.
5. 환경변수 변경 시 Render의 저장·재배포 절차를 완료합니다.

공개 URL의 서버 키를 사용하는 분석 요청은 모두 해당 키 계정에 과금됩니다. 이 앱에는 사용자 로그인과 사용자별 사용량 제한이 없으므로 개인용으로 확인할 때는 서버 키를 비워두고 앱의 연결 설정에서 키를 입력하는 방법도 사용할 수 있습니다. 브라우저 키는 새로고침 시 삭제됩니다.

Free 인스턴스는 서비스 중지·재시작 및 이용 한도가 있을 수 있으므로 생성 화면의 현재 조건을 확인하세요. 이 작업에서 Render 서비스를 실제로 생성하거나 배포하지는 않았습니다.

## Blueprint 방식

저장소의 `render.yaml`로 **New → Blueprint** 배포도 가능합니다. 이 파일은 Node 버전, 빌드/시작 명령, 상태 확인 경로를 동일하게 지정합니다. API 키 값은 Render 화면에서 입력합니다.

## 확인된 범위

배포 명령을 개발 환경에서 실행하여 디자인 유지 검사와 서버 테스트를 확인했습니다. Render 런타임과 실제 API 키를 통한 실호출은 배포 후 별도로 확인해야 합니다.

## 가격 순서 판독 버전 확인

기존 Render 서비스가 이 저장소의 `main`에 연결되어 있고 Auto-Deploy가 켜져 있으면 push 후 새 배포가 시작됩니다. 꺼져 있으면 해당 서비스에서 **Manual Deploy → Deploy latest commit**을 실행합니다. 새 서비스를 만들 필요는 없습니다.

서비스 주소 뒤에 `/api/status`를 붙여 `policyVersion: "price-sequence-v4"`과 `deploymentCommit`이 GitHub 최신 커밋과 같은지 확인합니다. 이 응답에는 API 키 값이 포함되지 않습니다. Render의 Deploy 상태가 Live인지도 확인합니다.

화면을 새로고침한 다음 차트를 다시 분석하세요. 기존 세션의 분석 기록은 이전 결과이므로 새 정책으로 자동 재분석되지 않습니다. 중기·1~3개월을 선택하고 같은 차트를 미보유/보유 중으로 각각 분석해 상단 관점과 행동 구분을 확인합니다. 규칙·한계 및 테스트 내역은 `docs/price-sequence.md`를 참고하세요.

과거 시점 검증은 분석 목적에서 선택합니다. 기준일이 이미지 중간이면 범위 편집으로 이후 봉과 미래 정보를 가린 후 분석하세요. 최초 판단 고정 → 이후 차트 분석 → 사후 비교 순서입니다. 고정 판단은 해당 브라우저에 저장되므로 JSON 내보내기로 보관할 수 있습니다. 구현과 검증 한계는 `docs/historical-validation-v4.md`를 참고하세요.
