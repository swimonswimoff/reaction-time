# Paracord Note ― 設計メモ（v1 プロトタイプ）

仮アプリ名。設定画面からいつでも変更可能（`meta.appName`）。

## 1. 画面構成（サイトマップ）

```
┌ ホーム (#/home)
├ 編み方一覧 (#/patterns)
│  └ 編み方詳細 (#/patterns/:id)
│      └ 手順（工程）画面 (#/patterns/:id/steps?at=N)
│      └ 編み方の編集 (#/patterns/:id/edit)
├ 編み方の新規登録 (#/patterns/new)
│      └ 写真から工程をまとめて登録 (#/patterns/:id/edit/from-photos)
├ 色を組み合わせる (#/palette, #/palette/:patternId)
│      └ 保存した配色一覧・詳細 (#/palette/saved, #/palette/saved/:id)
├ 作りたいものから探す (#/explore)
├ お気に入り (#/favorites)
├ 制作メモ / 記録 (#/records)
│  └ 制作メモ詳細・編集 (#/records/:id, #/records/new)
│  └ 紐の長さ記録一覧 (#/lengths)
└ 設定 (#/settings)
```

画面下部固定ナビ：ホーム / 編み方 / 配色 / 記録 / 設定（5項目）。
ホーム上部：アプリ名 + 検索欄（キーワード横断検索：編み方名・別名・タグ・向いている作品）。

各画面は「主要操作は1〜3個」に抑え、工程画面は1工程＝1画面で画像を大きく表示する設計。

## 2. データ構造（localStorage: `paracordNoteDB` に1つのJSONとして保存）

編み方(Pattern) と 工程(Step) は親子関係（Pattern.steps配列）。他は独立エンティティ＋ID参照。

```ts
DB = {
  meta: {
    appName: string,            // 例: "Paracord Note"
    theme: "light" | "dark",
    textSize: "S" | "M" | "L",
    imageQuality: "low" | "medium" | "high", // 画像保存時の圧縮率
    createdAt, updatedAt,
  },

  // 1. 編み方データ（サンプルは isSample:true で区別。ユーザー登録は false）
  patterns: [{
    id, isSample: boolean,
    name: string,                 // 正式名称
    aliases: string[],            // 別名（複数可）
    coverImage: dataURL | null,   // 完成写真
    difficulty: 1|2|3|4|5,
    difficultyLabel: string,      // "初心者向け" など
    featureType: "flat"|"round"|"twist"|"unknown", // 平/丸/ねじれ 編み目の特徴
    finishedShape: string,        // 完成時の形（自由記述）
    strandCount: number|null,     // 使用する紐の本数
    coreStrandCount: number|null, // 芯紐の本数（0=芯紐なし）
    recommendedThickness: string, // 推奨パラコード太さ（自由記述、例 "4mm"）
    suitableItems: string[],      // 向いている作品カテゴリID配列
    tools: string[],              // 必要な道具
    lengthGuideNote: string,      // 紐の長さの目安（自由記述。断定値ではなく注意書き）
    cautions: string,             // 注意点
    pitfalls: string,             // 失敗しやすいポイント
    tags: string[],
    referenceUrl: string,
    visibility: "private"|"public", // 公開設定（v1はローカルのみなので実質フラグ保持のみ）
    verified: boolean,            // 手順・名称が確認済みか（未確認は明示表示）
    steps: [{
      id, order: number,
      image: dataURL|null,
      media: { type: "image"|"gif"|"video"|null, src, playbackRateDefault: 0.5|1|1.5 },
      description: string,
      caution: string,
      movingStrand: "left"|"right"|"core"|"A"|"B"|"C"|string, // 動かす紐（色分け表示用キー）
      arrows: [{ type:"arrow"|"circle"|"number"|"text", x,y,x2,y2, label, color }], // 書き込み情報
      completeCheck: boolean,      // 登録側チェック（内容確定済みか）
    }],
    createdAt, updatedAt, viewCount, useCount,
  }],

  // 3. カラーデータ（マスタ。初期20色+5柄+ユーザー登録の実写真色見本）
  colors: [{
    id, name: string, type: "solid"|"pattern"|"photo",
    hex: string|null,             // solid用
    swatchCss: string|null,       // pattern用の疑似柄CSS(gradient等)
    photoImage: dataURL|null,     // ユーザーが撮影した色見本
    isCustom: boolean,
  }],

  // 4. 保存した配色データ
  palettes: [{
    id, patternId, name: string,  // 配色名（ユーザー入力）
    assignment: { core: colorId|null, A: colorId|null, B: colorId|null, C: colorId|null },
    createdAt, updatedAt,
  }],

  // 5. 制作記録データ（制作メモ）
  records: [{
    id, workName, coverImage, madeDate,
    patternId: id|null,
    thickness, finishedSize,
    colorsUsed: colorId[],
    stringLengths: { core:{value,unit,kind}, A:{...}, B:{...}, C:{...} }, // kind: "estimate"|"actual"
    hardware: string, durationMinutes: number|null,
    wentWell, wentWrong, nextImprovement, freeMemo,
    status: "in_progress"|"done",
    currentStepIndex: number|null, // 制作途中の工程保存
    tags: string[],
    createdAt, updatedAt,
  }],

  // 6. お気に入りデータ
  favorites: { patterns: id[], palettes: id[], records: id[] },

  // 7. タグデータ（自由入力タグのマスタ一覧。候補表示用）
  tags: string[],

  // 8. 作業再開位置（編み方ごとの「どこまで見たか」。制作記録と独立した「閲覧の続き」用）
  resumePositions: { [patternId]: { stepIndex: number, updatedAt } },

  // 9. ユーザー登録の画像・動画は各エンティティ内に dataURL として保持（v1はブラウザ内保存）
  //    将来クラウド保存に対応する場合はここを外部URL参照に差し替え可能な構造にしてある

  // 紐の長さ記録（実績一覧。自動計算はしない。記録の一覧表示のみ）
  lengthRecords: [{
    id, patternId, thickness, finishedLength,
    core: { value, kind }, A:{value,kind}, B:{value,kind}, C:{value,kind},
    note, createdAt,
  }],

  // 作りたいものカテゴリ（固定マスタ、コードで定義）
  // categories: スマホショルダー/ハンドストラップ/ネックストラップ/キーホルダー/バッグチャーム/
  //             ブレスレット/犬用リード/ボトルホルダー/ファスナータブ/アクセサリー/その他

  recentlyViewed: id[], // 最近見た編み方（最大10件）
}
```

## 3. 設計方針メモ

- **保存先**: v1は端末内 `localStorage`。将来クラウド同期を追加しやすいよう、全データ操作は `js/data.js` の Repository関数（`getPatterns()`, `savePattern()` 等）経由に統一し、UIコードから直接 `localStorage` を触らない。
- **画像/動画**: `<input type=file>` で選択→Canvasでリサイズ・圧縮→dataURLとして保存。設定の「画像の保存品質」でリサイズ率を切替。動画/GIFはv1では外部URL登録 or 将来のアップロード枠のみ用意（実アップロード非対応の場合は明示）。
- **サンプル編み方の扱い**: 12種類は名称・別名（確認できるもののみ）・一般的な分類情報を登録するが、**具体的な工程（手順・矢印・画像）は登録しない**（存在しない手順の自動生成を避けるため）。詳細画面に「サンプル：手順は未登録です。編集して追加してください」と明示し、`verified:false` の編み方には「未確認」バッジを表示。
- **長さの表記**: 常に「参考値／推定値／実測値（ユーザー入力）」のいずれかを明示するラベル付きで表示。根拠のない初期値は入れない。
- **アクセントカラー**: オレンジ `#FF7A30` を基調に、白背景・角丸カード・大きいタップ領域で構成。
