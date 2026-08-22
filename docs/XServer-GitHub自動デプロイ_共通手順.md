# XServer × GitHub Actions 自動デプロイ 共通手順（全ツール横断・唯一の正）

lifeplanadvisor.or.jp 配下の各Webツール（tax / souzoku / loan-deduction / loan-calc …）を
XServerに自動デプロイするための**共通プレイブック**。新ツールを作るたびに履歴やメモリを
探し回らなくて済むよう、ここに一本化する。各ツールの個別事情は各リポジトリの `DEPLOY.md`。

## 大前提（よくある誤解の訂正）

- **XServerを直接操作する専用MCPは存在しない**（レジストリにも無い。2026-08確認）。
- 「MCPで自動デプロイできた」の実体は次の2つ：
  1. **GitHub Actions**（push → ビルド → `dist/` を rsync over SSH で XServerへ）… 継続的な自動化はこれ
  2. **初回だけXServerサーバーパネルの操作**（サブドメイン作成＋SSL有効化）… souzokuの時は
     Claudeが**ブラウザ操作で自動化**した（Chrome拡張「Claude in Chrome」接続時のみ可）。未接続なら手動。

## サーバー共通情報

| 項目 | 値 |
|---|---|
| サーバーID | `hloxserve1` |
| ホスト名 | `sv14130.xserver.jp` |
| SSHポート | `10022` |
| デプロイ鍵 | `~/.ssh/xserver_deploy`（ed25519）。公開鍵はXServer SSH設定に登録済み。**全ツール共用** |
| ドキュメントルート命名 | `/home/hloxserve1/lifeplanadvisor.or.jp/public_html/＜サブドメインFQDN＞/` |

稼働中の例:
- tax.lifeplanadvisor.or.jp（所得税・住民税計算） repo: okazaki-bot/tax-calc-web
- souzoku.lifeplanadvisor.or.jp（相続シミュレーター）
- loan-deduction.lifeplanadvisor.or.jp（住宅ローン控除） repo: okazaki-bot/loan-deduction-simulator
- loan-calc.lifeplanadvisor.or.jp（住宅ローンシミュレーター） repo: okazaki-bot/loan-calc-web

## 新ツールを公開する手順（テンプレ）

1. **独立リポジトリを作る**（my_project内に置くが、ツールごとに `git init` した別repo）。
   `gh repo create okazaki-bot/＜name＞ --private --source=. --push`
2. **`build.mjs`** で単一HTML(`dist/index.html`)を生成できるようにする（既存ツールからコピー）。
3. **`.github/workflows/deploy-xserver.yml`** を置く（下記テンプレ）。
4. **GitHub Secrets を5個**設定（既存の鍵を再利用するのでXServer側の鍵登録は不要）:
   ```bash
   printf 'sv14130.xserver.jp' | gh secret set SSH_HOST
   printf 'hloxserve1'         | gh secret set SSH_USER
   printf '10022'              | gh secret set SSH_PORT
   gh secret set SSH_PRIVATE_KEY < ~/.ssh/xserver_deploy
   printf '/home/hloxserve1/lifeplanadvisor.or.jp/public_html/＜FQDN＞/' | gh secret set DEPLOY_PATH
   ```
5. **XServerでサブドメインを作成**（サーバーパネル → サブドメイン設定 → 対象ドメインで
   「サブドメイン設定追加」→ 名前入力 → 追加）。SSLは自動発行、反映まで数分〜1時間。
6. **デプロイ実行**: `gh workflow run deploy-xserver.yml -R okazaki-bot/＜name＞`
7. **確認**: `curl -sI https://＜FQDN＞/ | head -1` が `HTTP/2 200` ならOK。

### workflow テンプレ（.github/workflows/deploy-xserver.yml）
```yaml
name: Deploy to XServer
on:
  push: { branches: [main] }
  workflow_dispatch:
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: node build.mjs
      - name: Setup SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.SSH_PRIVATE_KEY }}" > ~/.ssh/id_deploy
          chmod 600 ~/.ssh/id_deploy
          ssh-keyscan -p "${{ secrets.SSH_PORT }}" "${{ secrets.SSH_HOST }}" >> ~/.ssh/known_hosts
      - name: Deploy dist/ via rsync
        run: |
          rsync -avz -e "ssh -p ${{ secrets.SSH_PORT }} -i ~/.ssh/id_deploy" \
            ./dist/ "${{ secrets.SSH_USER }}@${{ secrets.SSH_HOST }}:${{ secrets.DEPLOY_PATH }}"
```

## ハマりどころ（全ツール共通）

1. **SSH「国外アクセス制限」はOFF必須**（GitHub Actionsは海外IP）。変更後は反映に数分。
2. **`ssh-keyscan` の一時失敗** → `gh run rerun <run-id>` で再実行。
3. **`DEPLOY_PATH` のディレクトリ名はFQDN**（`xxx.lifeplanadvisor.or.jp`）。短縮名だと404。
4. **`build.mjs` の `String.replace` 置換値は関数で渡す**（文字列だと `$$`→`$` 化けで本番のみ破損）。
5. **`build.mjs` の `order` 配列**にモジュールを追加し忘れると本番だけ "not defined"。
6. rsyncは `--delete` なし（安全側）。

## 参考（元情報の所在）

- 本ドキュメントが一次情報。個別は各repoの `DEPLOY.md`。
- 経緯の元履歴: souzoku=`claude-code-history/2026-07-05_Inheritance-simulation-software_*.md`、
  loan-deduction=メモリ `loan-deduction-web`。
