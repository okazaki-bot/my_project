---
name: gmail-pdf-numbering
description: GmailのラベルからPDF添付ファイルを取得し、各PDFの1ページ目右上に丸付き番号を挿入するスキル。「GmailのPDFに番号を振って」「ラベルの添付PDFを整理して」「PDF添付に丸番号を付けて」「Gmail PDF 識別番号」などの依頼で必ず使用すること。番号の重複禁止・元ファイル保護・処理レポート出力まで一貫して実行する。
---

# Gmail PDF 番号付与スキル

Gmailの指定ラベル内のPDF添付を取得し、各PDFの1ページ目右上に重複なしの丸付き番号を挿入して別名保存する。

## 依存ライブラリ

```bash
pip install pypdf reportlab google-api-python-client google-auth-httplib2 google-auth-oauthlib
```

Gmail OAuth認証の初回セットアップについては → `scripts/download_attachments.py` のコメントを参照。

## 実行フロー

### Step 0: パラメータ確認

処理開始前に以下の4つの値をユーザーから受け取ること。未入力があれば処理を止めて確認する。

| パラメータ | 説明 | 例 |
|---|---|---|
| `LABEL_NAME` | Gmailラベル名 | `請求書/2024` |
| `FILTER_CONDITION` | 抽出条件（下記参照） | `all` / `unread` / `days:30` / `from:foo@bar.com` |
| `OUTPUT_DIRECTORY` | 保存先フォルダの絶対パス | `/Users/me/Downloads/invoices` |
| `FILE_NAMING_RULE` | ファイル名規則 | `circled`（例: `file_①.pdf`） / `number`（例: `file_number01.pdf`） |

### Step 1: PDF添付のダウンロード

```bash
python scripts/download_attachments.py \
  --label "[LABEL_NAME]" \
  --filter "[FILTER_CONDITION]" \
  --output "[OUTPUT_DIRECTORY]"
```

- 指定ラベルが存在しない → エラー報告して処理中断
- 対象メール0件 / 添付PDF0件 → 報告して正常終了
- 出力: `OUTPUT_DIRECTORY/_manifest.json`（ダウンロード一覧）

### Step 2: 番号挿入

```bash
python scripts/stamp_pdf.py \
  --manifest "[OUTPUT_DIRECTORY]/_manifest.json" \
  --naming "[FILE_NAMING_RULE]"
```

- 番号はランダムに割り当てる（重複禁止）
- 元PDFは上書きしない（編集済みを別名で保存）
- 出力: `OUTPUT_DIRECTORY/_report.json`（処理結果一覧）

### Step 3: 処理レポートの出力

`_report.json` を読み込み、以下の形式でユーザーに報告する。

---

**【処理結果サマリー】**

| 項目 | 値 |
|---|---|
| 対象ラベル | `LABEL_NAME` |
| 抽出条件 | `FILTER_CONDITION` |
| 対象メール件数 | N件 |
| ダウンロードPDF件数 | N件 |
| 正常処理件数 | N件 |
| スキップ件数 | N件 |
| エラー件数 | N件 |
| 保存先フォルダ | `OUTPUT_DIRECTORY` |

**【番号割り当て一覧】**

| # | 元メール件名 | 元ファイル名 | 編集後ファイル名 | 番号 | 処理結果 | 備考 |
|---|---|---|---|---|---|---|
| 1 | 請求書送付 | invoice_april.pdf | invoice_april_③.pdf | ③ | 成功 | |
| 2 | ... | ... | ... | ... | スキップ | パスワード保護 |

---

## 番号挿入仕様

- 位置: 1ページ目の右上（上端・右端から各 7mm 内側）
- サイズ: 直径 10mm（1cm × 1cm 以内）
- 描画方式:
  1. **優先**: 白地の円 + 中央にアラビア数字（Helvetica-Bold）
  2. ファイル名表記: Unicode丸付き数字（① ② ③ … ⑳ ㉑ … ㊿）
- 背景との判別が困難な場合 → 自動で代替描画（円枠太め + 縁取り）に切替
- 元ファイルは必ず保持する

## 例外処理

| 状況 | 対応 |
|---|---|
| ラベルが存在しない | 処理中断・エラー報告 |
| 対象メール0件 | 正常終了・「対象なし」報告 |
| 添付PDF0件 | 正常終了・「対象PDFなし」報告 |
| 破損PDF | スキップ・ファイル名と理由を記録 |
| パスワード保護PDF | スキップ・ファイル名と理由を記録 |
| 保存先に書込権限なし | 処理中断・エラー報告 |
| 同名ファイル衝突 | タイムスタンプ付与で別名保存・記録 |
| 丸数字描画不具合 | 代替描画へ自動切替・備考欄に記録 |

## 禁止事項

- 指定外のラベルを参照しない
- PDF以外の添付ファイルを処理しない
- 元ファイルを上書きしない
- 同じ番号を複数ファイルに付与しない
- エラー・スキップを黙って無視しない

## 検収条件（処理完了の判定基準）

1. 指定ラベルの対象メールが正しく参照されている
2. PDF添付のみ抽出されている
3. ダウンロードPDF件数が報告件数と一致している
4. 各PDFに重複のない番号が割り当てられている
5. 各PDFの1ページ目右上に番号が挿入されている
6. 番号サイズが 1cm × 1cm 以内である
7. 元PDFが上書きされていない
8. 編集済みPDFが別名保存されている
9. ファイル対応表（番号割り当て一覧）が出力されている
10. スキップ・失敗案件が明示されている
