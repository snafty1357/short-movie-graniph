import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

export const config = {
  maxDuration: 60,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ① POSTリクエストのみ受け付ける
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { body } = req;

  // ② Slackの Event Subscriptions 設定時に必須の「認証プロセス（challenge）」への応答
  if (body && body.type === 'url_verification') {
    return res.status(200).json({ challenge: body.challenge });
  }

  // ③ メンションイベント（@bot アプリのコストを教えて 等）の処理
  if (body && body.event && body.event.type === 'app_mention') {
    const userMessage = body.event.text;
    const channelId = body.event.channel;

    try {
      // 1. ここで「自作アプリのコスト計算処理」を行う（今回はテスト用の適当な計算）
      const testCost = 1.25; 

      // 2. Claudeに渡すプロンプトを作成
      const prompt = `ユーザーからのメッセージ: "${userMessage}"。\n現在のアプリの生成コストの目安は $${testCost} です。この情報を踏まえて、自然に返答してください。`;
      
      let claudeReply = `（※これはテスト応答です。実際のAPIキーが設定されていません。\nあなたのメッセージ: ${userMessage}\n計算テストコスト: $${testCost}）`;

      // APIキーが設定されていればClaudeを呼び出す
      if (process.env.ANTHROPIC_API_KEY) {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const msg = await anthropic.messages.create({
          model: "claude-3-haiku-20240307", // 応答の速いHaikuを使用
          max_tokens: 500,
          messages: [{ role: "user", content: prompt }],
        });
        claudeReply = msg.content[0].text;
      }

      // 3. Slack APIを直接叩いて返信する
      if (process.env.SLACK_BOT_TOKEN) {
        await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          },
          body: JSON.stringify({
            channel: channelId,
            text: claudeReply,
          }),
        });
      } else {
        // キーが未設定の場合はコンソールに出力するだけ
        console.log("-----------------------------------------");
        console.log(`[SLACK REPLY MOCK] TO CHANNEL ${channelId}:`);
        console.log(claudeReply);
        console.log("-----------------------------------------");
      }

      // 処理が完了したことをVercel(Slack)に伝える
      return res.status(200).send('OK');

    } catch (error) {
      console.error("内部エラーが発生しました:", error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  // その他のイベントの場合は問題なく受け取ったことを返す
  return res.status(200).send('Event received');
}
