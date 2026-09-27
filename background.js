// IG Explore Toolbox - background service worker
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "IGX_TOGGLE" });
  } catch (e) {
    // content script not injected (non-instagram page or not loaded yet)
    console.warn("IGX: cannot reach content script", e && e.message);
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.local.get(["igxSettings"], (res) => {
      if (!res.igxSettings) chrome.storage.local.set({ igxSettings: DEFAULT_SETTINGS });
    });
  }
});

const DEFAULT_SETTINGS = {
  filters: {
    types: { image: true, reel: true, carousel: true, video: true },
    lang: "any", // any | sw | en | none
    minCaption: 0,
    includeKw: "",
    excludeKw: "",
    hashtag: "",
    hideDupes: false,
    mode: "hide" // hide | highlight
  },
  sort: "original", // original | newest | oldest | score | caption
  score: {
    reel: 3,
    image: 1,
    carousel: 2,
    video: 3,
    captionPer100: 1,
    perHashtag: 1,
    keywords: ""
  },
  topN: 6,
  overlay: {
    badges: true,
    borders: true,
    tooltip: true,
    aria: true,
    dimNonMatching: false
  }
};
