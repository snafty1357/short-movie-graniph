/**
 * Video Model Configuration Service
 * 動画生成モデルの設定を管理（追加・削除可能）
 */

export interface VideoModel {
  id: string;
  name: string;
  enabled: boolean;
}

export interface KlingModelConfig {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
}

// デフォルトの動画生成モデル
const DEFAULT_VIDEO_MODELS: VideoModel[] = [
  { id: 'luma', name: 'Luma Dream Machine', enabled: true },
  { id: 'runway', name: 'Runway Gen-3 Alpha', enabled: true },
  { id: 'haiper', name: 'Haiper AI', enabled: true },
  { id: 'sora', name: 'OpenAI Sora', enabled: true },
  { id: 'kling', name: 'Kling AI', enabled: true },
];

// デフォルトのKlingモデル
const DEFAULT_KLING_MODELS: KlingModelConfig[] = [
  { id: 'v1-standard', name: 'V1 Standard', path: 'fal-ai/kling-video/v1/standard/image-to-video', enabled: true },
  { id: 'v1-pro', name: 'V1 Pro', path: 'fal-ai/kling-video/v1/pro/image-to-video', enabled: true },
  { id: 'v2-master', name: 'V2 Master', path: 'fal-ai/kling-video/v2/master/image-to-video', enabled: true },
  { id: 'v2.1-pro', name: 'V2.1 Pro', path: 'fal-ai/kling-video/v2.1/pro/image-to-video', enabled: true },
  { id: 'v2.6-pro', name: 'V2.6 Pro', path: 'fal-ai/kling-video/v2.6/pro/image-to-video', enabled: true },
];

const STORAGE_KEY_VIDEO_MODELS = 'kiga_video_models';
const STORAGE_KEY_KLING_MODELS = 'kiga_kling_models';

// 動画生成モデル
export function getVideoModels(): VideoModel[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_VIDEO_MODELS);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load video models:', e);
  }
  return DEFAULT_VIDEO_MODELS;
}

export function saveVideoModels(models: VideoModel[]): void {
  localStorage.setItem(STORAGE_KEY_VIDEO_MODELS, JSON.stringify(models));
}

export function getEnabledVideoModels(): VideoModel[] {
  return getVideoModels().filter(m => m.enabled);
}

export function addVideoModel(model: Omit<VideoModel, 'enabled'>): VideoModel[] {
  const models = getVideoModels();
  const newModel: VideoModel = { ...model, enabled: true };
  models.push(newModel);
  saveVideoModels(models);
  return models;
}

export function removeVideoModel(id: string): VideoModel[] {
  const models = getVideoModels().filter(m => m.id !== id);
  saveVideoModels(models);
  return models;
}

export function toggleVideoModel(id: string): VideoModel[] {
  const models = getVideoModels().map(m =>
    m.id === id ? { ...m, enabled: !m.enabled } : m
  );
  saveVideoModels(models);
  return models;
}

export function resetVideoModels(): VideoModel[] {
  saveVideoModels(DEFAULT_VIDEO_MODELS);
  return DEFAULT_VIDEO_MODELS;
}

// Klingモデル
export function getKlingModels(): KlingModelConfig[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_KLING_MODELS);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load Kling models:', e);
  }
  return DEFAULT_KLING_MODELS;
}

export function saveKlingModels(models: KlingModelConfig[]): void {
  localStorage.setItem(STORAGE_KEY_KLING_MODELS, JSON.stringify(models));
}

export function getEnabledKlingModels(): KlingModelConfig[] {
  return getKlingModels().filter(m => m.enabled);
}

export function addKlingModel(model: Omit<KlingModelConfig, 'enabled'>): KlingModelConfig[] {
  const models = getKlingModels();
  const newModel: KlingModelConfig = { ...model, enabled: true };
  models.push(newModel);
  saveKlingModels(models);
  return models;
}

export function removeKlingModel(id: string): KlingModelConfig[] {
  const models = getKlingModels().filter(m => m.id !== id);
  saveKlingModels(models);
  return models;
}

export function toggleKlingModel(id: string): KlingModelConfig[] {
  const models = getKlingModels().map(m =>
    m.id === id ? { ...m, enabled: !m.enabled } : m
  );
  saveKlingModels(models);
  return models;
}

export function resetKlingModels(): KlingModelConfig[] {
  saveKlingModels(DEFAULT_KLING_MODELS);
  return DEFAULT_KLING_MODELS;
}

// Klingモデルパスの取得（falService用）
export function getKlingModelPath(modelId: string): string {
  const models = getKlingModels();
  const model = models.find(m => m.id === modelId);
  return model?.path || 'fal-ai/kling-video/v2.6/pro/image-to-video';
}
