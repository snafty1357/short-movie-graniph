import React, { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import ImageUploader from './components/ImageUploader';
import ResultGallery, { type ResultItem } from './components/ResultGallery';
import { type CutItem } from './types/cuts';
import { useAuth } from './contexts/AuthContext';
import { useTheme } from './contexts/ThemeContext';
import AuthForm from './components/AuthForm';
import { SUB_CHAR_PRESETS, DETAIL_PRESETS, type CustomInstructionBlock } from './hooks/useCharacterSettings';

// 動的インポートでバンドルサイズを削減
const ShortVideoModal = lazy(() => import('./components/ShortVideoModal'));
const StoryPdfUploader = lazy(() => import('./components/StoryPdfUploader'));
const StoryboardWorkflowModal = lazy(() => import('./components/StoryboardWorkflowModal'));

import { User, Users, Sun, Moon, UserCircle, RotateCcw, RefreshCw, Pencil, ChevronDown, Sparkles, Image as ImageIcon, Loader2, Upload, Play, BookOpen, History, Save, Trash2, FolderOpen, Maximize2, X, Plus, Search, Download, Camera, Aperture, Focus, Film, Video } from 'lucide-react';
import { generatePose, fileToDataUrl, generateKlingVideo } from './services/falService';
import { generateFixedElements, generateCutComposition, compositionRowToCutItem, DEFAULT_FIXED_META_PROMPT, DEFAULT_REGULATION, DEFAULT_META_PROMPT, type AiModelType } from './services/storyPdfService';
import { getEnabledAiModels, getSelectedModelId, setSelectedModelId, getProviderFromModelId, type AiModelVersion } from './services/aiModelConfig';
import { getProjectHistory, saveToProjectHistory, removeFromProjectHistory, generateProjectName, DEFAULT_BUDGET, type ProjectHistoryEntry, type ProjectBudget, type GenerationTimes } from './services/projectHistoryService';



const App: React.FC = () => {
  const { user, loading, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // モデル画像（正面）
  const [humanFile, setHumanFile] = useState<File | null>(null);
  const [humanPreview, setHumanPreview] = useState<string | null>(null);

  // サブキャラクター画像
  const [subCharFile, setSubCharFile] = useState<File | null>(null);
  const [subCharPreview, setSubCharPreview] = useState<string | null>(null);

  // サブキャラクタープロンプト設定（SUB_CHAR_PRESETSはhooksからインポート）
  const [activeSubTags, setActiveSubTags] = useState<Set<string>>(new Set(SUB_CHAR_PRESETS.map(p => p.id)));
  const [customSubPrompt, setCustomSubPrompt] = useState('');
  const [mainCharPrompt, setMainCharPrompt] = useState('');

  // 写真固定プリセット（メインモデル用）
  const MAIN_PHOTO_LOCK_PRESETS = [
    { id: 'face_lock', label: '顔を固定', prompt: 'exact same face as reference image, identical facial features, same face shape, same eyes, same nose, same lips, preserve facial identity completely' },
    { id: 'outfit_lock', label: '服装を固定', prompt: 'exact same clothing as reference image, identical outfit, same fabric texture, same color, same style, preserve clothing details completely' },
    { id: 'hair_lock', label: '髪型を固定', prompt: 'exact same hairstyle as reference image, identical hair color, same hair length, same hair texture, preserve hair style completely' },
    { id: 'pose_lock', label: 'ポーズを固定', prompt: 'similar pose as reference image, maintain body positioning, preserve posture' },
    { id: 'all_lock', label: '全て固定', prompt: 'exact same appearance as reference image, identical face, same clothing, same hairstyle, preserve all visual details from the original photo' },
  ] as const;

  // 写真固定プリセット（IP/サブキャラ用）
  const IP_PHOTO_LOCK_PRESETS = [
    { id: 'ip_face_lock', label: '顔を固定', prompt: 'exact same face as IP reference, identical facial features, preserve IP character face completely' },
    { id: 'ip_outfit_lock', label: '服装を固定', prompt: 'exact same clothing as IP reference, identical outfit style, preserve IP character clothing' },
    { id: 'ip_style_lock', label: 'スタイルを固定', prompt: 'exact same visual style as IP reference, identical art style, same color palette' },
    { id: 'ip_all_lock', label: '全て固定', prompt: 'exact same appearance as IP reference image, preserve all IP character visual details completely' },
  ] as const;

  const [activeMainPhotoLocks, setActiveMainPhotoLocks] = useState<Set<string>>(new Set());
  const [activeIpPhotoLocks, setActiveIpPhotoLocks] = useState<Set<string>>(new Set());

  // カスタム指示ブロック（CustomInstructionBlockはhooksからインポート）
  const [mainCustomInstructions, setMainCustomInstructions] = useState<CustomInstructionBlock[]>([]);
  const [subCustomInstructions, setSubCustomInstructions] = useState<CustomInstructionBlock[]>([]);
  const [newMainInstruction, setNewMainInstruction] = useState({ label: '', prompt: '' });
  const [newSubInstruction, setNewSubInstruction] = useState({ label: '', prompt: '' });
  const [showMainInstructionInput, setShowMainInstructionInput] = useState(false);
  const [showSubInstructionInput, setShowSubInstructionInput] = useState(false);

  // カスタム指示を追加
  const addCustomInstruction = (isMain: boolean) => {
    const input = isMain ? newMainInstruction : newSubInstruction;
    if (!input.label.trim()) return;

    const newBlock: CustomInstructionBlock = {
      id: `custom-${Date.now()}`,
      label: input.label.trim(),
      prompt: input.prompt.trim() || input.label.trim(), // プロンプト未入力ならラベルを使用
      active: true,
    };

    if (isMain) {
      setMainCustomInstructions(prev => [...prev, newBlock]);
      setNewMainInstruction({ label: '', prompt: '' });
      setShowMainInstructionInput(false);
    } else {
      setSubCustomInstructions(prev => [...prev, newBlock]);
      setNewSubInstruction({ label: '', prompt: '' });
      setShowSubInstructionInput(false);
    }
  };

  // カスタム指示のON/OFF切り替え
  const toggleCustomInstruction = (isMain: boolean, id: string) => {
    if (isMain) {
      setMainCustomInstructions(prev => prev.map(i => i.id === id ? { ...i, active: !i.active } : i));
    } else {
      setSubCustomInstructions(prev => prev.map(i => i.id === id ? { ...i, active: !i.active } : i));
    }
  };

  // カスタム指示を削除
  const removeCustomInstruction = (isMain: boolean, id: string) => {
    if (isMain) {
      setMainCustomInstructions(prev => prev.filter(i => i.id !== id));
    } else {
      setSubCustomInstructions(prev => prev.filter(i => i.id !== id));
    }
  };

  // ─── カスタム指示プリセット保存・読み込み ───
  interface InstructionPreset {
    name: string;
    mainInstructions: CustomInstructionBlock[];
    subInstructions: CustomInstructionBlock[];
    savedAt: string;
  }
  const [instructionPresets, setInstructionPresets] = useState<InstructionPreset[]>(() => {
    try {
      const saved = localStorage.getItem('snafty_instruction_presets');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [showPresetInput, setShowPresetInput] = useState(false);
  const [presetName, setPresetName] = useState('');

  const saveInstructionPreset = () => {
    if (!presetName.trim()) return;
    const preset: InstructionPreset = {
      name: presetName.trim(),
      mainInstructions: mainCustomInstructions.map(i => ({ ...i })),
      subInstructions: subCustomInstructions.map(i => ({ ...i })),
      savedAt: new Date().toISOString(),
    };
    const updated = [...instructionPresets, preset];
    setInstructionPresets(updated);
    localStorage.setItem('snafty_instruction_presets', JSON.stringify(updated));
    setPresetName('');
    setShowPresetInput(false);
  };

  const loadInstructionPreset = (preset: InstructionPreset) => {
    setMainCustomInstructions(preset.mainInstructions.map(i => ({
      ...i, id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    })));
    setSubCustomInstructions(preset.subInstructions.map(i => ({
      ...i, id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    })));
  };

  const deleteInstructionPreset = (index: number) => {
    const updated = instructionPresets.filter((_, i) => i !== index);
    setInstructionPresets(updated);
    localStorage.setItem('snafty_instruction_presets', JSON.stringify(updated));
  };

  // メインキャラ写真固定プロンプト生成
  const mainPhotoLockPrompt = MAIN_PHOTO_LOCK_PRESETS
    .filter(p => activeMainPhotoLocks.has(p.id))
    .map(p => p.prompt)
    .join(', ');

  // IP写真固定プロンプト生成
  const ipPhotoLockPrompt = IP_PHOTO_LOCK_PRESETS
    .filter(p => activeIpPhotoLocks.has(p.id))
    .map(p => p.prompt)
    .join(', ');

  // サブキャラ用プロンプト生成（カスタム指示 + 写真固定を含む）
  const subCharPrompt = [
    ...SUB_CHAR_PRESETS.filter(p => activeSubTags.has(p.id)).map(p => p.prompt),
    ...subCustomInstructions.filter(i => i.active).map(i => i.prompt),
    ...(ipPhotoLockPrompt ? [ipPhotoLockPrompt] : []),
    ...(customSubPrompt.trim() ? [customSubPrompt.trim()] : []),
  ].join(', ');

  // メインキャラ用カスタム指示プロンプト（写真固定を含む）
  const mainCustomPrompt = [
    ...mainCustomInstructions.filter(i => i.active).map(i => i.prompt),
    ...(mainPhotoLockPrompt ? [mainPhotoLockPrompt] : []),
  ].join(', ');

  // UI状態
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ResultItem[]>([]);

  // 撮影設定
  const [cameraPanelOpen, setCameraPanelOpen] = useState(false);
  const [cameraType, setCameraType] = useState('cinematic');
  const [lensType, setLensType] = useState('50mm');
  const [depthOfField, setDepthOfField] = useState('medium');
  const [imageQuality, setImageQuality] = useState('high');
  const [colorGrade, setColorGrade] = useState('natural');
  const cameraPanelRef = useRef<HTMLDivElement>(null);

  // カット構成ステート（PDFアップロード前は空）
  const [cuts, setCuts] = useState<CutItem[]>([]);

  // 構成表モード（画像用 / 動画用）
  const [compositionMode, setCompositionMode] = useState<'image' | 'video'>('image');

  // --- カット編集ロジック ---
  const [editingCutId, setEditingCutId] = useState<number | null>(null);
  const [stillImageStyle, setStillImageStyle] = useState('masterpiece, 8k resolution, highly detailed, photorealistic, cinematic lighting');
  const [stillImageNegative, setStillImageNegative] = useState('');
  const [stillImageMetaPrompt, setStillImageMetaPrompt] = useState('動画の全体的な品質やルック＆フィールを定義するスタイリングプロンプトを指定してください。');
  const [semanticPrompt, setSemanticPrompt] = useState('1 状況把握\n2 重さ提示\n3 重さの深化\n4 ズレ発生\n5 軽さ提示\n6 解放\n7 余韻');
  const [productPrompt, setProductPrompt] = useState('');
  const [stagePrompt, setStagePrompt] = useState<string>(''); // used for fixed elements now
  const [extractedPdfText, setExtractedPdfText] = useState('');
  const [fixedElementMetaPrompt, setFixedElementMetaPrompt] = useState(DEFAULT_FIXED_META_PROMPT);
  const [isGeneratingFixed, setIsGeneratingFixed] = useState(false);
  const [aiModel, setAiModel] = useState<AiModelType>(() => {
    const saved = localStorage.getItem('snafty_ai_model');
    return (saved as AiModelType) || 'openai';
  });

  // 詳細AIモデル選択
  const [selectedModelId, setSelectedModelIdState] = useState<string>(() => getSelectedModelId());
  const [availableAiModels] = useState<AiModelVersion[]>(() => getEnabledAiModels());

  // モデルIDを変更時にlocalStorageにも保存
  const handleModelIdChange = (modelId: string) => {
    setSelectedModelIdState(modelId);
    setSelectedModelId(modelId);
    const provider = getProviderFromModelId(modelId);
    setAiModel(provider);
    localStorage.setItem('snafty_ai_model', provider);
    // コストも更新
    const model = availableAiModels.find(m => m.id === modelId);
    if (model) {
      setProjectBudget(prev => ({ ...prev, aiCostPerCall: model.costPerCall }));
    }
  };

  const [stillPromptPanelOpen, setStillPromptPanelOpen] = useState(false);
  const stillPromptPanelRef = useRef<HTMLDivElement>(null);
  const [semanticPanelOpen, setSemanticPanelOpen] = useState(false);
  const semanticPanelRef = useRef<HTMLDivElement>(null);
  const [productPanelOpen, setProductPanelOpen] = useState(false);
  const productPanelRef = useRef<HTMLDivElement>(null);
  const [fixedPanelOpen, setFixedPanelOpen] = useState(false);
  const fixedPanelRef = useRef<HTMLDivElement>(null);

  // Video Generation Settings
  const [videoGenModel, setVideoGenModel] = useState<string>('kling');
  const [videoPromptStyle, setVideoPromptStyle] = useState('masterpiece, 8k resolution, highly detailed, smooth motion, high fps');
  const [videoPromptNegative, setVideoPromptNegative] = useState('');
  const [videoMetaPrompt, setVideoMetaPrompt] = useState('動画生成AIに渡すモーション指示のルールを設定します。');

  const enabledCuts = cuts.filter(c => c.enabled);

  // ─── API稼働状況チェック ───
  type ApiStatus = 'checking' | 'ok' | 'error';
  const [apiStatuses, setApiStatuses] = useState<Record<string, ApiStatus>>({
    openai: 'checking',
    claude: 'checking',
  });

  useEffect(() => {
    const checkApi = async (provider: string, model: string) => {
      try {
        const res = await fetch(`/api/${provider}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 5,
          }),
        });
        setApiStatuses(prev => ({ ...prev, [provider]: res.ok ? 'ok' : 'error' }));
      } catch {
        setApiStatuses(prev => ({ ...prev, [provider]: 'error' }));
      }
    };
    checkApi('openai', 'gpt-4o-mini');
    checkApi('claude', 'claude-3-haiku-20240307');
  }, []);

  useEffect(() => {
    const savedFixedMeta = localStorage.getItem('snafty_fixed_meta_prompt');
    if (savedFixedMeta) {
      setFixedElementMetaPrompt(savedFixedMeta);
    }
    const savedAiModel = localStorage.getItem('snafty_ai_model') as AiModelType;
    if (savedAiModel === 'openai' || savedAiModel === 'claude') {
      setAiModel(savedAiModel);
    }

    // Load still image & video prompts
    const stStyle = localStorage.getItem('snafty_still_style');
    const stNeg = localStorage.getItem('snafty_still_negative');
    const stMeta = localStorage.getItem('snafty_still_meta_prompt');
    const vidModel = localStorage.getItem('snafty_video_model');
    const vidStyle = localStorage.getItem('snafty_video_style');
    const vidNeg = localStorage.getItem('snafty_video_negative');
    const vidMeta = localStorage.getItem('snafty_video_meta_prompt');

    if (stStyle !== null) setStillImageStyle(stStyle);
    if (vidMeta !== null) setVideoMetaPrompt(vidMeta);
    if (stNeg !== null) setStillImageNegative(stNeg);
    if (stMeta !== null) setStillImageMetaPrompt(stMeta);
    if (vidModel !== null) setVideoGenModel(vidModel);
    if (vidStyle !== null) setVideoPromptStyle(vidStyle);
    if (vidNeg !== null) setVideoPromptNegative(vidNeg);
  }, []);

  const saveStillPrompts = () => {
    localStorage.setItem('snafty_still_style', stillImageStyle);
    localStorage.setItem('snafty_still_negative', stillImageNegative);
    localStorage.setItem('snafty_still_meta_prompt', stillImageMetaPrompt);
    alert('静止画プロンプト設定を保存しました。');
  };

  const saveVideoPrompts = () => {
    localStorage.setItem('snafty_video_model', videoGenModel);
    localStorage.setItem('snafty_video_style', videoPromptStyle);
    localStorage.setItem('snafty_video_negative', videoPromptNegative);
    localStorage.setItem('snafty_video_meta_prompt', videoMetaPrompt);
    alert('動画生成プロンプト設定を保存しました。');
  };

  const toggleCut = (id: number) => {
    setCuts(prev => prev.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c));
  };



  const updateCutField = (id: number, field: 'title' | 'prompt' | 'camera' | 'semanticPrompt' | 'expression' | 'gaze' | 'pose' | 'walkingStyle' | 'walkPosition' | 'moveDistance' | 'action' | 'background' | 'productEmphasis' | 'duration' | 'motionType' | 'cameraMovement' | 'transition' | 'videoPrompt' | 'motionIntensity' | 'startFrame' | 'endFrame', value: string) => {
    setCuts(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const resetCuts = () => {
    setCuts([]);
    setEditingCutId(null);
  };

  // カット単体のプロンプト再生成
  const [regeneratingCutId, setRegeneratingCutId] = useState<number | null>(null);

  const regenerateCutPrompt = async (cutId: number) => {
    const cut = cuts.find(c => c.id === cutId);
    if (!cut || !extractedPdfText) return;

    setRegeneratingCutId(cutId);
    try {
      const aiEndpoint = `/api/${aiModel}`;
      const aiModelName = aiModel === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-20250514';

      const response = await fetch(aiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: aiModelName,
          messages: [
            {
              role: 'system',
              content: `You are an expert in fal.ai nanobanana 2 image generation prompts. Create optimized prompts using [tag] format.

Format your output as:
[POSITIVE]
[quality], [style], [subject description], [pose/expression], [camera], [background], [lighting]
[/POSITIVE]
[NEGATIVE]
[unwanted elements]
[/NEGATIVE]

Guidelines:
- Use [masterpiece], [best quality], [highly detailed] for quality
- Use [cinematic lighting], [soft shadows] for lighting
- Use [full body shot], [medium shot], [close-up] for camera distance
- Keep subject description clear and specific
- Include camera angle from the cut settings
- Separate unwanted elements in NEGATIVE section

Output ONLY the formatted prompt, no explanations.`
            },
            {
              role: 'user',
              content: `タイトル: ${cut.title}
カメラ: ${cut.camera || 'なし'}
現在のプロンプト: ${cut.prompt}
IP情報: ${cut.ipPrompt || 'なし'}
要素固定（背景）: ${stagePrompt}

このカットのプロンプトを、カメラ設定（${cut.camera || '指定なし'}）を考慮して、画像生成AIに最適な英語プロンプトに再生成してください。`
            }
          ],
          max_tokens: 500
        })
      });

      if (!response.ok) throw new Error('API error');
      const data = await response.json();
      const newPrompt = data.choices?.[0]?.message?.content || data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      if (newPrompt) {
        setCuts(prev => prev.map(c => c.id === cutId ? { ...c, prompt: newPrompt.trim() } : c));
      }
    } catch (err) {
      console.error('Cut prompt regeneration error:', err);
      alert('プロンプト再生成に失敗しました: ' + (err instanceof Error ? err.message : '不明なエラー'));
    } finally {
      setRegeneratingCutId(null);
    }
  };

  // 詳細フィールドから英語プロンプトを生成（翻訳モード）
  const regenerateCutPromptFromFields = async (cutId: number) => {
    const cut = cuts.find(c => c.id === cutId);
    if (!cut) return;

    // 詳細フィールドを収集
    const fields = [
      cut.expression && `表情: ${cut.expression}`,
      cut.gaze && `視線: ${cut.gaze}`,
      cut.pose && `ポーズ: ${cut.pose}`,
      cut.walkingStyle && `歩き方: ${cut.walkingStyle}`,
      cut.walkPosition && `画面位置: ${cut.walkPosition}`,
      cut.moveDistance && `移動距離: ${cut.moveDistance}`,
      cut.action && `アクション: ${cut.action}`,
      cut.background && `背景: ${cut.background}`,
      cut.productEmphasis && `プロダクト強調: ${cut.productEmphasis}`,
      cut.camera && `カメラ: ${cut.camera}`,
    ].filter(Boolean).join('\n');

    if (!fields) {
      alert('詳細設定が入力されていません');
      return;
    }

    setRegeneratingCutId(cutId);
    try {
      const aiEndpoint = `/api/${aiModel}`;
      const aiModelName = aiModel === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-20250514';

      const response = await fetch(aiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: aiModelName,
          messages: [
            {
              role: 'system',
              content: `You are an expert in fal.ai nanobanana 2 image generation prompts. Convert Japanese scene descriptions into optimized prompts using [tag] format.

Format your output as:
[POSITIVE]
[quality], [style], [subject description], [pose/expression], [camera], [background], [lighting]
[/POSITIVE]
[NEGATIVE]
[unwanted elements]
[/NEGATIVE]

Guidelines:
- Use [masterpiece], [best quality], [highly detailed] for quality
- Translate each field accurately to English
- Use appropriate camera distance tags: [full body shot], [medium shot], [close-up]
- Include lighting: [cinematic lighting], [soft shadows], [natural light]
- Add common negative elements: [blurry], [low quality], [bad anatomy], [extra limbs]

Output ONLY the formatted prompt, no explanations.`
            },
            {
              role: 'user',
              content: `以下の日本語の詳細設定を、AI画像生成に最適な英語プロンプトに変換してください:\n\n${fields}`
            }
          ],
          max_tokens: 500
        })
      });

      if (!response.ok) throw new Error('API error');
      const data = await response.json();
      const newPrompt = data.choices?.[0]?.message?.content || data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      if (newPrompt) {
        setCuts(prev => prev.map(c => c.id === cutId ? { ...c, prompt: newPrompt.trim() } : c));
      }
    } catch (err) {
      console.error('Field translation error:', err);
      alert('英語化に失敗しました: ' + (err instanceof Error ? err.message : '不明なエラー'));
    } finally {
      setRegeneratingCutId(null);
    }
  };

  const handleUploadCutImage = (cutId: number, file: File) => {
    const url = URL.createObjectURL(file);
    setCuts(prev => prev.map(c => c.id === cutId ? { ...c, generatedImageUrl: url } : c));
  };

  const handleGenerateFixedElements = async () => {
    if (!extractedPdfText) {
      alert("先にPDFをアップロードして簡易ストーリーを抽出してください。");
      return;
    }
    
    setIsGeneratingFixed(true);
    try {
      const reg = localStorage.getItem('snafty_regulation') || DEFAULT_REGULATION;
      const cutMeta = localStorage.getItem('snafty_meta_prompt') || '';
      
      const generated = await generateFixedElements(
        extractedPdfText,
        reg,
        cutMeta,
        fixedElementMetaPrompt,
        selectedModelId
      );
      setStagePrompt(generated);
    } catch (err) {
      console.error(err);
      alert('要素固定シートの生成に失敗しました: ' + (err instanceof Error ? err.message : '不明なエラー'));
    } finally {
      setIsGeneratingFixed(false);
    }
  };

  // シーン背景画像の生成
  const generateBackgroundForCut = async (cutId: number) => {
    const cut = cuts.find(c => c.id === cutId);
    if (!cut || !stagePrompt) return;

    setCuts(prev => prev.map(c => c.id === cutId ? { ...c, isGeneratingBackground: true } : c));

    try {
      // AIで背景プロンプトを生成
      const aiEndpoint = `/api/${aiModel}`;
      const aiModelName = aiModel === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-20250514';

      const promptResponse = await fetch(aiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: aiModelName,
          messages: [
            {
              role: 'system',
              content: `You are an expert at creating background image prompts for AI image generation. Create a detailed English prompt for generating a background scene WITHOUT any people or characters.`
            },
            {
              role: 'user',
              content: `シーン: ${cut.title}
カメラ: ${cut.camera || 'ミディアムショット'}
背景設定: ${stagePrompt}
シーンプロンプト: ${cut.prompt}

このシーンの背景のみ（人物なし）を生成するプロンプトを英語で出力してください。建物、風景、インテリアなど背景要素のみを詳細に記述してください。Output ONLY the English prompt.`
            }
          ],
          max_tokens: 300
        })
      });

      if (!promptResponse.ok) throw new Error('AI prompt generation failed');
      const promptData = await promptResponse.json();
      const bgPrompt = promptData.choices?.[0]?.message?.content || promptData.candidates?.[0]?.content?.parts?.[0]?.text || stagePrompt;

      // fal.aiで背景画像を生成（プロキシ経由）
      const finalPrompt = `${bgPrompt}, no people, no characters, empty scene, high quality background, cinematic lighting, 8k resolution`;
      const falParams = new URLSearchParams({ path: 'fal-ai/flux/dev' });
      const falResponse = await fetch(`/api/proxy?${falParams.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          image_size: 'landscape_16_9',
          num_images: 1,
          enable_safety_checker: false
        })
      });

      if (!falResponse.ok) {
        const errData = await falResponse.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || 'Background image generation failed');
      }
      let falData = await falResponse.json();
      console.log('[Background] Initial response:', JSON.stringify(falData).substring(0, 500));

      // 非同期処理の場合はポーリング
      if (falData.status_url && falData.response_url) {
        const maxAttempts = 60;
        for (let i = 0; i < maxAttempts; i++) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          const statusParams = new URLSearchParams({ url: falData.status_url });
          const statusRes = await fetch(`/api/proxy?${statusParams.toString()}`);
          const statusData = await statusRes.json();
          console.log(`[Background] Poll ${i + 1}: ${statusData.status}`);

          if (statusData.status === 'COMPLETED') {
            const responseParams = new URLSearchParams({ url: falData.response_url });
            const resultRes = await fetch(`/api/proxy?${responseParams.toString()}`);
            falData = await resultRes.json();
            break;
          }
          if (statusData.status === 'FAILED') {
            throw new Error('Background generation failed');
          }
        }
      }

      // 様々なレスポンス形式に対応
      const imageUrl = falData.images?.[0]?.url
        || falData.output?.images?.[0]?.url
        || falData.image?.url
        || (typeof falData.images?.[0] === 'string' ? falData.images[0] : null);

      console.log('[Background] Final imageUrl:', imageUrl);

      if (imageUrl) {
        setCuts(prev => prev.map(c => c.id === cutId ? { ...c, backgroundImageUrl: imageUrl, isGeneratingBackground: false } : c));
      } else {
        console.error('[Background] Full response:', JSON.stringify(falData));
        throw new Error('No image URL returned');
      }
    } catch (err) {
      console.error('Background generation error:', err);
      setCuts(prev => prev.map(c => c.id === cutId ? { ...c, isGeneratingBackground: false } : c));
      alert('背景画像の生成に失敗しました: ' + (err instanceof Error ? err.message : '不明なエラー'));
    }
  };

  // 全シーンの背景を一括生成
  const generateAllBackgrounds = async () => {
    const enabledCutsForBg = cuts.filter(c => c.enabled);
    for (const cut of enabledCutsForBg) {
      await generateBackgroundForCut(cut.id);
    }
  };

  // 背景画像のダウンロード
  const downloadBackgroundImage = async (imageUrl: string, cutTitle: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().slice(0, 10);
      a.download = `background_${timestamp}_${cutTitle.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g, '_')}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
      alert('ダウンロードに失敗しました');
    }
  };

  // 全背景画像を一括ダウンロード
  const downloadAllBackgrounds = async () => {
    const enabledCutsWithBg = cuts.filter(c => c.enabled && c.backgroundImageUrl);
    for (const cut of enabledCutsWithBg) {
      if (cut.backgroundImageUrl) {
        await downloadBackgroundImage(cut.backgroundImageUrl, cut.title);
        await new Promise(resolve => setTimeout(resolve, 500)); // 少し間隔を空ける
      }
    }
  };

  // ─── PDF自動生成フロー ───
  const handleFullAutoGenerate = async (pdfText: string) => {
    const totalStartTime = Date.now();
    try {
      const reg = localStorage.getItem('snafty_regulation') || DEFAULT_REGULATION;
      const cutMeta = localStorage.getItem('snafty_meta_prompt') || DEFAULT_META_PROMPT;

      // Step 1 + Step 2: カット割り生成と要素固定を並列実行
      console.log('[AutoGenerate] Step 1+2: カット割り生成 & 要素固定を並列実行中...');
      console.log('[AutoGenerate] Using AI model:', selectedModelId);
      setIsGeneratingFixed(true);
      const parallelStartTime = Date.now();

      const [cutResult, generatedFixed] = await Promise.all([
        generateCutComposition(pdfText, reg, cutMeta, 7, selectedModelId),
        generateFixedElements(pdfText, reg, cutMeta, fixedElementMetaPrompt, selectedModelId),
      ]);

      const parallelEndTime = Date.now();
      const cutCompositionTime = parallelEndTime - parallelStartTime;
      const fixedElementsTime = cutCompositionTime; // 並列なので同じ
      console.log(`[AutoGenerate] Step 1+2 並列完了! (${cutCompositionTime}ms)`);

      // デバッグログ: AIからの生データを確認
      console.log('[AutoGenerate] AI Response cuts:', cutResult.cuts);
      cutResult.cuts.forEach((cut, i) => {
        console.log(`[AutoGenerate] Cut ${i+1}: ipPresence=${cut.ipPresence}, ipAction=${cut.ipAction}, ipExpression=${cut.ipExpression}, ipPosition=${cut.ipPosition}`);
      });

      const newCuts = cutResult.cuts.map((row, i) => compositionRowToCutItem(row, i));

      // デバッグログ: 変換後のカットを確認
      console.log('[AutoGenerate] Converted cuts:', newCuts);
      newCuts.forEach((cut, i) => {
        console.log(`[AutoGenerate] CutItem ${i+1}: showSub=${cut.showSub}, ipPrompt=${cut.ipPrompt}`);
      });

      setCuts(newCuts);
      setEditingCutId(null);
      setStagePrompt(generatedFixed);
      setIsGeneratingFixed(false);
      console.log('[AutoGenerate] Generated fixed elements:', generatedFixed);

      // 生成時間を記録
      const totalTime = Date.now() - totalStartTime;
      setGenerationTimes({
        cutComposition: cutCompositionTime,
        fixedElements: fixedElementsTime,
        totalTime: totalTime,
      });

      // スタイルプロンプトも設定（要素固定プロンプトをベースに）
      setStillImageStyle(`masterpiece, 8k resolution, highly detailed, ${generatedFixed}`);

      // 自動保存（Step 1+2 完了時点で即座に保存）
      const finalTotalTime = Date.now() - totalStartTime;
      const timesForSave = {
        cutComposition: cutCompositionTime,
        fixedElements: fixedElementsTime,
        totalTime: finalTotalTime,
      };
      const name = generateProjectName(newCuts, pdfText);
      const entry = saveToProjectHistory({
        name,
        cuts: newCuts,
        stagePrompt: generatedFixed,
        extractedPdfText: pdfText,
        mainCharPrompt,
        subCharPrompt,
        aiModel,
        budget: projectBudget,
        generationTimes: timesForSave,
      });
      setCurrentProjectId(entry.id);
      setProjectHistory(getProjectHistory());
      console.log('[AutoGenerate] 自動保存完了:', entry.name);
      console.log('[AutoGenerate] Step 1+2 完了！UI反映済み');

      // Step 3: 各カットのプロンプトを英語で再生成（バックグラウンド）
      // UIブロックせず非同期で実行し、完了次第カットを更新する
      const bgAiEndpoint = `/api/${aiModel}`;
      const bgAiModelName = aiModel === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-20250514';
      const bgCutPrompts = newCuts.map(c => ({
        id: c.id,
        title: c.title,
        originalPrompt: c.prompt,
        camera: c.camera,
        ipPrompt: c.ipPrompt
      }));
      const bgGeneratedFixed = generatedFixed;
      const bgStillImageMetaPrompt = stillImageMetaPrompt;

      // fire-and-forget: awaitしない
      (async () => {
        try {
          console.log('[AutoGenerate/BG] Step 3: 英語プロンプト再生成をバックグラウンドで開始...');
          const regenerateResponse = await fetch(bgAiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: bgAiModelName,
              messages: [
                {
                  role: 'system',
                  content: `You are an expert in fal.ai nanobanana 2 image generation prompts. Create optimized prompts using [tag] format for each cut.

For each cut, create a prompt in this format:
[POSITIVE]
[quality], [style], [subject description], [pose/expression], [camera], [background], [lighting]
[/POSITIVE]
[NEGATIVE]
[unwanted elements]
[/NEGATIVE]

Guidelines:
- Use [masterpiece], [best quality], [highly detailed] for quality
- Use [cinematic lighting], [soft shadows] for lighting
- Include camera settings from the cut data
- Add IP character description if present
- Common negatives: [blurry], [low quality], [bad anatomy], [extra limbs], [duplicate]

Output as JSON array: [{"id": number, "prompt": "[POSITIVE]...[/POSITIVE][NEGATIVE]...[/NEGATIVE]"}, ...]`
                },
                {
                  role: 'user',
                  content: `静止画メタプロンプト（スタイル指示）:
${bgStillImageMetaPrompt}

要素固定プロンプト（背景・環境）:
${bgGeneratedFixed}

以下の各カットのプロンプトを、画像生成AIに最適な英語プロンプトに変換してください:

${bgCutPrompts.map(c => `ID: ${c.id}
タイトル: ${c.title}
カメラ: ${c.camera || 'なし'}
元プロンプト: ${c.originalPrompt}
IP情報: ${c.ipPrompt || 'なし'}`).join('\n\n')}

JSON配列形式で出力してください。`
                }
              ],
              max_tokens: 2000
            })
          });

          if (regenerateResponse.ok) {
            const regenerateData = await regenerateResponse.json();
            const content = regenerateData.choices?.[0]?.message?.content?.trim();

            const jsonMatch = content?.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const regeneratedPrompts = JSON.parse(jsonMatch[0]);

              // 最新のcuts stateに対してプロンプトだけ更新（他の変更を上書きしない）
              setCuts(prev => prev.map(cut => {
                const regenerated = regeneratedPrompts.find((r: { id: number; prompt?: string }) => r.id === cut.id);
                if (regenerated && regenerated.prompt) {
                  return { ...cut, prompt: regenerated.prompt };
                }
                return cut;
              }));
              console.log('[AutoGenerate/BG] 英語プロンプト再生成完了 ✓');
            }
          }
        } catch (bgErr) {
          console.error('[AutoGenerate/BG] バックグラウンド英語化エラー（UI影響なし）:', bgErr);
        }
      })();
    } catch (err) {
      console.error('[AutoGenerate] Error:', err);
      throw err;
    }
  };

  const generateImageForCut = async (cutId: number) => {
    if (!humanFile) {
      alert("上のセクションでメインモデルの画像を設定してください。");
      return;
    }
    const targetCut = cuts.find(c => c.id === cutId);
    if (!targetCut) return;

    setCuts(prev => prev.map(c => c.id === cutId ? { ...c, isGenerating: true, errorMessage: undefined } : c));

    try {
      const humanDataUrl = await fileToDataUrl(humanFile);

      // プロンプトから[POSITIVE]と[NEGATIVE]セクションを抽出
      const cutPrompt = targetCut.prompt || '';
      const positiveMatch = cutPrompt.match(/\[POSITIVE\]([\s\S]*?)\[\/POSITIVE\]/i);
      const negativeMatch = cutPrompt.match(/\[NEGATIVE\]([\s\S]*?)\[\/NEGATIVE\]/i);

      let positivePrompt = positiveMatch ? positiveMatch[1].trim() : cutPrompt;
      let negativePrompt = negativeMatch ? negativeMatch[1].trim() : '';

      // カメラ設定を追加
      if (targetCut.camera) {
        positivePrompt = `[${targetCut.camera}], ${positivePrompt}`;
      }

      // メインキャラクターのプロンプトと詳細を追加
      const mainDetailPrompt = getMainCharDetailPrompt();
      const mainPromptParts = [mainCharPrompt, mainCustomPrompt, mainDetailPrompt].filter(Boolean).join(', ');
      if (mainPromptParts) {
        positivePrompt = `${mainPromptParts}, ${positivePrompt}`;
      }

      // スタイルと背景を追加
      const combinedBase = [stillImageStyle, stagePrompt].filter(Boolean).join(', ');
      if (combinedBase) {
        positivePrompt = `${combinedBase}, ${positivePrompt}`;
      }

      // ネガティブプロンプトを統合
      if (stillImageNegative) {
        negativePrompt = negativePrompt ? `${negativePrompt}, ${stillImageNegative}` : stillImageNegative;
      }

      // サブキャラクター（IP）の設定
      let subCharDataUrl: string | undefined;
      let ipDescription: string | undefined;
      if (targetCut.showSub && subCharFile && subCharPrompt) {
        subCharDataUrl = await fileToDataUrl(subCharFile);
        const subDetailPrompt = getSubCharDetailPrompt();
        ipDescription = [targetCut.ipPrompt || subCharPrompt, subDetailPrompt].filter(Boolean).join(', ');
        positivePrompt += `, [companion character: ${ipDescription}]`;
      }

      // 最終プロンプトを[POSITIVE][NEGATIVE]形式で構築
      const finalPrompt = `[POSITIVE]\n${positivePrompt}\n[/POSITIVE]\n[NEGATIVE]\n${negativePrompt || '[blurry], [low quality], [bad anatomy]'}\n[/NEGATIVE]`;

      const result = await generatePose({
        humanImageUrl: humanDataUrl,
        pose: finalPrompt,
        resolution: '1K',
        format: 'jpeg',
        subCharacterImageUrl: subCharDataUrl,
        subCharacterPrompt: ipDescription,
      });
      
      setCuts(prev => prev.map(c => c.id === cutId ? { 
        ...c, 
        isGenerating: false, 
        generatedImageUrl: result.imageUrl 
      } : c));

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '生成失敗';
      console.error(`Cut ${cutId} generation error:`, err);
      console.error(`Cut ${cutId} error message:`, errorMsg);
      alert(`画像生成エラー: ${errorMsg}`);
      setCuts(prev => prev.map(c => c.id === cutId ? { ...c, isGenerating: false, errorMessage: errorMsg } : c));
    }
  };

  // 動画設定から動画プロンプトを生成
  const generateVideoPromptFromSettings = (cut: CutItem): string => {
    const parts: string[] = [];

    // 動きの種類
    if (cut.motionType) {
      parts.push(`Motion: ${cut.motionType}`);
    }

    // カメラの動き
    if (cut.cameraMovement) {
      parts.push(`Camera movement: ${cut.cameraMovement}`);
    }

    // 動きの強度
    if (cut.motionIntensity) {
      const intensityMap: Record<string, string> = {
        '弱': 'subtle, gentle movement',
        '中': 'moderate movement',
        '強': 'dynamic, strong movement'
      };
      parts.push(intensityMap[cut.motionIntensity] || cut.motionIntensity);
    }

    // 開始・終了フレーム
    if (cut.startFrame && cut.endFrame) {
      parts.push(`Starting from: ${cut.startFrame}, ending at: ${cut.endFrame}`);
    } else if (cut.startFrame) {
      parts.push(`Starting from: ${cut.startFrame}`);
    } else if (cut.endFrame) {
      parts.push(`Ending at: ${cut.endFrame}`);
    }

    // 画面位置
    if (cut.walkPosition) {
      parts.push(`Position: ${cut.walkPosition}`);
    }

    // 基本プロンプト
    if (cut.prompt) {
      parts.push(cut.prompt);
    }

    // 追加の動画プロンプト
    if (cut.videoPrompt) {
      parts.push(cut.videoPrompt);
    }

    // スタイル
    parts.push('Cinematic fashion video, smooth motion, professional lighting');

    return parts.join('. ');
  };

  // カット単体の動画を生成
  const generateVideoForCut = async (cutId: number) => {
    const targetCut = cuts.find(c => c.id === cutId);
    if (!targetCut) return;

    // 画像が生成されていない場合はエラー
    if (!targetCut.generatedImageUrl) {
      alert('先に画像を生成してください。動画は画像から生成されます。');
      return;
    }

    setCuts(prev => prev.map(c => c.id === cutId ? { ...c, isGeneratingVideo: true, errorMessage: undefined } : c));

    try {
      // 動画プロンプトを生成
      const videoPrompt = generateVideoPromptFromSettings(targetCut);

      // 動画プロンプトをカットに保存
      setCuts(prev => prev.map(c => c.id === cutId ? { ...c, videoPrompt } : c));

      // 尺を取得（デフォルト5秒）
      const durationMap: Record<string, '5' | '10'> = {
        '2秒': '5',
        '3秒': '5',
        '5秒': '5',
      };
      const duration = durationMap[targetCut.duration || '5秒'] || '5';

      const result = await generateKlingVideo({
        imageUrl: targetCut.generatedImageUrl,
        prompt: videoPrompt,
        duration,
        aspectRatio: '9:16',
        model: 'v2.6-pro',
      });

      setCuts(prev => prev.map(c => c.id === cutId ? {
        ...c,
        isGeneratingVideo: false,
        generatedVideoUrl: result.videoUrl,
        videoPrompt,
      } : c));

    } catch (err) {
      console.error(`Cut ${cutId} video generation error:`, err);
      setCuts(prev => prev.map(c => c.id === cutId ? { ...c, isGeneratingVideo: false, errorMessage: err instanceof Error ? err.message : '動画生成失敗' } : c));
    }
  };

  // 全カットの画像を同時生成
  const generateAllCutImages = async () => {
    if (!humanFile) {
      alert('メインキャラクター（モデル画像）を設定してください。');
      return;
    }

    const enabledCutsToGenerate = cuts.filter(c => c.enabled);
    if (enabledCutsToGenerate.length === 0) {
      alert('有効なカットがありません。');
      return;
    }

    setIsGenerating(true);
    setError(null);

    // 全カットを生成中状態にマーク
    setCuts(prev => prev.map(c =>
      enabledCutsToGenerate.some(ec => ec.id === c.id)
        ? { ...c, isGenerating: true, errorMessage: undefined }
        : c
    ));

    try {
      const humanDataUrl = await fileToDataUrl(humanFile);
      const subCharDataUrl = subCharFile ? await fileToDataUrl(subCharFile) : null;
      const combinedBase = [stillImageStyle, stagePrompt].filter(Boolean).join(', ');
      const mainDetailPrompt = getMainCharDetailPrompt();
      const subDetailPrompt = getSubCharDetailPrompt();

      // 全カットを同時に生成
      const generatePromises = enabledCutsToGenerate.map(async (cut) => {
        try {
          // プロンプトから[POSITIVE]と[NEGATIVE]セクションを抽出
          const cutPrompt = cut.prompt || '';
          const positiveMatch = cutPrompt.match(/\[POSITIVE\]([\s\S]*?)\[\/POSITIVE\]/i);
          const negativeMatch = cutPrompt.match(/\[NEGATIVE\]([\s\S]*?)\[\/NEGATIVE\]/i);

          let positivePrompt = positiveMatch ? positiveMatch[1].trim() : cutPrompt;
          let negativePrompt = negativeMatch ? negativeMatch[1].trim() : '';

          // カメラ設定を追加
          if (cut.camera) {
            positivePrompt = `[${cut.camera}], ${positivePrompt}`;
          }

          // メインキャラクターのプロンプトと詳細を追加
          const mainPromptParts = [mainCharPrompt, mainCustomPrompt, mainDetailPrompt].filter(Boolean).join(', ');
          if (mainPromptParts) {
            positivePrompt = `${mainPromptParts}, ${positivePrompt}`;
          }
          if (combinedBase) {
            positivePrompt = `${combinedBase}, ${positivePrompt}`;
          }

          // ネガティブプロンプトを統合
          if (stillImageNegative) {
            negativePrompt = negativePrompt ? `${negativePrompt}, ${stillImageNegative}` : stillImageNegative;
          }

          // IPキャラクターの処理
          const useSubChar = cut.showSub && subCharDataUrl && subCharPrompt;
          const ipDescription = [cut.ipPrompt || subCharPrompt || '', subDetailPrompt].filter(Boolean).join(', ');
          if (useSubChar && ipDescription) {
            positivePrompt += `, [companion character: ${ipDescription}]`;
          }

          // 最終プロンプトを[POSITIVE][NEGATIVE]形式で構築
          const finalPrompt = `[POSITIVE]\n${positivePrompt}\n[/POSITIVE]\n[NEGATIVE]\n${negativePrompt || '[blurry], [low quality], [bad anatomy]'}\n[/NEGATIVE]`;

          const result = await generatePose({
            humanImageUrl: humanDataUrl,
            pose: finalPrompt,
            resolution: '1K',
            format: 'jpeg',
            subCharacterImageUrl: useSubChar ? subCharDataUrl : undefined,
            subCharacterPrompt: useSubChar ? ipDescription : undefined,
          });

          // 成功時に即座に状態を更新
          setCuts(prev => prev.map(c => c.id === cut.id ? {
            ...c,
            isGenerating: false,
            generatedImageUrl: result.imageUrl
          } : c));

          return { id: cut.id, success: true };
        } catch (err) {
          const errMessage = err instanceof Error ? err.message : '生成失敗';
          console.error(`Cut ${cut.id} generation error:`, err);
          setCuts(prev => prev.map(c => c.id === cut.id ? {
            ...c,
            isGenerating: false,
            errorMessage: errMessage
          } : c));
          return { id: cut.id, success: false, error: errMessage };
        }
      });

      // 全ての生成を待機
      const results = await Promise.all(generatePromises);
      const successCount = results.filter(r => r.success).length;
      console.log(`[ImageGeneration] Completed: ${successCount}/${enabledCutsToGenerate.length} images generated`);

    } catch (err) {
      console.error('Batch generation error:', err);
      setError(err instanceof Error ? err.message : '画像生成中にエラーが発生しました');
    } finally {
      setIsGenerating(false);
    }
  };

  // キャラクター設定パネル外側クリック検知状態
  const [charPanelOpen, setCharPanelOpen] = useState(false);
  const [characterConfirmed, setCharacterConfirmed] = useState(false);
  const [pendingRegenerate, setPendingRegenerate] = useState(false);
  const charPanelRef = useRef<HTMLDivElement>(null);

  // キャラクター詳細ブロック（DETAIL_PRESETSはhooksからインポート）
  interface CharacterDetailBlock {
    id: string;
    label: string;
    value: string;
  }
  const [mainCharDetails, setMainCharDetails] = useState<CharacterDetailBlock[]>([]);
  const [subCharDetails, setSubCharDetails] = useState<CharacterDetailBlock[]>([]);
  const [customFieldInput, setCustomFieldInput] = useState('');
  const [customFieldInputSub, setCustomFieldInputSub] = useState('');

  // キャラクタープリセット
  interface CharacterPreset {
    id: string;
    name: string;
    mainCharPrompt: string;
    mainCharDetails: CharacterDetailBlock[];
    subCharDetails: CharacterDetailBlock[];
    customSubPrompt: string;
    activeSubTags: string[];
    mainCustomInstructions?: CustomInstructionBlock[];
    subCustomInstructions?: CustomInstructionBlock[];
  }
  const [characterPresets, setCharacterPresets] = useState<CharacterPreset[]>(() => {
    const saved = localStorage.getItem('snafty_character_presets');
    return saved ? JSON.parse(saved) : [];
  });
  const [presetNameInput, setPresetNameInput] = useState('');
  const [showPresetSaveModal, setShowPresetSaveModal] = useState(false);

  // プリセット保存
  const saveCharacterPreset = () => {
    if (!presetNameInput.trim()) {
      alert('プリセット名を入力してください');
      return;
    }
    const newPreset: CharacterPreset = {
      id: `preset-${Date.now()}`,
      name: presetNameInput.trim(),
      mainCharPrompt,
      mainCharDetails: mainCharDetails.map(d => ({ ...d })),
      subCharDetails: subCharDetails.map(d => ({ ...d })),
      customSubPrompt,
      activeSubTags: Array.from(activeSubTags),
      mainCustomInstructions: mainCustomInstructions.map(i => ({ ...i })),
      subCustomInstructions: subCustomInstructions.map(i => ({ ...i })),
    };
    const updated = [...characterPresets, newPreset];
    setCharacterPresets(updated);
    localStorage.setItem('snafty_character_presets', JSON.stringify(updated));
    setPresetNameInput('');
    setShowPresetSaveModal(false);
    alert(`プリセット「${newPreset.name}」を保存しました`);
  };

  // プリセット読み込み
  const loadCharacterPreset = (preset: CharacterPreset) => {
    setMainCharPrompt(preset.mainCharPrompt);
    setMainCharDetails(preset.mainCharDetails.map(d => ({ ...d, id: `detail-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` })));
    setSubCharDetails(preset.subCharDetails.map(d => ({ ...d, id: `detail-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` })));
    setCustomSubPrompt(preset.customSubPrompt);
    setActiveSubTags(new Set(preset.activeSubTags));
    // カスタム指示も読み込み
    if (preset.mainCustomInstructions) {
      setMainCustomInstructions(preset.mainCustomInstructions.map(i => ({ ...i, id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` })));
    }
    if (preset.subCustomInstructions) {
      setSubCustomInstructions(preset.subCustomInstructions.map(i => ({ ...i, id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` })));
    }
  };

  // プリセット削除
  const deleteCharacterPreset = (presetId: string) => {
    const updated = characterPresets.filter(p => p.id !== presetId);
    setCharacterPresets(updated);
    localStorage.setItem('snafty_character_presets', JSON.stringify(updated));
  };

  const addCharacterDetail = (isMain: boolean, label: string) => {
    const newBlock: CharacterDetailBlock = {
      id: `detail-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      label,
      value: '',
    };
    if (isMain) {
      setMainCharDetails(prev => [...prev, newBlock]);
    } else {
      setSubCharDetails(prev => [...prev, newBlock]);
    }
  };

  const updateCharacterDetail = (isMain: boolean, id: string, value: string) => {
    if (isMain) {
      setMainCharDetails(prev => prev.map(d => d.id === id ? { ...d, value } : d));
    } else {
      setSubCharDetails(prev => prev.map(d => d.id === id ? { ...d, value } : d));
    }
  };

  const removeCharacterDetail = (isMain: boolean, id: string) => {
    if (isMain) {
      setMainCharDetails(prev => prev.filter(d => d.id !== id));
    } else {
      setSubCharDetails(prev => prev.filter(d => d.id !== id));
    }
  };

  // 詳細ブロックからプロンプトを生成（画像生成時に使用）
  const getMainCharDetailPrompt = (): string => {
    return mainCharDetails.filter(d => d.value.trim()).map(d => `${d.label}: ${d.value}`).join(', ');
  };
  const getSubCharDetailPrompt = (): string => {
    return subCharDetails.filter(d => d.value.trim()).map(d => `${d.label}: ${d.value}`).join(', ');
  };

  // プロンプト生成中フラグ
  const [isGeneratingMainPrompt, setIsGeneratingMainPrompt] = useState(false);
  const [isGeneratingIpPrompt, setIsGeneratingIpPrompt] = useState(false);

  // メインキャラクターのプロンプト生成
  const generateMainCharPrompt = async () => {
    setIsGeneratingMainPrompt(true);
    try {
      const details = mainCharDetails.filter(d => d.value.trim()).map(d => `${d.label}: ${d.value}`);
      const instructions = mainCustomInstructions.filter(i => i.active).map(i => i.label);
      const photoLocks = MAIN_PHOTO_LOCK_PRESETS.filter(p => activeMainPhotoLocks.has(p.id)).map(p => p.label);

      const inputContext = [
        details.length > 0 ? `詳細設定: ${details.join(', ')}` : '',
        instructions.length > 0 ? `カスタム指示: ${instructions.join(', ')}` : '',
        photoLocks.length > 0 ? `写真固定: ${photoLocks.join(', ')}` : '',
      ].filter(Boolean).join('\n');

      if (!inputContext) {
        alert('詳細設定やカスタム指示を入力してください');
        setIsGeneratingMainPrompt(false);
        return;
      }

      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: `以下のキャラクター設定から、画像生成AI用の英語プロンプトを生成してください。
ファッションモデルの撮影を想定し、服装、表情、ポーズ、雰囲気などを含めてください。

${inputContext}

出力形式: 英語プロンプトのみ（説明不要）
例: elegant woman with gentle smile, wearing casual white t-shirt and denim jeans, natural makeup, confident pose, soft lighting`
          }]
        })
      });

      const data = await response.json();
      const generatedPrompt = data.content?.[0]?.text || data.content || '';
      if (generatedPrompt) {
        setMainCharPrompt(generatedPrompt.trim());
      }
    } catch (error) {
      console.error('Prompt generation error:', error);
      alert('プロンプト生成に失敗しました');
    } finally {
      setIsGeneratingMainPrompt(false);
    }
  };

  // IPキャラクターのプロンプト生成
  const generateIpCharPrompt = async () => {
    setIsGeneratingIpPrompt(true);
    try {
      const details = subCharDetails.filter(d => d.value.trim()).map(d => `${d.label}: ${d.value}`);
      const presets = SUB_CHAR_PRESETS.filter(p => activeSubTags.has(p.id)).map(p => p.label);
      const instructions = subCustomInstructions.filter(i => i.active).map(i => i.label);
      const photoLocks = IP_PHOTO_LOCK_PRESETS.filter(p => activeIpPhotoLocks.has(p.id)).map(p => p.label);

      const inputContext = [
        presets.length > 0 ? `プリセット: ${presets.join(', ')}` : '',
        details.length > 0 ? `詳細設定: ${details.join(', ')}` : '',
        instructions.length > 0 ? `カスタム指示: ${instructions.join(', ')}` : '',
        photoLocks.length > 0 ? `写真固定: ${photoLocks.join(', ')}` : '',
      ].filter(Boolean).join('\n');

      if (!inputContext) {
        alert('プリセットや詳細設定を選択/入力してください');
        setIsGeneratingIpPrompt(false);
        return;
      }

      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: `以下のIPキャラクター（サブキャラクター）設定から、画像生成AI用の英語プロンプトを生成してください。
メインキャラクターと共演する小さなキャラクターを想定しています。

${inputContext}

出力形式: 英語プロンプトのみ（説明不要）
例: tiny cute mascot character, approximately 20cm tall, expressionless face, can interact with physical objects, invisible to main character`
          }]
        })
      });

      const data = await response.json();
      const generatedPrompt = data.content?.[0]?.text || data.content || '';
      if (generatedPrompt) {
        setCustomSubPrompt(generatedPrompt.trim());
      }
    } catch (error) {
      console.error('IP Prompt generation error:', error);
      alert('プロンプト生成に失敗しました');
    } finally {
      setIsGeneratingIpPrompt(false);
    }
  };

  // 履歴機能
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [projectHistory, setProjectHistory] = useState<ProjectHistoryEntry[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const historyPanelRef = useRef<HTMLDivElement>(null);
  const [historySearchQuery, setHistorySearchQuery] = useState('');

  // 検索でフィルタリングされた履歴
  const filteredHistory = historySearchQuery.trim()
    ? projectHistory.filter(entry =>
        entry.name.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
        entry.cuts.some(cut => cut.title.toLowerCase().includes(historySearchQuery.toLowerCase()))
      )
    : projectHistory;

  // プロジェクト予算
  const [projectBudget, setProjectBudget] = useState<ProjectBudget>(DEFAULT_BUDGET);

  // 生成時間の記録
  const [generationTimes, setGenerationTimes] = useState<GenerationTimes>({});

  // 画像拡大表示用
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);

  // 生成設定タブ（動画/静止画）
  const [generationSettingsTab, setGenerationSettingsTab] = useState<'video' | 'still'>('still');

  // Click outside to close character panel
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (charPanelRef.current && !charPanelRef.current.contains(e.target as Node)) {
        setCharPanelOpen(false);
      }
      if (stillPromptPanelRef.current && !stillPromptPanelRef.current.contains(e.target as Node)) {
        setStillPromptPanelOpen(false);
      }

      if (semanticPanelRef.current && !semanticPanelRef.current.contains(e.target as Node)) {
        setSemanticPanelOpen(false);
      }
      if (productPanelRef.current && !productPanelRef.current.contains(e.target as Node)) {
        setProductPanelOpen(false);
      }
      if (fixedPanelRef.current && !fixedPanelRef.current.contains(e.target as Node)) {
        setFixedPanelOpen(false);
      }
      if (historyPanelRef.current && !historyPanelRef.current.contains(e.target as Node)) {
        setHistoryPanelOpen(false);
      }
    };
    if (charPanelOpen || stillPromptPanelOpen || semanticPanelOpen || productPanelOpen || fixedPanelOpen || historyPanelOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [charPanelOpen, stillPromptPanelOpen, semanticPanelOpen, productPanelOpen, fixedPanelOpen, historyPanelOpen]);

  // VideoModal状態
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [storyboardModalOpen, setStoryboardModalOpen] = useState(false);

  // ライトボックスのESCキー処理
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && lightboxImage) {
        setLightboxImage(null);
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [lightboxImage]);

  // 履歴を読み込み
  useEffect(() => {
    setProjectHistory(getProjectHistory());
  }, []);

  // プロジェクトを保存
  const saveCurrentProject = () => {
    if (cuts.length === 0) {
      alert('保存するカットがありません');
      return;
    }
    const name = generateProjectName(cuts, extractedPdfText);
    const entry = saveToProjectHistory({
      name,
      cuts,
      stagePrompt,
      extractedPdfText,
      mainCharPrompt,
      subCharPrompt,
      aiModel,
      budget: projectBudget,
      generationTimes: generationTimes,
    });
    setCurrentProjectId(entry.id);
    setProjectHistory(getProjectHistory());
    alert(`「${name}」を保存しました`);
  };

  // プロジェクトを復元
  const loadProject = (entry: ProjectHistoryEntry) => {
    setCuts(entry.cuts);
    setStagePrompt(entry.stagePrompt);
    setExtractedPdfText(entry.extractedPdfText);
    setMainCharPrompt(entry.mainCharPrompt || '');
    setAiModel(entry.aiModel as AiModelType);
    setProjectBudget(entry.budget || DEFAULT_BUDGET);
    setGenerationTimes(entry.generationTimes || {});
    setCurrentProjectId(entry.id);
    setHistoryPanelOpen(false);
    setEditingCutId(null);
  };

  // プロジェクトを削除
  const deleteProject = (id: string) => {
    if (confirm('このプロジェクトを削除しますか？')) {
      removeFromProjectHistory(id);
      setProjectHistory(getProjectHistory());
      if (currentProjectId === id) {
        setCurrentProjectId(null);
      }
    }
  };

  // キャラクター変更後の再生成トリガー
  useEffect(() => {
    const runRegenerate = async () => {
      if (pendingRegenerate && characterConfirmed && humanFile && extractedPdfText) {
        setPendingRegenerate(false);
        setCharPanelOpen(false);
        try {
          setIsGenerating(true);
          await handleFullAutoGenerate(extractedPdfText);
        } finally {
          setIsGenerating(false);
        }
      }
    };
    runRegenerate();
  }, [pendingRegenerate, characterConfirmed, humanFile, extractedPdfText]);

  // タブタイトルアニメーション
  const originalTitle = useRef('ショート動画AI - 自動生成');
  const titleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isGenerating) {
      // 生成中: スピナーアニメーション
      const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
      let i = 0;
      titleIntervalRef.current = setInterval(() => {
        document.title = `${frames[i % frames.length]} 着画生成中... | 着てみるAI`;
        i++;
      }, 100);
    } else {
      if (titleIntervalRef.current) {
        clearInterval(titleIntervalRef.current);
        titleIntervalRef.current = null;
      }
      document.title = originalTitle.current;
    }

    return () => {
      if (titleIntervalRef.current) {
        clearInterval(titleIntervalRef.current);
      }
    };
  }, [isGenerating]);

  // 生成完了時: チェックマーク表示（5秒間）
  const prevResultsCount = useRef(results.length);
  useEffect(() => {
    if (results.length > prevResultsCount.current) {
      document.title = '✅ 着画生成完了！ | 着てみるAI';
      const timer = setTimeout(() => {
        document.title = originalTitle.current;
      }, 5000);
      prevResultsCount.current = results.length;
      return () => clearTimeout(timer);
    }
    prevResultsCount.current = results.length;
  }, [results.length]);



  // モデル画像選択（正面）
  const handleHumanSelect = useCallback(async (file: File) => {
    setHumanFile(file);
    const url = URL.createObjectURL(file);
    setHumanPreview(url);
  }, []);

  // サブキャラクター画像選択
  const handleSubCharSelect = useCallback(async (file: File) => {
    setSubCharFile(file);
    const url = URL.createObjectURL(file);
    setSubCharPreview(url);
  }, []);



  // ローディング中
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#050508] flex items-center justify-center">
        <div className="text-center animate-in">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#00BFA5] to-[#78909C] flex items-center justify-center text-4xl font-black mx-auto mb-6 animate-pulse-glow">
            K
          </div>
          <p className="text-[#78909C] text-sm">読み込み中...</p>
        </div>
      </div>
    );
  }

  // --- Auth Check ---
  if (!user) {
    return <AuthForm />;
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#0a0a0f] text-[#333333] dark:text-white transition-colors duration-300">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-[#00BFA5] opacity-[0.03] dark:opacity-[0.05] blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-[#00d4ff] opacity-[0.03] dark:opacity-[0.05] blur-[120px] rounded-full"></div>
      </div>

      {/* Header */}
      <header className="glass sticky top-0 z-40 border-b border-[#E0E0E0]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-600 via-fuchsia-500 to-pink-500 flex items-center justify-center shadow-lg shadow-violet-500/25">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-[#333333] dark:text-white tracking-tight">
                Snafty <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-500 to-fuchsia-500">Studio</span>
              </h1>
              <p className="text-[10px] text-[#78909C] dark:text-gray-500 -mt-0.5 tracking-widest font-medium">Short Movie AI Generator</p>
            </div>
            {/* API Status Indicators */}
            <div className="flex items-center gap-1.5 ml-2 px-2.5 py-1.5 bg-gray-50 dark:bg-white/5 rounded-lg border border-gray-200 dark:border-white/10">
              {([
                { key: 'openai', label: 'GPT' },
                { key: 'claude', label: 'Cld' },
              ] as const).map(({ key, label }) => (
                <div key={key} className="flex items-center gap-1" title={`${label}: ${apiStatuses[key] === 'ok' ? '稼働中' : apiStatuses[key] === 'error' ? 'エラー' : 'チェック中'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    apiStatuses[key] === 'ok' ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' :
                    apiStatuses[key] === 'error' ? 'bg-red-500 shadow-sm shadow-red-500/50' :
                    'bg-gray-400 animate-pulse'
                  }`} />
                  <span className={`text-[8px] font-bold ${
                    apiStatuses[key] === 'ok' ? 'text-emerald-600 dark:text-emerald-400' :
                    apiStatuses[key] === 'error' ? 'text-red-500 dark:text-red-400' :
                    'text-gray-400'
                  }`}>{label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">

            {/* AI Model Selector - Global */}
            <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-white/5 rounded-xl px-2 py-1.5 border border-gray-200 dark:border-white/10">
              <Sparkles size={12} className="text-purple-500" />
              <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 mr-1">AI:</span>
              {(['openai', 'claude'] as const).map((provider) => {
                // 現在選択中のモデルがこのプロバイダーのものか確認
                const currentModelProvider = availableAiModels.find(m => m.id === selectedModelId)?.provider;
                const isSelected = currentModelProvider === provider;
                // このプロバイダーのデフォルトモデル
                const defaultModelId = provider === 'openai' ? 'gpt-4o' : 'claude-3-5-sonnet';
                // 現在選択中のモデル名（このプロバイダーの場合）
                const currentModelName = isSelected
                  ? availableAiModels.find(m => m.id === selectedModelId)?.name || (provider === 'openai' ? 'GPT-4o' : 'Claude')
                  : (provider === 'openai' ? 'GPT-4o' : 'Claude');

                return (
                  <button
                    key={provider}
                    onClick={() => handleModelIdChange(defaultModelId)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                      isSelected
                        ? apiStatuses[provider] === 'error'
                          ? 'bg-red-500 text-white shadow-sm shadow-red-500/30'
                          : provider === 'openai'
                          ? 'bg-green-500 text-white shadow-sm shadow-green-500/30'
                          : 'bg-orange-500 text-white shadow-sm shadow-orange-500/30'
                        : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10'
                    }`}
                  >
                    {currentModelName}
                  </button>
                );
              })}
            </div>

            {/* Camera Settings Button */}
            <div className="relative" ref={cameraPanelRef}>
              <button
                onClick={() => setCameraPanelOpen(!cameraPanelOpen)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all shadow-sm ${
                  cameraPanelOpen
                    ? 'bg-cyan-500/10 dark:bg-cyan-500/20 border-cyan-500/30 text-cyan-600 dark:text-cyan-300'
                    : 'bg-[#FAFAFA] dark:bg-[#1a1a24] border-[#E0E0E0] dark:border-white/10 text-[#78909C] hover:text-[#333333] dark:hover:text-white hover:bg-[#F5F5F5] dark:hover:bg-[#2a2a36]'
                }`}
              >
                <Camera size={16} />
                <span className="hidden sm:inline">撮影設定</span>
                <ChevronDown size={12} className={`transition-transform duration-200 ${cameraPanelOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Camera Settings Panel */}
              {cameraPanelOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-[#16161e] border border-[#E0E0E0] dark:border-white/10 rounded-2xl shadow-2xl dark:shadow-cyan-500/5 p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1 h-4 rounded-full bg-gradient-to-b from-cyan-400 to-blue-500"></div>
                    <h3 className="text-xs font-bold text-[#333] dark:text-gray-200 uppercase tracking-wider">撮影設定</h3>
                  </div>

                  <div className="space-y-4">
                    {/* カメラタイプ */}
                    <div>
                      <label className="text-[10px] font-semibold text-[#78909C] dark:text-gray-400 uppercase tracking-wider mb-1.5 block flex items-center gap-1">
                        <Camera size={11} />
                        カメラタイプ
                      </label>
                      <select
                        value={cameraType}
                        onChange={(e) => setCameraType(e.target.value)}
                        className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-2 text-xs text-[#333] dark:text-gray-300 focus:outline-none focus:border-cyan-500/50"
                      >
                        <option value="cinematic">シネマティック</option>
                        <option value="documentary">ドキュメンタリー</option>
                        <option value="fashion">ファッション</option>
                        <option value="portrait">ポートレート</option>
                        <option value="commercial">コマーシャル</option>
                      </select>
                    </div>

                    {/* レンズ */}
                    <div>
                      <label className="text-[10px] font-semibold text-[#78909C] dark:text-gray-400 uppercase tracking-wider mb-1.5 block flex items-center gap-1">
                        <Aperture size={11} />
                        レンズ
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {['24mm', '35mm', '50mm', '85mm', '135mm'].map(lens => (
                          <button
                            key={lens}
                            onClick={() => setLensType(lens)}
                            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                              lensType === lens
                                ? 'bg-cyan-500 text-white shadow-sm'
                                : 'bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-[#78909C] hover:text-[#333] dark:hover:text-white'
                            }`}
                          >
                            {lens}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 被写界深度（ボケ） */}
                    <div>
                      <label className="text-[10px] font-semibold text-[#78909C] dark:text-gray-400 uppercase tracking-wider mb-1.5 block flex items-center gap-1">
                        <Focus size={11} />
                        被写界深度（ボケ）
                      </label>
                      <div className="flex gap-1.5">
                        {[
                          { value: 'shallow', label: '浅い', desc: 'f/1.4 - 強ボケ' },
                          { value: 'medium', label: '中', desc: 'f/2.8' },
                          { value: 'deep', label: '深い', desc: 'f/8 - 全体鮮明' },
                        ].map(dof => (
                          <button
                            key={dof.value}
                            onClick={() => setDepthOfField(dof.value)}
                            className={`flex-1 px-2 py-2 rounded-lg text-center transition-all ${
                              depthOfField === dof.value
                                ? 'bg-cyan-500 text-white shadow-sm'
                                : 'bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-[#78909C] hover:text-[#333] dark:hover:text-white'
                            }`}
                          >
                            <div className="text-[10px] font-bold">{dof.label}</div>
                            <div className="text-[8px] opacity-70">{dof.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 画質 */}
                    <div>
                      <label className="text-[10px] font-semibold text-[#78909C] dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                        画質
                      </label>
                      <select
                        value={imageQuality}
                        onChange={(e) => setImageQuality(e.target.value)}
                        className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-2 text-xs text-[#333] dark:text-gray-300 focus:outline-none focus:border-cyan-500/50"
                      >
                        <option value="ultra">Ultra (8K) - 最高品質</option>
                        <option value="high">High (4K) - 高品質</option>
                        <option value="standard">Standard (HD)</option>
                      </select>
                    </div>

                    {/* カラーグレード */}
                    <div>
                      <label className="text-[10px] font-semibold text-[#78909C] dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                        カラーグレード
                      </label>
                      <select
                        value={colorGrade}
                        onChange={(e) => setColorGrade(e.target.value)}
                        className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-2 text-xs text-[#333] dark:text-gray-300 focus:outline-none focus:border-cyan-500/50"
                      >
                        <option value="natural">ナチュラル</option>
                        <option value="cinematic">シネマティック</option>
                        <option value="vintage">ヴィンテージ</option>
                        <option value="highContrast">ハイコントラスト</option>
                        <option value="softPastel">ソフトパステル</option>
                        <option value="moody">ムーディー</option>
                      </select>
                    </div>

                    {/* 現在の設定サマリー */}
                    <div className="pt-3 border-t border-gray-200 dark:border-white/10">
                      <div className="text-[9px] text-[#78909C] dark:text-gray-500 space-y-0.5 bg-gray-50 dark:bg-white/5 rounded-lg p-2">
                        <p>📷 {cameraType} / {lensType}</p>
                        <p>🎨 {colorGrade} / {imageQuality}</p>
                        <p>✨ ボケ: {depthOfField === 'shallow' ? '強' : depthOfField === 'medium' ? '中' : '弱'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Character Settings Button */}
              <div className="relative" ref={charPanelRef}>
                <button
                  onClick={() => setCharPanelOpen(!charPanelOpen)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all shadow-sm ${
                    charPanelOpen
                      ? 'bg-purple-500/10 dark:bg-purple-500/20 border-purple-500/30 text-purple-600 dark:text-purple-300'
                      : 'bg-[#FAFAFA] dark:bg-[#1a1a24] border-[#E0E0E0] dark:border-white/10 text-[#78909C] hover:text-[#333333] dark:hover:text-white hover:bg-[#F5F5F5] dark:hover:bg-[#2a2a36]'
                  }`}
                >
                  <UserCircle size={16} />
                  <span className="hidden sm:inline">キャラクター</span>
                  {/* Status dots */}
                  <div className="flex gap-1">
                    <div className={`w-2 h-2 rounded-full ${humanFile ? 'bg-cyan-400' : 'bg-gray-300 dark:bg-gray-600'}`} />
                    <div className={`w-2 h-2 rounded-full ${subCharFile ? 'bg-purple-400' : 'bg-gray-300 dark:bg-gray-600'}`} />
                  </div>
                  <ChevronDown size={12} className={`transition-transform duration-200 ${charPanelOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Character Panel Dropdown */}
                {charPanelOpen && (
                  <div className="absolute right-0 top-full mt-2 w-[520px] bg-white dark:bg-[#16161e] border border-[#E0E0E0] dark:border-white/10 rounded-2xl shadow-2xl dark:shadow-purple-500/5 p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-4 rounded-full bg-gradient-to-b from-cyan-400 to-purple-500"></div>
                        <h3 className="text-xs font-bold text-[#333] dark:text-gray-200 uppercase tracking-wider">キャラクター設定</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* プリセット読み込みドロップダウン */}
                        {characterPresets.length > 0 && (
                          <div className="relative group">
                            <button className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors">
                              <FolderOpen size={10} />
                              読込
                              <ChevronDown size={10} />
                            </button>
                            <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-[#1a1a24] border border-gray-200 dark:border-white/10 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                              {characterPresets.map((preset) => (
                                <div key={preset.id} className="flex items-center justify-between px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-white/5 first:rounded-t-lg last:rounded-b-lg">
                                  <button
                                    onClick={() => loadCharacterPreset(preset)}
                                    className="flex-1 text-left text-[10px] text-[#333] dark:text-gray-300 truncate"
                                  >
                                    {preset.name}
                                  </button>
                                  <button
                                    onClick={() => deleteCharacterPreset(preset.id)}
                                    className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* プリセット保存ボタン */}
                        <button
                          onClick={() => setShowPresetSaveModal(true)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                        >
                          <Save size={10} />
                          保存
                        </button>
                      </div>
                    </div>

                    {/* プリセット保存モーダル */}
                    {showPresetSaveModal && (
                      <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg">
                        <label className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 block mb-1">プリセット名</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={presetNameInput}
                            onChange={(e) => setPresetNameInput(e.target.value)}
                            placeholder="例: カジュアルスタイル"
                            className="flex-1 bg-white dark:bg-white/10 border border-emerald-300 dark:border-emerald-500/30 rounded px-2 py-1 text-[10px] text-[#333] dark:text-gray-300 focus:outline-none"
                            onKeyDown={(e) => e.key === 'Enter' && saveCharacterPreset()}
                          />
                          <button
                            onClick={saveCharacterPreset}
                            className="px-3 py-1 bg-emerald-500 text-white rounded text-[9px] font-bold hover:bg-emerald-600 transition-colors"
                          >
                            保存
                          </button>
                          <button
                            onClick={() => setShowPresetSaveModal(false)}
                            className="px-2 py-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex flex-col gap-6">
                      {/* Main Character Row */}
                      <div className="border-b border-[#E0E0E0] dark:border-white/10 pb-4">
                        <div className="flex gap-4 items-end">
                          <div className="w-[140px] shrink-0">
                            <ImageUploader
                              label="メインモデル"
                              icon={<User size={16} />}
                              previewUrl={humanPreview}
                              onFileSelect={handleHumanSelect}
                              onClear={() => { setHumanFile(null); setHumanPreview(null); }}
                              accentColor="#00d4ff"
                              hint="正面の全身画像"
                              compact
                            />
                          </div>
                          <div className="flex-1 space-y-2">
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <label className="text-[10px] font-bold text-[#78909C] dark:text-gray-400 uppercase tracking-wider">カスタム指示</label>
                                <div className="flex items-center gap-1">
                                  {!showPresetInput ? (
                                    <button
                                      onClick={() => setShowPresetInput(true)}
                                      disabled={mainCustomInstructions.length === 0 && subCustomInstructions.length === 0}
                                      className="flex items-center gap-0.5 px-1.5 py-0.5 text-[8px] font-bold text-violet-500 hover:text-violet-600 border border-violet-200 dark:border-violet-500/20 rounded hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                      title="現在のカスタム指示をプリセットとして保存"
                                    >
                                      <Save size={9} />
                                      保存
                                    </button>
                                  ) : (
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="text"
                                        value={presetName}
                                        onChange={(e) => setPresetName(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && saveInstructionPreset()}
                                        placeholder="プリセット名"
                                        className="w-24 bg-white dark:bg-white/10 border border-violet-200 dark:border-violet-500/20 rounded px-1.5 py-0.5 text-[9px] text-[#333] dark:text-gray-300 focus:outline-none"
                                        autoFocus
                                      />
                                      <button onClick={saveInstructionPreset} disabled={!presetName.trim()} className="p-0.5 bg-violet-500 text-white rounded hover:bg-violet-600 disabled:bg-gray-300 transition-colors"><Plus size={9} /></button>
                                      <button onClick={() => { setShowPresetInput(false); setPresetName(''); }} className="p-0.5 text-gray-400 hover:text-gray-600 transition-colors"><X size={9} /></button>
                                    </div>
                                  )}
                                </div>
                              </div>
                              {/* プリセット一覧 */}
                              {instructionPresets.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-2">
                                  {instructionPresets.map((preset, idx) => (
                                    <div
                                      key={idx}
                                      className="group flex items-center gap-1 px-2 py-0.5 rounded-md text-[8px] font-bold border border-violet-200 dark:border-violet-500/20 bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-300 cursor-pointer hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-colors"
                                      onClick={() => loadInstructionPreset(preset)}
                                      title={`メイン: ${preset.mainInstructions.length}件 / サブ: ${preset.subInstructions.length}件\n保存: ${new Date(preset.savedAt).toLocaleDateString('ja-JP')}`}
                                    >
                                      <FolderOpen size={9} />
                                      {preset.name}
                                      <button
                                        onClick={(e) => { e.stopPropagation(); deleteInstructionPreset(idx); }}
                                        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                                      >
                                        <X size={8} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {/* 写真固定オプション（メインモデル） */}
                              <div className="mb-3">
                                <label className="text-[9px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1.5 block flex items-center gap-1">
                                  🔒 写真の特徴を固定
                                </label>
                                <div className="flex flex-wrap gap-1">
                                  {MAIN_PHOTO_LOCK_PRESETS.map((preset) => (
                                    <button
                                      key={preset.id}
                                      onClick={() => {
                                        setActiveMainPhotoLocks(prev => {
                                          const next = new Set(prev);
                                          if (next.has(preset.id)) {
                                            next.delete(preset.id);
                                          } else {
                                            // 「全て固定」選択時は他を解除、他選択時は「全て固定」を解除
                                            if (preset.id === 'all_lock') {
                                              next.clear();
                                              next.add('all_lock');
                                            } else {
                                              next.delete('all_lock');
                                              next.add(preset.id);
                                            }
                                          }
                                          return next;
                                        });
                                      }}
                                      className={`px-2 py-1 rounded-lg text-[9px] font-bold border transition-all ${
                                        activeMainPhotoLocks.has(preset.id)
                                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-600 dark:text-amber-400'
                                          : 'bg-transparent border-gray-200 dark:border-white/10 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                                      }`}
                                    >
                                      {preset.label}
                                    </button>
                                  ))}
                                </div>
                                {activeMainPhotoLocks.size > 0 && (
                                  <p className="text-[8px] text-amber-500/70 mt-1">
                                    ✓ 選択した特徴は生成時に元画像から維持されます
                                  </p>
                                )}
                              </div>

                              {/* カスタム指示ブロック */}
                              <div className="flex flex-wrap gap-1.5 mb-2">
                                {mainCustomInstructions.map((instruction) => (
                                  <div
                                    key={instruction.id}
                                    className={`group relative flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold border transition-all duration-150 cursor-pointer ${
                                      instruction.active
                                        ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-600 dark:text-cyan-300'
                                        : 'bg-transparent border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-600'
                                    }`}
                                    onClick={() => toggleCustomInstruction(true, instruction.id)}
                                  >
                                    {instruction.label}
                                    <button
                                      onClick={(e) => { e.stopPropagation(); removeCustomInstruction(true, instruction.id); }}
                                      className="opacity-0 group-hover:opacity-100 ml-0.5 text-gray-400 hover:text-red-500 transition-all"
                                    >
                                      <X size={10} />
                                    </button>
                                  </div>
                                ))}
                                {/* 追加ボタン */}
                                {!showMainInstructionInput ? (
                                  <button
                                    onClick={() => setShowMainInstructionInput(true)}
                                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-medium border border-dashed border-cyan-300 dark:border-cyan-500/30 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-500/10 transition-colors"
                                  >
                                    <Plus size={10} />
                                    カスタム指示を追加
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-1 p-1 bg-cyan-50 dark:bg-cyan-500/10 rounded-lg border border-cyan-200 dark:border-cyan-500/30">
                                    <input
                                      type="text"
                                      value={newMainInstruction.label}
                                      onChange={(e) => setNewMainInstruction(prev => ({ ...prev, label: e.target.value }))}
                                      placeholder="ラベル名"
                                      className="w-20 bg-white dark:bg-white/10 border border-cyan-200 dark:border-cyan-500/20 rounded px-1.5 py-0.5 text-[9px] text-[#333] dark:text-gray-300 focus:outline-none"
                                      onKeyDown={(e) => e.key === 'Enter' && addCustomInstruction(true)}
                                      autoFocus
                                    />
                                    <input
                                      type="text"
                                      value={newMainInstruction.prompt}
                                      onChange={(e) => setNewMainInstruction(prev => ({ ...prev, prompt: e.target.value }))}
                                      placeholder="英語プロンプト（任意）"
                                      className="w-32 bg-white dark:bg-white/10 border border-cyan-200 dark:border-cyan-500/20 rounded px-1.5 py-0.5 text-[9px] text-[#333] dark:text-gray-300 focus:outline-none"
                                      onKeyDown={(e) => e.key === 'Enter' && addCustomInstruction(true)}
                                    />
                                    <button
                                      onClick={() => addCustomInstruction(true)}
                                      disabled={!newMainInstruction.label.trim()}
                                      className="p-1 bg-cyan-500 text-white rounded hover:bg-cyan-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                    >
                                      <Plus size={10} />
                                    </button>
                                    <button
                                      onClick={() => { setShowMainInstructionInput(false); setNewMainInstruction({ label: '', prompt: '' }); }}
                                      className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                                    >
                                      <X size={10} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <label className="text-[10px] font-bold text-[#78909C] dark:text-gray-400 uppercase tracking-wider">感情・基本挙動プロンプト</label>
                                <button
                                  onClick={generateMainCharPrompt}
                                  disabled={isGeneratingMainPrompt}
                                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold transition-all ${
                                    isGeneratingMainPrompt
                                      ? 'bg-cyan-200 dark:bg-cyan-500/20 text-cyan-600 cursor-wait'
                                      : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/20'
                                  }`}
                                >
                                  {isGeneratingMainPrompt ? (
                                    <>
                                      <Loader2 size={10} className="animate-spin" />
                                      生成中...
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles size={10} />
                                      プロンプト生成
                                    </>
                                  )}
                                </button>
                              </div>
                              <textarea
                                value={mainCharPrompt}
                                onChange={(e) => setMainCharPrompt(e.target.value)}
                                placeholder="感情、追加の容姿、服装などを入力..."
                                rows={2}
                                className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-2 text-xs text-[#333] dark:text-gray-300 focus:outline-none focus:border-cyan-500/50 placeholder:text-gray-400 dark:placeholder:text-gray-600 resize-none"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Main Character Detail Blocks */}
                        {mainCharDetails.length > 0 && (
                          <div className="mt-3 ml-[156px] space-y-2">
                            {mainCharDetails.map((detail) => (
                              <div key={detail.id} className="flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                <span className="text-[9px] font-bold text-cyan-600 dark:text-cyan-400 w-16 shrink-0">{detail.label}</span>
                                <input
                                  type="text"
                                  value={detail.value}
                                  onChange={(e) => updateCharacterDetail(true, detail.id, e.target.value)}
                                  placeholder={DETAIL_PRESETS.find(p => p.label === detail.label)?.placeholder || '詳細を入力...'}
                                  className="flex-1 bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/20 rounded-lg px-2 py-1.5 text-[10px] text-[#333] dark:text-gray-300 focus:outline-none focus:border-cyan-500/50 placeholder:text-gray-400 dark:placeholder:text-gray-600"
                                />
                                <button
                                  onClick={() => removeCharacterDetail(true, detail.id)}
                                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add Detail Button for Main Character */}
                        <div className="mt-3 ml-[156px]">
                          <div className="flex flex-wrap gap-1 mb-2">
                            {DETAIL_PRESETS.filter(p => !mainCharDetails.some(d => d.label === p.label)).map((preset) => (
                              <button
                                key={preset.label}
                                onClick={() => addCharacterDetail(true, preset.label)}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-medium border border-dashed border-cyan-300 dark:border-cyan-500/30 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-500/10 transition-colors"
                              >
                                <Plus size={10} />
                                {preset.label}
                              </button>
                            ))}
                          </div>
                          {/* カスタムフィールド追加 */}
                          <div className="flex gap-1 items-center">
                            <input
                              type="text"
                              value={customFieldInput}
                              onChange={(e) => setCustomFieldInput(e.target.value)}
                              placeholder="カスタム項目名..."
                              className="flex-1 bg-white dark:bg-white/5 border border-cyan-200 dark:border-cyan-500/20 rounded px-2 py-1 text-[9px] text-[#333] dark:text-gray-300 focus:outline-none focus:border-cyan-500/50 placeholder:text-gray-400"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && customFieldInput.trim()) {
                                  addCharacterDetail(true, customFieldInput.trim());
                                  setCustomFieldInput('');
                                }
                              }}
                            />
                            <button
                              onClick={() => {
                                if (customFieldInput.trim()) {
                                  addCharacterDetail(true, customFieldInput.trim());
                                  setCustomFieldInput('');
                                }
                              }}
                              disabled={!customFieldInput.trim()}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold transition-all ${
                                customFieldInput.trim()
                                  ? 'bg-cyan-500 text-white hover:bg-cyan-600'
                                  : 'bg-gray-100 dark:bg-white/5 text-gray-400 cursor-not-allowed'
                              }`}
                            >
                              <Plus size={10} />
                              追加
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Sub Character Row */}
                      <div className="border-b border-[#E0E0E0] dark:border-white/10 pb-4">
                        <div className="flex gap-4 items-end">
                          <div className="w-[140px] shrink-0">
                            <ImageUploader
                              label="IP"
                              icon={<Users size={16} />}
                              previewUrl={subCharPreview}
                              onFileSelect={handleSubCharSelect}
                              onClear={() => { setSubCharFile(null); setSubCharPreview(null); }}
                              accentColor="#a855f7"
                              hint="共演IP（任意）"
                              compact
                            />
                          </div>
                          <div className="flex-1 space-y-2">
                            <div className={!subCharFile ? "opacity-50 pointer-events-none" : ""}>
                              <label className="text-[10px] font-bold text-[#78909C] dark:text-gray-400 uppercase tracking-wider mb-1.5 block">感情・IPプロンプト</label>

                              {/* Preset tags */}
                              <div className="flex flex-wrap gap-1.5 mb-2">
                                {SUB_CHAR_PRESETS.map((tag) => (
                                  <button
                                    key={tag.id}
                                    onClick={() => setActiveSubTags(prev => {
                                      const next = new Set(prev);
                                      next.has(tag.id) ? next.delete(tag.id) : next.add(tag.id);
                                      return next;
                                    })}
                                    className={`px-2 py-1 rounded-lg text-[9px] font-bold border transition-all duration-150 ${
                                      activeSubTags.has(tag.id)
                                        ? 'bg-purple-500/15 border-purple-500/40 text-purple-500 dark:text-purple-300'
                                        : 'bg-transparent border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400'
                                    }`}
                                  >
                                    {tag.label}
                                  </button>
                                ))}
                                {/* 写真固定オプション（IP/サブキャラ） */}
                                <div className="w-full mb-2 pt-2 border-t border-gray-200 dark:border-white/10">
                                  <label className="text-[9px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1.5 block flex items-center gap-1">
                                    🔒 IP写真の特徴を固定
                                  </label>
                                  <div className="flex flex-wrap gap-1">
                                    {IP_PHOTO_LOCK_PRESETS.map((preset) => (
                                      <button
                                        key={preset.id}
                                        onClick={() => {
                                          setActiveIpPhotoLocks(prev => {
                                            const next = new Set(prev);
                                            if (next.has(preset.id)) {
                                              next.delete(preset.id);
                                            } else {
                                              if (preset.id === 'ip_all_lock') {
                                                next.clear();
                                                next.add('ip_all_lock');
                                              } else {
                                                next.delete('ip_all_lock');
                                                next.add(preset.id);
                                              }
                                            }
                                            return next;
                                          });
                                        }}
                                        className={`px-2 py-1 rounded-lg text-[9px] font-bold border transition-all ${
                                          activeIpPhotoLocks.has(preset.id)
                                            ? 'bg-amber-500/20 border-amber-500/50 text-amber-600 dark:text-amber-400'
                                            : 'bg-transparent border-gray-200 dark:border-white/10 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                                        }`}
                                      >
                                        {preset.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                {/* カスタム指示ブロック（サブキャラ） */}
                                {subCustomInstructions.map((instruction) => (
                                  <div
                                    key={instruction.id}
                                    className={`group relative flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold border transition-all duration-150 cursor-pointer ${
                                      instruction.active
                                        ? 'bg-purple-500/15 border-purple-500/40 text-purple-500 dark:text-purple-300'
                                        : 'bg-transparent border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-600'
                                    }`}
                                    onClick={() => toggleCustomInstruction(false, instruction.id)}
                                  >
                                    {instruction.label}
                                    <button
                                      onClick={(e) => { e.stopPropagation(); removeCustomInstruction(false, instruction.id); }}
                                      className="opacity-0 group-hover:opacity-100 ml-0.5 text-gray-400 hover:text-red-500 transition-all"
                                    >
                                      <X size={10} />
                                    </button>
                                  </div>
                                ))}
                                {/* 追加ボタン */}
                                {!showSubInstructionInput ? (
                                  <button
                                    onClick={() => setShowSubInstructionInput(true)}
                                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-medium border border-dashed border-purple-300 dark:border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors"
                                  >
                                    <Plus size={10} />
                                    カスタム指示を追加
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-1 p-1 bg-purple-50 dark:bg-purple-500/10 rounded-lg border border-purple-200 dark:border-purple-500/30">
                                    <input
                                      type="text"
                                      value={newSubInstruction.label}
                                      onChange={(e) => setNewSubInstruction(prev => ({ ...prev, label: e.target.value }))}
                                      placeholder="ラベル名"
                                      className="w-20 bg-white dark:bg-white/10 border border-purple-200 dark:border-purple-500/20 rounded px-1.5 py-0.5 text-[9px] text-[#333] dark:text-gray-300 focus:outline-none"
                                      onKeyDown={(e) => e.key === 'Enter' && addCustomInstruction(false)}
                                      autoFocus
                                    />
                                    <input
                                      type="text"
                                      value={newSubInstruction.prompt}
                                      onChange={(e) => setNewSubInstruction(prev => ({ ...prev, prompt: e.target.value }))}
                                      placeholder="英語プロンプト（任意）"
                                      className="w-32 bg-white dark:bg-white/10 border border-purple-200 dark:border-purple-500/20 rounded px-1.5 py-0.5 text-[9px] text-[#333] dark:text-gray-300 focus:outline-none"
                                      onKeyDown={(e) => e.key === 'Enter' && addCustomInstruction(false)}
                                    />
                                    <button
                                      onClick={() => addCustomInstruction(false)}
                                      disabled={!newSubInstruction.label.trim()}
                                      className="p-1 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                    >
                                      <Plus size={10} />
                                    </button>
                                    <button
                                      onClick={() => { setShowSubInstructionInput(false); setNewSubInstruction({ label: '', prompt: '' }); }}
                                      className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                                    >
                                      <X size={10} />
                                    </button>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-2">
                                <input
                                  type="text"
                                  value={customSubPrompt}
                                  onChange={(e) => setCustomSubPrompt(e.target.value)}
                                  placeholder="追加の指示を入力..."
                                  className="flex-1 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-[#333] dark:text-gray-300 focus:outline-none focus:border-purple-500/50 placeholder:text-gray-400 dark:placeholder:text-gray-600"
                                />
                                <button
                                  onClick={generateIpCharPrompt}
                                  disabled={isGeneratingIpPrompt}
                                  className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[9px] font-bold transition-all shrink-0 ${
                                    isGeneratingIpPrompt
                                      ? 'bg-purple-200 dark:bg-purple-500/20 text-purple-600 cursor-wait'
                                      : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20'
                                  }`}
                                >
                                  {isGeneratingIpPrompt ? (
                                    <>
                                      <Loader2 size={10} className="animate-spin" />
                                      生成中
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles size={10} />
                                      プロンプト生成
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Sub Character Detail Blocks */}
                        {subCharDetails.length > 0 && subCharFile && (
                          <div className="mt-3 ml-[156px] space-y-2">
                            {subCharDetails.map((detail) => (
                              <div key={detail.id} className="flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                <span className="text-[9px] font-bold text-purple-600 dark:text-purple-400 w-16 shrink-0">{detail.label}</span>
                                <input
                                  type="text"
                                  value={detail.value}
                                  onChange={(e) => updateCharacterDetail(false, detail.id, e.target.value)}
                                  placeholder={DETAIL_PRESETS.find(p => p.label === detail.label)?.placeholder || '詳細を入力...'}
                                  className="flex-1 bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 rounded-lg px-2 py-1.5 text-[10px] text-[#333] dark:text-gray-300 focus:outline-none focus:border-purple-500/50 placeholder:text-gray-400 dark:placeholder:text-gray-600"
                                />
                                <button
                                  onClick={() => removeCharacterDetail(false, detail.id)}
                                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add Detail Button for Sub Character */}
                        {subCharFile && (
                          <div className="mt-3 ml-[156px]">
                            <div className="flex flex-wrap gap-1 mb-2">
                              {DETAIL_PRESETS.filter(p => !subCharDetails.some(d => d.label === p.label)).map((preset) => (
                                <button
                                  key={preset.label}
                                  onClick={() => addCharacterDetail(false, preset.label)}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-medium border border-dashed border-purple-300 dark:border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors"
                                >
                                  <Plus size={10} />
                                  {preset.label}
                                </button>
                              ))}
                            </div>
                            {/* カスタムフィールド追加 */}
                            <div className="flex gap-1 items-center">
                              <input
                                type="text"
                                value={customFieldInputSub}
                                onChange={(e) => setCustomFieldInputSub(e.target.value)}
                                placeholder="カスタム項目名..."
                                className="flex-1 bg-white dark:bg-white/5 border border-purple-200 dark:border-purple-500/20 rounded px-2 py-1 text-[9px] text-[#333] dark:text-gray-300 focus:outline-none focus:border-purple-500/50 placeholder:text-gray-400"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && customFieldInputSub.trim()) {
                                    addCharacterDetail(false, customFieldInputSub.trim());
                                    setCustomFieldInputSub('');
                                  }
                                }}
                              />
                              <button
                                onClick={() => {
                                  if (customFieldInputSub.trim()) {
                                    addCharacterDetail(false, customFieldInputSub.trim());
                                    setCustomFieldInputSub('');
                                  }
                                }}
                                disabled={!customFieldInputSub.trim()}
                                className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold transition-all ${
                                  customFieldInputSub.trim()
                                    ? 'bg-purple-500 text-white hover:bg-purple-600'
                                    : 'bg-gray-100 dark:bg-white/5 text-gray-400 cursor-not-allowed'
                                }`}
                              >
                                <Plus size={10} />
                                追加
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Per-Cut Character Assignment */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-[10px] font-bold text-[#78909C] dark:text-gray-400 uppercase tracking-wider">カットごとの登場設定</h4>
                          {cuts.some(c => c.showSub) && (
                            <span className="text-[8px] bg-purple-500/10 text-purple-500 dark:text-purple-400 px-1.5 py-0.5 rounded font-bold">
                              IP登場: {cuts.filter(c => c.showSub).length}カット
                            </span>
                          )}
                        </div>
                        <div className="space-y-1.5 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
                          {cuts.length === 0 ? (
                            <p className="text-[10px] text-[#78909C] dark:text-gray-500 text-center py-4">
                              PDFをアップロードするとカットが生成されます
                            </p>
                          ) : cuts.map((cut, index) => (
                            <div key={cut.id} className={`px-2 py-2 rounded-lg transition-all ${
                              cut.enabled
                                ? cut.showSub
                                  ? 'bg-purple-50 dark:bg-purple-500/[0.05] border border-purple-200 dark:border-purple-500/20'
                                  : 'bg-gray-50 dark:bg-white/[0.03]'
                                : 'opacity-30'
                            }`}>
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold w-4 text-center ${
                                  cut.showSub ? 'text-purple-500 dark:text-purple-400' : 'text-[#78909C] dark:text-gray-500'
                                }`}>{index + 1}</span>
                                <span className="text-[9px] text-[#555] dark:text-gray-400 flex-1 truncate">{cut.title}</span>
                                <button
                                  onClick={() => setCuts(prev => prev.map(c => c.id === cut.id ? { ...c, showMain: !c.showMain } : c))}
                                  className={`px-2 py-0.5 rounded text-[8px] font-bold border transition-all ${
                                    cut.showMain
                                      ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-500 dark:text-cyan-400'
                                      : 'bg-transparent border-gray-200 dark:border-white/10 text-gray-300 dark:text-gray-600'
                                  }`}
                                >
                                  主
                                </button>
                                <button
                                  onClick={() => setCuts(prev => prev.map(c => c.id === cut.id ? { ...c, showSub: !c.showSub } : c))}
                                  className={`px-2 py-0.5 rounded text-[8px] font-bold border transition-all ${
                                    cut.showSub
                                      ? subCharFile
                                        ? 'bg-purple-500/10 border-purple-500/30 text-purple-500 dark:text-purple-400'
                                        : 'bg-orange-500/10 border-orange-500/30 text-orange-500 dark:text-orange-400 animate-pulse'
                                      : 'bg-transparent border-gray-200 dark:border-white/10 text-gray-300 dark:text-gray-600'
                                  }`}
                                  title={cut.showSub && !subCharFile ? 'IP画像をアップロードしてください' : ''}
                                >
                                  IP{cut.showSub && !subCharFile && '!'}
                                </button>
                              </div>
                              {/* IP状態プロンプト表示 */}
                              {cut.showSub && cut.ipPrompt && (
                                <p className={`text-[8px] mt-1 ml-6 line-clamp-1 ${
                                  subCharFile ? 'text-purple-500 dark:text-purple-400' : 'text-orange-500 dark:text-orange-400'
                                }`}>
                                  🎭 {cut.ipPrompt}
                                </p>
                              )}
                              {/* IP画像未設定の警告 */}
                              {cut.showSub && !subCharFile && (
                                <p className="text-[7px] text-orange-500 dark:text-orange-400 mt-0.5 ml-6">
                                  ⚠ IP画像を設定してください
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <p className="text-[9px] text-[#78909C] mt-4 text-center">メインモデルは必須 / IPは任意</p>

                    {/* 設定完了ボタン */}
                    <button
                      onClick={() => {
                        if (!humanFile) {
                          alert('メインモデルの画像を設定してください');
                          return;
                        }
                        setCharacterConfirmed(true);
                        setCharPanelOpen(false);
                      }}
                      disabled={!humanFile}
                      className={`w-full mt-4 py-3 rounded-xl font-bold text-sm transition-all ${
                        humanFile
                          ? 'bg-gradient-to-r from-cyan-500 to-purple-500 text-white shadow-lg hover:shadow-cyan-500/30'
                          : 'bg-gray-200 dark:bg-white/10 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      設定完了
                    </button>
                  </div>
                )}
              </div>

              {/* Theme Toggle Button */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-xl bg-[#FAFAFA] dark:bg-[#1a1a24] text-[#78909C] border border-[#E0E0E0] dark:border-white/10 hover:bg-[#F5F5F5] dark:hover:bg-[#2a2a36] hover:text-[#333333] dark:hover:text-white transition-all shadow-sm"
              >
                {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
              </button>

              {/* History Button in Header */}
              <div className="relative" ref={historyPanelRef}>
                <button
                  onClick={() => setHistoryPanelOpen(!historyPanelOpen)}
                  className={`p-2 rounded-xl border transition-all shadow-sm flex items-center gap-1.5 ${
                    historyPanelOpen
                      ? 'bg-indigo-500/10 border-indigo-300 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400'
                      : 'bg-[#FAFAFA] dark:bg-[#1a1a24] text-[#78909C] border-[#E0E0E0] dark:border-white/10 hover:bg-[#F5F5F5] dark:hover:bg-[#2a2a36] hover:text-[#333333] dark:hover:text-white'
                  }`}
                  title="プロジェクト履歴"
                >
                  <History size={18} />
                  {projectHistory.length > 0 && (
                    <span className="text-[10px] font-bold">{projectHistory.length}</span>
                  )}
                </button>

                {/* History Dropdown Panel */}
                {historyPanelOpen && (
                  <div className="absolute top-full right-0 mt-2 w-[320px] bg-white dark:bg-[#16161e] border border-[#E0E0E0] dark:border-white/10 rounded-xl shadow-2xl dark:shadow-indigo-500/5 p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <History size={14} className="text-indigo-500" />
                        <h3 className="text-[11px] font-bold text-[#333] dark:text-gray-200">プロジェクト履歴</h3>
                        <span className="text-[9px] text-gray-400">({projectHistory.length})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={saveCurrentProject}
                          disabled={cuts.length === 0}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          title="現在のプロジェクトを保存"
                        >
                          <Save size={10} />
                          保存
                        </button>
                        <button
                          onClick={() => setHistoryPanelOpen(false)}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm"
                        >
                          ×
                        </button>
                      </div>
                    </div>

                    {/* Search Input */}
                    {projectHistory.length > 0 && (
                      <div className="relative mb-3">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          value={historySearchQuery}
                          onChange={(e) => setHistorySearchQuery(e.target.value)}
                          placeholder="プロジェクトを検索..."
                          className="w-full pl-7 pr-3 py-1.5 text-[10px] bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg focus:outline-none focus:border-indigo-500/50 placeholder:text-gray-400"
                        />
                        {historySearchQuery && (
                          <button
                            onClick={() => setHistorySearchQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            <X size={10} />
                          </button>
                        )}
                      </div>
                    )}

                    {projectHistory.length === 0 ? (
                      <div className="text-center py-6">
                        <FolderOpen size={24} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                        <p className="text-[10px] text-[#78909C] dark:text-gray-500">保存されたプロジェクトはありません</p>
                        <p className="text-[8px] text-[#9E9E9E] mt-1">生成すると自動保存されます</p>
                      </div>
                    ) : filteredHistory.length === 0 ? (
                      <div className="text-center py-4">
                        <Search size={20} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                        <p className="text-[10px] text-[#78909C] dark:text-gray-500">「{historySearchQuery}」に一致する<br />プロジェクトが見つかりません</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                        {filteredHistory.map((entry) => (
                          <div
                            key={entry.id}
                            className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
                              currentProjectId === entry.id
                                ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-300 dark:border-indigo-500/30'
                                : 'bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10'
                            }`}
                            onClick={() => loadProject(entry)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-bold text-[#333] dark:text-gray-200 truncate">{entry.name}</p>
                                <p className="text-[9px] text-[#78909C] dark:text-gray-500 mt-0.5">
                                  {entry.cuts.length}カット • {new Date(entry.timestamp).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </p>
                                {entry.generationTimes && (entry.generationTimes.cutComposition || entry.generationTimes.totalTime) && (
                                  <div className="flex flex-wrap gap-1.5 mt-1">
                                    {entry.generationTimes.cutComposition && (
                                      <span className="text-[8px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded">
                                        構成: {(entry.generationTimes.cutComposition / 1000).toFixed(1)}秒
                                      </span>
                                    )}
                                    {entry.generationTimes.fixedElements && (
                                      <span className="text-[8px] px-1.5 py-0.5 bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded">
                                        背景: {(entry.generationTimes.fixedElements / 1000).toFixed(1)}秒
                                      </span>
                                    )}
                                    {entry.generationTimes.totalTime && (
                                      <span className="text-[8px] px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded">
                                        合計: {(entry.generationTimes.totalTime / 1000).toFixed(1)}秒
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteProject(entry.id); }}
                                className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                title="削除"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

            {user && (
              <div className="flex items-center gap-4 pl-4 border-l border-[#E0E0E0] md:ml-2">
                <span className="text-[11px] text-[#78909C]">
                  {user.email?.split('@')[0]}
                </span>
                <button
                  onClick={() => signOut()}
                  className="text-[11px] px-3 py-1.5 rounded-lg bg-[#F5F5F5] text-[#78909C] border border-[#E0E0E0] hover:text-red-400 hover:border-red-400/30 hover:bg-red-400/5 transition-all duration-300"
                >
                  ログアウト
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content with Sidebar */}
      <div className="flex relative z-10">
        {/* Left Sidebar - Settings & Info */}
        <aside className="hidden xl:block w-64 flex-shrink-0 border-r border-[#E0E0E0] min-h-[calc(100vh-73px)] sticky top-[73px] self-start">
          <div className="p-6 space-y-6">
            {/* How to Use */}
            <div>
              <h3 className="text-[10px] font-semibold text-[#78909C] uppercase tracking-wider mb-4">使い方</h3>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-violet-500/10 text-violet-500 flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</div>
                  <div>
                    <p className="text-xs text-[#333333] dark:text-gray-200 font-medium">ストーリーPDFをアップロード</p>
                    <p className="text-[10px] text-[#78909C] dark:text-gray-500 mt-0.5">シナリオ・プロットのPDFを選択</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-cyan-500/10 text-cyan-500 flex items-center justify-center text-[10px] font-bold flex-shrink-0">2</div>
                  <div>
                    <p className="text-xs text-[#333333] dark:text-gray-200 font-medium">キャラクター画像を設定</p>
                    <p className="text-[10px] text-[#78909C] dark:text-gray-500 mt-0.5">メインモデル（必須）とIP（任意）</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-[10px] font-bold flex-shrink-0">3</div>
                  <div>
                    <p className="text-xs text-[#333333] dark:text-gray-200 font-medium">AIがカット割りを自動生成</p>
                    <p className="text-[10px] text-[#78909C] dark:text-gray-500 mt-0.5">プロンプト・背景も自動設定</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center text-[10px] font-bold flex-shrink-0">4</div>
                  <div>
                    <p className="text-xs text-[#333333] dark:text-gray-200 font-medium">静止画・動画を一括生成</p>
                    <p className="text-[10px] text-[#78909C] dark:text-gray-500 mt-0.5">各カットの画像→動画を生成</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Tips */}
            <div>
              <h3 className="text-[10px] font-semibold text-[#78909C] uppercase tracking-wider mb-4">再生成のコツ</h3>
              <div className="space-y-2.5">
                <div className="flex items-start gap-2 text-[11px] text-[#78909C] dark:text-gray-400">
                  <span className="text-cyan-500 mt-0.5">💡</span>
                  <span>キャラを変更したい場合は「キャラ変更＆再生成」</span>
                </div>
                <div className="flex items-start gap-2 text-[11px] text-[#78909C] dark:text-gray-400">
                  <span className="text-orange-500 mt-0.5">💡</span>
                  <span>カメラ設定後に「プロンプト再生成」で最適化</span>
                </div>
                <div className="flex items-start gap-2 text-[11px] text-[#78909C] dark:text-gray-400">
                  <span className="text-emerald-500 mt-0.5">💡</span>
                  <span>背景は「再生成」ボタンで何度でも生成可能</span>
                </div>
              </div>
            </div>

            {/* Best Practices */}
            <div>
              <h3 className="text-[10px] font-semibold text-[#78909C] uppercase tracking-wider mb-4">ベストプラクティス</h3>
              <div className="space-y-2 text-[10px] text-[#78909C] dark:text-gray-500">
                <p>• モデルは正面を向いた全身写真</p>
                <p>• IP画像は背景透過が理想</p>
                <p>• カメラ設定で構図を調整</p>
                <p>• 高解像度の画像を使用</p>
              </div>
            </div>


            {/* Cost Estimation */}
            <div>
              <h3 className="text-[10px] font-semibold text-[#78909C] uppercase tracking-wider mb-4">予算目安（{cuts.length || 7}カット）</h3>
              <div className="space-y-3 bg-gray-50 dark:bg-white/5 rounded-xl p-3 border border-gray-200 dark:border-white/10">
                {/* AI Text Generation */}
                <div>
                  <p className="text-[9px] font-bold text-[#555] dark:text-gray-400 mb-1">AI（カット生成）</p>
                  <div className="flex items-center justify-between text-[10px]">
                    <select
                      value={selectedModelId}
                      onChange={(e) => handleModelIdChange(e.target.value)}
                      className={`text-[10px] font-bold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5 cursor-pointer max-w-[120px] ${
                        aiModel === 'openai' ? 'text-green-600' : 'text-orange-600'
                      }`}
                    >
                      <optgroup label="OpenAI" className="text-green-600">
                        {availableAiModels.filter(m => m.provider === 'openai').map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Anthropic" className="text-orange-600">
                        {availableAiModels.filter(m => m.provider === 'claude').map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </optgroup>
                    </select>
                    <div className="flex items-center gap-1">
                      <span className="text-[#78909C]">≈ $</span>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={projectBudget.aiCostPerCall}
                        onChange={(e) => setProjectBudget(prev => ({ ...prev, aiCostPerCall: parseFloat(e.target.value) || 0 }))}
                        className="w-12 text-[10px] text-right bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5"
                      />
                      <span className="text-[#78909C]">/回</span>
                    </div>
                  </div>
                </div>
                {/* Still Image */}
                <div>
                  <p className="text-[9px] font-bold text-[#555] dark:text-gray-400 mb-1">静止画（fal.ai）</p>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-purple-600">Nanobanana2</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[#78909C]">≈ $</span>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={projectBudget.stillImageCost}
                        onChange={(e) => setProjectBudget(prev => ({ ...prev, stillImageCost: parseFloat(e.target.value) || 0 }))}
                        className="w-12 text-[10px] text-right bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5"
                      />
                      <span className="text-[#78909C]">/枚 × {cuts.length || 7}</span>
                    </div>
                  </div>
                </div>
                {/* Video */}
                <div>
                  <p className="text-[9px] font-bold text-[#555] dark:text-gray-400 mb-1">動画（fal.ai）</p>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-pink-600">Kling 2.6</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[#78909C]">≈ $</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={projectBudget.videoCost}
                        onChange={(e) => setProjectBudget(prev => ({ ...prev, videoCost: parseFloat(e.target.value) || 0 }))}
                        className="w-12 text-[10px] text-right bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5"
                      />
                      <span className="text-[#78909C]">/本 × {cuts.length || 7}</span>
                    </div>
                  </div>
                </div>
                {/* Total */}
                <div className="pt-2 border-t border-gray-200 dark:border-white/10">
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="text-[#333] dark:text-gray-200">合計（目安）</span>
                    <span className="text-emerald-600">
                      ≈ ${(
                        projectBudget.aiCostPerCall +
                        (cuts.length || 7) * projectBudget.stillImageCost +
                        (cuts.length || 7) * projectBudget.videoCost
                      ).toFixed(2)}
                    </span>
                  </div>
                  <p className="text-[8px] text-[#9E9E9E] mt-1">※ コストは編集可能・プロジェクトに保存されます</p>
                </div>
              </div>
            </div>

          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 max-w-6xl mx-auto px-6 py-10">
          <div className="flex justify-center">
            {/* Split Panel: Inputs */}
            <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-start mx-auto">
              
              {/* Left Column: Composition and Generation Flow */}
              <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6">

              {/* Story PDF → Auto Cut Composition */}
              <Suspense fallback={<div className="glass rounded-2xl p-8 text-center"><Loader2 className="animate-spin mx-auto mb-2" size={24} /><p className="text-sm text-gray-500">読み込み中...</p></div>}>
                <StoryPdfUploader
                  aiModel={aiModel}
                  selectedModelId={selectedModelId}
                  onAiModelChange={(model) => {
                    setAiModel(model);
                    localStorage.setItem('snafty_ai_model', model);
                  }}
                  onStoryExtracted={(text) => setExtractedPdfText(text)}
                  onCutsGenerated={(newCuts) => {
                    setCuts(newCuts);
                    setEditingCutId(null);
                  }}
                  characterFile={humanFile}
                  characterConfirmed={characterConfirmed}
                  onRequestCharacter={() => {
                    // キャラクター設定パネルを開く
                    setCharPanelOpen(true);
                  }}
                  onFullAutoGenerate={handleFullAutoGenerate}
                />
              </Suspense>

            {/* Composition Plan Settings */}
            <div className="glass rounded-2xl p-4">
              <div className="flex items-center justify-between mb-4">
                {/* Title on the Left */}
                <div className="flex items-center gap-3">
                  <div className="w-1 h-5 rounded-full bg-gradient-to-b from-cyan-400 to-purple-500"></div>
                  <h2 className="text-[#333333] dark:text-gray-200 font-semibold text-sm">構成表設定（{enabledCuts.length}カット）</h2>
                  {/* 画像/動画 切り替えタブ */}
                  <div className="flex rounded-lg border border-[#E0E0E0] dark:border-white/10 overflow-hidden ml-2">
                    <button
                      onClick={() => setCompositionMode('image')}
                      className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold transition-all ${
                        compositionMode === 'image'
                          ? 'bg-cyan-500 text-white'
                          : 'bg-white dark:bg-white/5 text-[#78909C] hover:text-[#333] dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/10'
                      }`}
                    >
                      <ImageIcon size={11} />
                      画像用
                    </button>
                    <button
                      onClick={() => setCompositionMode('video')}
                      className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold transition-all ${
                        compositionMode === 'video'
                          ? 'bg-purple-500 text-white'
                          : 'bg-white dark:bg-white/5 text-[#78909C] hover:text-[#333] dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/10'
                      }`}
                    >
                      <Film size={11} />
                      動画用
                    </button>
                  </div>
                </div>

                {/* Toolbar on the Right */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setVideoModalOpen(true)}
                    disabled={isGenerating || !humanFile}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all shadow-sm ${
                      isGenerating || !humanFile
                        ? 'bg-gray-100 dark:bg-white/5 text-[#9E9E9E] dark:text-gray-500 cursor-not-allowed border outline-none'
                        : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-purple-500/20 hover:shadow-purple-500/40 hover:scale-105'
                    }`}
                  >
                    <Play size={10} />
                    一括動画生成
                  </button>

                  <div className="relative" ref={semanticPanelRef}>
                    <button
                      onClick={() => setSemanticPanelOpen(!semanticPanelOpen)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-all shadow-sm ${
                        semanticPanelOpen
                          ? 'bg-blue-500/10 dark:bg-blue-500/20 border-blue-500/30 text-blue-600 dark:text-blue-300'
                          : 'bg-white dark:bg-white/5 border-[#E0E0E0] dark:border-white/10 text-[#78909C] hover:text-[#333] dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/10'
                      }`}
                    >
                      意味構造
                      <ChevronDown size={10} className={`transition-transform duration-200 ${semanticPanelOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {semanticPanelOpen && (
                      <div className="absolute top-full right-0 mt-3 w-[400px] bg-white dark:bg-[#16161e] border border-[#E0E0E0] dark:border-white/10 rounded-2xl shadow-2xl dark:shadow-blue-500/5 p-5 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-1 h-5 rounded-full bg-gradient-to-b from-blue-400 to-indigo-500"></div>
                          <h3 className="text-[#333333] dark:text-gray-200 font-semibold text-sm">意味構造</h3>
                        </div>
                        <div className="space-y-2 text-left">
                          <p className="text-[10px] text-[#78909C] dark:text-gray-500 font-medium whitespace-normal">ショート動画全体の意味構造（プロット展開）を一つにまとめて定義します。</p>
                          <textarea
                            value={semanticPrompt}
                            onChange={(e) => setSemanticPrompt(e.target.value)}
                            placeholder="全体の意味構造を入力..."
                            className="w-full h-40 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-2.5 text-xs text-[#333] dark:text-gray-300 focus:outline-none focus:border-blue-500/50 transition-colors custom-scrollbar resize-y whitespace-pre-wrap leading-relaxed"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="relative" ref={productPanelRef}>
                    <button
                      onClick={() => setProductPanelOpen(!productPanelOpen)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-all shadow-sm ${
                        productPanelOpen
                          ? 'bg-amber-500/10 dark:bg-amber-500/20 border-amber-500/30 text-amber-600 dark:text-amber-300'
                          : 'bg-white dark:bg-white/5 border-[#E0E0E0] dark:border-white/10 text-[#78909C] hover:text-[#333] dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/10'
                      }`}
                    >
                      プロダクト強調
                      <ChevronDown size={10} className={`transition-transform duration-200 ${productPanelOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {productPanelOpen && (
                      <div className="absolute top-full right-0 mt-3 w-[400px] bg-white dark:bg-[#16161e] border border-[#E0E0E0] dark:border-white/10 rounded-2xl shadow-2xl dark:shadow-amber-500/5 p-5 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-1 h-5 rounded-full bg-gradient-to-b from-amber-400 to-orange-500"></div>
                          <h3 className="text-[#333333] dark:text-gray-200 font-semibold text-sm">プロダクト強調</h3>
                        </div>
                        <div className="space-y-2 text-left">
                          <p className="text-[10px] text-[#78909C] dark:text-gray-500 font-medium whitespace-normal">衣装・商品へのフォーカスを強く高めるプロンプトを定義します。</p>
                          <textarea
                            value={productPrompt}
                            onChange={(e) => setProductPrompt(e.target.value)}
                            placeholder="例: extremely detailed garment texture, highly focused on the clothing item, clear product shot..."
                            className="w-full h-32 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-2.5 text-xs text-[#333] dark:text-gray-300 focus:outline-none focus:border-amber-500/50 transition-colors custom-scrollbar resize-y whitespace-pre-wrap leading-relaxed"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="w-px h-6 bg-gray-200 dark:bg-white/10 mx-1"></div>

                  {/* キャラクター変更＆再生成ボタン */}
                  {cuts.length > 0 && extractedPdfText && (
                    <button
                      onClick={() => {
                        setCharacterConfirmed(false);
                        setPendingRegenerate(true);
                        setCharPanelOpen(true);
                      }}
                      disabled={isGenerating}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all shadow-sm ${
                        isGenerating
                          ? 'bg-gray-100 dark:bg-white/5 text-[#9E9E9E] dark:text-gray-500 cursor-not-allowed border outline-none'
                          : 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:scale-105'
                      }`}
                      title="キャラクターを変更してカットを再生成"
                    >
                      <RefreshCw size={10} />
                      キャラ変更＆再生成
                    </button>
                  )}

                  <button
                    onClick={resetCuts}
                    className="flex items-center gap-1 text-[10px] text-[#78909C] hover:text-[#333] dark:hover:text-gray-300 transition-colors whitespace-nowrap"
                  >
                    <RotateCcw size={10} /> リセット
                  </button>
                </div>
              </div>

              {/* ステータスバー - 常時表示 */}
              <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-white/[0.02] rounded-xl border border-gray-200 dark:border-white/5 mb-3">
                  <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Status</span>
                  <div className="flex items-center gap-4 flex-1">
                    {/* 日本語プロンプト */}
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${
                        cuts.filter(c => c.enabled && (c.action || c.expression || c.background || /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(c.prompt || ''))).length > 0
                          ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
                          : 'bg-gray-300 dark:bg-gray-600'
                      }`} />
                      <span className="text-[10px] text-gray-600 dark:text-gray-400">日本語</span>
                      <span className="text-[10px] font-bold text-gray-800 dark:text-gray-300">
                        {cuts.filter(c => c.enabled && (c.action || c.expression || c.background || /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(c.prompt || ''))).length}/{enabledCuts.length}
                      </span>
                    </div>
                    {/* 英語プロンプト */}
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${
                        cuts.filter(c => c.enabled && /\[POSITIVE\]/i.test(c.prompt || '')).length > 0
                          ? 'bg-blue-500 shadow-sm shadow-blue-500/50'
                          : 'bg-gray-300 dark:bg-gray-600'
                      }`} />
                      <span className="text-[10px] text-gray-600 dark:text-gray-400">英語</span>
                      <span className="text-[10px] font-bold text-gray-800 dark:text-gray-300">
                        {cuts.filter(c => c.enabled && /\[POSITIVE\]/i.test(c.prompt || '')).length}/{enabledCuts.length}
                      </span>
                    </div>
                    {/* 画像生成 */}
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${
                        cuts.filter(c => c.enabled && c.generatedImageUrl).length === enabledCuts.length && enabledCuts.length > 0
                          ? 'bg-cyan-500 shadow-sm shadow-cyan-500/50'
                          : cuts.filter(c => c.enabled && c.generatedImageUrl).length > 0
                          ? 'bg-amber-500 shadow-sm shadow-amber-500/50'
                          : 'bg-gray-300 dark:bg-gray-600'
                      }`} />
                      <span className="text-[10px] text-gray-600 dark:text-gray-400">画像</span>
                      <span className="text-[10px] font-bold text-gray-800 dark:text-gray-300">
                        {cuts.filter(c => c.enabled && c.generatedImageUrl).length}/{enabledCuts.length}
                      </span>
                    </div>
                    {/* 動画生成 */}
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${
                        cuts.filter(c => c.enabled && c.generatedVideoUrl).length === enabledCuts.length && enabledCuts.length > 0
                          ? 'bg-purple-500 shadow-sm shadow-purple-500/50'
                          : cuts.filter(c => c.enabled && c.generatedVideoUrl).length > 0
                          ? 'bg-amber-500 shadow-sm shadow-amber-500/50'
                          : 'bg-gray-300 dark:bg-gray-600'
                      }`} />
                      <span className="text-[10px] text-gray-600 dark:text-gray-400">動画</span>
                      <span className="text-[10px] font-bold text-gray-800 dark:text-gray-300">
                        {cuts.filter(c => c.enabled && c.generatedVideoUrl).length}/{enabledCuts.length}
                      </span>
                    </div>
                  </div>
                  {/* 進捗バー */}
                  <div className="flex items-center gap-2 ml-auto">
                    <div className="w-24 h-1.5 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${enabledCuts.length > 0
                            ? ((cuts.filter(c => c.enabled && c.generatedImageUrl).length + cuts.filter(c => c.enabled && c.generatedVideoUrl).length) / (enabledCuts.length * 2)) * 100
                            : 0}%`
                        }}
                      />
                    </div>
                    <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400">
                      {enabledCuts.length > 0
                        ? Math.round(((cuts.filter(c => c.enabled && c.generatedImageUrl).length + cuts.filter(c => c.enabled && c.generatedVideoUrl).length) / (enabledCuts.length * 2)) * 100)
                        : 0}%
                    </span>
                  </div>
                </div>

              <div className="space-y-2">
                {cuts.length === 0 ? (
                  <div className="text-center py-8 px-4">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-purple-500/10 flex items-center justify-center">
                      <BookOpen size={28} className="text-purple-400" />
                    </div>
                    <p className="text-sm font-medium text-[#555] dark:text-gray-400 mb-2">カットがありません</p>
                    <p className="text-xs text-[#78909C] dark:text-gray-500">
                      上の「ストーリーPDF→カット割り」セクションからPDFをアップロードすると、<br />
                      AIが自動でカット構成を生成します
                    </p>
                  </div>
                ) : cuts.map((cut, index) => (
                  <div
                    key={cut.id}
                    className={`rounded-xl border transition-all duration-200 ${
                      cut.enabled
                        ? 'bg-white/50 dark:bg-white/[0.04] border-[#E0E0E0] dark:border-white/10 shadow-sm'
                        : 'bg-white/20 dark:bg-white/[0.01] border-[#E0E0E0] dark:border-white/5 opacity-40'
                    }`}
                  >
                    <div className="flex items-center gap-2 p-3">
                      {/* Thumbnails: Video (left) + Image (right) */}
                      <div className="flex gap-1 shrink-0">
                        {/* Video Thumbnail */}
                        <div className="relative w-11 h-[78px] rounded-md border border-purple-300 dark:border-purple-500/30 shadow-sm overflow-hidden group bg-purple-50 dark:bg-purple-500/5 flex items-center justify-center">
                          {cut.generatedVideoUrl ? (
                            <video
                              src={cut.generatedVideoUrl}
                              className="w-full h-full object-cover cursor-pointer"
                              muted
                              loop
                              playsInline
                              onMouseEnter={(e) => e.currentTarget.play()}
                              onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                            />
                          ) : (
                            <Video size={14} className="text-purple-300 dark:text-purple-500/50 opacity-50" />
                          )}

                          {cut.isGeneratingVideo && (
                            <div className="absolute inset-0 bg-purple-900/70 flex flex-col justify-center items-center">
                              <Loader2 size={10} className="text-white animate-spin" />
                              <span className="text-[6px] text-white mt-0.5">動画生成中</span>
                            </div>
                          )}

                          {/* Video badge */}
                          {cut.generatedVideoUrl && (
                            <div className="absolute top-0.5 left-0.5 bg-purple-500 text-white text-[6px] px-1 py-0.5 rounded font-bold">
                              🎬
                            </div>
                          )}
                        </div>

                        {/* Image Thumbnail */}
                        <div className="relative w-11 h-[78px] rounded-md border border-[#E0E0E0] dark:border-white/10 shadow-sm overflow-hidden group bg-[#F5F5F5] dark:bg-white/5 flex items-center justify-center">
                          {cut.generatedImageUrl ? (
                            <img
                              src={cut.generatedImageUrl}
                              alt="cut"
                              className="w-full h-full object-cover cursor-pointer"
                              onClick={() => setLightboxImage({ url: cut.generatedImageUrl!, title: cut.title })}
                            />
                          ) : (
                            <ImageIcon size={14} className="text-[#B0BEC5] dark:text-gray-500 opacity-50" />
                          )}

                          {cut.isGenerating && (
                            <div className="absolute inset-0 bg-black/50 flex flex-col justify-center items-center">
                              <Loader2 size={10} className="text-white animate-spin" />
                            </div>
                          )}

                          {/* Overlay Controls */}
                          {!cut.isGenerating && (
                            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              {cut.generatedImageUrl && (
                                <button
                                  onClick={() => setLightboxImage({ url: cut.generatedImageUrl!, title: cut.title })}
                                  className="text-white hover:text-green-400 p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                                  title="拡大表示"
                                >
                                  <Maximize2 size={12} />
                                </button>
                              )}
                              <label className="text-white hover:text-cyan-400 p-1.5 rounded-full bg-white/10 hover:bg-white/20 cursor-pointer transition-colors" title="画像を差し替える (アップロード)">
                                <Upload size={12} />
                                <input type="file" accept="image/*" onChange={(e) => { if(e.target.files?.[0]) handleUploadCutImage(cut.id, e.target.files[0]); }} className="hidden" />
                              </label>
                              <button
                                onClick={() => generateImageForCut(cut.id)}
                                className="text-white hover:text-purple-400 p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                                title="画像を再生成する (AI)"
                                disabled={!humanFile}
                              >
                                <RotateCcw size={12} />
                              </button>
                            </div>
                          )}

                          {/* Image badge */}
                          {cut.generatedImageUrl && (
                            <div className="absolute top-0.5 left-0.5 bg-cyan-500 text-white text-[6px] px-1 py-0.5 rounded font-bold">
                              📷
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Cut number */}
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                        cut.enabled
                          ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400'
                          : 'bg-gray-100 dark:bg-white/5 text-[#9E9E9E] dark:text-gray-600'
                      }`}>
                        {index + 1}
                      </div>

                      {/* Title + Prompt + character badges */}
                      {editingCutId === cut.id ? (
                        <input
                          type="text"
                          value={cut.title}
                          onChange={(e) => updateCutField(cut.id, 'title', e.target.value)}
                          className="flex-1 bg-white dark:bg-white/10 border border-[#E0E0E0] dark:border-white/20 rounded-lg px-2 py-1 text-xs text-[#333] dark:text-white focus:outline-none focus:border-purple-500/50"
                          autoFocus
                        />
                      ) : (
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-[#333] dark:text-gray-300 truncate">
                              {cut.title}
                            </span>
                            {/* Character badges */}
                            <div className="flex gap-0.5 flex-shrink-0">
                              {cut.showMain && (
                                <span className="text-[8px] px-1 py-0.5 rounded bg-cyan-500/15 text-cyan-500 dark:text-cyan-400 font-bold">主</span>
                              )}
                              {cut.showSub && subCharFile && (
                                <span className="text-[8px] px-1 py-0.5 rounded bg-purple-500/15 text-purple-500 dark:text-purple-400 font-bold">IP</span>
                              )}
                            </div>
                          </div>
                          {/* Prompt preview */}
                          {cut.prompt && (
                            <p className="text-[9px] text-[#78909C] dark:text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
                              {cut.camera && <span className="text-blue-500 dark:text-blue-400 font-medium">[{cut.camera}] </span>}
                              {cut.prompt}
                            </p>
                          )}
                          {/* IP Prompt preview */}
                          {cut.showSub && cut.ipPrompt && (
                            <p className="text-[9px] text-purple-500 dark:text-purple-400 mt-0.5 line-clamp-1 leading-relaxed">
                              <span className="font-medium">🎭 IP: </span>{cut.ipPrompt}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => setEditingCutId(editingCutId === cut.id ? null : cut.id)}
                          className={`p-1 rounded transition-colors flex items-center justify-center relative ${
                            editingCutId === cut.id
                              ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400'
                              : 'hover:bg-gray-100 dark:hover:bg-white/10 text-[#78909C] dark:text-gray-500 hover:text-[#333] dark:hover:text-white'
                          }`}
                        >
                          <Pencil size={12} />
                          {cut.generatedImageUrl && !cut.isGenerating && (
                            <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-green-500 animate-pulse border border-white dark:border-black" />
                          )}
                        </button>
                        <button
                          onClick={() => toggleCut(cut.id)}
                          className={`w-8 h-5 rounded-full transition-all duration-200 flex items-center ${
                            cut.enabled
                              ? 'bg-purple-500 justify-end'
                              : 'bg-gray-200 dark:bg-white/10 justify-start'
                          }`}
                        >
                          <div className={`w-3.5 h-3.5 rounded-full mx-0.5 transition-all ${
                            cut.enabled ? 'bg-white' : 'bg-[#9E9E9E] dark:bg-gray-500'
                          }`} />
                        </button>
                      </div>
                    </div>

                    {/* Expanded edit area */}
                    {editingCutId === cut.id && (
                      <div className="px-3 pb-3 pt-0 space-y-3">
                        <div>
                          <label className="text-[9px] text-[#78909C] dark:text-gray-500 uppercase tracking-wider mb-1.5 block">キャラクター登場</label>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setCuts(prev => prev.map(c => c.id === cut.id ? { ...c, showMain: !c.showMain } : c))}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all duration-200 ${
                                cut.showMain
                                  ? 'bg-cyan-500/10 dark:bg-cyan-500/15 border-cyan-500/30 dark:border-cyan-500/40 text-cyan-600 dark:text-cyan-300'
                                  : 'bg-transparent dark:bg-white/[0.02] border-[#E0E0E0] dark:border-white/10 text-[#78909C] dark:text-gray-600 hover:text-[#333] dark:hover:text-gray-400'
                              }`}
                            >
                              <span>👤</span> メイン
                            </button>
                            <button
                              onClick={() => setCuts(prev => prev.map(c => c.id === cut.id ? { ...c, showSub: !c.showSub } : c))}
                              disabled={!subCharFile}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all duration-200 ${
                                !subCharFile
                                  ? 'bg-gray-50 dark:bg-white/[0.01] border-[#E0E0E0] dark:border-white/5 text-[#9E9E9E] dark:text-gray-700 cursor-not-allowed'
                                  : cut.showSub
                                  ? 'bg-purple-500/10 dark:bg-purple-500/15 border-purple-500/30 dark:border-purple-500/40 text-purple-600 dark:text-purple-300'
                                  : 'bg-transparent dark:bg-white/[0.02] border-[#E0E0E0] dark:border-white/10 text-[#78909C] dark:text-gray-600 hover:text-[#333] dark:hover:text-gray-400'
                              }`}
                            >
                              <span>👥</span> IP{!subCharFile && <span className="text-[8px] ml-1 opacity-50">(未設定)</span>}
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="text-[9px] text-[#78909C] dark:text-gray-500 uppercase tracking-wider mb-1.5 block">カメラ距離・アングル</label>
                          <div className="flex gap-2 flex-wrap mb-2">
                            {(['クローズアップ', 'バストショット', 'ミディアム', 'ミドルロング', '全身'] as const).map(cam => (
                              <button
                                key={cam}
                                onClick={() => updateCutField(cut.id, 'camera', cam)}
                                className={`px-2 py-1 rounded-md text-[10px] font-bold border transition-colors ${
                                  cut.camera === cam
                                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-600 dark:text-blue-400'
                                    : 'bg-white/50 dark:bg-white/5 border-[#E0E0E0] dark:border-white/10 text-[#78909C] hover:text-[#333] dark:hover:text-white'
                                }`}
                              >
                                {cam}
                              </button>
                            ))}
                          </div>
                          <input
                            type="text"
                            value={cut.camera || ''}
                            onChange={(e) => updateCutField(cut.id, 'camera', e.target.value)}
                            placeholder="その他の距離感・アングルを自由記述"
                            className="w-full bg-white dark:bg-white/5 border border-[#E0E0E0] dark:border-white/10 rounded-lg px-3 py-1.5 text-xs text-[#333] dark:text-gray-300 focus:outline-none focus:border-purple-500/50"
                          />
                        </div>

                        {/* 詳細フィールド - 画像用 */}
                        {compositionMode === 'image' && (
                          <div className="mt-3 p-3 bg-cyan-50/50 dark:bg-cyan-500/[0.02] rounded-lg border border-cyan-200 dark:border-cyan-500/10">
                            <label className="text-[9px] text-cyan-600 dark:text-cyan-400 uppercase tracking-wider mb-2 block font-bold">📷 画像生成用設定</label>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[8px] text-[#9E9E9E] dark:text-gray-600 block mb-0.5">表情</label>
                                <input
                                  type="text"
                                  value={cut.expression || ''}
                                  onChange={(e) => updateCutField(cut.id, 'expression', e.target.value)}
                                  placeholder="笑顔、真剣、驚き..."
                                  className="w-full bg-white dark:bg-white/5 border border-[#E0E0E0] dark:border-white/10 rounded px-2 py-1 text-[10px] text-[#333] dark:text-gray-300 focus:outline-none focus:border-cyan-500/50"
                                />
                              </div>
                              <div>
                                <label className="text-[8px] text-[#9E9E9E] dark:text-gray-600 block mb-0.5">視線</label>
                                <input
                                  type="text"
                                  value={cut.gaze || ''}
                                  onChange={(e) => updateCutField(cut.id, 'gaze', e.target.value)}
                                  placeholder="カメラ目線、前方..."
                                  className="w-full bg-white dark:bg-white/5 border border-[#E0E0E0] dark:border-white/10 rounded px-2 py-1 text-[10px] text-[#333] dark:text-gray-300 focus:outline-none focus:border-cyan-500/50"
                                />
                              </div>
                              <div>
                                <label className="text-[8px] text-[#9E9E9E] dark:text-gray-600 block mb-0.5">ポーズ</label>
                                <input
                                  type="text"
                                  value={cut.pose || ''}
                                  onChange={(e) => updateCutField(cut.id, 'pose', e.target.value)}
                                  placeholder="立ち姿、座る..."
                                  className="w-full bg-white dark:bg-white/5 border border-[#E0E0E0] dark:border-white/10 rounded px-2 py-1 text-[10px] text-[#333] dark:text-gray-300 focus:outline-none focus:border-cyan-500/50"
                                />
                              </div>
                              <div>
                                <label className="text-[8px] text-[#9E9E9E] dark:text-gray-600 block mb-0.5">背景</label>
                                <input
                                  type="text"
                                  value={cut.background || ''}
                                  onChange={(e) => updateCutField(cut.id, 'background', e.target.value)}
                                  placeholder="街並み、室内..."
                                  className="w-full bg-white dark:bg-white/5 border border-[#E0E0E0] dark:border-white/10 rounded px-2 py-1 text-[10px] text-[#333] dark:text-gray-300 focus:outline-none focus:border-cyan-500/50"
                                />
                              </div>
                              <div className="col-span-2">
                                <label className="text-[8px] text-[#9E9E9E] dark:text-gray-600 block mb-0.5">プロダクト強調</label>
                                <input
                                  type="text"
                                  value={cut.productEmphasis || ''}
                                  onChange={(e) => updateCutField(cut.id, 'productEmphasis', e.target.value)}
                                  placeholder="袖、ロゴ、素材感..."
                                  className="w-full bg-white dark:bg-white/5 border border-[#E0E0E0] dark:border-white/10 rounded px-2 py-1 text-[10px] text-[#333] dark:text-gray-300 focus:outline-none focus:border-cyan-500/50"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 詳細フィールド - 動画用 */}
                        {compositionMode === 'video' && (
                          <div className="mt-3 p-3 bg-purple-50/50 dark:bg-purple-500/[0.02] rounded-lg border border-purple-200 dark:border-purple-500/10">
                            <label className="text-[9px] text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-2 block font-bold">🎬 動画生成用設定</label>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[8px] text-[#9E9E9E] dark:text-gray-600 block mb-0.5">尺（秒数）</label>
                                <div className="flex gap-1">
                                  {['2秒', '3秒', '5秒'].map(d => (
                                    <button
                                      key={d}
                                      onClick={() => updateCutField(cut.id, 'duration', d)}
                                      className={`flex-1 px-1.5 py-1 rounded text-[9px] font-bold border transition-all ${
                                        cut.duration === d
                                          ? 'bg-purple-500 text-white border-purple-600'
                                          : 'bg-white dark:bg-white/5 border-[#E0E0E0] dark:border-white/10 text-[#78909C] hover:text-[#333] dark:hover:text-white'
                                      }`}
                                    >
                                      {d}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <label className="text-[8px] text-[#9E9E9E] dark:text-gray-600 block mb-0.5">動きの強度</label>
                                <div className="flex gap-1">
                                  {['弱', '中', '強'].map(m => (
                                    <button
                                      key={m}
                                      onClick={() => updateCutField(cut.id, 'motionIntensity', m)}
                                      className={`flex-1 px-1.5 py-1 rounded text-[9px] font-bold border transition-all ${
                                        cut.motionIntensity === m
                                          ? 'bg-purple-500 text-white border-purple-600'
                                          : 'bg-white dark:bg-white/5 border-[#E0E0E0] dark:border-white/10 text-[#78909C] hover:text-[#333] dark:hover:text-white'
                                      }`}
                                    >
                                      {m}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <label className="text-[8px] text-[#9E9E9E] dark:text-gray-600 block mb-0.5">動きの種類</label>
                                <input
                                  type="text"
                                  value={cut.motionType || ''}
                                  onChange={(e) => updateCutField(cut.id, 'motionType', e.target.value)}
                                  placeholder="歩行、振り返り、静止..."
                                  className="w-full bg-white dark:bg-white/5 border border-[#E0E0E0] dark:border-white/10 rounded px-2 py-1 text-[10px] text-[#333] dark:text-gray-300 focus:outline-none focus:border-purple-500/50"
                                />
                              </div>
                              <div>
                                <label className="text-[8px] text-[#9E9E9E] dark:text-gray-600 block mb-0.5">カメラの動き</label>
                                <input
                                  type="text"
                                  value={cut.cameraMovement || ''}
                                  onChange={(e) => updateCutField(cut.id, 'cameraMovement', e.target.value)}
                                  placeholder="パン、ズームイン、固定..."
                                  className="w-full bg-white dark:bg-white/5 border border-[#E0E0E0] dark:border-white/10 rounded px-2 py-1 text-[10px] text-[#333] dark:text-gray-300 focus:outline-none focus:border-purple-500/50"
                                />
                              </div>
                              <div>
                                <label className="text-[8px] text-[#9E9E9E] dark:text-gray-600 block mb-0.5">開始フレーム</label>
                                <input
                                  type="text"
                                  value={cut.startFrame || ''}
                                  onChange={(e) => updateCutField(cut.id, 'startFrame', e.target.value)}
                                  placeholder="立っている、画面外から..."
                                  className="w-full bg-white dark:bg-white/5 border border-[#E0E0E0] dark:border-white/10 rounded px-2 py-1 text-[10px] text-[#333] dark:text-gray-300 focus:outline-none focus:border-purple-500/50"
                                />
                              </div>
                              <div>
                                <label className="text-[8px] text-[#9E9E9E] dark:text-gray-600 block mb-0.5">終了フレーム</label>
                                <input
                                  type="text"
                                  value={cut.endFrame || ''}
                                  onChange={(e) => updateCutField(cut.id, 'endFrame', e.target.value)}
                                  placeholder="歩き去る、静止..."
                                  className="w-full bg-white dark:bg-white/5 border border-[#E0E0E0] dark:border-white/10 rounded px-2 py-1 text-[10px] text-[#333] dark:text-gray-300 focus:outline-none focus:border-purple-500/50"
                                />
                              </div>
                              <div>
                                <label className="text-[8px] text-[#9E9E9E] dark:text-gray-600 block mb-0.5">トランジション</label>
                                <div className="flex gap-1">
                                  {['カット', 'フェード', 'ディゾルブ'].map(t => (
                                    <button
                                      key={t}
                                      onClick={() => updateCutField(cut.id, 'transition', t)}
                                      className={`flex-1 px-1 py-1 rounded text-[8px] font-bold border transition-all ${
                                        cut.transition === t
                                          ? 'bg-purple-500 text-white border-purple-600'
                                          : 'bg-white dark:bg-white/5 border-[#E0E0E0] dark:border-white/10 text-[#78909C] hover:text-[#333] dark:hover:text-white'
                                      }`}
                                    >
                                      {t}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <label className="text-[8px] text-[#9E9E9E] dark:text-gray-600 block mb-0.5">画面位置</label>
                                <input
                                  type="text"
                                  value={cut.walkPosition || ''}
                                  onChange={(e) => updateCutField(cut.id, 'walkPosition', e.target.value)}
                                  placeholder="中央、左→右..."
                                  className="w-full bg-white dark:bg-white/5 border border-[#E0E0E0] dark:border-white/10 rounded px-2 py-1 text-[10px] text-[#333] dark:text-gray-300 focus:outline-none focus:border-purple-500/50"
                                />
                              </div>
                              <div className="col-span-2">
                                <label className="text-[8px] text-[#9E9E9E] dark:text-gray-600 block mb-0.5">動画プロンプト</label>
                                <textarea
                                  value={cut.videoPrompt || ''}
                                  onChange={(e) => updateCutField(cut.id, 'videoPrompt', e.target.value)}
                                  placeholder="動画生成用の詳細な動き指示..."
                                  className="w-full bg-white dark:bg-white/5 border border-[#E0E0E0] dark:border-white/10 rounded px-2 py-1.5 text-[10px] text-[#333] dark:text-gray-300 focus:outline-none focus:border-purple-500/50 resize-y min-h-[40px]"
                                />
                              </div>
                              {/* 動画生成ボタン */}
                              <div className="col-span-2 pt-3 border-t border-purple-200 dark:border-purple-500/20 mt-2">
                                <button
                                  onClick={() => generateVideoForCut(cut.id)}
                                  disabled={cut.isGeneratingVideo || !cut.generatedImageUrl}
                                  className={`w-full py-2.5 rounded-lg font-bold text-xs flex justify-center items-center gap-2 transition-all duration-300 ${
                                    cut.isGeneratingVideo
                                      ? 'bg-purple-400 text-white cursor-wait'
                                      : !cut.generatedImageUrl
                                      ? 'bg-gray-200 dark:bg-white/5 text-[#9E9E9E] dark:text-gray-500 cursor-not-allowed'
                                      : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md shadow-purple-500/20 hover:shadow-purple-500/40 hover:scale-[1.02]'
                                  }`}
                                >
                                  {cut.isGeneratingVideo ? (
                                    <>
                                      <Loader2 size={14} className="animate-spin" />
                                      動画生成中...（数分かかります）
                                    </>
                                  ) : (
                                    <>
                                      <Video size={14} />
                                      🎬 動画を生成する
                                    </>
                                  )}
                                </button>
                                {!cut.generatedImageUrl && (
                                  <p className="text-[9px] text-orange-500 dark:text-orange-400 mt-1.5 text-center">
                                    ⚠️ 先に「画像用」モードで画像を生成してください
                                  </p>
                                )}
                                {cut.generatedVideoUrl && (
                                  <p className="text-[9px] text-green-500 dark:text-green-400 mt-1.5 text-center">
                                    ✅ 動画が生成されています（左のサムネイルにマウスを乗せて再生）
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        <div>
                          <div className="flex items-center justify-between mb-1.5 mt-3">
                            <label className="text-[9px] text-[#78909C] dark:text-gray-500 uppercase tracking-wider">プロンプト詳細</label>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => regenerateCutPromptFromFields(cut.id)}
                                disabled={regeneratingCutId === cut.id}
                                className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold transition-all ${
                                  regeneratingCutId === cut.id
                                    ? 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-500 cursor-wait'
                                    : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 hover:text-cyan-700'
                                }`}
                                title="詳細設定から英語プロンプトを生成"
                              >
                                {regeneratingCutId === cut.id ? (
                                  <><Loader2 size={10} className="animate-spin" /> 翻訳中...</>
                                ) : (
                                  <><RefreshCw size={10} /> 詳細→英語化</>
                                )}
                              </button>
                              <button
                                onClick={() => regenerateCutPrompt(cut.id)}
                                disabled={regeneratingCutId === cut.id || !extractedPdfText}
                                className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold transition-all ${
                                  regeneratingCutId === cut.id
                                    ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-500 cursor-wait'
                                    : !extractedPdfText
                                    ? 'bg-gray-100 dark:bg-white/5 text-gray-400 cursor-not-allowed'
                                    : 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 hover:text-orange-700'
                                }`}
                                title="AIで完全に再生成"
                              >
                                {regeneratingCutId === cut.id ? (
                                  <><Loader2 size={10} className="animate-spin" /> 再生成中...</>
                                ) : (
                                  <><Sparkles size={10} /> 完全再生成</>
                                )}
                              </button>
                            </div>
                          </div>
                          <textarea
                            value={cut.prompt}
                            onChange={(e) => updateCutField(cut.id, 'prompt', e.target.value)}
                            className="w-full bg-white dark:bg-white/5 border border-[#E0E0E0] dark:border-white/10 rounded-lg px-3 py-2 text-xs text-[#333] dark:text-gray-300 focus:outline-none focus:border-purple-500/50 resize-y min-h-[60px]"
                          />
                        </div>

                        {/* Image Generation Section inside Edit */}
                        <div className="pt-2 border-t border-[#E0E0E0] dark:border-white/10 mt-2">
                          <button
                            onClick={() => generateImageForCut(cut.id)}
                            disabled={cut.isGenerating || (!humanFile)}
                            className={`w-full py-2.5 rounded-lg font-bold text-xs flex justify-center items-center gap-2 transition-all duration-300 ${
                              cut.isGenerating || (!humanFile)
                                ? 'bg-gray-200 dark:bg-white/5 text-[#9E9E9E] dark:text-gray-500 cursor-not-allowed'
                                : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md shadow-purple-500/20 hover:shadow-purple-500/40'
                            }`}
                          >
                            {cut.isGenerating ? (
                              <><Loader2 size={12} className="animate-spin" /> 画像生成中...</>
                            ) : (
                              <><ImageIcon size={12} /> {cut.generatedImageUrl ? '画像を再生成する' : 'このカットの画像を生成する'}</>
                            )}
                          </button>
                          
                          {cut.errorMessage && (
                            <div className="text-red-500 dark:text-red-400 text-[10px] mt-2 bg-red-50 dark:bg-red-500/10 p-2 rounded text-center">
                              {cut.errorMessage}
                            </div>
                          )}

                          {cut.generatedImageUrl && (
                            <div className="mt-3 relative h-40 bg-black/5 dark:bg-black/20 rounded-lg overflow-hidden border border-[#E0E0E0] dark:border-white/10 flex justify-center items-center p-2 group">
                              <img
                                src={cut.generatedImageUrl}
                                alt={`Generated for ${cut.title}`}
                                className="h-full w-auto object-contain rounded drop-shadow-md"
                              />
                              {/* Hover overlay with regenerate, upload and zoom buttons */}
                              {!cut.isGenerating && (
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => setLightboxImage({ url: cut.generatedImageUrl!, title: cut.title })}
                                    className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors flex items-center gap-1"
                                    title="拡大表示"
                                  >
                                    <Maximize2 size={14} />
                                  </button>
                                  <label
                                    className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors cursor-pointer flex items-center gap-1"
                                    title="画像をアップロード"
                                  >
                                    <Upload size={14} />
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          const url = URL.createObjectURL(file);
                                          setCuts(prev => prev.map(c => c.id === cut.id ? { ...c, generatedImageUrl: url } : c));
                                        }
                                        e.target.value = '';
                                      }}
                                    />
                                  </label>
                                  <button
                                    onClick={() => generateImageForCut(cut.id)}
                                    className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors flex items-center gap-1"
                                    title="画像を再生成"
                                  >
                                    <RefreshCw size={14} />
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            </div>

              {/* Right Column: Character & Stage Settings */}
              <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-6 sticky top-24">
                {/* Character Status (compact) */}
                <div className="glass rounded-2xl p-4 card-hover">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-1 h-5 rounded-full bg-gradient-to-b from-cyan-400 to-purple-500"></div>
                      <h2 className="text-[#333333] dark:text-gray-200 font-semibold text-sm">キャラクター</h2>
                    </div>
                    <button
                      onClick={() => setCharPanelOpen(true)}
                      className="text-[10px] text-purple-500 dark:text-purple-400 font-semibold hover:underline"
                    >
                      設定を開く
                    </button>
                  </div>
                  <div className="flex gap-3 mt-3">
                    <div className={`flex items-center gap-2 flex-1 px-3 py-2 rounded-lg border text-xs ${
                      humanFile
                        ? 'bg-cyan-500/5 dark:bg-cyan-500/10 border-cyan-500/20 text-cyan-600 dark:text-cyan-400'
                        : 'bg-gray-50 dark:bg-white/5 border-[#E0E0E0] dark:border-white/10 text-[#78909C]'
                    }`}>
                      <User size={14} />
                      <span className="font-medium">{humanFile ? 'メイン ✓' : 'メイン 未設定'}</span>
                    </div>
                    <div className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs ${subCharFile ? 'bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/20 text-purple-600 dark:text-purple-400' : 'bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-500'}`}>
                      <Users size={12} />
                      <span className="font-medium">{subCharFile ? 'IP ✓' : 'IP 未設定'}</span>
                    </div>
                  </div>
                </div>

                {/* Fixed Elements Settings */}
                <div className="glass rounded-2xl p-4 card-hover">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-1 h-5 rounded-full bg-gradient-to-b from-green-400 to-emerald-500"></div>
                      <h2 className="text-[#333333] dark:text-gray-200 font-semibold text-sm">背景</h2>
                    </div>
                    <div className="flex items-center gap-2">
                       <button
                         onClick={handleGenerateFixedElements}
                         disabled={isGeneratingFixed || !extractedPdfText}
                         className={`px-3 py-1.5 text-[10px] sm:text-xs font-bold rounded-lg transition-colors flex items-center gap-1 ${
                           isGeneratingFixed
                             ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-white/5'
                             : !extractedPdfText
                             ? 'bg-emerald-50 text-emerald-300 border border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-500/50 cursor-not-allowed'
                             : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                         }`}
                         title={!extractedPdfText ? "PDFをアップロードしてください" : ""}
                       >
                         {isGeneratingFixed ? <Loader2 size={12} className="animate-spin" /> : stagePrompt ? <RefreshCw size={12} /> : <Sparkles size={12} />}
                         {isGeneratingFixed ? "生成中..." : stagePrompt ? "再生成" : "生成する"}
                       </button>

                      <div className="relative" ref={fixedPanelRef}>
                        <button
                          onClick={() => setFixedPanelOpen(!fixedPanelOpen)}
                          className="text-[10px] sm:text-xs text-emerald-600 dark:text-emerald-400 font-bold hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
                        >
                          設定を開く
                        </button>
                        {fixedPanelOpen && (
                          <div className="absolute top-full right-0 mt-3 w-[400px] bg-white dark:bg-[#16161e] border border-[#E0E0E0] dark:border-white/10 rounded-2xl shadow-2xl dark:shadow-emerald-500/5 p-5 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                            <h3 className="text-[#333333] dark:text-gray-200 font-semibold text-xs mb-2">
                              背景メタプロンプト
                            </h3>
                            <p className="text-[10px] text-[#78909C] mb-3 leading-relaxed">
                              画像生成時に一貫して適用する、背景やトーンなどを決定するためのAI指示です。
                            </p>
                            <textarea
                              value={fixedElementMetaPrompt}
                              onChange={(e) => setFixedElementMetaPrompt(e.target.value)}
                              className="w-full h-32 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-3 text-xs text-[#333] dark:text-gray-300 focus:outline-none focus:border-emerald-500/50 transition-colors custom-scrollbar resize-y font-mono leading-relaxed"
                            />
                            <div className="flex gap-2 justify-between mt-3">
                              <button
                                onClick={() => setFixedElementMetaPrompt(DEFAULT_FIXED_META_PROMPT)}
                                className="text-[10px] text-emerald-500 hover:text-emerald-600 underline"
                              >
                                デフォルトに戻す
                              </button>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setFixedPanelOpen(false)}
                                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-[#333] text-[10px] font-bold rounded-lg transition-colors"
                                >
                                  キャンセル
                                </button>
                                <button
                                  onClick={() => {
                                    localStorage.setItem('snafty_fixed_meta_prompt', fixedElementMetaPrompt);
                                    alert('背景メタプロンプトを保存しました。');
                                    setFixedPanelOpen(false);
                                  }}
                                  className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold rounded-lg transition-colors"
                                >
                                  保存して閉じる
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <textarea
                    value={stagePrompt}
                    onChange={(e) => setStagePrompt(e.target.value)}
                    placeholder="例: tokyo street, cyberpunk city, interior of a cafe... (動画全体の舞台や背景の指定。自動生成された結果がここにセットされます)"
                    className="w-full h-16 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-2.5 text-xs text-[#333] dark:text-gray-300 focus:outline-none focus:border-emerald-500/50 transition-colors custom-scrollbar resize-y"
                  />

                  {/* シーンごとの背景画像 */}
                  {cuts.length > 0 && stagePrompt && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-white/10">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-[10px] font-bold text-[#555] dark:text-gray-400 uppercase tracking-wider">
                          シーン別背景画像
                        </h3>
                        <div className="flex items-center gap-2">
                          {cuts.filter(c => c.enabled && c.backgroundImageUrl).length > 0 && (
                            <button
                              onClick={downloadAllBackgrounds}
                              className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold transition-all bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400"
                            >
                              <Download size={10} />
                              全てDL
                            </button>
                          )}
                          <button
                            onClick={generateAllBackgrounds}
                            disabled={cuts.some(c => c.isGeneratingBackground)}
                            className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold transition-all ${
                              cuts.some(c => c.isGeneratingBackground)
                                ? 'bg-gray-100 dark:bg-white/5 text-gray-400 cursor-wait'
                                : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            <Sparkles size={10} />
                            全シーン一括生成
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {cuts.filter(c => c.enabled).map((cut, index) => (
                          <div key={cut.id} className="relative group">
                            <div className="aspect-video rounded-lg overflow-hidden border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-white/5">
                              {cut.backgroundImageUrl ? (
                                <img
                                  src={cut.backgroundImageUrl}
                                  alt={`背景 ${index + 1}`}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <ImageIcon size={16} className="text-gray-300 dark:text-gray-600" />
                                </div>
                              )}
                              {cut.isGeneratingBackground && (
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                  <Loader2 size={16} className="text-white animate-spin" />
                                </div>
                              )}
                              {/* Hover overlay */}
                              {!cut.isGeneratingBackground && (
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                                  {cut.backgroundImageUrl && (
                                    <>
                                      <button
                                        onClick={() => setLightboxImage({ url: cut.backgroundImageUrl!, title: `${cut.title} - 背景` })}
                                        className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
                                        title="拡大表示"
                                      >
                                        <Maximize2 size={12} />
                                      </button>
                                      <button
                                        onClick={() => downloadBackgroundImage(cut.backgroundImageUrl!, cut.title)}
                                        className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
                                        title="ダウンロード"
                                      >
                                        <Download size={12} />
                                      </button>
                                    </>
                                  )}
                                  <label
                                    className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors cursor-pointer"
                                    title="画像をアップロード"
                                  >
                                    <Upload size={12} />
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          const url = URL.createObjectURL(file);
                                          setCuts(prev => prev.map(c => c.id === cut.id ? { ...c, backgroundImageUrl: url } : c));
                                        }
                                        e.target.value = '';
                                      }}
                                    />
                                  </label>
                                  <button
                                    onClick={() => generateBackgroundForCut(cut.id)}
                                    className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
                                    title="背景を再生成"
                                  >
                                    <RefreshCw size={12} />
                                  </button>
                                </div>
                              )}
                            </div>
                            <p className="text-[8px] text-center text-[#78909C] dark:text-gray-500 mt-1 truncate">
                              {index + 1}. {cut.title}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Generation Settings (Video/Still Toggle) */}
                <div className="glass rounded-2xl p-4 card-hover">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-1 h-5 rounded-full bg-gradient-to-b ${generationSettingsTab === 'video' ? 'from-blue-400 to-indigo-500' : 'from-orange-400 to-red-500'}`}></div>
                      <div className="flex bg-gray-100 dark:bg-white/5 rounded-lg p-0.5">
                        <button
                          onClick={() => setGenerationSettingsTab('still')}
                          className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${
                            generationSettingsTab === 'still'
                              ? 'bg-white dark:bg-white/10 text-orange-600 dark:text-orange-400 shadow-sm'
                              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                          }`}
                        >
                          静止画設定
                        </button>
                        <button
                          onClick={() => setGenerationSettingsTab('video')}
                          className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${
                            generationSettingsTab === 'video'
                              ? 'bg-white dark:bg-white/10 text-indigo-600 dark:text-indigo-400 shadow-sm'
                              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                          }`}
                        >
                          動画設定
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 静止画設定 */}
                  {generationSettingsTab === 'still' && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[9px] font-semibold text-[#78909C] dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                          <span className="text-gray-400">AI指示</span> メタプロンプト
                        </label>
                        <textarea
                          value={stillImageMetaPrompt}
                          onChange={(e) => setStillImageMetaPrompt(e.target.value)}
                          placeholder="静止画生成AIへの指示ルールを設定..."
                          className="w-full h-24 bg-yellow-50 dark:bg-yellow-500/5 border border-yellow-200 dark:border-yellow-500/20 rounded-lg p-2 text-[10px] text-[#333] dark:text-gray-300 focus:outline-none focus:border-yellow-500/50 transition-colors custom-scrollbar resize-y"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-semibold text-[#78909C] dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                          <span className="text-orange-500">出力</span> 生成プロンプト
                        </label>
                        <textarea
                          value={stillImageStyle}
                          onChange={(e) => setStillImageStyle(e.target.value)}
                          placeholder="メタプロンプトを元に生成されるプロンプト（手動編集も可）"
                          className="w-full h-16 bg-orange-50 dark:bg-orange-500/5 border border-orange-200 dark:border-orange-500/20 rounded-lg p-2 text-[10px] text-[#333] dark:text-gray-300 focus:outline-none focus:border-orange-500/50 transition-colors custom-scrollbar resize-y"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={saveStillPrompts}
                          className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-[9px] font-bold rounded-lg transition-colors"
                        >
                          保存
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 動画設定 */}
                  {generationSettingsTab === 'video' && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[9px] font-semibold text-[#78909C] dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                          <span className="text-gray-400">AI指示</span> メタプロンプト
                        </label>
                        <textarea
                          value={videoMetaPrompt}
                          onChange={(e) => setVideoMetaPrompt(e.target.value)}
                          placeholder="動画生成AIへの指示ルールを設定..."
                          className="w-full h-12 bg-blue-50 dark:bg-blue-500/5 border border-blue-200 dark:border-blue-500/20 rounded-lg p-2 text-[10px] text-[#333] dark:text-gray-300 focus:outline-none focus:border-blue-500/50 transition-colors custom-scrollbar resize-y"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-semibold text-[#78909C] dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                          <span className="text-indigo-500">出力</span> 生成プロンプト
                        </label>
                        <textarea
                          value={videoPromptStyle}
                          onChange={(e) => setVideoPromptStyle(e.target.value)}
                          placeholder="メタプロンプトを元に生成されるプロンプト（手動編集も可）"
                          className="w-full h-16 bg-indigo-50 dark:bg-indigo-500/5 border border-indigo-200 dark:border-indigo-500/20 rounded-lg p-2 text-[10px] text-[#333] dark:text-gray-300 focus:outline-none focus:border-indigo-500/50 transition-colors custom-scrollbar resize-y"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-semibold text-[#78909C] dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                          使用モデル
                        </label>
                        <select
                          value={videoGenModel}
                          onChange={(e) => setVideoGenModel(e.target.value)}
                          className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-2 text-[10px] text-[#333] dark:text-gray-300 focus:outline-none focus:border-indigo-500/50 transition-colors"
                        >
                          <option value="kling">Kling AI 2.6</option>
                          <option value="luma">Luma Dream Machine</option>
                          <option value="runway">Runway Gen-3</option>
                        </select>
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={saveVideoPrompts}
                          className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-[9px] font-bold rounded-lg transition-colors"
                        >
                          保存
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Generate Button */}
                <div className="glass rounded-2xl p-4 animate-in slide-in-from-bottom-4 duration-500">
                  <button
                    onClick={generateAllCutImages}
                    disabled={isGenerating}
                    className={`w-full py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all duration-300 ${
                      isGenerating
                        ? 'bg-[#F5F5F5] text-[#444] cursor-not-allowed border border-[#E0E0E0]'
                        : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-xl shadow-purple-500/25 hover:shadow-purple-500/40 hover:scale-[1.02]'
                    }`}
                  >
                    {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                    {isGenerating ? `画像を生成中... (${cuts.filter(c => c.isGenerating).length > 0 ? cuts.findIndex(c => c.isGenerating) + 1 : 0}/${enabledCuts.length})` : '画像を生成する'}
                  </button>

                  {/* Error */}
                  {error && (
                    <div className="mt-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                      {error}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </main>
      </div>

      {/* History Section */}
      {results.length > 0 && (
        <div className="max-w-6xl mx-auto px-6 pb-20 fade-in">
          <h2 className="text-[#333333] dark:text-gray-200 font-semibold text-lg mb-6 flex items-center gap-2">
            <span className="w-1.5 h-6 rounded-full bg-gradient-to-b from-cyan-400 to-purple-500"></span>
            生成履歴
          </h2>
          <div className="glass rounded-2xl p-6">
            <ResultGallery results={results} />
          </div>
        </div>
      )}

      {/* Short Video Modal */}
      <Suspense fallback={null}>
        <ShortVideoModal
          isOpen={videoModalOpen}
          onClose={() => setVideoModalOpen(false)}
          humanFile={humanFile}
          subCharacterFile={subCharFile}
          subCharPrompt={subCharPrompt}
          mainCharPrompt={mainCharPrompt}
          stillImageStyle={stillImageStyle}
          stillImageNegative={stillImageNegative}
          semanticPrompt={semanticPrompt}
          productPrompt={productPrompt}
          stagePrompt={stagePrompt}
          cuts={cuts}
          setCuts={setCuts}
          onGenerateSuccess={(newResults) => {
            setResults(prev => [...newResults, ...prev]);
          }}
        />
      </Suspense>

      {/* Storyboard Workflow Modal */}
      <Suspense fallback={null}>
        <StoryboardWorkflowModal
          isOpen={storyboardModalOpen}
          onClose={() => setStoryboardModalOpen(false)}
          aiModel={aiModel}
          existingCharacterFile={humanFile}
        />
      </Suspense>

      {/* Image Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setLightboxImage(null)}
        >
          {/* Close button */}
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X size={24} />
          </button>

          {/* Title */}
          <div className="absolute top-4 left-4 text-white">
            <h3 className="text-lg font-bold">{lightboxImage.title}</h3>
          </div>

          {/* Image */}
          <div
            className="max-w-[90vw] max-h-[85vh] relative"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxImage.url}
              alt={lightboxImage.title}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
          </div>

          {/* Download button */}
          <a
            href={lightboxImage.url}
            download={`${lightboxImage.title}.png`}
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-4 right-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <Upload size={16} className="rotate-180" />
            <span className="text-sm font-medium">ダウンロード</span>
          </a>

          {/* Instructions */}
          <p className="absolute bottom-4 left-4 text-white/50 text-sm">
            クリックで閉じる / ESCキー
          </p>
        </div>
      )}
    </div>
  );
};

export default App;
// Force redeploy Tue Apr 14 14:22:29 JST 2026
// Deploy: 1776146214
