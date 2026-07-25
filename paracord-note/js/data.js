/* Paracord Note — data.js
 * localStorage 上の唯一のデータストア。UI からは必ずこのファイルの関数経由でアクセスする。
 */

const DB_KEY = "paracordNoteDB";
const DB_VERSION = 1;

const CATEGORIES = [
  { id: "phone_shoulder", label: "スマホショルダー" },
  { id: "hand_strap", label: "ハンドストラップ" },
  { id: "neck_strap", label: "ネックストラップ" },
  { id: "keyholder", label: "キーホルダー" },
  { id: "bag_charm", label: "バッグチャーム" },
  { id: "bracelet", label: "ブレスレット" },
  { id: "dog_leash", label: "犬用リード" },
  { id: "bottle_holder", label: "ボトルホルダー" },
  { id: "zipper_tab", label: "ファスナータブ" },
  { id: "accessory", label: "アクセサリー" },
  { id: "other", label: "その他" },
];

const FILTERS = [
  { id: "beginner", label: "初心者向け", group: "level" },
  { id: "flat", label: "平たい編み目", group: "feature" },
  { id: "round", label: "丸い編み目", group: "feature" },
  { id: "twist", label: "ねじれる編み目", group: "feature" },
  { id: "core_yes", label: "芯紐あり", group: "core" },
  { id: "core_no", label: "芯紐なし", group: "core" },
  { id: "color2", label: "2色", group: "color" },
  { id: "color3plus", label: "3色以上", group: "color" },
  { id: "phone_shoulder", label: "スマホショルダー向け", group: "item" },
  { id: "hand_strap", label: "ストラップ向け", group: "item" },
  { id: "keyholder", label: "キーホルダー向け", group: "item" },
  { id: "bracelet", label: "ブレスレット向け", group: "item" },
];

const SORTS = [
  { id: "frequent", label: "よく使う順" },
  { id: "newest", label: "新しく登録した順" },
  { id: "difficulty", label: "難易度順" },
  { id: "name", label: "名前順" },
];

function uid(prefix) {
  return (prefix || "id") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function nowIso() {
  return new Date().toISOString();
}

/* ---------- 初期カラーマスタ ---------- */
function seedColors() {
  const solids = [
    ["ブラック", "#1A1A1A"], ["ホワイト", "#FFFFFF"], ["グレー", "#9B9B9B"],
    ["シルバー", "#C8CBCE"], ["ネイビー", "#20294A"], ["ブルー", "#1E6FEA"],
    ["水色", "#7FD3EC"], ["ターコイズ", "#2FBFAE"], ["ミント", "#94E3C4"],
    ["グリーン", "#3FA65A"], ["黄緑", "#A8D63A"], ["イエロー", "#F5D327"],
    ["オレンジ", "#FF7A30"], ["レッド", "#E5342B"], ["ピンク", "#F58FB0"],
    ["パープル", "#8A4FBF"], ["ブラウン", "#7B4B2A"], ["ベージュ", "#E4D2AE"],
    ["蛍光イエロー", "#E8FF3B"], ["蛍光オレンジ", "#FF9500"], ["蛍光ピンク", "#FF3EA5"],
  ];
  const patterns = [
    { name: "リフレクティブ", css: "repeating-linear-gradient(135deg,#c9ccd1 0 4px,#f4f6f8 4px 8px)" },
    { name: "カモフラージュ", css: "conic-gradient(from 45deg,#5c6b3e,#3f4a2b,#8a8f5c,#4a5a33,#6b7a45)" },
    { name: "ミックスカラー", css: "linear-gradient(90deg,#e5342b,#f5d327,#1e6fea,#3fa65a)" },
    { name: "ドット", css: "radial-gradient(circle,#fff 30%,transparent 32%) 0 0/10px 10px, #1A1A1A" },
    { name: "ライン入り", css: "repeating-linear-gradient(90deg,#1A1A1A 0 6px,#FF7A30 6px 8px)" },
  ];
  const colors = solids.map(([name, hex]) => ({
    id: uid("col"), name, type: "solid", hex, swatchCss: null, photoImage: null, isCustom: false,
  }));
  patterns.forEach((p) => colors.push({
    id: uid("col"), name: p.name, type: "pattern", hex: null, swatchCss: p.css, photoImage: null, isCustom: false,
  }));
  return colors;
}

/* ---------- 初期サンプル編み方 ----------
 * 注意: 具体的な工程（手順・矢印・画像）は登録しない。存在しない手順の自動生成を避けるため、
 * steps は空配列とし、verified:false・isSample:true で明示する。
 * 別名は本人から明示された例（ねじり平編み）以外は空にし、未確認の情報を断定しない。
 */
function seedPatterns() {
  const items = [
    { name: "平編み", aliases: [], featureType: "flat", core: true },
    { name: "ねじり平編み", aliases: ["スパイラルステッチ", "スパイラルノット"], featureType: "twist", core: true },
    { name: "コブラステッチ", aliases: [], featureType: "flat", core: true },
    { name: "キングコブラ", aliases: [], featureType: "flat", core: true },
    { name: "スネークノット", aliases: [], featureType: "flat", core: false },
    { name: "ダイヤモンドノット", aliases: [], featureType: "round", core: false },
    { name: "バレルノット", aliases: [], featureType: "round", core: false },
    { name: "つゆ結び", aliases: [], featureType: "round", core: false },
    { name: "四つ編み", aliases: [], featureType: "flat", core: false },
    { name: "丸四つ編み", aliases: [], featureType: "round", core: false },
    { name: "フィッシュテール", aliases: [], featureType: "flat", core: false },
    { name: "Xラップ", aliases: [], featureType: "twist", core: false },
  ];
  return items.map((it) => ({
    id: uid("pat"),
    isSample: true,
    name: it.name,
    aliases: it.aliases,
    coverImage: null,
    difficulty: null,
    difficultyLabel: "",
    featureType: it.featureType,
    finishedShape: "",
    strandCount: null,
    coreStrandCount: it.core ? null : 0,
    recommendedThickness: "",
    suitableItems: [],
    tools: [],
    lengthGuideNote: "",
    cautions: "",
    pitfalls: "",
    tags: [],
    referenceUrl: "",
    visibility: "private",
    verified: false,
    steps: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    viewCount: 0,
    useCount: 0,
  }));
}

function emptyDB() {
  return {
    version: DB_VERSION,
    meta: {
      appName: "Paracord Note",
      theme: "light",
      textSize: "M",
      imageQuality: "medium",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    patterns: seedPatterns(),
    colors: seedColors(),
    palettes: [],
    records: [],
    favorites: { patterns: [], palettes: [], records: [] },
    tags: ["SWIM-ON", "レーンロープ", "黒白", "初心者向け", "スマホショルダー", "4ミリ", "プレゼント用", "もう一度作る"],
    resumePositions: {},
    lengthRecords: [],
    recentlyViewed: [],
  };
}

let _db = null;

function load() {
  if (_db) return _db;
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      _db = JSON.parse(raw);
      // マイグレーション余地: version不一致時はここで補完
      if (!_db.meta) _db.meta = emptyDB().meta;
      if (!_db.lengthRecords) _db.lengthRecords = [];
      if (!_db.resumePositions) _db.resumePositions = {};
      if (!_db.tags) _db.tags = [];
      if (!_db.recentlyViewed) _db.recentlyViewed = [];
      return _db;
    }
  } catch (e) {
    console.error("DB読み込みに失敗しました", e);
  }
  _db = emptyDB();
  persist();
  return _db;
}

function persist() {
  _db.meta.updatedAt = nowIso();
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(_db));
  } catch (e) {
    console.error("保存に失敗しました（容量不足の可能性）", e);
    alert("保存に失敗しました。端末の空き容量、または画像サイズをご確認ください。");
  }
}

/* ---------- Repository API ---------- */
const Repo = {
  db() { return load(); },
  save() { persist(); },

  resetSamples() {
    const db = load();
    db.patterns = db.patterns.filter((p) => !p.isSample).concat(seedPatterns());
    persist();
  },

  exportJson() {
    return JSON.stringify(load(), null, 2);
  },

  importJson(json) {
    const parsed = JSON.parse(json);
    _db = parsed;
    persist();
  },

  wipeAll() {
    _db = emptyDB();
    persist();
  },

  /* Patterns */
  getPatterns() { return load().patterns; },
  getPattern(id) { return load().patterns.find((p) => p.id === id) || null; },
  upsertPattern(pattern) {
    const db = load();
    const idx = db.patterns.findIndex((p) => p.id === pattern.id);
    pattern.updatedAt = nowIso();
    if (idx === -1) {
      pattern.id = pattern.id || uid("pat");
      pattern.createdAt = nowIso();
      db.patterns.push(pattern);
    } else {
      db.patterns[idx] = pattern;
    }
    persist();
    return pattern;
  },
  duplicatePattern(id) {
    const db = load();
    const src = db.patterns.find((p) => p.id === id);
    if (!src) return null;
    const clone = JSON.parse(JSON.stringify(src));
    clone.id = uid("pat");
    clone.isSample = false;
    clone.name = src.name + "のコピー";
    clone.steps = clone.steps.map((s) => ({ ...s, id: uid("step") }));
    clone.createdAt = nowIso();
    clone.updatedAt = nowIso();
    clone.useCount = 0;
    clone.viewCount = 0;
    db.patterns.push(clone);
    persist();
    return clone;
  },
  deletePattern(id) {
    const db = load();
    db.patterns = db.patterns.filter((p) => p.id !== id);
    db.favorites.patterns = db.favorites.patterns.filter((x) => x !== id);
    db.palettes = db.palettes.filter((p) => p.patternId !== id);
    delete db.resumePositions[id];
    persist();
  },
  touchViewed(id) {
    const db = load();
    const p = db.patterns.find((x) => x.id === id);
    if (p) p.viewCount = (p.viewCount || 0) + 1;
    db.recentlyViewed = [id, ...db.recentlyViewed.filter((x) => x !== id)].slice(0, 10);
    persist();
  },
  bumpUseCount(id) {
    const db = load();
    const p = db.patterns.find((x) => x.id === id);
    if (p) p.useCount = (p.useCount || 0) + 1;
    persist();
  },

  /* Resume positions */
  setResumePosition(patternId, stepIndex) {
    const db = load();
    db.resumePositions[patternId] = { stepIndex, updatedAt: nowIso() };
    persist();
  },
  getResumePosition(patternId) {
    return load().resumePositions[patternId] || null;
  },
  clearResumePosition(patternId) {
    const db = load();
    delete db.resumePositions[patternId];
    persist();
  },

  /* Colors */
  getColors() { return load().colors; },
  addPhotoColor(name, dataUrl) {
    const db = load();
    const c = { id: uid("col"), name: name || "撮影した色", type: "photo", hex: null, swatchCss: null, photoImage: dataUrl, isCustom: true };
    db.colors.push(c);
    persist();
    return c;
  },
  renameColor(id, name) {
    const db = load();
    const c = db.colors.find((x) => x.id === id);
    if (c) c.name = name;
    persist();
  },

  /* Palettes */
  getPalettes() { return load().palettes; },
  getPalettesForPattern(patternId) { return load().palettes.filter((p) => p.patternId === patternId); },
  getPalette(id) { return load().palettes.find((p) => p.id === id) || null; },
  savePalette(palette) {
    const db = load();
    const idx = db.palettes.findIndex((p) => p.id === palette.id);
    palette.updatedAt = nowIso();
    if (idx === -1) {
      palette.id = palette.id || uid("pal");
      palette.createdAt = nowIso();
      db.palettes.push(palette);
    } else {
      db.palettes[idx] = palette;
    }
    persist();
    return palette;
  },
  deletePalette(id) {
    const db = load();
    db.palettes = db.palettes.filter((p) => p.id !== id);
    db.favorites.palettes = db.favorites.palettes.filter((x) => x !== id);
    persist();
  },

  /* Records */
  getRecords() { return load().records; },
  getRecord(id) { return load().records.find((r) => r.id === id) || null; },
  upsertRecord(record) {
    const db = load();
    const idx = db.records.findIndex((r) => r.id === record.id);
    record.updatedAt = nowIso();
    if (idx === -1) {
      record.id = record.id || uid("rec");
      record.createdAt = nowIso();
      db.records.push(record);
    } else {
      db.records[idx] = record;
    }
    persist();
    return record;
  },
  deleteRecord(id) {
    const db = load();
    db.records = db.records.filter((r) => r.id !== id);
    db.favorites.records = db.favorites.records.filter((x) => x !== id);
    persist();
  },

  /* Length records */
  getLengthRecords() { return load().lengthRecords; },
  addLengthRecord(rec) {
    const db = load();
    rec.id = uid("len");
    rec.createdAt = nowIso();
    db.lengthRecords.push(rec);
    persist();
    return rec;
  },
  deleteLengthRecord(id) {
    const db = load();
    db.lengthRecords = db.lengthRecords.filter((r) => r.id !== id);
    persist();
  },

  /* Favorites */
  isFavorite(kind, id) { return load().favorites[kind].includes(id); },
  toggleFavorite(kind, id) {
    const db = load();
    const arr = db.favorites[kind];
    const i = arr.indexOf(id);
    if (i === -1) arr.push(id); else arr.splice(i, 1);
    persist();
    return arr.includes(id);
  },

  /* Tags */
  getTags() { return load().tags; },
  addTag(tag) {
    const db = load();
    if (tag && !db.tags.includes(tag)) { db.tags.push(tag); persist(); }
  },

  /* Meta */
  setMeta(patch) {
    const db = load();
    Object.assign(db.meta, patch);
    persist();
  },
};

/* ---------- 検索・絞り込み・並べ替え ---------- */
function searchPatterns(query) {
  const q = (query || "").trim().toLowerCase();
  const list = Repo.getPatterns();
  if (!q) return list;
  return list.filter((p) => {
    const hay = [
      p.name, ...(p.aliases || []), ...(p.tags || []),
      ...(p.suitableItems || []).map((id) => (CATEGORIES.find((c) => c.id === id) || {}).label || ""),
      p.recommendedThickness,
    ].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

function filterPatterns(list, activeFilters) {
  if (!activeFilters || activeFilters.size === 0) return list;
  return list.filter((p) => {
    for (const f of activeFilters) {
      if (f === "beginner" && !(p.difficulty === 1 || p.difficultyLabel === "初心者向け")) return false;
      if (f === "flat" && p.featureType !== "flat") return false;
      if (f === "round" && p.featureType !== "round") return false;
      if (f === "twist" && p.featureType !== "twist") return false;
      if (f === "core_yes" && !(p.coreStrandCount > 0)) return false;
      if (f === "core_no" && !(p.coreStrandCount === 0)) return false;
      if (f === "color2") { /* 色数は配色保存時に決まるため、対象紐本数で簡易判定 */ if (!(p.strandCount === 2)) return false; }
      if (f === "color3plus") { if (!(p.strandCount >= 3)) return false; }
      if (["phone_shoulder", "hand_strap", "keyholder", "bracelet"].includes(f)) {
        if (!(p.suitableItems || []).includes(f)) return false;
      }
    }
    return true;
  });
}

function sortPatterns(list, sortId) {
  const arr = list.slice();
  switch (sortId) {
    case "frequent": return arr.sort((a, b) => (b.useCount || 0) - (a.useCount || 0));
    case "newest": return arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    case "difficulty": return arr.sort((a, b) => (a.difficulty || 99) - (b.difficulty || 99));
    case "name": return arr.sort((a, b) => a.name.localeCompare(b.name, "ja"));
    default: return arr;
  }
}
