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
      // 네이버 스마트스토어 / 브랜드스토어 / 쇼핑
      // brand.naver.com(브랜드스토어)도 스마트에디터(se-main-container) 기반이라
      // 동일 셀렉터를 재사용한다.
      match: /(smartstore|brand|shopping)\.naver\.com/,
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
   * @returns {{el: HTMLElement, trusted: boolean}}
   *   trusted=true 면 사이트별 상세 본문 셀렉터로 정확히 찾은 컨테이너라는 뜻.
   *   이 경우 그 안의 이미지들은 "이미 상세이미지"라는 강한 근거가 있으므로
   *   크기 필터를 느슨하게 적용해도 된다. (잘린 조각들이 탈락하지 않게)
   */
  function findDetailContainer() {
    const profile = getSiteProfile();
    if (profile) {
      // 같은 셀렉터에 여러 컨테이너가 매칭될 수 있다(예: 브랜드스토어의
      // 요약용 .se-main-container + 상세용 .se-main-container).
      // 첫 번째를 무조건 쓰지 말고, 매칭된 것 중 "이미지를 가장 많이 품은"
      // 컨테이너를 상세 본문으로 고른다.
      for (const sel of profile.selectors) {
        const candidates = Array.from(document.querySelectorAll(sel));
        if (candidates.length === 0) {
          continue;
        }
        let best = null;
        let bestCount = -1;
        candidates.forEach((el) => {
          const count = el.querySelectorAll("img").length;
          if (count > bestCount) {
            best = el;
            bestCount = count;
          }
        });
        if (best) {
          return { el: best, trusted: true };
        }
      }
    }
    return { el: findContainerByHeuristic() || document.body, trusted: false };
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
   * @param {boolean} trusted 신뢰할 수 있는 상세 본문 컨테이너 안의 이미지인지.
   *   true 면 크기 필터를 느슨하게 한다. (통이미지를 세로로 잘라 만든
   *   납작한 조각들이 높이 문턱에 걸려 탈락하는 문제를 막는다.)
   */
  function isDetailImage(img, url, trusted) {
    if (!url || EXCLUDE_SRC_RE.test(url)) {
      return false;
    }
    const r = img.getBoundingClientRect();
    const hasSize = r.width > 0 || r.height > 0;

    if (hasSize) {
      if (trusted) {
        // 신뢰 컨테이너 안: 이미 상세 본문이므로 크기 문턱을 대폭 낮춘다.
        // 잘린 조각(넓고 납작한 배너/텍스트 띠 등)도 상세이미지로 인정한다.
        // 명백한 아이콘(가로·세로 모두 아주 작음)만 제외한다.
        const isTinyIcon = r.width < 80 && r.height < 80;
        if (isTinyIcon) {
          return false;
        }
        // 폭이 지나치게 좁은 장식용 세로선/구분자 정도만 추가로 배제
        if (r.width < 100) {
          return false;
        }
      } else {
        // 신뢰할 수 없는(휴리스틱) 영역: 기존의 엄격한 크기 조건 유지
        const wideEnough = r.width >= 320;
        const tallEnough = img.naturalHeight >= 200 || r.height >= 200;
        if (!wideEnough || !tallEnough) {
          return false;
        }
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
    const { el: container, trusted } = findDetailContainer();
    const scope = container.querySelectorAll ? container : document;

    const imgs = Array.from(scope.querySelectorAll("img"));
    const seen = new Set();
    const picked = [];

    imgs.forEach((img) => {
      const url = resolveImageUrl(img);
      if (!isDetailImage(img, url, trusted)) {
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
    const { el: container } = findDetailContainer();
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

    // 2) 뷰포트 진입 기반 로더 트리거: 아래로 훑고 원위치.
    //    브랜드스토어 등 SPA 는 스크롤로 이미지를 하나씩 DOM 에 채우고,
    //    네트워크로 받아오는 데 시간이 걸린다. 그래서
    //     - 스텝마다 충분히(150ms) 대기하고
    //     - "수집 대상 이미지 수가 더 이상 늘지 않을 때까지" 여러 번 훑는다.
    const originalY = window.scrollY;

    // 현재 스코프에서 상세이미지로 인정되는 개수를 센다. (안정화 판정용)
    const countDetailImgs = () =>
      Array.from(scope.querySelectorAll("img")).filter((im) =>
        isDetailImage(im, resolveImageUrl(im), true)
      ).length;

    // 아직 실제 이미지가 로드되지 않은(placeholder 상태) 상세 후보 img 가 있는지.
    // 하나도 없으면 스크롤로 더 로드시킬 게 없다는 뜻이라 스윕을 건너뛴다.
    const hasUnloaded = () =>
      Array.from(scope.querySelectorAll("img")).some((im) => {
        const cur = im.currentSrc || im.src || "";
        return !cur || PLACEHOLDER_SRC_RE.test(cur);
      });

    // 이 컨테이너가 품은 전체 img 개수(= 로드 완료 시 도달할 목표 상한)
    const targetCount = scope.querySelectorAll("img").length;

    const sweepOnce = async () => {
      const totalHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      );
      const step = Math.max(window.innerHeight * 0.8, 400);
      for (let y = 0; y < totalHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 150));
      }
      // 맨 아래까지 확실히 내려 마지막 이미지들까지 로드 유발
      window.scrollTo(0, totalHeight);
      await new Promise((r) => setTimeout(r, 250));
    };

    // 이미 전부 로드돼 있으면(사용자가 이미 훑어봄 등) 스크롤 자체를 생략한다.
    if (!hasUnloaded()) {
      return;
    }

    // 최대 4회까지 훑되,
    //  - 목표(컨테이너 전체 img)만큼 상세이미지가 잡혔거나
    //  - 미로드 이미지가 더 없거나
    //  - 이미지 수가 더 늘지 않으면
    // 즉시 종료한다. → 대부분 1회로 끝나 스크롤이 덜 티난다.
    let prevCount = -1;
    for (let attempt = 0; attempt < 4; attempt++) {
      await sweepOnce();
      const now = countDetailImgs();
      if (now >= targetCount || !hasUnloaded() || now === prevCount) {
        break;
      }
      prevCount = now;
    }

    window.scrollTo(0, originalY);
    // 로드가 반영될 여유
    await new Promise((r) => setTimeout(r, 200));
  }

  /**
   * "상세정보 펼치기" 버튼을 눌러 접혀 있는 상세 이미지를 DOM에 나타나게 한다.
   *
   * 네이버 스마트스토어 등은 상세정보가 기본 접힘 상태라, 펼치기 전에는
   * 긴 상세 이미지가 DOM에 없거나 잘려 있다. 클래스명은 자주 바뀌므로
   * 버튼 텍스트("상세정보 펼치기", "상세정보 더보기" 등)로 찾는다.
   *
   * @returns {Promise<boolean>} 펼치기를 시도했으면 true
   */
  /**
   * lazy 로드를 유도한 뒤 상세이미지를 수집한다. (권장 진입점)
   *
   * 방식 A: 페이지를 자동으로 "펼치기" 조작하지 않는다.
   *  - 봇 감지(HTTP 490)와 사이트 약관 문제를 피하기 위함.
   *  - 사용자가 직접 상세정보를 펼친 상태에서 호출되는 것을 전제로 한다.
   *  - lazy 이미지만 로드를 유도한 뒤 수집한다.
   *
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
