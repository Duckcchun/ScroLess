/**
 * 간단한 TTL 메모리 캐시
 *
 * 같은 상품(=같은 상세이미지 URL 집합)을 다시 분석 요청하면
 * Gemini 재호출 없이 캐시된 결과를 반환해 비용과 지연을 줄인다.
 *
 * MVP 수준의 인메모리 구현이다. 서버가 여러 대이거나 재시작 시
 * 캐시가 유지되어야 한다면 Redis 등 외부 저장소로 교체하면 된다.
 */
import crypto from "node:crypto";

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24; // 24시간
const MAX_ENTRIES = 500; // 메모리 보호용 상한

const store = new Map(); // key -> { value, expiresAt }

/**
 * 이미지 URL 목록으로 캐시 키를 만든다.
 * 순서가 의미 있으므로 정렬하지 않고 순서 그대로 해시한다.
 * @param {string[]} imageUrls
 * @returns {string}
 */
export function makeKey(imageUrls) {
  const joined = imageUrls.join("\n");
  return crypto.createHash("sha1").update(joined).digest("hex");
}

/** 만료된 항목 정리 */
function evictExpired() {
  const now = Date.now();
  for (const [k, entry] of store) {
    if (entry.expiresAt <= now) {
      store.delete(k);
    }
  }
}

/**
 * @param {string} key
 * @returns {any|undefined} 유효한 캐시 값 (없거나 만료면 undefined)
 */
export function get(key) {
  const entry = store.get(key);
  if (!entry) {
    return undefined;
  }
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

/**
 * @param {string} key
 * @param {any} value
 * @param {number} [ttlMs]
 */
export function set(key, value, ttlMs = DEFAULT_TTL_MS) {
  // 상한 초과 시 가장 오래된 항목부터 제거 (Map은 삽입 순서 유지)
  if (store.size >= MAX_ENTRIES) {
    evictExpired();
    if (store.size >= MAX_ENTRIES) {
      const oldestKey = store.keys().next().value;
      store.delete(oldestKey);
    }
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** 현재 캐시 상태 (디버깅/헬스체크용) */
export function stats() {
  evictExpired();
  return { size: store.size, maxEntries: MAX_ENTRIES, ttlMs: DEFAULT_TTL_MS };
}
