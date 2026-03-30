/**
 * Gemini Service
 * 服の説明をプロンプトに最適化
 */

declare const process: { env: { API_KEY?: string } };
const API_KEY = process.env.API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-latest:generateContent';

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

/**
 * Gemini API を呼び出し
 */
async function callGemini(prompt: string, imageBase64?: string): Promise<string> {
  if (!API_KEY) throw new Error('API_KEY is not configured');

  const parts: any[] = [{ text: prompt }];

  if (imageBase64) {
    const mimeMatch = imageBase64.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    parts.push({
      inline_data: {
        mime_type: mimeType,
        data: base64Data,
      }
    });
  }

  const response = await fetch(`${GEMINI_API_URL}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 256,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API Error: ${response.status} - ${err}`);
  }

  const data: GeminiResponse = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty Gemini response');
  return text.trim();
}

/**
 * 服の画像から英語の説明を生成
 */
export async function describeGarment(garmentImageBase64: string, userHint?: string): Promise<string> {
  const prompt = `You are a fashion AI assistant. Analyze the garment image and provide a concise English description suitable for a virtual try-on model.

${userHint ? `User's description hint: "${userHint}"` : ''}

Describe the garment in 1-2 sentences focusing on:
- Type (shirt, dress, jacket, etc.)
- Color and pattern
- Style and fit
- Notable details

Return ONLY the description, no other text.`;

  return callGemini(prompt, garmentImageBase64);
}

/**
 * ユーザーの日本語入力を英語プロンプトに最適化
 */
export async function optimizeDescription(userDescription: string): Promise<string> {
  const prompt = `Translate and optimize this Japanese garment description into a concise English description for an AI virtual try-on model. Keep it under 2 sentences.

Japanese input: "${userDescription}"

Return ONLY the English description.`;

  return callGemini(prompt);
}
