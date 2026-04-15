/**
 * プロジェクト履歴管理フック
 * プロジェクトの保存・読み込み・履歴管理を一括管理
 */
import { useState, useCallback, useEffect } from 'react';
import {
  getProjectHistory,
  saveToProjectHistory,
  removeFromProjectHistory,
  DEFAULT_BUDGET,
  type ProjectHistoryEntry,
  type ProjectBudget,
  type GenerationTimes,
} from '../services/projectHistoryService';

export function useProjectHistory() {
  // 履歴状態
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [projectHistory, setProjectHistory] = useState<ProjectHistoryEntry[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [historySearchQuery, setHistorySearchQuery] = useState('');

  // 予算・時間管理
  const [projectBudget, setProjectBudget] = useState<ProjectBudget>(DEFAULT_BUDGET);
  const [generationTimes, setGenerationTimes] = useState<GenerationTimes>({});

  // 履歴読み込み
  const loadHistory = useCallback(() => {
    try {
      const history = getProjectHistory();
      setProjectHistory(history);
    } catch (error) {
      console.error('Failed to load project history:', error);
    }
  }, []);

  // 初回読み込み
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // プロジェクト保存
  const saveProject = useCallback((
    projectData: Omit<ProjectHistoryEntry, 'id' | 'timestamp'>
  ) => {
    try {
      const entry = saveToProjectHistory(projectData);
      setCurrentProjectId(entry.id);
      loadHistory();
      return entry.id;
    } catch (error) {
      console.error('Failed to save project:', error);
      return null;
    }
  }, [loadHistory]);

  // プロジェクト削除
  const deleteProject = useCallback((projectId: string) => {
    try {
      removeFromProjectHistory(projectId);
      if (currentProjectId === projectId) {
        setCurrentProjectId(null);
      }
      loadHistory();
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  }, [currentProjectId, loadHistory]);

  // プロジェクト読み込み
  const loadProject = useCallback((project: ProjectHistoryEntry) => {
    setCurrentProjectId(project.id);
    return project;
  }, []);

  // 新規プロジェクト作成
  const createNewProject = useCallback(() => {
    setCurrentProjectId(null);
    setGenerationTimes({});
    // 空のプロジェクト名を返す（実際の名前生成はApp側で行う）
    return `プロジェクト ${new Date().toLocaleDateString('ja-JP')}`;
  }, []);

  // 生成時間の記録
  const recordGenerationTime = useCallback((key: keyof GenerationTimes, timeMs: number) => {
    setGenerationTimes(prev => ({
      ...prev,
      [key]: timeMs,
    }));
  }, []);

  // 総生成時間の計算
  const totalGenerationTime = Object.values(generationTimes).reduce((a, b) => (a || 0) + (b || 0), 0);

  // 予算消費の計算
  const calculateBudgetUsed = useCallback((
    imageCount: number,
    videoCount: number,
    aiCallCount: number = 0
  ) => {
    const imageCost = imageCount * projectBudget.stillImageCost;
    const videoCost = videoCount * projectBudget.videoCost;
    const aiCost = aiCallCount * projectBudget.aiCostPerCall;
    return imageCost + videoCost + aiCost;
  }, [projectBudget]);

  // 履歴検索
  const filteredHistory = projectHistory.filter(project => {
    if (!historySearchQuery.trim()) return true;
    const query = historySearchQuery.toLowerCase();
    return project.name.toLowerCase().includes(query);
  });

  return {
    // 履歴状態
    historyPanelOpen,
    setHistoryPanelOpen,
    projectHistory,
    currentProjectId,
    setCurrentProjectId,
    historySearchQuery,
    setHistorySearchQuery,
    filteredHistory,

    // 予算・時間
    projectBudget,
    setProjectBudget,
    generationTimes,
    setGenerationTimes,
    totalGenerationTime,

    // アクション
    loadHistory,
    saveProject,
    deleteProject,
    loadProject,
    createNewProject,
    recordGenerationTime,
    calculateBudgetUsed,
  };
}
