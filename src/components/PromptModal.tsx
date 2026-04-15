/**
 * Prompt Modal - アイテムアップロード時の説明入力ポップアップ
 * 服の詳細分析機能付き（編集可能）
 */
import React, { useState, useEffect } from 'react';
import { optimizeTryOnPrompt, type GarmentAnalysis } from '../services/openaiService';

interface PromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (description: string, analysis?: GarmentAnalysis) => void;
  onAnalyze?: () => Promise<GarmentAnalysis>;
  itemLabel: string;
  itemEmoji: React.ReactNode;
  accentColor: string;
  previewUrl: string | null;
  initialDescription?: string;
  isOptimizing?: boolean;
}

// 編集可能な分析項目コンポーネント
const EditableAnalysisItem = ({
  label,
  value,
  icon,
  fieldKey,
  onUpdate,
}: {
  label: string;
  value: string;
  icon: string;
  fieldKey: string;
  onUpdate: (key: string, value: string) => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  const handleSave = () => {
    onUpdate(fieldKey, editValue);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-start gap-2 text-[11px]">
        <span className="text-base flex-shrink-0 mt-0.5">{icon}</span>
        <div className="flex-1">
          <span className="text-[#78909C] block mb-1">{label}:</span>
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            autoFocus
            className="w-full bg-[#FAFAFA] border border-[#00BFA5]/50 rounded px-2 py-1 text-[#333333] text-[11px] focus:outline-none focus:border-[#00BFA5]"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-start gap-2 text-[11px] cursor-pointer group hover:bg-[#F5F5F5] rounded px-1 py-0.5 -mx-1 transition-colors"
      onClick={() => setIsEditing(true)}
    >
      <span className="text-base flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <span className="text-[#78909C]">{label}:</span>
        <span className="text-[#333333] ml-1">{value}</span>
        <span className="text-[#78909C] ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-[9px]">
          (クリックで編集)
        </span>
      </div>
    </div>
  );
};

const PromptModal: React.FC<PromptModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  onAnalyze,
  itemLabel,
  itemEmoji,
  accentColor,
  previewUrl,
  initialDescription = '',
  isOptimizing = false,
}) => {
  const [description, setDescription] = useState(initialDescription);
  const [optimizing, setOptimizing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<GarmentAnalysis | null>(null);

  useEffect(() => {
    setDescription(initialDescription);
  }, [initialDescription, isOpen]);

  // モーダルが開いたら自動で分析を開始
  useEffect(() => {
    if (isOpen && onAnalyze && previewUrl && !analysis) {
      handleAnalyze();
    }
    if (!isOpen) {
      setAnalysis(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, previewUrl, onAnalyze]);

  const handleAnalyze = async () => {
    if (!onAnalyze) return;
    setAnalyzing(true);
    try {
      const result = await onAnalyze();
      setAnalysis(result);
      // 分析結果のsummaryを説明に設定
      if (result.summary && !description) {
        setDescription(result.summary);
      }
    } catch (e) {
      console.error('Analysis failed:', e);
    } finally {
      setAnalyzing(false);
    }
  };

  // 分析結果の更新
  const handleUpdateAnalysis = (key: string, value: string) => {
    if (!analysis) return;
    setAnalysis({
      ...analysis,
      [key]: value,
    });
  };

  // 分析結果から詳細な説明文を生成
  const generateDetailedDescription = async () => {
    if (!analysis) return;

    setOptimizing(true);
    try {
      const parts: string[] = [];

      parts.push(`【種類】 ${analysis.type}`);
      parts.push(`【色】 ${analysis.color}`);
      if (analysis.pattern && analysis.pattern !== '無地') parts.push(`【柄】 ${analysis.pattern}`);
      if (analysis.buttons && analysis.buttons !== 'なし') parts.push(`【ボタン】 ${analysis.buttons}`);
      if (analysis.pockets && analysis.pockets !== 'なし') parts.push(`【ポケット】 ${analysis.pockets}`);
      if (analysis.collar && analysis.collar !== 'なし') parts.push(`【襟】 ${analysis.collar}`);
      if (analysis.sleeves && analysis.sleeves !== 'なし') parts.push(`【袖】 ${analysis.sleeves}`);
      if (analysis.decorations && analysis.decorations !== '特になし' && analysis.decorations !== 'なし') parts.push(`【装飾】 ${analysis.decorations}`);
      if (analysis.material && analysis.material !== '不明') parts.push(`【素材】 ${analysis.material}`);
      if (analysis.extra && analysis.extra.trim()) parts.push(`【追加メモ】 ${analysis.extra.trim()}`);

      const japaneseContext = parts.join('\\n');
      
      // 生成された日本語の分析結果を英語に翻訳・最適化する
      const optimized = await optimizeTryOnPrompt(japaneseContext);
      setDescription(optimized);
    } catch (e) {
      console.error('Failed to generate description from analysis:', e);
    } finally {
      setOptimizing(false);
    }
  };

  if (!isOpen) return null;



  const handleSubmit = () => {
    onSubmit(description, analysis || undefined);
    onClose();
  };

  const handleSkip = () => {
    onSubmit('', analysis || undefined);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#FAFAFA] backdrop-blur-sm flex items-center justify-center p-4 animate-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#0d0d12] border border-[#E0E0E0] rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E0E0E0] flex items-center justify-between sticky top-0 bg-[#0d0d12] z-10">
          <h3 className="text-[#333333] font-bold text-base flex items-center gap-2">
            <span className="text-xl flex items-center justify-center">{itemEmoji}</span>
            {itemLabel}の分析
          </h3>
          <button
            onClick={onClose}
            className="text-[#78909C] hover:text-[#333333] transition-colors w-8 h-8 rounded-lg hover:bg-[#F5F5F5] flex items-center justify-center"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="flex gap-5">
            {/* Preview */}
            {previewUrl && (
              <div className="flex-shrink-0">
                <div
                  className="w-32 h-40 rounded-xl overflow-hidden border-2 bg-[#FAFAFA]"
                  style={{ borderColor: `${accentColor}50` }}
                >
                  <img src={previewUrl} alt={itemLabel} className="w-full h-full object-contain" />
                </div>
              </div>
            )}

            {/* Analysis Results - Editable */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-4 rounded-full" style={{ backgroundColor: accentColor }}></div>
                <h4 className="text-xs font-semibold text-[#333333]">AI分析結果</h4>
                <span className="text-[9px] text-[#78909C]">クリックで編集</span>
                {analyzing && (
                  <div className="flex items-center gap-1.5 text-[10px] text-[#78909C]">
                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    分析中...
                  </div>
                )}
              </div>

              {analysis ? (
                <div className="space-y-1 bg-[#FAFAFA] rounded-xl p-3 border border-[#E0E0E0]">
                  <EditableAnalysisItem icon="👕" label="種類" value={analysis.type} fieldKey="type" onUpdate={handleUpdateAnalysis} />
                  <EditableAnalysisItem icon="🎨" label="色" value={analysis.color} fieldKey="color" onUpdate={handleUpdateAnalysis} />
                  <EditableAnalysisItem icon="🔲" label="柄" value={analysis.pattern} fieldKey="pattern" onUpdate={handleUpdateAnalysis} />
                  <EditableAnalysisItem icon="🔘" label="ボタン" value={analysis.buttons} fieldKey="buttons" onUpdate={handleUpdateAnalysis} />
                  <EditableAnalysisItem icon="👜" label="ポケット" value={analysis.pockets} fieldKey="pockets" onUpdate={handleUpdateAnalysis} />
                  <EditableAnalysisItem icon="👔" label="襟" value={analysis.collar} fieldKey="collar" onUpdate={handleUpdateAnalysis} />
                  <EditableAnalysisItem icon="💪" label="袖" value={analysis.sleeves} fieldKey="sleeves" onUpdate={handleUpdateAnalysis} />
                  <EditableAnalysisItem icon="🧵" label="素材" value={analysis.material} fieldKey="material" onUpdate={handleUpdateAnalysis} />
                  <EditableAnalysisItem icon="✨" label="装飾" value={analysis.decorations} fieldKey="decorations" onUpdate={handleUpdateAnalysis} />
                  {analysis.brand && analysis.brand !== '確認できず' && (
                    <EditableAnalysisItem icon="🏷️" label="ブランド" value={analysis.brand} fieldKey="brand" onUpdate={handleUpdateAnalysis} />
                  )}
                  {/* 追加メモ欄 */}
                  <div className="pt-2 mt-2 border-t border-[#E0E0E0]">
                    <div className="flex items-start gap-2 text-[11px]">
                      <span className="text-base flex-shrink-0">📝</span>
                      <div className="flex-1">
                        <span className="text-[#00ff88] block mb-1">追加メモ:</span>
                        <textarea
                          value={analysis.extra || ''}
                          onChange={(e) => handleUpdateAnalysis('extra', e.target.value)}
                          placeholder="AIが見逃した特徴や、追加で伝えたい情報を入力..."
                          rows={2}
                          className="w-full bg-[#FAFAFA] border border-[#E0E0E0] rounded px-2 py-1.5 text-[#333333] text-[11px] focus:outline-none focus:border-[#00ff88]/50 resize-none placeholder-[#444]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-[#FAFAFA] rounded-xl p-4 border border-[#E0E0E0] flex items-center justify-center min-h-[120px]">
                  {analyzing ? (
                    <div className="text-center">
                      <div className="w-8 h-8 rounded-full border-2 border-[#00BFA5] border-t-transparent animate-spin mx-auto mb-2"></div>
                      <p className="text-[11px] text-[#78909C]">服を分析中...</p>
                    </div>
                  ) : (
                    <button
                      onClick={handleAnalyze}
                      className="text-[11px] text-[#00BFA5] hover:text-[#333333] transition-colors"
                    >
                      🔍 分析を開始
                    </button>
                  )}
                </div>
              )}

              {/* Re-analyze button */}
              {analysis && !analyzing && (
                <button
                  onClick={handleAnalyze}
                  className="mt-2 text-[10px] text-[#78909C] hover:text-[#00BFA5] transition-colors"
                >
                  🔄 再分析
                </button>
              )}
            </div>
          </div>

          {/* Generate Description from Analysis */}
          {analysis && (
            <button
              onClick={generateDetailedDescription}
              disabled={optimizing || isOptimizing}
              className="w-full mt-4 px-4 py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all duration-300 border border-[#00ff88]/30 bg-[#00ff88]/5 text-[#00ff88] hover:bg-[#00ff88]/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {optimizing || isOptimizing ? (
                <>
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  生成中...
                </>
              ) : (
                <>📝 分析結果から説明文を生成</>
              )}
            </button>
          )}

          {/* Description Input */}
          <div className="mt-4">
            <label className="text-[11px] font-semibold text-[#78909C] mb-2 block uppercase tracking-wider">
              説明文（プロンプト用）
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="AIが着画生成時に使用する説明文です。上の分析結果から生成するか、直接入力してください。"
              rows={3}
              className="w-full bg-[#FAFAFA] border border-[#E0E0E0] rounded-xl px-4 py-3 text-sm text-[#333333] placeholder-[#444] focus:outline-none focus:border-[#00BFA5]/50 transition-all duration-300 resize-none"
            />
          </div>



          {/* Action Buttons */}
          <div className="flex gap-3 mt-5">
            <button
              onClick={handleSkip}
              className="flex-1 py-3 rounded-xl font-medium text-sm bg-[#F5F5F5] text-[#78909C] border border-[#E0E0E0] hover:text-[#333333] hover:border-[#E0E0E0] transition-all duration-300"
            >
              スキップ
            </button>
            <button
              onClick={handleSubmit}
              className="flex-1 py-3 rounded-xl font-semibold text-sm text-[#333333] transition-all duration-300 hover:scale-[1.02]"
              style={{
                backgroundColor: accentColor,
                boxShadow: `0 4px 20px ${accentColor}40`
              }}
            >
              確定
            </button>
          </div>

          {/* Tips */}
          <div className="mt-4 p-3 bg-[#FAFAFA] rounded-xl border border-[#E0E0E0]">
            <p className="text-[10px] text-[#78909C]">
              💡 分析結果の各項目をクリックして編集できます。ボタンの数や装飾などを正確に修正すると、より忠実な着画が生成されます。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PromptModal;
