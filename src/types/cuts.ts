/**
 * Cut Types and Default Data
 * カット構成に関する型定義とデフォルトデータ
 */

export interface CutItem {
  id: number;
  title: string;
  prompt: string;
  semanticPrompt?: string;
  camera?: string;
  enabled: boolean;
  showMain: boolean;
  showSub: boolean;
  ipPrompt?: string; // IP（サブキャラ）の状態・行動プロンプト
  generatedImageUrl?: string;
  isGenerating?: boolean;
  errorMessage?: string;
  backgroundImageUrl?: string; // シーン背景画像
  isGeneratingBackground?: boolean;
  // 詳細フィールド（構成表編集用 - 画像用）
  expression?: string;        // 表情
  gaze?: string;              // 視線
  pose?: string;              // ポーズ
  walkingStyle?: string;      // 歩き方
  walkPosition?: string;      // 歩行位置（画面内）
  moveDistance?: string;      // 移動距離
  action?: string;            // アクション（中心事象）
  background?: string;        // 背景要素
  productEmphasis?: string;   // プロダクト強調部位
  // 動画用フィールド
  duration?: string;          // 尺（秒数）例: "2.5秒"
  motionType?: string;        // 動きの種類 例: "歩行", "振り返り", "静止"
  cameraMovement?: string;    // カメラの動き 例: "パン", "ズームイン", "固定"
  transition?: string;        // トランジション 例: "カット", "フェード", "ディゾルブ"
  videoPrompt?: string;       // 動画生成用プロンプト
  motionIntensity?: string;   // 動きの強度 例: "弱", "中", "強"
  startFrame?: string;        // 開始フレームの状態
  endFrame?: string;          // 終了フレームの状態
}

export const DEFAULT_CUTS: CutItem[] = [
  { id: 1, title: '正面全身', prompt: 'standing perfectly still, completely front-facing full body shot, fashion catalog style, symmetrical pose', semanticPrompt: '状況把握', enabled: true, showMain: true, showSub: false },
  { id: 2, title: '歩きのポーズ', prompt: 'walking confidently towards the camera, fashion runway style, natural stride', semanticPrompt: '重さ提示', enabled: true, showMain: true, showSub: false },
  { id: 3, title: '振り返り', prompt: 'looking over the shoulder towards the camera, dynamic fashion angle', semanticPrompt: '重さの深化', enabled: true, showMain: true, showSub: false },
  { id: 4, title: '上半身アップ', prompt: 'close-up shot on the upper half of the body, highlighting the garment texture, material and details', semanticPrompt: 'ズレ発生', enabled: true, showMain: true, showSub: false },
  { id: 5, title: '座りポーズ', prompt: 'sitting elegantly on a minimalistic chair, relaxed fashion look', semanticPrompt: '軽さ提示', enabled: true, showMain: true, showSub: false },
  { id: 6, title: 'アクションポーズ', prompt: 'dynamic fashion pose, arms crossed or hands in pockets, strong confident look', semanticPrompt: '解放', enabled: true, showMain: true, showSub: false },
  { id: 7, title: '背面全身', prompt: 'standing back facing the camera, showing the back of the garment, fashion catalog style', semanticPrompt: '余韻', enabled: true, showMain: true, showSub: false },
];
