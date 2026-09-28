// IG Explore Toolbox - engine (content script)
// Exposes window.IGX used by panel.js (same isolated world).
(() => {
  if (window.IGX) return;

  const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

  const DEFAULTS = {
    filters: {
      types: { image: true, reel: true, carousel: true, video: true },
      lang: "any",
      minCaption: 0,
      includeKw: "",
      excludeKw: "",
      hashtag: "",
      hideDupes: false,
      hideForeign: false,
      hideNoCaption: false,
      mode: "hide"
    },
    sort: "original",
    score: { reel: 3, image: 1, carousel: 2, video: 3, captionPer100: 1, perHashtag: 1, keywords: "" },
    topN: 6,
    overlay: { badges: true, borders: true, tooltip: true, tipChars: 260, aria: true, dimNonMatching: false },
    inspect: false
  };

  const SW = new Set(("na wa kwa ya ni au hii hayo hilo lakini baada katika kuwa ali yake wake sisi nyinyi wao hao zaidi mbili sana bado sasa hapa kule kutoka ajili mtu watu mwaka siku nchi serikali kazi fedha mama baba rafiki nyumba gari chakula maji jua mvua leo jana kesho nilikuwa amekuwa atakuwa hizo hivyo kwani sijui nime una wako yenu kwako huko ndiyo hapana simu simu posti kwa hivyo mbona wapi lini nani sijui simu".split(" ")));
  const EN = new Set(("the and is of to in for on with that this was are be by as at an or from but not you your we our they their he she it its has have had will would can could about just like more when what who how all any some yes if then so than too very there here one two into over under after before because while his her them been did do does my your im".split(" ")));

  const state = {
    settings: null,
    tiles: [],
    stats: null,
    profile: null,
    selected: null,
    listeners: []
  };

  // ---------- helpers ----------
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const el = (tag, cls, parent) => { const n = document.createElement(tag); if (cls) n.className = cls; if (parent) parent.appendChild(n); return n; };

  function shortcodeToId(sc) {
    if (!sc) return null;
    let id = 0n;
    for (const c of sc) {
      const v = CHARS.indexOf(c);
      if (v < 0) return null;
      id = id * 64n + BigInt(v);
    }
    return id;
  }

  function detectLang(text) {
    if (!text || !text.trim()) return "none";
    const words = text.toLowerCase().match(/[a-z\u00c0-\u024f']+/g) || [];
    if (!words.length) return "none";
    let sw = 0, en = 0;
    for (const w of words) { if (SW.has(w)) sw++; else if (EN.has(w)) en++; }
    if (sw === 0 && en === 0) return "other";
    if (sw > en) return "sw";
    if (en > sw) return "en";
    return "other";
  }

  function decodeReelMeta(src) {
    const out = { duration: null, res: null, tag: null, assetAge: null };
    if (!src) return out;
    try {
      const m = src.match(/[?&]efg=([^&]+)/);
      if (m) {
        let b = decodeURIComponent(m[1]).replace(/-/g, "+").replace(/_/g, "/");
        while (b.length % 4) b += "=";
        const j = JSON.parse(atob(b));
        out.duration = j.duration_s != null ? j.duration_s : (j.dur != null ? j.dur : null);
        out.tag = j.video_tag || j.encoded_tag || null;
        out.assetAge = j.asset_age_days != null ? j.asset_age_days : null;
        if (out.tag) { const r = out.tag.match(/\.(\d{3,4})\./); if (r) out.res = Number(r[1]); }
      }
    } catch (e) { /* ignore */ }
    if (!out.res) {
      const r2 = src.match(/(\d{3,4})p\./) || src.match(/\.(\d{3,4})\./);
      if (r2) out.res = Number(r2[1]);
    }
    return out;
  }

  function bestImgSize(img) {
    let w = null, h = null;
    const srcset = img.getAttribute("srcset") || "";
    if (srcset) {
      for (const cand of srcset.split(",")) {
        const url = cand.trim().split(/\s+/)[0] || "";
        let cw = null, ch = null;
        const p = url.match(/p(\d{2,5})x(\d{2,5})/); if (p) { cw = Number(p[1]); ch = Number(p[2]); }
        const wd = cand.match(/(\d{3,5})w\b/); if (wd && (!cw || Number(wd[1]) > cw)) cw = Number(wd[1]);
        if (cw && (!w || cw > w)) { w = cw; h = ch; }
      }
    }
    if (!w && img.naturalWidth) { w = img.naturalWidth; h = img.naturalHeight; }
    return { w, h };
  }

  function fmtDur(s) {
    if (s == null) return "";
    s = Math.round(s);
    const m = Math.floor(s / 60), r = s % 60;
    return m + ":" + String(r).padStart(2, "0");
  }

  function kwList(str) {
    return (str || "").split(/[,\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  }

  // ---------- extraction ----------
  const RESERVED_SEGMENTS = new Set(["p", "reel", "tv", "explore", "reels", "stories", "accounts", "direct", "about", "developer", "legal"]);
  const OWNER_CACHE = new WeakMap();

  function ownerOf(href) {
    const m = (href || "").match(/^\/([^/?#]+)\//);
    if (!m) return null;
    const seg = decodeURIComponent(m[1]);
    return RESERVED_SEGMENTS.has(seg) ? null : seg;
  }

  function extract(a) {
    const href = a.getAttribute("href") || "";
    const m = href.match(/\/(?:p|reel|tv)\/([^/?#]+)/);
    const shortcode = m ? m[1] : href;
    const img = a.querySelector("img");
    const video = a.querySelector("video");
    const svg = a.querySelector("svg[aria-label]");
    const badge = svg ? svg.getAttribute("aria-label") : null;

    // profile pages badge reels as "Clip" and have no <video> element -> use badge then href
    let type = "image";
    if (badge === "Carousel") type = "carousel";
    else if (badge === "Reel" || badge === "Clip") type = "reel";
    else if (video && !img) type = video.hasAttribute("loop") ? "reel" : "video";
    else if (video && img) type = "video";
    else if (/\/reel\//.test(href)) type = "reel";
    else if (/\/tv\//.test(href)) type = "video";

    const caption = img ? (img.getAttribute("alt") || "") : "";
    const hashtags = (caption.match(/#[\p{L}\p{N}_]+/gu) || []).map(s => s.slice(1).toLowerCase());
    const mentions = (caption.match(/@[\w.]+/g) || []).map(s => s.slice(1).toLowerCase());

    let media = { kind: img ? "img" : (video ? "video" : "none"), src: null, w: null, h: null, duration: null, res: null, assetAge: null };
    if (video) {
      media.src = video.getAttribute("src") || "";
      const meta = decodeReelMeta(media.src);
      media.duration = meta.duration; media.res = meta.res; media.assetAge = meta.assetAge;
      media.w = media.res || null; media.h = media.res ? Math.round(media.res * 9 / 8) : null;
    } else if (img) {
      media.src = img.getAttribute("src") || "";
      const sz = bestImgSize(img);
      media.w = sz.w; media.h = sz.h;
    }

    let aspect = null;
    const ratioBox = a.querySelector('div[style*="padding-bottom"]');
    if (ratioBox) {
      const pm = (ratioBox.getAttribute("style") || "").match(/padding-bottom:\s*([\d.]+)%/);
      if (pm) aspect = Math.round((100 / Number(pm[1])) * 1000) / 1000;
    }

    const id = shortcodeToId(shortcode);
    const owner = ownerOf(href);

    // pinned marker on profile grids (text or aria), absent on explore
    let pinned = false;
    try {
      const cell = a.parentElement;
      const probe = cell || a;
      pinned = !!probe.querySelector('svg[aria-label*="inned" i], [aria-label*="inned" i]')
        || /\bpinned\b/i.test(probe.textContent || "");
    } catch (e) { /* ignore */ }

    return {
      el: a,
      href, shortcode, id,
      type, badge,
      owner, pinned,
      caption, captionLen: caption.length,
      noCaption: !caption.trim(),
      hashtags, mentions,
      lang: detectLang(caption),
      media, aspect,
      auto: /^Photo |^Video |May be an image/.test(caption), // IG auto/OCR caption
      dupIndex: 0, dupCount: 0, score: 0, match: true, order: 0
    };
  }

  // ---------- profile / route context ----------
  function currentRoute() {
    const segs = location.pathname.split("/").filter(Boolean);
    const profile = segs.length && !RESERVED_SEGMENTS.has(segs[0]) ? segs[0] : null;
    let section = "posts";
    if (profile) {
      if (segs[1] === "reels") section = "reels";
      else if (segs[1] === "tagged") section = "tagged";
    } else if (segs[0] === "explore" || !segs.length) section = "explore";
    else if (segs[0] === "reels") section = "reels-feed";
    return { profile, section, path: location.pathname };
  }

  function parseProfileHeader() {
    const route = currentRoute();
    if (!route.profile) return null;
    const header = document.querySelector("header");
    if (!header) return null;
    const lines = (header.innerText || "").split("\n").map(s => s.trim()).filter(Boolean);
    const num = (s) => {
      const m = String(s).replace(/,/g, "").match(/([\d.]+)\s*([KMB])?/i);
      if (!m) return null;
      let v = parseFloat(m[1]);
      const suf = (m[2] || "").toUpperCase();
      if (suf === "K") v *= 1e3; else if (suf === "M") v *= 1e6; else if (suf === "B") v *= 1e9;
      return Math.round(v);
    };
    const find = (re) => { const l = lines.find(x => re.test(x)); return l ? num(l) : null; };
    const link = header.querySelector('a[href^="http"]');
    let externalUrl = null;
    if (link) {
      const raw = link.getAttribute("href") || "";
      const u = raw.match(/[?&]u=([^&]+)/);
      externalUrl = u ? decodeURIComponent(u[1]) : raw;
    }
    return {
      username: route.profile,
      displayName: lines[1] && !/posts$/i.test(lines[1]) ? lines[1] : null,
      posts: find(/^\s*[\d.,]+[KMB]?\s+posts$/i),
      followers: find(/^\s*[\d.,]+[KMB]?\s+followers$/i),
      following: find(/^\s*[\d.,]+[KMB]?\s+following$/i),
      verified: !!header.querySelector('svg[aria-label="Verified"]'),
      externalUrl
    };
  }

  function markForeign(tiles) {
    const route = currentRoute();
    const me = route.profile;
    tiles.forEach(t => {
      t.foreign = !!(me && t.owner && t.owner !== me);
    });
  }

  function scan() {
    const anchors = Array.from(document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]'))
      .filter(a => a.querySelector("img, video"));
    const tiles = anchors.map(extract);
    markForeign(tiles);

    // duplicates by shortcode
    const seen = new Map();
    tiles.forEach(t => {
      const n = seen.get(t.shortcode) || 0;
      t.dupIndex = n; seen.set(t.shortcode, n + 1);
    });
    tiles.forEach(t => { t.dupCount = seen.get(t.shortcode) - 1; });

    // cross-username caption duplicates (repost detector)
    const capSeen = new Map();
    tiles.forEach(t => {
      const key = t.captionLen >= 24 ? t.caption.replace(/\s+/g, " ").trim().toLowerCase() : "";
      t.capDupIndex = 0; t.capDupCount = 0; t._capKey = key;
      if (key) { const n = capSeen.get(key) || 0; t.capDupIndex = n; capSeen.set(key, n + 1); }
    });
    tiles.forEach(t => { if (t._capKey) t.capDupCount = capSeen.get(t._capKey) - 1; });

    state.tiles = tiles;
    return tiles;
  }

  // ---------- scoring / filtering ----------
  function scoreOf(t) {
    const s = state.settings.score;
    let v = s[t.type] != null ? Number(s[t.type]) : 1;
    v += (t.captionLen / 100) * Number(s.captionPer100 || 0);
    v += t.hashtags.length * Number(s.perHashtag || 0);
    const kws = kwList(s.keywords);
    const cap = t.caption.toLowerCase();
    for (const k of kws) if (cap.includes(k)) v += 1;
    return Math.round(v * 100) / 100;
  }

  function matches(t) {
    const f = state.settings.filters;
    if (!f.types[t.type]) return false;
    if (f.lang !== "any" && t.lang !== f.lang) return false;
    if (f.minCaption && t.captionLen < Number(f.minCaption)) return false;
    const cap = t.caption.toLowerCase();
    const inc = kwList(f.includeKw);
    if (inc.length && !inc.some(k => cap.includes(k))) return false;
    const exc = kwList(f.excludeKw);
    if (exc.length && exc.some(k => cap.includes(k))) return false;
    if (f.hashtag) {
      const want = f.hashtag.replace(/^#/, "").toLowerCase();
      if (!t.hashtags.includes(want)) return false;
    }
    if (f.hideDupes && t.dupIndex > 0) return false;
    if (f.hideForeign && t.foreign) return false;
    if (f.hideNoCaption && t.noCaption) return false;
    return true;
  }

  function sortTiles(tiles) {
    const mode = state.settings.sort;
    if (mode === "original") return tiles.slice().sort((a, b) => a.order - b.order);
    // pinned posts stay first on profile grids regardless of sort mode
    const pinnedFirst = (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    if (mode === "newest") return tiles.slice().sort((a, b) => pinnedFirst(a, b) || (b.id || 0n) - (a.id || 0n));
    if (mode === "oldest") return tiles.slice().sort((a, b) => pinnedFirst(a, b) || (a.id || 0n) - (b.id || 0n));
    if (mode === "score") return tiles.slice().sort((a, b) => pinnedFirst(a, b) || b.score - a.score);
    if (mode === "caption") return tiles.slice().sort((a, b) => pinnedFirst(a, b) || b.captionLen - a.captionLen);
    return tiles;
  }

  // ---------- layout: flatten row containers so hidden items reflow (no gaps) ----------
  // Explore rows are CSS grids; profile rows are flex rows of equal cells. Both get
  // flattened into one grid on the column wrapper so hiding a cell reflows everything.
  function cellOf(a) {
    if (a.__igxCell && a.__igxCell.isConnected) return a.__igxCell;
    let n = a.parentElement;
    while (n && n !== document.body) {
      const p = n.parentElement;
      if (!p) break;
      const cs = getComputedStyle(p);
      const pd = cs.display;
      const rowLike = pd === "grid" ||
        (pd === "flex" && /^row/.test(cs.flexDirection) && p.children.length > 1);
      if (rowLike || (p.dataset && p.dataset.igxRow === "1")) { a.__igxCell = n; return n; }
      n = p;
    }
    return null;
  }

  function rowKind(row) {
    if (row.dataset && row.dataset.igxRow === "1") return row.dataset.igxKind === "flex" ? "flex" : "grid";
    const cs = getComputedStyle(row);
    if (cs.display === "grid") return "grid";
    if (cs.display === "flex" && /^row/.test(cs.flexDirection)) return "flex";
    return null;
  }

  function rowColCount(row, kind) {
    if (kind === "flex") return row.children.length;
    const v = (getComputedStyle(row).getPropertyValue("--x-gridTemplateColumns") || "").trim();
    if (v && v !== "none") {
      const m = v.match(/repeat\(\s*(\d+)/);
      if (m) return Number(m[1]);
      const parts = v.split(/[\s,]+/).filter(Boolean);
      if (parts.length && !/minmax|auto/.test(v)) return parts.length;
    }
    const g = getComputedStyle(row).gridTemplateColumns;
    if (!g || g === "none") return 0;
    return g.split(" ").filter(x => x && x !== "none").length;
  }

  function ensureLayout() {
    const cols = new Map();
    state.tiles.forEach(t => {
      const cell = cellOf(t.el);
      t.cell = cell;
      if (!cell) return;
      const row = cell.parentElement;
      const col = row && row.parentElement;
      if (!row || !col) return;
      let e = cols.get(col);
      if (!e) { e = { rows: new Map(), n: -1, mixed: false, allRows: true }; cols.set(col, e); }
      e.rows.set(row, rowKind(row));
      const kind = rowKind(row);
      if (!kind) e.allRows = false;
      const n = Number(col.dataset.igxCols || 0) || rowColCount(row, kind);
      if (n < 2) e.allRows = false;
      if (e.n === -1) e.n = n; else if (n !== e.n) e.mixed = true;
    });

    cols.forEach((e, col) => {
      if (e.mixed || !e.allRows || e.n < 2) { col.dataset.igxFlat = "0"; return; }
      // only flatten when every child of the column is one of our rows
      const kids = Array.from(col.children);
      const allRows = kids.length > 0 && kids.every(k => k.dataset.igxRow === "1" || rowKind(k));
      if (!allRows) { col.dataset.igxFlat = "0"; return; }
      const alreadyFlat = col.dataset.igxFlat === "1" && Number(col.dataset.igxCols) === e.n;
      if (!alreadyFlat || getComputedStyle(col).display !== "grid") {
        col.style.setProperty("display", "grid", "important");
        col.style.setProperty("grid-template-columns", "repeat(" + e.n + ", 1fr)", "important");
        col.dataset.igxCols = String(e.n);
        col.dataset.igxFlat = "1";
      }
      e.rows.forEach((kind, row) => {
        if (row.dataset.igxRow !== "1" || getComputedStyle(row).display !== "contents") {
          row.style.setProperty("display", "contents", "important");
          row.dataset.igxRow = "1";
          row.dataset.igxKind = kind === "flex" ? "flex" : "grid";
        }
      });
    });
  }

  // ---------- render ----------
  function applySort() {
    const mode = state.settings.sort;
    const tiles = state.tiles;

    // group by the container the items actually live in (flattened col or row)
    const groups = new Map();
    tiles.forEach((t, i) => {
      const orig = Number(t.el.dataset.igxOrd || i);
      let node = t.cell || t.el;
      let container = node.parentElement;
      if (container && container.dataset && container.dataset.igxRow === "1") container = container.parentElement;
      if (!container) return;
      if (!groups.has(container)) groups.set(container, []);
      groups.get(container).push({ t, node, orig });
    });

    groups.forEach((list, container) => {
      let desired;
      if (mode === "original") {
        desired = list.slice().sort((a, b) => a.orig - b.orig);
      } else {
        const byTile = new Map(list.map(x => [x.t, x]));
        desired = sortTiles(list.map(x => x.t)).map(t => byTile.get(t)).filter(Boolean);
      }

      const disp = getComputedStyle(container).display;
      const canOrder = /flex|grid/.test(disp);

      if (mode === "original") {
        // clear stale order / restore DOM order only if we physically reordered before
        const needsClear = list.some(x => x.node.style.order);
        const domOrderSame = desired.every((x, i) => x.node === list[i].node);
        if (needsClear) desired.forEach(x => { x.node.style.order = ""; });
        if (!domOrderSame) desired.forEach(x => container.appendChild(x.node));
        return;
      }

      if (canOrder) {
        // order styles are attribute mutations -> only write when changed (observer is childList-only, but stay cheap)
        desired.forEach((x, i) => { const v = String(i); if (x.node.style.order !== v) x.node.style.order = v; });
      } else {
        const domOrderSame = desired.every((x, i) => x.node === list[i].node);
        if (!domOrderSame) desired.forEach(x => container.appendChild(x.node));
      }
    });
  }

  function ensureOverlayNodes(t) {
    const a = t.el;
    a.dataset.igx = "1";
    if (!a.dataset.igxOrd) a.dataset.igxOrd = String(state.tiles.indexOf(t));
    if (getComputedStyle(a).position === "static") a.style.position = "relative";

    // badge
    let badgeEl = a.querySelector(":scope > .igx-badge");
    if (state.settings.overlay.badges) {
      if (!badgeEl) { badgeEl = el("span", "igx-badge", a); }
      const bits = [t.type.toUpperCase()];
      if (t.type === "reel" || t.type === "video") { const d = fmtDur(t.media.duration); if (d) bits.push(d); if (t.media.res) bits.push(t.media.res + "p"); }
      if (t.type === "image" && t.media.w) bits.push(t.media.w + "w");
      if (t.pinned) bits.push("pin");
      if (t.foreign) bits.push("other");
      if (t.noCaption) bits.push("nocap");
      if (t.dupIndex > 0) bits.push("dup" + (t.dupIndex + 1));
      if (t.capDupCount > 0) bits.push("capdup");
      if (t.auto) bits.push("auto");
      badgeEl.textContent = bits.join(" · ");
      badgeEl.dataset.type = t.type;
    } else if (badgeEl) badgeEl.remove();

    // border
    a.classList.toggle("igx-border", !!state.settings.overlay.borders);
    a.dataset.igxType = t.type;
    if (t.foreign) a.dataset.igxForeign = "1"; else delete a.dataset.igxForeign;
    if (t.pinned) a.dataset.igxPinned = "1"; else delete a.dataset.igxPinned;
    if (t.noCaption) a.dataset.igxNocap = "1"; else delete a.dataset.igxNocap;
  }

  function buildStats() {
    const tiles = state.tiles;
    const byType = { image: 0, reel: 0, carousel: 0, video: 0 };
    const byLang = { sw: 0, en: 0, none: 0, other: 0 };
    const tags = new Map(), mentions = new Map();
    let shown = 0, dupes = 0, auto = 0, durSum = 0, durN = 0, capSum = 0;
    let foreign = 0, noCap = 0, pinned = 0, capDupes = 0;
    tiles.forEach(t => {
      byType[t.type] = (byType[t.type] || 0) + 1;
      byLang[t.lang] = (byLang[t.lang] || 0) + 1;
      if (t.match) shown++;
      if (t.dupIndex > 0) dupes++;
      if (t.auto) auto++;
      if (t.foreign) foreign++;
      if (t.noCaption) noCap++;
      if (t.pinned) pinned++;
      if (t.capDupIndex > 0) capDupes++;
      capSum += t.captionLen;
      if (t.media.duration != null) { durSum += t.media.duration; durN++; }
      t.hashtags.forEach(h => tags.set(h, (tags.get(h) || 0) + 1));
      t.mentions.forEach(m => mentions.set(m, (mentions.get(m) || 0) + 1));
    });
    const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
    const route = currentRoute();
    const prof = state.profile;
    return {
      total: tiles.length, shown, hidden: tiles.length - shown,
      byType, byLang, dupes, auto,
      foreign, noCaption: noCap, pinned, captionDupes: capDupes,
      route, profile: prof,
      loadedVsTotal: prof && prof.posts ? tiles.length + "/" + prof.posts : null,
      avgCaption: tiles.length ? Math.round(capSum / tiles.length) : 0,
      avgDuration: durN ? Math.round(durSum / durN) : null,
      topHashtags: top(tags, 10),
      topMentions: top(mentions, 10)
    };
  }

  function render() {
    const s = state.settings;
    ensureLayout();
    const topIds = new Set(sortTiles(state.tiles.filter(t => t.match)).slice(0, Number(s.topN) || 0).map(t => t.shortcode));
    state.tiles.forEach(t => {
      t.score = scoreOf(t);
      t.match = matches(t);
      ensureOverlayNodes(t);

      const hide = (s.filters.mode === "hide" && !t.match);
      t.el.classList.toggle("igx-hide", hide);
      // hide the grid cell too so the track collapses and siblings reflow (no gaps)
      if (t.cell) t.cell.classList.toggle("igx-hide-cell", hide);
      const dim = (s.overlay.dimNonMatching && !t.match) || (s.filters.mode === "highlight" && !t.match);
      t.el.classList.toggle("igx-dim", !!dim && !hide);
      t.el.classList.toggle("igx-match", s.filters.mode === "highlight" && t.match);
      t.el.classList.toggle("igx-top", s.filters.mode !== "highlight" && t.match && topIds.has(t.shortcode));
      t.el.classList.toggle("igx-selected", state.selected === t.shortcode);

      if (s.overlay.aria) {
        const cap = t.caption.replace(/\s+/g, " ").slice(0, 140);
        const extra = (t.pinned ? ". Pinned post" : "") + (t.foreign ? ". From @" + t.owner : "") + (t.noCaption ? ". No caption" : "");
        t.el.setAttribute("aria-label", `${t.type} post ${t.shortcode}${cap ? ". " + cap : ""}${extra}. Score ${t.score}`);
      } else t.el.removeAttribute("aria-label");
    });
    applySort();
    state.stats = buildStats();
    state.listeners.forEach(fn => { try { fn(state.stats, state.settings); } catch (e) {} });
  }

  // ---------- tooltip ----------
  let tip = null;
  function ensureTip() {
    if (tip && tip.isConnected) return tip;
    tip = document.createElement("div");
    tip.className = "igx-tip";
    tip.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;display:none;max-width:340px;";
    document.documentElement.appendChild(tip);
    return tip;
  }
  function bindTooltip() {
    document.addEventListener("mouseover", (e) => {
      if (!state.settings.overlay.tooltip) return;
      const a = e.target.closest && e.target.closest('a[data-igx="1"]');
      if (!a) return;
      const t = state.tiles.find(x => x.el === a);
      if (!t) return;
      const tipEl = ensureTip();
      const rows = [];
      rows.push(`<b style="color:#ff5c8a">${t.type.toUpperCase()}</b> · ${t.shortcode} · <span style="color:#8ecbff">${t.lang}</span>`);
      if (t.pinned) rows.push(`<span style="color:#ffd166">📌 pinned post</span>`);
      if (t.foreign) rows.push(`<span style="color:#ff9f43">from @${t.owner} (not this profile)</span>`);
      if (t.media.duration != null) rows.push(`duration ${fmtDur(t.media.duration)}${t.media.res ? " · " + t.media.res + "p" : ""}`);
      else if (t.media.w) rows.push(`source ${t.media.w}×${t.media.h || "?"}${t.aspect ? " · display ratio " + t.aspect : ""}`);
      if (t.dupIndex > 0 || t.dupCount > 0) rows.push(`duplicate #${t.dupIndex + 1}${t.dupCount ? " (+" + t.dupCount + " more)" : ""}`);
      if (t.capDupCount > 0) rows.push(`same caption as ${t.capDupCount} other tile${t.capDupCount > 1 ? "s" : ""}`);
      if (t.hashtags.length) rows.push(`#${t.hashtags.slice(0, 8).join(" #")}`);
      if (t.mentions.length) rows.push(`@${t.mentions.slice(0, 6).join(" @")}`);
      if (t.noCaption) rows.push(`<span style="opacity:.6">no caption on thumbnail</span>`);
      if (t.caption) {
        const cap = t.caption.replace(/\s+/g, " ");
        const lim = Number(state.settings.overlay.tipChars);
        const shown = (lim > 0 && cap.length > lim) ? cap.slice(0, lim) + "…" : cap;
        rows.push(`<span style="opacity:.85">${shown}</span>`);
      }
      tipEl.innerHTML = rows.join("<br>");
      tipEl.style.display = "block";
      const r = a.getBoundingClientRect();
      let x = r.left, y = r.bottom + 8;
      const tw = 350, th = tipEl.offsetHeight;
      if (x + tw > innerWidth - 8) x = innerWidth - tw - 8;
      if (y + th > innerHeight - 8) y = Math.max(8, r.top - th - 8);
      tipEl.style.left = x + "px"; tipEl.style.top = y + "px";
    });
    document.addEventListener("mouseout", (e) => {
      if (!tip) return;
      const a = e.target.closest && e.target.closest('a[data-igx="1"]');
      if (a && tip) tip.style.display = "none";
    });
    window.addEventListener("scroll", () => { if (tip) tip.style.display = "none"; }, { passive: true });
  }

  // ---------- inspect mode ----------
  function bindInspect() {
    document.addEventListener("click", (e) => {
      if (!state.settings.inspect) return;
      const a = e.target.closest && e.target.closest('a[data-igx="1"]');
      if (!a) return;
      e.preventDefault(); e.stopPropagation();
      const t = state.tiles.find(x => x.el === a);
      if (t) {
        state.selected = t.shortcode;
        render();
        state.listeners.forEach(fn => { try { fn("selected", t); } catch (e) {} });
      }
    }, true);
  }

  // ---------- public API ----------
  const IGX = {
    get settings() { return state.settings; },
    getTiles() {
      return state.tiles.map(t => ({
        index: state.tiles.indexOf(t),
        shortcode: t.shortcode,
        url: "https://www.instagram.com" + t.href,
        type: t.type, badge: t.badge, lang: t.lang,
        owner: t.owner, foreign: t.foreign, pinned: t.pinned,
        caption: t.caption, captionLen: t.captionLen, noCaption: t.noCaption,
        hashtags: t.hashtags, mentions: t.mentions,
        autoCaption: t.auto,
        captionDupIndex: t.capDupIndex, captionDupCount: t.capDupCount,
        duration: t.media.duration, resolution: t.media.res,
        mediaWidth: t.media.w, mediaHeight: t.media.h,
        aspect: t.aspect, mediaUrl: t.media.src ? t.media.src.split("?")[0] : null,
        dupIndex: t.dupIndex, dupCount: t.dupCount,
        score: t.score, matches: t.match, selected: state.selected === t.shortcode
      }));
    },
    getSelected() { return state.selected ? state.tiles.find(t => t.shortcode === state.selected) || null : null; },
    select(sc) { state.selected = sc; render(); },
    getStats() { return state.stats || buildStats(); },
    getProfile() { return state.profile; },
    getRoute() { return currentRoute(); },
    rescan() {
      state.profile = parseProfileHeader();
      scan();
      state.tiles.forEach((t, i) => { t.order = i; });
      render();
      return state.stats;
    },
    applySettings(next, save = true) {
      state.settings = Object.assign(clone(DEFAULTS), next);
      ["filters", "score", "overlay"].forEach(k => {
        if (next[k]) state.settings[k] = Object.assign(clone(DEFAULTS[k]), next[k]);
      });
      if (save) chrome.storage.local.set({ igxSettings: state.settings });
      render();
      return state.settings;
    },
    onChange(fn) { state.listeners.push(fn); },
    defaults: clone(DEFAULTS)
  };
  window.IGX = IGX;

  // ---------- messaging ----------
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "IGX_TOGGLE") {
      if (window.IGXPanel) window.IGXPanel.toggle();
      sendResponse({ ok: true });
    } else if (msg && msg.type === "IGX_RESCAN") {
      sendResponse({ ok: true, stats: IGX.rescan() });
    }
    return false;
  });

  // ---------- boot ----------
  function bindRoute() {
    const check = () => {
      const path = location.pathname;
      if (path === state.lastPath) return;
      state.lastPath = path;
      state.selected = null;
      IGX.rescan();
    };
    state.lastPath = location.pathname;
    const wrap = (fn) => function (...args) {
      const r = fn.apply(this, args);
      setTimeout(check, 400); // IG re-renders after navigation
      return r;
    };
    try {
      history.pushState = wrap(history.pushState);
      history.replaceState = wrap(history.replaceState);
    } catch (e) { /* ignore */ }
    window.addEventListener("popstate", () => setTimeout(check, 400));
  }

  function boot() {
    chrome.storage.local.get(["igxSettings"], (res) => {
      state.settings = IGX.applySettings(res.igxSettings || clone(DEFAULTS), false);
      IGX.rescan();
      bindTooltip();
      bindInspect();
      bindRoute();
      // lazy rescan on IG's infinite scroll / re-render
      let timer = null;
      const mo = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          const before = state.tiles.length;
          const now = document.querySelectorAll('a[data-igx="1"]').length;
          if (now !== before || document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]').length !== before) IGX.rescan();
          else render();
        }, 350);
      });
      mo.observe(document.body, { childList: true, subtree: true });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.igxSettings) {
          state.settings = IGX.applySettings(changes.igxSettings.newValue, false);
        }
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
