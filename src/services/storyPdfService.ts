/**
 * Story PDF → カット割りAI生成サービス
 * 
 * 1. PDF からテキストを抽出（pdfjs-dist）
 * 2. レギュレーション + メタプロンプト + ストーリーテキストを OpenAI に送信
 * 3. 構造化されたカット割り JSON を返却
 */

import * as pdfjsLib from 'pdfjs-dist';

// PDF.js ワーカー設定（Vite でバンドル済み ESM ワーカーを使用）
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

// ─── 型定義 ───

export interface CutCompositionRow {
  cutNumber: number;
  duration: string;
  role: string;
  centralEvent: string;
  productEmphasis: string;
  weightLevel: string;
  fromStart: string;
  toEnd: string;
  camera: string;
  gaze: string;
  expression: string;
  pose: string;
  walkPosition: string;
  moveDistance: string;
  background: string;
  ipPresence: boolean;
  ipAction?: string;      // IPの行動・アクション
  ipExpression?: string;  // IPの表情
  ipPosition?: string;    // IPの位置（画面内のどこにいるか）
  tradeOff: string;
  negativeFocus: string;
}

export interface StoryPdfResult {
  extractedText: string;
  cuts: CutCompositionRow[];
  rawAiResponse: string;
}

// ─── デフォルトレギュレーション ───

export const DEFAULT_REGULATION = `【レギュレーション】
■ カット数: 7カット構成（増減は5〜9の間で許容）
■ 尺配分: 合計15〜20秒（1カット平均2〜3秒）
■ 必須ルール:
  - CUT 1, 2 にはIP（サブキャラ）は登場しない
  - 重さレベルは1〜5（1=軽い, 5=最も重い）
  - カメラ距離は「クローズアップ / バストショット / ミディアム / ミドルロング / 全身」のいずれか
  - 1つのカットに中心事象は1つだけ
  - 感情のアーク：序盤=緊張/不安 → 中盤=葛藤/ズレ → 終盤=解放/余韻
■ プロダクト強調:
  - 少なくとも2カットで衣装の特徴的な部位をカメラで強調する
  - 強調部位は具体的に「袖のシルエット」「背面のロゴ」等と記述する
■ 背景要素:
  - ストーリーの舞台に一貫性を持たせる
  - 背景が変わる場合はカット間で自然な遷移があること`;

export const DEFAULT_META_PROMPT = `あなたはプロの映像クリエイターで、ショート動画のカット構成を設計する専門家です。

与えられた「ストーリー」テキストを読み解き、レギュレーションに従って、カット割りの構成表を生成してください。

【重要：IP（サブキャラクター/マスコット）の判定ルール】
ストーリー内で以下のような記述があった場合、そのカットの ipPresence を true にしてください:
- 「IP」「キャラクター」「マスコット」「ぬいぐるみ」「小さな存在」などの言及
- メインキャラクター以外の登場人物やクリーチャーの行動
- 「一緒に」「共に」「隣に」などの共演を示す表現
- ただし、CUT 1, 2 は必ず ipPresence: false とすること

各カットには以下の要素を含めてください:
1. CUT番号と秒数
2. 役割（そのカットの物語上の機能: 状況把握/重さ提示/重さの深化/ズレ発生/軽さ提示/解放/余韻 など）
3. 中心事象（そのカットで起きる具体的なアクション）
4. プロダクト強調部位（衣装のどこにフォーカスするか。ない場合は空欄）
5. 重さレベル（1〜5）
6. From(START) → To(END)（カットの始まりと終わりの状態）
7. カメラ（距離/高さ/向き）
8. 視線（キャラクターが何を見ているか）
9. 表情
10. ポーズ
11. 歩行位置（画面内の位置遷移）
12. 移動距離（短距離/中距離/長距離）
13. 背景要素
14. IP有無（サブキャラクター/マスコットの登場有無。ストーリー内容から判断。CUT 1,2は必ず false）
15. IPの行動（ipPresenceがtrueの場合: IPが何をしているか。例: 主人公の肩に乗っている、踊っている、驚いている等）
16. IPの表情（ipPresenceがtrueの場合: IPの表情。例: 笑顔、無表情、驚き等）
17. IPの位置（ipPresenceがtrueの場合: 画面内のIPの位置。例: 主人公の右肩、画面右下、主人公の後ろ等）
18. Trade-off（そのカットで何を犠牲にしているか）
19. ネガティブ重点（生成時に避けるべき要素）

必ず以下のJSON配列形式で返してください:
[
  {
    "cutNumber": 1,
    "duration": "2.5秒",
    "role": "状況把握",
    "centralEvent": "主人公が街を歩いている",
    "productEmphasis": "",
    "weightLevel": "レベル2",
    "fromStart": "...",
    "toEnd": "...",
    "camera": "ミドルロング / 正面やや斜め",
    "gaze": "前方",
    "expression": "穏やか",
    "pose": "自然な歩行",
    "walkPosition": "画面中央",
    "moveDistance": "短距離",
    "background": "都会の街並み",
    "ipPresence": false,
    "ipAction": "",
    "ipExpression": "",
    "ipPosition": "",
    "tradeOff": "...",
    "negativeFocus": "..."
  },
  {
    "cutNumber": 3,
    "duration": "2秒",
    "role": "ズレ発生",
    "centralEvent": "マスコットが突然現れ主人公が驚く",
    "productEmphasis": "",
    "weightLevel": "レベル3",
    "fromStart": "...",
    "toEnd": "...",
    "camera": "バストショット",
    "gaze": "マスコットを見る",
    "expression": "驚き",
    "pose": "立ち止まる",
    "walkPosition": "画面中央",
    "moveDistance": "短距離",
    "background": "都会の街並み",
    "ipPresence": true,
    "ipAction": "主人公の肩にひょっこり乗る",
    "ipExpression": "にっこり笑顔",
    "ipPosition": "主人公の右肩の上",
    "tradeOff": "...",
    "negativeFocus": "..."
  }
]

【重要】ipPresence と IP状態の設定:
- ストーリー内で「IP」「マスコット」「キャラクター」「ぬいぐるみ」などが登場するカットは ipPresence: true
- ipPresence: true の場合、必ず ipAction, ipExpression, ipPosition を設定すること
- メイン主人公のみのカットは ipPresence: false（ipAction等は空文字）
- CUT 1, 2 は必ず ipPresence: false`;

// ─── PDF テキスト抽出 ───

export async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    pages.push(`--- ページ ${i} ---\n${text}`);
  }

  return pages.join('\n\n');
}

// ─── AI カット割り生成 ───

export type AiModelType = 'openai' | 'gemini' | 'claude';

export async function generateCutComposition(
  storyText: string,
  regulation: string,
  metaPrompt: string,
  cutCount?: number,
  aiModel: AiModelType = 'openai'
): Promise<StoryPdfResult> {
  const systemMessage = metaPrompt;

  const userMessage = `${regulation}

${cutCount ? `■ カット数の指定: ${cutCount}カット` : ''}

【ストーリーテキスト】
${storyText}

上記のストーリーを読み解き、レギュレーションに従ってカット割り構成表をJSON配列で出力してください。
JSONのみを返してください。説明文は不要です。`;

  const endpoint = `/api/${aiModel}`;
  const modelName = aiModel === 'openai' ? 'gpt-4o' : aiModel === 'gemini' ? 'gemini-2.5-flash' : 'claude-sonnet-4-20250514';
  console.log('[generateCutComposition] Endpoint:', endpoint);
  console.log('[generateCutComposition] Model:', modelName);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 4000,
      temperature: 0.6,
    }),
  });

  console.log('[generateCutComposition] Response status:', response.status);

  if (!response.ok) {
    const err = await response.text();
    console.error('[generateCutComposition] Error:', err);
    throw new Error(`API Error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  console.log('[generateCutComposition] Response data received');

  if (data.error) {
    throw new Error(`API Error: ${data.error.message}`);
  }

  const rawText = data.choices?.[0]?.message?.content;
  if (!rawText) throw new Error('AIからの応答が空でした');

  // JSON配列をパース
  let cuts: CutCompositionRow[] = [];
  try {
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      cuts = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('JSON配列が見つかりません');
    }
  } catch (e: any) {
    console.error('Cut composition parse error:', e);
    throw new Error(`カット割りの解析に失敗しました: ${e.message}\n\nAI応答:\n${rawText.substring(0, 500)}`);
  }

  return {
    extractedText: storyText,
    cuts,
    rawAiResponse: rawText,
  };
}

// ─── CutCompositionRow → CutItem 変換ヘルパー ───

export function compositionRowToCutItem(row: CutCompositionRow, index: number) {
  // プロンプト部品を組み立て
  const promptParts = [
    row.expression && `Expression: ${row.expression}`,
    row.gaze && `Looking at: ${row.gaze}`,
    row.pose && `Pose: ${row.pose}`,
    row.centralEvent && `Action: ${row.centralEvent}`,
    row.fromStart && `Starting state: ${row.fromStart}`,
    row.toEnd && `Ending state: ${row.toEnd}`,
    row.walkPosition && `Position: ${row.walkPosition}`,
    row.background && `Background: ${row.background}`,
    row.productEmphasis && `Focusing on product: ${row.productEmphasis}`,
  ].filter(Boolean).join(', ');

  // IPプロンプト部品を組み立て（IP登場時のみ）
  const ipPromptParts = row.ipPresence ? [
    row.ipAction && `IP action: ${row.ipAction}`,
    row.ipExpression && `IP expression: ${row.ipExpression}`,
    row.ipPosition && `IP position: ${row.ipPosition}`,
  ].filter(Boolean).join(', ') : '';

  const eventSnippet = row.centralEvent ? ` - ${row.centralEvent.slice(0, 10)}${row.centralEvent.length > 10 ? '...' : ''}` : '';
  return {
    id: Date.now() + index + Math.floor(Math.random() * 10000),
    title: `${row.role}${eventSnippet}（${row.duration}）`,
    prompt: promptParts || row.centralEvent || `Cut ${row.cutNumber}`,
    camera: row.camera || '',
    semanticPrompt: row.role || '',
    enabled: true,
    showMain: true,
    showSub: row.ipPresence === true,
    ipPrompt: ipPromptParts || undefined,
  };
}

// ─── 要素固定シート生成 ───

export const DEFAULT_FIXED_META_PROMPT = `あなたはプロの映像クリエイターです。
与えられた「ストーリー（簡易ストーリー）」「カット割メタプロンプト」「レギュレーション」を参考に、動画全体を通して一貫して固定されるべき要素（舞台、背景、季節感、時間帯、画作りのトーンなど）を抽出し、画像生成AI用の環境プロンプトを英語で生成してください。

【出力要件】
映像のクオリティを一定に保つための、背景や全体環境に関する英語のカンマ区切りプロンプトのみを出力してください。
例: "tokyo street, cyberpunk city, interior of a cozy cafe, cinematic lighting, 8k resolution, highly detailed"`;

export async function generateFixedElements(
  storyText: string,
  regulation: string,
  cutMetaPrompt: string,
  fixedElementMetaPrompt: string,
  aiModel: AiModelType = 'openai'
): Promise<string> {
  const systemMessage = fixedElementMetaPrompt;

  const userMessage = `
--- 簡易ストーリー ---
${storyText}

--- カット割メタプロンプト ---
${cutMetaPrompt}

--- レギュレーション ---
${regulation}

上記の情報を元に、映像全体で固定すべき環境・背景の英語プロンプトを出力してください。結果は英語のみで出力すること。`;

  const endpoint = `/api/${aiModel}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: aiModel === 'openai' ? 'gpt-4o' : aiModel === 'gemini' ? 'gemini-2.5-flash' : 'claude-sonnet-4-20250514',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API Error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`OpenAI API Error: ${data.error.message}`);
  }

  const rawText = data.choices?.[0]?.message?.content;
  if (!rawText) throw new Error('AIからの応答が空でした');

  // 必要に応じて前後の引用符などを削除
  return rawText.trim().replace(/^"/, '').replace(/"$/, '');
}
