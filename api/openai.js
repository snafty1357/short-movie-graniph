export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  // CORS headers - 環境変数で許可オリジンを制限
  const allowedOrigin = process.env.CORS_ALLOWED_ORIGIN 
    ? process.env.CORS_ALLOWED_ORIGIN 
    : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '*');
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Use either the VITE_ prefixed or non-prefixed API key from env
  const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: { message: 'OPENAI_API_KEY is not configured' } });
  }

  // リクエストボディの基本検証
  if (!req.body || !req.body.messages || !Array.isArray(req.body.messages)) {
    return res.status(400).json({ error: { message: 'Invalid request: messages array is required' } });
  }

  // 許可するモデルのホワイトリスト
  const allowedModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'];
  const requestedModel = req.body.model || 'gpt-4o';
  if (!allowedModels.includes(requestedModel)) {
    return res.status(400).json({ error: { message: `Invalid model: ${requestedModel}` } });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('OpenAI Proxy Error:', error);
    return res.status(500).json({ error: { message: error.message } });
  }
}
