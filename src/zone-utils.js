/**
 * ScroLess zone 위치 보정/정렬 유틸
 *
 * 통이미지(하나의 긴 이미지) 안에 여러 정보 구역이 뭉쳐 있을 때,
 * 인덱스 버튼이 "실제 화면 세로 순서"대로, 그리고 "서로 구분되는 위치"로
 * 이동하도록 zone 목록을 다듬는 순수 함수들이다.
 *
 * DOM/브라우저에 의존하지 않으므로 단독으로 테스트할 수 있다.
 * 브라우저에서는 window.SCROLESS_zoneUtils 로 노출되고,
 * Node(테스트)에서는 ESM export 로 가져다 쓴다.
 */
(function (root) {
  "use strict";

  /**
   * 같은 통이미지(imageIndex) 안에 여러 구역이 있을 때 verticalRatio 를 보정한다.
   *
   * 보정 규칙(값을 지어내지 않는 선에서 최소한만):
   *  1. 같은 이미지에 구역이 1개면 손대지 않는다.
   *  2. 같은 이미지에 여러 구역인데 verticalRatio 가 비어있거나 서로 구분이
   *     안 될 만큼(간격 < 0.05) 뭉쳐 있으면, 원본 순서를 유지한 채
   *     이미지 높이에 균등 분포시킨다. (예: 3개 → 0.167, 0.5, 0.833)
   *  3. 값이 이미 서로 충분히 벌어져 있으면 원래 추정을 그대로 존중한다.
   *
   * 입력 배열을 제자리(in place)로 수정하고 그대로 반환한다.
   * @param {Array<{imageIndex?:number, verticalRatio?:number}>} zones
   * @returns {Array}
   */
  function normalizeVerticalRatios(zones) {
    if (!Array.isArray(zones)) return zones;

    // imageIndex 별로 묶는다. (원본 순서 인덱스도 함께 보관)
    const groups = new Map();
    zones.forEach((zone, i) => {
      const idx = typeof zone.imageIndex === "number" ? zone.imageIndex : -1;
      if (!groups.has(idx)) groups.set(idx, []);
      groups.get(idx).push({ zone, i });
    });

    groups.forEach((members) => {
      if (members.length <= 1) {
        return; // 규칙 1: 단독 구역은 그대로
      }
      // 원본 등장 순서를 세로 순서의 근사로 사용
      members.sort((a, b) => a.i - b.i);

      const ratios = members.map((m) =>
        typeof m.zone.verticalRatio === "number" &&
        m.zone.verticalRatio >= 0 &&
        m.zone.verticalRatio <= 1
          ? m.zone.verticalRatio
          : null
      );

      // 값이 하나라도 비었거나, 인접 구역 간 간격이 너무 좁으면 뭉친 것으로 본다.
      const hasMissing = ratios.some((r) => r === null);
      let tooClose = false;
      for (let k = 1; k < ratios.length; k++) {
        if (ratios[k] !== null && ratios[k - 1] !== null) {
          if (Math.abs(ratios[k] - ratios[k - 1]) < 0.05) {
            tooClose = true;
            break;
          }
        }
      }

      if (hasMissing || tooClose) {
        // 규칙 2: 이미지 높이에 균등 분포. 맨 위/맨 아래에 딱 붙지 않게 여백을 둔다.
        const n = members.length;
        members.forEach((m, k) => {
          m.zone.verticalRatio = +((k + 0.5) / n).toFixed(3);
        });
      }
      // 규칙 3: 그 외에는 원본 추정 유지
    });

    return zones;
  }

  /**
   * zone 을 실제 페이지 세로 순서로 정렬한다.
   * imageIndex(어느 이미지) 순, 같은 이미지 안에서는 verticalRatio 순.
   * imageIndex 가 없는 항목은 맨 뒤로 보낸다. 동률이면 원본 순서를 유지한다.
   * (원본 배열은 건드리지 않고 새 배열을 반환)
   * @param {Array<{imageIndex?:number, verticalRatio?:number}>} zones
   * @returns {Array}
   */
  function sortZonesByPosition(zones) {
    if (!Array.isArray(zones)) return [];
    return zones
      .map((zone, i) => ({ zone, i }))
      .sort((a, b) => {
        const ai = typeof a.zone.imageIndex === "number" ? a.zone.imageIndex : 1e9;
        const bi = typeof b.zone.imageIndex === "number" ? b.zone.imageIndex : 1e9;
        if (ai !== bi) return ai - bi;
        const ar = typeof a.zone.verticalRatio === "number" ? a.zone.verticalRatio : 0;
        const br = typeof b.zone.verticalRatio === "number" ? b.zone.verticalRatio : 0;
        if (ar !== br) return ar - br;
        return a.i - b.i; // 안정 정렬 (원본 순서 유지)
      })
      .map((entry) => entry.zone);
  }

  const api = { normalizeVerticalRatios, sortZonesByPosition };

  // 브라우저 전역 노출 (content.js 에서 사용)
  if (root && typeof root === "object") {
    root.SCROLESS_zoneUtils = api;
  }

  // Node/ESM (테스트)에서 import 할 수 있게 노출
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : this);
