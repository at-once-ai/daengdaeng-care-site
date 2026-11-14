# daengdaeng-care-site

브랜드 **at~once** · 서비스 **daengdaeng-care**의 정적 사이트입니다. GitHub Pages로 `https://daengdaeng.at-once.kr`에 게시합니다.

이 저장소는 공개입니다. 비밀값·접속 문자열·개인정보·실제 보호자 기록을 넣지 않습니다.

| 경로 | 역할 |
|---|---|
| `/` | 서비스 소개(준비 중) |
| `/privacy/` | 개인정보처리방침(준비 중, 출시 전 검토한 본문을 게시) |
| `/account-deletion/` | 계정 삭제(탈퇴) 요청 방법·지워지는 것·남는 것·30일 안내(구글 플레이 계정 삭제 요구). 앱 없이 요청하는 메일 주소 포함 |
| `/auth/callback` (`auth/callback.html`) | 로그인 복귀 페이지(끝에 / 없이 바로 제공돼야 앱·App Link 경로와 맞는다). Neon Auth가 붙여 준 확인값의 형식을 검사한 뒤 앱 주소로만 넘긴다 |
| `/.well-known/assetlinks.json` | Android App Link 설정. 지금은 개발 빌드(`com.atonce.daengdaengcare.dev`, 공개된 React Native 기본 개발용 서명)만 등록. 출시 때 출시용 패키지·서명 지문으로 바꾼다 |
| `.nojekyll` | GitHub Pages가 점(.)으로 시작하는 폴더(`.well-known`)를 무시하지 않게 한다 |
| `CNAME` | 자체 도메인(`daengdaeng.at-once.kr`) |

앱 코드와 결정 기록은 비공개 저장소 `daengdaeng-care`에 있습니다(PRD DEC-03, 2026-11-11 자체 도메인 결정).

복귀 페이지의 스크립트를 고치면 `Content-Security-Policy`의 `sha256-…` 값도 다시 계산해야 합니다(스크립트 본문의 SHA-256, base64).
