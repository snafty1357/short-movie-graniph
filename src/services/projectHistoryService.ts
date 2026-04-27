/**
 * Project History Service - プロジェクト（カット構成）の履歴管理
 */

import type { CutItem } from '../types/cuts';

export interface ProjectBudget {
  aiCostPerCall: number;      // AI生成1回あたりのコスト (USD)
  stillImageCost: number;     // 静止画1枚あたりのコスト (USD)
  videoCost: number;          // 動画1本あたりのコスト (USD)
}

export const DEFAULT_BUDGET: ProjectBudget = {
  aiCostPerCall: 0.03,       // Claude Sonnet default
  stillImageCost: 0.015,     // fal.ai Nanobanana2
  videoCost: 0.20,           // fal.ai Kling 2.6
};

// 生成時間の記録
export interface GenerationTimes {
  cutComposition?: number;    // カット割り生成時間 (ms)
  fixedElements?: number;     // 背景プロンプト生成時間 (ms)
  imageGeneration?: number;   // 画像生成時間 (ms)
  totalTime?: number;         // 総生成時間 (ms)
}

export interface ProjectHistoryEntry {
  id: string;
  name: string;
  timestamp: string;
  cuts: CutItem[];
  stagePrompt: string;
  extractedPdfText: string;
  mainCharPrompt?: string;
  subCharPrompt?: string;
  aiModel: string;
  budget?: ProjectBudget;           // プロジェクトごとの予算設定
  generationTimes?: GenerationTimes; // 生成時間の記録
  globalBackgroundImageUrl?: string; // 全体背景画像URL
}

const STORAGE_KEY = 'snafty_project_history';
const MAX_ENTRIES = 20;

/**
 * 全プロジェクト履歴を取得
 */
export function getProjectHistory(): ProjectHistoryEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error('[ProjectHistory] Failed to parse history', e);
    return [];
  }
}

/**
 * プロジェクトを履歴に保存
 */
export function saveToProjectHistory(entry: Omit<ProjectHistoryEntry, 'id' | 'timestamp'>): ProjectHistoryEntry {
  const history = getProjectHistory();

  const newEntry: ProjectHistoryEntry = {
    ...entry,
    id: crypto.randomUUID ? crypto.randomUUID() : `proj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
  };

  // 先頭に追加し、最大件数を超えたら古いものを削除
  const updated = [newEntry, ...history].slice(0, MAX_ENTRIES);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('[ProjectHistory] Failed to save', e);
    // ストレージ容量不足の場合、古いエントリを削除して再試行
    const reduced = updated.slice(0, Math.floor(MAX_ENTRIES / 2));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reduced));
  }

  return newEntry;
}

/**
 * プロジェクト履歴を更新（既存エントリの上書き）
 */
export function updateProjectHistory(id: string, updates: Partial<ProjectHistoryEntry>): void {
  const history = getProjectHistory();
  const updated = history.map(entry =>
    entry.id === id ? { ...entry, ...updates, timestamp: new Date().toISOString() } : entry
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

/**
 * 特定のプロジェクトを削除
 */
export function removeFromProjectHistory(id: string): void {
  const history = getProjectHistory();
  const updated = history.filter(entry => entry.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

/**
 * 全プロジェクト履歴を削除
 */
export function clearProjectHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * プロジェクト名を自動生成（最初のカットタイトルから）
 */
export function generateProjectName(cuts: CutItem[], pdfText?: string): string {
  if (pdfText) {
    // PDFテキストの最初の行をプロジェクト名として使用
    const firstLine = pdfText.split('\n').find(line => line.trim().length > 0);
    if (firstLine && firstLine.trim().length <= 50) {
      return firstLine.trim();
    }
  }

  if (cuts.length > 0) {
    return `${cuts[0].title} 他${cuts.length - 1}カット`;
  }

  return `プロジェクト ${new Date().toLocaleDateString('ja-JP')}`;
}
