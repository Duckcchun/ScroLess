/**
 * ScroLess 분석 프롬프트 + 출력 JSON 스키마
 *
 * 상세이미지(들)를 Gemini에 주고, 확장 프로그램이 그대로 쓸 수 있는
 * { zones, chips } 형태의 구조화된 JSON을 받도록 설계한다.
 *
 * 중요한 설계 원칙 (기능명세서 규칙 반영):
 *  - "근거 있는 정보만" 추출한다. 추측/구매추천/임의 평가는 금지.
 *  - 인식이 불확실한 내용은 결과에서 제외한다.
 *  - 스크롤 좌표(pageY)는 LLM이 정확히 모르므로 여기서 요구하지 않는다.
 *    각 zone에 imageIndex(몇 번째 이미지인지)만 받고, 실제 Y좌표는
 *    확장 프로그램 코드가 해당 이미지의 DOM 위치로 계산한다.
 */

// 정보 구역 유형 (기능명세서: 사이즈/착용샷/소재/세탁)
export const ZONE_TYPES = ["size", "wearing", "material", "wash"];

/**
 * Gemini 구조화 출력(responseSchema)에 사용할 JSON 스키마.
 * @google/genai 의 responseSchema 형식(OpenAPI 스타일)을 따른다.
 */
export const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    zones: {
      type: "array",
      description: "상세이미지에서 인식한 정보 구역 목록",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ZONE_TYPES,
            description:
              "구역 유형: size(사이즈/실측표), wearing(착용샷), material(소재/디테일), wash(세탁/취급)",
          },
          label: {
            type: "string",
            description:
              "인덱스 버튼에 표시할 한국어 라벨 (예: '사이즈 및 실측표', '블랙 착용샷')",
          },
          imageIndex: {
            type: "integer",
            description:
              "이 구역이 발견된 이미지의 순번(0부터). 실제 스크롤 좌표는 확장 프로그램이 계산한다.",
          },
        },
        required: ["type", "label", "imageIndex"],
      },
    },
    chips: {
      type: "array",
      description:
        "스크롤 전 상단에 표시할 핵심 정보 요약. 근거가 명확한 정보만 포함한다.",
      items: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "정보 항목명 (예: 총기장, 계절감, 핏, 혼용률)",
          },
          value: {
            type: "string",
            description: "추출한 값 (예: '72cm', '세미오버핏', '코튼 100%')",
          },
          base: {
            type: "string",
            description:
              "값의 기준 (예: 'M 기준'). 수치 정보에서 기준 사이즈가 확인되면 채운다. 없으면 생략.",
          },
        },
        required: ["key", "value"],
      },
    },
  },
  required: ["zones", "chips"],
};

/**
 * 시스템/지시 프롬프트.
 * 이미지들과 함께 전달한다.
 */
export const ANALYSIS_INSTRUCTION = `너는 이커머스 상품 상세페이지의 "긴 통이미지"를 분석하는 도우미다.
전달된 이미지들은 한 상품 상세페이지를 위에서 아래로 자른 조각들이며, 배열 순서가 페이지의 세로 순서다.

다음 두 가지를 추출해 JSON으로만 응답하라.

1) zones: 각 이미지가 어떤 정보 구역인지 분류한다.
   - 유형은 size(사이즈/실측표), wearing(색상별 착용샷), material(소재/디테일 컷), wash(세탁/취급 주의사항) 중에서만 고른다.
   - label 은 사용자가 이해할 한국어로 짧게 쓴다. 착용샷이면 인식된 주요 색상을 라벨에 반영한다(예: "블랙 착용샷").
   - imageIndex 는 그 구역이 나타난 이미지의 순번(0부터)이다.
   - 위 4가지 유형에 해당하지 않거나 분석이 불가능한 이미지는 결과에서 제외한다.

2) chips: 스크롤 전에 보여줄 핵심 정보 요약이다.
   - 총기장, 계절감, 핏, 혼용률처럼 이미지에서 근거를 확인할 수 있는 정보만 넣는다.
   - 수치 정보에 기준 사이즈가 있으면 base 에 함께 담는다(예: base: "M 기준").
   - 추측하지 말라. 근거가 없거나 불확실하면 그 항목은 넣지 않는다.
   - 구매 추천이나 임의의 상품 평가는 절대 하지 않는다.

가격/주문/결제/고객 개인정보는 분석 대상이 아니다. 무시하라.
반드시 지정된 JSON 스키마 형식으로만 응답하라.`;
