import React, { useState, useRef, useEffect } from 'react';
import {
  X, FileText, User, Sparkles, Image as ImageIcon, Video, Check, ChevronRight,
  Loader2, AlertCircle, Download, RefreshCw
} from 'lucide-react';
import { extractTextFromPdf, generateCutComposition, compositionRowToCutItem, DEFAULT_REGULATION, DEFAULT_META_PROMPT, type AiModelType } from '../services/storyPdfService';
import { generatePose, fileToDataUrl, generateKlingVideo, type KlingModel } from '../services/falService';
import { downloadVideoFromUrl } from '../services/videoExportService';
import type { CutItem } from '../types/cuts';

interface StoryboardWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  aiModel: AiModelType;
  existingCharacterFile?: File | null; // 既存のキャラクター画像
}

type WorkflowStep = 'pdf' | 'character' | 'generating' | 'preview' | 'video';

interface GeneratedCut extends CutItem {
  imageUrl?: string;
  videoUrl?: string;
  isGeneratingImage?: boolean;
  isGeneratingVideo?: boolean;
}

const StoryboardWorkflowModal: React.FC<StoryboardWorkflowModalProps> = ({
  isOpen,
  onClose,
  aiModel,
  existingCharacterFile,
}) => {
  // Workflow state
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('pdf');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [characterFile, setCharacterFile] = useState<File | null>(null);
  const [characterPreview, setCharacterPreview] = useState<string | null>(null);
  const [cuts, setCuts] = useState<GeneratedCut[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Generation progress
  const [isExtractingPdf, setIsExtractingPdf] = useState(false);
  const [isGeneratingCuts, setIsGeneratingCuts] = useState(false);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [isGeneratingVideos, setIsGeneratingVideos] = useState(false);
  const [imageProgress, setImageProgress] = useState({ current: 0, total: 0 });
  const [videoProgress, setVideoProgress] = useState({ current: 0, total: 0 });

  // Kling settings
  const [klingModel, setKlingModel] = useState<KlingModel>('v2-master');

  // Refs
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const characterInputRef = useRef<HTMLInputElement>(null);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setCurrentStep('pdf');
      setPdfFile(null);
      setExtractedText('');
      setCharacterFile(null);
      setCharacterPreview(null);
      setCuts([]);
      setError(null);
      setIsExtractingPdf(false);
      setIsGeneratingCuts(false);
      setIsGeneratingImages(false);
      setIsGeneratingVideos(false);
    }
  }, [isOpen]);

  // Handle PDF upload
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.name.endsWith('.pdf')) {
      setError('PDFファイルを選択してください');
      return;
    }

    setPdfFile(file);
    setIsExtractingPdf(true);
    setError(null);

    try {
      const text = await extractTextFromPdf(file);
      if (!text.trim()) {
        throw new Error('PDFからテキストを抽出できませんでした');
      }
      setExtractedText(text);
      setIsExtractingPdf(false);

      // デバッグ: existingCharacterFileの値を確認
      console.log('[Storyboard] existingCharacterFile:', existingCharacterFile);
      console.log('[Storyboard] existingCharacterFile type:', typeof existingCharacterFile);

      // キャラクター画像が既に設定されている場合は自動生成開始
      const hasCharacter = existingCharacterFile && existingCharacterFile instanceof File;
      console.log('[Storyboard] hasCharacter:', hasCharacter);

      if (hasCharacter) {
        console.log('[Storyboard] Character file exists, starting generation');
        setCharacterFile(existingCharacterFile);
        const preview = URL.createObjectURL(existingCharacterFile);
        setCharacterPreview(preview);
        // 直接生成を開始
        await startGenerationWithText(text, existingCharacterFile);
      } else {
        // キャラクター画像がない場合はポップアップ表示
        console.log('[Storyboard] No character file, showing popup. Setting step to character');
        setCurrentStep('character');
        console.log('[Storyboard] Step set to character');
      }
    } catch (err: any) {
      setError(err.message);
      setIsExtractingPdf(false);
    }

    e.target.value = '';
  };

  // Handle character image upload
  const handleCharacterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCharacterFile(file);
    const preview = URL.createObjectURL(file);
    setCharacterPreview(preview);

    // Both PDF and character are ready - start generation
    await startGeneration(file);
    e.target.value = '';
  };

  // Start generation process with text
  const startGenerationWithText = async (text: string, charFile: File) => {
    setCurrentStep('generating');
    setError(null);
    setIsGeneratingCuts(true);

    try {
      // Step 1: Generate cut composition from AI
      const result = await generateCutComposition(
        text,
        DEFAULT_REGULATION,
        DEFAULT_META_PROMPT,
        7,
        aiModel
      );

      const generatedCuts: GeneratedCut[] = result.cuts.map((row, i) => ({
        ...compositionRowToCutItem(row, i),
        imageUrl: undefined,
        videoUrl: undefined,
      }));

      setCuts(generatedCuts);
      setIsGeneratingCuts(false);

      // Step 2: Generate images for each cut
      setIsGeneratingImages(true);
      setImageProgress({ current: 0, total: generatedCuts.length });

      const charDataUrl = await fileToDataUrl(charFile);

      for (let i = 0; i < generatedCuts.length; i++) {
        const cut = generatedCuts[i];

        setCuts(prev => prev.map((c, idx) =>
          idx === i ? { ...c, isGeneratingImage: true } : c
        ));

        try {
          const imageResult = await generatePose({
            humanImageUrl: charDataUrl,
            pose: cut.prompt,
            resolution: '1K',
            format: 'jpeg',
          });

          setCuts(prev => prev.map((c, idx) =>
            idx === i ? { ...c, imageUrl: imageResult.imageUrl, isGeneratingImage: false } : c
          ));
        } catch (err) {
          console.error(`Image ${i + 1} error:`, err);
          setCuts(prev => prev.map((c, idx) =>
            idx === i ? { ...c, isGeneratingImage: false } : c
          ));
        }

        setImageProgress({ current: i + 1, total: generatedCuts.length });
      }

      setIsGeneratingImages(false);
      setCurrentStep('preview');
    } catch (err: any) {
      setError(err.message);
      setIsGeneratingCuts(false);
      setIsGeneratingImages(false);
    }
  };

  // Start generation process (wrapper for existing text)
  const startGeneration = async (charFile: File) => {
    await startGenerationWithText(extractedText, charFile);
  };

  // Generate videos from images
  const handleGenerateVideos = async () => {
    const cutsWithImages = cuts.filter(c => c.imageUrl);
    if (cutsWithImages.length === 0) return;

    setCurrentStep('video');
    setIsGeneratingVideos(true);
    setVideoProgress({ current: 0, total: cutsWithImages.length });

    for (let i = 0; i < cuts.length; i++) {
      const cut = cuts[i];
      if (!cut.imageUrl) continue;

      setCuts(prev => prev.map((c, idx) =>
        idx === i ? { ...c, isGeneratingVideo: true } : c
      ));

      try {
        const videoResult = await generateKlingVideo({
          imageUrl: cut.imageUrl,
          prompt: `${cut.prompt}. Cinematic fashion video, smooth motion, professional lighting.`,
          duration: '5',
          aspectRatio: '9:16',
          model: klingModel,
        });

        setCuts(prev => prev.map((c, idx) =>
          idx === i ? { ...c, videoUrl: videoResult.videoUrl, isGeneratingVideo: false } : c
        ));
      } catch (err) {
        console.error(`Video ${i + 1} error:`, err);
        setCuts(prev => prev.map((c, idx) =>
          idx === i ? { ...c, isGeneratingVideo: false } : c
        ));
      }

      setVideoProgress(prev => ({ ...prev, current: prev.current + 1 }));
    }

    setIsGeneratingVideos(false);
  };

  // Regenerate single image
  const handleRegenerateImage = async (index: number) => {
    if (!characterFile) return;

    setCuts(prev => prev.map((c, idx) =>
      idx === index ? { ...c, isGeneratingImage: true } : c
    ));

    try {
      const charDataUrl = await fileToDataUrl(characterFile);
      const cut = cuts[index];

      const imageResult = await generatePose({
        humanImageUrl: charDataUrl,
        pose: cut.prompt,
        resolution: '1K',
        format: 'jpeg',
      });

      setCuts(prev => prev.map((c, idx) =>
        idx === index ? { ...c, imageUrl: imageResult.imageUrl, isGeneratingImage: false } : c
      ));
    } catch (err) {
      console.error('Regenerate error:', err);
      setCuts(prev => prev.map((c, idx) =>
        idx === index ? { ...c, isGeneratingImage: false } : c
      ));
    }
  };

  if (!isOpen) return null;

  const steps = [
    { id: 'pdf', label: 'PDF', icon: FileText },
    { id: 'character', label: 'キャラクター', icon: User },
    { id: 'generating', label: '生成中', icon: Sparkles },
    { id: 'preview', label: '構成表', icon: ImageIcon },
    { id: 'video', label: '動画', icon: Video },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-[#111116] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col text-white">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold">ストーリーボード自動生成</h2>
              <p className="text-[10px] text-gray-400">PDF + キャラクター → 構成表 → 動画</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 p-4 border-b border-white/10 bg-white/[0.02]">
          {steps.map((step, i) => {
            const Icon = step.icon;
            const isActive = step.id === currentStep;
            const isCompleted = i < currentStepIndex;

            return (
              <React.Fragment key={step.id}>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                    : isCompleted
                    ? 'bg-green-500/20 text-green-400'
                    : 'text-gray-500'
                }`}>
                  {isCompleted ? <Check size={12} /> : <Icon size={12} />}
                  {step.label}
                </div>
                {i < steps.length - 1 && (
                  <ChevronRight size={14} className={isCompleted ? 'text-green-500' : 'text-gray-600'} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="flex items-center gap-3 p-4 mb-4 bg-red-500/10 border border-red-500/20 rounded-xl">
              <AlertCircle size={16} className="text-red-400" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Step: PDF Upload */}
          {currentStep === 'pdf' && (
            <div className="flex flex-col items-center justify-center py-12">
              {isExtractingPdf ? (
                <div className="text-center space-y-4">
                  <Loader2 size={48} className="mx-auto text-violet-500 animate-spin" />
                  <p className="text-sm font-bold">PDFを解析中...</p>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-violet-500/30 rounded-2xl hover:bg-violet-500/5 cursor-pointer transition-all w-full max-w-md">
                  <FileText size={48} className="text-violet-400 mb-4" />
                  <span className="text-lg font-bold mb-2">ストーリーPDFをアップロード</span>
                  <span className="text-xs text-gray-400">シナリオ、プロット、ストーリー等のPDF</span>
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={handlePdfUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          )}

          {/* Character step placeholder - actual popup is rendered outside */}
          {currentStep === 'character' && (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-sm text-gray-400">キャラクター画像を選択してください...</p>
            </div>
          )}

          {/* Step: Generating */}
          {currentStep === 'generating' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-6">
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center animate-pulse">
                  <Sparkles size={32} className="text-white" />
                </div>
              </div>

              <div className="text-center space-y-2">
                {isGeneratingCuts && (
                  <p className="text-sm font-bold">AIがカット構成を生成中...</p>
                )}
                {isGeneratingImages && (
                  <>
                    <p className="text-sm font-bold">構成表画像を生成中...</p>
                    <p className="text-xs text-gray-400">
                      {imageProgress.current} / {imageProgress.total} カット
                    </p>
                    <div className="w-64 h-2 bg-white/10 rounded-full overflow-hidden mx-auto">
                      <div
                        className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all"
                        style={{ width: `${(imageProgress.current / imageProgress.total) * 100}%` }}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Preview of cuts being generated */}
              {cuts.length > 0 && (
                <div className="grid grid-cols-7 gap-2 w-full max-w-2xl">
                  {cuts.map((cut, i) => (
                    <div key={i} className="aspect-[9/16] rounded-lg overflow-hidden bg-white/5 border border-white/10">
                      {cut.imageUrl ? (
                        <img src={cut.imageUrl} alt={cut.title} className="w-full h-full object-cover" />
                      ) : cut.isGeneratingImage ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <Loader2 size={16} className="animate-spin text-violet-400" />
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-500">
                          {i + 1}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step: Preview (Storyboard) */}
          {currentStep === 'preview' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">構成表プレビュー ({cuts.length}カット)</h3>
                <div className="flex gap-2">
                  <select
                    value={klingModel}
                    onChange={(e) => setKlingModel(e.target.value as KlingModel)}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs"
                  >
                    <option value="v1-standard">Kling V1 Standard</option>
                    <option value="v1-pro">Kling V1 Pro</option>
                    <option value="v2-master">Kling V2 Master</option>
                    <option value="v2.1-pro">Kling V2.1 Pro</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {cuts.map((cut, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                    {/* Image */}
                    <div className="aspect-[9/16] relative group">
                      {cut.imageUrl ? (
                        <>
                          <img src={cut.imageUrl} alt={cut.title} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleRegenerateImage(i)}
                              disabled={cut.isGeneratingImage}
                              className="p-2 bg-white/20 rounded-full hover:bg-white/30"
                            >
                              {cut.isGeneratingImage ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <RefreshCw size={16} />
                              )}
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-white/5">
                          {cut.isGeneratingImage ? (
                            <Loader2 size={24} className="animate-spin text-violet-400" />
                          ) : (
                            <ImageIcon size={24} className="text-gray-500" />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-violet-500/20 text-violet-400 text-xs font-bold flex items-center justify-center">
                          {i + 1}
                        </span>
                        <span className="text-xs font-bold truncate">{cut.title}</span>
                      </div>
                      <p className="text-[10px] text-gray-400 line-clamp-2">{cut.prompt}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 pt-4 border-t border-white/10">
                <button
                  onClick={() => startGeneration(characterFile!)}
                  className="flex-1 py-3 rounded-xl text-xs font-bold border border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
                >
                  <RefreshCw size={14} className="inline mr-2" />
                  全て再生成
                </button>
                <button
                  onClick={handleGenerateVideos}
                  disabled={cuts.filter(c => c.imageUrl).length === 0}
                  className="flex-[2] py-3 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg disabled:opacity-50"
                >
                  <Video size={14} className="inline mr-2" />
                  動画を生成する ({cuts.filter(c => c.imageUrl).length}カット)
                </button>
              </div>
            </div>
          )}

          {/* Step: Video Generation */}
          {currentStep === 'video' && (
            <div className="space-y-6">
              {isGeneratingVideos && (
                <div className="text-center py-8 space-y-4">
                  <Loader2 size={48} className="mx-auto text-cyan-500 animate-spin" />
                  <p className="text-sm font-bold">動画を生成中...</p>
                  <p className="text-xs text-gray-400">
                    {videoProgress.current} / {videoProgress.total} カット
                  </p>
                  <div className="w-64 h-2 bg-white/10 rounded-full overflow-hidden mx-auto">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all"
                      style={{ width: `${(videoProgress.current / videoProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {cuts.map((cut, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                    <div className="aspect-[9/16] relative">
                      {cut.videoUrl ? (
                        <video
                          src={cut.videoUrl}
                          autoPlay
                          loop
                          muted
                          playsInline
                          className="w-full h-full object-cover"
                        />
                      ) : cut.isGeneratingVideo ? (
                        <div className="w-full h-full flex items-center justify-center bg-white/5">
                          <Loader2 size={24} className="animate-spin text-cyan-400" />
                        </div>
                      ) : cut.imageUrl ? (
                        <img src={cut.imageUrl} alt={cut.title} className="w-full h-full object-cover opacity-50" />
                      ) : null}

                      {cut.videoUrl && (
                        <button
                          onClick={() => downloadVideoFromUrl(cut.videoUrl!, `cut_${i + 1}_${cut.title}.mp4`)}
                          className="absolute bottom-2 right-2 p-2 bg-black/50 rounded-full hover:bg-black/70"
                        >
                          <Download size={14} />
                        </button>
                      )}
                    </div>

                    <div className="p-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                          cut.videoUrl
                            ? 'bg-green-500/20 text-green-400'
                            : cut.isGeneratingVideo
                            ? 'bg-cyan-500/20 text-cyan-400'
                            : 'bg-gray-500/20 text-gray-400'
                        }`}>
                          {cut.videoUrl ? <Check size={12} /> : i + 1}
                        </span>
                        <span className="text-xs font-bold truncate">{cut.title}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Done message */}
              {!isGeneratingVideos && cuts.filter(c => c.videoUrl).length > 0 && (
                <div className="text-center py-6 space-y-4">
                  <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                    <Check size={32} className="text-green-400" />
                  </div>
                  <p className="text-sm font-bold text-green-400">
                    {cuts.filter(c => c.videoUrl).length}本の動画が完成しました！
                  </p>
                  <p className="text-xs text-gray-400">各動画のダウンロードボタンから保存できます</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Character Upload Popup - Rendered outside the modal for proper z-index */}
      {currentStep === 'character' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="bg-[#1a1a20] border-2 border-violet-500/50 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl shadow-violet-500/30 animate-in zoom-in-95 duration-300">
            {/* Animated icon */}
            <div className="relative w-20 h-20 mx-auto mb-6">
              <div className="absolute inset-0 bg-violet-500/30 rounded-full animate-ping" />
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
                <User size={36} className="text-white" />
              </div>
            </div>

            <h3 className="text-2xl font-black mb-3 bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              キャラクター画像が必要です
            </h3>
            <p className="text-sm text-gray-300 mb-8">
              PDFの解析が完了しました！<br />
              構成表に使用するモデル画像をアップロードしてください。
            </p>

            {characterPreview ? (
              <div className="relative w-40 h-40 mx-auto mb-6 rounded-2xl overflow-hidden border-4 border-violet-500 shadow-xl shadow-violet-500/20">
                <img src={characterPreview} alt="Character" className="w-full h-full object-cover" />
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center p-10 border-2 border-dashed border-violet-500 rounded-2xl hover:bg-violet-500/20 cursor-pointer transition-all group mb-6">
                <div className="w-16 h-16 rounded-full bg-violet-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <User size={32} className="text-violet-400" />
                </div>
                <span className="text-lg font-bold text-white mb-1">画像を選択</span>
                <span className="text-xs text-gray-400">正面向きの全身画像を推奨</span>
                <input
                  ref={characterInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleCharacterUpload}
                  className="hidden"
                />
              </label>
            )}

            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
              <p className="text-xs text-green-400 font-medium">
                <Check size={14} className="inline mr-2" />
                {pdfFile?.name} から {extractedText.length.toLocaleString()} 文字を抽出済み
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StoryboardWorkflowModal;
