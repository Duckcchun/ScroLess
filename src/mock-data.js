/**
 * ScroLess mock 분석 데이터
 *
 * 실제 서비스에서는 이 데이터를 상세이미지 OCR + 비전 분석 결과로 생성한다.
 * MVP 단계에서는 UI/스크롤 흐름을 먼저 검증하기 위해 가짜 데이터를 사용한다.
 *
 * - zones: 상세이미지에서 인식된 "정보 구역" 목록
 *   - type    : 구역 유형 (size | wearing | material | wash)
 *   - label   : 인덱스 버튼에 표시할 한국어 라벨
 *   - targetId: 테스트 페이지에서 이동 대상이 되는 DOM 요소 id
 *               (실제 서비스에서는 페이지 Y좌표를 사용)
 *
 * - chips: 스크롤 전에 상단에 표시할 핵심 정보 요약 칩
 *   - 근거가 있는 정보만 포함한다. (추측/구매추천 금지 규칙 반영)
 */
window.SCROLESS_MOCK = {
  zones: [
    { type: "size", label: "사이즈 및 실측표", targetId: "zone-size" },
    { type: "wearing", label: "블랙 착용샷", targetId: "zone-wearing-black" },
    { type: "wearing", label: "아이보리 착용샷", targetId: "zone-wearing-ivory" },
    { type: "material", label: "소재 및 디테일 컷", targetId: "zone-material" },
    { type: "wash", label: "세탁 및 취급 주의사항", targetId: "zone-wash" },
  ],
  chips: [
    { key: "총기장", value: "72cm", base: "M 기준" },
    { key: "계절감", value: "봄·가을" },
    { key: "핏", value: "세미오버핏" },
    { key: "혼용률", value: "코튼 100%" },
  ],
};
