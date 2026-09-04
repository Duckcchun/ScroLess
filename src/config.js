/**
 * ScroLess 확장 프로그램 설정
 *
 * 백엔드 주소 등 환경별 설정을 모아둔다.
 * manifest.json 의 content_scripts.js 목록 맨 앞에 로드된다.
 *
 * [배포 시 체크리스트]
 *  1. backendUrl 을 배포된 서버 주소(https://...)로 교체
 *  2. manifest.json 의 host_permissions 에 그 주소를 추가
 *     (예: "https://api.scroless.example/*")
 *  3. useMockOnly 를 false 로 설정
 */
window.SCROLESS_CONFIG = {
  // 백엔드 주소.
  //  - 로컬 개발: "http://localhost:8787"
  //  - 배포:      "https://scroless-backend.onrender.com"  (host_permissions 도 함께 수정)
  backendUrl: "https://scroless-backend.onrender.com",

  // true 이면 백엔드를 호출하지 않고 mock 데이터만 사용한다.
  // 실제 배포 백엔드를 사용하므로 false.
  useMockOnly: false,
};
