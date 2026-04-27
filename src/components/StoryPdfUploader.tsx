import React, { useState, useRef, useEffect } from 'react';
import { FileText, Sparkles, ChevronDown, ChevronUp, Loader2, AlertCircle, Check, BookOpen, Settings2, X } from 'lucide-react';
import {
  extractTextFromPdf,
  generateCutComposition,
  compositionRowToCutItem,
  DEFAULT_REGULATION,
  DEFAULT_META_PROMPT,
  type CutCompositionRow,
  type AiModelType
} from '../services/storyPdfService';
import type { CutItem } from '../types/cuts';

interface StoryPdfUploaderProps {
  onCutsGenerated: (cuts: CutItem[]) => void;
  onStoryExtracted?: (text: string) => void;
  aiModel: AiModelType;
  onAiModelChange: (model: AiModelType) => void;
  selectedModelId?: string;  // 詳細モデルID（指定時はこちらを優先）
  characterFile?: File | null;
  characterConfirmed?: boolean;
  onRequestCharacter?: () => void;
  onFullAutoGenerate?: (text: string) => Promise<void>;
}

type Step = 'idle' | 'extracting' | 'extracted' | 'generating' | 'done' | 'error';

const StoryPdfUploader: React.FC<StoryPdfUploaderProps> = ({
  onCutsGenerated,
  onStoryExtracted,
  aiModel,
  onAiModelChange,
  selectedModelId,
  characterFile,
  characterConfirmed: _characterConfirmed,
  onRequestCharacter,
  onFullAutoGenerate,
}) => {
  void _characterConfirmed; // 将来使用予定
  // ─── State ───
  const [step, setStep] = useState<Step>('idle');
  const [showCharacterPopup, setShowCharacterPopup] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [generatedCuts, setGeneratedCuts] = useState<CutCompositionRow[]>([]);
  const [rawAiResponse, setRawAiResponse] = useState('');

  // レギュレーション & メタプロンプト
  const [regulation, setRegulation] = useState(DEFAULT_REGULATION);
  const [metaPrompt, setMetaPrompt] = useState(DEFAULT_META_PROMPT);
  const [cutCount, setCutCount] = useState(7);
  const [showSettings, setShowSettings] = useState(false);
  const [showExtractedText, setShowExtractedText] = useState(false);
  const [showRawResponse, setShowRawResponse] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  // ─── LocalStorage 永続化 ───
  useEffect(() => {
    const savedReg = localStorage.getItem('snafty_regulation');
    const savedMeta = localStorage.getItem('snafty_meta_prompt');
    const savedCount = localStorage.getItem('snafty_cut_count');
    if (savedReg) setRegulation(savedReg);
    if (savedMeta) setMetaPrompt(savedMeta);
    if (savedCount) setCutCount(Number(savedCount));
  }, []);

  // キャラクター画像が設定されたら自動で生成開始
  useEffect(() => {
    const runAutoGenerate = async () => {
      if (characterFile && pendingText) {
        setShowCharacterPopup(false);
        if (onFullAutoGenerate) {
          setStep('generating');
          await onFullAutoGenerate(pendingText);
          setStep('done');
        } else {
          handleGenerate(pendingText);
        }
        setPendingText(null);
      }
    };
    runAutoGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterFile, pendingText]);

  const saveSettings = () => {
    localStorage.setItem('snafty_regulation', regulation);
    localStorage.setItem('snafty_meta_prompt', metaPrompt);
    localStorage.setItem('snafty_cut_count', String(cutCount));
  };

  // ─── PDF アップロード処理 ───
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.pdf')) {
      setError('PDFファイルを選択してください。');
      return;
    }

    setPdfFile(file);
    setStep('extracting');
    setError(null);
    setGeneratedCuts([]);
    setRawAiResponse('');

    try {
      const text = await extractTextFromPdf(file);
      if (!text.trim()) {
        throw new Error('PDFからテキストを抽出できませんでした。画像ベースのPDFは対応していません。');
      }
      setExtractedText(text);
      if (onStoryExtracted) onStoryExtracted(text);

      // キャラクター画像がない場合はポップアップを表示して設定を促す
      if (!characterFile) {
        setPendingText(text);
        setShowCharacterPopup(true);
        setStep('extracted');
        return;
      }

      // キャラクター画像がある場合は自動フロー実行（Step 1-5）
      if (onFullAutoGenerate) {
        setStep('generating');
        await onFullAutoGenerate(text);
        setStep('done');
      } else {
        // フォールバック：従来の生成処理
        handleGenerate(text);
      }
    } catch (err) {
      console.error('PDF extraction error:', err);
      setError(err instanceof Error ? err.message : 'PDFの読み込みに失敗しました');
      setStep('error');
    }

    e.target.value = '';
  };

  // ─── AI カット割り生成 ───
  const handleGenerate = async (textToUse?: string) => {
    const text = typeof textToUse === 'string' ? textToUse : extractedText;
    if (!text) return;
    setStep('generating');
    setError(null);
    saveSettings();

    try {
      const modelToUse = selectedModelId || aiModel;
      console.log('[StoryPdfUploader] handleGenerate called');
      console.log('[StoryPdfUploader] selectedModelId:', selectedModelId);
      console.log('[StoryPdfUploader] aiModel:', aiModel);
      console.log('[StoryPdfUploader] modelToUse:', modelToUse);
      console.log('[StoryPdfUploader] text length:', text.length);
      const result = await generateCutComposition(text, regulation, metaPrompt, cutCount, modelToUse);
      setGeneratedCuts(result.cuts);
      setRawAiResponse(result.rawAiResponse);
      setStep('done');
    } catch (err) {
      console.error('Cut generation error:', err);
      setError(err instanceof Error ? err.message : 'カット割り生成に失敗しました');
      setStep('error');
    }
  };

  // ─── カットを適用 ───
  const handleApplyCuts = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    try {
      const cutItems = generatedCuts.map((row, i) => compositionRowToCutItem(row, i));
      onCutsGenerated(cutItems);
      // リセット
      setStep('idle');
      setPdfFile(null);
      setExtractedText('');
      setGeneratedCuts([]);
      setRawAiResponse('');
    } catch (err) {
      console.error('Apply cuts error:', err);
      alert('適用時にエラーが発生しました: ' + (err instanceof Error ? err.message : '不明なエラー'));
    }
  };

  // ─── リセット ───
  const handleReset = () => {
    setStep('idle');
    setPdfFile(null);
    setExtractedText('');
    setError(null);
    setGeneratedCuts([]);
    setRawAiResponse('');
  };

  return (
    <div className="glass rounded-2xl overflow-hidden transition-all duration-300">
      {/* ── ヘッダー ── */}
      <div className="flex items-center justify-between p-4 border-b border-[#E0E0E0] dark:border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <BookOpen size={16} className="text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#333] dark:text-gray-200">📖 ストーリーPDF → カット割り</h2>
            <p className="text-[10px] text-[#78909C] dark:text-gray-500 mt-0.5">PDFをアップロードし、AIがカット構成を自動生成します</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Settings toggle */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-all shadow-sm ${
              showSettings
                ? 'bg-violet-500/10 dark:bg-violet-500/20 border-violet-500/30 text-violet-600 dark:text-violet-300'
                : 'bg-white dark:bg-white/5 border-[#E0E0E0] dark:border-white/10 text-[#78909C] hover:text-[#333] dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/10'
            }`}
          >
            <Settings2 size={12} />
            レギュレーション
            <ChevronDown size={10} className={`transition-transform duration-200 ${showSettings ? 'rotate-180' : ''}`} />
          </button>
          {step !== 'idle' && (
            <button
              onClick={handleReset}
              className="p-1.5 rounded-lg text-[#78909C] hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
              title="リセット"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ── レギュレーション & メタプロンプト設定パネル ── */}
      {showSettings && (
        <div ref={settingsRef} className="border-b border-[#E0E0E0] dark:border-white/10 bg-violet-50/50 dark:bg-violet-900/10 p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-4 rounded-full bg-gradient-to-b from-violet-400 to-fuchsia-500"></div>
            <h3 className="text-xs font-bold text-[#333] dark:text-gray-200 uppercase tracking-wider">レギュレーション & メタプロンプト設定</h3>
          </div>

          {/* Cut count */}
          <div>
            <label className="text-[10px] font-semibold text-[#78909C] dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
              カット数
            </label>
            <div className="flex items-center gap-2">
              {[5, 6, 7, 8, 9].map(n => (
                <button
                  key={n}
                  onClick={() => setCutCount(n)}
                  className={`w-8 h-8 rounded-lg text-xs font-bold border transition-all ${
                    cutCount === n
                      ? 'bg-violet-500 text-white border-violet-600 shadow-md shadow-violet-500/20'
                      : 'bg-white dark:bg-white/5 border-[#E0E0E0] dark:border-white/10 text-[#78909C] hover:text-[#333] dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/10'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* AI Model Selection */}
          <div>
            <label className="text-[10px] font-semibold text-[#78909C] dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
              使用するAIモデル
            </label>
            <select
              value={aiModel}
              onChange={(e) => onAiModelChange(e.target.value as AiModelType)}
              className="w-full bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-2 text-xs text-[#333] dark:text-gray-300 focus:outline-none focus:border-violet-500/50 transition-colors mb-4"
            >
              <option value="openai">ChatGPT (gpt-4o)</option>
            </select>
          </div>

          {/* Regulation */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-semibold text-[#78909C] dark:text-gray-400 uppercase tracking-wider">
                レギュレーション（制約条件）
              </label>
              <button
                onClick={() => setRegulation(DEFAULT_REGULATION)}
                className="text-[9px] text-violet-500 hover:text-violet-400 font-medium"
              >
                デフォルトに戻す
              </button>
            </div>
            <textarea
              value={regulation}
              onChange={e => setRegulation(e.target.value)}
              className="w-full h-40 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-3 text-xs text-[#333] dark:text-gray-300 focus:outline-none focus:border-violet-500/50 transition-colors custom-scrollbar resize-y font-mono leading-relaxed"
            />
          </div>

          {/* Meta Prompt */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-semibold text-[#78909C] dark:text-gray-400 uppercase tracking-wider">
                メタプロンプト（AIへの指示）
              </label>
              <button
                onClick={() => setMetaPrompt(DEFAULT_META_PROMPT)}
                className="text-[9px] text-violet-500 hover:text-violet-400 font-medium"
              >
                デフォルトに戻す
              </button>
            </div>
            <textarea
              value={metaPrompt}
              onChange={e => setMetaPrompt(e.target.value)}
              className="w-full h-40 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-3 text-xs text-[#333] dark:text-gray-300 focus:outline-none focus:border-violet-500/50 transition-colors custom-scrollbar resize-y font-mono leading-relaxed"
            />
          </div>

          {/* Save & Close buttons */}
          <div className="flex gap-2 justify-end mt-4">
            <button
              onClick={() => setShowSettings(false)}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/20 text-[#333] dark:text-gray-300 text-xs font-bold rounded-lg transition-colors"
            >
              キャンセル
            </button>
            <button
              onClick={() => {
                saveSettings();
                alert('レギュレーションとメタプロンプトの変更を保存しました。次回以降もこの設定が利用されます。');
                setShowSettings(false);
              }}
              className="px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white text-xs font-bold rounded-lg transition-colors"
            >
              保存して閉じる
            </button>
          </div>
        </div>
      )}

      {/* ── メインコンテンツ ── */}
      <div className="p-4">
        {/* Step: Idle — PDFアップロード */}
        {step === 'idle' && (
          <label className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-violet-300 dark:border-violet-500/30 rounded-xl hover:bg-violet-50 dark:hover:bg-violet-500/5 transition-all cursor-pointer group">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <FileText size={24} className="text-violet-500 dark:text-violet-400" />
            </div>
            <span className="text-sm font-bold text-[#333] dark:text-gray-200 mb-1">ストーリーPDFをドロップまたは選択</span>
            <span className="text-[10px] text-[#78909C] dark:text-gray-500">簡易ストーリー、シナリオ、プロット等のPDF</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
          </label>
        )}

        {/* Step: Extracting — 抽出中 */}
        {step === 'extracting' && (
          <div className="flex flex-col items-center justify-center py-8 space-y-3">
            <Loader2 size={28} className="text-violet-500 animate-spin" />
            <p className="text-sm font-bold text-[#333] dark:text-gray-200">PDFからテキストを抽出中...</p>
            <p className="text-[10px] text-[#78909C]">{pdfFile?.name}</p>
          </div>
        )}

        {/* Step: Extracted — テキスト抽出完了、生成前 */}
        {step === 'extracted' && (
          <div className="space-y-4">
            {/* File info */}
            <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-xl">
              <Check size={16} className="text-green-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-green-700 dark:text-green-400">テキスト抽出完了</p>
                <p className="text-[10px] text-green-600 dark:text-green-500 truncate">{pdfFile?.name} — {extractedText.length.toLocaleString()} 文字</p>
              </div>
              <button
                onClick={() => setShowExtractedText(!showExtractedText)}
                className="text-[10px] text-green-600 dark:text-green-400 hover:underline font-medium flex-shrink-0"
              >
                {showExtractedText ? '隠す' : 'テキスト確認'}
              </button>
            </div>

            {/* Extracted text preview */}
            {showExtractedText && (
              <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-3 max-h-48 overflow-y-auto custom-scrollbar">
                <pre className="text-[10px] text-[#333] dark:text-gray-400 whitespace-pre-wrap font-mono leading-relaxed">{extractedText}</pre>
              </div>
            )}

            {/* Settings summary */}
            <div className="flex items-center gap-2 text-[10px] text-[#78909C] flex-wrap">
              <span className="px-2 py-1 bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 rounded-md text-violet-600 dark:text-violet-400 font-bold">
                {cutCount}カット
              </span>
              <span className="px-2 py-1 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-md">
                GPT-4o
              </span>
              <span className="text-[9px]">レギュレーション設定済み</span>
            </div>

            {/* Generate button */}
            <button
              onClick={() => handleGenerate()}
              className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2.5 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-xl shadow-violet-500/25 hover:shadow-violet-500/40 hover:scale-[1.01] transition-all duration-300"
            >
              <Sparkles size={16} />
              AIでカット割りを生成する
            </button>
          </div>
        )}

        {/* Step: Generating — 生成中 */}
        {step === 'generating' && (
          <div className="flex flex-col items-center justify-center py-10 space-y-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center animate-pulse shadow-2xl shadow-violet-500/30">
                <Sparkles size={24} className="text-white" />
              </div>
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 blur-xl opacity-30 animate-pulse"></div>
            </div>
            <p className="text-sm font-bold text-[#333] dark:text-gray-200">AIがカット割りを生成中...</p>
            <p className="text-[10px] text-[#78909C] text-center max-w-xs">ストーリーテキストとレギュレーションに基づいて、最適なカット構成を設計しています</p>
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}

        {/* Step: Done — 結果表示 */}
        {step === 'done' && generatedCuts.length > 0 && (
          <div className="space-y-4">
            {/* Success header */}
            <div className="flex items-center gap-3 p-3 bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 rounded-xl">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center flex-shrink-0">
                <Check size={14} className="text-white" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-violet-700 dark:text-violet-300">
                  {generatedCuts.length}カットのカット割りが完成しました！
                </p>
                <p className="text-[10px] text-violet-500 dark:text-violet-400 mt-0.5">
                  確認後、「構成表に適用」ボタンで反映してください
                </p>
              </div>
            </div>

            {/* Cut preview cards */}
            <div className="space-y-2 max-h-[320px] overflow-y-auto custom-scrollbar pr-1">
              {generatedCuts.map((cut, i) => (
                <div
                  key={i}
                  className="bg-white dark:bg-white/[0.04] border border-[#E0E0E0] dark:border-white/10 rounded-lg p-3 hover:border-violet-300 dark:hover:border-violet-500/30 transition-colors"
                >
                  <div className="flex items-start gap-2.5">
                    {/* Cut number badge */}
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${
                      cut.ipPresence
                        ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400'
                        : 'bg-violet-500/15 text-violet-600 dark:text-violet-400'
                    }`}>
                      {cut.cutNumber}
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Title + Duration */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-[#333] dark:text-gray-200">{cut.role}</span>
                        <span className="px-1.5 py-0.5 text-[8px] font-bold bg-gray-100 dark:bg-white/10 text-[#78909C] dark:text-gray-400 rounded">
                          {cut.duration}
                        </span>
                        {cut.ipPresence && (
                          <span className="px-1.5 py-0.5 text-[8px] font-bold bg-purple-500/15 text-purple-500 dark:text-purple-400 rounded">
                            IP
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 text-[8px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 rounded">
                          {cut.weightLevel}
                        </span>
                      </div>
                      {/* Central event */}
                      <p className="text-[11px] text-[#333] dark:text-gray-300 leading-relaxed mb-1">{cut.centralEvent}</p>
                      {/* Details row */}
                      <div className="flex flex-wrap gap-1.5 text-[9px] text-[#78909C] dark:text-gray-500">
                        {cut.camera && (
                          <span className="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded text-blue-600 dark:text-blue-400">
                            📷 {cut.camera}
                          </span>
                        )}
                        {cut.expression && (
                          <span className="px-1.5 py-0.5 bg-pink-50 dark:bg-pink-500/10 border border-pink-200 dark:border-pink-500/20 rounded text-pink-600 dark:text-pink-400">
                            😊 {cut.expression}
                          </span>
                        )}
                        {cut.background && (
                          <span className="px-1.5 py-0.5 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded text-green-600 dark:text-green-400">
                            🏙️ {cut.background}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Raw response toggle */}
            <button
              onClick={() => setShowRawResponse(!showRawResponse)}
              className="text-[10px] text-[#78909C] hover:text-[#333] dark:hover:text-white flex items-center gap-1 transition-colors"
            >
              {showRawResponse ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              AI応答（JSON）
            </button>
            {showRawResponse && (
              <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-3 max-h-40 overflow-auto custom-scrollbar">
                <pre className="text-[9px] text-[#78909C] dark:text-gray-500 whitespace-pre-wrap font-mono">{rawAiResponse}</pre>
              </div>
            )}

            {/* Apply / Retry buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleGenerate()}
                className="flex-1 py-2.5 rounded-xl font-bold text-xs border border-violet-300 dark:border-violet-500/30 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-all flex items-center justify-center gap-1.5"
              >
                <Sparkles size={12} />
                再生成する
              </button>
              <button
                type="button"
                onClick={handleApplyCuts}
                className="flex-[2] py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 hover:scale-[1.01] transition-all flex items-center justify-center gap-1.5"
              >
                <Check size={12} />
                構成表に適用する（{generatedCuts.length}カット）
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {step === 'error' && error && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl">
              <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-bold text-red-600 dark:text-red-400 mb-1">エラーが発生しました</p>
                <p className="text-[10px] text-red-500 dark:text-red-400/80 whitespace-pre-wrap">{error}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                className="flex-1 py-2 rounded-lg text-xs font-bold text-[#78909C] hover:text-[#333] dark:hover:text-white border border-[#E0E0E0] dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 transition-all"
              >
                やり直す
              </button>
              {extractedText && (
                <button
                  onClick={() => handleGenerate()}
                  className="flex-1 py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-md shadow-violet-500/20 hover:shadow-violet-500/30 transition-all"
                >
                  再試行する
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* キャラクター画像要求ポップアップ */}
      {showCharacterPopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="bg-[#1a1a20] border-2 border-violet-500/50 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl shadow-violet-500/30 animate-in zoom-in-95 duration-300">
            {/* Animated icon */}
            <div className="relative w-20 h-20 mx-auto mb-6">
              <div className="absolute inset-0 bg-violet-500/30 rounded-full animate-ping" />
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
                <AlertCircle size={36} className="text-white" />
              </div>
            </div>

            <h3 className="text-2xl font-black mb-3 text-white">
              キャラクター画像が必要です
            </h3>
            <p className="text-sm text-gray-300 mb-8">
              PDFの解析が完了しました！<br />
              構成表に使用するキャラクター（モデル）の画像を<br />
              先に設定してください。
            </p>

            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl mb-6">
              <p className="text-xs text-green-400 font-medium">
                <Check size={14} className="inline mr-2" />
                {pdfFile?.name} から {extractedText.length.toLocaleString()} 文字を抽出済み
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCharacterPopup(false);
                  setPendingText(null);
                  setStep('idle');
                  handleReset();
                }}
                className="flex-1 py-3 rounded-xl text-sm font-bold border border-white/20 text-gray-400 hover:text-white hover:bg-white/10 transition-all"
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  setShowCharacterPopup(false);
                  if (onRequestCharacter) {
                    onRequestCharacter();
                  }
                }}
                className="flex-1 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg hover:shadow-violet-500/40 transition-all"
              >
                画像を設定する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StoryPdfUploader;
