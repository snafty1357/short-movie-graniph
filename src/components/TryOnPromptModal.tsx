/**
 * TryOn Prompt Modal - 質問形式で着画設定を確認するポップアップ
 * 質問を1つずつ表示し、回答後に次の質問へ遷移
 */
import React, { useState, useEffect } from 'react';
import type { Question } from '../services/openaiService';

interface TryOnPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (prompt: string) => void;
  onGenerateQuestions: () => Promise<Question[]>;
  onGeneratePromptFromAnswers: (questions: Question[]) => Promise<string>;
  onOptimizePrompt: (prompt: string) => Promise<string>;
  modelPreview: string | null;
  garmentPreviews: Array<{ emoji: React.ReactNode; preview: string | null; label: string }>;
  isGeneratingQuestions: boolean;
  isGeneratingTryOn: boolean;
  initialPrompt?: string;
}

type Step = 'questions' | 'prompt';

const TryOnPromptModal: React.FC<TryOnPromptModalProps> = ({
  isOpen,
  onClose,
  onGenerate,
  onGenerateQuestions,
  onGeneratePromptFromAnswers,
  onOptimizePrompt,
  modelPreview,
  garmentPreviews,
  isGeneratingQuestions,
  isGeneratingTryOn,
  initialPrompt,
}) => {
  const [step, setStep] = useState<Step>('questions');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [prompt, setPrompt] = useState('');
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [customAnswer, setCustomAnswer] = useState('');

  // モーダルが開いたときに処理
  useEffect(() => {
    if (isOpen) {
      if (initialPrompt) {
        setPrompt(initialPrompt);
        setStep('prompt');
      } else if (questions.length === 0) {
        handleLoadQuestions();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialPrompt]);

  // モーダルが閉じたときにリセット
  useEffect(() => {
    if (!isOpen) {
      setStep('questions');
      setQuestions([]);
      setActiveQuestionIndex(0);
      setPrompt('');
    }
  }, [isOpen]);

  const handleLoadQuestions = async () => {
    setIsLoadingQuestions(true);
    try {
      const generatedQuestions = await onGenerateQuestions();
      setQuestions(generatedQuestions);
      setActiveQuestionIndex(0);
    } catch (error) {
      console.error('Failed to generate questions:', error);
      // フォールバック質問
      setQuestions([
        {
          id: 'q1',
          question: 'どのようなスタイルで着こなしますか？',
          options: ['カジュアル', 'きれいめ', 'ストリート', 'モード', 'スポーティ'],
        },
        {
          id: 'q2',
          question: '衣服のフィット感はどうしますか？',
          options: ['タイトめ', 'ジャストサイズ', 'ややゆったり', 'オーバーサイズ'],
        },
        {
          id: 'q3',
          question: '全体の雰囲気はどのようにしますか？',
          options: ['クール', 'ナチュラル', 'エレガント', 'リラックス'],
        },
        {
          id: 'q4',
          question: 'ポーズはどのようにしますか？',
          options: ['元画像のまま', 'ポケットに手を入れる', '横向き/振り返る', '腕を組む', '自然に立たせる'],
        },
      ]);
      setActiveQuestionIndex(0);
    } finally {
      setIsLoadingQuestions(false);
    }
  };

  const handleAnswerSelect = (questionId: string, answer: string) => {
    if (!answer.trim()) return;
    setQuestions(prev =>
      prev.map(q =>
        q.id === questionId ? { ...q, answer: answer.trim() } : q
      )
    );

    setCustomAnswer(''); // カスタム回答をリセット

    // 回答後に次の質問へ自動遷移（300ms後）
    const currentIdx = questions.findIndex(q => q.id === questionId);
    if (currentIdx < questions.length - 1) {
      setIsTransitioning(true);
      setTimeout(() => {
        setActiveQuestionIndex(currentIdx + 1);
        setIsTransitioning(false);
      }, 300);
    }
  };

  const allQuestionsAnswered = questions.length > 0 && questions.every(q => q.answer);

  const handleProceedToPrompt = async () => {
    setIsGeneratingPrompt(true);
    try {
      const finalQuestions = [...questions];
      if (customAnswer.trim()) {
        finalQuestions.push({
          id: 'custom',
          garmentLabel: '共通',
          question: 'その他の要望',
          options: [],
          answer: customAnswer.trim()
        });
      }
      const generatedPrompt = await onGeneratePromptFromAnswers(finalQuestions);
      setPrompt(generatedPrompt);
      setStep('prompt');
    } catch (error) {
      console.error('Failed to generate prompt:', error);
      const fallbackPrompt = buildFallbackPrompt(questions);
      setPrompt(fallbackPrompt);
      setStep('prompt');
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const buildFallbackPrompt = (qs: Question[]): string => {
    const answers = qs.filter(q => q.answer).map(q => q.answer).join(', ');
    return `=== POSITIVE PROMPT ===

[Subject]
A person wearing the garment

[Style & Fit]
${answers || 'Casual style, comfortable fit'}

[Details]
Natural wearing style, well-fitted

[Atmosphere]
Natural and relaxed look

[Quality]
High quality fashion photography, detailed textures, professional lighting, 8k, sharp focus

=== NEGATIVE PROMPT ===

[Avoid]
low quality, blurry, distorted, deformed, bad anatomy, wrong proportions, extra limbs, missing limbs, disfigured, ugly, bad hands, missing fingers, extra fingers, watermark, signature, text`;
  };

  const handleOptimize = async () => {
    if (!prompt.trim()) return;
    setIsOptimizing(true);
    try {
      const optimized = await onOptimizePrompt(prompt);
      setPrompt(optimized);
    } catch (error) {
      console.error('Failed to optimize prompt:', error);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleGenerate = () => {
    onGenerate(prompt);
  };

  const handleBackToQuestions = () => {
    setStep('questions');
  };

  if (!isOpen) return null;

  const uploadedGarments = garmentPreviews.filter(g => g.preview !== null);
  const currentQuestion = questions[activeQuestionIndex];
  const answeredCount = questions.filter(q => q.answer).length;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#FAFAFA] backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && !isGeneratingTryOn && onClose()}
    >
      <div className="bg-[#1a1a2e] border border-[#E0E0E0] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E0E0E0] flex items-center justify-between flex-shrink-0">
          <h3 className="text-[#333333] font-bold text-base flex items-center gap-2">
            <span className="text-xl">{step === 'questions' ? '💬' : '✨'}</span>
            {step === 'questions' ? '着画の設定' : 'プロンプト確認'}
          </h3>
          <button
            onClick={onClose}
            disabled={isGeneratingTryOn}
            className="text-[#78909C] hover:text-[#333333] transition-colors text-xl disabled:opacity-50"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* Image Previews */}
          <div className="mb-5">
            <div className="flex gap-3 items-center justify-center">
              {modelPreview && (
                <div className="text-center">
                  <p className="text-[8px] text-[#00d4ff] mb-1">モデル</p>
                  <div className="w-16 h-22 rounded-lg overflow-hidden border-2 border-[#00d4ff]">
                    <img src={modelPreview} alt="Model" className="w-full h-full object-cover" />
                  </div>
                </div>
              )}

              <div className="text-xl text-[#78909C]">+</div>

              {uploadedGarments.slice(0, 3).map((g, idx) => (
                <div key={idx} className="text-center">
                  <p className="text-[8px] text-[#00BFA5] mb-1">{g.emoji}</p>
                  <div className="w-16 h-16 rounded-lg overflow-hidden border-2 border-[#00BFA5]">
                    <img src={g.preview!} alt={g.label} className="w-full h-full object-cover" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Step Progress */}
          <div className="flex items-center justify-center gap-2 mb-5">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              step === 'questions' ? 'bg-[#00BFA5] text-[#333333]' : 'bg-[#00ff88] text-[#333333]'
            }`}>
              {step === 'questions' ? '1' : '✓'}
            </div>
            <div className={`w-12 h-1 rounded ${step === 'prompt' ? 'bg-[#00ff88]' : 'bg-[#2a2a3e]'}`} />
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              step === 'prompt' ? 'bg-[#00BFA5] text-[#333333]' : 'bg-[#2a2a3e] text-[#78909C]'
            }`}>
              2
            </div>
          </div>

          {/* Step 1: Questions (1つずつ表示) */}
          {step === 'questions' && (
            <>
              {isLoadingQuestions || isGeneratingQuestions ? (
                <div className="text-center py-8">
                  <div className="inline-flex items-center gap-2 text-[#00BFA5]">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="text-sm">ChatGPTが質問を生成中...</span>
                  </div>
                </div>
              ) : (
                <>
                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] text-[#78909C]">
                        質問 {activeQuestionIndex + 1} / {questions.length}
                      </span>
                      <span className="text-[10px] text-[#00BFA5]">
                        {answeredCount}/{questions.length} 回答済み
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-[#2a2a3e] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#00BFA5] to-[#78909C] rounded-full transition-all duration-500"
                        style={{ width: `${((answeredCount) / questions.length) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* 回答済みバッジ */}
                  {answeredCount > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {questions.filter(q => q.answer).map((q, idx) => (
                        <button
                          key={q.id}
                          onClick={() => {
                            setActiveQuestionIndex(questions.indexOf(q));
                          }}
                          className={`text-[9px] px-2.5 py-1 rounded-full flex items-center gap-1 transition-all ${
                            questions.indexOf(q) === activeQuestionIndex
                              ? 'bg-[#00BFA5]/30 text-[#00BFA5] border border-[#00BFA5]/40'
                              : 'bg-[#00BFA5]/10 text-[#00BFA5]/70 border border-[#00BFA5]/15 hover:border-[#00BFA5]/30'
                          }`}
                        >
                          <span className="text-[#00ff88]">✓</span> Q{idx + 1}: {q.answer}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* 現在の質問 */}
                  {currentQuestion && (
                    <div className={`transition-all duration-300 ${isTransitioning ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'}`}>
                      <div className="bg-[#FAFAFA] rounded-xl p-5">
                        <p className="text-[#333333] text-sm font-bold mb-4 flex items-start gap-2">
                          <span className="bg-[#00BFA5] text-[#333333] text-xs w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">
                            {activeQuestionIndex + 1}
                          </span>
                          <span className="flex-1 flex flex-col gap-1.5">
                            {currentQuestion.garmentLabel && (
                              <span className="text-[10px] text-[#78909C] bg-[#00BFA5]/10 border border-[#00BFA5]/30 px-2 py-0.5 rounded-md self-start font-medium">
                                {currentQuestion.garmentLabel}
                              </span>
                            )}
                            <span className="text-[#333333]">{currentQuestion.question}</span>
                          </span>
                        </p>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          {currentQuestion.options.map((option) => (
                            <button
                              key={option}
                              onClick={() => handleAnswerSelect(currentQuestion.id, option)}
                              className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                                currentQuestion.answer === option
                                  ? 'bg-[#00BFA5] text-[#333333] shadow-md shadow-teal-500/20 scale-[1.02]'
                                  : 'bg-[#FAFAFA] text-[#78909C] border border-[#E0E0E0] hover:border-[#00BFA5] hover:text-[#333333] hover:bg-[#00BFA5]/10'
                              }`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                        
                        <div className="flex items-center gap-2 mt-2">
                          <input
                            type="text"
                            value={customAnswer}
                            onChange={(e) => setCustomAnswer(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAnswerSelect(currentQuestion.id, customAnswer);
                            }}
                            placeholder="その他独自で入力..."
                            className="flex-1 bg-white border border-[#E0E0E0] rounded-lg px-3 py-2 text-sm text-[#333333] focus:outline-none focus:border-[#00BFA5] transition-colors"
                          />
                          <button
                            onClick={() => handleAnswerSelect(currentQuestion.id, customAnswer)}
                            disabled={!customAnswer.trim()}
                            className="bg-[#00BFA5] text-[#333333] px-3 py-2 rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                          >
                            追加
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 質問ナビゲーション */}
                  <div className="flex items-center justify-between mt-4">
                    <button
                      onClick={() => setActiveQuestionIndex(Math.max(0, activeQuestionIndex - 1))}
                      disabled={activeQuestionIndex === 0}
                      className="text-xs text-[#78909C] hover:text-[#333333] disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-3 py-1.5"
                    >
                      ← 前へ
                    </button>
                    <div className="flex gap-1">
                      {questions.map((q, idx) => (
                        <button
                          key={q.id}
                          onClick={() => setActiveQuestionIndex(idx)}
                          className={`w-2 h-2 rounded-full transition-all ${
                            idx === activeQuestionIndex
                              ? 'bg-[#00BFA5] w-4'
                              : q.answer
                                ? 'bg-[#00ff88]'
                                : 'bg-[#2a2a3e]'
                          }`}
                        />
                      ))}
                    </div>
                    <button
                      onClick={() => setActiveQuestionIndex(Math.min(questions.length - 1, activeQuestionIndex + 1))}
                      disabled={activeQuestionIndex === questions.length - 1}
                      className="text-xs text-[#78909C] hover:text-[#333333] disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-3 py-1.5"
                    >
                      次へ →
                    </button>
                  </div>
                </>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 mt-5">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl font-bold text-sm bg-[#FAFAFA] text-[#78909C] border border-[#E0E0E0] hover:text-[#333333] hover:border-[#3a3a4e] transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleProceedToPrompt}
                  disabled={!allQuestionsAnswered || isGeneratingPrompt}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                    !allQuestionsAnswered || isGeneratingPrompt
                      ? 'bg-[#2a2a3e] text-[#78909C] cursor-not-allowed'
                      : 'bg-gradient-to-r from-[#00BFA5] to-[#78909C] text-[#333333]'
                  }`}
                >
                  {isGeneratingPrompt ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      プロンプト生成中...
                    </>
                  ) : (
                    <>プロンプトを生成 →</>
                  )}
                </button>
              </div>
            </>
          )}

          {/* Step 2: Prompt Confirmation */}
          {step === 'prompt' && (
            <>
              {/* Answers Summary */}
              <div className="bg-[#FAFAFA] rounded-xl p-3 mb-4">
                <p className="text-[10px] text-[#00BFA5] font-bold mb-2">回答内容:</p>
                <div className="flex flex-wrap gap-1">
                  {questions.filter(q => q.answer).map(q => (
                    <span key={q.id} className="text-[10px] bg-[#00BFA5]/20 text-[#00BFA5] px-2 py-1 rounded">
                      {q.answer}
                    </span>
                  ))}
                </div>
              </div>

              {/* Generated Prompt (Hidden from user visually but kept in state) */}
              <div className="mb-4 bg-[#00BFA5]/10 border border-[#00BFA5]/30 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                <div className="w-10 h-10 bg-[#00BFA5]/20 rounded-full flex items-center justify-center text-xl mb-2">
                  🤖
                </div>
                <h4 className="text-[#333333] text-sm font-bold mb-1">プロンプト生成完了</h4>
                <p className="text-[10px] text-[#78909C]">
                  着画生成のためのAIプロンプトが裏側で自動構築されました。このまま生成へ進むか、さらにプロンプトをAIに最適化させることができます。
                </p>
                <button
                  onClick={handleOptimize}
                  disabled={isOptimizing || isGeneratingTryOn || !prompt.trim()}
                  className="mt-3 px-4 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all border border-[#00BFA5]/30 bg-white text-[#00BFA5] hover:bg-[#00BFA5]/10 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {isOptimizing ? (
                    <>
                      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      最適化中...
                    </>
                  ) : (
                    <>✨ プロンプトをさらに自動最適化</>
                  )}
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleBackToQuestions}
                  disabled={isGeneratingTryOn}
                  className="flex-1 py-3 rounded-xl font-bold text-sm bg-[#FAFAFA] text-[#78909C] border border-[#E0E0E0] hover:text-[#333333] hover:border-[#3a3a4e] transition-colors disabled:opacity-50"
                >
                  ← 戻る
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={isGeneratingTryOn || !prompt.trim()}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                    isGeneratingTryOn || !prompt.trim()
                      ? 'bg-[#2a2a3e] text-[#78909C] cursor-not-allowed'
                      : 'bg-gradient-to-r from-[#00ff88] to-[#00d4ff] text-[#333333] shadow-lg shadow-green-500/20 hover:shadow-green-500/40'
                  }`}
                >
                  {isGeneratingTryOn ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      着画生成中...
                    </>
                  ) : (
                    <>✨ 着画を生成</>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TryOnPromptModal;
