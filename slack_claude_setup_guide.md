# Slack × Claude連携 APIセットアップガイド

自作のReact(Vite)アプリに組み込んだ「SlackとClaudeを通信させるためのAPI（Vercel Functions）」の設定方法と使い方をまとめたドキュメントです。

---

## 1. 必要な環境変数とAPIキーの取得
APIを正常に稼働させるためには、以下の2つのキーが必要です。（ローカルで動かす場合は `.env.local` などの環境変数ファイルに追記します。）

| 環境変数名 | 取得先 / 役割 |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropicコンソールから取得。Claudeに推論させるためのキー。 |
| `SLACK_BOT_TOKEN` | Slack APIダッシュボードで取得。Slackチャンネルにメッセージを送信するための権限キー。（`xoxb-` から始まるもの） |

---

## 2. Slack Appの設定手順

Slackのワークスペース上でこのボットを動かすための初期設定です。

### 1. アプリの作成
1. [Slack API - Your Apps](https://api.slack.com/apps) にアクセス。
2. **Create New App** > **From scratch** を選択し、アプリ名と対象ワークスペースを決定。

### 2. 権限（Scope）の付与
1. 左側のメニューから **OAuth & Permissions** を開く。
2. ページ中段の **Scopes (Bot Token Scopes)** に以下の2つを追加。
   * `app_mentions:read` （メンションされたことを検知する権限）
   * `chat:write` （チャンネルに文字を送信する権限）
3. 上部にある **Install to Workspace** ボタンを押し、連携を許可する。
4. ここで発行される **Bot User OAuth Token** (`xoxb-`から始まる文字列) が `SLACK_BOT_TOKEN` です。

---

## 3. ローカル環境でのテスト・使い方

Vercel Functionsをローカルで動かし、実際にアクセスしてみる方法です。

### サーバーの起動
今あるViteプロジェクトディレクトリの中で、以下のコマンドを実行します。
```bash
npx vercel dev
```
これで `http://localhost:3000` などのポートでフロントエンドとAPIが同時に立ち上がります。APIのエンドポイントは `http://localhost:3000/api/slack` です。

### 擬似的（ローカル完結）にテストする方法
別のターミナルを開き、コマンドラインから以下の `curl` コマンドを叩くことで、Slackからメンションイベントが飛んできた状態をシミュレーションできます。

```bash
curl -X POST http://localhost:3000/api/slack \
-H "Content-Type: application/json" \
-d '{
  "event": {
    "type": "app_mention",
    "text": "<@U0123456> 今の生成コストは？",
    "channel": "C12345678"
  }
}'
```
※ターミナル上にレスポンスが出力されていれば成功です。

---

## 4. 実際にSlackと繋ぐための設定 (Event Subscriptions)

Slackから「実際に」リクエストをあなたのPCに送るには、APIがインターネット上に公開されている必要があります。

### A. Vercelに本番デプロイする場合
1. Vercelにプロジェクトをデプロイし、本番のドメインを取得します（例: `https://my-app.vercel.app`）。
2. Vercelのダッシュボード上で、`ANTHROPIC_API_KEY` と `SLACK_BOT_TOKEN` の環境変数を設定します。

### B. ローカルでngrokを使う場合（開発中）
1. `ngrok http 3000` コマンドを実行し、`https://xxxx.ngrok.app` という公開用URLを発行します。

### Slack側にURLを登録する
1. Slack APIメニューの **Event Subscriptions** を開く。
2. トグルを `On` にし、**Request URL** にご自身のAPIのURLを入力する。
   * 例： `https://my-app.vercel.app/api/slack` または `https://xxxx.ngrok.app/api/slack`
3. ※この時、あなたのAPIは「Verified」を返すプログラムになっている必要があるため、必ずサーバー(`vercel dev`等)を起動しておいてください。緑色の `Verified` チェックマークが出れば成功です。
4. そのすぐ下の **Subscribe to bot events** に `app_mention` を追加。
5. 下部の **Save Changes** をクリック。

---

### アプリをチャンネルに招待する
テストしたいSlackチャンネルに移動し、「Integrations」から作成したアプリを追加するか、あるいはチャンネルで `@あなたが作ったボット名` と発言し、「Add to Channel」で招待します。

以降は、そのチャンネルでボット宛にメンション（例: `@bot 今のアプリの生成コストは？`）を飛ばすごとに、APIが受けてClaudeに投げ、返答をしてくれるようになります。
