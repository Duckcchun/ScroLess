# ScroLess 백엔드 배포 가이드

이 백엔드는 상세이미지 URL을 받아 Gemini로 분석하고 `{zones, chips}` JSON을 반환하는
간단한 Node/Express 서버입니다. API 키를 서버에서만 관리하므로, 확장 프로그램(클라이언트)에는
키가 노출되지 않습니다.

## 배포 전 준비

- Node.js 20 이상
- Gemini API 키 (Google AI Studio에서 발급)
- 환경변수 3개: `GEMINI_API_KEY`, `GEMINI_MODEL`, `PORT`

## 환경변수

| 변수 | 설명 | 예시 |
|---|---|---|
| `GEMINI_API_KEY` | Gemini API 키 (필수) | `AIza...` |
| `GEMINI_MODEL` | 사용할 모델 | `gemini-3.6-flash` |
| `PORT` | 리슨 포트 (플랫폼이 주입하기도 함) | `8787` |

> 배포 플랫폼에서는 `.env` 파일 대신 플랫폼의 "환경변수/Secrets" 설정에 넣으세요.
> 키를 저장소에 커밋하지 마세요. (`.env` 는 이미 `.gitignore` 처리됨)

## 플랫폼별 요약

일반적인 컨테이너/PaaS 플랫폼(Cloud Run, Render, Railway, Fly.io 등) 공통 절차:

1. 저장소 연결 또는 컨테이너 이미지 빌드
2. 빌드/시작 명령 설정
   - 설치: `npm ci` (또는 `npm install`)
   - 시작: `npm start`
3. 환경변수 등록: `GEMINI_API_KEY`, `GEMINI_MODEL`
4. 포트: 대부분 플랫폼이 `PORT` 를 주입하므로 코드가 `process.env.PORT` 를 사용하도록
   되어 있는지 확인 (본 서버는 이미 그렇게 되어 있음)
5. 배포 후 헬스체크: `GET https://<배포주소>/health`
   - `apiKeyConfigured: true` 인지 확인

## 배포 후 확장 프로그램 연결

1. `src/config.js` 의 `backendUrl` 을 배포된 주소(`https://...`)로 변경
2. `manifest.json` 의 `host_permissions` 에 그 주소 추가
   ```json
   "host_permissions": ["https://<배포주소>/*"]
   ```
3. `src/config.js` 의 `useMockOnly` 를 `false` 로 설정
4. 확장 프로그램 새로고침

## 운영 시 고려사항

- **CORS**: 현재 모든 오리진을 허용(`cors()`)합니다. 운영에서는 확장 프로그램 오리진
  (`chrome-extension://<확장ID>`)으로 제한하는 것을 권장합니다.
- **캐시**: 인메모리 캐시라 인스턴스마다 별도이고 재시작 시 사라집니다. 다중 인스턴스나
  영속성이 필요하면 Redis 등으로 교체하세요. (`server/cache.js` 만 교체하면 됨)
- **비용/한도**: 사용량이 늘면 Gemini API 요금과 rate limit을 모니터링하세요.
- **타임아웃**: 이미지가 많으면 분석에 수십 초가 걸릴 수 있으니 플랫폼의 요청 타임아웃을
  넉넉히 설정하세요.
