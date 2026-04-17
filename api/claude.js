export const config = {
  maxDuration: 60, // 60秒タイムアウト
};

export default async function handler(req, res) {
  // CORS headers - 環境変数で許可オリジンを制限
  const allowedOrigin = process.env.CORS_ALLOWED_ORIGIN 
    ? process.env.CORS_ALLOWED_ORIGIN 
    : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '*');
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, anthropic-version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: { message: 'ANTHROPIC_API_KEY is not configured' } });
  }

  try {
    const { messages, model, max_tokens, temperature } = req.body;
    
    // Convert OpenAI messages format to Claude format
    let systemText = "";
    const claudeMessages = [];
    
    for (const msg of messages) {
      if (msg.role === 'system') {
        systemText += msg.content + "\n";
      } else {
        claudeMessages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      }
    }

    const requestBody = {
      model: model || 'claude-3-5-sonnet-20241022',
      max_tokens: max_tokens || 4000,
      temperature: temperature || 0.7,
      messages: claudeMessages,
    };
    
    if (systemText) {
      requestBody.system = systemText;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json({ error: { message: data.error?.message || 'Claude API Error' } });
    }
    
    // Format response back to OpenAI standard
    const textOutput = data.content?.[0]?.text || "";
    
    return res.status(200).json({
      choices: [
        { message: { content: textOutput } }
      ]
    });
  } catch (error) {
    console.error('Claude Proxy Error:', error);
    return res.status(500).json({ error: { message: error.message } });
  }
}
