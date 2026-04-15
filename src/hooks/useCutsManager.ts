/**
 * カット管理フック
 * カット構成の状態と操作を一括管理
 */
import { useState, useCallback } from 'react';
import { type CutItem, DEFAULT_CUTS } from '../types/cuts';

export function useCutsManager() {
  const [cuts, setCuts] = useState<CutItem[]>([]);
  const [editingCutId, setEditingCutId] = useState<number | null>(null);
  const [regeneratingCutId, setRegeneratingCutId] = useState<number | null>(null);

  // カット有効/無効切り替え
  const toggleCutEnabled = useCallback((cutId: number) => {
    setCuts(prev => prev.map(c =>
      c.id === cutId ? { ...c, enabled: !c.enabled } : c
    ));
  }, []);

  // カットのプロンプト更新
  const updateCutPrompt = useCallback((cutId: number, prompt: string) => {
    setCuts(prev => prev.map(c =>
      c.id === cutId ? { ...c, prompt } : c
    ));
  }, []);

  // カットのフィールド更新
  const updateCutField = useCallback((cutId: number, field: keyof CutItem, value: unknown) => {
    setCuts(prev => prev.map(c =>
      c.id === cutId ? { ...c, [field]: value } : c
    ));
  }, []);

  // カットの生成状態更新
  const setCutGenerating = useCallback((cutId: number, isGenerating: boolean) => {
    setCuts(prev => prev.map(c =>
      c.id === cutId ? { ...c, isGenerating, errorMessage: isGenerating ? undefined : c.errorMessage } : c
    ));
  }, []);

  // カットの生成画像設定
  const setCutGeneratedImage = useCallback((cutId: number, imageUrl: string) => {
    setCuts(prev => prev.map(c =>
      c.id === cutId ? { ...c, generatedImageUrl: imageUrl, isGenerating: false } : c
    ));
  }, []);

  // カットのエラー設定
  const setCutError = useCallback((cutId: number, errorMessage: string) => {
    setCuts(prev => prev.map(c =>
      c.id === cutId ? { ...c, errorMessage, isGenerating: false } : c
    ));
  }, []);

  // カットの背景画像設定
  const setCutBackgroundImage = useCallback((cutId: number, imageUrl: string) => {
    setCuts(prev => prev.map(c =>
      c.id === cutId ? { ...c, backgroundImageUrl: imageUrl, isGeneratingBackground: false } : c
    ));
  }, []);

  // カット追加
  const addCut = useCallback((cut?: Partial<CutItem>) => {
    const newId = cuts.length > 0 ? Math.max(...cuts.map(c => c.id)) + 1 : 1;
    const newCut: CutItem = {
      id: newId,
      title: `カット ${newId}`,
      prompt: '',
      enabled: true,
      showMain: true,
      showSub: false,
      ...cut,
    };
    setCuts(prev => [...prev, newCut]);
    return newId;
  }, [cuts]);

  // カット削除
  const removeCut = useCallback((cutId: number) => {
    setCuts(prev => prev.filter(c => c.id !== cutId));
    if (editingCutId === cutId) {
      setEditingCutId(null);
    }
  }, [editingCutId]);

  // カット並び替え
  const reorderCuts = useCallback((fromIndex: number, toIndex: number) => {
    setCuts(prev => {
      const result = [...prev];
      const [removed] = result.splice(fromIndex, 1);
      result.splice(toIndex, 0, removed);
      return result;
    });
  }, []);

  // 有効なカットのみ取得
  const enabledCuts = cuts.filter(c => c.enabled);

  // デフォルトカットをロード
  const loadDefaultCuts = useCallback(() => {
    setCuts(DEFAULT_CUTS);
  }, []);

  // すべてのカットをリセット
  const resetCuts = useCallback(() => {
    setCuts([]);
    setEditingCutId(null);
    setRegeneratingCutId(null);
  }, []);

  // 全カットの生成状態をリセット
  const resetAllGeneratingState = useCallback(() => {
    setCuts(prev => prev.map(c => ({
      ...c,
      isGenerating: false,
      isGeneratingBackground: false,
      errorMessage: undefined,
    })));
  }, []);

  // カット画像をアップロード
  const handleUploadCutImage = useCallback((cutId: number, file: File) => {
    const url = URL.createObjectURL(file);
    setCuts(prev => prev.map(c =>
      c.id === cutId ? { ...c, generatedImageUrl: url } : c
    ));
  }, []);

  return {
    // 状態
    cuts,
    setCuts,
    editingCutId,
    setEditingCutId,
    regeneratingCutId,
    setRegeneratingCutId,
    enabledCuts,

    // アクション
    toggleCutEnabled,
    updateCutPrompt,
    updateCutField,
    setCutGenerating,
    setCutGeneratedImage,
    setCutError,
    setCutBackgroundImage,
    addCut,
    removeCut,
    reorderCuts,
    loadDefaultCuts,
    resetCuts,
    resetAllGeneratingState,
    handleUploadCutImage,
  };
}
