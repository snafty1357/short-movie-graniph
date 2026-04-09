/**
 * OpenAI Service
 * ChatGPT APIを使って着画用プロンプトを生成（質問形式）
 */

const OPENAI_PROXY_URL = '/api/openai';

interface ChatGPTResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

export interface Question {
  id: string;
  question: string;
  options: string[];
  answer?: string;
  garmentLabel?: string;
}

export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | any[];
}

/**
 * ChatGPT API を呼び出し（サーバーサイドプロキシ経由）
 * ブラウザからの直接呼び出しはCORSエラーになるため、/api/openai プロキシを使用
 */
async function callChatGPTWithHistory(
  messages: ConversationMessage[]
): Promise<string> {
  const response = await fetch(OPENAI_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 1000,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API Error: ${response.status} - ${err}`);
  }

  const data: ChatGPTResponse = await response.json();

  if (data.error) {
    throw new Error(`OpenAI API Error: ${data.error.message}`);
  }

  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty ChatGPT response');
  return text.trim();
}

/**
 * モデル画像とアイテム画像から質問を生成
 */
export async function generateQuestions(
  modelImageBase64: string,
  garmentImageBase64: string,
  garmentDescription?: string,
  selectedPose?: string
): Promise<Question[]> {
  const systemPrompt = `あなたはプロのファッションスタイリスト兼バーチャル試着AIアシスタントです。

【最重要】服の完全再現が最優先です。
- 服のデザイン、装飾、ボタンの数、柄、ロゴ、ステッチ、ポケットなど全てのディテールを100%忠実に再現することが絶��条件です。
- 服自体の見た目を変更する質問は絶対にしないでください。
- 質問は「着こなし方」のみに限定してください。

必ず以下のJSON形式で質問を返してください（質問は3〜5個程度）：
[
  {
    "id": "q1",
    "question": "質問文",
    "options": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"]
  }
]

質問は日本語で、選択肢は2〜5個にしてください。`;

const userPrompt = `モデル画像と衣服画像を分析し、着こなし方についてのみ質問を作成してください。

${garmentDescription ? `衣服の説明: ${garmentDescription}` : ''}
${selectedPose ? `【指定されているポーズ】: ${selectedPose}` : ''}

【重要】服のディテール（ボタンの数、装飾、柄、ロゴ、ポケット、ステッチなど）は画像から完全に再現するため、これらについての質問は不要です。

以下の「着こなし方」や「ポーズ」についてのみ質問してください：

【着用方法】
- ボタンやファスナーを開けるか閉めるか
- 袖をまくるかどうか
- 裾をインするか出すか

【フィット感】
- タイト/ジャスト/ゆったりのどれで着るか

【スタイリング】
- 全体の雰囲気（カジュアル/きれいめ等）

【ポーズ・姿勢】
${selectedPose ? `- ユーザーは既にポーズ「${selectedPose}」を参考として指定しています。このポーズを活かすか、それとも調整するか（例えば目線、手の細かい位置など）について質問してください。` : `- モデル画像のポーズを分析し、それを維持するか、別のポーズ（ポケットに手を入れる、腕を組む、横向き、振り返る、歩く姿など）に変更するか質問してください。`}

服のデザイン自体に関する質問は絶対にしないでください。
JSON配列形式で返してください。`;

  const messages: ConversationMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { type: 'text', text: userPrompt },
        {
          type: 'image_url',
          image_url: { url: modelImageBase64, detail: 'low' },
        },
        {
          type: 'image_url',
          image_url: { url: garmentImageBase64, detail: 'low' },
        },
      ],
    },
  ];

  const response = await callChatGPTWithHistory(messages);

  // JSONをパース
  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('Failed to parse questions:', e);
  }

  // フォールバック質問（着こなし方のみ - 服のデザインは変更しない）
  return [
    {
      id: 'q1',
      question: 'ボタン・ファスナーはどうしますか？',
      options: ['全部閉める', '一番上だけ開ける', '数個開ける', '全開'],
    },
    {
      id: 'q2',
      question: 'フィット感はどうしますか？',
      options: ['タイトめ', 'ジャストサイズ', 'ややゆったり'],
    },
    {
      id: 'q3',
      question: '裾の処理はどうしますか？',
      options: ['そのまま出す', 'ボトムスにイン', '前だけイン'],
    },
    {
      id: 'q4',
      question: '全体の雰囲気は？',
      options: ['カジュアル', 'きれいめ', 'クール', 'リラックス'],
    },
  ];
}

/**
 * 質問への回答からFal.ai Nanobanana2/Flux向けプロンプトを生成
 */
export async function generatePromptFromAnswers(
  modelImageBase64: string,
  garmentImageBase64: string,
  questions: Question[],
  garmentDescription?: string,
  selectedPose?: string
): Promise<string> {
  const answeredQuestions = questions
    .filter(q => q.answer)
    .map(q => `- ${q.question}: ${q.answer}`)
    .join('\n');

  const systemPrompt = `You are a prompt engineer for Fal.ai Flux/Nanobanana2 virtual try-on image generation.

=== CRITICAL: GARMENT FIDELITY IS THE TOP PRIORITY ===

The garment in the image MUST be reproduced with 100% accuracy:
- Every button, zipper, pocket, logo, pattern, stitch, decoration must be exactly as shown
- Colors, textures, and materials must match perfectly
- Do NOT modify, simplify, or alter ANY design element of the garment
- The garment should look IDENTICAL to the source image

Your task is to create a prompt that preserves all garment details while applying the user's styling preferences.

Output format:

=== POSITIVE PROMPT ===

[Garment Fidelity - MOST IMPORTANT]
(Describe the exact garment with ALL its details from the image)

[Subject]
(Person wearing the garment, including posture and body language based on user preferences)

[Styling & Pose]
(How the garment is worn and the pose/posture based on user preferences)

[Quality]
(Quality tags)

=== NEGATIVE PROMPT ===

[Avoid]
(Things to avoid, including any garment alterations)`;

const userPrompt = `Create a virtual try-on prompt.

CRITICAL: The garment must be reproduced with 100% accuracy - every detail (buttons, pockets, logos, patterns, stitches, decorations) must be preserved exactly as shown in the image.

${garmentDescription ? `Garment description: ${garmentDescription}\n` : ''}
${selectedPose ? `Target Pose / Posture: ${selectedPose}\n` : ''}
User's styling preferences (how to wear it):
${answeredQuestions}

Generate the prompt now:

=== POSITIVE PROMPT ===

[Garment Fidelity - MOST IMPORTANT]
Exact reproduction of the garment with all original details preserved: every button, zipper, pocket, logo, pattern, stitch, and decoration exactly as shown in the reference image, identical colors and textures, no modifications to the original design

[Subject]
A person wearing the exact garment from the reference image, matching the user's requested pose and posture

[Styling & Pose]
(Apply user preferences for styling and pose here)

[Quality]
High quality fashion photography, photorealistic, detailed fabric textures, professional studio lighting, 8k resolution, sharp focus, accurate garment reproduction

=== NEGATIVE PROMPT ===

[Avoid]
altered garment design, missing buttons, wrong number of pockets, changed patterns, modified logos, different decorations, simplified details, low quality, blurry, distorted, deformed, bad anatomy, wrong proportions, extra limbs, missing limbs, watermark, signature, text

Generate in English only:`;

  const messages: ConversationMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { type: 'text', text: userPrompt },
        {
          type: 'image_url',
          image_url: { url: modelImageBase64, detail: 'low' },
        },
        {
          type: 'image_url',
          image_url: { url: garmentImageBase64, detail: 'low' },
        },
      ],
    },
  ];

  return callChatGPTWithHistory(messages);
}

/**
 * プロンプトをFal.ai Flux/Nanobanana2向けに最適化
 */
export async function optimizeTryOnPrompt(currentPrompt: string): Promise<string> {
  const messages: ConversationMessage[] = [
    {
      role: 'system',
      content: `You are a prompt optimization expert for Fal.ai Flux/Nanobanana2 virtual try-on.

=== CRITICAL: GARMENT FIDELITY MUST BE PRESERVED ===

When optimizing, you MUST:
- Keep ALL garment details (buttons, pockets, logos, patterns, decorations) exactly as described
- NEVER remove or simplify any garment-specific details
- Add quality enhancers without changing the garment description
- Ensure the negative prompt includes "altered garment design, missing details"

Output format:

=== POSITIVE PROMPT ===

[Garment Fidelity - MOST IMPORTANT]
(Keep original garment details, enhance description)

[Subject]
(Enhanced person description, including clear pose and posture)

[Styling & Pose]
(Enhanced styling and pose details)

[Quality]
(Enhanced quality tags)

=== NEGATIVE PROMPT ===

[Avoid]
(Include garment alteration avoidance + quality issues)`,
    },
    {
      role: 'user',
      content: `Optimize this prompt while PRESERVING all garment details exactly as described:

${currentPrompt}

IMPORTANT: Do not remove or simplify any garment-specific details (buttons, pockets, logos, patterns, etc.)

Output the optimized prompt only:`,
    },
  ];

  return callChatGPTWithHistory(messages);
}

/**
 * プロンプトからポジティブ/ネガティブを分離
 */
export function parsePrompt(fullPrompt: string): { positive: string; negative: string } {
  const negativeMatch = fullPrompt.match(/===\s*NEGATIVE PROMPT\s*===([\s\S]*?)$/i);
  const positiveMatch = fullPrompt.match(/===\s*POSITIVE PROMPT\s*===([\s\S]*?)(?:===\s*NEGATIVE|$)/i);

  let positive = fullPrompt;
  // デフォルトのネガティブプロンプト - 服の変更を防ぐ指示を含む
  let negative = 'altered garment design, missing buttons, wrong number of pockets, changed patterns, modified logos, different decorations, simplified details, low quality, blurry, distorted, deformed, bad anatomy, wrong proportions, extra limbs, missing limbs, disfigured, ugly, bad hands, missing fingers, extra fingers, watermark, signature, text';

  if (positiveMatch) {
    positive = positiveMatch[1].trim();
  }

  if (negativeMatch) {
    negative = negativeMatch[1]
      .replace(/\[Avoid\]/gi, '')
      .trim();
  }

  return { positive, negative };
}

/**
 * 服の詳細分析結果
 */
export interface GarmentAnalysis {
  type: string;           // 服の種類
  color: string;          // 色
  pattern: string;        // 柄・パターン
  buttons: string;        // ボタンの数・種類
  pockets: string;        // ポケットの数・位置
  collar: string;         // 襟の形状
  sleeves: string;        // 袖の形状
  decorations: string;    // 装飾・ディテール
  material: string;       // 素材感
  brand: string;          // ブランドロゴ等
  summary: string;        // 要約（英語）
  extra?: string;         // ユーザー追加メモ
}

/**
 * 服の詳細分析結果（ChatGPT版）
 */
export interface GarmentAnalysisChatGPT extends GarmentAnalysis {}

/**
 * ChatGPTで服の画像を詳細に分析
 */
export async function analyzeGarmentWithChatGPT(garmentImageBase64: string): Promise<GarmentAnalysisChatGPT> {
  const systemPrompt = `あなたはファッション分析の専門家です。服の画像を詳細に分析し、以下のJSON形式で日本語で回答してください。

{
  "type": "服の種類（例：シャツ、ジャケット、ワンピース等）",
  "color": "色（例：ネイビー、白、マルチカラー等）",
  "pattern": "柄・パターン（例：無地、ストライプ、チェック、花柄等。なければ「無地」）",
  "buttons": "ボタンの数と種類（例：前ボタン6個（プラスチック製）、なければ「なし」）",
  "pockets": "ポケットの数と位置（例：胸ポケット1個、サイドポケット2個、なければ「なし」）",
  "collar": "襟の形状（例：レギュラーカラー、スタンドカラー、なければ「なし」）",
  "sleeves": "袖の形状（例：長袖、半袖、ノースリーブ等）",
  "decorations": "その他の装飾・ディテール（例：刺繍、レース、リボン、ジッパー、スタッズ等。なければ「特になし」）",
  "material": "推定される素材感（例：コットン、シルク、デニム、ニット等）",
  "brand": "見えるブランドロゴやタグ（なければ「確認できず」）",
  "summary": "英語での簡潔な要約（1-2文）"
}

画像から確認できる情報のみを記載し、推測は最小限にしてください。
JSONのみを出力してください。`;

  const messages: ConversationMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'この服の画像を詳細に分析してください。' },
        {
          type: 'image_url',
          image_url: { url: garmentImageBase64, detail: 'high' },
        },
      ],
    },
  ];

  const response = await callChatGPTWithHistory(messages);

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('Failed to parse ChatGPT garment analysis:', e);
  }

  // フォールバック
  return {
    type: '不明',
    color: '不明',
    pattern: '不明',
    buttons: '確認中',
    pockets: '確認中',
    collar: '確認中',
    sleeves: '確認中',
    decorations: '確認中',
    material: '不明',
    brand: '確認できず',
    summary: 'Analysis pending',
  };
}

/**
 * モデル画像からポーズを分析
 */
export async function analyzePose(imageDataUrl: string): Promise<string> {
  const messages: ConversationMessage[] = [
    {
      role: 'system',
      content: 'You are a pose analysis expert. Analyze the person\'s pose in the image and return a short English phrase describing the pose. Examples: "standing front-facing", "walking naturally", "sitting on a chair", "arms crossed confidently", "leaning against a wall casually", "standing with hands on hips", "looking over shoulder", "standing with one hand in pocket". Return ONLY the pose description, nothing else.',
    },
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: imageDataUrl, detail: 'low' },
        },
        {
          type: 'text',
          text: 'Describe this person\'s pose in a short English phrase.',
        },
      ],
    },
  ];

  const result = await callChatGPTWithHistory(messages);
  return result.trim().toLowerCase().replace(/[."']/g, '');
}

/**
 * 服の画像から英語の説明を生成
 */
export async function describeGarment(garmentImageBase64: string, userHint?: string): Promise<string> {
  const messages: ConversationMessage[] = [
    {
      role: 'system',
      content: `You are a fashion AI assistant. Analyze the garment image and provide a concise English description suitable for a virtual try-on model.
${userHint ? `User's description hint: "${userHint}"` : ''}

Describe the garment in 1-2 sentences focusing on:
- Type (shirt, dress, jacket, etc.)
- Color and pattern
- Style and fit
- Notable details

Return ONLY the description, no other text.`
    },
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: garmentImageBase64, detail: 'low' },
        },
        {
          type: 'text',
          text: 'Describe this garment.',
        },
      ],
    },
  ];

  return callChatGPTWithHistory(messages);
}

/**
 * ユーザーの日本語入力を英語プロンプトに最適化
 */
export async function optimizeDescription(userDescription: string): Promise<string> {
  const messages: ConversationMessage[] = [
    {
      role: 'system',
      content: `Translate and optimize this Japanese garment description into a concise English description for an AI virtual try-on model. Keep it under 2 sentences.
Japanese input: "${userDescription}"

Return ONLY the English description.`
    }
  ];

  return callChatGPTWithHistory(messages);
}

export const analyzeGarment = analyzeGarmentWithChatGPT;
