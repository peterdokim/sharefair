# SKILL.md 안내

이 문서는 저장소 루트에 있는 `SKILL.md` 파일이 무엇이고, 누가, 언제, 어떻게 사용하는지를 한국어로 설명합니다.

## SKILL.md란 무엇인가

`SKILL.md`는 Claude Code가 인식하는 "스킬(skill)" 정의 파일입니다. 일반적인 마크다운 문서와 달리, 파일 맨 위에 YAML 프론트매터(`name`, `description`)가 들어 있으며, 본문은 이 코드베이스를 다룰 때 따라야 할 규칙과 구조를 모델에게 전달합니다.

이 저장소의 `SKILL.md`는 `sharefair-trip-settler`(코드명 "Smart Contract") 프로젝트, 즉 여행 경비를 공유하고 정산하는 Next.js 16 App Router 애플리케이션을 대상으로 작성되어 있습니다.

## 어떤 내용이 들어 있는가

- 프로젝트의 한 줄 요약과 트리거 조건(어떤 요청이 들어왔을 때 이 스킬을 적용해야 하는지)
- 디렉터리 구조 요약 (`app/`, `components/`, `lib/`, `lib/server/`, `db/`, `test/`)
- 듀얼 모드 스토리지 런타임 설명
  - `DATABASE_URL`이 설정되면 Neon Postgres, 아니면 `local-data-store.js` 파일 폴백
  - Upstash Redis 자격 증명이 있으면 Upstash, 아니면 인메모리 맵
- 코드 컨벤션
  - ESM, TypeScript 미사용, React 컴포넌트는 `.jsx`
  - `@/` 임포트 별칭은 저장소 루트를 가리킴
  - `lib/server/` 모듈은 `import "server-only";`로 시작
  - ID는 `randomUUID()` + 접두사(`trip_`, `exp_`, `pay_` 등)
  - 금액은 항상 정수 KRW(원 단위), 표시할 때만 `formatCurrency` 사용
  - 라우트 핸들러는 `Error`에 `.status`를 붙여 던지고, `NextResponse.json({ error }, { status })`로 응답
  - 클라이언트 상태 변경은 `useTripStore()`를 통해서만 수행
- 실행 명령어 (`npm run dev`, `npm run build`, `npm run lint`, `npm test`, `npm run test:watch`)
- 자주 발생하는 변경 패턴 (새 필드 추가, 새 API 라우트, 새 폼, 결제/정산 상태 변경 시 점검 사항)

## 누가, 언제 사용하는가

- 사용자: Claude Code(또는 호환되는 다른 에이전트). 사람이 직접 읽어도 코드베이스 온보딩 문서로 도움이 됩니다.
- 시점: 이 저장소에서 코드를 추가, 수정, 리팩터링하기 직전. 특히 다음 영역의 작업을 시작할 때 자동으로 참조됩니다.
  - 여행(trip), 참가자(participant), 경비(expense), 라인 아이템 분할
  - 결제(payment) 및 정산 요청(settlement request)
  - 리마인더 크론(cron) 작업
  - 영수증 PDF 추출
  - Neon/Upstash/로컬 파일 스토리지 런타임

## 어떻게 활용되는가

Claude Code는 작업을 시작하기 전에 `description` 필드를 읽어 현재 사용자 요청과 관련 있는 스킬인지 판단합니다. 매칭되면 본문에 적힌 규칙을 따라 코드를 작성하므로, 다음과 같은 규칙 위반이 줄어듭니다.

- 클라이언트 컴포넌트에서 `lib/server/` 모듈을 직접 import 하는 실수
- 금액을 실수형(float)으로 저장하는 실수
- `db/schema.sql`만 수정하고 `storage-runtime.js`의 `createSchema`를 누락하는 실수
- 스토리지 분기(Postgres 경로와 로컬 파일 경로) 중 한쪽만 업데이트하는 실수

## 수정할 때 주의할 점

- 프론트매터의 `name`과 `description`은 트리거 정확도에 직접 영향을 주므로 신중하게 변경하세요.
- 디렉터리 구조나 컨벤션이 실제 코드와 어긋나지 않도록 코드 변경과 함께 갱신하세요.
- 본문에 새 README나 문서 파일을 함부로 추가하지 말라는 규칙이 들어 있습니다. 이 규칙은 코드 작업 시 적용되며, 이 `README.md`처럼 사용자가 명시적으로 요청한 문서는 예외입니다.

## 관련 파일

- `SKILL.md` — 스킬 정의 본문
- `db/schema.sql` — 데이터베이스 스키마 원본
- `lib/server/storage-runtime.js` — 스키마 부트스트랩 및 스토리지 선택 로직
- `package.json` — 실행 스크립트 및 의존성 목록
