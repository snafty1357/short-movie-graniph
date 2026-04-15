import React, { useState, useEffect, useRef } from 'react';
import { generatePose, fileToDataUrl, generateKlingVideo, type KlingModel, type KlingDuration, type KlingAspectRatio } from '../services/falService';
import { downloadVideoFromUrl, downloadAllVideos } from '../services/videoExportService';
import { Play, Pause, Download, X, Video, Loader2, Check } from 'lucide-react';
import type { ResultItem } from './ResultGallery';
import { generateProjectId } from './ResultGallery';
import { getDeviceId } from '../services/historyService';
import { supabase } from '../services/supabaseClient';

interface ShortVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  humanFile: File | null;
  subCharacterFile?: File | null;
  subCharPrompt?: string;
  mainCharPrompt?: string;
  stillImageStyle?: string;
  stillImageNegative?: string;
  semanticPrompt?: string;
  productPrompt?: string;
  stagePrompt?: string;
  cuts: CutItem[];
  setCuts: React.Dispatch<React.SetStateAction<CutItem[]>>;
  onGenerateSuccess: (results: ResultItem[]) => void;
}

export interface CutItem {
  id: number;
  title: string;
  prompt: string;
  semanticPrompt?: string;
  camera?: string;
  enabled: boolean;
  showMain: boolean;
  showSub: boolean;
  ipPrompt?: string; // IP（サブキャラ）の状態・行動プロンプト
  generatedImageUrl?: string;
  isGenerating?: boolean;
  errorMessage?: string;
  backgroundImageUrl?: string; // シーン背景画像
  isGeneratingBackground?: boolean;
  // 詳細フィールド（構成表編集用）
  expression?: string;        // 表情
  gaze?: string;              // 視線
  pose?: string;              // ポーズ
  walkingStyle?: string;      // 歩き方
  walkPosition?: string;      // 歩行位置（画面内）
  moveDistance?: string;      // 移動距離
  action?: string;            // アクション（中心事象）
  background?: string;        // 背景要素
  productEmphasis?: string;   // プロダクト強調部位
}

export const DEFAULT_CUTS: CutItem[] = [
  { id: 1, title: '正面全身', prompt: 'standing perfectly still, completely front-facing full body shot, fashion catalog style, symmetrical pose', semanticPrompt: '状況把握', enabled: true, showMain: true, showSub: false },
  { id: 2, title: '歩きのポーズ', prompt: 'walking confidently towards the camera, fashion runway style, natural stride', semanticPrompt: '重さ提示', enabled: true, showMain: true, showSub: false },
  { id: 3, title: '振り返り', prompt: 'looking over the shoulder towards the camera, dynamic fashion angle', semanticPrompt: '重さの深化', enabled: true, showMain: true, showSub: false },
  { id: 4, title: '上半身アップ', prompt: 'close-up shot on the upper half of the body, highlighting the garment texture, material and details', semanticPrompt: 'ズレ発生', enabled: true, showMain: true, showSub: false },
  { id: 5, title: '座りポーズ', prompt: 'sitting elegantly on a minimalistic chair, relaxed fashion look', semanticPrompt: '軽さ提示', enabled: true, showMain: true, showSub: false },
  { id: 6, title: 'アクションポーズ', prompt: 'dynamic fashion pose, arms crossed or hands in pockets, strong confident look', semanticPrompt: '解放', enabled: true, showMain: true, showSub: false },
  { id: 7, title: '背面全身', prompt: 'standing back facing the camera, showing the back of the garment, fashion catalog style', semanticPrompt: '余韻', enabled: true, showMain: true, showSub: false },
];

const ShortVideoModal: React.FC<ShortVideoModalProps> = ({
  isOpen,
  onClose,
  humanFile,
  subCharacterFile,
  subCharPrompt,
  mainCharPrompt,
  stillImageStyle,
  stillImageNegative,
  semanticPrompt,
  productPrompt,
  stagePrompt,
  cuts,
  onGenerateSuccess,
}) => {
  // Composition plan
  const enabledCuts = cuts.filter(c => c.enabled);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Kling video generation settings
  const [klingModel, setKlingModel] = useState<KlingModel>('v2.6-pro');
  const [klingDuration, setKlingDuration] = useState<KlingDuration>('5');
  const [klingAspectRatio, setKlingAspectRatio] = useState<KlingAspectRatio>('9:16');
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState({ current: 0, total: 0 });
  const [generatedVideos, setGeneratedVideos] = useState<string[]>([]);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);

  // Video generation timing
  const [videoStartTime, setVideoStartTime] = useState<number | null>(null);
  const [videoElapsedTime, setVideoElapsedTime] = useState(0);
  const [videoGenerationTimes, setVideoGenerationTimes] = useState<number[]>([]);
  const videoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Download state
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
  const [downloadedIndices, setDownloadedIndices] = useState<Set<number>>(new Set());
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      // Reset modal-local state on close
      setIsGenerating(false);
      setProgress({ completed: 0, total: 0 });
      setGeneratedImages([]);
      setError(null);
      setIsPlaying(true);
      setCurrentFrameIndex(0);
      setIsGeneratingVideo(false);
      setVideoProgress({ current: 0, total: 0 });
      setGeneratedVideos([]);
      setCurrentVideoIndex(0);
      setVideoStartTime(null);
      setVideoElapsedTime(0);
      setVideoGenerationTimes([]);
      setDownloadingIndex(null);
      setDownloadedIndices(new Set());
      setIsDownloadingAll(false);
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
      if (videoTimerRef.current) clearInterval(videoTimerRef.current);
    }
  }, [isOpen]);

  // Timer for video generation elapsed time
  useEffect(() => {
    if (isGeneratingVideo && videoStartTime) {
      videoTimerRef.current = setInterval(() => {
        setVideoElapsedTime(Math.floor((Date.now() - videoStartTime) / 1000));
      }, 1000);
    } else if (videoTimerRef.current) {
      clearInterval(videoTimerRef.current);
    }
    return () => {
      if (videoTimerRef.current) clearInterval(videoTimerRef.current);
    };
  }, [isGeneratingVideo, videoStartTime]);

  useEffect(() => {
    if (generatedImages.length > 0 && isPlaying) {
      playIntervalRef.current = setInterval(() => {
        setCurrentFrameIndex((prev: number) => (prev + 1) % generatedImages.length);
      }, 700);
    } else if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [generatedImages, isPlaying]);
  // --- Generate ---
  const handleGenerate = async () => {
    if (!humanFile) {
      setError('モデル画像が設定されていません');
      return;
    }

    const activeCuts = enabledCuts;
    setIsGenerating(true);
    setError(null);
    setGeneratedImages([]);
    setProgress({ completed: 0, total: activeCuts.length });

    try {
      const humanDataUrl = await fileToDataUrl(humanFile);
      const newResults: ResultItem[] = [];
      const imageUrls: string[] = [];

      for (let i = 0; i < activeCuts.length; i++) {
        const cut = activeCuts[i];
        try {
          let imageUrl = cut.generatedImageUrl;
          let generationTimeMs = 0;

          if (!imageUrl) {
            const startTime = Date.now();
            // Build prompt: base pose + sub-character instructions if applicable
            const cameraPrefix = cut.camera ? `Camera angle: ${cut.camera}. ` : '';
            let finalPrompt = cameraPrefix + cut.prompt;
            if (mainCharPrompt) {
              finalPrompt = `${mainCharPrompt}, ${finalPrompt}`;
            }
            const combinedBase = [stillImageStyle, stagePrompt, semanticPrompt, productPrompt].filter(Boolean).join(', ');
            if (combinedBase) {
              finalPrompt = `${combinedBase}, ${finalPrompt}`;
            }
            if (stillImageNegative) {
              finalPrompt += ` (negative: ${stillImageNegative})`;
            }
            if (cut.showSub && subCharacterFile && subCharPrompt) {
              finalPrompt += `, with a small companion character: ${subCharPrompt}`;
            }
            const result = await generatePose({
              humanImageUrl: humanDataUrl,
              pose: finalPrompt,
              resolution: '1K',
              format: 'jpeg',
            });
            imageUrl = result.imageUrl;
            generationTimeMs = Date.now() - startTime;
          }

          imageUrls.push(imageUrl);
          setGeneratedImages([...imageUrls]);
          
          const newResult: ResultItem = {
            id: Date.now().toString() + i,
            projectId: generateProjectId(),
            imageUrl: imageUrl,
            timestamp: new Date(),
            description: `[Cut ${i+1}: ${cut.title}] ${cut.prompt}`,
            resolution: '1K',
            garmentType: 'None',
            generationTimeMs,
          };
          newResults.push(newResult);

          supabase.from('generations').insert({
            user_id: undefined, 
            device_id: getDeviceId(),
            project_id: newResult.projectId,
            image_url: newResult.imageUrl,
            garment_types: [],
            generation_time_ms: generationTimeMs,
            description: newResult.description || '',
            resolution: '1K',
            format: 'jpeg',
            model_image_url: null,
            garment_image_urls: [],
            company_slug: null,
          }).then(({ error }) => { if (error) console.error(error); });

        } catch (err: any) {
          console.error(`Cut ${i + 1} Error:`, err);
        }
        setProgress(prev => ({ ...prev, completed: i + 1 }));
      }

      if (imageUrls.length === 0) {
        setError('生成に失敗しました。時間をおいて再試行してください。');
      } else {
        onGenerateSuccess(newResults);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || '予期せぬエラーが発生しました');
    } finally {
      setIsGenerating(false);
    }
  };

  // --- Kling Video Generation ---
  const handleGenerateVideos = async () => {
    if (generatedImages.length === 0) return;

    setIsGeneratingVideo(true);
    setError(null);
    setGeneratedVideos([]);
    setVideoProgress({ current: 0, total: generatedImages.length });
    setVideoStartTime(Date.now());
    setVideoElapsedTime(0);
    setVideoGenerationTimes([]);

    const videos: string[] = [];
    const times: number[] = [];

    for (let i = 0; i < generatedImages.length; i++) {
      const imageUrl = generatedImages[i];
      const cut = enabledCuts[i];
      const clipStartTime = Date.now();

      try {
        const result = await generateKlingVideo({
          imageUrl,
          prompt: `${cut.prompt}. Cinematic fashion video, smooth motion, professional lighting.`,
          duration: klingDuration,
          aspectRatio: klingAspectRatio,
          model: klingModel,
        });

        const clipTime = Math.floor((Date.now() - clipStartTime) / 1000);
        times.push(clipTime);
        setVideoGenerationTimes([...times]);

        videos.push(result.videoUrl);
        setGeneratedVideos([...videos]);
      } catch (err: any) {
        console.error(`Video ${i + 1} Error:`, err);
        setError(`動画 ${i + 1} の生成に失敗: ${err.message}`);
      }

      setVideoProgress({ current: i + 1, total: generatedImages.length });
    }

    setIsGeneratingVideo(false);
  };

  // Format seconds to MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate estimated remaining time
  const getEstimatedRemaining = (): string => {
    if (videoGenerationTimes.length === 0 || videoProgress.current === 0) {
      return '計算中...';
    }
    const avgTime = videoGenerationTimes.reduce((a, b) => a + b, 0) / videoGenerationTimes.length;
    const remaining = Math.floor(avgTime * (videoProgress.total - videoProgress.current));
    return formatTime(remaining);
  };

  // Download single video
  const handleDownloadSingle = async (index: number) => {
    if (downloadingIndex !== null) return;

    setDownloadingIndex(index);
    try {
      const timestamp = new Date().toISOString().slice(0, 10);
      const cut = enabledCuts[index];
      const filename = `graniph_${timestamp}_cut${index + 1}_${cut.title}.mp4`;
      await downloadVideoFromUrl(generatedVideos[index], filename);
      setDownloadedIndices(prev => new Set([...prev, index]));
    } catch (err: any) {
      setError(`ダウンロード失敗: ${err.message}`);
    } finally {
      setDownloadingIndex(null);
    }
  };

  // Download all videos
  const handleDownloadAll = async () => {
    if (isDownloadingAll) return;

    setIsDownloadingAll(true);
    try {
      const timestamp = new Date().toISOString().slice(0, 10);
      await downloadAllVideos(
        generatedVideos,
        `graniph_${timestamp}`,
        (current, total) => {
          if (current < total) {
            setDownloadingIndex(current);
          }
        }
      );
      setDownloadedIndices(new Set(generatedVideos.map((_, i) => i)));
    } catch (err: any) {
      setError(`一括ダウンロード失敗: ${err.message}`);
    } finally {
      setIsDownloadingAll(false);
      setDownloadingIndex(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-[#111116] border border-white/10 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[95vh] text-white">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Video className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-wider">7カット ショート動画生成</h2>
              <p className="text-[10px] text-gray-400 mt-0.5">
                プレビュー・生成
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <X size={20} className="text-gray-400" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto custom-scrollbar flex flex-col md:flex-row gap-5 flex-1">
            
            {/* Left: Video Preview Area */}
            <div className="flex-1 min-w-0">
              <div className="relative aspect-[9/16] bg-black rounded-lg border border-white/10 overflow-hidden flex items-center justify-center shadow-inner">
                {generatedVideos.length > 0 ? (
                  <>
                    <video
                      key={generatedVideos[currentVideoIndex]}
                      src={generatedVideos[currentVideoIndex]}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />

                    {/* Video Navigation */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/20">
                      <span className="text-xs text-white">動画 {currentVideoIndex + 1}/{generatedVideos.length}</span>
                      <div className="flex gap-1">
                        {generatedVideos.map((_: any, idx: number) => (
                          <button
                            key={idx}
                            onClick={() => setCurrentVideoIndex(idx)}
                            className={`w-2 h-2 rounded-full transition-all ${
                              idx === currentVideoIndex ? 'bg-cyan-400 scale-125' : 'bg-white/30 hover:bg-white/50'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                ) : generatedImages.length > 0 ? (
                  <>
                    <img
                      src={generatedImages[currentFrameIndex]}
                      alt={`Frame ${currentFrameIndex}`}
                      className="w-full h-full object-cover transition-opacity duration-150"
                    />

                    {/* Playback Controls */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/20">
                      <button
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="text-white hover:text-purple-400 transition-colors"
                      >
                        {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                      </button>
                      <div className="flex gap-1">
                        {generatedImages.map((_: any, idx: number) => (
                          <div
                            key={idx}
                            className={`w-1.5 h-1.5 rounded-full transition-all ${
                              idx === currentFrameIndex ? 'bg-white scale-125' : 'bg-white/30'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center text-gray-500 space-y-3">
                    <Video className="w-12 h-12 mx-auto stroke-[1] opacity-50" />
                    <p className="text-xs uppercase tracking-widest">プレビュー</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Progress & Actions */}
            <div className="flex-1 flex flex-col justify-center space-y-5">
              {/* Active cuts summary */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-gray-300 uppercase tracking-widest border-b border-white/10 pb-2">
                  構成（{enabledCuts.length}カット）
                </h3>
                <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                  {enabledCuts.map((cut, i) => (
                    <div key={cut.id} className="flex items-center gap-2 text-xs text-gray-400">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
                        progress.completed > i
                          ? 'bg-green-500/20 text-green-400'
                          : progress.completed === i && isGenerating
                          ? 'bg-purple-500/20 text-purple-400 animate-pulse'
                          : 'bg-white/5 text-gray-600'
                      }`}>
                        {progress.completed > i ? '✓' : i + 1}
                      </span>
                      <span className={progress.completed > i ? 'text-gray-300' : ''}>{cut.title}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Kling Settings */}
              <div className="space-y-3 p-3 bg-white/5 rounded-xl border border-white/10">
                <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                  <Video size={14} /> Kling 動画設定
                </h4>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">モデル</label>
                    <select
                      value={klingModel}
                      onChange={(e) => setKlingModel(e.target.value as KlingModel)}
                      disabled={isGeneratingVideo}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    >
                      <option value="v1-standard">V1 Standard</option>
                      <option value="v1-pro">V1 Pro</option>
                      <option value="v2-master">V2 Master</option>
                      <option value="v2.1-pro">V2.1 Pro</option>
                      <option value="v2.6-pro">V2.6 Pro</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">動画長</label>
                    <select
                      value={klingDuration}
                      onChange={(e) => setKlingDuration(e.target.value as KlingDuration)}
                      disabled={isGeneratingVideo}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    >
                      <option value="5">5秒</option>
                      <option value="10">10秒</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">比率</label>
                    <select
                      value={klingAspectRatio}
                      onChange={(e) => setKlingAspectRatio(e.target.value as KlingAspectRatio)}
                      disabled={isGeneratingVideo}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    >
                      <option value="9:16">9:16 (縦)</option>
                      <option value="16:9">16:9 (横)</option>
                      <option value="1:1">1:1 (正方形)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              {isGenerating && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>生成中... ({progress.completed} / {progress.total})</span>
                    <span>{Math.round((progress.completed / progress.total) * 100)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                      style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="text-red-400 text-xs bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                  {error}
                </div>
              )}

              {generatedImages.length === enabledCuts.length && generatedImages.length > 0 && (
                <div className="text-green-400 text-xs bg-green-500/10 p-3 rounded-lg border border-green-500/20 text-center font-bold">
                  画像セットが完成しました！
                </div>
              )}

              {/* Kling Video Generation Progress */}
              {isGeneratingVideo && (
                <div className="space-y-3 p-3 bg-cyan-500/10 rounded-xl border border-cyan-500/20">
                  <div className="flex justify-between text-xs text-gray-300">
                    <span className="font-bold">動画生成中... ({videoProgress.current} / {videoProgress.total})</span>
                    <span>{Math.round((videoProgress.current / videoProgress.total) * 100)}%</span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
                      style={{ width: `${(videoProgress.current / videoProgress.total) * 100}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="bg-white/5 rounded-lg p-2 text-center">
                      <div className="text-gray-500 mb-0.5">経過時間</div>
                      <div className="text-cyan-400 font-mono font-bold text-sm">{formatTime(videoElapsedTime)}</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-2 text-center">
                      <div className="text-gray-500 mb-0.5">残り予測</div>
                      <div className="text-blue-400 font-mono font-bold text-sm">{getEstimatedRemaining()}</div>
                    </div>
                  </div>
                  {videoGenerationTimes.length > 0 && (
                    <div className="text-[10px] text-gray-500 text-center">
                      平均: {formatTime(Math.floor(videoGenerationTimes.reduce((a, b) => a + b, 0) / videoGenerationTimes.length))} / 本
                    </div>
                  )}
                </div>
              )}

              {generatedVideos.length > 0 && !isGeneratingVideo && (
                <div className="space-y-3 p-3 bg-green-500/10 rounded-xl border border-green-500/20">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-green-400 font-bold">✓ {generatedVideos.length}本の動画が生成されました</p>
                    {videoGenerationTimes.length > 0 && (
                      <p className="text-[10px] text-gray-400">
                        合計: {formatTime(videoGenerationTimes.reduce((a, b) => a + b, 0))}
                      </p>
                    )}
                  </div>

                  {/* 動画一覧（個別ダウンロード付き） */}
                  <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                    {generatedVideos.map((_, idx) => {
                      const cut = enabledCuts[idx];
                      const isDownloading = downloadingIndex === idx;
                      const isDownloaded = downloadedIndices.has(idx);

                      return (
                        <div
                          key={idx}
                          className={`flex items-center gap-2 p-2 rounded-lg transition-all ${
                            idx === currentVideoIndex
                              ? 'bg-cyan-500/20 border border-cyan-500/30'
                              : 'bg-white/5 hover:bg-white/10'
                          }`}
                        >
                          <button
                            onClick={() => setCurrentVideoIndex(idx)}
                            className="flex-1 text-left"
                          >
                            <span className="text-xs font-medium text-white">
                              {idx + 1}. {cut?.title || `カット ${idx + 1}`}
                            </span>
                          </button>

                          <button
                            onClick={() => handleDownloadSingle(idx)}
                            disabled={isDownloading || isDownloadingAll}
                            className={`p-1.5 rounded-lg transition-all ${
                              isDownloaded
                                ? 'bg-green-500/20 text-green-400'
                                : isDownloading
                                ? 'bg-cyan-500/20 text-cyan-400'
                                : 'bg-white/10 text-gray-400 hover:bg-white/20 hover:text-white'
                            }`}
                          >
                            {isDownloading ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : isDownloaded ? (
                              <Check size={14} />
                            ) : (
                              <Download size={14} />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="space-y-2 mt-auto pt-3 border-t border-white/10">
                {generatedVideos.length > 0 ? (
                  <>
                    <button
                      onClick={handleDownloadAll}
                      disabled={isDownloadingAll || downloadingIndex !== null}
                      className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                        isDownloadingAll || downloadingIndex !== null
                          ? 'bg-white/10 text-gray-400 cursor-not-allowed'
                          : downloadedIndices.size === generatedVideos.length
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-white text-black hover:bg-gray-200'
                      }`}
                    >
                      {isDownloadingAll ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          ダウンロード中... ({downloadingIndex !== null ? downloadingIndex + 1 : 0}/{generatedVideos.length})
                        </>
                      ) : downloadedIndices.size === generatedVideos.length ? (
                        <>
                          <Check size={16} /> 全てダウンロード済み
                        </>
                      ) : (
                        <>
                          <Download size={16} /> 全ての動画をダウンロード ({generatedVideos.length}本)
                        </>
                      )}
                    </button>
                    <button
                      onClick={onClose}
                      className="w-full py-2 text-xs text-gray-400 hover:text-white transition-colors"
                    >
                      閉じる
                    </button>
                  </>
                ) : generatedImages.length === enabledCuts.length && generatedImages.length > 0 ? (
                  <>
                    <button
                      onClick={handleGenerateVideos}
                      disabled={isGeneratingVideo}
                      className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all duration-300 ${
                        isGeneratingVideo
                          ? 'bg-white/5 text-gray-500 cursor-not-allowed border border-white/5'
                          : 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-xl shadow-cyan-500/25 hover:shadow-cyan-500/40'
                      }`}
                    >
                      {isGeneratingVideo ? (
                        <>
                          <Loader2 size={16} className="animate-spin" /> 動画生成中...
                        </>
                      ) : (
                        <>
                          <Video size={16} /> {enabledCuts.length}カットを動画化 (Kling)
                        </>
                      )}
                    </button>
                    <button
                      onClick={onClose}
                      className="w-full py-2 text-xs text-gray-400 hover:text-white transition-colors"
                    >
                      閉じる
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating || !humanFile}
                    className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all duration-300 ${
                      isGenerating || !humanFile
                        ? 'bg-white/5 text-gray-500 cursor-not-allowed border border-white/5'
                        : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-xl shadow-purple-500/25 hover:shadow-purple-500/40'
                    }`}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 size={16} className="animate-spin" /> 画像生成中...
                      </>
                    ) : (
                      <>
                        <Video size={16} /> {enabledCuts.length}カットを生成
                      </>
                    )}
                  </button>
                )}
              </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShortVideoModal;
