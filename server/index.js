/**
 * ScroLess 백엔드 서버
 *
 * 확장 프로그램이 수집한 상세이미지 URL 목록을 받아 Gemini로 분석하고,
 * { zones, chips } JSON을 돌려준다.
 *
 * 실행:
 *   1. cp .env.example .env  후 GEMINI_API_KEY 채우기
 *   2. npm install
 *   3. npm start
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import { analyzeImages } from "./gemini.js";
import * as cache from "./cache.js";

const app = express();
const PORT = process.env.PORT || 8787;

// 확장 프로그램(다른 오리진)에서 호출하므로 CORS 허용
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// 헬스체크
app.get("/health", (req, res) => {
  const keySet =
    !!process.env.GEMINI_API_KEY &&
    !process.env.GEMINI_API_KEY.startsWith("여기에");
  res.json({
    ok: true,
    apiKeyConfigured: keySet,
    model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
    cache: cache.stats(),
  });
});

/**
 * POST /analyze
 * body: { imageUrls: string[] }
 * res : { zones: [...], chips: [...], cached: boolean }
 *
 * 같은 이미지 URL 집합이면 캐시된 결과를 반환해 Gemini 재호출을 피한다.
 */
app.post("/analyze", async (req, res) => {
  try {
    const { imageUrls } = req.body || {};
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return res.status(400).json({ error: "분석할 이미지 URL 목록이 비어 있습니다." });
    }

    const key = cache.makeKey(imageUrls);
    const hit = cache.get(key);
    if (hit) {
      return res.json({ ...hit, cached: true });
    }

    const result = await analyzeImages(imageUrls);
    cache.set(key, result);
    res.json({ ...result, cached: false });
  } catch (err) {
    console.error("[analyze] 오류:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`ScroLess 백엔드가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
