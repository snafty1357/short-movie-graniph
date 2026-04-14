import React, { useState, useCallback, useEffect, useRef } from 'react';
import ImageUploader from './components/ImageUploader';
import ResultGallery, { type ResultItem } from './components/ResultGallery';
import ShortVideoModal, { type CutItem, DEFAULT_CUTS } from './components/ShortVideoModal';
import { useAuth } from './contexts/AuthContext';
import { useTheme } from './contexts/ThemeContext';
import AuthForm from './components/AuthForm';
import StoryPdfUploader from './components/StoryPdfUploader';
import StoryboardWorkflowModal from './components/StoryboardWorkflowModal';

import { User, Users, Sun, Moon, UserCircle, RotateCcw, Pencil, ChevronDown, Sparkles, Image as ImageIcon, Loader2, Upload, Play, BookOpen } from 'lucide-react';
import { generatePose, fileToDataUrl } from './services/falService';
import { generateFixedElements, generateCutComposition, compositionRowToCutItem, DEFAULT_FIXED_META_PROMPT, DEFAULT_REGULATION, type AiModelType } from './services/storyPdfService';



const App: React.FC = () => {
  const { user, loading, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // モデル画像（正面）
  const [humanFile, setHumanFile] = useState<File | null>(null);
  const [humanPreview, setHumanPreview] = useState<string | null>(null);

  // サブキャラクター画像
  const [subCharFile, setSubCharFile] = useState<File | null>(null);
  const [subCharPreview, setSubCharPreview] = useState<string | null>(null);

  // サブキャラクタープロンプト設定
  const SUB_CHAR_PRESETS = [
    { id: 'expressionless', label: '無表情固定', prompt: 'always expressionless, blank face, no emotion' },
    { id: 'no_fingers', label: '手に指はない', prompt: 'hands without fingers, mitten-like hands, no individual fingers' },
    { id: 'no_protagonist', label: '主役化禁止', prompt: 'always in background, never the main subject, supporting role only' },
    { id: 'invisible', label: '人物からは見えない', prompt: 'invisible to other characters, unnoticed presence, ghost-like existence' },
    { id: 'physical', label: '物理干渉可能', prompt: 'can interact with physical objects, touching and moving things' },
    { id: 'size_20cm', label: 'サイズ20cm', prompt: 'tiny character approximately 20cm tall, miniature figure scale' },
  ] as const;



  const [activeSubTags, setActiveSubTags] = useState<Set<string>>(new Set(SUB_CHAR_PRESETS.map(p => p.id)));
  const [customSubPrompt, setCustomSubPrompt] = useState('');
  const [mainCharPrompt, setMainCharPrompt] = useState('');

  // サブキャラ用プロンプト生成
  const subCharPrompt = [
    ...SUB_CHAR_PRESETS.filter(p => activeSubTags.has(p.id)).map(p => p.prompt),
    ...(customSubPrompt.trim() ? [customSubPrompt.trim()] : []),
  ].join(', ');

  // UI状態
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ResultItem[]>([]);

  // カット構成ステート
  const [cuts, setCuts] = useState<CutItem[]>(DEFAULT_CUTS.map(c => ({ ...c })));

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
  const [aiModel, setAiModel] = useState<AiModelType>('openai');
  
  const [stillPromptPanelOpen, setStillPromptPanelOpen] = useState(false);
  const stillPromptPanelRef = useRef<HTMLDivElement>(null);
  const [stillMetaPanelOpen, setStillMetaPanelOpen] = useState(false);
  const [semanticPanelOpen, setSemanticPanelOpen] = useState(false);
  const semanticPanelRef = useRef<HTMLDivElement>(null);
  const [productPanelOpen, setProductPanelOpen] = useState(false);
  const productPanelRef = useRef<HTMLDivElement>(null);
  const [fixedPanelOpen, setFixedPanelOpen] = useState(false);
  const fixedPanelRef = useRef<HTMLDivElement>(null);

  // Video Generation Settings
  const [videoGenModel, setVideoGenModel] = useState<string>('luma');
  const [videoPromptStyle, setVideoPromptStyle] = useState('masterpiece, 8k resolution, highly detailed, smooth motion, high fps');
  const [videoPromptNegative, setVideoPromptNegative] = useState('');
  const [videoMetaPrompt, setVideoMetaPrompt] = useState('動画ジェネレーターに渡すモーション指示やスタイルのベースルールを入力してください。');
  const [videoPromptPanelOpen, setVideoPromptPanelOpen] = useState(false);
  const [videoMetaPanelOpen, setVideoMetaPanelOpen] = useState(false);

  const enabledCuts = cuts.filter(c => c.enabled);

  useEffect(() => {
    const savedFixedMeta = localStorage.getItem('snafty_fixed_meta_prompt');
    if (savedFixedMeta) {
      setFixedElementMetaPrompt(savedFixedMeta);
    }
    const savedAiModel = localStorage.getItem('snafty_ai_model') as AiModelType;
    if (savedAiModel === 'openai' || savedAiModel === 'gemini' || savedAiModel === 'claude') {
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
    if (stNeg !== null) setStillImageNegative(stNeg);
    if (stMeta !== null) setStillImageMetaPrompt(stMeta);
    if (vidModel !== null) setVideoGenModel(vidModel);
    if (vidStyle !== null) setVideoPromptStyle(vidStyle);
    if (vidNeg !== null) setVideoPromptNegative(vidNeg);
    if (vidMeta !== null) setVideoMetaPrompt(vidMeta);
  }, []);

  const saveStillPrompts = () => {
    localStorage.setItem('snafty_still_style', stillImageStyle);
    localStorage.setItem('snafty_still_negative', stillImageNegative);
    alert('静止画プロンプト設定を保存しました。');
  };

  const saveVideoPrompts = () => {
    localStorage.setItem('snafty_video_model', videoGenModel);
    localStorage.setItem('snafty_video_style', videoPromptStyle);
    localStorage.setItem('snafty_video_negative', videoPromptNegative);
    alert('動画生成プロンプト設定を保存しました。');
  };

  const saveVideoMetaPrompt = () => {
    localStorage.setItem('snafty_video_meta_prompt', videoMetaPrompt);
    alert('動画生用のプロンプト指示（メタ）を保存しました。');
  };

  const saveStillMetaPrompt = () => {
    localStorage.setItem('snafty_still_meta_prompt', stillImageMetaPrompt);
    alert('静止画用のプロンプト指示（メタ）を保存しました。');
  };

  const toggleCut = (id: number) => {
    setCuts(prev => prev.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c));
  };



  const updateCutField = (id: number, field: 'title' | 'prompt' | 'camera' | 'semanticPrompt', value: string) => {
    setCuts(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const resetCuts = () => {
    setCuts(DEFAULT_CUTS.map(c => ({ ...c })));
    setEditingCutId(null);
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
        aiModel
      );
      setStagePrompt(generated);
    } catch (err: any) {
      console.error(err);
      alert('要素固定シートの生成に失敗しました: ' + err.message);
    } finally {
      setIsGeneratingFixed(false);
    }
  };

  // ─── PDF自動生成フロー ───
  const handleFullAutoGenerate = async (pdfText: string) => {
    try {
      // Step 1: 要素固定プロンプト生成
      console.log('[AutoGenerate] Step 1: 要素固定プロンプト生成中...');
      setIsGeneratingFixed(true);
      const reg = localStorage.getItem('snafty_regulation') || DEFAULT_REGULATION;
      const cutMeta = localStorage.getItem('snafty_meta_prompt') || '';

      const generatedFixed = await generateFixedElements(
        pdfText,
        reg,
        cutMeta,
        fixedElementMetaPrompt,
        aiModel
      );
      setStagePrompt(generatedFixed);
      setIsGeneratingFixed(false);

      // Step 2: 静止画プロンプト生成（AIで自動生成）
      console.log('[AutoGenerate] Step 2: 静止画プロンプト生成中...');
      const stillPromptResponse = await fetch('/api/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'あなたは映像制作の専門家です。ストーリーに基づいて、静止画生成用のスタイルプロンプトを作成してください。'
            },
            {
              role: 'user',
              content: `以下のストーリーに最適な静止画スタイルプロンプトを作成してください。

ストーリー概要:
${pdfText.substring(0, 1000)}

要素固定プロンプト:
${generatedFixed}

以下の形式で回答してください（1行で、カンマ区切り）:
masterpiece, 8k resolution, highly detailed, [ストーリーに合った追加スタイル]`
            }
          ],
          max_tokens: 200
        })
      });

      if (stillPromptResponse.ok) {
        const stillData = await stillPromptResponse.json();
        const stillStyle = stillData.choices?.[0]?.message?.content?.trim() || stillImageStyle;
        setStillImageStyle(stillStyle);
      }

      // Step 3: AIカット割り生成
      console.log('[AutoGenerate] Step 3: AIカット割り生成中...');
      const cutResult = await generateCutComposition(pdfText, reg, cutMeta, 7, aiModel);
      const newCuts = cutResult.cuts.map((row, i) => compositionRowToCutItem(row, i));
      setCuts(newCuts);
      setEditingCutId(null);

      console.log('[AutoGenerate] 完了！');
    } catch (err: any) {
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
      let finalPrompt = targetCut.camera ? `Camera angle: ${targetCut.camera}. ${targetCut.prompt}` : targetCut.prompt;
      if (mainCharPrompt) {
        finalPrompt = `${mainCharPrompt}, ${finalPrompt}`;
      }
      const combinedBase = [stillImageStyle, stagePrompt].filter(Boolean).join(', ');
      if (combinedBase) {
        finalPrompt = `${combinedBase}, ${finalPrompt}`;
      }
      if (stillImageNegative) {
        finalPrompt += ` (negative: ${stillImageNegative})`;
      }
      if (targetCut.showSub && subCharFile && subCharPrompt) {
        finalPrompt += `, with a small companion character: ${subCharPrompt}`;
      }
      const result = await generatePose({
        humanImageUrl: humanDataUrl,
        pose: finalPrompt,
        resolution: '1K',
        format: 'jpeg',
      });
      
      setCuts(prev => prev.map(c => c.id === cutId ? { 
        ...c, 
        isGenerating: false, 
        generatedImageUrl: result.imageUrl 
      } : c));

    } catch (err: any) {
      console.error(`Cut ${cutId} generation error:`, err);
      setCuts(prev => prev.map(c => c.id === cutId ? { ...c, isGenerating: false, errorMessage: err.message || '生成失敗' } : c));
    }
  };

  // 全カットの画像を一括生成
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

    try {
      const humanDataUrl = await fileToDataUrl(humanFile);
      const combinedBase = [stillImageStyle, stagePrompt].filter(Boolean).join(', ');

      for (const cut of enabledCutsToGenerate) {
        // Mark this cut as generating
        setCuts(prev => prev.map(c => c.id === cut.id ? { ...c, isGenerating: true, errorMessage: undefined } : c));

        try {
          let finalPrompt = cut.camera ? `Camera angle: ${cut.camera}. ${cut.prompt}` : cut.prompt;
          if (mainCharPrompt) {
            finalPrompt = `${mainCharPrompt}, ${finalPrompt}`;
          }
          if (combinedBase) {
            finalPrompt = `${combinedBase}, ${finalPrompt}`;
          }
          if (stillImageNegative) {
            finalPrompt += ` (negative: ${stillImageNegative})`;
          }
          if (cut.showSub && subCharFile && subCharPrompt) {
            finalPrompt += `, with a small companion character: ${subCharPrompt}`;
          }

          const result = await generatePose({
            humanImageUrl: humanDataUrl,
            pose: finalPrompt,
            resolution: '1K',
            format: 'jpeg',
          });

          setCuts(prev => prev.map(c => c.id === cut.id ? {
            ...c,
            isGenerating: false,
            generatedImageUrl: result.imageUrl
          } : c));
        } catch (err: any) {
          console.error(`Cut ${cut.id} generation error:`, err);
          setCuts(prev => prev.map(c => c.id === cut.id ? { ...c, isGenerating: false, errorMessage: err.message || '生成失敗' } : c));
        }
      }
    } catch (err: any) {
      console.error('Batch generation error:', err);
      setError(err.message || '画像生成中にエラーが発生しました');
    } finally {
      setIsGenerating(false);
    }
  };

  // キャラクター設定パネル外側クリック検知状態
  const [charPanelOpen, setCharPanelOpen] = useState(false);
  const [characterConfirmed, setCharacterConfirmed] = useState(false);
  const charPanelRef = useRef<HTMLDivElement>(null);

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
    };
    if (charPanelOpen || stillPromptPanelOpen || semanticPanelOpen || productPanelOpen || fixedPanelOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [charPanelOpen, stillPromptPanelOpen, semanticPanelOpen, productPanelOpen, fixedPanelOpen]);

  // VideoModal状態
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [storyboardModalOpen, setStoryboardModalOpen] = useState(false);

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
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xl font-black shadow-lg shadow-purple-500/20 text-white">
              動
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-[#333333] tracking-tight">
                ショート動画 AI
              </h1>
              <p className="text-[10px] text-[#78909C] -mt-0.5 tracking-widest font-medium">７カット自動生成スタジオ</p>
            </div>
          </div>
          <div className="flex items-center gap-3">

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
                  <div className="absolute right-0 top-full mt-2 w-[480px] bg-white dark:bg-[#16161e] border border-[#E0E0E0] dark:border-white/10 rounded-2xl shadow-2xl dark:shadow-purple-500/5 p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-1 h-4 rounded-full bg-gradient-to-b from-cyan-400 to-purple-500"></div>
                      <h3 className="text-xs font-bold text-[#333] dark:text-gray-200 uppercase tracking-wider">キャラクター設定</h3>
                    </div>
                    
                    <div className="flex flex-col gap-6">
                      {/* Main Character Row */}
                      <div className="flex gap-4 items-end border-b border-[#E0E0E0] dark:border-white/10 pb-4">
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
                            <label className="text-[10px] font-bold text-[#78909C] dark:text-gray-400 uppercase tracking-wider mb-1.5 block">感情・基本挙動プロンプト</label>
                            <textarea
                              value={mainCharPrompt}
                              onChange={(e) => setMainCharPrompt(e.target.value)}
                              placeholder="感情、追加の容姿、服装などを入力..."
                              rows={3}
                              className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-2 text-xs text-[#333] dark:text-gray-300 focus:outline-none focus:border-cyan-500/50 placeholder:text-gray-400 dark:placeholder:text-gray-600 resize-none"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Sub Character Row */}
                      <div className="flex gap-4 items-end border-b border-[#E0E0E0] dark:border-white/10 pb-4">
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
                            <div className="flex flex-wrap gap-1 mb-2">
                              {SUB_CHAR_PRESETS.map((tag) => (
                                <button
                                  key={tag.id}
                                  onClick={() => setActiveSubTags(prev => {
                                    const next = new Set(prev);
                                    next.has(tag.id) ? next.delete(tag.id) : next.add(tag.id);
                                    return next;
                                  })}
                                  className={`px-1.5 py-0.5 rounded text-[8px] font-bold border transition-all duration-150 ${
                                    activeSubTags.has(tag.id)
                                      ? 'bg-purple-500/15 border-purple-500/40 text-purple-500 dark:text-purple-300'
                                      : 'bg-transparent border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400'
                                  }`}
                                >
                                  {tag.label}
                                </button>
                              ))}
                            </div>
                            <input
                              type="text"
                              value={customSubPrompt}
                              onChange={(e) => setCustomSubPrompt(e.target.value)}
                              placeholder="追加の指示を入力..."
                              className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-[#333] dark:text-gray-300 focus:outline-none focus:border-purple-500/50 placeholder:text-gray-400 dark:placeholder:text-gray-600"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Per-Cut Character Assignment */}
                      <div>
                        <h4 className="text-[10px] font-bold text-[#78909C] dark:text-gray-400 uppercase tracking-wider mb-2">カットごとの登場設定</h4>
                        <div className="space-y-1 max-h-[160px] overflow-y-auto custom-scrollbar pr-1 grid grid-cols-2 gap-x-4">
                          {cuts.map((cut) => (
                            <div key={cut.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all ${
                              cut.enabled ? 'bg-gray-50 dark:bg-white/[0.03]' : 'opacity-30'
                            }`}>
                              <span className="text-[10px] font-bold text-[#78909C] dark:text-gray-500 w-4 text-center">{cut.id}</span>
                              <button
                                onClick={() => setCuts(prev => prev.map(c => c.id === cut.id ? { ...c, showMain: !c.showMain } : c))}
                                className={`flex-1 py-0.5 rounded text-[8px] font-bold border transition-all ${
                                  cut.showMain
                                    ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-500 dark:text-cyan-400'
                                    : 'bg-transparent border-gray-200 dark:border-white/10 text-gray-300 dark:text-gray-600'
                                }`}
                              >
                                メイン
                              </button>
                              <button
                                onClick={() => setCuts(prev => prev.map(c => c.id === cut.id ? { ...c, showSub: !c.showSub } : c))}
                                disabled={!subCharFile}
                                className={`flex-1 py-0.5 rounded text-[8px] font-bold border transition-all ${
                                  !subCharFile
                                    ? 'bg-transparent border-gray-100 dark:border-white/5 text-gray-200 dark:text-gray-700 cursor-not-allowed'
                                    : cut.showSub
                                    ? 'bg-purple-500/10 border-purple-500/30 text-purple-500 dark:text-purple-400'
                                    : 'bg-transparent border-gray-200 dark:border-white/10 text-gray-300 dark:text-gray-600'
                                }`}
                              >
                                IP
                              </button>
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
                  <div className="w-6 h-6 rounded-full bg-[#00d4ff]/10 text-[#00d4ff] flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</div>
                  <div>
                    <p className="text-xs text-[#333333] font-medium">モデル画像をアップロード</p>
                    <p className="text-[10px] text-[#78909C] mt-0.5">正面向きの全身写真が最適</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#00BFA5]/10 text-[#00BFA5] flex items-center justify-center text-[10px] font-bold flex-shrink-0">2</div>
                  <div>
                    <p className="text-xs text-[#333333] font-medium">アイテムをアップロード</p>
                    <p className="text-[10px] text-[#78909C] mt-0.5">白背景の服単体画像が理想的</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#00ff88]/10 text-[#00ff88] flex items-center justify-center text-[10px] font-bold flex-shrink-0">3</div>
                  <div>
                    <p className="text-xs text-[#333333] font-medium">着画を生成</p>
                    <p className="text-[10px] text-[#78909C] mt-0.5">AIが質問し最適な着画を生成</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Features */}
            <div>
              <h3 className="text-[10px] font-semibold text-[#78909C] uppercase tracking-wider mb-4">機能</h3>
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-[11px] text-[#78909C]">
                  <span className="text-[#00BFA5]">✓</span>
                  <span>服のデザイン完全再現</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-[#78909C]">
                  <span className="text-[#00BFA5]">✓</span>
                  <span>服のデザイン完全再現</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-[#78909C]">
                  <span className="text-[#00BFA5]">✓</span>
                  <span>高解像度出力 (4Kまで)</span>
                </div>
              </div>
            </div>

            {/* Best Practices */}
            <div>
              <h3 className="text-[10px] font-semibold text-[#78909C] uppercase tracking-wider mb-4">ベストプラクティス</h3>
              <div className="space-y-2 text-[10px] text-[#78909C]">
                <p>• モデルは正面を向いた全身写真</p>
                <p>• 服は平置きまたはマネキン着用</p>
                <p>• 背景はシンプルなものが理想</p>
                <p>• 高解像度の画像を使用</p>
              </div>
            </div>


            {/* Tech Stack */}

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
              <StoryPdfUploader
                aiModel={aiModel}
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

            {/* Composition Plan Settings */}
            <div className="glass rounded-2xl p-4">
              <div className="flex items-center justify-between mb-4">
                {/* Title on the Left */}
                <div className="flex items-center gap-3">
                  <div className="w-1 h-5 rounded-full bg-gradient-to-b from-cyan-400 to-purple-500"></div>
                  <h2 className="text-[#333333] dark:text-gray-200 font-semibold text-sm">構成表設定（{enabledCuts.length}カット）</h2>
                </div>

                {/* Toolbar on the Right */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setStoryboardModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all shadow-sm bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-violet-500/20 hover:shadow-violet-500/40 hover:scale-105"
                  >
                    <BookOpen size={10} />
                    PDF自動生成
                  </button>
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

                  <button
                    onClick={resetCuts}
                    className="flex items-center gap-1 text-[10px] text-[#78909C] hover:text-[#333] dark:hover:text-gray-300 transition-colors whitespace-nowrap"
                  >
                    <RotateCcw size={10} /> リセット
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {cuts.map((cut, index) => (
                  <div
                    key={cut.id}
                    className={`rounded-xl border transition-all duration-200 ${
                      cut.enabled
                        ? 'bg-white/50 dark:bg-white/[0.04] border-[#E0E0E0] dark:border-white/10 shadow-sm'
                        : 'bg-white/20 dark:bg-white/[0.01] border-[#E0E0E0] dark:border-white/5 opacity-40'
                    }`}
                  >
                    <div className="flex items-center gap-2 p-3">
                      {/* Image Thumbnail & Status */}
                      <div className="relative w-11 h-[78px] rounded-md shrink-0 border border-[#E0E0E0] dark:border-white/10 shadow-sm overflow-hidden group bg-[#F5F5F5] dark:bg-white/5 flex items-center justify-center">
                        {cut.generatedImageUrl ? (
                          <img src={cut.generatedImageUrl} alt="cut" className="w-full h-full object-cover" />
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
                          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
                        <div>
                          <label className="text-[9px] text-[#78909C] dark:text-gray-500 uppercase tracking-wider mb-1.5 mt-3 block">プロンプト詳細</label>
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
                            <div className="mt-3 relative h-40 bg-black/5 dark:bg-black/20 rounded-lg overflow-hidden border border-[#E0E0E0] dark:border-white/10 flex justify-center items-center p-2">
                              <img 
                                src={cut.generatedImageUrl} 
                                alt={`Generated for ${cut.title}`} 
                                className="h-full w-auto object-contain rounded drop-shadow-md" 
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Video Generation Settings */}
            <div className="glass rounded-2xl p-4 mt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-1 h-5 rounded-full bg-gradient-to-b from-blue-400 to-indigo-500"></div>
                  <h2 className="text-[#333333] dark:text-gray-200 font-semibold text-sm">動画生成設定</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setVideoMetaPanelOpen(!videoMetaPanelOpen)}
                    className={`text-[10px] sm:text-xs font-bold transition-colors flex items-center gap-1 ${
                      videoMetaPanelOpen ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                    }`}
                  >
                    プロンプト指示設定
                    <ChevronDown size={12} className={`transition-transform duration-200 ${videoMetaPanelOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <button
                    onClick={() => setVideoPromptPanelOpen(!videoPromptPanelOpen)}
                    className="text-[10px] sm:text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors flex items-center gap-1"
                  >
                    設定を開く
                    <ChevronDown size={12} className={`transition-transform duration-200 ${videoPromptPanelOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>

              {videoMetaPanelOpen && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200 pt-3 border-t border-gray-200 dark:border-white/10 mt-2 mb-4 bg-gray-50 dark:bg-white/5 p-3 rounded-lg">
                  <div>
                    <label className="text-[10px] font-semibold text-[#78909C] dark:text-gray-400 uppercase tracking-wider mb-2 block">
                      [AI用] 動画生成プロンプト指示 (メタプロンプト)
                    </label>
                    <textarea
                      value={videoMetaPrompt}
                      onChange={(e) => setVideoMetaPrompt(e.target.value)}
                      placeholder="AIに対する動画モーションの指示ルールなどを入力してください"
                      className="w-full h-16 bg-white dark:bg-[#1a1a24] border border-gray-200 dark:border-white/10 rounded-lg p-2.5 text-xs text-[#333] dark:text-gray-300 focus:outline-none focus:border-gray-500/50 transition-colors custom-scrollbar resize-y"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => {
                        saveVideoMetaPrompt();
                        setVideoMetaPanelOpen(false);
                      }}
                      className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-200 text-[10px] font-bold rounded-lg transition-colors"
                    >
                      指示を保存して閉じる
                    </button>
                  </div>
                </div>
              )}

              {videoPromptPanelOpen && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200 pt-3 border-t border-gray-200 dark:border-white/10 mt-2">
                  <div className="space-y-1.5">
                    <label className="text-[10px] items-center gap-1.5 flex font-semibold text-[#78909C] dark:text-gray-400 uppercase tracking-wider block">
                      <span className="bg-indigo-400/20 text-indigo-600 dark:text-indigo-400 w-4 h-4 flex items-center justify-center rounded-full text-[9px]">1</span>
                      使用モデル (ジェネレーター)
                    </label>
                    <select
                      value={videoGenModel}
                      onChange={(e) => setVideoGenModel(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-2.5 text-xs text-[#333] dark:text-gray-300 focus:outline-none focus:border-indigo-500/50 transition-colors"
                    >
                      <option value="luma">Luma Dream Machine</option>
                      <option value="runway">Runway Gen-3 Alpha</option>
                      <option value="haiper">Haiper AI</option>
                      <option value="sora">OpenAI Sora</option>
                      <option value="kling">Kling AI</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] items-center gap-1.5 flex font-semibold text-[#78909C] dark:text-gray-400 uppercase tracking-wider mb-2">
                      <span className="bg-blue-400/20 text-blue-600 dark:text-blue-400 w-4 h-4 flex items-center justify-center rounded-full text-[9px]">2</span>
                      共通モーション・スタイル
                    </label>
                    <textarea
                      value={videoPromptStyle}
                      onChange={(e) => setVideoPromptStyle(e.target.value)}
                      placeholder="例: smooth motion, high fps, cinematic pan... (全カットに共通して追加する動画の動きやスタイルのベース指定)"
                      className="w-full h-16 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-2.5 text-xs text-[#333] dark:text-gray-300 focus:outline-none focus:border-blue-500/50 transition-colors custom-scrollbar resize-y"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] items-center gap-1.5 flex font-semibold text-[#78909C] dark:text-gray-400 uppercase tracking-wider mb-2">
                      <span className="bg-cyan-400/20 text-cyan-600 dark:text-cyan-400 w-4 h-4 flex items-center justify-center rounded-full text-[9px]">3</span>
                      ネガティブプロンプト
                    </label>
                    <textarea
                      value={videoPromptNegative}
                      onChange={(e) => setVideoPromptNegative(e.target.value)}
                      placeholder="例: jerky movement, morphing, deformed... (生成してほしくない要素・状態)"
                      className="w-full h-16 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-2.5 text-xs text-[#333] dark:text-gray-300 focus:outline-none focus:border-cyan-500/50 transition-colors custom-scrollbar resize-y"
                    />
                  </div>
                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => {
                        saveVideoPrompts();
                        setVideoPromptPanelOpen(false);
                      }}
                      className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-[10px] font-bold rounded-lg transition-colors shadow-md shadow-indigo-500/20"
                    >
                      保存して閉じる
                    </button>
                  </div>
                </div>
              )}
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
                      <h2 className="text-[#333333] dark:text-gray-200 font-semibold text-sm">要素固定</h2>
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
                         {isGeneratingFixed ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                         {isGeneratingFixed ? "生成中..." : "生成する"}
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
                              要素固定メタプロンプト
                            </h3>
                            <p className="text-[10px] text-[#78909C] mb-3 leading-relaxed">
                              画像生成時に一貫して適用する、背景やトーンなどを決定するためのAIへの司令です。
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
                                    alert('要素固定メタプロンプトを保存しました。');
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
                </div>

                {/* Still Image Prompt Settings */}
                <div className="glass rounded-2xl p-4 card-hover">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-1 h-5 rounded-full bg-gradient-to-b from-orange-400 to-red-500"></div>
                      <h2 className="text-[#333333] dark:text-gray-200 font-semibold text-sm">静止画プロンプト設定</h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setStillMetaPanelOpen(!stillMetaPanelOpen)}
                        className={`text-[10px] sm:text-xs font-bold transition-colors flex items-center gap-1 ${
                          stillMetaPanelOpen ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                        }`}
                      >
                        プロンプト指示設定
                        <ChevronDown size={12} className={`transition-transform duration-200 ${stillMetaPanelOpen ? 'rotate-180' : ''}`} />
                      </button>
                      <button
                        onClick={() => setStillPromptPanelOpen(!stillPromptPanelOpen)}
                        className="text-[10px] sm:text-xs text-orange-600 dark:text-orange-400 font-bold hover:text-orange-700 dark:hover:text-orange-300 transition-colors flex items-center gap-1"
                      >
                        設定を開く
                        <ChevronDown size={12} className={`transition-transform duration-200 ${stillPromptPanelOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {stillMetaPanelOpen && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200 pt-3 border-t border-gray-200 dark:border-white/10 mt-2 mb-4 bg-gray-50 dark:bg-white/5 p-3 rounded-lg">
                      <div>
                        <label className="text-[10px] font-semibold text-[#78909C] dark:text-gray-400 uppercase tracking-wider mb-2 block">
                          [AI用] 静止画プロンプト指示 (メタプロンプト)
                        </label>
                        <textarea
                          value={stillImageMetaPrompt}
                          onChange={(e) => setStillImageMetaPrompt(e.target.value)}
                          placeholder="AIに対するスタイル指示のルールなどを入力してください"
                          className="w-full h-16 bg-white dark:bg-[#1a1a24] border border-gray-200 dark:border-white/10 rounded-lg p-2.5 text-xs text-[#333] dark:text-gray-300 focus:outline-none focus:border-gray-500/50 transition-colors custom-scrollbar resize-y"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={() => {
                            saveStillMetaPrompt();
                            setStillMetaPanelOpen(false);
                          }}
                          className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-200 text-[10px] font-bold rounded-lg transition-colors"
                        >
                          指示を保存して閉じる
                        </button>
                      </div>
                    </div>
                  )}

                  {stillPromptPanelOpen && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200 pt-3 border-t border-gray-200 dark:border-white/10 mt-2">
                      <div>
                        <label className="text-[10px] items-center gap-1.5 flex font-semibold text-[#78909C] dark:text-gray-400 uppercase tracking-wider mb-2">
                          <span className="bg-yellow-400/20 text-yellow-600 dark:text-yellow-400 w-4 h-4 flex items-center justify-center rounded-full text-[9px]">1</span>
                          画像スタイル・品質
                        </label>
                        <textarea
                          value={stillImageStyle}
                          onChange={(e) => setStillImageStyle(e.target.value)}
                          placeholder="例: masterpiece, 8k resolution, cinematic lighting... (全カットに共通して追加するスタイルのベース指定)"
                          className="w-full h-16 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-2.5 text-xs text-[#333] dark:text-gray-300 focus:outline-none focus:border-yellow-500/50 transition-colors custom-scrollbar resize-y"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] items-center gap-1.5 flex font-semibold text-[#78909C] dark:text-gray-400 uppercase tracking-wider mb-2">
                          <span className="bg-purple-400/20 text-purple-600 dark:text-purple-400 w-4 h-4 flex items-center justify-center rounded-full text-[9px]">2</span>
                          ネガティブプロンプト
                        </label>
                        <textarea
                          value={stillImageNegative}
                          onChange={(e) => setStillImageNegative(e.target.value)}
                          placeholder="例: low quality, blurry, mutated hands... (生成してほしくない要素・状態)"
                          className="w-full h-16 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-2.5 text-xs text-[#333] dark:text-gray-300 focus:outline-none focus:border-purple-500/50 transition-colors custom-scrollbar resize-y"
                        />
                      </div>
                      <div className="flex justify-end pt-2">
                        <button
                          onClick={() => {
                            saveStillPrompts();
                            setStillPromptPanelOpen(false);
                          }}
                          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-bold rounded-lg transition-colors shadow-md shadow-orange-500/20"
                        >
                          保存して閉じる
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 現在の英語プロンプト表示 */}
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-white/10">
                    <label className="text-[9px] font-semibold text-[#78909C] dark:text-gray-500 uppercase tracking-wider mb-1.5 block">
                      現在のプロンプト (English)
                    </label>
                    <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-2.5 text-[10px] text-[#555] dark:text-gray-400 font-mono leading-relaxed break-all max-h-24 overflow-y-auto custom-scrollbar">
                      {stillImageStyle || <span className="text-gray-400 dark:text-gray-600 italic">未設定</span>}
                      {stillImageNegative && (
                        <div className="mt-2 pt-2 border-t border-gray-200 dark:border-white/5">
                          <span className="text-red-400 dark:text-red-500">Negative:</span> {stillImageNegative}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Generate Button */}
                <div className="glass rounded-2xl p-4 animate-in slide-in-from-bottom-4 duration-500">
                  <button
                    onClick={generateAllCutImages}
                    disabled={isGenerating}
                    className={`w-full py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all duration-300 ${
                      isGenerating
                        ? 'bg-[#F5F5F5] text-[#444] cursor-not-allowed border border-[#E0E0E0]'
                        : !humanFile
                        ? 'bg-purple-100 text-purple-400 border border-purple-200 hover:bg-purple-200 transition-colors cursor-pointer dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/30'
                        : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-xl shadow-purple-500/25 hover:shadow-purple-500/40 hover:scale-[1.02]'
                    }`}
                  >
                    {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                    {isGenerating ? `画像生成中... (${cuts.filter(c => c.isGenerating).length > 0 ? cuts.findIndex(c => c.isGenerating) + 1 : 0}/${enabledCuts.length})` : !humanFile ? '画像生成 ※要キャラクター設定' : `画像生成 (${enabledCuts.length}カット)`}
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

      {/* Storyboard Workflow Modal */}
      <StoryboardWorkflowModal
        isOpen={storyboardModalOpen}
        onClose={() => setStoryboardModalOpen(false)}
        aiModel={aiModel}
        existingCharacterFile={humanFile}
      />
    </div>
  );
};

export default App;
