/**
 * ScroLess content script (MVP)
 *
 * 페이지에 주입되어 다음을 수행한다.
 *  1. 상단 핵심 정보 요약 칩 렌더링
 *  2. 우측에 플로팅 스마트 인덱스 렌더링
 *  3. 인덱스 항목 클릭 시 대상 구역으로 부드럽게 스크롤 이동
 *  4. 스크린 리더용 접근 가능한 텍스트 제공
 *
 * 데이터 획득 순서:
 *  1. 설정(useMockOnly=false)이면 페이지의 상세이미지를 수집해 백엔드(/analyze)로 분석 요청
 *  2. 백엔드 분석이 실패하거나 useMockOnly=true 이면 window.SCROLESS_MOCK 로 폴백
 * 이렇게 해서 키/백엔드 준비 전에도 UI를 확인할 수 있고, 준비되면 실제 분석으로 전환된다.
 */
(function () {
  "use strict";

  // 중복 주입 방지 (SPA 재실행 등)
  if (document.getElementById("scroless-root")) {
    return;
  }

  const config = window.SCROLESS_CONFIG || { useMockOnly: true };

  // 현재 렌더링에 사용할 분석 결과. init() 에서 채운다.
  let data = null;

  // 백엔드가 이미지 순번(imageIndex)으로 결과를 주므로,
  // 순번 → 실제 DOM 이미지 엘리먼트 매핑을 보관한다.
  let collectedImages = [];

  /**
   * 페이지에서 상세이미지를 세로 순서대로 수집한다.
   * 정교한 수집 로직은 collect.js(window.SCROLESS_collectDetailImages)에 있다.
   * 모듈이 없으면 최소 휴리스틱으로 폴백한다.
   * @returns {Array<{el: HTMLImageElement, url: string, pageY: number}>}
   */
  function collectDetailImages() {
    if (typeof window.SCROLESS_collectDetailImages === "function") {
      return window.SCROLESS_collectDetailImages();
    }
    // 폴백: 일정 크기 이상 이미지를 위→아래 순으로
    return Array.from(document.images || [])
      .filter((img) => {
        const r = img.getBoundingClientRect();
        return r.width >= 300 && img.naturalHeight >= 200 && !!img.src;
      })
      .map((img) => {
        const rect = img.getBoundingClientRect();
        return { el: img, url: img.src, pageY: rect.top + window.scrollY };
      })
      .sort((a, b) => a.pageY - b.pageY);
  }

  /**
   * 인덱스 항목의 대상 Y좌표를 구한다.
   * 우선순위: pageY(직접 좌표) > targetId(테스트/mock) > imageIndex(백엔드 결과)
   * @returns {number|null} 이동할 페이지 Y좌표 (없으면 null)
   */
  function resolveTargetY(zone) {
    if (typeof zone.pageY === "number") {
      return zone.pageY;
    }
    if (zone.targetId) {
      const el = document.getElementById(zone.targetId);
      if (el) {
        const rect = el.getBoundingClientRect();
        return rect.top + window.scrollY - 12;
      }
    }
    if (typeof zone.imageIndex === "number" && collectedImages[zone.imageIndex]) {
      const entry = collectedImages[zone.imageIndex];
      // 이미지가 로드되며 위치가 바뀌었을 수 있으니 현재 DOM 위치를 다시 계산
      if (entry.el && entry.el.getBoundingClientRect) {
        const rect = entry.el.getBoundingClientRect();
        return rect.top + window.scrollY - 12;
      }
      return entry.pageY - 12;
    }
    return null;
  }

  /** 대상 Y좌표로 부드럽게 스크롤 이동 */
  function scrollToY(y) {
    window.scrollTo({ top: y, behavior: "smooth" });
  }

  /** 상단 핵심 정보 요약 칩 렌더링 */
  function renderChips(root) {
    const chips = Array.isArray(data.chips) ? data.chips : [];
    // 근거(값)가 있는 칩만 표시한다.
    const valid = chips.filter((c) => c && c.value);
    if (valid.length === 0) {
      return; // 표시할 근거가 없으면 칩을 만들지 않는다.
    }

    const bar = document.createElement("div");
    bar.className = "sl-chips";
    bar.setAttribute("role", "list");
    bar.setAttribute("aria-label", "상품 핵심 정보 요약");

    valid.forEach((chip) => {
      const el = document.createElement("span");
      el.className = "sl-chip";
      el.setAttribute("role", "listitem");

      const key = document.createElement("span");
      key.className = "sl-chip__key";
      key.textContent = chip.key;

      const value = document.createElement("span");
      value.className = "sl-chip__value";
      value.textContent = chip.value;

      el.appendChild(key);
      el.appendChild(value);

      if (chip.base) {
        const base = document.createElement("span");
        base.className = "sl-chip__base";
        base.textContent = "(" + chip.base + ")";
        el.appendChild(base);
      }

      bar.appendChild(el);
    });

    root.appendChild(bar);
  }

  /** 플로팅 스마트 인덱스 렌더링 */
  function renderIndex(root) {
    // 이동 가능한 구역만 인덱스에 노출한다.
    const items = data.zones
      .map((zone) => ({ zone, y: resolveTargetY(zone) }))
      .filter((entry) => entry.y !== null);

    if (items.length === 0) {
      return; // 이동 가능한 구역이 하나도 없으면 인덱스를 만들지 않는다.
    }

    const panel = document.createElement("nav");
    panel.className = "sl-index";
    panel.setAttribute("aria-label", "상품 정보 스마트 인덱스");

    // --- 헤더: 브랜드 로고 + 접기/펼치기 토글 ---
    const header = document.createElement("div");
    header.className = "sl-index__header";

    const brand = document.createElement("span");
    brand.className = "sl-index__brand";
    const logo = document.createElement("span");
    logo.className = "sl-index__logo";
    // 아래로 향하는 이중 셰브론(빠른 이동 상징) 로고 마크
    logo.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" ' +
      'stroke="#FFD300" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
      '<polyline points="6 5 12 11 18 5"></polyline>' +
      '<polyline points="6 13 12 19 18 13"></polyline></svg>';
    const brandText = document.createElement("span");
    brandText.textContent = "ScroLess";
    brand.appendChild(logo);
    brand.appendChild(brandText);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "sl-index__toggle";
    toggle.setAttribute("aria-label", "인덱스 접기/펼치기");
    toggle.setAttribute("aria-expanded", "true");
    toggle.textContent = "▾";
    toggle.addEventListener("click", () => {
      const collapsed = panel.classList.toggle("sl-collapsed");
      toggle.setAttribute("aria-expanded", String(!collapsed));
      toggle.textContent = collapsed ? "▸" : "▾";
    });

    header.appendChild(brand);
    header.appendChild(toggle);
    panel.appendChild(header);

    // --- 항목 목록 ---
    const list = document.createElement("div");
    list.className = "sl-index__items";

    items.forEach(({ zone }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sl-index__item";
      btn.textContent = zone.label;
      btn.addEventListener("click", () => {
        // 클릭 시점에 좌표를 다시 계산해 레이아웃 변화에 대응한다.
        const freshY = resolveTargetY(zone);
        if (freshY !== null) {
          scrollToY(freshY);
        }
      });
      list.appendChild(btn);
    });

    panel.appendChild(list);
    root.appendChild(panel);
  }

  /** 스크린 리더용 접근 가능한 텍스트 (원본 이미지는 수정하지 않음) */
  function renderAccessibleText(root) {
    const chips = Array.isArray(data.chips) ? data.chips : [];
    const valid = chips.filter((c) => c && c.value);
    if (valid.length === 0) {
      return;
    }
    const block = document.createElement("div");
    block.className = "sl-sr-only";
    block.setAttribute("role", "region");
    block.setAttribute("aria-label", "ScroLess가 추출한 상품 정보");
    const text = valid
      .map((c) => `${c.key}: ${c.value}${c.base ? " (" + c.base + ")" : ""}`)
      .join(", ");
    block.textContent = "추출된 상품 핵심 정보 - " + text;
    root.appendChild(block);
  }

  /**
   * 백엔드(/analyze)에 상세이미지를 보내 분석 결과를 받는다.
   * @returns {Promise<{zones:Array, chips:Array}|null>} 실패 시 null
   */
  async function fetchFromBackend() {
    try {
      // lazy loading 이미지를 로드시킨 뒤 수집 (prepareAndCollect 가 있으면 사용)
      if (typeof window.SCROLESS_prepareAndCollect === "function") {
        collectedImages = await window.SCROLESS_prepareAndCollect();
      } else {
        collectedImages = collectDetailImages();
      }
      if (collectedImages.length === 0) {
        return null; // 분석할 이미지가 없으면 백엔드 호출 생략
      }
      const imageUrls = collectedImages.map((entry) => entry.url);
      const res = await fetch(config.backendUrl + "/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrls }),
      });
      if (!res.ok) {
        return null;
      }
      const json = await res.json();
      if (!json || !Array.isArray(json.zones)) {
        return null;
      }
      return json;
    } catch (e) {
      // 네트워크/서버 오류 시 조용히 폴백
      return null;
    }
  }

  /** 로딩 인디케이터 표시 (분석 중). 반환값으로 제거 함수를 준다. */
  function showLoading() {
    const el = document.createElement("div");
    el.className = "sl-status sl-status--loading";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.innerHTML =
      '<span class="sl-spinner" aria-hidden="true"></span>' +
      '<span>ScroLess가 상품 정보를 분석하고 있어요…</span>';
    document.body.appendChild(el);
    return () => el.remove();
  }

  /** 짧은 실패/알림 토스트 (몇 초 후 자동 사라짐) */
  function showToast(message) {
    const el = document.createElement("div");
    el.className = "sl-status sl-status--error";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => {
      el.classList.add("sl-status--hide");
      setTimeout(() => el.remove(), 400);
    }, 3500);
  }

  /** 데이터를 확보한 뒤 UI를 렌더링한다. */
  async function init() {
    // 실제 백엔드 분석을 시도하는 경우 로딩 인디케이터를 보여준다.
    // (lazy loading 페이지는 초기에 이미지가 0개일 수 있으므로 개수로 판단하지 않는다.)
    const willAnalyze = !config.useMockOnly;
    const hideLoading = willAnalyze ? showLoading() : null;

    let usedBackend = false;
    if (!config.useMockOnly) {
      const fromBackend = await fetchFromBackend();
      if (fromBackend) {
        data = fromBackend;
        usedBackend = true;
      }
    }
    if (!data) {
      // 백엔드 미사용/실패 시 mock 폴백
      data = window.SCROLESS_MOCK || null;
    }

    if (hideLoading) {
      hideLoading();
    }

    // 실제 분석을 시도했는데 백엔드 결과를 못 받았으면 사용자에게 알린다.
    if (willAnalyze && !usedBackend) {
      showToast("상품 정보 분석에 실패했어요. 잠시 후 다시 시도해 주세요.");
    }

    if (!data || !Array.isArray(data.zones)) {
      // 분석 결과가 없으면 UI를 생성하지 않는다. (근거 없는 UI 표시 금지 규칙)
      return;
    }

    const root = document.createElement("div");
    root.id = "scroless-root";
    document.body.appendChild(root);

    renderChips(root);
    renderIndex(root);
    renderAccessibleText(root);
  }

  init();
})();
