/**
 * Gemini 분석 호출 모듈
 *
 * 이미지 URL 목록을 받아 이미지를 내려받고, Gemini에 전달해
 * { zones, chips } 형태의 구조화된 JSON을 반환한다.
 *
 * API 키는 절대 코드에 하드코딩하지 않고 process.env.GEMINI_API_KEY 로 읽는다.
 */
import { GoogleGenAI } from "@google/genai";
import { RESPONSE_SCHEMA, ANALYSIS_INSTRUCTION } from "./analysis-schema.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

/** 키가 설정돼 있는지 확인하고, 없으면 명확한 에러를 던진다. */
function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.startsWith("여기에")) {
    throw new Error(
      "GEMINI_API_KEY 가 설정되지 않았습니다. server/.env 파일에 발급받은 키를 넣어주세요. (.env.example 참고)"
    );
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * 이미지 URL을 내려받아 Gemini inlineData 형식(base64)으로 변환한다.
 * @param {string} url
 * @returns {Promise<{inlineData: {mimeType: string, data: string}}>}
 */
async function fetchImageAsPart(url) {
  // 일부 CDN(네이버 등)은 브라우저가 아닌 요청/리퍼러 없는 요청을 차단한다.
  // 실제 브라우저처럼 보이도록 User-Agent 와 Referer 를 붙여 hotlink 차단을 회피한다.
  let referer;
  try {
    referer = new URL(url).origin + "/";
  } catch (e) {
    referer = undefined;
  }
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      ...(referer ? { Referer: referer } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`이미지 다운로드 실패 (${res.status}): ${url}`);
  }
  const contentType = res.headers.get("content-type") || "image/jpeg";
  // 이미지가 아닌 응답(HTML 에러 페이지 등)이 오면 분석에 쓰지 않는다.
  if (!contentType.startsWith("image/")) {
    throw new Error(`이미지가 아님 (${contentType}): ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return {
    inlineData: {
      mimeType: contentType,
      data: buffer.toString("base64"),
    },
  };
}

/**
 * 일시적 오류(503/UNAVAILABLE, 429/RESOURCE_EXHAUSTED)에 대해
 * 지수 백오프로 재시도한다. 그 외 오류는 즉시 던진다.
 * @param {() => Promise<any>} fn
 * @param {number} maxRetries
 */
async function withRetry(fn, maxRetries = 3) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = String(err && err.message);
      const transient =
        msg.includes("503") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("429") ||
        msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("high demand");
      if (!transient || attempt === maxRetries) {
        throw err;
      }
      // 1s, 2s, 4s ... 대기
      const delay = 1000 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * 상세이미지 URL 목록을 분석한다.
 * @param {string[]} imageUrls 페이지 세로 순서대로 정렬된 이미지 URL 목록
 * @returns {Promise<{zones: Array, chips: Array}>}
 */
export async function analyzeImages(imageUrls) {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    throw new Error("분석할 이미지 URL 목록이 비어 있습니다.");
  }

  const ai = getClient();

  // 이미지들을 병렬로 내려받되, 일부가 실패해도 나머지로 분석을 진행한다.
  // (통이미지 10장 중 1장이 404 여도 분석 전체가 실패하지 않도록 = 내구성)
  const settled = await Promise.allSettled(imageUrls.map(fetchImageAsPart));

  // 성공한 이미지만, "원래 순번(imageIndex)"을 유지한 채 모은다.
  // 원래 순번을 유지하는 이유: 확장 프로그램이 imageIndex 로 실제 DOM 이미지를
  // 찾아 스크롤 좌표를 계산하므로, 여기서 순번이 밀리면 엉뚱한 곳으로 이동한다.
  const kept = [];
  const failed = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      kept.push({ index: i, part: r.value });
    } else {
      failed.push({ index: i, reason: r.reason && r.reason.message });
    }
  });

  if (failed.length > 0) {
    console.warn(
      `[analyze] 이미지 ${failed.length}/${imageUrls.length}장 다운로드 실패(건너뜀):`,
      failed.map((f) => `#${f.index} ${f.reason}`).join(" | ")
    );
  }

  // 전부 실패했을 때만 에러를 던진다.
  if (kept.length === 0) {
    throw new Error(
      `모든 이미지(${imageUrls.length}장) 다운로드에 실패했습니다. ` +
        (failed[0] ? `예: ${failed[0].reason}` : "")
    );
  }

  // 각 이미지 앞에 순번 마커 텍스트를 끼워 넣는다.
  // Gemini 가 "지금 보는 이미지가 몇 번째(imageIndex)인지"를 훨씬 정확히
  // 인식하게 되어, imageIndex/verticalRatio 추정의 오차가 줄어든다.
  const parts = [{ text: ANALYSIS_INSTRUCTION }];
  kept.forEach(({ index, part }) => {
    parts.push({
      text: `\n[이미지 imageIndex=${index} / 총 ${imageUrls.length}장 중 ${index + 1}번째]`,
    });
    parts.push(part);
  });

  // 일시적 과부하(503/UNAVAILABLE)에 대비해 지수 백오프로 재시도한다.
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts,
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    })
  );

  const text = response.text;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error("Gemini 응답을 JSON으로 파싱하지 못했습니다: " + text);
  }

  // 최소한의 방어: 형식이 어긋나면 빈 배열로 보정
  return {
    zones: Array.isArray(parsed.zones) ? parsed.zones : [],
    chips: Array.isArray(parsed.chips) ? parsed.chips : [],
  };
}
