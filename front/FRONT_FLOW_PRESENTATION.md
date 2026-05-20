# Front 발표 대본 (간단 버전)

안녕하세요. 프론트엔드 구조와 사용자 흐름을 간단히 설명드리겠습니다.

저희 프론트는 **Next.js App Router + TypeScript** 기반입니다.  
구조는 크게 `app`, `components`, `lib`, `types`로 나뉩니다.

- `app`: 페이지 라우팅, 서버 컴포넌트, API Route
- `components`: 화면 UI
- `lib`: API 통신, 인증, 도메인 로직
- `types`: 타입 정의

핵심 흐름은 다음과 같습니다.

## 1) 공통 Front Flow

사용자가 화면에서 액션을 수행하면,
**UI 컴포넌트 → lib API 클라이언트 → 백엔드 API** 순서로 요청이 전달됩니다.

이때 `lib/api.ts`의 axios 인터셉터가 쿠키의 토큰을 읽어
`Authorization` 헤더를 자동으로 붙입니다.

## 2) 인증/권한 Flow

로그인 후 토큰은 `auth-storage`, `accessToken` 쿠키에 저장됩니다.  
`proxy.ts`에서 역할 기반 라우트 가드를 수행해
`admin`, `hr`, `interviewer` 경로 접근을 제어합니다.

## 3) 면접관 초대 Flow

HR이 메일 발송 → 면접관이 초대 링크 접속  
`/interviewer/invite?token=...`에서 초대 수락 API 호출  
토큰 저장 후 `/interviewer` 화면으로 이동합니다.

## 4) 메일 발송 Flow

HR 메일 작성 모달에서 발송 클릭 시  
`POST /api/interviewers/{id}/email`(Next API Route) 호출  
백엔드 초대 링크 생성 후 **Nodemailer SMTP**로 메일을 발송합니다.

정리하면, 저희 프론트는
**도메인 분리 구조 + 토큰 기반 인증 + 역할 기반 접근 제어**를 중심으로,
실제 업무 흐름(HR 초대/면접관 수락/면접 진행)에 맞춰 설계되어 있습니다.

## 회고

### keep
- App Router 기준으로 `app / components / lib / types` 분리를 유지한 점
- 인증/권한 흐름을 `proxy.ts`와 API 인터셉터로 공통 처리한 점
- HR-면접관 초대/수락 플로우를 실제 사용자 흐름 기준으로 연결한 점

### problem
- 토큰 타입(`user_access` vs `interviewer_access`)과 API 경로 권한이 어긋나 401이 발생했던 점
- 실패 시 목업 fallback이 실제 에러를 가려 디버깅이 늦어진 점
- 응답 키(`access_token`/`accessToken`) 불일치로 토큰 저장이 누락되던 점

### try
- 토큰 타입별로 호출 가능한 API 경로를 명확히 분리하고 문서화
- 개발 단계에서 인증 관련 API는 fallback 없이 실패를 바로 노출
- snake_case/camelCase 응답 정규화를 API 클라이언트 공통 규칙으로 적용
