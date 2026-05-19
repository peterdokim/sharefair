# Sharefair — Trip Expense Settler

> 여행 경비를 공유·정산하고, 미응답 정산은 자동 이메일 리마인더까지 처리하는 모바일 우선 Next.js 16 풀스택 앱

## 🎬 데모 영상

[전체 데모 (Google Drive, 5분 43초)](https://drive.google.com/file/d/1KjYUVX3wxh7zKIbJl-8JV6ZrKTq2sjtO/view?usp=sharing)

---

## 무엇을 하는 앱인가

여행 한 번에 동행자들이 여러 번 나눠서 결제한 경비를, 누가 누구에게 얼마를 정산해야 하는지 자동으로 계산하고, 결제 인증과 이메일 리마인더까지 처리합니다.

핵심 흐름:

1. **여행 + 참가자 + 경비 등록** — 경비는 라인 아이템 단위로 분할
2. **영수증 PDF 업로드** → `pdf-parse` 로 라인 아이템 자동 추출
3. **잔액 자동 계산** → 누가 누구에게 얼마를 보내야 하는지
4. **정산 요청 발송** → Mock 결제 게이트웨이 (인증 / 콜백 / 웹훅 / step-up email challenge)
5. **자동 리마인더** → 정산 미응답 시 단계별 이메일 (initial → 3시간 → 15분)

통화는 KRW이며, 모든 금액은 정수 minor units로 저장해 부동소수 오차를 원천 차단합니다.

---

## 주요 기능

### 1. 라인 아이템 단위 경비 분할
- 한 영수증 안에 여러 항목이 있어도 각 항목별로 분담자를 다르게 설정 가능
- 잔액은 `lib/trip-helpers.js` 의 순수 함수로 계산 (서버·클라이언트 공용)

### 2. 영수증 PDF → 자동 라인 아이템 추출
- `app/api/receipts/extract/` 라우트가 PDF 업로드를 받아 `pdf-parse` 로 텍스트 추출
- 라인 아이템 후보를 파싱해 폼에 자동 채움

### 3. Mock 결제 + Step-up 인증
- `app/api/payments/{create,callback,webhook,step-up}/` — 실 결제 PG 흐름과 동일한 단계
- `app/api/mock-provider/authorize/` — 자체 mock provider (개발용)
- step-up 단계에서 이메일 challenge 발송

### 4. Cron 기반 자동 리마인더
- `app/api/cron/settlement-reminders/` — 미응답 정산 요청을 시간차로 재발송 (initial / 3h / 15m)
- 이메일은 Resend API로 전송

### 5. 듀얼 모드 스토리지 (환경변수 없이도 동작)
| 리소스 | 환경변수 설정 시 | 폴백 |
|---|---|---|
| Postgres | `DATABASE_URL` (Neon serverless) | `local-data-store.js` 파일 저장소 |
| Redis | `UPSTASH_REDIS_REST_URL` + `_TOKEN` | 인메모리 맵 |

→ 별도 설정 없이 `npm run dev` 만으로 풀스택 데모 동작

---

## 기술 스택

- **Frontend**: Next.js 16 App Router (JSX, no TypeScript), React Context + `useReducer` 스토어
- **Backend**: Next.js Route Handlers, `server-only` 모듈 분리
- **Database**: Neon serverless Postgres (또는 파일 폴백)
- **Cache/Session**: Upstash Redis (또는 인메모리 폴백)
- **Email**: Resend
- **PDF 추출**: pdf-parse
- **테스트**: Vitest (서버·클라이언트 모듈 단위 테스트, `*.test.js` 콜로케이트)
- **배포**: Vercel

---

## 프로젝트 구조

```
.
├── app/
│   ├── page.jsx                          # 여행 목록 (홈)
│   ├── trip/new/, trip/[id]/             # 여행 상세·생성·편집
│   ├── trip/[id]/expense/                # 경비 추가
│   ├── trip/[id]/payments/               # 결제 진행
│   ├── trip/[id]/settle/                 # 정산 요청
│   ├── trip/[id]/balances/               # 잔액 조회
│   └── api/
│       ├── trips/                        # 여행 CRUD + 중첩 리소스
│       ├── payments/{create,callback,webhook,step-up}/
│       ├── mock-provider/authorize/      # 가짜 결제 게이트웨이
│       ├── cron/settlement-reminders/    # 정산 리마인더 cron
│       └── receipts/extract/             # 영수증 PDF → 라인 아이템
├── components/                            # 클라이언트 컴포넌트 + forms/
├── lib/
│   ├── store.jsx                          # 클라이언트 trip store (Context + Reducer)
│   ├── trip-helpers.js                    # 순수 함수: formatCurrency, getExpenseShares, balance math
│   └── server/                            # server-only 저장소·이메일·결제 게이트웨이
├── db/schema.sql                          # 정본 스키마
└── test/                                  # Vitest 셋업 + server-only 스텁
```

---

## 설치 & 실행

```bash
git clone https://github.com/peterdokim/sharefair.git
cd sharefair
npm install
npm run dev
# http://localhost:3000
```

환경변수 없이도 로컬 파일 저장소 + 인메모리 캐시로 풀스택 동작합니다.

### 선택 환경변수 (`.env.local`)
```env
DATABASE_URL=postgres://...                # Neon serverless Postgres
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
RESEND_API_KEY=...                         # 이메일 리마인더
```

### 명령어
```bash
npm run dev          # 개발 서버
npm run build        # 프로덕션 빌드
npm run lint         # ESLint (eslint-config-next/core-web-vitals)
npm test             # Vitest 단위 테스트
npm run test:watch
```

---

## 라이선스

MIT
