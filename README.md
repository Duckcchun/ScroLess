# ScroLess (MVP)

쇼핑몰의 긴 통이미지 상세페이지에서, 원하는 정보(사이즈·착용샷·소재·세탁)로 즉시 이동하게 해주는 크롬 확장 프로그램입니다.

이 버전은 **MVP 스캐폴딩**으로, 실제 AI 분석 대신 mock 데이터를 사용해 UI와 스크롤 이동 흐름을 검증합니다.

## 현재 담긴 기능

- **플로팅 스마트 인덱스**: 화면 우측에 정보 구역 이동 버튼 + 브랜드 헤더/접기 토글
- **부드러운 스크롤 이동**: 인덱스 버튼 클릭 시 해당 구역으로 이동
- **핵심 정보 요약 칩**: 화면 상단에 총기장·계절감·핏·혼용률 등 해시태그 칩 표시
- **접근성 텍스트**: 스크린 리더용 상품 정보 텍스트 제공 (원본 이미지는 수정하지 않음)
- **정교한 이미지 수집**: 광고/추천/리뷰 노이즈 제외, 사이트별 셀렉터 + 범용 휴리스틱
- **lazy loading 대응**: data-src/srcset 해석 + 스크롤 유발형 강제 로드
- **실제 AI 분석**: 백엔드(Gemini) 연동, 결과 캐싱, 분석 중/실패 상태 UI

## 폴더 구조

```
scroless/
├── manifest.json           # 크롬 확장 설정 (Manifest V3)
├── icons/                  # 확장 아이콘 (16/48/128px) + 원본 SVG
├── src/
│   ├── config.js           # 백엔드 주소 / useMockOnly 설정
│   ├── collect.js          # 상세이미지 수집 (노이즈 제외 + lazy 대응)
│   ├── mock-data.js        # 가짜 분석 데이터 (백엔드 미사용/실패 시 폴백)
│   ├── content.js          # UI 주입 · 스크롤 이동 · 칩 · 상태 UI · 접근성
│   └── styles.css          # CSS 변수 기반 스타일 (키비주얼은 :root 변수만 교체)
├── server/                 # 백엔드 (Gemini 분석 + 캐싱)
│   ├── index.js            # Express 서버 (/analyze, /health)
│   ├── gemini.js           # Gemini 호출 + 재시도
│   ├── analysis-schema.js  # 분석 프롬프트 + 출력 스키마
│   ├── cache.js            # TTL 인메모리 캐시
│   ├── Dockerfile          # 컨테이너 배포용
│   └── DEPLOY.md           # 배포 가이드
├── test/
│   ├── sample-product.html # 동작 확인용 긴 상세페이지
│   ├── ui-preview.html     # 확장 없이 UI/키비주얼 미리보기
│   ├── collect-test.html   # 수집 로직 테스트 픽스처
│   └── collect.test.mjs    # 수집 로직 자동 테스트 (npm test)
└── README.md
```

## 로컬에서 실행하는 방법

1. 크롬 주소창에 `chrome://extensions` 입력
2. 우측 상단 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램을 로드합니다** 클릭
4. 이 `scroless` 폴더 선택
5. `test/sample-product.html` 파일을 크롬에서 열기
   - 파일 탐색기에서 더블클릭하거나, `file://` 경로로 직접 열면 됩니다.
6. 우측에 스마트 인덱스, 상단에 요약 칩이 뜨는지 확인하고, 인덱스 버튼을 눌러 스크롤 이동을 확인하세요.

> `matches`가 `<all_urls>`로 되어 있어 모든 페이지에서 동작합니다. 실제 서비스에서는
> 지원 쇼핑몰 도메인으로 좁히고, mock 데이터 대신 실제 분석 결과를 연결하면 됩니다.

## 실제 AI 분석 연결 (백엔드)

확장 프로그램은 상세이미지를 수집해 백엔드(`/analyze`)로 보내고, 백엔드가 Gemini로
분석해 `{ zones, chips }` JSON을 돌려줍니다. API 키는 백엔드에서만 관리하므로
확장 프로그램(클라이언트)에는 키가 노출되지 않습니다.

### 백엔드 실행 방법

```bash
cd scroless/server
cp .env.example .env      # 그리고 .env 안의 GEMINI_API_KEY 를 채우세요
npm install
npm start                 # http://localhost:8787 에서 실행
```

- 키가 준비됐으면 `src/config.js` 의 `useMockOnly` 를 `false` 로 바꾸세요.
  그러면 확장 프로그램이 mock 대신 실제 백엔드 분석을 사용합니다.
- 백엔드가 꺼져 있거나 분석에 실패하면 자동으로 mock 데이터로 폴백합니다.

### 모델 선택 참고

- 기본 모델은 `gemini-3.6-flash` 입니다. **신규 API 계정은 Gemini 3.x 세대만 사용 가능**합니다
  (2.5 계열은 신규 사용자 접근 불가). 모델은 `.env` 의 `GEMINI_MODEL` 로 바꿀 수 있습니다.
- 계정에서 쓸 수 있는 모델 목록은 다음으로 확인합니다:
  `GET https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY`
- 일시적 과부하(503)에 대비해 백엔드는 지수 백오프 재시도를 수행합니다.

> 실제 호출 검증 완료: 사이즈표 이미지를 분석해 zones(size)와
> chips(소재/핏/계절감/총장 72cm·M기준)를 정확히 추출하는 것을 확인했습니다.

### 구조

```
scroless/server/
├── index.js            # Express 서버, POST /analyze 엔드포인트
├── gemini.js           # 이미지 다운로드 + Gemini 호출
├── analysis-schema.js  # 분석 프롬프트 + 출력 JSON 스키마
├── package.json
└── .env.example        # 환경변수 예시 (.env 로 복사해 사용)
```

> API 키는 `.env` 에만 넣으세요. `.env` 는 `.gitignore` 로 커밋되지 않습니다.
> 키를 코드/채팅/커밋에 절대 노출하지 마세요.

## 분석 결과 캐싱

같은 상품(= 같은 상세이미지 URL 집합)을 다시 분석 요청하면 Gemini 재호출 없이
캐시된 결과를 즉시 반환합니다.

- 구현: `server/cache.js` (SHA1 키 + TTL 24시간 인메모리 캐시, 상한 500개)
- 응답에 `cached: true/false` 가 포함됩니다.
- `GET /health` 에서 캐시 상태를 확인할 수 있습니다.
- 검증: 동일 요청 재호출 시 응답이 약 23초 → 0.02초로 단축되는 것을 확인했습니다.

## 키비주얼 (브랜드 톤)

- 브랜드 톤은 딥 틸/블루 계열입니다. 모든 값은 `src/styles.css` 의 `:root` 변수로
  정의되어 있어, 톤을 바꾸려면 그 변수 값만 교체하면 전체가 반영됩니다.
- 확장 없이 UI를 미리 보려면 `test/ui-preview.html` 을 브라우저에서 여세요.
  (인덱스 로고, 접기/펼치기, 요약 칩의 브랜드 색이 적용된 모습을 확인할 수 있습니다.)

## 다음 단계 (예정)

- 실제 쇼핑몰에서의 E2E 테스트 및 사이트별 셀렉터 보강
- 스크롤 유발 lazy loading(placeholder div 치환형) 대응
- 캐시를 외부 저장소(Redis 등)로 전환 (다중 서버/영속성 필요 시)
