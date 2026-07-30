# 実装ガイド（素のHTML＋CSS）

依存ゼロ。`index.html` と `style.css` の2ファイルで完結させる。
ブラウザで開けば見え、そのままGitHub Pages等に置ける状態にする。

---

## 1. ファイル構成

```
lp-<案件名>/
├── index.html
├── style.css
├── 04-required-assets.md
└── assets/
    ├── img/          写真（提供後に配置）
    └── placeholder/  （インラインSVGを使うので基本不要）
```

CSSは外部ファイルに分ける（WP版を派生させるときに分かれている方が楽）。
JavaScriptは、なくても成立する設計を優先する。必要な場合（アコーディオン、スムーススクロール、
フォームのバリデーション）だけ `index.html` の末尾にインラインで20〜50行。外部ライブラリは読み込まない。

## 2. CSSの土台（トーンを変数で切り替える）

冒頭にカスタムプロパティを置く。トーンA/B/Cの切り替えはここだけを触る。

```css
:root {
  /* --- 案件ごとに変更する --- */
  --color-primary:   #1d4e2a;   /* ブランド色。CTA・見出しのアクセント */
  --color-accent:    #d97706;   /* CTAボタン。primaryと明確に差をつける */
  --color-text:      #23282d;   /* 本文。純黒(#000)は使わない */
  --color-text-sub:  #5b6167;
  --color-bg:        #ffffff;
  --color-bg-alt:    #f6f4f0;   /* セクション交互の背景 */
  --color-border:    #e3e0da;

  --font-sans: "Helvetica Neue", Arial,
    "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, sans-serif;

  --fs-body:    1rem;      /* 16px。本文はこれ未満にしない */
  --fs-lead:    1.0625rem;
  --fs-h3:      1.25rem;
  --fs-h2:      1.5rem;
  --fs-catch:   1.75rem;   /* SPのキャッチ */

  --lh-body:    1.9;       /* 日本語は1.8〜2.0 */
  --lh-head:    1.45;

  --space-section: 4rem;   /* SPのセクション間 */
  --measure: 34em;         /* 本文の最大行長。日本語は35〜40字/行 */
  --radius: 8px;
}

@media (min-width: 768px) {
  :root {
    --fs-catch: 2.5rem;
    --fs-h2: 1.875rem;
    --space-section: 6rem;
  }
}
```

**トーン別の目安**

| | A. 誠実・信頼 | B. レスポンス広告 | C. 中間 |
|---|---|---|---|
| 配色 | 低彩度・2色（濃色＋生成り） | 高コントラスト・アクセント多用（赤／黄） | 暖色ベース＋アクセント1色 |
| 余白 | 広い（--space-section 6rem+） | 狭い（詰めて情報密度を上げる） | 中間 |
| 見出しサイズ | 控えめ | 大きい・太い | 中間 |
| 装飾 | 罫線・余白で区切る | 帯・吹き出し・囲み枠を多用 | 角丸・淡い背景色 |
| 書体 | ゴシック標準ウェイト | 太字多用 | ゴシック＋見出しだけ太字 |

## 3. モバイルファースト（375px を基準に組む）

- ベースCSSはスマホ向け。`@media (min-width: 768px)` / `1024px` で足していく
- **本文16px以上**。14pxは注釈だけ
- タップ領域は **44×44px以上**。ボタンの上下パディングを削らない
- 横スクロールを絶対に出さない。長い数字・URL・表は `overflow-x:auto` のラッパーに入れる
- 電話番号は `<a href="tel:0790000000">` にする（地域BtoCでは電話CVが多い）
- 画像は `max-width:100%; height:auto;`。`width`/`height` 属性を必ず書いてレイアウトシフトを防ぐ
- 固定フッターCTAはSPのみ表示。高さ64px前後に抑え、`body { padding-bottom: 80px; }` で本文の末尾を隠さない

```html
<!-- SP固定フッターCTA -->
<div class="sticky-cta">
  <a class="sticky-cta__tel" href="tel:0790000000">電話で聞く</a>
  <a class="sticky-cta__btn" href="#form">予算の目安をもらう</a>
</div>
```

```css
.sticky-cta { display:flex; gap:.5rem; position:fixed; inset:auto 0 0 0;
  padding:.5rem; background:rgba(255,255,255,.96);
  border-top:1px solid var(--color-border); z-index:50; }
.sticky-cta a { flex:1; min-height:48px; display:flex; align-items:center;
  justify-content:center; border-radius:var(--radius); font-weight:700; }
@media (min-width:768px) { .sticky-cta { display:none; } }
```

## 4. HTMLの骨格

```html
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><!-- 30字前後。訴求＋地域名 --></title>
<meta name="description" content="<!-- 100〜120字。ベネフィット＋対象＋エリア -->">
<link rel="stylesheet" href="style.css">
</head>
<body>
<header class="site-header"><!-- ロゴ／電話／CTA --></header>

<main>
  <section class="hero" aria-labelledby="hero-h"><!-- FV --></section>
  <section class="sec" aria-labelledby="s2-h"><!-- 各セクション --></section>
  ...
  <section class="sec sec--form" id="form"><!-- フォーム --></section>
</main>

<footer class="site-footer"><!-- 会社名・住所・電話・免許番号等 --></footer>
</body>
</html>
```

- 見出しは `h1`（FVに1つ）→ `h2`（各セクション）→ `h3` の順序を崩さない
- セクションは `<section>` ＋ `aria-labelledby`
- 画像の `alt` は装飾なら空 `alt=""`、内容を伝えるなら説明を書く
- 文字色と背景のコントラスト比は本文4.5:1以上（薄いグレー文字にしない）

## 5. プレースホルダの作り方

写真・ロゴが未提供でも実装は止めない。**アスペクト比を維持したプレースホルダ**で組む。
後から `<img>` に差し替えるだけで完成する形にする。

```html
<figure class="ph" style="--ratio: 4/3">
  <svg viewBox="0 0 400 300" role="img" aria-label="施工事例写真（未提供）">
    <rect width="400" height="300" fill="#e8e5df"/>
    <text x="200" y="145" text-anchor="middle" font-size="16" fill="#8a857c">
      施工事例：外観（横4:3）
    </text>
    <text x="200" y="170" text-anchor="middle" font-size="13" fill="#a8a29a">
      要提供：1点
    </text>
  </svg>
  <figcaption>【要確認：この事例の総額と築年数】</figcaption>
</figure>
```

```css
.ph { aspect-ratio: var(--ratio, 4/3); background: #e8e5df;
  border: 1px dashed #b9b3a8; border-radius: var(--radius); overflow: hidden; }
.ph svg { width: 100%; height: 100%; display: block; }
```

**原則**
- プレースホルダには **何の写真が・何枚・どの比率で必要か** を必ず書く
- 未確定のテキストは `【要確認：…】` の形でページ上に残す（消して埋めない）
- フリー素材やAI生成画像を無断で本番用に入れない。デザイン確認用に置く場合は、その旨をユーザーに明示する
- 写真がまだ1枚もない案件では、写真依存の少ないレイアウト（色面・タイポグラフィ・図表中心）を選ぶ

## 6. 推奨素材リスト（04-required-assets.md）

実装と同時に必ず出力する。クライアントにそのまま渡せる粒度で書く。

```markdown
# 必要素材リスト

## 優先度A（これがないと公開できない）
| # | 使う場所 | 内容 | 枚数 | 比率・サイズ | 撮影・準備のポイント |
|---|---|---|---|---|---|
| 1 | ファーストビュー | 施工した家の外観（引き）| 1 | 横16:9 / 1920px以上 | 晴天・午前の順光。空を1/3入れる。電線が入らない角度で |
| 2 | ヘッダー・フッター | ロゴ | 1 | 透過PNG or SVG | 横位置・白背景版と濃色背景版の2種あれば理想 |
| 3 | スタッフ紹介 | 担当者の顔写真 | 2 | 縦3:4 | 上半身・目線カメラ・自然光。作業着でも可（むしろ良い） |

## 優先度B（あると成約率が上がる）
| # | 使う場所 | 内容 | 枚数 | 備考 |
|---|---|---|---|---|
| 4 | 事例セクション | 施工前／施工後の対比写真 | 3組 | 同じアングルで撮ること（ビフォーアフターは角度が揃って初めて効く）|
| 5 | お客様の声 | 手書きアンケートのスキャン | 3 | 氏名は「T様」等に加工。掲載許可を取得のうえ |

## テキストで必要な情報
- [ ] 施工実績の棟数と対象期間（例：2003年〜2026年6月／312棟）
- [ ] 価格帯の幅（例：総額1,600万〜2,400万円）
- [ ] 事例3件の総額・築年数・家族構成
- [ ] 保有資格・加盟団体・免許番号
- [ ] 電話受付時間・定休日
```

## 7. フォームの選択

| 方式 | 向くケース | 注意 |
|---|---|---|
| 既存WPのフォームプラグイン（MW WP Form / Contact Form 7等） | WPサイトに組み込む案件 | ショートコードを埋める。単体HTMLでは動かない |
| Googleフォーム埋め込み | 早く公開したい・予算がない | デザインが合わない。離脱率が上がる。暫定策として使う |
| 外部フォームサービス（Formrun等） | 通知・管理まで任せたい | 費用と、送信先メールの設定確認が必要 |
| `mailto:` リンク | どうしても他が使えないとき | スマホで開かない環境がある。最後の手段 |

**単体HTML段階では、フォームは見た目だけ実装し、`action` は空にしてコメントで明示する。**
送信先が決まっていないまま `action` を埋めて「動くように見える」状態にしてはいけない。

```html
<!-- 送信先未定。公開前に action / method を設定する -->
<form action="" method="post" novalidate>
  <label for="name">お名前 <span class="req">必須</span></label>
  <input id="name" name="name" type="text" required autocomplete="name">

  <label for="tel">電話番号 <span class="req">必須</span></label>
  <input id="tel" name="tel" type="tel" required autocomplete="tel"
         inputmode="numeric" placeholder="0790000000">
  <p class="hint">ハイフンなしでも大丈夫です。</p>

  <label for="msg">ご希望・ご質問 <span class="opt">任意</span></label>
  <textarea id="msg" name="msg" rows="4"></textarea>
  <p class="hint">分かる範囲でどうぞ。空欄でも構いません。</p>

  <button type="submit" class="btn btn--primary">無料で予算の目安をもらう（入力1分）</button>
  <p class="hint">送信後、担当より1営業日以内にご連絡します。</p>
</form>
```

- **入力項目は最小限。** 迷ったら削る。氏名・電話（またはメール）・自由記述の3つで足りることが多い
- `autocomplete` と `inputmode` を必ず指定する（スマホの入力負荷が体感で変わる）
- 必須／任意を**両方**ラベルに明示する
- 個人情報の取り扱いへの一文をフォーム上に置く

## 8. 公開・確認

- ローカル確認は Browser pane（`preview_start`）を使う。`.claude/launch.json` に静的サーバを1つ用意すれば足りる
- **375px幅で必ず確認する**（`resize_window` の mobile プリセット）
- コンソールエラーがゼロであることを確認する
- 公開先（GitHub Pages / Vercel / XServer）は**必ずユーザーに確認してから**デプロイする。勝手に公開しない

## 9. WordPress貼り付け版の派生手順

単体HTMLが完成し、承認された後に作る。同時進行しない。

1. **クラス名に接頭辞を付ける**（例：`.lp-hero`, `.lp-btn`）。テーマのCSSと衝突すると原因追跡が地獄になる
2. **CSSのセレクタを接頭辞スコープに包む**。`body`, `h2`, `a` などの裸の要素セレクタをテーマに漏らさない
   ```css
   /* ❌ h2 { font-size: 1.875rem; } */
   /* ⭕ */ .lp-root h2 { font-size: 1.875rem; }
   ```
3. **`html/head/body` を外し、`<div class="lp-root">…</div>` の中身だけにする**
4. CSSは別ファイルにして、テーマの追加CSSか子テーマに置く。固定ページ本文に `<style>` を直書きするとエディタが壊すことがある
5. **文字化け対策**：貼り付け用テキストファイルは **UTF-8（BOMなし）** で保存する。改行はLF。エディタの「ビジュアル」タブに一度切り替えるとタグが壊れるので、**必ず「コード」／HTMLブロックのまま**編集する
6. 貼り付け後にフォームのショートコードへ差し替える
7. スマホ実機で確認。テーマ側の `container` の余白でレイアウトが変わることがあるので、幅の指定を確認する

派生版の出力先：`案件フォルダ/wp/貼り付け用.txt` と `案件フォルダ/wp/追加CSS.css`

---

## この段階の完了判定

- [ ] 375px幅で横スクロールが出ない
- [ ] 本文16px以上・行間1.8以上
- [ ] タップ領域44px以上
- [ ] 画像に width/height と alt がある
- [ ] コンソールエラーがゼロ
- [ ] 未提供素材が全部プレースホルダになっており、`04-required-assets.md` に載っている
- [ ] フォームの送信先が未定なら、その旨がコメントとユーザーへの報告に明示されている
- [ ] 実績数値・お客様の声を創作で埋めていない
