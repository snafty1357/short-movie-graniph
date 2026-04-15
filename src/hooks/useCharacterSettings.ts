/**
 * キャラクター設定管理フック
 * メインキャラクターとサブキャラクターの状態を一括管理
 */
import { useState, useCallback, useMemo } from 'react';

// サブキャラクタープロンプトプリセット
export const SUB_CHAR_PRESETS = [
  { id: 'expressionless', label: '無表情固定', prompt: 'always expressionless, blank face, no emotion' },
  { id: 'no_fingers', label: '手に指はない', prompt: 'hands without fingers, mitten-like hands, no individual fingers' },
  { id: 'no_protagonist', label: '主役化禁止', prompt: 'always in background, never the main subject, supporting role only' },
  { id: 'invisible', label: '人物からは見えない', prompt: 'invisible to other characters, unnoticed presence, ghost-like existence' },
  { id: 'physical', label: '物理干渉可能', prompt: 'can interact with physical objects, touching and moving things' },
  { id: 'size_20cm', label: 'サイズ20cm', prompt: 'tiny character approximately 20cm tall, miniature figure scale' },
] as const;

// 詳細フィールドプリセット
export const DETAIL_PRESETS = [
  { label: '服装', placeholder: '例: 白いTシャツ、デニムジーンズ、スニーカー' },
  { label: '髪型', placeholder: '例: 黒髪ロング、ポニーテール' },
  { label: '表情', placeholder: '例: 笑顔、真剣な表情、驚いた顔' },
  { label: 'アクセサリー', placeholder: '例: メガネ、帽子、ネックレス' },
  { label: '体型', placeholder: '例: スリム、筋肉質、標準体型' },
  { label: '年齢層', placeholder: '例: 20代前半、30代、ティーン' },
];

export interface CustomInstructionBlock {
  id: string;
  label: string;
  prompt: string;
  active?: boolean;
}

export interface CharacterDetailBlock {
  id: string;
  label: string;
  value: string;
}

export interface CharacterPreset {
  id: string;
  name: string;
  mainPrompt: string;
  mainDetails: CharacterDetailBlock[];
  mainInstructions: CustomInstructionBlock[];
  subPrompt: string;
  subDetails: CharacterDetailBlock[];
  subInstructions: CustomInstructionBlock[];
  activeSubTags: string[];
}

export function useCharacterSettings() {
  // メインキャラクター
  const [humanFile, setHumanFile] = useState<File | null>(null);
  const [humanPreview, setHumanPreview] = useState<string | null>(null);
  const [mainCharPrompt, setMainCharPrompt] = useState('');
  const [mainCustomInstructions, setMainCustomInstructions] = useState<CustomInstructionBlock[]>([]);
  const [mainCharDetails, setMainCharDetails] = useState<CharacterDetailBlock[]>([]);

  // サブキャラクター
  const [subCharFile, setSubCharFile] = useState<File | null>(null);
  const [subCharPreview, setSubCharPreview] = useState<string | null>(null);
  const [customSubPrompt, setCustomSubPrompt] = useState('');
  const [subCustomInstructions, setSubCustomInstructions] = useState<CustomInstructionBlock[]>([]);
  const [subCharDetails, setSubCharDetails] = useState<CharacterDetailBlock[]>([]);
  const [activeSubTags, setActiveSubTags] = useState<Set<string>>(
    new Set(SUB_CHAR_PRESETS.map(p => p.id))
  );

  // UI状態
  const [charPanelOpen, setCharPanelOpen] = useState(false);
  const [characterConfirmed, setCharacterConfirmed] = useState(false);
  const [pendingRegenerate, setPendingRegenerate] = useState(false);
  const [customFieldInput, setCustomFieldInput] = useState('');
  const [customFieldInputSub, setCustomFieldInputSub] = useState('');

  // 新規インストラクション入力
  const [newMainInstruction, setNewMainInstruction] = useState({ label: '', prompt: '' });
  const [newSubInstruction, setNewSubInstruction] = useState({ label: '', prompt: '' });
  const [showMainInstructionInput, setShowMainInstructionInput] = useState(false);
  const [showSubInstructionInput, setShowSubInstructionInput] = useState(false);

  // プリセット管理
  const [characterPresets, setCharacterPresets] = useState<CharacterPreset[]>(() => {
    const saved = localStorage.getItem('snafty_character_presets');
    return saved ? JSON.parse(saved) : [];
  });
  const [presetNameInput, setPresetNameInput] = useState('');
  const [showPresetSaveModal, setShowPresetSaveModal] = useState(false);

  // サブキャラクタープロンプトの計算
  const subCharPrompt = useMemo(() => {
    const tagPrompts = SUB_CHAR_PRESETS
      .filter(p => activeSubTags.has(p.id))
      .map(p => p.prompt);
    const customPrompts = subCustomInstructions.map(i => i.prompt);
    return [...tagPrompts, ...customPrompts, customSubPrompt].filter(Boolean).join(', ');
  }, [activeSubTags, subCustomInstructions, customSubPrompt]);

  // メインキャラクター詳細プロンプトの生成
  const getMainCharDetailPrompt = useCallback(() => {
    return mainCharDetails
      .filter(d => d.value.trim())
      .map(d => `${d.label}: ${d.value}`)
      .join(', ');
  }, [mainCharDetails]);

  // サブキャラクター詳細プロンプトの生成
  const getSubCharDetailPrompt = useCallback(() => {
    return subCharDetails
      .filter(d => d.value.trim())
      .map(d => `${d.label}: ${d.value}`)
      .join(', ');
  }, [subCharDetails]);

  // メイン詳細フィールド追加
  const addMainDetailField = useCallback((label: string) => {
    if (!label.trim()) return;
    setMainCharDetails(prev => [
      ...prev,
      { id: `main-${Date.now()}`, label: label.trim(), value: '' }
    ]);
  }, []);

  // サブ詳細フィールド追加
  const addSubDetailField = useCallback((label: string) => {
    if (!label.trim()) return;
    setSubCharDetails(prev => [
      ...prev,
      { id: `sub-${Date.now()}`, label: label.trim(), value: '' }
    ]);
  }, []);

  // メインインストラクション追加
  const addMainInstruction = useCallback(() => {
    if (!newMainInstruction.label.trim() || !newMainInstruction.prompt.trim()) return;
    setMainCustomInstructions(prev => [
      ...prev,
      { id: `main-inst-${Date.now()}`, ...newMainInstruction }
    ]);
    setNewMainInstruction({ label: '', prompt: '' });
    setShowMainInstructionInput(false);
  }, [newMainInstruction]);

  // サブインストラクション追加
  const addSubInstruction = useCallback(() => {
    if (!newSubInstruction.label.trim() || !newSubInstruction.prompt.trim()) return;
    setSubCustomInstructions(prev => [
      ...prev,
      { id: `sub-inst-${Date.now()}`, ...newSubInstruction }
    ]);
    setNewSubInstruction({ label: '', prompt: '' });
    setShowSubInstructionInput(false);
  }, [newSubInstruction]);

  // プリセット保存
  const savePreset = useCallback((name: string) => {
    const preset: CharacterPreset = {
      id: `preset-${Date.now()}`,
      name,
      mainPrompt: mainCharPrompt,
      mainDetails: mainCharDetails,
      mainInstructions: mainCustomInstructions,
      subPrompt: customSubPrompt,
      subDetails: subCharDetails,
      subInstructions: subCustomInstructions,
      activeSubTags: Array.from(activeSubTags),
    };
    const newPresets = [...characterPresets, preset];
    setCharacterPresets(newPresets);
    localStorage.setItem('snafty_character_presets', JSON.stringify(newPresets));
  }, [mainCharPrompt, mainCharDetails, mainCustomInstructions, customSubPrompt, subCharDetails, subCustomInstructions, activeSubTags, characterPresets]);

  // プリセット読み込み
  const loadPreset = useCallback((preset: CharacterPreset) => {
    setMainCharPrompt(preset.mainPrompt);
    setMainCharDetails(preset.mainDetails);
    setMainCustomInstructions(preset.mainInstructions);
    setCustomSubPrompt(preset.subPrompt);
    setSubCharDetails(preset.subDetails);
    setSubCustomInstructions(preset.subInstructions);
    setActiveSubTags(new Set(preset.activeSubTags));
  }, []);

  // プリセット削除
  const deletePreset = useCallback((id: string) => {
    const newPresets = characterPresets.filter(p => p.id !== id);
    setCharacterPresets(newPresets);
    localStorage.setItem('snafty_character_presets', JSON.stringify(newPresets));
  }, [characterPresets]);

  // ファイルハンドラー
  const handleHumanFileSelect = useCallback((file: File | null) => {
    setHumanFile(file);
    if (file) {
      setHumanPreview(URL.createObjectURL(file));
    } else {
      setHumanPreview(null);
    }
  }, []);

  const handleSubCharFileSelect = useCallback((file: File | null) => {
    setSubCharFile(file);
    if (file) {
      setSubCharPreview(URL.createObjectURL(file));
    } else {
      setSubCharPreview(null);
    }
  }, []);

  // サブタグ切り替え
  const toggleSubTag = useCallback((tagId: string) => {
    setActiveSubTags(prev => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  }, []);

  return {
    // メインキャラクター状態
    humanFile,
    humanPreview,
    mainCharPrompt,
    setMainCharPrompt,
    mainCustomInstructions,
    setMainCustomInstructions,
    mainCharDetails,
    setMainCharDetails,

    // サブキャラクター状態
    subCharFile,
    subCharPreview,
    customSubPrompt,
    setCustomSubPrompt,
    subCustomInstructions,
    setSubCustomInstructions,
    subCharDetails,
    setSubCharDetails,
    activeSubTags,
    subCharPrompt,

    // UI状態
    charPanelOpen,
    setCharPanelOpen,
    characterConfirmed,
    setCharacterConfirmed,
    pendingRegenerate,
    setPendingRegenerate,
    customFieldInput,
    setCustomFieldInput,
    customFieldInputSub,
    setCustomFieldInputSub,

    // インストラクション入力
    newMainInstruction,
    setNewMainInstruction,
    newSubInstruction,
    setNewSubInstruction,
    showMainInstructionInput,
    setShowMainInstructionInput,
    showSubInstructionInput,
    setShowSubInstructionInput,

    // プリセット
    characterPresets,
    presetNameInput,
    setPresetNameInput,
    showPresetSaveModal,
    setShowPresetSaveModal,

    // アクション
    handleHumanFileSelect,
    handleSubCharFileSelect,
    toggleSubTag,
    getMainCharDetailPrompt,
    getSubCharDetailPrompt,
    addMainDetailField,
    addSubDetailField,
    addMainInstruction,
    addSubInstruction,
    savePreset,
    loadPreset,
    deletePreset,
  };
}
