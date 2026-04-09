import React, { useState, useCallback, useEffect, useRef } from 'react';
import ImageUploader from './components/ImageUploader';
import ResultGallery, { generateProjectId } from './components/ResultGallery';
import type { ResultItem } from './components/ResultGallery';
import PromptModal from './components/PromptModal';
import TryOnPromptModal from './components/TryOnPromptModal';
import { useAuth } from './contexts/AuthContext';
import { generateTryOn, fileToDataUrl, type Resolution, type ImageFormat } from './services/falService';
import { generateQuestions, generatePromptFromAnswers, optimizeTryOnPrompt, parsePrompt, analyzeGarmentWithChatGPT, analyzeGarment, describeGarment, analyzePose, type Question, type GarmentAnalysis, type PoseAnalysisResult } from './services/openaiService';
import { useTheme } from './contexts/ThemeContext';
import { supabase } from './services/supabaseClient';
import { getDeviceId, addToHistory } from './services/historyService';
import HistoryPanel from './components/HistoryPanel';
import { useLocation, useNavigate } from 'react-router-dom';

import { Shirt, Layers, Shield, Scissors, Star, Footprints, Watch, User, FlipHorizontal, Sun, Moon } from 'lucide-react';

// アイテムカテゴリの定義
interface GarmentItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  accentColor: string;
  hint: string;
  // 正面
  file: File | null;
  preview: string | null;
  // 背面
  backFile: File | null;
  backPreview: string | null;
  description: string;
  analysis: GarmentAnalysis | null;  // AI分析結果
}

const initialGarments: Omit<GarmentItem, 'file' | 'preview' | 'backFile' | 'backPreview' | 'description' | 'analysis'>[] = [
  { id: 'top', label: 'トップス', icon: <Shirt size={24} strokeWidth={1.5} />, accentColor: '#00BFA5', hint: '白背景の服単体が最適' },
  { id: 'inner', label: 'インナー', icon: <Layers size={24} strokeWidth={1.5} />, accentColor: '#78909C', hint: 'シャツ・肌着・キャミソール等' },
  { id: 'outer', label: 'アウター', icon: <Shield size={24} strokeWidth={1.5} />, accentColor: '#00BFA5', hint: 'ジャケット・コート等' },
  { id: 'bottom', label: 'ボトムス', icon: <Scissors size={24} strokeWidth={1.5} />, accentColor: '#78909C', hint: 'ズボン・スカート等' },
  { id: 'dress', label: 'ワンピース/セットアップ', icon: <Star size={24} strokeWidth={1.5} />, accentColor: '#00BFA5', hint: '全身つながっている服' },
  { id: 'shoes', label: 'シューズ', icon: <Footprints size={24} strokeWidth={1.5} />, accentColor: '#78909C', hint: '靴単体の画像' },
  { id: 'accessory', label: 'アクセサリー', icon: <Watch size={24} strokeWidth={1.5} />, accentColor: '#00BFA5', hint: '時計・バッグ・帽子等' },
];

const App: React.FC = () => {
  const { user, loading, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  
  const location = useLocation();
  const navigate = useNavigate();

  // モデル画像（正面）
  const [humanFile, setHumanFile] = useState<File | null>(null);
  const [humanPreview, setHumanPreview] = useState<string | null>(null);
  // モデル画像（背面）
  const [_humanBackFile, setHumanBackFile] = useState<File | null>(null);
  const [humanBackPreview, setHumanBackPreview] = useState<string | null>(null);

  // 各ガーメントのステート
  const [garments, setGarments] = useState<GarmentItem[]>(
    initialGarments.map(g => ({ ...g, file: null, preview: null, backFile: null, backPreview: null, description: '', analysis: null }))
  );

  // 現在選択中のガーメント（説明編集用）
  const [activeGarmentId, setActiveGarmentId] = useState<string>('top');

  // 表裏切り替え（front/back）
  const [viewSide, setViewSide] = useState<'front' | 'back'>('front');

  // ポーズ指定
  const [selectedPose, setSelectedPose] = useState<string>('');
  const [isAnalyzingPose, setIsAnalyzingPose] = useState(false);
  const [poseQuestionResult, setPoseQuestionResult] = useState<PoseAnalysisResult | null>(null);
  const poseInputRef = useRef<HTMLInputElement>(null);

  // プロンプトモーダル
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [pendingGarmentId, setPendingGarmentId] = useState<string | null>(null);
  const [pendingGarmentFile, setPendingGarmentFile] = useState<File | null>(null);
  const [pendingGarmentPreview, setPendingGarmentPreview] = useState<string | null>(null);
  const [pendingGarmentSide, setPendingGarmentSide] = useState<'front' | 'back'>('front');

  // 解像度と出力形式
  const [resolution, setResolution] = useState<Resolution>('1K');
  const [imageFormat, setImageFormat] = useState<ImageFormat>('png');

  // 分析AIプロバイダー
  type AIProvider = 'gemini' | 'chatgpt';
  const [analysisAI, setAnalysisAI] = useState<AIProvider>('chatgpt');

  // UI状態
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ResultItem[]>([]);

  // TryOnPromptModal状態
  const [tryOnModalOpen, setTryOnModalOpen] = useState(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [reusedPrompt, setReusedPrompt] = useState<string | undefined>(undefined);
  
  // 履歴パネル
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // 使用量トラッキング
  const [usageStats, setUsageStats] = useState({
    generations: 0,      // 着画生成回数
    analyses: 0,         // Gemini分析回数
    optimizations: 0,    // 説明最適化回数
    chatgptCalls: 0,     // ChatGPT呼び出し回数
  });

  // タブタイトルアニメーション
  const originalTitle = useRef('着てみるAI - バーチャル試着');
  const titleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // URLルーターと履歴パネル状態の同期
  useEffect(() => {
    if (location.pathname === '/history') {
      setIsHistoryOpen(true);
    } else {
      setIsHistoryOpen(false);
    }
  }, [location.pathname]);

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

  // コスト計算（概算）
  const calculateCost = () => {
    // Fal.ai Nanobanana2 着画生成コスト（解像度別）
    // Base(1K): ~$0.08, 2K: ~$0.12, 4K: ~$0.16
    const falCostPerGen: Record<Resolution, number> = {
      '1K': 0.08,  // $0.08/生成
      '2K': 0.12,  // $0.12/生成
      '4K': 0.16,  // $0.16/生成
    };

    // Gemini API コスト（概算）
    const geminiCostPerCall = 0.0005; // $0.0005/呼び出し

    // ChatGPT API コスト（概算）
    const chatgptCostPerCall = 0.002; // $0.002/呼び出し

    const falCost = usageStats.generations * falCostPerGen[resolution];
    const geminiCost = (usageStats.analyses + usageStats.optimizations) * geminiCostPerCall;
    const chatgptCost = usageStats.chatgptCalls * chatgptCostPerCall;

    return {
      fal: falCost,
      gemini: geminiCost,
      chatgpt: chatgptCost,
      total: falCost + geminiCost + chatgptCost,
    };
  };

  const cost = calculateCost();

  // モデル画像選択（正面）
  const handleHumanSelect = useCallback(async (file: File) => {
    setHumanFile(file);
    const url = URL.createObjectURL(file);
    setHumanPreview(url);
  }, []);

  // モデル画像選択（背面）
  const handleHumanBackSelect = useCallback(async (file: File) => {
    setHumanBackFile(file);
    const url = URL.createObjectURL(file);
    setHumanBackPreview(url);
  }, []);

  // ガーメント画像選択（正面）- モーダル表示
  const handleGarmentSelect = useCallback((id: string) => async (file: File) => {
    const url = URL.createObjectURL(file);
    setPendingGarmentId(id);
    setPendingGarmentFile(file);
    setPendingGarmentPreview(url);
    setPendingGarmentSide('front');
    setPromptModalOpen(true);
    setActiveGarmentId(id);
  }, []);

  // ガーメント画像選択（背面）- モーダル表示
  const handleGarmentBackSelect = useCallback((id: string) => async (file: File) => {
    const url = URL.createObjectURL(file);
    setPendingGarmentId(id);
    setPendingGarmentFile(file);
    setPendingGarmentPreview(url);
    setPendingGarmentSide('back');
    setPromptModalOpen(true);
    setActiveGarmentId(id);
  }, []);

  // モーダルで説明を確定（分析結果も保存）
  const handlePromptSubmit = useCallback((description: string, analysis?: GarmentAnalysis) => {
    if (!pendingGarmentId || !pendingGarmentFile || !pendingGarmentPreview) return;

    if (pendingGarmentSide === 'front') {
      setGarments(prev => prev.map(g =>
        g.id === pendingGarmentId
          ? { ...g, file: pendingGarmentFile, preview: pendingGarmentPreview, description, analysis: analysis || null }
          : g
      ));
    } else {
      setGarments(prev => prev.map(g =>
        g.id === pendingGarmentId
          ? { ...g, backFile: pendingGarmentFile, backPreview: pendingGarmentPreview }
          : g
      ));
    }

    // リセット
    setPendingGarmentId(null);
    setPendingGarmentFile(null);
    setPendingGarmentPreview(null);
  }, [pendingGarmentId, pendingGarmentFile, pendingGarmentPreview, pendingGarmentSide]);

  // モーダルでAI最適化
  const handlePromptOptimize = useCallback(async (): Promise<string> => {
    if (!pendingGarmentFile) return '';
    const base64 = await fileToDataUrl(pendingGarmentFile);
    const desc = await describeGarment(base64);
    setUsageStats(prev => ({ ...prev, optimizations: prev.optimizations + 1 }));
    return desc;
  }, [pendingGarmentFile]);

  // モーダルでAI分析（選択されたAIを使用）
  const handlePromptAnalyze = useCallback(async () => {
    if (!pendingGarmentFile) throw new Error('No file');
    const base64 = await fileToDataUrl(pendingGarmentFile);

    let result;
    if (analysisAI === 'chatgpt') {
      result = await analyzeGarmentWithChatGPT(base64);
      setUsageStats(prev => ({ ...prev, chatgptCalls: prev.chatgptCalls + 1 }));
    } else {
      result = await analyzeGarment(base64);
      setUsageStats(prev => ({ ...prev, analyses: prev.analyses + 1 }));
    }
    return result;
  }, [pendingGarmentFile, analysisAI]);

  // ガーメントクリア（正面）
  const handleGarmentClear = useCallback((id: string) => () => {
    setGarments(prev => prev.map(g =>
      g.id === id ? { ...g, file: null, preview: null } : g
    ));
  }, []);

  // ガーメントクリア（背面）
  const handleGarmentBackClear = useCallback((id: string) => () => {
    setGarments(prev => prev.map(g =>
      g.id === id ? { ...g, backFile: null, backPreview: null } : g
    ));
  }, []);

  // アップロード済みのガーメントを取得
  const uploadedGarments = garments.filter(g => g.file !== null);

  // 着画生成ボタンクリック時 - モーダルを開く
  const handleOpenTryOnModal = useCallback(() => {
    if (!humanFile || uploadedGarments.length === 0) return;
    setTryOnModalOpen(true);
  }, [humanFile, uploadedGarments]);

  // 分析結果を詳細な説明文に変換
  const analysisToDescription = (analysis: GarmentAnalysis | null): string => {
    if (!analysis) return '';

    const parts: string[] = [];
    if (analysis.type) parts.push(`Type: ${analysis.type}`);
    if (analysis.color) parts.push(`Color: ${analysis.color}`);
    if (analysis.pattern && analysis.pattern !== '無地') parts.push(`Pattern: ${analysis.pattern}`);
    if (analysis.buttons && analysis.buttons !== 'なし') parts.push(`Buttons: ${analysis.buttons}`);
    if (analysis.pockets && analysis.pockets !== 'なし') parts.push(`Pockets: ${analysis.pockets}`);
    if (analysis.collar && analysis.collar !== 'なし') parts.push(`Collar: ${analysis.collar}`);
    if (analysis.sleeves) parts.push(`Sleeves: ${analysis.sleeves}`);
    if (analysis.material && analysis.material !== '不明') parts.push(`Material: ${analysis.material}`);
    if (analysis.decorations && analysis.decorations !== '特になし') parts.push(`Decorations: ${analysis.decorations}`);
    if (analysis.extra) parts.push(`Additional: ${analysis.extra}`);

    return parts.join('. ');
  };

  // ChatGPTで質問を生成
  const handleGenerateQuestions = useCallback(async (): Promise<Question[]> => {
    if (!humanFile || uploadedGarments.length === 0) return [];

    setIsGeneratingQuestions(true);
    try {
      const humanDataUrl = await fileToDataUrl(humanFile);
      let allQuestions: Question[] = [];

      // 各アイテムごとに質問を生成
      for (const garment of uploadedGarments) {
        const garmentDataUrl = await fileToDataUrl(garment.file!);
        const desc = garment.description || garment.label;
        const analysisDesc = analysisToDescription(garment.analysis);
        const fullDesc = analysisDesc ? `${desc} [${analysisDesc}]` : desc;

        const questions = await generateQuestions(humanDataUrl, garmentDataUrl, fullDesc || undefined, selectedPose);
        
        // アイテムラベルを付与して結合
        const taggedQuestions = questions.map(q => ({
          ...q,
          id: `${garment.id}_${q.id}`,
          garmentLabel: garment.label
        }));
        
        allQuestions = [...allQuestions, ...taggedQuestions];
        setUsageStats(prev => ({ ...prev, chatgptCalls: prev.chatgptCalls + 1 }));
      }

      return allQuestions;
    } catch (e: any) {
      console.error('Question generation error:', e);
      throw e;
    } finally {
      setIsGeneratingQuestions(false);
    }
  }, [humanFile, uploadedGarments]);

  // 回答からプロンプトを生成
  const handleGeneratePromptFromAnswers = useCallback(async (questions: Question[]): Promise<string> => {
    if (!humanFile || uploadedGarments.length === 0) return '';

    try {
      const humanDataUrl = await fileToDataUrl(humanFile);
      const primaryGarment = uploadedGarments[0];
      const garmentDataUrl = await fileToDataUrl(primaryGarment.file!);

      // 全アイテムの説明と分析結果を結合（詳細に）
      const combinedDescription = uploadedGarments
        .map(g => {
          const analysisDesc = analysisToDescription(g.analysis);
          const desc = g.description || g.label;
          return analysisDesc ? `${desc} [GARMENT DETAILS: ${analysisDesc}]` : desc;
        })
        .join('; ');

      const prompt = await generatePromptFromAnswers(
        humanDataUrl,
        garmentDataUrl,
        questions,
        combinedDescription || undefined,
        selectedPose
      );
      setUsageStats(prev => ({ ...prev, chatgptCalls: prev.chatgptCalls + 1 }));
      return prompt;
    } catch (e: any) {
      console.error('Prompt generation error:', e);
      throw e;
    }
  }, [humanFile, uploadedGarments]);

  // プロンプト最適化
  const handleOptimizeTryOnPrompt = useCallback(async (prompt: string): Promise<string> => {
    try {
      const result = await optimizeTryOnPrompt(prompt);
      setUsageStats(prev => ({ ...prev, chatgptCalls: prev.chatgptCalls + 1 }));
      return result;
    } catch (e: any) {
      console.error('Prompt optimization error:', e);
      return prompt;
    }
  }, []);

  // 着画生成（プロンプト指定）
  const handleGenerateWithPrompt = useCallback(async (fullPrompt: string) => {
    if (!humanFile || uploadedGarments.length === 0) return;

    setIsGenerating(true);
    setError(null);

    try {
      console.log('[Generate] Starting generation...');
      const humanDataUrl = await fileToDataUrl(humanFile);
      console.log('[Generate] Human image size:', Math.round(humanDataUrl.length / 1024), 'KB');

      // 各ガーメントごとに生成（現在のAPIは1つずつ）
      // メインのガーメント（上着優先）で生成
      const primaryGarment = uploadedGarments[0];
      const garmentDataUrl = await fileToDataUrl(primaryGarment.file!);
      console.log('[Generate] Garment image size:', Math.round(garmentDataUrl.length / 1024), 'KB');

      // プロンプトをポジティブ/ネガティブに分離
      const { positive, negative } = parsePrompt(fullPrompt);
      console.log('[Generate] Positive prompt:', positive?.substring(0, 100));

      const startTime = Date.now();
      const result = await generateTryOn({
        humanImageUrl: humanDataUrl,
        garmentImageUrl: garmentDataUrl,
        description: positive || undefined,
        negativePrompt: negative || undefined,
        resolution,
        format: imageFormat,
        pose: selectedPose || undefined,
      });
      const endTime = Date.now();
      const generationTimeMs = endTime - startTime;

      console.log('[Generate] Result:', result.imageUrl?.substring(0, 100));
      console.log(`[Generate] Time: ${generationTimeMs}ms`);

      const newResult: ResultItem = {
        id: Date.now().toString(),
        projectId: generateProjectId(),
        imageUrl: result.imageUrl,
        timestamp: new Date(),
        description: fullPrompt || undefined,
        resolution: resolution,
        garmentType: primaryGarment.label,
        generationTimeMs,
      };

      setResults(prev => [newResult, ...prev]);
      
      // ローカル履歴に保存
      addToHistory({
        id: newResult.id,
        imageUrl: newResult.imageUrl || '',
        timestamp: newResult.timestamp.toISOString(),
        description: newResult.description || '',
        resolution: newResult.resolution || '',
        format: imageFormat,
        garmentLabels: uploadedGarments.map(g => g.label),
        generationTimeMs,
      });

      // Supabaseに履歴を保存
      const deviceId = getDeviceId();
      supabase.from('generations').insert({
        device_id: deviceId,
        project_id: newResult.projectId,
        image_url: newResult.imageUrl,
        garment_types: uploadedGarments.map(g => g.id),
        generation_time_ms: generationTimeMs,
        description: newResult.description || '',
        resolution: newResult.resolution,
        format: imageFormat,
      }).then(({ error }) => {
        if (error) console.error('Failed to save to Supabase:', error);
      });

      setUsageStats(prev => ({ ...prev, generations: prev.generations + 1 }));
      setTryOnModalOpen(false);
    } catch (e: any) {
      console.error('[Generate] Error:', e);
      setTryOnModalOpen(false);  // エラー時もモーダルを閉じてエラーを見えるようにする
      setError(`生成エラー: ${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  }, [humanFile, uploadedGarments, resolution, imageFormat, selectedPose]);

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
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#00BFA5] to-[#78909C] flex items-center justify-center text-xl font-black shadow-lg shadow-teal-500/20">
              着
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-[#333333] tracking-tight">
                着てみるAI
              </h1>
              <p className="text-[10px] text-[#78909C] -mt-0.5 tracking-widest font-medium">スタジオは、もういらない。</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Theme Toggle Button */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-xl bg-[#FAFAFA] dark:bg-[#1a1a24] text-[#78909C] border border-[#E0E0E0] dark:border-white/10 hover:bg-[#F5F5F5] dark:hover:bg-[#2a2a36] hover:text-[#333333] dark:hover:text-white transition-all shadow-sm"
              >
                {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
              </button>

              {/* History Button */}
            <button
              onClick={() => navigate('/history')}
              className="flex items-center gap-2 text-[11px] px-4 py-2 rounded-lg bg-[#F5F5F5] text-[#78909C] border border-[#E0E0E0] hover:text-[#00ff88] hover:border-[#00ff88]/30 hover:bg-[#00ff88]/5 transition-all duration-300"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="hidden sm:inline">履歴</span>
              {results.length > 0 && (
                <span className="bg-[#00BFA5] text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                  {results.length}
                </span>
              )}
            </button>
            {user && (
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-[#78909C]">
                  {user.email?.split('@')[0]}
                </span>
                <button
                  onClick={() => signOut()}
                  className="text-[11px] px-4 py-2 rounded-lg bg-[#F5F5F5] text-[#78909C] border border-[#E0E0E0] hover:text-red-400 hover:border-red-400/30 hover:bg-red-400/5 transition-all duration-300"
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
        {/* Left Sidebar - How to Use */}
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
                  <span>AIによる着こなし提案</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-[#78909C]">
                  <span className="text-[#00BFA5]">✓</span>
                  <span>複数アイテム対応</span>
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Center Panel: Inputs */}
            <div className="lg:col-span-5 space-y-6">
              {/* Settings: Resolution & Format */}
              <div className="glass rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1 h-5 rounded-full bg-gradient-to-b from-[#fbbf24] to-[#ff6b35]"></div>
                  <h2 className="text-[#333333] font-semibold text-sm">出力設定</h2>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-medium text-[#78909C] mb-1.5 block uppercase tracking-wider">解像度</label>
                    <select
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value as Resolution)}
                      className="w-full bg-[#FAFAFA] border border-[#E0E0E0] rounded-lg px-3 py-2.5 text-xs text-[#333333] focus:outline-none focus:border-[#00BFA5]/50 transition-all duration-300 cursor-pointer appearance-none"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2378909C'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 8px center',
                        backgroundSize: '14px',
                      }}
                    >
                      <option value="1K">1K</option>
                      <option value="2K">2K</option>
                      <option value="4K">4K</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-[#78909C] mb-1.5 block uppercase tracking-wider">形式</label>
                    <select
                      value={imageFormat}
                      onChange={(e) => setImageFormat(e.target.value as ImageFormat)}
                      className="w-full bg-[#FAFAFA] border border-[#E0E0E0] rounded-lg px-3 py-2.5 text-xs text-[#333333] focus:outline-none focus:border-[#fbbf24]/50 transition-all duration-300 cursor-pointer appearance-none"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23666'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 8px center',
                        backgroundSize: '14px',
                      }}
                    >
                      <option value="png">PNG</option>
                      <option value="jpeg">JPEG</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-[#78909C] mb-1.5 block uppercase tracking-wider">分析AI</label>
                    <select
                      value={analysisAI}
                      onChange={(e) => setAnalysisAI(e.target.value as AIProvider)}
                      className="w-full bg-[#FAFAFA] border border-[#E0E0E0] rounded-lg px-3 py-2.5 text-xs text-[#333333] focus:outline-none focus:border-[#00BFA5]/50 transition-all duration-300 cursor-pointer appearance-none"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2378909C'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 8px center',
                        backgroundSize: '14px',
                      }}
                    >
                      <option value="gemini">Gemini</option>
                      <option value="chatgpt">ChatGPT</option>
                    </select>
                  </div>
                </div>
                {/* Cost Display */}
                {(usageStats.generations > 0 || usageStats.analyses > 0 || usageStats.chatgptCalls > 0) && (
                  <div className="mt-3 pt-3 border-t border-[#E0E0E0]">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-[#78909C]">今回の概算費用</span>
                      <span className="text-[#fbbf24] font-semibold">${cost.total.toFixed(4)}</span>
                    </div>
                    <div className="flex gap-2 mt-1.5 text-[9px] text-[#78909C]">
                      <span>生成:{usageStats.generations}</span>
                      <span>分析:{usageStats.analyses}</span>
                      <span>GPT:{usageStats.chatgptCalls}</span>
                    </div>
                  </div>
                )}
              </div>

            {/* Front/Back Toggle */}
            <div className="glass rounded-2xl p-1.5">
              <div className="flex gap-1.5">
                <button
                  onClick={() => setViewSide('front')}
                  className={`flex-1 py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-300 ${
                    viewSide === 'front'
                      ? 'bg-gradient-to-r from-[#00d4ff] to-[#00ff88] text-[#333333] shadow-lg shadow-teal-200/20'
                      : 'text-[#78909C] hover:text-[#999] hover:bg-[#F5F5F5]'
                  }`}
                >
                  <span className="text-lg">🧑</span> 正面
                </button>
                <button
                  onClick={() => setViewSide('back')}
                  className={`flex-1 py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-300 ${
                    viewSide === 'back'
                      ? 'bg-gradient-to-r from-[#00ff88] to-[#00d4ff] text-[#333333] shadow-lg shadow-green-500/20'
                      : 'text-[#78909C] hover:text-[#999] hover:bg-[#F5F5F5]'
                  }`}
                >
                  <span className="text-lg">🔙</span> 背面
                </button>
              </div>
            </div>

            {/* Model Upload */}
            <div className="glass rounded-2xl p-6 card-hover">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-1 h-6 rounded-full bg-gradient-to-b from-[#00d4ff] to-[#00ff88]"></div>
                <h2 className="text-[#333333] font-semibold text-sm">モデル画像</h2>
                <span className={`text-[9px] px-2.5 py-1 rounded-full font-medium ${
                  viewSide === 'front'
                    ? 'bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20'
                    : 'bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20'
                }`}>
                  {viewSide === 'front' ? '正面' : '背面'}
                </span>
              </div>
              <ImageUploader
                label={viewSide === 'front' ? 'モデル正面' : 'モデル背面'}
                icon={viewSide === 'front' ? <User size={24} /> : <FlipHorizontal size={24} />}
                previewUrl={viewSide === 'front' ? humanPreview : humanBackPreview}
                onFileSelect={viewSide === 'front' ? handleHumanSelect : handleHumanBackSelect}
                onClear={viewSide === 'front'
                  ? () => { setHumanFile(null); setHumanPreview(null); }
                  : () => { setHumanBackFile(null); setHumanBackPreview(null); }
                }
                accentColor={viewSide === 'front' ? '#00d4ff' : '#00ff88'}
                hint={viewSide === 'front' ? '正面の全身画像' : '背面の全身画像（任意）'}
              />
              {/* Pose Selection Panel */}
              <div className="mt-4 pt-4 border-t border-[#E0E0E0]">
                <div className="flex items-center justify-between mb-3 text-sm">
                  <span className="font-bold text-[#333333]">ポーズ指定</span>
                </div>
                <div>
                  <select
                    value={selectedPose}
                    onChange={(e) => setSelectedPose(e.target.value)}
                    className="w-full bg-white border border-[#E0E0E0] rounded-xl px-4 py-2.5 text-sm text-[#333333] focus:outline-none focus:border-[#00BFA5] transition-colors"
                  >
                    <option value="">🚫 指定なし</option>
                    <option value="standing front-facing">🧍 立ち（正面）</option>
                    <option value="standing with hands on hips">💪 腰に手</option>
                    <option value="walking naturally">🚶 歩行</option>
                    <option value="sitting on a chair">🪑 座り</option>
                    <option value="leaning against a wall casually">😎 壁寄りかかり</option>
                    <option value="arms crossed confidently">🤝 腕組み</option>
                    <option value="looking over shoulder">👀 振り返り</option>
                    <option value="standing with one hand in pocket">🫴 ポケットに手</option>
                    {selectedPose && ![
                      '', 'standing front-facing', 'standing with hands on hips', 
                      'walking naturally', 'sitting on a chair', 'leaning against a wall casually', 
                      'arms crossed confidently', 'looking over shoulder', 'standing with one hand in pocket'
                    ].includes(selectedPose) && (
                      <option value={selectedPose}>✨ AI分析: {selectedPose}</option>
                    )}
                  </select>
                </div>
                
                <div className="mt-3 relative">
                  <input 
                    type="file"
                    ref={poseInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setIsAnalyzingPose(true);
                      try {
                        const dataUrl = await fileToDataUrl(file);
                        const result = await analyzePose(dataUrl);
                        setPoseQuestionResult(result);
                      } catch (err) {
                        console.error('Pose analysis error:', err);
                      } finally {
                        setIsAnalyzingPose(false);
                        e.target.value = ''; // reset
                      }
                    }}
                  />
                  <button
                    onClick={() => poseInputRef.current?.click()}
                    disabled={isAnalyzingPose}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium bg-white text-[#78909C] border border-[#E0E0E0] hover:border-[#00BFA5]/50 hover:bg-[#00BFA5]/10 transition-all duration-200 disabled:opacity-50"
                  >
                    {isAnalyzingPose ? (
                      <>
                        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        分析中...
                      </>
                    ) : (
                      <>📸 別の画像からポーズ分析</>
                    )}
                  </button>
                  <p className="text-[9px] text-[#78909C] mt-2 text-center">
                    💡 画像をアップロードしてAIにポーズを自動判断させます
                  </p>
                </div>
              </div>
            </div>

            {/* Garment Uploads */}
            <div className="glass rounded-2xl p-6 card-hover">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-1 h-6 rounded-full bg-gradient-to-b from-[#00BFA5] to-[#fbbf24]"></div>
                <h2 className="text-[#333333] font-semibold text-sm">アイテム</h2>
                <span className={`text-[9px] px-2.5 py-1 rounded-full font-medium ${
                  viewSide === 'front'
                    ? 'bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20'
                    : 'bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20'
                }`}>
                  {viewSide === 'front' ? '正面' : '背面'}
                </span>
                {uploadedGarments.length > 0 && (
                  <span className="text-[9px] bg-[#00BFA5]/10 text-[#00BFA5] px-2.5 py-1 rounded-full font-medium border border-[#00BFA5]/20">
                    {uploadedGarments.length}点
                  </span>
                )}
              </div>

              {/* Garment Selector */}
              <div className="mb-4">
                <label className="text-[10px] font-medium text-[#78909C] mb-1.5 block uppercase tracking-wider">アイテムの種類</label>
                <select
                  value={activeGarmentId}
                  onChange={(e) => setActiveGarmentId(e.target.value)}
                  className="w-full bg-[#FAFAFA] border border-[#E0E0E0] rounded-lg px-3 py-2.5 text-sm text-[#333333] focus:outline-none focus:border-[#00BFA5]/50 transition-all duration-300 cursor-pointer appearance-none font-medium"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2378909C'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 12px center',
                    backgroundSize: '16px',
                  }}
                >
                  <optgroup label="上半身">
                    <option value="top">👕 トップス</option>
                    <option value="inner">🎽 インナー</option>
                    <option value="outer">🧥 アウター</option>
                  </optgroup>
                  <optgroup label="下半身・足元">
                    <option value="bottom">👖 ボトムス</option>
                    <option value="shoes">👟 シューズ</option>
                  </optgroup>
                  <optgroup label="全身">
                    <option value="dress">👗 ワンピース/セットアップ</option>
                  </optgroup>
                  <optgroup label="その他">
                    <option value="accessory">⌚ アクセサリー</option>
                  </optgroup>
                </select>
              </div>

              {/* Uploaded Garments Status */}
              {uploadedGarments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {garments.filter(g => g.preview || g.backPreview).map(g => (
                    <button
                      key={`badge-${g.id}`}
                      onClick={() => setActiveGarmentId(g.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        activeGarmentId === g.id
                          ? 'border-[#00BFA5] bg-[#00BFA5]/10 text-[#333333]'
                          : 'border-[#E0E0E0] bg-white text-[#78909C] hover:bg-[#F5F5F5]'
                      }`}
                    >
                      <span>{g.icon}</span>
                      <span>{g.label}</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00BFA5] ml-1"></span>
                    </button>
                  ))}
                </div>
              )}

              {/* Active Garment Uploader */}
              <div className="max-w-xs mx-auto">
                {garments.filter(g => g.id === activeGarmentId).map(garment => (
                  <div
                    key={garment.id}
                    className="transition-all duration-300 rounded-xl"
                  >
                    <ImageUploader
                      label={garment.label}
                      icon={garment.icon}
                      previewUrl={viewSide === 'front' ? garment.preview : garment.backPreview}
                      onFileSelect={viewSide === 'front' ? handleGarmentSelect(garment.id) : handleGarmentBackSelect(garment.id)}
                      onClear={viewSide === 'front' ? handleGarmentClear(garment.id) : handleGarmentBackClear(garment.id)}
                      accentColor={garment.accentColor}
                      hint={garment.hint}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Generate Button */}
            <div className="glass rounded-2xl p-4">
              <button
                onClick={handleOpenTryOnModal}
                disabled={isGenerating || !humanFile || uploadedGarments.length === 0}
                className={`w-full py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all duration-300 ${
                  isGenerating || !humanFile || uploadedGarments.length === 0
                    ? 'bg-[#F5F5F5] text-[#444] cursor-not-allowed border border-[#E0E0E0]'
                    : 'bg-gradient-to-r from-[#00BFA5] via-[#78909C] to-[#00BFA5] text-[#333333] shadow-xl shadow-teal-500/25 hover:shadow-teal-500/40 hover:scale-[1.02] animate-gradient'
                }`}
              >
                {isGenerating ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    着画を生成中...
                  </>
                ) : (
                  <>✨ 着画を生成 ({uploadedGarments.length}アイテム)</>
                )}
              </button>

              {/* Error */}
              {error && (
                <div className="mt-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                  {error}
                </div>
              )}
            </div>

          </div>

          {/* Right Panel: Results */}
          <div className="lg:col-span-7" data-results>
            <div className="glass rounded-2xl p-6 min-h-[600px]">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-1 h-6 rounded-full bg-gradient-to-b from-[#00ff88] to-[#00d4ff]"></div>
                  <h2 className="text-[#333333] font-semibold text-sm">生成結果</h2>
                  {results.length > 0 && (
                    <span className="text-[9px] bg-[#00ff88]/10 text-[#00ff88] px-2.5 py-1 rounded-full font-medium border border-[#00ff88]/20">
                      {results.length}
                    </span>
                  )}
                </div>
                {results.length > 0 && (
                  <button
                    onClick={() => setResults([])}
                    className="text-[10px] text-[#78909C] hover:text-red-400 transition-colors duration-300"
                  >
                    すべてクリア
                  </button>
                )}
              </div>
              <ResultGallery results={results} />
            </div>

            {/* Character Sheet */}
            {(humanPreview || humanBackPreview || uploadedGarments.length > 0) && (
              <div className="glass rounded-2xl p-6 mt-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-1 h-6 rounded-full bg-gradient-to-b from-[#ff6b35] to-[#fbbf24]"></div>
                  <h2 className="text-[#333333] font-semibold text-sm">キャラクターシート</h2>
                </div>

                {/* Model Row */}
                <div className="mb-5">
                  <p className="text-[10px] text-[#00d4ff] font-medium uppercase tracking-wider mb-3">Model</p>
                  <div className="grid grid-cols-4 gap-3">
                    {/* Model Front */}
                    <div>
                      <p className="text-[8px] text-[#00d4ff]/60 mb-1.5 text-center">Front</p>
                      {humanPreview ? (
                        <div className="aspect-[3/4] bg-[#FAFAFA] rounded-lg overflow-hidden border-2 border-[#00d4ff]/30">
                          <img src={humanPreview} alt="Model Front" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="aspect-[3/4] bg-[#FAFAFA] rounded-lg border border-dashed border-[#00d4ff]/20 flex items-center justify-center">
                          <span className="text-lg opacity-20">🧑</span>
                        </div>
                      )}
                    </div>
                    {/* Model Back */}
                    <div>
                      <p className="text-[8px] text-[#00ff88]/60 mb-1.5 text-center">Back</p>
                      {humanBackPreview ? (
                        <div className="aspect-[3/4] bg-[#FAFAFA] rounded-lg overflow-hidden border-2 border-[#00ff88]/30">
                          <img src={humanBackPreview} alt="Model Back" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="aspect-[3/4] bg-[#FAFAFA] rounded-lg border border-dashed border-[#00ff88]/20 flex items-center justify-center">
                          <span className="text-lg opacity-20">🔙</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Items Row */}
                <div>
                  <p className="text-[10px] text-[#00BFA5] font-medium uppercase tracking-wider mb-3">Items</p>
                  <div className="grid grid-cols-4 gap-3">
                    {garments.map(g => (
                      <div key={g.id} className="space-y-1.5">
                        <div className="flex justify-center" style={{ color: `${g.accentColor}99` }}>
                          <span className="scale-[0.5]">{g.icon}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          {/* Front */}
                          {g.preview ? (
                            <div
                              className="aspect-square bg-[#FAFAFA] rounded overflow-hidden border"
                              style={{ borderColor: `${g.accentColor}50` }}
                            >
                              <img src={g.preview} alt={`${g.label} Front`} className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div
                              className="aspect-square bg-[#FAFAFA] rounded border border-dashed flex items-center justify-center"
                              style={{ borderColor: `${g.accentColor}20` }}
                            >
                              <span className="text-[8px] opacity-20">F</span>
                            </div>
                          )}
                          {/* Back */}
                          {g.backPreview ? (
                            <div
                              className="aspect-square bg-[#FAFAFA] rounded overflow-hidden border"
                              style={{ borderColor: `${g.accentColor}50` }}
                            >
                              <img src={g.backPreview} alt={`${g.label} Back`} className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div
                              className="aspect-square bg-[#FAFAFA] rounded border border-dashed flex items-center justify-center"
                              style={{ borderColor: `${g.accentColor}20` }}
                            >
                              <span className="text-[8px] opacity-20">B</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Summary */}
                <div className="mt-5 pt-5 border-t border-[#E0E0E0]">
                  <div className="flex flex-wrap gap-2">
                    <span className="text-[9px] px-2.5 py-1.5 rounded-lg bg-[#FAFAFA] text-[#78909C] border border-[#E0E0E0]">
                      解像度: <span className="text-[#333333] font-medium">{resolution}</span>
                    </span>
                    <span className="text-[9px] px-2.5 py-1.5 rounded-lg bg-[#FAFAFA] text-[#78909C] border border-[#E0E0E0]">
                      形式: <span className="text-[#333333] font-medium">{imageFormat.toUpperCase()}</span>
                    </span>
                    <span className="text-[9px] px-2.5 py-1.5 rounded-lg bg-[#FAFAFA] text-[#78909C] border border-[#E0E0E0]">
                      アイテム: <span className="text-[#333333] font-medium">{uploadedGarments.length}</span>
                    </span>
                    {uploadedGarments.map(g => (
                      <span
                        key={g.id}
                        className="text-[9px] px-2.5 py-1.5 rounded-lg text-[#333333] font-medium"
                        style={{ backgroundColor: `${g.accentColor}30`, border: `1px solid ${g.accentColor}40` }}
                      >
                        <span className="scale-75 origin-left inline-flex items-center align-text-bottom mr-1">{g.icon}</span>
                        {g.description ? g.description.substring(0, 15) + (g.description.length > 15 ? '...' : '') : g.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        </main>
      </div>

      {/* Prompt Modal */}
      <PromptModal
        isOpen={promptModalOpen}
        onClose={() => {
          setPromptModalOpen(false);
          setPendingGarmentId(null);
          setPendingGarmentFile(null);
          setPendingGarmentPreview(null);
        }}
        onSubmit={handlePromptSubmit}
        onOptimize={handlePromptOptimize}
        onAnalyze={handlePromptAnalyze}
        itemLabel={garments.find(g => g.id === pendingGarmentId)?.label || ''}
        itemEmoji={garments.find(g => g.id === pendingGarmentId)?.icon || ''}
        accentColor={garments.find(g => g.id === pendingGarmentId)?.accentColor || '#a78bfa'}
        previewUrl={pendingGarmentPreview}
        initialDescription={garments.find(g => g.id === pendingGarmentId)?.description || ''}
      />

      {/* TryOn Prompt Modal */}
      <TryOnPromptModal
        isOpen={tryOnModalOpen}
        onClose={() => {
          setTryOnModalOpen(false);
          setReusedPrompt(undefined);
        }}
        onGenerate={handleGenerateWithPrompt}
        onGenerateQuestions={handleGenerateQuestions}
        onGeneratePromptFromAnswers={handleGeneratePromptFromAnswers}
        onOptimizePrompt={handleOptimizeTryOnPrompt}
        modelPreview={humanPreview}
        garmentPreviews={garments.map(g => ({
          emoji: g.icon,
          preview: g.preview,
          label: g.label,
        }))}
        isGeneratingQuestions={isGeneratingQuestions}
        isGeneratingTryOn={isGenerating}
        initialPrompt={reusedPrompt}
      />

      {/* Pose Analysis Modal */}
      {poseQuestionResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-[#E0E0E0] shrink-0 bg-[#F8FAFC]">
              <h2 className="text-sm font-bold text-[#333333] flex items-center gap-2">
                <span className="text-xl">✨</span> AIポーズ分析
              </h2>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <p className="text-sm text-[#333333] mb-6 leading-relaxed bg-[#f0f9ff] p-4 rounded-xl border border-[#bae6fd]">
                {poseQuestionResult.question}
              </p>
              
              <div className="space-y-3">
                {poseQuestionResult.options.map((option, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setSelectedPose(`${poseQuestionResult.detectedPose} (${option})`);
                      setPoseQuestionResult(null);
                    }}
                    className="w-full text-left p-4 rounded-xl border border-[#E0E0E0] hover:border-[#00BFA5] hover:bg-[#00BFA5]/5 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-center">
                      <div className="w-6 h-6 rounded-full border-2 border-[#E0E0E0] group-hover:border-[#00BFA5] flex items-center justify-center mr-3 shrink-0">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#00BFA5] opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <span className="text-sm text-[#333333] font-medium">{option}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History Panel */}
      <HistoryPanel
        isOpen={isHistoryOpen}
        onClose={() => navigate('/')}
        onSelectEntry={(entry) => setResults(prev => [
          { 
            id: Date.now().toString(), 
            imageUrl: entry.imageUrl, 
            garmentLabels: entry.garmentLabels,
            projectId: 'default',
            timestamp: new Date()
          },
          ...prev
        ])}
        onReusePrompt={(prompt) => {
          setReusedPrompt(prompt);
          setTryOnModalOpen(true);
          navigate('/');
        }}
      />
    </div>
  );
};

export default App;
