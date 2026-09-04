/**
 * cache.js 단위 검증
 * 실행: node server/cache.test.mjs
 */
import * as cache from "./cache.js";

let failed = 0;
function check(name, cond) {
  if (cond) {
    console.log("✅", name);
  } else {
    console.error("❌", name);
    failed++;
  }
}

// 1) 같은 URL 목록 → 같은 키, 다른 목록 → 다른 키
const urlsA = ["https://x/1.jpg", "https://x/2.jpg"];
const urlsB = ["https://x/2.jpg", "https://x/1.jpg"]; // 순서 다름
const urlsC = ["https://x/1.jpg", "https://x/2.jpg"]; // A와 동일
check("동일 목록은 동일 키", cache.makeKey(urlsA) === cache.makeKey(urlsC));
check("순서가 다르면 다른 키", cache.makeKey(urlsA) !== cache.makeKey(urlsB));

// 2) set 후 get 으로 값 반환
const key = cache.makeKey(urlsA);
const value = { zones: [{ type: "size" }], chips: [] };
cache.set(key, value);
check("set 후 get 이 값을 반환", cache.get(key) === value);

// 3) 없는 키는 undefined
check("미존재 키는 undefined", cache.get("nope") === undefined);

// 4) TTL 만료 시 undefined
const shortKey = cache.makeKey(["ttl-test"]);
cache.set(shortKey, { a: 1 }, 20); // 20ms
await new Promise((r) => setTimeout(r, 40));
check("TTL 만료 후 undefined", cache.get(shortKey) === undefined);

// 5) stats 는 크기를 보고한다
const s = cache.stats();
check("stats 반환 형식", typeof s.size === "number" && typeof s.ttlMs === "number");

if (failed === 0) {
  console.log("\n✅ ALL PASS: 캐시 로직 정상");
  process.exit(0);
} else {
  console.error(`\n❌ ${failed}건 실패`);
  process.exit(1);
}
