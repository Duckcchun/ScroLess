/**
 * ScroLess background service worker (MV3)
 *
 * 방식 A: 페이지를 자동 조작하지 않는다.
 * 사용자가 상세정보를 직접 펼친 뒤 툴바의 ScroLess 아이콘을 누르면,
 * 현재 탭의 content script 에 "분석 시작" 메시지를 보낸다.
 */
chrome.action.onClicked.addListener((tab) => {
  if (!tab || !tab.id) {
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: "SCROLESS_ANALYZE" }, () => {
    // content script 가 아직 없거나 지원 대상 페이지가 아니면 오류가 날 수 있음.
    // 조용히 무시한다.
    void chrome.runtime.lastError;
  });
});
