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

const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

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
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`이미지 다운로드 실패 (${res.status}): ${url}`);
  }
  const contentType = res.headers.get("content-type") || "image/jpeg";
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

  // 이미지들을 병렬로 내려받아 파트로 변환
  const imageParts = await Promise.all(imageUrls.map(fetchImageAsPart));

  // 일시적 과부하(503/UNAVAILABLE)에 대비해 지수 백오프로 재시도한다.
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: ANALYSIS_INSTRUCTION }, ...imageParts],
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
