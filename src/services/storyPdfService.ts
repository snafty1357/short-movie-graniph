/**
 * Story PDF → カット割りAI生成サービス
 * 
 * 1. PDF からテキストを抽出（pdfjs-dist）
 * 2. レギュレーション + メタプロンプト + ストーリーテキストを OpenAI に送信
 * 3. 構造化されたカット割り JSON を返却
 */

import * as pdfjsLib from 'pdfjs-dist';
import { getProviderFromModelId, getApiModelName } from './aiModelConfig';

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
  lighting: string;       // ライティング
  walkPosition: string;
  moveDistance: string;
  background: string;
  cameraMovement?: string; // カメラの動き（動画用）
  ipPresence: boolean;
  ipAction?: string;      // IPの行動・アクション
  ipExpression?: string;  // IPの表情
  ipPosition?: string;    // IPの位置（画面内のどこにいるか）
  mainIpRelation?: string; // メインキャラとIPの関係性
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
6. From(START) → To(END)（カットの始まりと終わりの状態。動画の開始フレームと終了フレームの動きを示す）
7. カメラ（距離/高さ/向き）
8. カメラの動き（パン/ズームイン/ズームアウト/固定/トラッキング など）
9. 視線（キャラクターが何を見ているか）
10. 表情
11. ポーズ
12. ライティング（自然光/スタジオ照明/逆光/サイドライト/ドラマチック照明 など）
13. 歩行位置（画面内の位置遷移）
14. 移動距離（短距離/中距離/長距離）
15. 背景要素
16. IP有無（サブキャラクター/マスコットの登場有無。ストーリー内容から判断。CUT 1,2は必ず false）
17. IPの行動（ipPresenceがtrueの場合: IPが何をしているか。例: 主人公の肩に乗っている、踊っている、驚いている等）
18. IPの表情（ipPresenceがtrueの場合: IPの表情。例: 笑顔、無表情、驚き等）
19. IPの位置（ipPresenceがtrueの場合: 画面内のIPの位置。例: 主人公の右肩、画面右下、主人公の後ろ等）
20. メインキャラとIPの関係性（ipPresenceがtrueの場合: 隣り合い/対面/前後/見上げる/見下ろす など）
21. Trade-off（そのカットで何を犠牲にしているか）
22. ネガティブ重点（生成時に避けるべき要素）

必ず以下のJSON配列形式で返してください:
[
  {
    "cutNumber": 1,
    "duration": "2.5秒",
    "role": "状況把握",
    "centralEvent": "主人公が街を歩いている",
    "productEmphasis": "",
    "weightLevel": "レベル2",
    "fromStart": "画面左から歩き始める",
    "toEnd": "画面中央で一瞬立ち止まる",
    "camera": "ミドルロング / 正面やや斜め",
    "cameraMovement": "トラッキング",
    "gaze": "前方",
    "expression": "穏やか",
    "pose": "自然な歩行",
    "lighting": "自然光、昼間の柔らかい光",
    "walkPosition": "画面中央",
    "moveDistance": "短距離",
    "background": "都会の街並み",
    "ipPresence": false,
    "ipAction": "",
    "ipExpression": "",
    "ipPosition": "",
    "mainIpRelation": "",
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
    "fromStart": "歩いている状態",
    "toEnd": "驚いて立ち止まる",
    "camera": "バストショット",
    "cameraMovement": "ズームイン",
    "gaze": "マスコットを見る",
    "expression": "驚き",
    "pose": "立ち止まる",
    "lighting": "自然光、昼間の柔らかい光",
    "walkPosition": "画面中央",
    "moveDistance": "短距離",
    "background": "都会の街並み",
    "ipPresence": true,
    "ipAction": "主人公の肩にひょっこり乗る",
    "ipExpression": "にっこり笑顔",
    "ipPosition": "主人公の右肩の上",
    "mainIpRelation": "見上げる（主人公がIPを見上げる）",
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

export type AiModelType = 'openai';

// モデルIDからエンドポイントとモデル名を取得
function getModelConfig(modelIdOrType: string): { endpoint: string; modelName: string } {
  console.log('[getModelConfig] Input:', modelIdOrType);

  // 従来のタイプ（openai）かどうかをチェック
  if (modelIdOrType === 'openai') {
    const result = {
      endpoint: `/api/openai`,
      modelName: 'gpt-4o',
    };
    console.log('[getModelConfig] Legacy type result:', result);
    return result;
  }
  // 新しいモデルID
  const provider = getProviderFromModelId(modelIdOrType);
  const apiModelName = getApiModelName(modelIdOrType);
  const result = {
    endpoint: `/api/${provider}`,
    modelName: apiModelName,
  };
  console.log('[getModelConfig] New model ID result:', result);
  return result;
}

export async function generateCutComposition(
  storyText: string,
  regulation: string,
  metaPrompt: string,
  cutCount?: number,
  aiModelOrId: AiModelType | string = 'openai'
): Promise<StoryPdfResult> {
  const systemMessage = metaPrompt;

  const userMessage = `${regulation}

${cutCount ? `■ カット数の指定: ${cutCount}カット` : ''}

【ストーリーテキスト】
${storyText}

上記のストーリーを読み解き、レギュレーションに従ってカット割り構成表をJSON配列で出力してください。
JSONのみを返してください。説明文は不要です。`;

  const { endpoint, modelName } = getModelConfig(aiModelOrId);
  console.log('[generateCutComposition] Endpoint:', endpoint);
  console.log('[generateCutComposition] Model:', modelName);
  console.log('[generateCutComposition] Sending request...');

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 4096,
        temperature: 0.6,
      }),
    });
  } catch (fetchError: any) {
    console.error('[generateCutComposition] Fetch error:', fetchError);
    throw new Error(`ネットワークエラー: ${fetchError.message}`);
  }

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

// Phase 1: カット割り基本情報のみ（プロンプトは空）
export function compositionRowToCutItemBasic(row: CutCompositionRow, index: number) {
  const eventSnippet = row.centralEvent ? ` - ${row.centralEvent.slice(0, 10)}${row.centralEvent.length > 10 ? '...' : ''}` : '';
  return {
    id: Date.now() + index + Math.floor(Math.random() * 10000),
    title: `${row.role}${eventSnippet}（${row.duration}）`,
    prompt: '', // 初期は空
    camera: row.camera || '',
    semanticPrompt: row.role || '',
    enabled: true,
    showMain: true,
    showSub: row.ipPresence === true,
    ipPrompt: undefined,
    // 静止画用詳細フィールド（カット割りから取得）
    expression: row.expression || '',
    gaze: row.gaze || '',
    pose: row.pose || '',
    lighting: row.lighting || '',
    walkingStyle: '',
    walkPosition: row.walkPosition || '',
    moveDistance: row.moveDistance || '',
    action: row.centralEvent || '',
    background: row.background || '',
    productEmphasis: row.productEmphasis || '',
    // 動画用フィールド（カット割りから取得）
    startFrame: row.fromStart || '',
    endFrame: row.toEnd || '',
    cameraMovement: row.cameraMovement || '',
    mainCharExpression: row.expression || '',
    mainCharPosition: row.walkPosition || '',
    ipPosition: row.ipPosition || '',
    mainIpRelation: row.mainIpRelation || '',
    ipStartFrame: row.ipPresence ? (row.ipAction || '') : '',
    ipEndFrame: '',
    ipExpression: row.ipExpression || '',
    videoPrompt: '',
    transition: 'カット',
    // 元データを保持（プロンプト生成用）
    _rawData: row,
  };
}

// Phase 2: プロンプトを生成して埋める（カットに適用）
export function fillCutPrompts(cut: ReturnType<typeof compositionRowToCutItemBasic>) {
  const row = cut._rawData as CutCompositionRow;
  if (!row) return cut;

  // プロンプト部品を組み立て（静止画用）
  const promptParts = [
    row.expression && `Expression: ${row.expression}`,
    row.gaze && `Looking at: ${row.gaze}`,
    row.pose && `Pose: ${row.pose}`,
    row.lighting && `Lighting: ${row.lighting}`,
    row.centralEvent && `Action: ${row.centralEvent}`,
    row.fromStart && `Starting state: ${row.fromStart}`,
    row.toEnd && `Ending state: ${row.toEnd}`,
    row.walkPosition && `Position: ${row.walkPosition}`,
    row.moveDistance && `Move distance: ${row.moveDistance}`,
    row.background && `Background: ${row.background}`,
    row.productEmphasis && `Focusing on product: ${row.productEmphasis}`,
  ].filter(Boolean).join(', ');

  // IPプロンプト部品を組み立て（IP登場時のみ）
  const ipPromptParts = row.ipPresence ? [
    row.ipAction && `IP action: ${row.ipAction}`,
    row.ipExpression && `IP expression: ${row.ipExpression}`,
    row.ipPosition && `IP position: ${row.ipPosition}`,
  ].filter(Boolean).join(', ') : '';

  // 動画用プロンプトを組み立て
  const videoPromptParts = [
    row.centralEvent && `Action: ${row.centralEvent}`,
    row.fromStart && `Start: ${row.fromStart}`,
    row.toEnd && `End: ${row.toEnd}`,
    row.cameraMovement && `Camera movement: ${row.cameraMovement}`,
    row.expression && `Expression: ${row.expression}`,
    row.ipPresence && row.ipAction && `IP action: ${row.ipAction}`,
  ].filter(Boolean).join(', ');

  return {
    ...cut,
    prompt: promptParts || row.centralEvent || `Cut ${row.cutNumber}`,
    ipPrompt: ipPromptParts || undefined,
    videoPrompt: videoPromptParts || '',
  };
}

// 後方互換性のため従来の関数も維持
export function compositionRowToCutItem(row: CutCompositionRow, index: number) {
  const basic = compositionRowToCutItemBasic(row, index);
  return fillCutPrompts(basic);
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
  aiModelOrId: AiModelType | string = 'openai'
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

  const { endpoint, modelName } = getModelConfig(aiModelOrId);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName,
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
    throw new Error(`AI API Error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`AI API Error: ${data.error.message}`);
  }

  const rawText = data.choices?.[0]?.message?.content;
  if (!rawText) throw new Error('AIからの応答が空でした');

  // 必要に応じて前後の引用符などを削除
  return rawText.trim().replace(/^"/, '').replace(/"$/, '');
}
