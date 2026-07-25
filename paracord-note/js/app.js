/* Paracord Note — app.js (router + screen rendering) */

const app = document.getElementById("app");
let activeFilters = new Set();
let currentSort = "newest";
let toastTimer = null;

/* ---------------- utils ---------------- */
function h(strings, ...vals) {
  return strings.reduce((acc, s, i) => acc + s + (vals[i] !== undefined ? vals[i] : ""), "");
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function nl2br(s) { return esc(s).replace(/\n/g, "<br>"); }
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
function toast(msg) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}
function nav(hash) { location.hash = hash; }
function qsParse(str) {
  const out = {};
  if (!str) return out;
  str.replace(/^\?/, "").split("&").forEach((pair) => {
    if (!pair) return;
    const [k, v] = pair.split("=");
    out[decodeURIComponent(k)] = decodeURIComponent(v || "");
  });
  return out;
}
function fileToDataUrl(file, quality) {
  const maxDim = { low: 480, medium: 900, high: 1400 }[quality || "medium"] || 900;
  const jq = { low: 0.55, medium: 0.72, high: 0.85 }[quality || "medium"] || 0.72;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
          else { width = Math.round(width * (maxDim / height)); height = maxDim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", jq));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function difficultyStars(n) {
  if (!n) return `<span class="small-note">未設定</span>`;
  return `<span class="difficulty-stars">${"★".repeat(n)}${"☆".repeat(5 - n)}</span>`;
}
function featureLabel(t) {
  return { flat: "平たい編み目", round: "丸い編み目", twist: "ねじれる編み目", unknown: "未確認" }[t] || "未確認";
}
function catLabel(id) { return (CATEGORIES.find((c) => c.id === id) || {}).label || id; }
function colorById(id) { return Repo.getColors().find((c) => c.id === id) || null; }
function colorSwatchCss(c) {
  if (!c) return "background:#eee";
  if (c.type === "solid") return `background:${c.hex}`;
  if (c.type === "pattern") return `background:${c.swatchCss}`;
  if (c.type === "photo") return `background-image:url(${c.photoImage});background-size:cover;background-position:center`;
  return "background:#eee";
}

/* ---------------- router ---------------- */
window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", () => { applyTheme(); route(); });

function applyTheme() {
  const meta = Repo.db().meta;
  document.documentElement.setAttribute("data-theme", meta.theme === "dark" ? "dark" : "light");
  const scale = { S: 0.92, M: 1, L: 1.12 }[meta.textSize] || 1;
  document.documentElement.style.setProperty("--text-scale", scale);
}

function route() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [pathPart, queryPart] = raw.split("?");
  const segs = pathPart.split("/").filter(Boolean);
  const query = qsParse(queryPart);
  const root = segs[0] || "home";
  window.scrollTo(0, 0);

  if (root === "home") return screenHome();
  if (root === "patterns") {
    if (segs[1] === "new") return screenPatternForm(null);
    if (segs[1] && segs[2] === "edit") return screenPatternForm(segs[1]);
    if (segs[1] && segs[2] === "steps") return screenSteps(segs[1], query);
    if (segs[1]) return screenPatternDetail(segs[1]);
    return screenPatternList(query);
  }
  if (root === "palette") {
    if (segs[1] === "saved" && segs[2]) return screenSavedPaletteDetail(segs[2]);
    if (segs[1] === "saved") return screenSavedPalettes();
    if (segs[1]) return screenPaletteBuilder(segs[1]);
    return screenPaletteChoose();
  }
  if (root === "explore") return screenExplore(segs[1]);
  if (root === "favorites") return screenFavorites();
  if (root === "records") {
    if (segs[1] === "new") return screenRecordForm(null);
    if (segs[1] && segs[2] === "edit") return screenRecordForm(segs[1]);
    if (segs[1]) return screenRecordDetail(segs[1]);
    return screenRecords();
  }
  if (root === "lengths") return screenLengths();
  if (root === "settings") return screenSettings();
  return screenHome();
}

/* ---------------- shell pieces ---------------- */
function topbarSearch(active) {
  return h`
  <div class="topbar">
    <div class="topbar-row">
      <div class="brand"><span class="brand-icon">🪢</span>${esc(Repo.db().meta.appName)}</div>
      <button class="icon-btn" data-nav="#/settings">⚙️</button>
    </div>
    <form class="search-box" id="search-form">
      <span>🔍</span>
      <input id="search-input" type="text" placeholder="編み方・タグ・作品名で検索（例：平編み／4ミリ）" value="${esc(active || "")}">
    </form>
  </div>`;
}
function bottomNav(active) {
  const items = [
    { id: "home", label: "ホーム", icon: "🏠", href: "#/home" },
    { id: "patterns", label: "編み方", icon: "🧵", href: "#/patterns" },
    { id: "palette", label: "配色", icon: "🎨", href: "#/palette" },
    { id: "records", label: "記録", icon: "📒", href: "#/records" },
    { id: "settings", label: "設定", icon: "⚙️", href: "#/settings" },
  ];
  return h`<nav class="bottom-nav">
    ${items.map((it) => `<a class="nav-item ${it.id === active ? "active" : ""}" href="${it.href}">
      <span class="nav-icon">${it.icon}</span>${it.label}</a>`).join("")}
  </nav>`;
}
function render(bodyHtml, navActive) {
  app.innerHTML = bodyHtml + bottomNav(navActive);
  bindGlobalEvents();
}

function bindGlobalEvents() {
  app.querySelectorAll("[data-nav]").forEach((el) => el.addEventListener("click", () => nav(el.dataset.nav)));
  const searchForm = document.getElementById("search-form");
  if (searchForm) searchForm.addEventListener("submit", (e) => { e.preventDefault(); nav("#/patterns?q=" + encodeURIComponent(document.getElementById("search-input").value)); });
}

/* ---------------- ホーム ---------------- */
function screenHome() {
  const db = Repo.db();
  const recent = db.recentlyViewed.map((id) => Repo.getPattern(id)).filter(Boolean).slice(0, 6);
  const favPatterns = db.favorites.patterns.map((id) => Repo.getPattern(id)).filter(Boolean).slice(0, 6);

  const tiles = [
    { icon: "🧵", label: "編み方を見る", sub: "一覧から探す", href: "#/patterns" },
    { icon: "🎨", label: "色を組み合わせる", sub: "完成イメージを確認", href: "#/palette" },
    { icon: "➕", label: "編み方を登録する", sub: "自分の編み方を追加", href: "#/patterns/new" },
    { icon: "🎒", label: "作りたいものから探す", sub: "作品カテゴリで探す", href: "#/explore" },
    { icon: "⭐", label: "お気に入り", sub: "よく使うものだけ", href: "#/favorites" },
    { icon: "📒", label: "制作メモ", sub: "作品の記録を残す", href: "#/records" },
  ];

  render(h`
    ${topbarSearch()}
    <div class="screen">
      <div class="home-grid">
        ${tiles.map((t) => `<button class="home-tile" data-nav="${t.href}">
          <span class="tile-icon">${t.icon}</span>
          <span class="tile-label">${t.label}</span>
          <span class="tile-sub">${t.sub}</span>
        </button>`).join("")}
      </div>

      <div class="section-heading"><h2>最近見た編み方</h2><a class="link-more" data-nav="#/patterns">すべて見る</a></div>
      ${recent.length ? `<div class="hscroll">${recent.map(miniCard).join("")}</div>` : `<div class="empty-hint">まだ見た編み方がありません。編み方一覧から探してみましょう。</div>`}

      <div class="section-heading"><h2>お気に入り</h2><a class="link-more" data-nav="#/favorites">すべて見る</a></div>
      ${favPatterns.length ? `<div class="hscroll">${favPatterns.map(miniCard).join("")}</div>` : `<div class="empty-hint">お気に入り登録した編み方はまだありません。</div>`}
    </div>
  `, "home");
}
function miniCard(p) {
  return h`<a class="pattern-card mini" href="#/patterns/${p.id}">
    <div class="thumb">${p.coverImage ? `<img src="${p.coverImage}">` : "写真未登録"}</div>
    <div class="body"><h3>${esc(p.name)}</h3>${difficultyStars(p.difficulty)}</div>
  </a>`;
}

/* ---------------- 編み方一覧 ---------------- */
function screenPatternList(query) {
  const q = query.q || "";
  let list = searchPatterns(q);
  list = filterPatterns(list, activeFilters);
  list = sortPatterns(list, currentSort);

  render(h`
    ${topbarSearch(q)}
    <div class="screen">
      <div class="section-heading" style="margin-top:14px">
        <h2>編み方一覧（${list.length}件）</h2>
        <button class="link-more" id="filter-toggle">絞り込み・並び替え</button>
      </div>
      <div class="filter-panel" id="filter-panel" style="display:none">
        <div class="filter-group-title">並び替え</div>
        <div class="filter-chips">
          ${SORTS.map((s) => `<button class="chip ${currentSort === s.id ? "active" : ""}" data-sort="${s.id}">${s.label}</button>`).join("")}
        </div>
        <div class="filter-group-title">絞り込み</div>
        <div class="filter-chips">
          ${FILTERS.map((f) => `<button class="chip ${activeFilters.has(f.id) ? "active" : ""}" data-filter="${f.id}">${f.label}</button>`).join("")}
        </div>
        ${activeFilters.size ? `<div style="margin-top:10px"><button class="btn btn-outline btn-sm" id="clear-filters">絞り込みをリセット</button></div>` : ""}
      </div>

      <div class="pattern-list">
        ${list.length ? list.map(fullCard).join("") : `<div class="empty-hint">条件に一致する編み方が見つかりませんでした。</div>`}
      </div>
      <button class="btn btn-primary btn-block" style="margin-top:18px" data-nav="#/patterns/new">＋ 新しい編み方を登録する</button>
    </div>
  `, "patterns");

  document.getElementById("filter-toggle").addEventListener("click", () => {
    const p = document.getElementById("filter-panel");
    p.style.display = p.style.display === "none" ? "block" : "none";
  });
  app.querySelectorAll("[data-sort]").forEach((el) => el.addEventListener("click", () => { currentSort = el.dataset.sort; screenPatternList(query); }));
  app.querySelectorAll("[data-filter]").forEach((el) => el.addEventListener("click", () => {
    const f = el.dataset.filter;
    activeFilters.has(f) ? activeFilters.delete(f) : activeFilters.add(f);
    screenPatternList(query);
  }));
  const clearBtn = document.getElementById("clear-filters");
  if (clearBtn) clearBtn.addEventListener("click", () => { activeFilters.clear(); screenPatternList(query); });
  app.querySelectorAll("[data-fav]").forEach((el) => el.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    Repo.toggleFavorite("patterns", el.dataset.fav);
    screenPatternList(query);
  }));
}
function fullCard(p) {
  const fav = Repo.isFavorite("patterns", p.id);
  return h`<a class="pattern-card" href="#/patterns/${p.id}">
    <div class="thumb">
      ${p.coverImage ? `<img src="${p.coverImage}">` : "完成写真未登録"}
      ${p.isSample ? `<span class="badge sample">サンプル</span>` : `<span class="badge">登録編み方</span>`}
      <button class="fav-btn ${fav ? "active" : ""}" data-fav="${p.id}">${fav ? "★" : "☆"}</button>
    </div>
    <div class="body">
      <h3>${esc(p.name)}</h3>
      <div class="meta-row">
        <span>${difficultyStars(p.difficulty)}</span>
        <span>紐${p.strandCount != null ? p.strandCount + "本" : "未設定"}</span>
        <span>${featureLabel(p.featureType)}</span>
        ${(p.suitableItems || []).slice(0, 2).map((c) => `<span>${catLabel(c)}</span>`).join("")}
      </div>
    </div>
  </a>`;
}

/* ---------------- 編み方詳細 ---------------- */
function screenPatternDetail(id) {
  const p = Repo.getPattern(id);
  if (!p) return render(`<div class="screen">見つかりませんでした。</div>` , "patterns");
  Repo.touchViewed(id);
  const fav = Repo.isFavorite("patterns", id);
  const resume = Repo.getResumePosition(id);
  const relatedRecords = Repo.getRecords().filter((r) => r.patternId === id);

  render(h`
    <div class="topbar">
      <div class="topbar-row">
        <button class="icon-btn" data-nav="#/patterns">←</button>
        <div class="brand" style="font-size:15px">編み方詳細</div>
        <button class="icon-btn" id="fav-toggle">${fav ? "★" : "☆"}</button>
      </div>
    </div>
    <div class="screen">
      <div class="hero-photo" id="hero-photo">${p.coverImage ? `<img src="${p.coverImage}">` : "完成写真未登録"}</div>
      ${!p.verified ? `<div class="unverified-banner">⚠️ この編み方は「未確認」です。名称・手順の正確さはご自身でもご確認ください。</div>` : ""}
      <div class="detail-title">${esc(p.name)}</div>
      <div class="detail-aliases">${(p.aliases || []).length ? "別名：" + p.aliases.map(esc).join("、") : "別名：登録なし"}</div>

      <div class="info-grid">
        <div class="info-cell"><div class="label">難易度</div><div class="value">${difficultyStars(p.difficulty)}</div></div>
        <div class="info-cell"><div class="label">編み目の特徴</div><div class="value">${featureLabel(p.featureType)}</div></div>
        <div class="info-cell"><div class="label">紐の本数</div><div class="value">${p.strandCount != null ? p.strandCount + "本" : "未設定"}</div></div>
        <div class="info-cell"><div class="label">芯紐の本数</div><div class="value">${p.coreStrandCount != null ? p.coreStrandCount + "本" : "未設定"}</div></div>
      </div>

      ${infoBlock("完成時の形", p.finishedShape)}
      ${infoBlock("おすすめのパラコードの太さ", p.recommendedThickness)}
      ${infoBlock("向いている作品", (p.suitableItems || []).map(catLabel).join("、"))}
      ${infoBlock("必要な道具", (p.tools || []).join("、"))}
      ${infoBlock("紐の長さの目安", p.lengthGuideNote || "（登録なし。個体差があるため断定できません）")}
      ${infoBlock("注意点", p.cautions)}
      ${infoBlock("失敗しやすいポイント", p.pitfalls)}
      ${(p.tags || []).length ? `<div class="tag-input-row" style="margin-bottom:14px">${p.tags.map((t) => `<span class="tag-chip">#${esc(t)}</span>`).join("")}</div>` : ""}
      ${p.referenceUrl ? `<div class="info-block"><div class="label">参考URL</div><div class="value"><a href="${esc(p.referenceUrl)}" target="_blank" rel="noopener" style="color:var(--orange-dark);word-break:break-all">${esc(p.referenceUrl)}</a></div></div>` : ""}

      <h2 class="block-title">制作メモ（この編み方を使った記録）</h2>
      ${relatedRecords.length ? relatedRecords.map((r) => `<a class="info-block" style="display:block" href="#/records/${r.id}"><div class="label">${fmtDate(r.madeDate)}</div><div class="value">${esc(r.workName || "無題")}</div></a>`).join("") : `<div class="empty-hint">この編み方の制作メモはまだありません。</div>`}

      <div class="action-row">
        ${p.steps.length
          ? `<button class="btn btn-primary" data-nav="#/patterns/${id}/steps${resume ? "?at=" + resume.stepIndex : ""}">${resume ? "続きから手順を見る" : "手順を見る"}</button>`
          : `<button class="btn btn-outline" disabled>手順は未登録です</button>`}
        <button class="btn btn-secondary" data-nav="#/patterns/${id}/edit">編集</button>
      </div>
      <div class="action-row">
        <button class="btn btn-outline" id="dup-btn">複製する</button>
        <button class="btn btn-danger" id="del-btn">削除する</button>
      </div>
    </div>
  `, "patterns");

  document.getElementById("fav-toggle").addEventListener("click", () => { Repo.toggleFavorite("patterns", id); screenPatternDetail(id); });
  document.getElementById("dup-btn").addEventListener("click", () => { const c = Repo.duplicatePattern(id); toast("複製しました"); nav("#/patterns/" + c.id); });
  document.getElementById("del-btn").addEventListener("click", () => {
    if (confirm(`「${p.name}」を削除します。よろしいですか？`)) { Repo.deletePattern(id); toast("削除しました"); nav("#/patterns"); }
  });
  const hero = document.getElementById("hero-photo").querySelector("img");
  if (hero) hero.addEventListener("click", () => openImageViewer(p.coverImage));
}
function infoBlock(label, value) {
  return h`<div class="info-block"><div class="label">${label}</div><div class="value">${value ? nl2br(value) : `<span class="small-note">未登録</span>`}</div></div>`;
}

/* ---------------- 工程（手順）画面 ---------------- */
function screenSteps(id, query) {
  const p = Repo.getPattern(id);
  if (!p || !p.steps.length) return render(`<div class="screen">手順が登録されていません。<button class="btn btn-primary" data-nav="#/patterns/${id}/edit">工程を登録する</button></div>${bottomNav("patterns")}`, "patterns");
  let idx = parseInt(query.at || "0", 10);
  if (isNaN(idx) || idx < 0) idx = 0;
  if (idx > p.steps.length - 1) idx = p.steps.length - 1;
  const step = p.steps[idx];
  const strandClass = ["left", "right", "core", "A", "B", "C"].includes(step.movingStrand) ? "strand-" + step.movingStrand : "strand-core";
  const strandLabel = { left: "左の紐", right: "右の紐", core: "芯紐", A: "紐A", B: "紐B", C: "紐C" }[step.movingStrand] || (step.movingStrand || "紐");

  render(h`
    <div class="topbar">
      <div class="topbar-row">
        <button class="icon-btn" data-nav="#/patterns/${id}">←</button>
        <div class="brand" style="font-size:15px">${esc(p.name)}</div>
        <span style="width:38px"></span>
      </div>
      <div class="step-progress">
        <div class="step-progress-bar"><div class="step-progress-fill" style="width:${((idx + 1) / p.steps.length) * 100}%"></div></div>
        <div class="step-progress-label">${idx + 1} / ${p.steps.length} 工程</div>
      </div>
    </div>
    <div class="screen">
      <div class="step-photo" id="step-photo">
        ${step.image ? `<img src="${step.image}">` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted)">工程画像未登録</div>`}
        ${step.image ? `<div class="zoom-hint">タップで拡大 🔍</div>` : ""}
      </div>
      ${step.media && step.media.type && step.media.type !== "image" && step.media.src ? `
        <div class="speed-row">
          ${[0.5, 1, 1.5].map((r) => `<button class="chip" data-speed="${r}">${r}倍</button>`).join("")}
        </div>` : ""}
      <span class="strand-tag ${strandClass}"><span class="dot"></span>動かす紐：${esc(strandLabel)}</span>
      <div class="step-desc">${nl2br(step.description) || "説明未登録"}</div>
      ${step.caution ? `<div class="step-caution">⚠️ ${nl2br(step.caution)}</div>` : ""}

      <label class="settings-row" style="padding:12px 0">
        <span class="row-label" style="font-size:13px">ここまで完了</span>
        <span class="switch ${step.completeCheck ? "on" : ""}" id="complete-switch"></span>
      </label>

      <div class="step-nav">
        <button class="btn btn-outline" id="prev-btn" ${idx === 0 ? "disabled" : ""}>← 前へ</button>
        <button class="btn btn-primary" id="next-btn">${idx === p.steps.length - 1 ? "手順完了" : "次へ →"}</button>
      </div>
    </div>
  `, "patterns");

  Repo.setResumePosition(id, idx);

  document.getElementById("prev-btn").addEventListener("click", () => nav(`#/patterns/${id}/steps?at=${idx - 1}`));
  document.getElementById("next-btn").addEventListener("click", () => {
    if (idx === p.steps.length - 1) {
      Repo.clearResumePosition(id);
      Repo.bumpUseCount(id);
      toast("お疲れさまでした！手順が完了しました");
      nav(`#/patterns/${id}`);
    } else {
      nav(`#/patterns/${id}/steps?at=${idx + 1}`);
    }
  });
  document.getElementById("complete-switch").addEventListener("click", (e) => {
    step.completeCheck = !step.completeCheck;
    Repo.upsertPattern(p);
    e.target.classList.toggle("on", step.completeCheck);
  });
  const img = document.getElementById("step-photo").querySelector("img");
  if (img) img.addEventListener("click", () => openImageViewer(step.image));
}

/* ---------------- 画像拡大ビューア ---------------- */
function openImageViewer(src) {
  if (!src) return;
  const wrap = document.createElement("div");
  wrap.className = "viewer-backdrop";
  wrap.innerHTML = `<button class="viewer-close">✕</button><img src="${src}">`;
  wrap.addEventListener("click", (e) => { if (e.target === wrap || e.target.classList.contains("viewer-close")) wrap.remove(); });
  document.body.appendChild(wrap);
}

/* ---------------- 作りたいものから探す ---------------- */
function screenExplore(categoryId) {
  if (!categoryId) {
    render(h`
      <div class="topbar"><div class="topbar-row"><div class="brand" style="font-size:17px">作りたいものから探す</div><span></span></div></div>
      <div class="screen">
        <p class="small-note">作品カテゴリを選ぶと、向いている編み方を表示します。</p>
        <div class="category-grid">
          ${CATEGORIES.map((c) => `<a class="category-tile" href="#/explore/${c.id}"><span class="cat-icon">${categoryIcon(c.id)}</span>${c.label}</a>`).join("")}
        </div>
      </div>
    `, "home");
    return;
  }
  const list = Repo.getPatterns().filter((p) => (p.suitableItems || []).includes(categoryId));
  render(h`
    <div class="topbar"><div class="topbar-row"><button class="icon-btn" data-nav="#/explore">←</button><div class="brand" style="font-size:16px">${catLabel(categoryId)}</div><span style="width:38px"></span></div></div>
    <div class="screen">
      <div class="pattern-list">
        ${list.length ? list.map(fullCard).join("") : `<div class="empty-hint">この作品向けに登録された編み方はまだありません。編み方の編集画面で「向いている作品」を設定すると、ここに表示されます。</div>`}
      </div>
    </div>
  `, "home");
  app.querySelectorAll("[data-fav]").forEach((el) => el.addEventListener("click", (e) => { e.preventDefault(); Repo.toggleFavorite("patterns", el.dataset.fav); screenExplore(categoryId); }));
}
function categoryIcon(id) {
  return { phone_shoulder: "📱", hand_strap: "🎋", neck_strap: "🪢", keyholder: "🔑", bag_charm: "🎒", bracelet: "⌚", dog_leash: "🐕", bottle_holder: "🍶", zipper_tab: "🤏", accessory: "💍", other: "✨" }[id] || "🧶";
}

/* ---------------- お気に入り ---------------- */
function screenFavorites() {
  const db = Repo.db();
  const pats = db.favorites.patterns.map((id) => Repo.getPattern(id)).filter(Boolean);
  const pals = db.favorites.palettes.map((id) => Repo.getPalette(id)).filter(Boolean);
  const recs = db.favorites.records.map((id) => Repo.getRecord(id)).filter(Boolean);
  render(h`
    <div class="topbar"><div class="topbar-row"><div class="brand" style="font-size:17px">お気に入り</div><span></span></div></div>
    <div class="screen">
      <h2 class="block-title">編み方</h2>
      <div class="pattern-list">${pats.length ? pats.map(fullCard).join("") : `<div class="empty-hint">登録がありません。</div>`}</div>
      <h2 class="block-title">配色</h2>
      ${pals.length ? pals.map(paletteRow).join("") : `<div class="empty-hint">登録がありません。</div>`}
      <h2 class="block-title">制作メモ</h2>
      ${recs.length ? recs.map(recordRow).join("") : `<div class="empty-hint">登録がありません。</div>`}
    </div>
  `, "home");
  app.querySelectorAll("[data-fav]").forEach((el) => el.addEventListener("click", (e) => { e.preventDefault(); Repo.toggleFavorite("patterns", el.dataset.fav); screenFavorites(); }));
}
function paletteRow(pal) {
  const p = Repo.getPattern(pal.patternId);
  return h`<a class="info-block" style="display:block" href="#/palette/saved/${pal.id}"><div class="label">${p ? esc(p.name) : "編み方不明"}</div><div class="value">${esc(pal.name || "無題の配色")}</div></a>`;
}
function recordRow(r) {
  return h`<a class="info-block" style="display:block" href="#/records/${r.id}"><div class="label">${fmtDate(r.madeDate)}</div><div class="value">${esc(r.workName || "無題")}</div></a>`;
}

/* =====================================================================
   編み方の新規登録・編集
===================================================================== */
function screenPatternForm(id) {
  const editing = !!id;
  const src = editing ? Repo.getPattern(id) : null;
  const p = src ? JSON.parse(JSON.stringify(src)) : {
    id: null, isSample: false, name: "", aliases: [], coverImage: null,
    difficulty: null, difficultyLabel: "", featureType: "unknown", finishedShape: "",
    strandCount: null, coreStrandCount: null, recommendedThickness: "", suitableItems: [],
    tools: [], lengthGuideNote: "", cautions: "", pitfalls: "", tags: [], referenceUrl: "",
    visibility: "private", verified: true, steps: [], viewCount: 0, useCount: 0,
  };

  render(patternFormMarkup(p, editing), "patterns");
  wirePatternForm(p, editing);
}

function stepEditorItem(s, i, total) {
  const strandOpts = [["left", "左の紐"], ["right", "右の紐"], ["core", "芯紐"], ["A", "紐A"], ["B", "紐B"], ["C", "紐C"]];
  return h`<div class="step-editor-item" data-step-id="${s.id}">
    <div class="step-editor-head">
      <strong>工程 ${i + 1}</strong>
      <div class="reorder-btns">
        <button type="button" data-move="up" data-id="${s.id}" ${i === 0 ? "disabled" : ""}>↑</button>
        <button type="button" data-move="down" data-id="${s.id}" ${i === total - 1 ? "disabled" : ""}>↓</button>
        <button type="button" data-move="del" data-id="${s.id}">🗑</button>
      </div>
    </div>
    <div class="upload-box" style="margin-bottom:10px">
      ${s.image ? `<img src="${s.image}">` : ""}
      <input type="file" accept="image/*" style="display:none" class="step-img-input" data-id="${s.id}">
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button type="button" class="btn btn-secondary btn-sm step-img-pick" data-id="${s.id}">${s.image ? "画像を変更" : "画像を選ぶ"}</button>
        ${s.image ? `<button type="button" class="btn btn-outline btn-sm step-annotate" data-id="${s.id}">矢印・書き込み</button>` : ""}
      </div>
    </div>
    <div class="field"><label>動かす紐</label>
      <div class="pill-select">${strandOpts.map(([v, l]) => `<button type="button" class="pill strand-pill" data-id="${s.id}" data-strand="${v}" style="${s.movingStrand === v ? "background:var(--orange);border-color:var(--orange);color:#fff" : ""}">${l}</button>`).join("")}</div>
    </div>
    <div class="field"><label>説明文</label><textarea class="step-desc-input" data-id="${s.id}" placeholder="例：左側の白い紐を、芯紐の上を通して右側へ移動します">${esc(s.description)}</textarea></div>
    <div class="field"><label>注意点</label><input type="text" class="step-caution-input" data-id="${s.id}" value="${esc(s.caution)}"></div>
    <label class="settings-row" style="padding:8px 0">
      <span style="font-size:13px">内容確定（完了チェック）</span>
      <span class="switch step-complete-switch ${s.completeCheck ? "on" : ""}" data-id="${s.id}"></span>
    </label>
  </div>`;
}

// テキスト系フィールドはDOM上でのみ編集されるため、再描画（screenPatternFormPreserve）の直前に
// 必ずこの関数でp（状態オブジェクト）へ吸い上げてから再描画すること。さもないと入力内容が消える。
function collectPatternTopFields(p) {
  const $ = (sel) => app.querySelector(sel);
  const get = (sel) => { const el = $(sel); return el ? el.value : undefined; };
  if (get("#f-name") !== undefined) p.name = get("#f-name");
  if (get("#f-aliases") !== undefined) p.aliases = splitList(get("#f-aliases"));
  if (get("#f-shape") !== undefined) p.finishedShape = get("#f-shape");
  if (get("#f-strand") !== undefined) p.strandCount = get("#f-strand") === "" ? null : Number(get("#f-strand"));
  if (get("#f-core") !== undefined) p.coreStrandCount = get("#f-core") === "" ? null : Number(get("#f-core"));
  if (get("#f-thick") !== undefined) p.recommendedThickness = get("#f-thick");
  if (get("#f-tools") !== undefined) p.tools = splitList(get("#f-tools"));
  if (get("#f-length") !== undefined) p.lengthGuideNote = get("#f-length");
  if (get("#f-caution") !== undefined) p.cautions = get("#f-caution");
  if (get("#f-pitfall") !== undefined) p.pitfalls = get("#f-pitfall");
  if (get("#f-tags") !== undefined) p.tags = splitList(get("#f-tags"));
  if (get("#f-url") !== undefined) p.referenceUrl = get("#f-url");
}

function wirePatternForm(p, editing) {
  const $ = (sel) => app.querySelector(sel);
  const rerender = () => { collectPatternTopFields(p); screenPatternFormPreserve(p, editing); };

  $("#cover-pick").addEventListener("click", () => $("#cover-input").click());
  $("#cover-input").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    p.coverImage = await fileToDataUrl(f, Repo.db().meta.imageQuality);
    rerender();
  });

  app.querySelectorAll(".diff-pill").forEach((el) => el.addEventListener("click", () => { p.difficulty = Number(el.dataset.diff); p.difficultyLabel = p.difficulty === 1 ? "初心者向け" : ""; rerender(); }));
  app.querySelectorAll(".feat-pill").forEach((el) => el.addEventListener("click", () => { p.featureType = el.dataset.feat; rerender(); }));
  app.querySelectorAll(".item-pill").forEach((el) => el.addEventListener("click", () => {
    const id = el.dataset.item;
    const arr = p.suitableItems || (p.suitableItems = []);
    const i = arr.indexOf(id);
    i === -1 ? arr.push(id) : arr.splice(i, 1);
    rerender();
  }));
  app.querySelectorAll(".vis-pill").forEach((el) => el.addEventListener("click", () => { p.visibility = el.dataset.vis; rerender(); }));
  $("#verified-switch").addEventListener("click", (e) => { p.verified = !p.verified; e.target.classList.toggle("on", p.verified); });

  $("#add-step").addEventListener("click", () => {
    p.steps.push({ id: uid("step"), order: p.steps.length, image: null, media: { type: null, src: "", playbackRateDefault: 1 }, description: "", caution: "", movingStrand: "left", arrows: [], completeCheck: false });
    rerender();
  });
  $("#from-photos").addEventListener("click", () => { collectPatternTopFields(p); openPhotoImportModal(p, editing); });

  wireStepEditors(p, editing);

  $("#save-pattern").addEventListener("click", () => {
    collectPatternTopFields(p);
    p.name = p.name.trim();
    if (!p.name) { toast("編み方の名称を入力してください"); return; }
    p.finishedShape = (p.finishedShape || "").trim();
    p.recommendedThickness = (p.recommendedThickness || "").trim();
    p.lengthGuideNote = (p.lengthGuideNote || "").trim();
    p.cautions = (p.cautions || "").trim();
    p.pitfalls = (p.pitfalls || "").trim();
    p.referenceUrl = (p.referenceUrl || "").trim();
    p.tags.forEach((t) => Repo.addTag(t));
    p.steps.forEach((s, i) => { s.order = i; });
    const saved = Repo.upsertPattern(p);
    toast("保存しました");
    nav("#/patterns/" + saved.id);
  });
  const cancelBtn = $("#cancel-edit");
  if (cancelBtn) cancelBtn.addEventListener("click", () => nav(editing ? "#/patterns/" + p.id : "#/patterns"));
}
function splitList(str) { return str.split(/[、,]/).map((s) => s.trim()).filter(Boolean); }

// 再描画してもフォームの一時状態(p)を保持するためのラッパ
function screenPatternFormPreserve(p, editing) {
  const scrollY = window.scrollY;
  app.innerHTML = patternFormMarkup(p, editing) + bottomNav("patterns");
  bindGlobalEvents();
  wirePatternForm(p, editing);
  window.scrollTo(0, scrollY);
}
function patternFormMarkup(p, editing) {
  return h`
    <div class="topbar"><div class="topbar-row">
      <button class="icon-btn" data-nav="${editing ? "#/patterns/" + p.id : "#/patterns"}">←</button>
      <div class="brand" style="font-size:16px">${editing ? "編み方を編集" : "編み方を登録"}</div>
      <span style="width:38px"></span>
    </div></div>
    <div class="screen" id="form-screen">
      <div class="field">
        <label>完成写真</label>
        <div class="upload-box" id="cover-box">
          ${p.coverImage ? `<img src="${p.coverImage}">` : ""}
          <input type="file" accept="image/*" id="cover-input" style="display:none">
          <button type="button" class="btn btn-secondary btn-sm" id="cover-pick">${p.coverImage ? "写真を変更" : "写真を選ぶ"}</button>
        </div>
      </div>
      <div class="field"><label>編み方の名称 *</label><input type="text" id="f-name" value="${esc(p.name)}" placeholder="例：コブラステッチ"></div>
      <div class="field"><label>別名（カンマ区切りで複数入力可）</label><input type="text" id="f-aliases" value="${esc((p.aliases || []).join("、"))}" placeholder="例：スパイラルステッチ、スパイラルノット"></div>

      <div class="field"><label>難易度</label>
        <div class="pill-select">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="pill diff-pill ${p.difficulty === n ? "active" : ""}" data-diff="${n}">${"★".repeat(n)}</button>`).join("")}</div>
      </div>
      <div class="field"><label>編み目の特徴</label>
        <div class="pill-select">
          ${[["flat", "平たい"], ["round", "丸い"], ["twist", "ねじれる"], ["unknown", "未確認"]].map(([v, l]) => `<button type="button" class="pill feat-pill ${p.featureType === v ? "active" : ""}" data-feat="${v}">${l}</button>`).join("")}
        </div>
      </div>
      <div class="field"><label>完成時の形</label><input type="text" id="f-shape" value="${esc(p.finishedShape)}" placeholder="例：平たいベルト状"></div>

      <div class="field"><label>使用する紐の本数</label><input type="number" min="0" id="f-strand" value="${p.strandCount != null ? p.strandCount : ""}"></div>
      <div class="field"><label>芯紐の本数（0＝芯紐なし）</label><input type="number" min="0" id="f-core" value="${p.coreStrandCount != null ? p.coreStrandCount : ""}"></div>
      <div class="field"><label>おすすめのパラコードの太さ</label><input type="text" id="f-thick" value="${esc(p.recommendedThickness)}" placeholder="例：4mm"></div>

      <div class="field"><label>向いている作品</label>
        <div class="pill-select">${CATEGORIES.map((c) => `<button type="button" class="pill item-pill ${(p.suitableItems || []).includes(c.id) ? "active" : ""}" data-item="${c.id}">${c.label}</button>`).join("")}</div>
      </div>
      <div class="field"><label>必要な道具（カンマ区切り）</label><input type="text" id="f-tools" value="${esc((p.tools || []).join("、"))}" placeholder="例：ライター、ハサミ、バックル"></div>
      <div class="field"><label>紐の長さの目安（断定できない場合は空欄推奨）</label><textarea id="f-length">${esc(p.lengthGuideNote)}</textarea><div class="field-hint">締め具合や太さで変わるため、参考値として記載してください。</div></div>
      <div class="field"><label>注意点</label><textarea id="f-caution">${esc(p.cautions)}</textarea></div>
      <div class="field"><label>失敗しやすいポイント</label><textarea id="f-pitfall">${esc(p.pitfalls)}</textarea></div>
      <div class="field"><label>タグ（カンマ区切り）</label><input type="text" id="f-tags" value="${esc((p.tags || []).join("、"))}" placeholder="例：初心者向け、4ミリ"></div>
      <div class="field"><label>参考URL</label><input type="url" id="f-url" value="${esc(p.referenceUrl)}" placeholder="https://"></div>
      <div class="field"><label>公開設定</label>
        <div class="segmented"><button type="button" class="vis-pill ${p.visibility === "private" ? "active" : ""}" data-vis="private">非公開</button><button type="button" class="vis-pill ${p.visibility === "public" ? "active" : ""}" data-vis="public">公開</button></div>
        <div class="field-hint">v1では端末内保存のみのため、公開設定は将来の共有機能向けの準備項目です。</div>
      </div>
      <div class="field">
        <label class="settings-row" style="padding:10px 0">
          <span>手順・名称を確認済み</span>
          <span class="switch ${p.verified ? "on" : ""}" id="verified-switch"></span>
        </label>
      </div>

      <div class="divider"></div>
      <div class="section-heading"><h2>工程（手順）</h2><span class="small-note">${p.steps.length}件</span></div>
      <div id="steps-list">${p.steps.sort((a, b) => a.order - b.order).map((s, i) => stepEditorItem(s, i, p.steps.length)).join("")}</div>
      <div class="action-row">
        <button type="button" class="btn btn-secondary" id="add-step">＋ 工程を追加</button>
        <button type="button" class="btn btn-outline" id="from-photos">写真からまとめて追加</button>
      </div>

      <div class="divider"></div>
      <button type="button" class="btn btn-primary btn-block" id="save-pattern">保存する</button>
      ${editing ? `<button type="button" class="btn btn-outline btn-block" style="margin-top:10px" id="cancel-edit">キャンセル</button>` : ""}
    </div>
  `;
}

function wireStepEditors(p, editing) {
  const rerender = () => { collectPatternTopFields(p); screenPatternFormPreserve(p, editing); };
  app.querySelectorAll(".step-img-pick").forEach((el) => el.addEventListener("click", () => {
    const wrap = el.closest(".upload-box");
    const input = wrap.querySelector(".step-img-input");
    input.click();
  }));
  app.querySelectorAll(".step-img-input").forEach((el) => el.addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const step = p.steps.find((s) => s.id === el.dataset.id);
    step.image = await fileToDataUrl(f, Repo.db().meta.imageQuality);
    rerender();
  }));
  app.querySelectorAll(".step-annotate").forEach((el) => el.addEventListener("click", () => {
    const step = p.steps.find((s) => s.id === el.dataset.id);
    openAnnotator(step.image, (dataUrl) => { step.image = dataUrl; rerender(); });
  }));
  app.querySelectorAll(".strand-pill").forEach((el) => el.addEventListener("click", () => {
    const step = p.steps.find((s) => s.id === el.dataset.id);
    step.movingStrand = el.dataset.strand;
    rerender();
  }));
  app.querySelectorAll(".step-desc-input").forEach((el) => el.addEventListener("input", () => {
    const step = p.steps.find((s) => s.id === el.dataset.id);
    step.description = el.value;
  }));
  app.querySelectorAll(".step-caution-input").forEach((el) => el.addEventListener("input", () => {
    const step = p.steps.find((s) => s.id === el.dataset.id);
    step.caution = el.value;
  }));
  app.querySelectorAll(".step-complete-switch").forEach((el) => el.addEventListener("click", () => {
    const step = p.steps.find((s) => s.id === el.dataset.id);
    step.completeCheck = !step.completeCheck;
    el.classList.toggle("on", step.completeCheck);
  }));
  app.querySelectorAll("[data-move]").forEach((el) => el.addEventListener("click", () => {
    const id = el.dataset.id;
    const i = p.steps.findIndex((s) => s.id === id);
    if (el.dataset.move === "up" && i > 0) [p.steps[i - 1], p.steps[i]] = [p.steps[i], p.steps[i - 1]];
    if (el.dataset.move === "down" && i < p.steps.length - 1) [p.steps[i + 1], p.steps[i]] = [p.steps[i], p.steps[i + 1]];
    if (el.dataset.move === "del") { if (!confirm("この工程を削除しますか？")) return; p.steps.splice(i, 1); }
    p.steps.forEach((s, idx) => (s.order = idx));
    rerender();
  }));
}

/* ---- 写真からまとめて工程登録 ---- */
function openPhotoImportModal(p, editing) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = h`<div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-title">写真から工程をまとめて登録</div>
    <p class="small-note">撮影した順に複数の写真を選ぶと、その順番で工程として追加されます。追加後、各工程で説明文などを編集してください。</p>
    <input type="file" accept="image/*" multiple id="photo-import-input">
    <div class="action-row" style="margin-top:16px">
      <button class="btn btn-outline" id="photo-import-cancel">キャンセル</button>
    </div>
  </div>`;
  document.body.appendChild(backdrop);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });
  backdrop.querySelector("#photo-import-cancel").addEventListener("click", () => backdrop.remove());
  backdrop.querySelector("#photo-import-input").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files);
    for (const f of files) {
      const dataUrl = await fileToDataUrl(f, Repo.db().meta.imageQuality);
      p.steps.push({ id: uid("step"), order: p.steps.length, image: dataUrl, media: { type: null, src: "", playbackRateDefault: 1 }, description: "", caution: "", movingStrand: "left", arrows: [], completeCheck: false });
    }
    backdrop.remove();
    toast(files.length + "件の工程を追加しました。内容を編集してください");
    screenPatternFormPreserve(p, editing);
  });
}

/* ---- 画像への書き込み（矢印・丸囲み・番号・文字・トリミング） ---- */
function openAnnotator(imageSrc, onApply) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = h`<div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-title">画像に書き込む</div>
    <div class="annot-toolbar">
      <button class="chip active" data-tool="arrow">➚ 矢印</button>
      <button class="chip" data-tool="circle">◯ 丸囲み</button>
      <button class="chip" data-tool="number">① 番号</button>
      <button class="chip" data-tool="text">Ａ 文字</button>
      <button class="chip" data-tool="crop">✂ トリミング</button>
      <button class="chip" id="annot-undo">やり直す</button>
    </div>
    <div class="annot-canvas-wrap"><canvas id="annot-canvas"></canvas></div>
    <div class="action-row" style="margin-top:14px">
      <button class="btn btn-outline" id="annot-cancel">キャンセル</button>
      <button class="btn btn-primary" id="annot-apply">適用する</button>
    </div>
  </div>`;
  document.body.appendChild(backdrop);

  const canvas = backdrop.querySelector("#annot-canvas");
  const ctx = canvas.getContext("2d");
  const history = [];
  let tool = "arrow";
  let numberSeq = 1;
  let cropRect = null;

  const img = new Image();
  img.onload = () => {
    canvas.width = img.width; canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    history.push(canvas.toDataURL());
  };
  img.src = imageSrc;

  backdrop.querySelectorAll("[data-tool]").forEach((btn) => btn.addEventListener("click", () => {
    backdrop.querySelectorAll("[data-tool]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    tool = btn.dataset.tool;
  }));

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
    const t = e.touches ? e.touches[0] : e;
    return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
  }
  function pushHistory() { history.push(canvas.toDataURL()); }

  let dragStart = null;
  canvas.addEventListener("pointerdown", (e) => {
    dragStart = getPos(e);
    if (tool === "number") {
      drawNumber(dragStart, numberSeq++);
      pushHistory();
      dragStart = null;
    } else if (tool === "text") {
      const txt = prompt("表示する短い文字を入力してください（例：右へ）");
      if (txt) { drawText(dragStart, txt); pushHistory(); }
      dragStart = null;
    }
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!dragStart) return;
    const end = getPos(e);
    if (tool === "arrow") drawArrow(dragStart, end);
    if (tool === "circle") drawCircle(dragStart, end);
    if (tool === "crop") { cropRect = normRect(dragStart, end); drawCropOverlay(cropRect); }
    if (tool !== "crop") pushHistory();
    dragStart = null;
  });

  function drawArrow(a, b) {
    ctx.save();
    ctx.strokeStyle = "#FF7A30"; ctx.fillStyle = "#FF7A30"; ctx.lineWidth = Math.max(4, canvas.width * 0.01);
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const headLen = Math.max(18, canvas.width * 0.04);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - headLen * Math.cos(angle - Math.PI / 6), b.y - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(b.x - headLen * Math.cos(angle + Math.PI / 6), b.y - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawCircle(a, b) {
    const rx = Math.abs(b.x - a.x) / 2, ry = Math.abs(b.y - a.y) / 2;
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    ctx.save();
    ctx.strokeStyle = "#FF7A30"; ctx.lineWidth = Math.max(4, canvas.width * 0.01);
    ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(rx, 10), Math.max(ry, 10), 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  function drawNumber(p, n) {
    const r = Math.max(16, canvas.width * 0.035);
    ctx.save();
    ctx.fillStyle = "#FF7A30";
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = `bold ${r}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(n, p.x, p.y + 1);
    ctx.restore();
  }
  function drawText(p, txt) {
    const fontSize = Math.max(18, canvas.width * 0.045);
    ctx.save();
    ctx.font = `bold ${fontSize}px "Hiragino Sans",sans-serif`;
    ctx.strokeStyle = "#fff"; ctx.lineWidth = fontSize * 0.25; ctx.lineJoin = "round";
    ctx.strokeText(txt, p.x, p.y);
    ctx.fillStyle = "#FF7A30"; ctx.fillText(txt, p.x, p.y);
    ctx.restore();
  }
  function normRect(a, b) { return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }; }
  function drawCropOverlay(r) {
    ctx.putImageData ? null : null;
    const snapshot = history[history.length - 1];
    const im = new Image();
    im.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(im, 0, 0);
      ctx.save();
      ctx.strokeStyle = "#FF7A30"; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.restore();
    };
    im.src = snapshot;
  }

  backdrop.querySelector("#annot-undo").addEventListener("click", () => {
    if (history.length <= 1) return;
    history.pop();
    const im = new Image();
    im.onload = () => { canvas.width = im.width; canvas.height = im.height; ctx.drawImage(im, 0, 0); };
    im.src = history[history.length - 1];
    cropRect = null;
  });
  backdrop.querySelector("#annot-cancel").addEventListener("click", () => backdrop.remove());
  backdrop.querySelector("#annot-apply").addEventListener("click", () => {
    if (tool === "crop" && cropRect && cropRect.w > 4 && cropRect.h > 4) {
      const out = document.createElement("canvas");
      out.width = cropRect.w; out.height = cropRect.h;
      const octx = out.getContext("2d");
      const im = new Image();
      im.onload = () => {
        octx.drawImage(im, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, cropRect.w, cropRect.h);
        onApply(out.toDataURL("image/jpeg", 0.85));
        backdrop.remove();
      };
      im.src = history[history.length - 1];
    } else {
      onApply(canvas.toDataURL("image/jpeg", 0.85));
      backdrop.remove();
    }
  });
}

/* =====================================================================
   色の組み合わせ機能
===================================================================== */
function screenPaletteChoose() {
  const list = Repo.getPatterns();
  render(h`
    <div class="topbar"><div class="topbar-row"><div class="brand" style="font-size:17px">色を組み合わせる</div>
      <button class="icon-btn" data-nav="#/palette/saved">📁</button></div></div>
    <div class="screen">
      <p class="small-note">まず編み方を選んでください。紐の本数に合わせて色を選べます。</p>
      <div class="pattern-list">${list.map(fullCard).join("")}</div>
    </div>
  `, "palette");
  app.querySelectorAll(".pattern-card").forEach((el) => {
    el.setAttribute("href", el.getAttribute("href").replace("/patterns/", "/palette/"));
  });
  app.querySelectorAll("[data-fav]").forEach((el) => el.addEventListener("click", (e) => { e.preventDefault(); Repo.toggleFavorite("patterns", el.dataset.fav); screenPaletteChoose(); }));
}

function screenPaletteBuilder(patternId, existingAssignment, existingName) {
  const p = Repo.getPattern(patternId);
  if (!p) return nav("#/palette");
  const colors = Repo.getColors();
  const slots = [
    { key: "core", label: "芯紐", show: (p.coreStrandCount == null || p.coreStrandCount > 0) },
    { key: "A", label: "紐A", show: true },
    { key: "B", label: "紐B", show: p.strandCount == null || p.strandCount >= 2 },
    { key: "C", label: "紐C", show: p.strandCount != null && p.strandCount >= 3 },
  ].filter((s) => s.show);

  const state = { assignment: existingAssignment ? { ...existingAssignment } : { core: null, A: null, B: null, C: null }, name: existingName || "" };

  render(h`
    <div class="topbar"><div class="topbar-row"><button class="icon-btn" data-nav="#/palette">←</button><div class="brand" style="font-size:15px">${esc(p.name)}の配色</div><span style="width:38px"></span></div></div>
    <div class="screen">
      <div class="small-note">紐の本数：${p.strandCount != null ? p.strandCount + "本" : "未設定"} ／ 芯紐：${p.coreStrandCount != null ? p.coreStrandCount + "本" : "未設定"}</div>
      <h2 class="block-title">紐ごとの色を選ぶ</h2>
      <div id="slots">${slots.map((s) => slotHtml(s, state.assignment[s.key])).join("")}</div>

      <h2 class="block-title">完成イメージ</h2>
      <div class="preview-weave" id="preview">${previewHtml(p, slots, state.assignment)}</div>

      <div class="field" style="margin-top:16px">
        <label>配色名</label>
        <input type="text" id="palette-name" value="${esc(state.name)}" placeholder="例：レーンロープ青白">
      </div>
      <div class="action-row">
        <button class="btn btn-primary" id="save-palette-btn">配色を保存</button>
        <button class="btn btn-outline" id="save-image-btn">画像を保存</button>
      </div>
    </div>
  `, "palette");

  function refreshSlotUI() {
    document.getElementById("slots").innerHTML = slots.map((s) => slotHtml(s, state.assignment[s.key])).join("");
    document.getElementById("preview").innerHTML = previewHtml(p, slots, state.assignment);
    wireSlots();
  }
  function wireSlots() {
    app.querySelectorAll("[data-slot]").forEach((el) => el.addEventListener("click", () => {
      openColorPicker(colors, state.assignment[el.dataset.slot], (colorId) => { state.assignment[el.dataset.slot] = colorId; refreshSlotUI(); });
    }));
  }
  wireSlots();

  document.getElementById("save-palette-btn").addEventListener("click", () => {
    const name = document.getElementById("palette-name").value.trim();
    const saved = Repo.savePalette({ id: null, patternId, name: name || "無題の配色", assignment: state.assignment });
    toast("配色を保存しました");
    nav("#/palette/saved/" + saved.id);
  });
  document.getElementById("save-image-btn").addEventListener("click", () => {
    exportPreviewAsImage(p, slots, state.assignment, document.getElementById("palette-name").value.trim() || p.name);
  });
}
function slotHtml(s, colorId) {
  const c = colorById(colorId);
  return h`<div class="strand-slot" data-slot="${s.key}">
    <span class="slot-label"><span class="dot" style="width:10px;height:10px;background:var(--orange)"></span>${s.label}</span>
    <div style="display:flex;align-items:center;gap:10px">
      <span style="font-size:12.5px;color:var(--muted)">${c ? esc(c.name) : "色を選択"}</span>
      <span class="slot-swatch" style="${colorSwatchCss(c)}"></span>
    </div>
  </div>`;
}
function previewHtml(p, slots, assignment) {
  const bars = slots.map((s) => {
    const c = colorById(assignment[s.key]);
    return `<div class="preview-bar" style="${colorSwatchCss(c)}"></div>`;
  }).join("");
  return h`
    <div style="font-weight:800;font-size:13px;color:var(--muted)">${esc(p.name)}</div>
    ${Array.from({ length: 5 }).map(() => `<div class="preview-strand-row">${bars}</div>`).join("")}
    <div class="small-note" style="margin-top:6px">${featureLabel(p.featureType)}の編み目パターンに色を反映した簡易イメージです</div>
  `;
}
function openColorPicker(colors, selected, onPick) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = h`<div class="modal-sheet color-picker-modal">
    <div class="modal-handle"></div>
    <div class="modal-title">色を選ぶ</div>
    <div class="color-grid">
      ${colors.map((c) => `<div class="color-swatch ${selected === c.id ? "selected" : ""}" data-color="${c.id}" style="${colorSwatchCss(c)}"><span class="swatch-name">${esc(c.name)}</span></div>`).join("")}
    </div>
    <div class="divider"></div>
    <button class="btn btn-outline btn-block" id="add-photo-color">📷 実際のパラコードを撮影して登録</button>
    <input type="file" accept="image/*" capture="environment" id="photo-color-input" style="display:none">
  </div>`;
  document.body.appendChild(backdrop);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });
  backdrop.querySelectorAll("[data-color]").forEach((el) => el.addEventListener("click", () => { onPick(el.dataset.color); backdrop.remove(); }));
  backdrop.querySelector("#add-photo-color").addEventListener("click", () => backdrop.querySelector("#photo-color-input").click());
  backdrop.querySelector("#photo-color-input").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const dataUrl = await fileToDataUrl(f, "medium");
    const name = prompt("この色見本の名前を入力してください", "撮影した色") || "撮影した色";
    const c = Repo.addPhotoColor(name, dataUrl);
    onPick(c.id);
    backdrop.remove();
  });
}
function exportPreviewAsImage(p, slots, assignment, name) {
  const canvas = document.createElement("canvas");
  canvas.width = 640; canvas.height = 640;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#F4EFE7"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#2B2823"; ctx.font = "bold 26px sans-serif"; ctx.fillText(p.name, 24, 40);
  ctx.font = "16px sans-serif"; ctx.fillStyle = "#8A8579"; ctx.fillText(name, 24, 68);
  const barW = 60, gap = 12, startX = (canvas.width - (slots.length * barW + (slots.length - 1) * gap)) / 2;
  for (let row = 0; row < 6; row++) {
    slots.forEach((s, i) => {
      const c = colorById(assignment[s.key]);
      ctx.fillStyle = c && c.type === "solid" ? c.hex : (c ? "#C8CBCE" : "#DADADA");
      ctx.fillRect(startX + i * (barW + gap), 110 + row * 70, barW, 50);
    });
  }
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${name || p.name}.png`;
  a.click();
  toast("画像を保存しました");
}

function screenSavedPalettes() {
  const list = Repo.getPalettes().slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  render(h`
    <div class="topbar"><div class="topbar-row"><button class="icon-btn" data-nav="#/palette">←</button><div class="brand" style="font-size:16px">保存した配色</div><span style="width:38px"></span></div></div>
    <div class="screen">
      ${list.length ? list.map(paletteRow).join("") : `<div class="empty-hint">保存した配色はまだありません。</div>`}
    </div>
  `, "palette");
}
function screenSavedPaletteDetail(id) {
  const pal = Repo.getPalette(id);
  if (!pal) return nav("#/palette/saved");
  const p = Repo.getPattern(pal.patternId);
  const fav = Repo.isFavorite("palettes", id);
  const slots = [
    { key: "core", label: "芯紐" }, { key: "A", label: "紐A" }, { key: "B", label: "紐B" }, { key: "C", label: "紐C" },
  ].filter((s) => pal.assignment[s.key] !== undefined && (p ? true : true));

  render(h`
    <div class="topbar"><div class="topbar-row"><button class="icon-btn" data-nav="#/palette/saved">←</button><div class="brand" style="font-size:15px">${esc(pal.name)}</div>
      <button class="icon-btn" id="fav-toggle">${fav ? "★" : "☆"}</button></div></div>
    <div class="screen">
      <div class="preview-weave">${p ? previewHtml(p, slots.filter((s) => pal.assignment[s.key]), pal.assignment) : "編み方が見つかりません"}</div>
      <div class="info-grid">
        ${slots.filter((s) => pal.assignment[s.key]).map((s) => {
          const c = colorById(pal.assignment[s.key]);
          return `<div class="info-cell"><div class="label">${s.label}</div><div class="value">${c ? esc(c.name) : "未設定"}</div></div>`;
        }).join("")}
      </div>
      <div class="action-row">
        ${p ? `<button class="btn btn-secondary" data-nav="#/palette/${p.id}">この配色を編集</button>` : ""}
        <button class="btn btn-danger" id="del-pal">削除</button>
      </div>
    </div>
  `, "palette");
  document.getElementById("fav-toggle").addEventListener("click", () => { Repo.toggleFavorite("palettes", id); screenSavedPaletteDetail(id); });
  document.getElementById("del-pal").addEventListener("click", () => { if (confirm("この配色を削除しますか？")) { Repo.deletePalette(id); nav("#/palette/saved"); } });
}

/* =====================================================================
   制作メモ / 記録
===================================================================== */
function screenRecords() {
  const list = Repo.getRecords().slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  render(h`
    <div class="topbar"><div class="topbar-row"><div class="brand" style="font-size:17px">制作メモ</div>
      <button class="icon-btn" data-nav="#/lengths">📏</button></div></div>
    <div class="screen">
      <button class="btn btn-primary btn-block" data-nav="#/records/new" style="margin-bottom:16px">＋ 制作メモを追加</button>
      ${list.length ? list.map(recordCard).join("") : `<div class="empty-hint">まだ制作メモがありません。</div>`}
      <button class="btn btn-outline btn-block" data-nav="#/lengths" style="margin-top:10px">📏 紐の長さ記録一覧を見る</button>
    </div>
  `, "records");
}
function recordCard(r) {
  const p = r.patternId ? Repo.getPattern(r.patternId) : null;
  return h`<a class="record-card" href="#/records/${r.id}">
    <div class="thumb">${r.coverImage ? `<img src="${r.coverImage}">` : "写真未登録"}</div>
    <div class="body">
      <span class="status-pill ${r.status}">${r.status === "done" ? "完成" : "制作中"}</span>
      <h3 style="margin:0 0 4px;font-size:15px">${esc(r.workName || "無題の作品")}</h3>
      <div class="meta-row"><span>${fmtDate(r.madeDate)}</span>${p ? `<span>${esc(p.name)}</span>` : ""}</div>
    </div>
  </a>`;
}
function screenRecordDetail(id) {
  const r = Repo.getRecord(id);
  if (!r) return nav("#/records");
  const p = r.patternId ? Repo.getPattern(r.patternId) : null;
  const fav = Repo.isFavorite("records", id);
  const colors = (r.colorsUsed || []).map(colorById).filter(Boolean);

  render(h`
    <div class="topbar"><div class="topbar-row"><button class="icon-btn" data-nav="#/records">←</button><div class="brand" style="font-size:15px">制作メモ</div>
      <button class="icon-btn" id="fav-toggle">${fav ? "★" : "☆"}</button></div></div>
    <div class="screen">
      <div class="hero-photo">${r.coverImage ? `<img src="${r.coverImage}">` : "完成写真未登録"}</div>
      <span class="status-pill ${r.status}" style="margin-top:12px">${r.status === "done" ? "完成" : "制作中"}</span>
      <div class="detail-title">${esc(r.workName || "無題の作品")}</div>
      <div class="detail-aliases">${fmtDate(r.madeDate)}${p ? " ／ " + esc(p.name) : ""}</div>

      ${r.status === "in_progress" && p ? `<button class="btn btn-primary btn-block" style="margin-bottom:14px" data-nav="#/patterns/${p.id}/steps${r.currentStepIndex != null ? "?at=" + r.currentStepIndex : ""}">続きの工程から再開する</button>` : ""}

      <div class="info-grid">
        <div class="info-cell"><div class="label">パラコードの太さ</div><div class="value">${esc(r.thickness) || "未登録"}</div></div>
        <div class="info-cell"><div class="label">完成サイズ</div><div class="value">${esc(r.finishedSize) || "未登録"}</div></div>
        <div class="info-cell"><div class="label">金具</div><div class="value">${esc(r.hardware) || "未登録"}</div></div>
        <div class="info-cell"><div class="label">制作時間</div><div class="value">${r.durationMinutes != null ? r.durationMinutes + "分" : "未登録"}</div></div>
      </div>

      ${colors.length ? `<div class="info-block"><div class="label">使用した色</div><div class="tag-input-row" style="margin-top:6px">${colors.map((c) => `<span class="tag-chip"><span class="slot-swatch" style="width:16px;height:16px;${colorSwatchCss(c)}"></span>${esc(c.name)}</span>`).join("")}</div></div>` : ""}

      ${lengthSummaryBlock(r)}

      ${infoBlock("うまくいった点", r.wentWell)}
      ${infoBlock("失敗した点", r.wentWrong)}
      ${infoBlock("次回の改善点", r.nextImprovement)}
      ${infoBlock("自由メモ", r.freeMemo)}
      ${(r.tags || []).length ? `<div class="tag-input-row" style="margin-bottom:14px">${r.tags.map((t) => `<span class="tag-chip">#${esc(t)}</span>`).join("")}</div>` : ""}

      <div class="action-row">
        <button class="btn btn-secondary" data-nav="#/records/${id}/edit">編集</button>
        <button class="btn btn-danger" id="del-rec">削除</button>
      </div>
    </div>
  `, "records");
  document.getElementById("fav-toggle").addEventListener("click", () => { Repo.toggleFavorite("records", id); screenRecordDetail(id); });
  document.getElementById("del-rec").addEventListener("click", () => { if (confirm("この制作メモを削除しますか？")) { Repo.deleteRecord(id); nav("#/records"); } });
}
function lengthSummaryBlock(r) {
  const sl = r.stringLengths || {};
  const rows = ["core", "A", "B", "C"].filter((k) => sl[k] && sl[k].value);
  if (!rows.length) return "";
  const labels = { core: "芯紐", A: "紐A", B: "紐B", C: "紐C" };
  return h`<div class="info-block"><div class="label">使用した紐の長さ</div>
    <table class="len-table"><tbody>
      ${rows.map((k) => `<tr><td>${labels[k]}</td><td>${esc(sl[k].value)}cm</td><td><span class="kind-badge ${sl[k].kind}">${sl[k].kind === "actual" ? "実測値" : "推定値"}</span></td></tr>`).join("")}
    </tbody></table>
  </div>`;
}

function screenRecordForm(id) {
  const editing = !!id;
  const src = editing ? Repo.getRecord(id) : null;
  const r = src ? JSON.parse(JSON.stringify(src)) : {
    id: null, workName: "", coverImage: null, madeDate: new Date().toISOString().slice(0, 10),
    patternId: null, thickness: "", finishedSize: "", colorsUsed: [], stringLengths: {},
    hardware: "", durationMinutes: null, wentWell: "", wentWrong: "", nextImprovement: "", freeMemo: "",
    status: "in_progress", currentStepIndex: null, tags: [],
  };
  const patterns = Repo.getPatterns();
  const colors = Repo.getColors();

  render(recordFormMarkup(r, editing, patterns), "records");
  wireRecordForm(r, editing, patterns, colors);
}
function recordFormMarkup(r, editing, patterns) {
  return h`
    <div class="topbar"><div class="topbar-row">
      <button class="icon-btn" data-nav="${editing ? "#/records/" + r.id : "#/records"}">←</button>
      <div class="brand" style="font-size:16px">${editing ? "制作メモを編集" : "制作メモを追加"}</div>
      <span style="width:38px"></span>
    </div></div>
    <div class="screen">
      <div class="field"><label>完成写真</label>
        <div class="upload-box" id="rec-cover-box">
          ${r.coverImage ? `<img src="${r.coverImage}">` : ""}
          <input type="file" accept="image/*" id="rec-cover-input" style="display:none">
          <button type="button" class="btn btn-secondary btn-sm" id="rec-cover-pick">${r.coverImage ? "写真を変更" : "写真を選ぶ"}</button>
        </div>
      </div>
      <div class="field"><label>作品名</label><input type="text" id="r-name" value="${esc(r.workName)}" placeholder="例：Run it 黒×シルバー ショルダー"></div>
      <div class="field"><label>制作日</label><input type="date" id="r-date" value="${esc(r.madeDate)}"></div>
      <div class="field"><label>使用した編み方</label>
        <select id="r-pattern"><option value="">選択なし</option>${patterns.map((p) => `<option value="${p.id}" ${r.patternId === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
      </div>
      <div class="field"><label>状態</label>
        <div class="segmented"><button type="button" class="status-pill-btn ${r.status === "in_progress" ? "active" : ""}" data-status="in_progress">制作中</button><button type="button" class="status-pill-btn ${r.status === "done" ? "active" : ""}" data-status="done">完成</button></div>
      </div>
      <div class="field" id="current-step-field" style="${r.status === "in_progress" ? "" : "display:none"}"><label>現在の工程（途中で終了する場合）</label><input type="number" min="0" id="r-current-step" value="${r.currentStepIndex != null ? r.currentStepIndex : ""}" placeholder="工程番号（0始まり）"></div>

      <div class="field"><label>パラコードの太さ</label><input type="text" id="r-thick" value="${esc(r.thickness)}" placeholder="例：4mm"></div>
      <div class="field"><label>完成サイズ</label><input type="text" id="r-size" value="${esc(r.finishedSize)}" placeholder="例：100cm"></div>
      <div class="field"><label>金具</label><input type="text" id="r-hardware" value="${esc(r.hardware)}" placeholder="例：ナスカン、Dカン"></div>
      <div class="field"><label>制作時間（分）</label><input type="number" min="0" id="r-duration" value="${r.durationMinutes != null ? r.durationMinutes : ""}"></div>

      <div class="field"><label>使用した色</label><div class="tag-input-row" id="r-colors">${(r.colorsUsed || []).map((cid) => { const c = colorById(cid); return c ? `<span class="tag-chip" data-cid="${cid}">${esc(c.name)}<button type="button" data-remove-color="${cid}">✕</button></span>` : ""; }).join("")}</div>
        <button type="button" class="btn btn-outline btn-sm" id="add-color-btn" style="margin-top:8px">＋ 色を追加</button>
      </div>

      <h2 class="block-title">使用した紐の長さ（参考値／推定値／実測値を区別）</h2>
      ${["core", "A", "B", "C"].map((k) => lengthFieldRow(k, r.stringLengths[k])).join("")}

      ${infoTextarea("うまくいった点", "r-good", r.wentWell)}
      ${infoTextarea("失敗した点", "r-bad", r.wentWrong)}
      ${infoTextarea("次回の改善点", "r-improve", r.nextImprovement)}
      ${infoTextarea("自由メモ", "r-memo", r.freeMemo)}
      <div class="field"><label>タグ（カンマ区切り）</label><input type="text" id="r-tags" value="${esc((r.tags || []).join("、"))}"></div>

      <button type="button" class="btn btn-primary btn-block" id="save-record" style="margin-top:10px">保存する</button>
    </div>
  `;
}
function infoTextarea(label, id, val) { return h`<div class="field"><label>${label}</label><textarea id="${id}">${esc(val)}</textarea></div>`; }
function lengthFieldRow(key, val) {
  const labels = { core: "芯紐", A: "紐A", B: "紐B", C: "紐C" };
  const v = val || { value: "", kind: "estimate" };
  return h`<div class="field">
    <label>${labels[key]}の長さ (cm)</label>
    <div style="display:flex;gap:8px">
      <input type="number" min="0" class="len-value" data-key="${key}" value="${v.value != null ? v.value : ""}" style="flex:1">
      <div class="segmented len-kind" data-key="${key}">
        <button type="button" class="kind-btn ${v.kind !== "actual" ? "active" : ""}" data-kind="estimate">推定値</button>
        <button type="button" class="kind-btn ${v.kind === "actual" ? "active" : ""}" data-kind="actual">実測値</button>
      </div>
    </div>
  </div>`;
}
function wireRecordForm(r, editing, patterns, colors) {
  const $ = (sel) => app.querySelector(sel);
  $("#rec-cover-pick").addEventListener("click", () => $("#rec-cover-input").click());
  $("#rec-cover-input").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    r.coverImage = await fileToDataUrl(f, Repo.db().meta.imageQuality);
    reRenderRecordForm();
  });
  app.querySelectorAll(".status-pill-btn").forEach((el) => el.addEventListener("click", () => { r.status = el.dataset.status; reRenderRecordForm(); }));
  app.querySelectorAll(".kind-btn").forEach((el) => el.addEventListener("click", () => {
    const wrap = el.closest(".len-kind");
    wrap.querySelectorAll(".kind-btn").forEach((b) => b.classList.remove("active"));
    el.classList.add("active");
  }));
  $("#add-color-btn").addEventListener("click", () => {
    openColorPicker(colors, null, (cid) => {
      if (!r.colorsUsed) r.colorsUsed = [];
      if (!r.colorsUsed.includes(cid)) r.colorsUsed.push(cid);
      reRenderRecordForm();
    });
  });
  app.querySelectorAll("[data-remove-color]").forEach((el) => el.addEventListener("click", () => {
    r.colorsUsed = r.colorsUsed.filter((c) => c !== el.dataset.removeColor);
    reRenderRecordForm();
  }));

  function reRenderRecordForm() {
    collectFormValues();
    render(recordFormMarkup(r, editing, patterns), "records");
    wireRecordForm(r, editing, patterns, colors);
  }
  function collectFormValues() {
    r.workName = $("#r-name") ? $("#r-name").value : r.workName;
    r.madeDate = $("#r-date") ? $("#r-date").value : r.madeDate;
    r.patternId = $("#r-pattern") ? ($("#r-pattern").value || null) : r.patternId;
    r.thickness = $("#r-thick") ? $("#r-thick").value : r.thickness;
    r.finishedSize = $("#r-size") ? $("#r-size").value : r.finishedSize;
    r.hardware = $("#r-hardware") ? $("#r-hardware").value : r.hardware;
    r.durationMinutes = $("#r-duration") && $("#r-duration").value !== "" ? Number($("#r-duration").value) : null;
    r.currentStepIndex = $("#r-current-step") && $("#r-current-step").value !== "" ? Number($("#r-current-step").value) : null;
    r.wentWell = $("#r-good") ? $("#r-good").value : r.wentWell;
    r.wentWrong = $("#r-bad") ? $("#r-bad").value : r.wentWrong;
    r.nextImprovement = $("#r-improve") ? $("#r-improve").value : r.nextImprovement;
    r.freeMemo = $("#r-memo") ? $("#r-memo").value : r.freeMemo;
    r.tags = $("#r-tags") ? splitList($("#r-tags").value) : r.tags;
    r.stringLengths = r.stringLengths || {};
    app.querySelectorAll(".len-value").forEach((el) => {
      const key = el.dataset.key;
      const kindBtn = app.querySelector(`.len-kind[data-key="${key}"] .kind-btn.active`);
      if (el.value !== "") r.stringLengths[key] = { value: Number(el.value), kind: kindBtn ? kindBtn.dataset.kind : "estimate" };
      else delete r.stringLengths[key];
    });
  }

  $("#save-record").addEventListener("click", () => {
    collectFormValues();
    if (!r.workName.trim()) { toast("作品名を入力してください"); }
    r.tags.forEach((t) => Repo.addTag(t));
    const saved = Repo.upsertRecord(r);
    // 紐の長さ記録一覧にも反映(参考実績として)
    if (r.patternId && Object.keys(r.stringLengths).length) {
      Repo.addLengthRecord({
        patternId: r.patternId, thickness: r.thickness, finishedLength: r.finishedSize,
        core: r.stringLengths.core || null, A: r.stringLengths.A || null, B: r.stringLengths.B || null, C: r.stringLengths.C || null,
        note: r.workName,
      });
    }
    toast("保存しました");
    nav("#/records/" + saved.id);
  });
}

/* ---------------- 紐の長さ記録一覧 ---------------- */
function screenLengths() {
  const list = Repo.getLengthRecords().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  render(h`
    <div class="topbar"><div class="topbar-row"><button class="icon-btn" data-nav="#/records">←</button><div class="brand" style="font-size:16px">紐の長さ記録</div><span style="width:38px"></span></div></div>
    <div class="screen">
      <p class="small-note">自動計算は行いません。過去の制作メモから記録された実績値の一覧です。数値は目安としてご利用ください。</p>
      ${list.length ? list.map(lengthRow).join("") : `<div class="empty-hint">まだ記録がありません。制作メモに紐の長さを入力すると、ここに一覧表示されます。</div>`}
    </div>
  `, "records");
}
function lengthRow(rec) {
  const p = Repo.getPattern(rec.patternId);
  const rows = ["core", "A", "B", "C"].filter((k) => rec[k] && rec[k].value);
  const labels = { core: "芯紐", A: "紐A", B: "紐B", C: "紐C" };
  return h`<div class="info-block">
    <div class="label">${p ? esc(p.name) : "編み方不明"} ／ ${esc(rec.thickness) || "太さ未登録"} ／ 完成 ${esc(rec.finishedLength) || "?"}${rec.finishedLength ? "cm" : ""}</div>
    <table class="len-table"><tbody>
      ${rows.map((k) => `<tr><td>${labels[k]}</td><td>${rec[k].value}cm</td><td><span class="kind-badge ${rec[k].kind}">${rec[k].kind === "actual" ? "実測値" : "推定値"}</span></td></tr>`).join("")}
    </tbody></table>
  </div>`;
}

/* =====================================================================
   設定
===================================================================== */
function screenSettings() {
  const meta = Repo.db().meta;
  render(h`
    <div class="topbar"><div class="topbar-row"><div class="brand" style="font-size:17px">設定</div><span></span></div></div>
    <div class="screen">
      <div class="settings-group">
        <div class="settings-row"><div><div class="row-label">アプリ名</div><div class="row-sub">${esc(meta.appName)}</div></div><button class="btn btn-outline btn-sm" id="rename-app">変更</button></div>
        <div class="settings-row"><div class="row-label">表示サイズ</div>
          <div class="segmented">${["S", "M", "L"].map((s) => `<button class="size-btn ${meta.textSize === s ? "active" : ""}" data-size="${s}">${s}</button>`).join("")}</div>
        </div>
        <div class="settings-row"><div class="row-label">ダークモード</div><span class="switch ${meta.theme === "dark" ? "on" : ""}" id="dark-switch"></span></div>
        <div class="settings-row"><div class="row-label">画像の保存品質</div>
          <div class="segmented">${[["low", "低"], ["medium", "標準"], ["high", "高"]].map(([v, l]) => `<button class="quality-btn ${meta.imageQuality === v ? "active" : ""}" data-quality="${v}">${l}</button>`).join("")}</div>
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-row"><div><div class="row-label">データのバックアップ</div><div class="row-sub">すべてのデータをファイルに書き出します</div></div><button class="btn btn-outline btn-sm" id="export-btn">書き出す</button></div>
        <div class="settings-row"><div><div class="row-label">データの復元</div><div class="row-sub">書き出したファイルから復元します</div></div><button class="btn btn-outline btn-sm" id="import-btn">復元する</button></div>
        <input type="file" accept="application/json" id="import-input" style="display:none">
        <div class="settings-row"><div><div class="row-label">初期サンプルの再表示</div><div class="row-sub">削除したサンプル編み方12種を復元します</div></div><button class="btn btn-outline btn-sm" id="reset-sample-btn">再表示</button></div>
        <div class="settings-row"><div><div class="row-label">カラー名の編集</div><div class="row-sub">パレットの色名を変更できます</div></div><button class="btn btn-outline btn-sm" id="edit-colors-btn">編集</button></div>
      </div>

      <div class="settings-group">
        <div class="settings-row"><div><div class="row-label">全データを削除</div><div class="row-sub">端末内のすべてのデータを消去します</div></div><button class="btn btn-danger btn-sm" id="wipe-btn">削除</button></div>
      </div>
      <p class="small-note">Paracord Note v1（プロトタイプ）／ データは端末内（ブラウザのlocalStorage）に保存されます。</p>
    </div>
  `, "settings");

  document.getElementById("rename-app").addEventListener("click", () => {
    const n = prompt("新しいアプリ名を入力してください", meta.appName);
    if (n && n.trim()) { Repo.setMeta({ appName: n.trim() }); screenSettings(); }
  });
  app.querySelectorAll(".size-btn").forEach((el) => el.addEventListener("click", () => { Repo.setMeta({ textSize: el.dataset.size }); applyTheme(); screenSettings(); }));
  document.getElementById("dark-switch").addEventListener("click", () => { Repo.setMeta({ theme: meta.theme === "dark" ? "light" : "dark" }); applyTheme(); screenSettings(); });
  app.querySelectorAll(".quality-btn").forEach((el) => el.addEventListener("click", () => { Repo.setMeta({ imageQuality: el.dataset.quality }); screenSettings(); }));

  document.getElementById("export-btn").addEventListener("click", () => {
    const blob = new Blob([Repo.exportJson()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "paracord-note-backup.json";
    a.click();
    toast("バックアップを書き出しました");
  });
  document.getElementById("import-btn").addEventListener("click", () => document.getElementById("import-input").click());
  document.getElementById("import-input").addEventListener("change", (e) => {
    const f = e.target.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { Repo.importJson(reader.result); toast("復元しました"); applyTheme(); nav("#/home"); }
      catch (err) { alert("復元に失敗しました。ファイルが正しいか確認してください。"); }
    };
    reader.readAsText(f);
  });
  document.getElementById("reset-sample-btn").addEventListener("click", () => { if (confirm("サンプル編み方12種を再表示します。よろしいですか？")) { Repo.resetSamples(); toast("再表示しました"); } });
  document.getElementById("edit-colors-btn").addEventListener("click", () => openColorNameEditor());
  document.getElementById("wipe-btn").addEventListener("click", () => { if (confirm("本当にすべてのデータを削除しますか？この操作は取り消せません。")) { Repo.wipeAll(); toast("削除しました"); nav("#/home"); } });
}
function openColorNameEditor() {
  const colors = Repo.getColors();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = h`<div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-title">カラー名の編集</div>
    ${colors.map((c) => h`<div class="strand-slot"><span class="slot-label"><span class="slot-swatch" style="width:24px;height:24px;${colorSwatchCss(c)}"></span></span><input type="text" data-color-id="${c.id}" value="${esc(c.name)}" style="flex:1;border:1px solid var(--line);border-radius:8px;padding:8px"></div>`).join("")}
    <button class="btn btn-primary btn-block" id="save-color-names" style="margin-top:12px">保存</button>
  </div>`;
  document.body.appendChild(backdrop);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });
  backdrop.querySelector("#save-color-names").addEventListener("click", () => {
    backdrop.querySelectorAll("[data-color-id]").forEach((inp) => Repo.renameColor(inp.dataset.colorId, inp.value.trim() || "無題"));
    toast("保存しました");
    backdrop.remove();
  });
}
