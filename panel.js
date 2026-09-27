// IG Explore Toolbox - floating panel UI (content script, shadow DOM)
(() => {
  if (window.IGXPanel) return;

  let host = null, root = null, visible = false, drag = null;

  const CSS = `
:host{all:initial}
.wrap{position:fixed;top:46px;right:14px;width:376px;max-height:calc(100vh - 60px);z-index:2147483000;
 display:flex;flex-direction:column;font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:#e9e9ee;
 background:linear-gradient(180deg,#1b1b22,#14141a);border:1px solid rgba(255,255,255,.14);border-radius:14px;
 box-shadow:0 18px 50px rgba(0,0,0,.55);overflow:hidden}
.hdr{display:flex;align-items:center;gap:8px;padding:9px 11px;background:rgba(255,255,255,.05);
 cursor:grab;user-select:none;border-bottom:1px solid rgba(255,255,255,.09)}
.hdr b{font-size:13px;letter-spacing:.02em}
.hdr .dot{width:8px;height:8px;border-radius:50%;background:#ff5c8a;box-shadow:0 0 8px #ff5c8a}
.hdr .sp{flex:1}
.btn{cursor:pointer;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);color:#e9e9ee;
 border-radius:8px;padding:4px 9px;font-size:12px}
.btn:hover{background:rgba(255,255,255,.15)}
.btn.pri{background:#ff3d71;border-color:#ff3d71;color:#fff}
.tabs{display:flex;gap:4px;padding:8px 9px 0}
.tab{flex:1;text-align:center;padding:6px 4px;font-size:11.5px;border-radius:8px 8px 0 0;cursor:pointer;
 background:rgba(255,255,255,.04);border:1px solid transparent;border-bottom:none;color:#a9a9b8}
.tab.on{background:rgba(255,255,255,.1);color:#fff;border-color:rgba(255,255,255,.14)}
.body{padding:10px 11px;overflow:auto;flex:1}
.body::-webkit-scrollbar{width:8px}.body::-webkit-scrollbar-thumb{background:#3a3a46;border-radius:8px}
.pane{display:none}.pane.on{display:block}
.row{display:flex;align-items:center;gap:7px;margin:7px 0;flex-wrap:wrap}
.row label{font-size:12px;color:#c9c9d6}
.row input[type=text],.row input[type=number],.row select{
 flex:1;min-width:70px;background:#0f0f14;border:1px solid rgba(255,255,255,.16);color:#eee;
 border-radius:7px;padding:5px 7px;font-size:12px}
.chk{display:flex;align-items:center;gap:6px;font-size:12px;margin:5px 0;cursor:pointer;color:#c9c9d6}
.chk input{accent-color:#ff3d71;width:15px;height:15px}
.sect{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:#7d7d90;margin:12px 0 5px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:5px 10px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px}
.stat{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:9px;padding:7px;text-align:center}
.stat b{display:block;font-size:17px}
.stat span{font-size:10px;color:#9a9aa c}
.bar{height:7px;border-radius:5px;background:rgba(255,255,255,.09);overflow:hidden;margin:3px 0 7px}
.bar i{display:block;height:100%;background:linear-gradient(90deg,#ff3d71,#ff9f43)}
.kv{display:grid;grid-template-columns:118px 1fr;gap:3px 8px;font-size:11.5px;margin:6px 0}
.kv div:nth-child(odd){color:#8e8ea4}
.kv div:nth-child(even){color:#e9e9ee;word-break:break-all}
.pill{display:inline-block;padding:1px 7px;border-radius:20px;font-size:10.5px;background:rgba(255,255,255,.1);
 border:1px solid rgba(255,255,255,.16);margin:2px 3px 2px 0}
.tag{cursor:pointer}.tag:hover{background:rgba(255,61,113,.35)}
.list{max-height:190px;overflow:auto;border:1px solid rgba(255,255,255,.1);border-radius:8px}
.li{padding:5px 8px;font-size:11.5px;border-bottom:1px solid rgba(255,255,255,.06);cursor:pointer;
 display:flex;gap:6px;align-items:center}
.li:hover{background:rgba(255,255,255,.07)}
.li .t{font-size:9.5px;padding:1px 5px;border-radius:5px;background:#2a2a36;color:#ffd166;text-transform:uppercase}
.li .c{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#b9b9c8}
.note{font-size:11px;color:#8e8ea4;margin-top:6px}
.foot{display:flex;gap:6px;padding:8px 11px;border-top:1px solid rgba(255,255,255,.09);background:rgba(0,0,0,.22)}
.foot .btn{flex:1;text-align:center}
`;

  const html = `
<div class="wrap" id="wrap">
  <div class="hdr" id="hdr"><span class="dot"></span><b>IG Explore Toolbox</b><span class="sp"></span>
    <button class="btn" id="refresh" title="Re-scan grid">⟳</button>
    <button class="btn" id="close">✕</button></div>
  <div class="tabs">
    <div class="tab on" data-p="filters">Filters</div>
    <div class="tab" data-p="sort">Sort</div>
    <div class="tab" data-p="overlay">Overlay</div>
    <div class="tab" data-p="inspect">Inspect</div>
    <div class="tab" data-p="export">Export</div>
  </div>
  <div class="body">

    <div class="pane on" data-p="filters">
      <div class="sect">Post type</div>
      <div class="grid2">
        <label class="chk"><input type="checkbox" id="t-image"> Image</label>
        <label class="chk"><input type="checkbox" id="t-reel"> Reel</label>
        <label class="chk"><input type="checkbox" id="t-carousel"> Carousel</label>
        <label class="chk"><input type="checkbox" id="t-video"> Video</label>
      </div>
      <div class="sect">Caption language</div>
      <div class="row"><select id="f-lang">
        <option value="any">Any</option><option value="sw">Swahili</option>
        <option value="en">English</option><option value="none">No caption</option>
        <option value="other">Other</option></select></div>
      <div class="sect">Keywords (comma separated)</div>
      <div class="row"><label>Must contain</label><input type="text" id="f-inc" placeholder="kweli, mabeste"></div>
      <div class="row"><label>Must NOT</label><input type="text" id="f-exc" placeholder="giveaway, ads"></div>
      <div class="row"><label>#hashtag</label><input type="text" id="f-tag" placeholder="construction"></div>
      <div class="sect">Rules</div>
      <div class="row"><label>Min caption length</label><input type="number" id="f-min" min="0" step="10"></div>
      <label class="chk"><input type="checkbox" id="f-dup"> Hide duplicate shortcodes</label>
      <div class="row"><label>Non-matching</label>
        <select id="f-mode"><option value="hide">Hide</option><option value="highlight">Highlight only</option></select></div>
      <div class="row"><button class="btn" id="f-reset">Reset filters</button></div>
      <div class="note">Filters survive Instagram's infinite scroll — the grid re-applies them on every re-render.</div>
    </div>

    <div class="pane" data-p="sort">
      <div class="sect">Reorder grid by</div>
      <div class="row"><select id="s-mode">
        <option value="original">Original order</option>
        <option value="newest">Newest first (shortcode)</option>
        <option value="oldest">Oldest first (shortcode)</option>
        <option value="score">Custom score</option>
        <option value="caption">Caption length</option>
      </select></div>
      <div class="note">Shortcodes encode the media ID, so sorting by them approximates upload time.</div>
      <div class="sect">Score weights</div>
      <div class="grid2">
        <div class="row"><label>Reel</label><input type="number" id="w-reel" step="0.5"></div>
        <div class="row"><label>Video</label><input type="number" id="w-video" step="0.5"></div>
        <div class="row"><label>Image</label><input type="number" id="w-image" step="0.5"></div>
        <div class="row"><label>Carousel</label><input type="number" id="w-carousel" step="0.5"></div>
        <div class="row"><label>Per 100 caption chars</label><input type="number" id="w-cap" step="0.5"></div>
        <div class="row"><label>Per hashtag</label><input type="number" id="w-tag" step="0.5"></div>
      </div>
      <div class="row"><label>Boost keywords</label><input type="text" id="w-kw" placeholder="construction, mabeste"></div>
      <div class="row"><label>Glow top N matches</label><input type="number" id="s-topn" min="0" max="36"></div>
    </div>

    <div class="pane" data-p="overlay">
      <div class="sect">Visual layer</div>
      <label class="chk"><input type="checkbox" id="o-badge"> Corner badges (type · duration · resolution)</label>
      <label class="chk"><input type="checkbox" id="o-border"> Color-coded borders by type</label>
      <label class="chk"><input type="checkbox" id="o-tip"> Hover tooltip (full caption + metadata)</label>
      <label class="chk"><input type="checkbox" id="o-dim"> Dim non-matching tiles</label>
      <label class="chk"><input type="checkbox" id="o-aria"> Inject accessible aria-labels</label>
      <div class="note">Badge colors: pink = Reel, orange = Video, blue = Carousel, green = Image.</div>
      <div class="sect">Legend / live counts</div>
      <div id="legend"></div>
    </div>

    <div class="pane" data-p="inspect">
      <div class="stats" id="stats"></div>
      <div class="sect">Caption language split</div>
      <div id="langbars"></div>
      <div class="sect">Top hashtags (click to filter)</div>
      <div id="tags"></div>
      <div class="sect">Top mentions</div>
      <div id="ments"></div>
      <div class="sect">All tiles (click = select)</div>
      <div class="list" id="tiles"></div>
      <div class="sect">Selected tile attributes</div>
      <div id="sel"><div class="note">Enable Inspect-mode click in the Overlay tab… or just click any row above.</div></div>
    </div>

    <div class="pane" data-p="export">
      <div class="sect">Export current grid</div>
      <div class="row"><button class="btn pri" id="x-csv">Download CSV</button>
        <button class="btn" id="x-json">Download JSON</button></div>
      <div class="row"><button class="btn" id="x-cap">Copy all captions</button>
        <button class="btn" id="x-urls">Copy media URLs</button></div>
      <div class="sect">Inspect mode</div>
      <label class="chk"><input type="checkbox" id="x-inspect"> Click a tile in the grid to pin its full attribute dump</label>
      <div class="note">CSV columns: shortcode, type, badge, lang, caption, hashtags, mentions, duration, resolution, dimensions, aspect, dup index, score, URL.</div>
    </div>
  </div>
  <div class="foot">
    <button class="btn" id="f-rescan">Re-scan grid</button>
    <button class="btn" id="f-restore">Restore defaults</button>
  </div>
</div>`;

  function $(id) { return root.getElementById(id); }

  function mount() {
    if (host && host.isConnected) return;
    host = document.createElement("div");
    host.id = "igx-panel-host";
    root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style>${html}`;
    document.documentElement.appendChild(host);
    wire();
    syncInputs();
    paint();
  }

  function toggle() {
    mount();
    visible = !visible;
    root.getElementById("wrap").style.display = visible ? "flex" : "none";
    if (visible) { syncInputs(); paint(); }
  }

  // ---------- helpers ----------
  function set(k, v) {
    const s = JSON.parse(JSON.stringify(window.IGX.settings));
    const path = k.split(".");
    let o = s;
    for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
    o[path[path.length - 1]] = v;
    window.IGX.applySettings(s);
    paint();
  }
  function get(k) {
    const s = window.IGX.settings;
    return k.split(".").reduce((o, p) => (o ? o[p] : undefined), s);
  }
  const on = (id, ev, fn) => { const e = $(id); if (e) e.addEventListener(ev, fn); };

  function syncInputs() {
    const s = window.IGX.settings;
    ["image", "reel", "carousel", "video"].forEach(t => { const e = $("t-" + t); if (e) e.checked = !!s.filters.types[t]; });
    $("f-lang").value = s.filters.lang;
    $("f-inc").value = s.filters.includeKw; $("f-exc").value = s.filters.excludeKw;
    $("f-tag").value = s.filters.hashtag; $("f-min").value = s.filters.minCaption;
    $("f-dup").checked = s.filters.hideDupes; $("f-mode").value = s.filters.mode;
    $("s-mode").value = s.sort;
    $("w-reel").value = s.score.reel; $("w-video").value = s.score.video;
    $("w-image").value = s.score.image; $("w-carousel").value = s.score.carousel;
    $("w-cap").value = s.score.captionPer100; $("w-tag").value = s.score.perHashtag;
    $("w-kw").value = s.score.keywords; $("s-topn").value = s.topN;
    $("o-badge").checked = s.overlay.badges; $("o-border").checked = s.overlay.borders;
    $("o-tip").checked = s.overlay.tooltip; $("o-dim").checked = s.overlay.dimNonMatching;
    $("o-aria").checked = s.overlay.aria;
    $("x-inspect").checked = !!s.inspect;
  }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }

  function paint() {
    if (!root || !visible) return;
    const st = window.IGX.getStats();
    if (!st) return;

    $("stats").innerHTML = [
      ["Tiles", st.total], ["Shown", st.shown], ["Hidden", st.hidden],
      ["Reels", (st.byType.reel || 0) + (st.byType.video || 0)], ["Images", st.byType.image || 0],
      ["Carousels", st.byType.carousel || 0], ["Dupes", st.dupes], ["Auto/OCR", st.auto],
      ["Avg cap", st.avgCaption]
    ].map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join("");

    const maxL = Math.max(1, ...Object.values(st.byLang));
    $("langbars").innerHTML = Object.entries(st.byLang).map(([k, v]) =>
      `<label>${k} (${v})</label><div class="bar"><i style="width:${(v / maxL) * 100}%"></i></div>`).join("");

    $("tags").innerHTML = st.topHashtags.length
      ? st.topHashtags.map(([h, n]) => `<span class="pill tag" data-tag="${esc(h)}">#${esc(h)} · ${n}</span>`).join("")
      : `<div class="note">No hashtags in current captions.</div>`;
    root.querySelectorAll(".tag").forEach(n => n.onclick = () => { $("f-tag").value = n.dataset.tag; set("filters.hashtag", n.dataset.tag); });

    $("ments").innerHTML = st.topMentions.length
      ? st.topMentions.map(([m, n]) => `<span class="pill">@${esc(m)} · ${n}</span>`).join("")
      : `<div class="note">No mentions found.</div>`;

    $("legend").innerHTML = ["reel", "video", "carousel", "image"].map(t =>
      `<span class="pill">${t}: ${st.byType[t] || 0}</span>`).join("") +
      `<div class="note">${st.shown}/${st.total} tiles currently visible under active filters.</div>`;

    const tiles = window.IGX.getTiles();
    $("tiles").innerHTML = tiles.map(t =>
      `<div class="li" data-sc="${esc(t.shortcode)}"><span class="t">${t.type.slice(0, 4)}</span>
       <span class="c">${esc(t.caption.replace(/\s+/g, " ").slice(0, 70)) || "—"}</span>
       <span style="color:#7d7d90">${t.matches ? "✓" : "✕"}</span></div>`).join("");
    root.querySelectorAll(".li").forEach(n => n.onclick = () => { window.IGX.select(n.dataset.sc); paint(); });

    const sel = window.IGX.getSelected();
    if (sel) {
      const t = tiles.find(x => x.shortcode === sel.shortcode) || {};
      $("sel").innerHTML = `<div class="kv">
        <div>shortcode</div><div>${esc(sel.shortcode)}</div>
        <div>type / badge</div><div>${esc(sel.type)} / ${esc(sel.badge || "—")}</div>
        <div>language</div><div>${esc(sel.lang)}</div>
        <div>caption length</div><div>${sel.captionLen}${sel.autoCaption ? " (auto/OCR)" : ""}</div>
        <div>duration</div><div>${sel.duration != null ? Math.round(sel.duration) + "s" : "—"}</div>
        <div>resolution</div><div>${sel.resolution ? sel.resolution + "p" : "—"}</div>
        <div>media size</div><div>${sel.mediaWidth || "?"} × ${sel.mediaHeight || "?"}</div>
        <div>display ratio</div><div>${sel.aspect || "—"}</div>
        <div>duplicate</div><div>${sel.dupIndex > 0 ? "yes, occurrence #" + (sel.dupIndex + 1) : "no"}</div>
        <div>score / match</div><div>${sel.score} / ${sel.matches ? "✓" : "✕"}</div>
        <div>href</div><div>${esc(sel.url)}</div>
        <div>media URL</div><div>${esc(sel.mediaUrl || "—")}</div>
        <div>hashtags</div><div>${(sel.hashtags || []).map(h => "#" + esc(h)).join(" ") || "—"}</div>
        <div>mentions</div><div>${(sel.mentions || []).map(m => "@" + esc(m)).join(" ") || "—"}</div>
        <div>caption</div><div>${esc(sel.caption) || "—"}</div>
      </div>`;
    }
  }

  // ---------- export ----------
  function download(name, text, mime) {
    const b = new Blob([text], { type: mime });
    const u = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = u; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  }
  const q = (s) => '"' + String(s == null ? "" : s).replace(/"/g, '""') + '"';

  function wire() {
    root.querySelectorAll(".tab").forEach(t => t.onclick = () => {
      root.querySelectorAll(".tab").forEach(x => x.classList.toggle("on", x === t));
      root.querySelectorAll(".pane").forEach(p => p.classList.toggle("on", p.dataset.p === t.dataset.p));
      paint();
    });
    $("close").onclick = () => { visible = false; $("wrap").style.display = "none"; };
    $("refresh").onclick = $("f-rescan").onclick = () => { window.IGX.rescan(); paint(); };
    $("f-restore").onclick = () => { window.IGX.applySettings(window.IGX.defaults); syncInputs(); paint(); };

    ["image", "reel", "carousel", "video"].forEach(t =>
      on("t-" + t, "change", e => set("filters.types." + t, e.target.checked)));
    on("f-lang", "change", e => set("filters.lang", e.target.value));
    on("f-inc", "input", e => set("filters.includeKw", e.target.value));
    on("f-exc", "input", e => set("filters.excludeKw", e.target.value));
    on("f-tag", "input", e => set("filters.hashtag", e.target.value.replace(/^#/, "")));
    on("f-min", "input", e => set("filters.minCaption", Number(e.target.value) || 0));
    on("f-dup", "change", e => set("filters.hideDupes", e.target.checked));
    on("f-mode", "change", e => set("filters.mode", e.target.value));
    $("f-reset").onclick = () => {
      const s = JSON.parse(JSON.stringify(window.IGX.settings));
      s.filters = JSON.parse(JSON.stringify(window.IGX.defaults.filters));
      window.IGX.applySettings(s); syncInputs(); paint();
    };

    on("s-mode", "change", e => set("sort", e.target.value));
    [["w-reel", "reel"], ["w-video", "video"], ["w-image", "image"], ["w-carousel", "carousel"],
     ["w-cap", "captionPer100"], ["w-tag", "perHashtag"]].forEach(([id, key]) =>
      on(id, "input", e => set("score." + key, Number(e.target.value) || 0)));
    on("w-kw", "input", e => set("score.keywords", e.target.value));
    on("s-topn", "input", e => set("topN", Number(e.target.value) || 0));

    [["o-badge", "badges"], ["o-border", "borders"], ["o-tip", "tooltip"],
     ["o-dim", "dimNonMatching"], ["o-aria", "aria"]].forEach(([id, key]) =>
      on(id, "change", e => set("overlay." + key, e.target.checked)));
    on("x-inspect", "change", e => set("inspect", e.target.checked));

    on("x-csv", "click", () => {
      const rows = window.IGX.getTiles();
      const head = ["shortcode", "type", "badge", "lang", "caption", "hashtags", "mentions",
        "duration_s", "resolution", "width", "height", "aspect", "dup_index", "score", "matches", "url"];
      const csv = [head.join(",")].concat(rows.map(t => [
        t.shortcode, t.type, t.badge || "", t.lang, t.caption, (t.hashtags || []).join(" "),
        (t.mentions || []).join(" "), t.duration != null ? Math.round(t.duration) : "",
        t.resolution || "", t.mediaWidth || "", t.mediaHeight || "", t.aspect || "",
        t.dupIndex, t.score, t.matches, t.url
      ].map(q).join(","))).join("\r\n");
      download("ig-explore-" + Date.now() + ".csv", csv, "text/csv");
    });
    on("x-json", "click", () => download("ig-explore-" + Date.now() + ".json",
      JSON.stringify({ exportedAt: new Date().toISOString(), stats: window.IGX.getStats(), tiles: window.IGX.getTiles() }, null, 2),
      "application/json"));
    on("x-cap", "click", () => {
      const txt = window.IGX.getTiles().map(t => `[${t.shortcode}] ${t.caption}`).join("\n\n");
      navigator.clipboard.writeText(txt).then(() => { $("x-cap").textContent = "Copied ✓"; setTimeout(() => $("x-cap").textContent = "Copy all captions", 1400); });
    });
    on("x-urls", "click", () => {
      const txt = window.IGX.getTiles().map(t => t.mediaUrl || t.url).join("\n");
      navigator.clipboard.writeText(txt).then(() => { $("x-urls").textContent = "Copied ✓", setTimeout(() => $("x-urls").textContent = "Copy media URLs", 1400); });
    });

    // drag by header
    const hdr = $("hdr"), wrap = $("wrap");
    hdr.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      const r = wrap.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      hdr.style.cursor = "grabbing";
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!drag) return;
      wrap.style.left = Math.max(0, Math.min(innerWidth - 80, e.clientX - drag.dx)) + "px";
      wrap.style.top = Math.max(0, Math.min(innerHeight - 40, e.clientY - drag.dy)) + "px";
      wrap.style.right = "auto";
    });
    window.addEventListener("mouseup", () => { drag = null; hdr.style.cursor = "grab"; });
  }

  window.IGXPanel = { toggle, mount, get visible() { return visible; } };

  window.IGX.onChange((payload, extra) => {
    if (payload === "selected") { paint(); return; }
    syncInputs(); paint();
  });
})();
