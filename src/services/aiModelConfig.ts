/**
 * AI Model Configuration Service
 * テキスト生成AIモデルの設定を管理
 */

export type AiProvider = 'openai' | 'claude';

export interface AiModelVersion {
  id: string;
  name: string;
  provider: AiProvider;
  apiModel: string;  // 実際のAPI呼び出しで使用するモデル名
  costPerCall: number;  // USD
  enabled: boolean;
}

// デフォルトのAIモデル一覧
export const DEFAULT_AI_MODELS: AiModelVersion[] = [
  // OpenAI
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', apiModel: 'gpt-4o', costPerCall: 0.02, enabled: true },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', apiModel: 'gpt-4o-mini', costPerCall: 0.005, enabled: true },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', apiModel: 'gpt-4-turbo', costPerCall: 0.03, enabled: true },

  // Claude
  { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'claude', apiModel: 'claude-3-5-sonnet-20241022', costPerCall: 0.03, enabled: true },
  { id: 'claude-haiku-3.5', name: 'Claude Haiku 3.5', provider: 'claude', apiModel: 'claude-3-5-haiku-20241022', costPerCall: 0.008, enabled: true },
];

const STORAGE_KEY = 'kiga_ai_models';
const SELECTED_MODEL_KEY = 'kiga_selected_ai_model';

/**
 * 全AIモデルを取得
 */
export function getAiModels(): AiModelVersion[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load AI models:', e);
  }
  return DEFAULT_AI_MODELS;
}

/**
 * AIモデルを保存
 */
export function saveAiModels(models: AiModelVersion[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(models));
}

/**
 * 有効なAIモデルを取得
 */
export function getEnabledAiModels(): AiModelVersion[] {
  return getAiModels().filter(m => m.enabled);
}

/**
 * プロバイダー別の有効モデルを取得
 */
export function getEnabledModelsByProvider(provider: AiProvider): AiModelVersion[] {
  return getEnabledAiModels().filter(m => m.provider === provider);
}

/**
 * 選択中のモデルIDを取得
 */
export function getSelectedModelId(): string {
  return localStorage.getItem(SELECTED_MODEL_KEY) || 'gpt-4o';
}

/**
 * 選択中のモデルを保存
 */
export function setSelectedModelId(modelId: string): void {
  localStorage.setItem(SELECTED_MODEL_KEY, modelId);
}

/**
 * 選択中のモデル情報を取得
 */
export function getSelectedModel(): AiModelVersion | undefined {
  const modelId = getSelectedModelId();
  return getAiModels().find(m => m.id === modelId);
}

/**
 * モデルIDからプロバイダーを取得
 */
export function getProviderFromModelId(modelId: string): AiProvider {
  const model = getAiModels().find(m => m.id === modelId);
  return model?.provider || 'openai';
}

/**
 * モデルIDからAPIモデル名を取得
 */
export function getApiModelName(modelId: string): string {
  const model = getAiModels().find(m => m.id === modelId);
  return model?.apiModel || 'gpt-4o';
}

/**
 * モデルの有効/無効を切り替え
 */
export function toggleAiModel(modelId: string): AiModelVersion[] {
  const models = getAiModels().map(m =>
    m.id === modelId ? { ...m, enabled: !m.enabled } : m
  );
  saveAiModels(models);
  return models;
}

/**
 * デフォルトにリセット
 */
export function resetAiModels(): AiModelVersion[] {
  saveAiModels(DEFAULT_AI_MODELS);
  return DEFAULT_AI_MODELS;
}
