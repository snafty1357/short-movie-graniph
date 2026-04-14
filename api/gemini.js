export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: { message: 'GEMINI_API_KEY is not configured' } });
  }

  try {
    const { messages, system_instruction } = req.body;
    
    // Convert OpenAI messages format to Gemini format
    let systemText = "";
    const contents = [];
    
    for (const msg of messages) {
      if (msg.role === 'system') {
        systemText += msg.content + "\n";
      } else {
        const role = msg.role === 'user' ? 'user' : 'model';
        // Handle text strings or complex contents
        let parts = [{ text: msg.content }];
        contents.push({ role, parts });
      }
    }
    
    const requestBody = {
      contents,
      generationConfig: {
        temperature: req.body.temperature || 0.7,
        maxOutputTokens: req.body.max_tokens || 4000
      }
    };
    
    if (systemText || system_instruction) {
      requestBody.systemInstruction = {
        parts: [{ text: system_instruction || systemText }]
      };
    }

    const modelName = req.body.model || 'gemini-2.5-flash';
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json({ error: { message: data.error?.message || 'Gemini API Error' } });
    }
    
    // Format response back to OpenAI standard
    const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    return res.status(200).json({
      choices: [
        { message: { content: textOutput } }
      ]
    });
  } catch (error) {
    console.error('Gemini Proxy Error:', error);
    return res.status(500).json({ error: { message: error.message } });
  }
}
