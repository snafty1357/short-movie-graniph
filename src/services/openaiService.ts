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

interface ImageUrlContent {
  type: 'image_url';
  image_url: { url: string; detail?: 'low' | 'high' | 'auto' };
}

interface TextContent {
  type: 'text';
  text: string;
}

type MessageContent = string | (TextContent | ImageUrlContent)[];

export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: MessageContent;
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
  selectedPose?: string,
  garmentType?: string
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
対象の衣服がトップスか、ボトムスか、ワンピースか等を判断し、それに合った質問にしてください。
- トップスの場合は、ボタン/ファスナーの開閉、袖のまくり方、裾をインするか出すかなど。
- ボトムスの場合は、ロールアップの有無、ウエスト位置（ハイウエスト等）、ベルトの有無など。
- シューズの場合は紐の結び方など。

【フィット感】
- タイト/ジャスト/ゆったりのどれで着るか

【スタイリング】
- 全体の雰囲気（カジュアル/きれいめ等）
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

  // フォールバック質問（衣服タイプに応じて分岐）
  const isBottom = garmentType === 'bottom' || /ボトム|パンツ|ズボン|スカート|pants|skirt|bottom|trousers|jeans|shorts/i.test(garmentDescription || '');
  const isDress = garmentType === 'dress' || /ワンピース|ドレス|セットアップ|dress|onepiece/i.test(garmentDescription || '');
  const isShoes = garmentType === 'shoes' || /シューズ|靴|スニーカー|shoes|sneaker|boot/i.test(garmentDescription || '');

  if (isBottom) {
    return [
      {
        id: 'q1',
        question: '丈の見せ方はどうしますか？',
        options: ['そのままの丈で', 'ロールアップ', '裾を折り返す'],
      },
      {
        id: 'q2',
        question: 'フィット感はどうしますか？',
        options: ['タイトめ', 'ジャストサイズ', 'ややゆったり', 'ワイド'],
      },
      {
        id: 'q3',
        question: 'ウエスト位置はどうしますか？',
        options: ['ハイウエスト', 'ジャストウエスト', 'ローウエスト'],
      },
      {
        id: 'q4',
        question: '全体の雰囲気は？',
        options: ['カジュアル', 'きれいめ', 'クール', 'リラックス'],
      },
    ];
  }

  if (isDress) {
    return [
      {
        id: 'q1',
        question: 'フィット感はどうしますか？',
        options: ['タイトめ', 'ジャストサイズ', 'ややゆったり', 'フレア'],
      },
      {
        id: 'q2',
        question: 'ウエストの見せ方は？',
        options: ['自然なまま', 'ベルトでマーク', 'ウエストを絞る'],
      },
      {
        id: 'q3',
        question: '全体の雰囲気は？',
        options: ['カジュアル', 'きれいめ', 'エレガント', 'リラックス'],
      },
    ];
  }

  if (isShoes) {
    return [
      {
        id: 'q1',
        question: '靴紐やストラップは？',
        options: ['しっかり結ぶ', 'ゆるめに', '紐なし/該当なし'],
      },
      {
        id: 'q2',
        question: '全体の雰囲気は？',
        options: ['カジュアル', 'きれいめ', 'スポーティ', 'クール'],
      },
    ];
  }

  // デフォルト（トップス等）
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
  selectedPose?: string,
  garmentCategory?: string
): Promise<string> {
  const answeredQuestions = questions
    .filter(q => q.answer)
    .map(q => `- ${q.question}: ${q.answer}`)
    .join('\n');

  // レイヤリングコンテキスト
  let layeringContext = '';
  if (garmentCategory === 'outer') {
    layeringContext = '\n\nLAYERING RULE: This is an OUTER garment (jacket/coat). The person\'s existing inner clothing (t-shirt, shirt, etc.) MUST be preserved exactly as shown in the model image. Layer the new outerwear ON TOP.';
  } else if (garmentCategory === 'bottom') {
    layeringContext = '\n\nLAYERING RULE: This is a BOTTOM garment (pants/skirt). The person\'s existing upper body clothing MUST be preserved exactly as shown in the model image. Only the lower body garment changes.';
  } else if (garmentCategory === 'shoes') {
    layeringContext = '\n\nLAYERING RULE: These are SHOES. ALL of the person\'s existing clothing MUST be preserved. Only change their footwear.';
  } else if (garmentCategory === 'accessory') {
    layeringContext = '\n\nLAYERING RULE: This is an ACCESSORY. ALL of the person\'s existing clothing MUST be preserved. Only add the accessory.';
  } else if (garmentCategory === 'top') {
    layeringContext = '\n\nLAYERING RULE: This is a TOP garment. If the person is wearing an undershirt, camisole, or tank top underneath, PRESERVE that inner layer. Replace only the main top garment with the new item.';
  }

  const systemPrompt = `You are a prompt engineer for Fal.ai Flux/Nanobanana2 virtual try-on image generation.

=== CRITICAL: GARMENT FIDELITY IS THE TOP PRIORITY ===

The garment in the image MUST be reproduced with 100% accuracy:
- Every button, zipper, pocket, logo, pattern, stitch, decoration must be exactly as shown
- Colors, textures, and materials must match perfectly
- Do NOT modify, simplify, or alter ANY design element of the garment
- The garment should look IDENTICAL to the source image

Your task is to create a prompt that preserves all garment details while applying the user's styling preferences.

=== STRICT CONSTRAINTS ON EDITS ===
- DO NOT add any extra accessories (e.g., hats, sunglasses, jewelry, bags) unless explicitly requested in the user preferences.
- DO NOT change the person's pose or posture unless explicitly requested in the user preferences.
- Maintain the original subject's appearance and pose by default.

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
(altered garment design, missing details, wrong number of buttons, extra accessories, hats, sunglasses, jewelry, changed pose)`;



  const messages: ConversationMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { type: 'text', text: `Generate the final try-on prompt. TRANSLATE ALL CONTENT TO ENGLISH. The entire output must be IN ENGLISH.

CRITICAL INSTRUCTION - DO NOT FAIL:
You MUST accurately reproduce all physical details from the Garment Analysis. If the analysismentions "6 buttons", "chest pocket", or specific patterns, you MUST explicitly include those exact quantities and descriptions in the [Garment Fidelity] section of your output. Do not summarize or omit any hardware or structural details.

Garment Analysis / Description:
${garmentDescription || 'Unknown garment'}

User Preferences (How to wear it):
${answeredQuestions}

Selected Pose (Reference):
${selectedPose || 'No specific pose requested. Use user preferences.'}
${layeringContext}` },
        {
          type: 'image_url',
          image_url: { url: modelImageBase64, detail: 'low' },
        },
        {
          type: 'image_url',
          image_url: { url: garmentImageBase64, detail: 'high' },
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
- TRANSLATE everything to ENGLISH
- Keep ALL garment details exactly as described. If the input mentions constraints like "6 buttons", "chest pocket", "lace-up", you MUST explicitly write them down in the output prompt.
- NEVER remove, summarize, or simplify any garment-specific details
- Add quality enhancers without changing the garment description
- STRICT RULE: DO NOT add any extra accessories (hats, sunglasses, jewelry, etc) unless explicitly requested.
- STRICT RULE: DO NOT change the person's pose unless explicitly requested. Keep the original pose.
- Ensure the negative prompt includes "altered garment design, missing details, wrong number of buttons, extra accessories, hats, sunglasses, jewelry, changed pose"

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
      content: `Optimize this prompt while PRESERVING all garment details exactly as described.
TRANSLATE THE PROMPT TO ENGLISH IF IT IS IN JAPANESE. The final output must be ENTIRELY in English.

${currentPrompt}

IMPORTANT: Do not remove or simplify any garment-specific details (buttons, pockets, logos, patterns, etc.)

Output the optimized English prompt only:`,
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
export async function analyzeGarmentWithChatGPT(garmentImageBase64: string, category?: string): Promise<GarmentAnalysisChatGPT> {
  // カテゴリ別の分析フィールドを構築
  let jsonTemplate: string;
  let analyzeText: string;

  if (category === 'shoes') {
    jsonTemplate = `{
  "type": "靴の種類（例：スニーカー、ブーツ、ローファー、パンプス、サンダルなど）",
  "color": "色（例：黒、白、茶色、マルチカラーなど）",
  "pattern": "柄やテクスチャ（例：無地、ツートン、アニマル柄など。無地の場合は '無地'）",
  "buttons": "留め具の種類（例：紐、スリッポン、ベルクロ、バックル、ジッパー）",
  "pockets": "ソールの種類（例：ラバーソール、レザーソール、プラットフォーム、フラット）",
  "collar": "ヒールの高さ・種類（例：フラット、ローヒール、ハイヒール、ウェッジ。ない場合は 'フラット'）",
  "sleeves": "つま先の形状（例：ラウンドトゥ、ポインテッドトゥ、オープントゥ、スクエアトゥ）",
  "decorations": "装飾（例：ロゴ、ステッチ、スタッズ、ストラップ。ない場合は 'なし'）",
  "material": "素材（例：レザー、キャンバス、スエード、メッシュ、合成皮革など）",
  "brand": "見えるブランドロゴやタグ（わからない場合は '不明'）",
  "summary": "Concise English summary for image generation prompt (1-2 sentences)"
}`;
    analyzeText = 'この靴/フットウェアの画像を詳細に分析してください。';
  } else if (category === 'accessory') {
    jsonTemplate = `{
  "type": "アクセサリーの種類（例：時計、バッグ、帽子、マフラー、サングラス、ベルトなど）",
  "color": "色（例：ゴールド、シルバー、黒、茶色など）",
  "pattern": "柄やデザイン（例：無地、モノグラム、プリント。無地の場合は '無地'）",
  "buttons": "留め具（例：クラスプ、バックル、マグネット、ジッパー。ない場合は 'なし'）",
  "pockets": "コンパートメントやセクション（バッグの場合：ポケットの数など。該当しない場合は 'なし'）",
  "collar": "シルエット・形状（例：ラウンドフェイスの時計、トートバッグ、バケットハットなど）",
  "sleeves": "サイズ感（例：スモール、ミディアム、ラージ、オーバーサイズ）",
  "decorations": "ディテール（例：宝石、刻印、チャーム、金具、ロゴなど。ない場合は 'なし'）",
  "material": "素材（例：金属、レザー、布地、プラスチック、金メッキなど）",
  "brand": "見えるブランドロゴやタグ（わからない場合は '不明'）",
  "summary": "Concise English summary for image generation prompt (1-2 sentences)"
}`;
    analyzeText = 'このアクセサリーの画像を詳細に分析してください。';
  } else {
    // デフォルト: 衣服（トップス、ボトムス、アウター、ワンピース等）
    jsonTemplate = `{
  "type": "服の種類（例：シャツ、ジャケット、パンツ、スカート、ワンピースなど）",
  "color": "色（例：ネイビー、白、マルチカラーなど）",
  "pattern": "柄（例：無地、ストライプ、チェック、花柄など。無地の場合は '無地'）",
  "buttons": "ボタンの数や種類（例：フロントボタン6個。ない場合は 'なし'）",
  "pockets": "ポケットの数や位置（例：胸ポケット1個。ない場合は 'なし'）",
  "collar": "襟の形（例：レギュラーカラー、スタンドカラー。ボトムスの場合は 'なし'）",
  "sleeves": "袖の種類（例：長袖、半袖。ボトムスの場合は 'なし'）",
  "decorations": "その他のディテール（例：タック、センタープレス、ジッパー、刺繍など。ない場合は 'なし'）",
  "material": "素材感（例：コットン、シルク、デニム、ニットなど）",
  "brand": "見えるブランドロゴやタグ（わからない場合は '不明'）",
  "summary": "Concise English summary for image generation prompt (1-2 sentences)"
}`;
    analyzeText = 'この服の画像を詳細に分析してください。';
  }

  const systemPrompt = `You are a professional fashion analyst. Analyze the image in detail and respond in the following JSON format. Most fields MUST be IN JAPANESE, except the "summary" field which MUST be IN ENGLISH.

${jsonTemplate}

Only describe what is visible in the image. Keep speculation to a minimum.
Output JSON only.`;

  const messages: ConversationMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { type: 'text', text: analyzeText },
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

  // Fallback
  return {
    type: 'unknown',
    color: 'unknown',
    pattern: 'unknown',
    buttons: 'pending',
    pockets: 'pending',
    collar: 'pending',
    sleeves: 'pending',
    decorations: 'pending',
    material: 'unknown',
    brand: 'unidentified',
    summary: 'Analysis pending',
  };
}

export interface PoseAnalysisResult {
  detectedPose: string;
  question: string;
  options: string[];
}

/**
 * モデル画像からポーズを分析し、ユーザーへ質問を生成
 */
export async function analyzePose(imageDataUrl: string): Promise<PoseAnalysisResult> {
  const messages: ConversationMessage[] = [
    {
      role: 'system',
      content: `あなたはプロのAIポーズアナリストです。画像から人物の姿勢やポーズを分析し、JSONで次の情報を返してください。
1. detectedPose: 生成AIで使える短い英語のポーズプロンプト（例: "standing front-facing", "walking naturally", "sitting on a chair"）
2. question: ユーザーに対して、このポーズをどう指示するか（そのまま使うか、アレンジするか等）の日本語の質問
3. options: ユーザーが選べる日本語の選択肢（2〜4個）

JSON形式:
{
  "detectedPose": "english prompt",
  "question": "日本語の質問",
  "options": ["選択肢1", "選択肢2"]
}`,
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
          text: 'この画像のポーズを分析し、JSON形式で返答してください。',
        },
      ],
    },
  ];

  try {
    const result = await callChatGPTWithHistory(messages);
    const parsed = JSON.parse(result);
    return {
      detectedPose: parsed.detectedPose || '',
      question: parsed.question || 'ポーズをどのように設定しますか？',
      options: parsed.options || ['このまま'],
    };
  } catch (err) {
    console.error('Pose parsing error:', err);
    return {
      detectedPose: 'standing naturally',
      question: 'AIによるポーズ分析ができませんでした。どのようにしますか？',
      options: ['自然に立たせる', '元の画像にできるだけ寄せる'],
    };
  }
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
