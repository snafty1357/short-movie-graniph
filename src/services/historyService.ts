/**
 * History Service - localStorage ベースの生成履歴管理
 */


export interface HistoryEntry {
  id: string;
  imageUrl: string;       // base64 or blob URL → base64で保存
  timestamp: string;      // ISO string
  description?: string;
  resolution: string;
  format: string;
  garmentLabels: string[];
  modelPreviewThumb?: string;  // モデル画像のサムネイル(base64)
  garmentPreviewThumb?: string; // ガーメント画像のサムネイル(base64)
  generationTimeMs?: number; // 生成にかかった時間(ms)
}

const MAX_ENTRIES = 50;

import { supabase } from './supabaseClient';

/**
 * Supabaseから全履歴を取得
 */
export async function getHistory(userId?: string): Promise<HistoryEntry[]> {
  try {
    if (!userId) return [];
    
    const { data, error } = await supabase
      .from('generations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(MAX_ENTRIES);
      
    if (error) {
      console.error('[History] Supabase fetch error:', error);
      return [];
    }
    
    if (!data) return [];
    
    return data.map(row => ({
      id: row.id,
      imageUrl: row.image_url || '',
      timestamp: row.created_at,
      description: row.description || '',
      resolution: row.resolution || '1K',
      format: row.format || 'png',
      garmentLabels: row.garment_types || [],
      generationTimeMs: row.generation_time_ms
    }));
  } catch (e) {
    console.error('[History] Failed to parse history', e);
    return [];
  }
}



/**
 * 特定の履歴を削除
 */
export async function removeFromHistory(id: string): Promise<void> {
  try {
    const { error } = await supabase.from('generations').delete().eq('id', id);
    if (error) console.error('[History] Delete error:', error);
  } catch (e) {
    console.error('[History] Failed to remove:', e);
  }
}

/**
 * 全履歴を削除
 */
export async function clearHistory(userId: string): Promise<void> {
  try {
    const { error } = await supabase.from('generations').delete().eq('user_id', userId);
    if (error) console.error('[History] Clear all error:', error);
  } catch (e) {
    console.error('[History] Failed to clear history:', e);
  }
}

/**
 * 画像URLからBase64に変換（外部URLをローカル保存するため）
 */
export async function imageUrlToBase64(url: string): Promise<string> {
  // 既にbase64の場合はそのまま
  if (url.startsWith('data:')) return url;

  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return url; // フォールバック
  }
}

/**
 * サムネイル生成（画像を小さくリサイズしてbase64で返す）
 */
export function generateThumbnail(file: File, maxSize: number = 80): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) { reject('No canvas context'); return; }

    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(maxSize / img.width, maxSize / img.height);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/**
 * ログインなしでDB保存するための匿名デバイスIDを取得
 */
export function getDeviceId(): string {
  const DEVICE_KEY = 'kiga_anonymous_device_id';
  let deviceId = localStorage.getItem(DEVICE_KEY);
  if (!deviceId) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      deviceId = crypto.randomUUID();
    } else {
      deviceId = 'ano-' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    }
    localStorage.setItem(DEVICE_KEY, deviceId);
  }
  return deviceId;
}
