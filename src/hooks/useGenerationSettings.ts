/**
 * 生成設定管理フック
 * 画像・動画生成の設定を一括管理
 */
import { useState, useCallback, useEffect } from 'react';
import { DEFAULT_FIXED_META_PROMPT } from '../services/storyPdfService';
import { getEnabledAiModels, getSelectedModelId, setSelectedModelId as setSelectedModelIdConfig, getProviderFromModelId, type AiModelVersion } from '../services/aiModelConfig';
import type { AiModelType } from '../services/storyPdfService';

export interface ApiStatus {
  status: 'checking' | 'ok' | 'error';
  message?: string;
}

export function useGenerationSettings() {
  // 静止画スタイル設定
  const [stillImageStyle, setStillImageStyle] = useState(
    'masterpiece, 8k resolution, highly detailed, photorealistic, cinematic lighting'
  );
  const [stillImageNegative, setStillImageNegative] = useState('');
  const [stillImageMetaPrompt, setStillImageMetaPrompt] = useState(
    '動画の全体的な品質やルック＆フィールを定義するスタイリングプロンプトを指定してください。'
  );

  // セマンティック・プロダクト設定
  const [semanticPrompt, setSemanticPrompt] = useState(
    '1 状況把握\n2 重さ提示\n3 重さの深化\n4 ズレ発生\n5 軽さ提示\n6 解放\n7 余韻'
  );
  const [productPrompt, setProductPrompt] = useState('');

  // ステージ・固定要素設定
  const [stagePrompt, setStagePrompt] = useState('');
  const [extractedPdfText, setExtractedPdfText] = useState('');
  const [fixedElementMetaPrompt, setFixedElementMetaPrompt] = useState(DEFAULT_FIXED_META_PROMPT);
  const [isGeneratingFixed, setIsGeneratingFixed] = useState(false);

  // 動画生成設定
  const [videoGenModel, setVideoGenModel] = useState('kling');
  const [videoPromptStyle, setVideoPromptStyle] = useState(
    'masterpiece, 8k resolution, highly detailed, smooth motion, high fps'
  );
  const [videoPromptNegative, setVideoPromptNegative] = useState('');
  const [videoMetaPrompt, setVideoMetaPrompt] = useState(
    '動画生成AIに渡すモーション指示のルールを設定します。'
  );

  // AIモデル設定
  const [aiModel, setAiModel] = useState<AiModelType>(() => {
    const saved = localStorage.getItem('snafty_ai_model');
    return (saved as AiModelType) || 'gemini';
  });
  const [selectedModelId, setSelectedModelIdState] = useState<string>(() => getSelectedModelId());
  const [availableAiModels] = useState<AiModelVersion[]>(() => getEnabledAiModels());

  // APIステータス
  const [apiStatuses, setApiStatuses] = useState<Record<string, ApiStatus>>({
    gemini: { status: 'checking' },
    openai: { status: 'checking' },
    claude: { status: 'checking' },
    fal: { status: 'checking' },
  });

  // UI状態
  const [stillPromptPanelOpen, setStillPromptPanelOpen] = useState(false);
  const [semanticPanelOpen, setSemanticPanelOpen] = useState(false);
  const [productPanelOpen, setProductPanelOpen] = useState(false);
  const [fixedPanelOpen, setFixedPanelOpen] = useState(false);
  const [generationSettingsTab, setGenerationSettingsTab] = useState<'video' | 'still'>('still');

  // AIモデル変更ハンドラー
  const handleAiModelChange = useCallback((model: AiModelType) => {
    setAiModel(model);
    localStorage.setItem('snafty_ai_model', model);
  }, []);

  // 選択モデルID変更ハンドラー
  const handleSelectedModelIdChange = useCallback((modelId: string) => {
    setSelectedModelIdState(modelId);
    setSelectedModelIdConfig(modelId);
    const provider = getProviderFromModelId(modelId);
    if (provider) {
      handleAiModelChange(provider);
    }
  }, [handleAiModelChange]);

  // APIステータス更新
  const updateApiStatus = useCallback((api: string, status: ApiStatus) => {
    setApiStatuses(prev => ({ ...prev, [api]: status }));
  }, []);

  // APIヘルスチェック
  const checkApiHealth = useCallback(async () => {
    const apis = ['gemini', 'openai', 'claude', 'fal'];

    for (const api of apis) {
      setApiStatuses(prev => ({ ...prev, [api]: { status: 'checking' } }));

      try {
        const response = await fetch(`/api/${api}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'health check' }],
            max_tokens: 10
          }),
        });

        if (response.ok) {
          setApiStatuses(prev => ({ ...prev, [api]: { status: 'ok' } }));
        } else {
          const data = await response.json();
          setApiStatuses(prev => ({
            ...prev,
            [api]: { status: 'error', message: data.error?.message || 'API Error' }
          }));
        }
      } catch (error) {
        setApiStatuses(prev => ({
          ...prev,
          [api]: { status: 'error', message: error instanceof Error ? error.message : 'Connection failed' }
        }));
      }
    }
  }, []);

  // 設定をローカルストレージに保存
  const saveSettings = useCallback(() => {
    localStorage.setItem('snafty_still_style', stillImageStyle);
    localStorage.setItem('snafty_still_negative', stillImageNegative);
    localStorage.setItem('snafty_semantic', semanticPrompt);
    localStorage.setItem('snafty_product', productPrompt);
    localStorage.setItem('snafty_video_style', videoPromptStyle);
    localStorage.setItem('snafty_video_negative', videoPromptNegative);
  }, [stillImageStyle, stillImageNegative, semanticPrompt, productPrompt, videoPromptStyle, videoPromptNegative]);

  // 設定をローカルストレージから読み込み
  useEffect(() => {
    const savedStillStyle = localStorage.getItem('snafty_still_style');
    const savedStillNegative = localStorage.getItem('snafty_still_negative');
    const savedSemantic = localStorage.getItem('snafty_semantic');
    const savedProduct = localStorage.getItem('snafty_product');
    const savedVideoStyle = localStorage.getItem('snafty_video_style');
    const savedVideoNegative = localStorage.getItem('snafty_video_negative');

    if (savedStillStyle) setStillImageStyle(savedStillStyle);
    if (savedStillNegative) setStillImageNegative(savedStillNegative);
    if (savedSemantic) setSemanticPrompt(savedSemantic);
    if (savedProduct) setProductPrompt(savedProduct);
    if (savedVideoStyle) setVideoPromptStyle(savedVideoStyle);
    if (savedVideoNegative) setVideoPromptNegative(savedVideoNegative);
  }, []);

  return {
    // 静止画設定
    stillImageStyle,
    setStillImageStyle,
    stillImageNegative,
    setStillImageNegative,
    stillImageMetaPrompt,
    setStillImageMetaPrompt,

    // セマンティック・プロダクト
    semanticPrompt,
    setSemanticPrompt,
    productPrompt,
    setProductPrompt,

    // ステージ・固定要素
    stagePrompt,
    setStagePrompt,
    extractedPdfText,
    setExtractedPdfText,
    fixedElementMetaPrompt,
    setFixedElementMetaPrompt,
    isGeneratingFixed,
    setIsGeneratingFixed,

    // 動画設定
    videoGenModel,
    setVideoGenModel,
    videoPromptStyle,
    setVideoPromptStyle,
    videoPromptNegative,
    setVideoPromptNegative,
    videoMetaPrompt,
    setVideoMetaPrompt,

    // AIモデル
    aiModel,
    selectedModelId,
    availableAiModels,
    apiStatuses,
    handleAiModelChange,
    handleSelectedModelIdChange,
    updateApiStatus,
    checkApiHealth,

    // UI状態
    stillPromptPanelOpen,
    setStillPromptPanelOpen,
    semanticPanelOpen,
    setSemanticPanelOpen,
    productPanelOpen,
    setProductPanelOpen,
    fixedPanelOpen,
    setFixedPanelOpen,
    generationSettingsTab,
    setGenerationSettingsTab,

    // アクション
    saveSettings,
  };
}
