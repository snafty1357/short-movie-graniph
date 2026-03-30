import React, { useState, useCallback } from 'react';
import ImageUploader from './components/ImageUploader';
import ResultGallery from './components/ResultGallery';
import type { ResultItem } from './components/ResultGallery';
import PromptModal from './components/PromptModal';
import AuthForm from './components/AuthForm';
import { useAuth } from './contexts/AuthContext';
import { generateTryOn, fileToDataUrl, type Resolution, type ImageFormat } from './services/falService';
import { describeGarment, optimizeDescription } from './services/geminiService';

// アイテムカテゴリの定義
interface GarmentItem {
  id: string;
  label: string;
  emoji: string;
  accentColor: string;
  hint: string;
  // 正面
  file: File | null;
  preview: string | null;
  // 背面
  backFile: File | null;
  backPreview: string | null;
  description: string;
}

const initialGarments: Omit<GarmentItem, 'file' | 'preview' | 'backFile' | 'backPreview' | 'description'>[] = [
  { id: 'top', label: '上着 / トップス', emoji: '👕', accentColor: '#a78bfa', hint: '白背景の服単体が最適' },
  { id: 'bottom', label: 'パンツ / ボトムス', emoji: '👖', accentColor: '#60a5fa', hint: 'ズボン・スカート等' },
  { id: 'shoes', label: 'スニーカー / 靴', emoji: '👟', accentColor: '#34d399', hint: '靴単体の画像' },
  { id: 'accessory', label: 'アクセサリー', emoji: '⌚', accentColor: '#fbbf24', hint: '時計・バッグ・帽子等' },
];

const App: React.FC = () => {
  const { user, loading, signOut } = useAuth();

  // モデル画像（正面）
  const [humanFile, setHumanFile] = useState<File | null>(null);
  const [humanPreview, setHumanPreview] = useState<string | null>(null);
  // モデル画像（背面）
  const [_humanBackFile, setHumanBackFile] = useState<File | null>(null);
  const [humanBackPreview, setHumanBackPreview] = useState<string | null>(null);

  // ローディング中
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#a78bfa] to-[#7c3aed] flex items-center justify-center text-3xl font-black mx-auto mb-4 animate-pulse">
            K
          </div>
          <p className="text-[#a0a0b0] text-sm">読み込み中...</p>
        </div>
      </div>
    );
  }

  // 未ログイン
  if (!user) {
    return <AuthForm />;
  }

  // 各ガーメントのステート
  const [garments, setGarments] = useState<GarmentItem[]>(
    initialGarments.map(g => ({ ...g, file: null, preview: null, backFile: null, backPreview: null, description: '' }))
  );

  // 現在選択中のガーメント（説明編集用）
  const [activeGarmentId, setActiveGarmentId] = useState<string>('top');

  // 表裏切り替え（front/back）
  const [viewSide, setViewSide] = useState<'front' | 'back'>('front');

  // プロンプトモーダル
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [pendingGarmentId, setPendingGarmentId] = useState<string | null>(null);
  const [pendingGarmentFile, setPendingGarmentFile] = useState<File | null>(null);
  const [pendingGarmentPreview, setPendingGarmentPreview] = useState<string | null>(null);
  const [pendingGarmentSide, setPendingGarmentSide] = useState<'front' | 'back'>('front');

  // 解像度と出力形式
  const [resolution, setResolution] = useState<Resolution>('1K');
  const [imageFormat, setImageFormat] = useState<ImageFormat>('png');

  // UI状態
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ResultItem[]>([]);

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

  // モーダルで説明を確定
  const handlePromptSubmit = useCallback((description: string) => {
    if (!pendingGarmentId || !pendingGarmentFile || !pendingGarmentPreview) return;

    if (pendingGarmentSide === 'front') {
      setGarments(prev => prev.map(g =>
        g.id === pendingGarmentId
          ? { ...g, file: pendingGarmentFile, preview: pendingGarmentPreview, description }
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
    return desc;
  }, [pendingGarmentFile]);

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

  // 説明文更新
  const handleDescriptionChange = useCallback((id: string, description: string) => {
    setGarments(prev => prev.map(g =>
      g.id === id ? { ...g, description } : g
    ));
  }, []);

  // アクティブなガーメントを取得
  const activeGarment = garments.find(g => g.id === activeGarmentId);

  // Gemini最適化
  const handleOptimize = useCallback(async () => {
    if (!activeGarment) return;

    setIsOptimizing(true);
    setError(null);
    try {
      if (activeGarment.file) {
        const base64 = await fileToDataUrl(activeGarment.file);
        const desc = await describeGarment(base64, activeGarment.description || undefined);
        handleDescriptionChange(activeGarment.id, desc);
      } else if (activeGarment.description) {
        const optimized = await optimizeDescription(activeGarment.description);
        handleDescriptionChange(activeGarment.id, optimized);
      }
    } catch (e: any) {
      setError(`最適化エラー: ${e.message}`);
    } finally {
      setIsOptimizing(false);
    }
  }, [activeGarment, handleDescriptionChange]);

  // アップロード済みのガーメントを取得
  const uploadedGarments = garments.filter(g => g.file !== null);

  // 着画生成
  const handleGenerate = useCallback(async () => {
    if (!humanFile || uploadedGarments.length === 0) return;

    setIsGenerating(true);
    setError(null);

    try {
      const humanDataUrl = await fileToDataUrl(humanFile);

      // 各ガーメントごとに生成（現在のAPIは1つずつ）
      // メインのガーメント（上着優先）で生成
      const primaryGarment = uploadedGarments[0];
      const garmentDataUrl = await fileToDataUrl(primaryGarment.file!);

      // 全アイテムの説明を結合
      const combinedDescription = uploadedGarments
        .map(g => g.description || g.label)
        .join(', ');

      const result = await generateTryOn({
        humanImageUrl: humanDataUrl,
        garmentImageUrl: garmentDataUrl,
        description: combinedDescription || undefined,
        resolution,
        format: imageFormat,
      });

      const newResult: ResultItem = {
        id: Date.now().toString(),
        imageUrl: result.imageUrl,
        timestamp: new Date(),
        description: combinedDescription || undefined,
      };

      setResults(prev => [newResult, ...prev]);
    } catch (e: any) {
      setError(`生成エラー: ${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  }, [humanFile, uploadedGarments, resolution, imageFormat]);

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Header */}
      <header className="border-b border-[#1a1a2e] bg-[#0a0a0f]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#a78bfa] to-[#7c3aed] flex items-center justify-center text-xl font-black">
              K
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-white tracking-tight">
                KIGA
              </h1>
              <p className="text-[10px] text-[#a0a0b0] -mt-0.5 tracking-wider">AI VIRTUAL TRY-ON</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[9px] text-[#555] bg-[#14141f] px-2 py-1 rounded border border-[#2a2a3e]">
              Powered by Fal.ai IDM-VTON + Gemini
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#a0a0b0]">
                {user.email?.split('@')[0]}
              </span>
              <button
                onClick={() => signOut()}
                className="text-[10px] px-3 py-1.5 rounded-lg bg-[#14141f] text-[#666] border border-[#2a2a3e] hover:text-red-400 hover:border-red-400/50 transition-colors"
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Panel: Inputs */}
          <div className="lg:col-span-5 space-y-6">
            {/* Front/Back Toggle */}
            <div className="bg-[#1a1a2e] border border-[#2a2a3e] rounded-2xl p-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setViewSide('front')}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                    viewSide === 'front'
                      ? 'bg-gradient-to-r from-[#00d4ff] to-[#00ff88] text-white'
                      : 'bg-[#14141f] text-[#666] border border-[#2a2a3e] hover:text-[#999]'
                  }`}
                >
                  🧑 正面 (Front)
                </button>
                <button
                  onClick={() => setViewSide('back')}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                    viewSide === 'back'
                      ? 'bg-gradient-to-r from-[#00ff88] to-[#00d4ff] text-white'
                      : 'bg-[#14141f] text-[#666] border border-[#2a2a3e] hover:text-[#999]'
                  }`}
                >
                  🔙 背面 (Back)
                </button>
              </div>
            </div>

            {/* Model Upload */}
            <div className="bg-[#1a1a2e] border border-[#2a2a3e] rounded-2xl p-6">
              <h2 className="text-white font-bold text-sm mb-5 flex items-center gap-2">
                <span className="bg-gradient-to-r from-[#00d4ff] to-[#00ff88] w-1 h-5 rounded-full"></span>
                モデル画像
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                  viewSide === 'front' ? 'bg-[#00d4ff]/20 text-[#00d4ff]' : 'bg-[#00ff88]/20 text-[#00ff88]'
                }`}>
                  {viewSide === 'front' ? '正面' : '背面'}
                </span>
              </h2>
              <ImageUploader
                label={viewSide === 'front' ? 'モデル正面' : 'モデル背面'}
                emoji={viewSide === 'front' ? '🧑' : '🔙'}
                previewUrl={viewSide === 'front' ? humanPreview : humanBackPreview}
                onFileSelect={viewSide === 'front' ? handleHumanSelect : handleHumanBackSelect}
                onClear={viewSide === 'front'
                  ? () => { setHumanFile(null); setHumanPreview(null); }
                  : () => { setHumanBackFile(null); setHumanBackPreview(null); }
                }
                accentColor={viewSide === 'front' ? '#00d4ff' : '#00ff88'}
                hint={viewSide === 'front' ? '正面の全身画像' : '背面の全身画像（任意）'}
              />
            </div>

            {/* Garment Uploads */}
            <div className="bg-[#1a1a2e] border border-[#2a2a3e] rounded-2xl p-6">
              <h2 className="text-white font-bold text-sm mb-5 flex items-center gap-2">
                <span className="bg-gradient-to-r from-[#a78bfa] to-[#fbbf24] w-1 h-5 rounded-full"></span>
                アイテムアップロード
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                  viewSide === 'front' ? 'bg-[#00d4ff]/20 text-[#00d4ff]' : 'bg-[#00ff88]/20 text-[#00ff88]'
                }`}>
                  {viewSide === 'front' ? '正面' : '背面'}
                </span>
                {uploadedGarments.length > 0 && (
                  <span className="text-[9px] bg-[#a78bfa]/10 text-[#a78bfa] px-2 py-0.5 rounded-full font-bold">
                    {uploadedGarments.length}
                  </span>
                )}
              </h2>

              <div className="grid grid-cols-2 gap-4">
                {garments.map(garment => (
                  <div
                    key={garment.id}
                    onClick={() => setActiveGarmentId(garment.id)}
                    className={`cursor-pointer transition-all ${
                      activeGarmentId === garment.id ? 'rounded-xl' : ''
                    }`}
                    style={{
                      outline: activeGarmentId === garment.id ? `2px solid ${garment.accentColor}` : undefined,
                      outlineOffset: '2px'
                    }}
                  >
                    <ImageUploader
                      label={garment.label}
                      emoji={garment.emoji}
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

            {/* Description & Actions */}
            <div className="bg-[#1a1a2e] border border-[#2a2a3e] rounded-2xl p-6">
              <h2 className="text-white font-bold text-sm mb-4 flex items-center gap-2">
                <span className="bg-gradient-to-r from-[#ff6b35] to-[#fbbf24] w-1 h-5 rounded-full"></span>
                {activeGarment?.label || 'アイテム'}の説明
                <span className="text-[10px] text-[#555] font-normal">(任意)</span>
              </h2>

              {/* ガーメント選択タブ */}
              <div className="flex gap-1 mb-3 overflow-x-auto pb-2">
                {garments.map(g => (
                  <button
                    key={g.id}
                    onClick={() => setActiveGarmentId(g.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                      activeGarmentId === g.id
                        ? 'text-white'
                        : 'bg-[#14141f] text-[#666] hover:text-[#999]'
                    }`}
                    style={{
                      backgroundColor: activeGarmentId === g.id ? g.accentColor : undefined,
                    }}
                  >
                    {g.emoji} {g.label.split('/')[0].trim()}
                  </button>
                ))}
              </div>

              <textarea
                value={activeGarment?.description || ''}
                onChange={(e) => activeGarment && handleDescriptionChange(activeGarment.id, e.target.value)}
                placeholder={`例: ${activeGarment?.hint || '商品の説明を入力'}

※ 空欄の場合は自動で説明が生成されます`}
                rows={3}
                className="w-full bg-[#0a0a0f] border border-[#2a2a3e] rounded-xl px-4 py-3 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#a78bfa] transition-colors resize-none"
              />

              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleOptimize}
                  disabled={isOptimizing || (!activeGarment?.file && !activeGarment?.description)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all border border-[#2a2a3e] bg-[#14141f] text-[#a0a0b0] hover:text-[#a78bfa] hover:border-[#a78bfa] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {isOptimizing ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      最適化中...
                    </>
                  ) : (
                    <>🤖 Geminiで最適化</>
                  )}
                </button>
              </div>

              {/* Resolution & Format Selectors */}
              <div className="mt-4 mb-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#a0a0b0] mb-2 block">解像度</label>
                  <select
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value as Resolution)}
                    className="w-full bg-[#0a0a0f] border border-[#2a2a3e] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#a78bfa] transition-colors cursor-pointer appearance-none"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23666'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 12px center',
                      backgroundSize: '20px',
                    }}
                  >
                    <option value="1K">1K (1024px)</option>
                    <option value="2K">2K (2048px)</option>
                    <option value="4K">4K (4096px)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#a0a0b0] mb-2 block">出力形式</label>
                  <select
                    value={imageFormat}
                    onChange={(e) => setImageFormat(e.target.value as ImageFormat)}
                    className="w-full bg-[#0a0a0f] border border-[#2a2a3e] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#a78bfa] transition-colors cursor-pointer appearance-none"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23666'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 12px center',
                      backgroundSize: '20px',
                    }}
                  >
                    <option value="png">PNG (高品質)</option>
                    <option value="jpeg">JPEG (軽量)</option>
                    <option value="webp">WebP (最適化)</option>
                  </select>
                </div>
              </div>

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !humanFile || uploadedGarments.length === 0}
                className={`w-full mt-4 py-4 rounded-xl font-extrabold text-base flex items-center justify-center gap-2.5 transition-all ${
                  isGenerating || !humanFile || uploadedGarments.length === 0
                    ? 'bg-[#2a2a3e] text-[#555] cursor-not-allowed'
                    : 'bg-gradient-to-r from-[#a78bfa] via-[#7c3aed] to-[#a78bfa] bg-[length:200%_auto] text-white shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 hover:bg-right animate-gradient'
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
                <div className="mt-3 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                  {error}
                </div>
              )}
            </div>

            {/* Tips */}
            <div className="bg-[#1a1a2e] border border-[#2a2a3e] rounded-2xl p-5">
              <h3 className="text-[#fbbf24] font-bold text-xs uppercase tracking-wider mb-3">💡 Tips</h3>
              <ul className="space-y-2 text-[11px] text-[#a0a0b0]">
                <li className="flex items-start gap-2"><span className="text-[#fbbf24] mt-0.5">•</span>モデル画像は正面向き全身写真が最適です</li>
                <li className="flex items-start gap-2"><span className="text-[#fbbf24] mt-0.5">•</span>各アイテムは白背景で単体の画像が理想的です</li>
                <li className="flex items-start gap-2"><span className="text-[#fbbf24] mt-0.5">•</span>複数アイテムをアップロードして一度に着画を生成できます</li>
                <li className="flex items-start gap-2"><span className="text-[#fbbf24] mt-0.5">•</span>「Geminiで最適化」で各アイテムの説明を自動生成できます</li>
              </ul>
            </div>
          </div>

          {/* Right Panel: Results */}
          <div className="lg:col-span-7">
            <div className="bg-[#1a1a2e] border border-[#2a2a3e] rounded-2xl p-6 min-h-[600px]">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-white font-bold text-sm flex items-center gap-2">
                  <span className="bg-gradient-to-r from-[#00ff88] to-[#00d4ff] w-1 h-5 rounded-full"></span>
                  生成結果
                  {results.length > 0 && (
                    <span className="text-[9px] bg-[#00ff88]/10 text-[#00ff88] px-2 py-0.5 rounded-full font-bold">
                      {results.length}
                    </span>
                  )}
                </h2>
                {results.length > 0 && (
                  <button
                    onClick={() => setResults([])}
                    className="text-[10px] text-[#555] hover:text-red-400 transition-colors"
                  >
                    すべてクリア
                  </button>
                )}
              </div>
              <ResultGallery results={results} />
            </div>

            {/* Character Sheet */}
            {(humanPreview || humanBackPreview || uploadedGarments.length > 0) && (
              <div className="bg-[#1a1a2e] border border-[#2a2a3e] rounded-2xl p-6 mt-6">
                <h2 className="text-white font-bold text-sm mb-5 flex items-center gap-2">
                  <span className="bg-gradient-to-r from-[#ff6b35] to-[#fbbf24] w-1 h-5 rounded-full"></span>
                  キャラクターシート
                </h2>

                {/* Model Row */}
                <div className="mb-4">
                  <p className="text-[10px] text-[#00d4ff] font-bold uppercase tracking-wider mb-2">Model</p>
                  <div className="grid grid-cols-4 gap-2">
                    {/* Model Front */}
                    <div>
                      <p className="text-[8px] text-[#00d4ff] mb-1 text-center">Front</p>
                      {humanPreview ? (
                        <div className="aspect-[3/4] bg-black rounded-lg overflow-hidden border-2 border-[#00d4ff]">
                          <img src={humanPreview} alt="Model Front" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="aspect-[3/4] bg-[#14141f] rounded-lg border border-dashed border-[#00d4ff44] flex items-center justify-center">
                          <span className="text-lg opacity-30">🧑</span>
                        </div>
                      )}
                    </div>
                    {/* Model Back */}
                    <div>
                      <p className="text-[8px] text-[#00ff88] mb-1 text-center">Back</p>
                      {humanBackPreview ? (
                        <div className="aspect-[3/4] bg-black rounded-lg overflow-hidden border-2 border-[#00ff88]">
                          <img src={humanBackPreview} alt="Model Back" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="aspect-[3/4] bg-[#14141f] rounded-lg border border-dashed border-[#00ff8844] flex items-center justify-center">
                          <span className="text-lg opacity-30">🔙</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Items Row */}
                <div>
                  <p className="text-[10px] text-[#a78bfa] font-bold uppercase tracking-wider mb-2">Items (Front / Back)</p>
                  <div className="grid grid-cols-4 gap-2">
                    {garments.map(g => (
                      <div key={g.id} className="space-y-1">
                        <p className="text-[8px] text-center truncate" style={{ color: g.accentColor }}>{g.emoji}</p>
                        <div className="grid grid-cols-2 gap-0.5">
                          {/* Front */}
                          {g.preview ? (
                            <div
                              className="aspect-square bg-black rounded overflow-hidden border"
                              style={{ borderColor: g.accentColor }}
                            >
                              <img src={g.preview} alt={`${g.label} Front`} className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div
                              className="aspect-square bg-[#14141f] rounded border border-dashed flex items-center justify-center"
                              style={{ borderColor: `${g.accentColor}44` }}
                            >
                              <span className="text-[8px] opacity-30">F</span>
                            </div>
                          )}
                          {/* Back */}
                          {g.backPreview ? (
                            <div
                              className="aspect-square bg-black rounded overflow-hidden border"
                              style={{ borderColor: g.accentColor }}
                            >
                              <img src={g.backPreview} alt={`${g.label} Back`} className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div
                              className="aspect-square bg-[#14141f] rounded border border-dashed flex items-center justify-center"
                              style={{ borderColor: `${g.accentColor}44` }}
                            >
                              <span className="text-[8px] opacity-30">B</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Summary */}
                <div className="mt-4 pt-4 border-t border-[#2a2a3e]">
                  <div className="flex flex-wrap gap-2">
                    <span className="text-[9px] px-2 py-1 rounded bg-[#14141f] text-[#a0a0b0]">
                      解像度: <span className="text-white font-bold">{resolution}</span>
                    </span>
                    <span className="text-[9px] px-2 py-1 rounded bg-[#14141f] text-[#a0a0b0]">
                      形式: <span className="text-white font-bold">{imageFormat.toUpperCase()}</span>
                    </span>
                    <span className="text-[9px] px-2 py-1 rounded bg-[#14141f] text-[#a0a0b0]">
                      アイテム数: <span className="text-white font-bold">{uploadedGarments.length}</span>
                    </span>
                    {uploadedGarments.map(g => (
                      <span
                        key={g.id}
                        className="text-[9px] px-2 py-1 rounded text-white font-bold"
                        style={{ backgroundColor: g.accentColor }}
                      >
                        {g.emoji} {g.description ? g.description.substring(0, 20) + (g.description.length > 20 ? '...' : '') : g.label.split('/')[0].trim()}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

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
        itemLabel={garments.find(g => g.id === pendingGarmentId)?.label || ''}
        itemEmoji={garments.find(g => g.id === pendingGarmentId)?.emoji || ''}
        accentColor={garments.find(g => g.id === pendingGarmentId)?.accentColor || '#a78bfa'}
        previewUrl={pendingGarmentPreview}
        initialDescription={garments.find(g => g.id === pendingGarmentId)?.description || ''}
      />
    </div>
  );
};

export default App;
