/**
 * collect.js 수집 로직 검증 (jsdom)
 *
 * jsdom 은 레이아웃을 계산하지 않으므로(getBoundingClientRect/naturalHeight = 0),
 * 각 이미지의 크기를 id 규칙에 따라 목킹한 뒤 collect.js 를 실행한다.
 *
 * 기대: 상세영역(detail-1~3) 3개만 수집, 노이즈 5개는 제외.
 *
 * 실행: node test/collect.test.mjs   (jsdom 필요: npm i -D jsdom)
 */
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const html = readFileSync(join(__dirname, "collect-test.html"), "utf8");
const collectSrc = readFileSync(join(__dirname, "../src/collect.js"), "utf8");

const dom = new JSDOM(html, {
  url: "https://smartstore.naver.com/somestore/products/12345",
  runScripts: "outside-only",
});
const { window } = dom;

// --- 크기 목킹: id 규칙에 따라 크기를 부여 ---
let topCounter = 0;
function mockSize(img) {
  const id = img.id || "";
  let width, height;
  if (id.includes("lazy")) {
    // lazy 이미지는 아직 로드 전이라 크기 0 (실제 페이지 상황 재현)
    width = 0; height = 0;
  } else if (id.startsWith("detail")) {
    width = 600; height = 900;               // 상세이미지: 크고 세로로 긺
  } else if (id.includes("banner") || id.includes("reco") || id.includes("review")) {
    width = 600; height = 300;               // 배너/추천/리뷰: 넓지만 노이즈 영역
  } else {
    width = 24; height = 24;                 // 아이콘/로고
  }
  Object.defineProperty(img, "naturalHeight", { value: height, configurable: true });
  Object.defineProperty(img, "naturalWidth", { value: width, configurable: true });
  const top = topCounter++ * 100; // 문서 순서대로 top 부여
  img.getBoundingClientRect = () => ({
    width, height, top, left: 0, right: width, bottom: top + height,
  });
  Object.defineProperty(img, "currentSrc", { value: img.src, configurable: true });
}
Array.from(window.document.images).forEach(mockSize);

// --- collect.js 를 window 컨텍스트에서 실행 ---
const runner = new window.Function(collectSrc);
runner.call(window);

// jsdom 은 scrollTo 를 구현하지 않으므로 목킹 (triggerLazyLoad 가 호출함)
window.scrollTo = () => {};

// --- 동기 수집 검증 ---
const collected = window.SCROLESS_collectDetailImages();
const ids = collected.map((e) => e.el.id);

// 기대(동기): detail-1~3 + data-src lazy(detail-4) + loading=lazy(detail-5) = 5개, 노이즈 제외
const expectedIds = [
  "detail-1",
  "detail-2",
  "detail-3",
  "detail-4-lazy",
  "detail-5-scroll-lazy",
];
const idsOk =
  ids.length === expectedIds.length &&
  expectedIds.every((id, i) => ids[i] === id);

const lazyEntry = collected.find((e) => e.el.id === "detail-4-lazy");
const lazyOk = lazyEntry && lazyEntry.url.includes("detail-4.png");

console.log("수집된 id :", ids);
console.log("기대 id   :", expectedIds);
console.log("lazy url  :", lazyEntry ? lazyEntry.url : "(없음)");

// --- prepareAndCollect (lazy 강제 로드) 검증 ---
const scrollLazyImg = window.document.getElementById("detail-5-scroll-lazy");
await window.SCROLESS_prepareAndCollect();
// triggerLazyLoad 후: loading=lazy 가 eager 로 바뀌고, data-src 가 src 로 승격돼야 함
const loadingPromoted = scrollLazyImg.getAttribute("loading") === "eager";
const srcPromoted = (scrollLazyImg.getAttribute("src") || "").includes("detail-5.png");

console.log("scroll-lazy loading 속성:", scrollLazyImg.getAttribute("loading"));
console.log("scroll-lazy src 승격    :", scrollLazyImg.getAttribute("src"));

const lazyForceOk = loadingPromoted && srcPromoted;

if (idsOk && lazyOk && lazyForceOk) {
  console.log("✅ PASS: 노이즈 제외 + data-src lazy 해석 + 스크롤유발 lazy 강제로드 성공");
  process.exit(0);
} else {
  console.error("❌ FAIL: 결과가 기대와 다름");
  if (!idsOk) console.error("  - id 목록 불일치");
  if (!lazyOk) console.error("  - data-src lazy URL 해석 실패");
  if (!lazyForceOk) console.error("  - 스크롤유발 lazy 강제로드 실패");
  process.exit(1);
}
