/**
 * zone-utils.js 검증 (순수 로직, DOM 불필요)
 *
 * 통이미지 안에 여러 구역이 뭉쳐 있을 때
 *  - normalizeVerticalRatios: verticalRatio 보정
 *  - sortZonesByPosition: 실제 세로 순서 정렬
 * 이 올바른지 확인한다.
 *
 * 실행: node test/zone-utils.test.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// src/zone-utils.js 를 격리된 컨텍스트에서 실행해 API 를 얻는다.
// (브라우저 전역 노출 방식이므로 window 객체를 흉내 낸 뒤 주입한다.)
const src = readFileSync(join(__dirname, "../src/zone-utils.js"), "utf8");
const fakeWindow = {};
// zone-utils.js 는 (function(root){...})(window ?? this) 형태다.
// this 를 fakeWindow 로 바인딩해 root.SCROLESS_zoneUtils 가 채워지게 한다.
new Function(src).call(fakeWindow);
const { normalizeVerticalRatios, sortZonesByPosition } = fakeWindow.SCROLESS_zoneUtils;

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) {
    passed++;
    console.log("  ✅", name);
  } else {
    failed++;
    console.error("  ❌", name);
  }
}

console.log("[normalizeVerticalRatios]");

// 케이스 1: 단독 구역은 손대지 않는다.
{
  const zones = [{ imageIndex: 0, verticalRatio: 0.9 }];
  normalizeVerticalRatios(zones);
  check("단독 구역은 verticalRatio 유지", zones[0].verticalRatio === 0.9);
}

// 케이스 2: 같은 이미지에 여러 구역인데 값이 없으면 균등 분포
{
  const zones = [
    { imageIndex: 0 },
    { imageIndex: 0 },
    { imageIndex: 0 },
  ];
  normalizeVerticalRatios(zones);
  // 3개 → (0+0.5)/3, (1+0.5)/3, (2+0.5)/3 = 0.167, 0.5, 0.833
  check("값 없는 3개 → 균등 분포", 
    zones[0].verticalRatio === 0.167 &&
    zones[1].verticalRatio === 0.5 &&
    zones[2].verticalRatio === 0.833);
  check("균등 분포는 오름차순", 
    zones[0].verticalRatio < zones[1].verticalRatio &&
    zones[1].verticalRatio < zones[2].verticalRatio);
}

// 케이스 3: 값이 너무 뭉쳐 있으면(간격 < 0.05) 재분포
{
  const zones = [
    { imageIndex: 2, verticalRatio: 0.50 },
    { imageIndex: 2, verticalRatio: 0.52 }, // 0.02 간격 → 뭉침
  ];
  normalizeVerticalRatios(zones);
  check("뭉친 2개는 재분포되어 간격이 벌어짐",
    Math.abs(zones[1].verticalRatio - zones[0].verticalRatio) >= 0.1);
}

// 케이스 4: 이미 충분히 벌어진 값은 그대로 존중
{
  const zones = [
    { imageIndex: 1, verticalRatio: 0.1 },
    { imageIndex: 1, verticalRatio: 0.7 },
  ];
  normalizeVerticalRatios(zones);
  check("충분히 벌어진 값은 유지",
    zones[0].verticalRatio === 0.1 && zones[1].verticalRatio === 0.7);
}

// 케이스 5: 서로 다른 이미지의 구역은 서로 영향 없음
{
  const zones = [
    { imageIndex: 0, verticalRatio: 0.5 },
    { imageIndex: 1, verticalRatio: 0.5 },
  ];
  normalizeVerticalRatios(zones);
  check("다른 이미지의 단독 구역들은 유지",
    zones[0].verticalRatio === 0.5 && zones[1].verticalRatio === 0.5);
}

console.log("[sortZonesByPosition]");

// 케이스 6: imageIndex 순 정렬
{
  const zones = [
    { label: "b", imageIndex: 2, verticalRatio: 0.1 },
    { label: "a", imageIndex: 0, verticalRatio: 0.1 },
    { label: "c", imageIndex: 1, verticalRatio: 0.1 },
  ];
  const sorted = sortZonesByPosition(zones);
  check("imageIndex 오름차순 정렬",
    sorted[0].label === "a" && sorted[1].label === "c" && sorted[2].label === "b");
}

// 케이스 7: 같은 이미지 안에서는 verticalRatio 순
{
  const zones = [
    { label: "아래", imageIndex: 0, verticalRatio: 0.8 },
    { label: "위", imageIndex: 0, verticalRatio: 0.2 },
    { label: "중간", imageIndex: 0, verticalRatio: 0.5 },
  ];
  const sorted = sortZonesByPosition(zones);
  check("같은 이미지 내 verticalRatio 오름차순",
    sorted[0].label === "위" && sorted[1].label === "중간" && sorted[2].label === "아래");
}

// 케이스 8: 원본 배열을 변형하지 않음
{
  const zones = [
    { imageIndex: 1 },
    { imageIndex: 0 },
  ];
  const sorted = sortZonesByPosition(zones);
  check("원본 배열은 그대로(비파괴)",
    zones[0].imageIndex === 1 && zones[1].imageIndex === 0 && sorted[0].imageIndex === 0);
}

// 케이스 9: imageIndex 없는 항목은 맨 뒤로
{
  const zones = [
    { label: "무", },
    { label: "유", imageIndex: 0 },
  ];
  const sorted = sortZonesByPosition(zones);
  check("imageIndex 없는 항목은 맨 뒤",
    sorted[0].label === "유" && sorted[1].label === "무");
}

console.log(`\n결과: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("✅ PASS: zone-utils 로직 검증 성공");
  process.exit(0);
} else {
  console.error("❌ FAIL: zone-utils 로직에 문제 있음");
  process.exit(1);
}
