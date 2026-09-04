/**
 * ScroLess 상세이미지 수집 모듈
 *
 * 목표: 상품 상세페이지에서 "진짜 상세이미지"만 세로 순서로 수집한다.
 * 광고/추천상품/아이콘/리뷰 이미지 등 노이즈는 최대한 배제한다.
 *
 * 전략(2단계):
 *  1) 사이트별 상세영역 컨테이너를 알려진 셀렉터로 먼저 찾는다. (정확)
 *  2) 못 찾으면 범용 휴리스틱으로 상세영역을 추정한다. (fallback)
 *  그 컨테이너 안의 이미지들만 필터링해 반환한다.
 *
 * window.SCROLESS_collectDetailImages() 로 노출한다.
 */
(function () {
  "use strict";

  /**
   * 사이트별 상세영역 컨테이너 셀렉터.
   * host 패턴에 매칭되면 해당 셀렉터들을 우선 시도한다.
   * (실제 페이지 구조 확인 후 계속 보강할 지점)
   */
  const SITE_SELECTORS = [
    {
      // 네이버 스마트스토어 / 쇼핑
      match: /(smartstore|shopping)\.naver\.com/,
      selectors: [
        "#INTRODUCE .se-main-container", // 스마트에디터 본문
        "._1YShY6EQ56", // 상세 설명 영역(변동 가능)
        "div[class*='detail'] .se-main-container",
        ".se-main-container",
      ],
    },
    {
      // 무신사
      match: /musinsa\.com/,
      selectors: [
        ".product-detail-contents",
        "#detail_view",
        "div[class*='detail'] img",
      ],
    },
    {
      // 에이블리
      match: /a-bly\.com|ably\.co\.kr/,
      selectors: [".goods-detail", "div[class*='detail']"],
    },
  ];

  /** 상세이미지로 보기 어려운 위치의 이미지인지 (헤더/네비/푸터/사이드/추천 등) */
  const EXCLUDE_ANCESTOR_RE =
    /(header|footer|nav|gnb|lnb|aside|banner|ad|advert|promotion|recommend|related|review|thumb|swiper|slider|carousel|cart|snb)/i;

  /** 광고/추적 픽셀 등으로 흔한 URL 패턴 */
  const EXCLUDE_SRC_RE = /(sprite|icon|logo|blank|1x1|pixel|loading|spinner)/i;

  /** lazy loading placeholder 로 흔한 값 (data URI, 1x1 등) */
  const PLACEHOLDER_SRC_RE = /^data:image|blank|1x1|placeholder|transparent\.(gif|png)/i;

  /**
   * 이미지의 "진짜" URL을 구한다.
   * 네이버 등은 lazy loading 을 써서 src 가 placeholder 이고
   * 실제 URL이 data-src / data-lazy-src / srcset 에 있는 경우가 많다.
   * @param {HTMLImageElement} img
   * @returns {string} 실제 이미지 URL (없으면 "")
   */
  function resolveImageUrl(img) {
    const src = img.currentSrc || img.src || "";
    // src 가 진짜 이미지면 그대로 사용
    if (src && !PLACEHOLDER_SRC_RE.test(src)) {
      return src;
    }
    // lazy 속성들에서 후보 탐색
    const lazyAttrs = [
      "data-src",
      "data-lazy-src",
      "data-original",
      "data-url",
      "data-image",
    ];
    for (const attr of lazyAttrs) {
      const v = img.getAttribute(attr);
      if (v && !PLACEHOLDER_SRC_RE.test(v)) {
        return v;
      }
    }
    // srcset 에서 가장 큰 후보
    const srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset");
    if (srcset) {
      const last = srcset.split(",").map((s) => s.trim().split(/\s+/)[0]).filter(Boolean).pop();
      if (last && !PLACEHOLDER_SRC_RE.test(last)) {
        return last;
      }
    }
    return src; // 최후: 원래 src(placeholder일 수 있음)
  }

  /** 현재 호스트에 맞는 사이트 프로필을 반환 (없으면 null) */
  function getSiteProfile() {
    const host = location.host;
    return SITE_SELECTORS.find((s) => s.match.test(host)) || null;
  }

  /**
   * 상세영역 컨테이너를 찾는다.
   * 1) 사이트 셀렉터 → 2) 범용 휴리스틱
   * @returns {HTMLElement} 컨테이너 (없으면 document.body)
   */
  function findDetailContainer() {
    const profile = getSiteProfile();
    if (profile) {
      for (const sel of profile.selectors) {
        const el = document.querySelector(sel);
        if (el) {
          return el;
        }
      }
    }
    return findContainerByHeuristic() || document.body;
  }

  /**
   * 범용 휴리스틱: 큰 이미지가 세로로 가장 많이 밀집한 조상 컨테이너를 상세영역으로 추정한다.
   * @returns {HTMLElement|null}
   */
  function findContainerByHeuristic() {
    const bigImgs = Array.from(document.images || []).filter((img) => {
      const r = img.getBoundingClientRect();
      return r.width >= 320 && (img.naturalHeight >= 250 || r.height >= 250);
    });
    if (bigImgs.length === 0) {
      return null;
    }

    // 각 큰 이미지의 "적당한 조상"을 후보로 삼아, 큰 이미지를 가장 많이 품은 조상을 고른다.
    const scores = new Map(); // 조상 엘리먼트 → 포함한 큰 이미지 수
    bigImgs.forEach((img) => {
      let node = img.parentElement;
      let depth = 0;
      while (node && node !== document.body && depth < 6) {
        scores.set(node, (scores.get(node) || 0) + 1);
        node = node.parentElement;
        depth++;
      }
    });

    let best = null;
    let bestScore = 0;
    for (const [node, score] of scores) {
      // 노이즈 영역은 후보에서 제외
      if (isInExcludedRegion(node)) {
        continue;
      }
      if (score > bestScore) {
        best = node;
        bestScore = score;
      }
    }
    return best;
  }

  /** 엘리먼트가 제외 대상 영역(광고/추천/네비 등) 안에 있는지 */
  function isInExcludedRegion(el) {
    let node = el;
    let depth = 0;
    while (node && node !== document.body && depth < 8) {
      const id = node.id || "";
      const cls = typeof node.className === "string" ? node.className : "";
      const role = node.getAttribute ? node.getAttribute("role") || "" : "";
      if (EXCLUDE_ANCESTOR_RE.test(id + " " + cls + " " + role)) {
        return true;
      }
      if (node.tagName === "HEADER" || node.tagName === "FOOTER" || node.tagName === "NAV" || node.tagName === "ASIDE") {
        return true;
      }
      node = node.parentElement;
      depth++;
    }
    return false;
  }

  /**
   * 개별 이미지가 "상세이미지"로 적합한지 판단.
   * @param {HTMLImageElement} img
   * @param {string} url resolveImageUrl 로 구한 실제 URL
   */
  function isDetailImage(img, url) {
    if (!url || EXCLUDE_SRC_RE.test(url)) {
      return false;
    }
    const r = img.getBoundingClientRect();
    // 너무 작으면 아이콘/썸네일로 간주.
    // (lazy 이미지는 아직 로드 전이라 크기가 0일 수 있으므로,
    //  크기가 0이면 크기 조건은 통과시키고 영역/URL 조건으로만 판단한다.)
    const hasSize = r.width > 0 || r.height > 0;
    if (hasSize) {
      const wideEnough = r.width >= 320;
      const tallEnough = img.naturalHeight >= 200 || r.height >= 200;
      if (!wideEnough || !tallEnough) {
        return false;
      }
    }
    // 노이즈 영역(광고/추천/리뷰 등) 안이면 제외
    if (isInExcludedRegion(img)) {
      return false;
    }
    return true;
  }

  /**
   * 상세이미지들을 세로 순서로 수집한다.
   * @returns {Array<{el: HTMLImageElement, url: string, pageY: number}>}
   */
  function collectDetailImages() {
    const container = findDetailContainer();
    const scope = container.querySelectorAll ? container : document;

    const imgs = Array.from(scope.querySelectorAll("img"));
    const seen = new Set();
    const picked = [];

    imgs.forEach((img) => {
      const url = resolveImageUrl(img);
      if (!isDetailImage(img, url)) {
        return;
      }
      if (seen.has(url)) {
        return; // 같은 URL 중복 제거
      }
      seen.add(url);
      const rect = img.getBoundingClientRect();
      picked.push({
        el: img,
        url,
        pageY: rect.top + window.scrollY,
      });
    });

    // 세로 순서 정렬
    picked.sort((a, b) => a.pageY - b.pageY);
    return picked;
  }

  /**
   * lazy loading 이미지를 강제로 로드시킨다.
   *
   * 두 가지 방식을 함께 쓴다.
   *  1) loading="lazy" 속성 제거 + data-src 를 src 로 승격 (즉시 로드 유도)
   *  2) 페이지를 아래로 훑어 내렸다가 원위치 (뷰포트 진입 기반 lazy 로더 트리거)
   *
   * @returns {Promise<void>}
   */
  async function triggerLazyLoad() {
    const container = findDetailContainer();
    const scope = container.querySelectorAll ? container : document;
    const imgs = Array.from(scope.querySelectorAll("img"));

    // 1) 속성 기반 즉시 승격
    imgs.forEach((img) => {
      if (img.getAttribute("loading") === "lazy") {
        img.setAttribute("loading", "eager");
      }
      const url = resolveImageUrl(img);
      const cur = img.currentSrc || img.src || "";
      if (url && url !== cur && !PLACEHOLDER_SRC_RE.test(url)) {
        try {
          img.src = url;
        } catch (e) {
          /* noop */
        }
      }
    });

    // 2) 뷰포트 진입 기반 로더 트리거: 아래로 훑고 원위치
    const originalY = window.scrollY;
    const totalHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );
    const step = Math.max(window.innerHeight * 0.8, 400);
    for (let y = 0; y < totalHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, originalY);
    // 로드가 반영될 짧은 여유
    await new Promise((r) => setTimeout(r, 120));
  }

  /**
   * lazy 로드를 유도한 뒤 상세이미지를 수집한다. (권장 진입점)
   * @returns {Promise<Array<{el, url, pageY}>>}
   */
  async function prepareAndCollect() {
    try {
      await triggerLazyLoad();
    } catch (e) {
      /* 스크롤 실패해도 수집은 시도 */
    }
    return collectDetailImages();
  }

  // 외부(content.js)에서 사용할 수 있도록 노출
  window.SCROLESS_collectDetailImages = collectDetailImages; // 동기(즉시)
  window.SCROLESS_prepareAndCollect = prepareAndCollect; // 비동기(lazy 로드 후)
})();
