import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { HistoryEntry } from '../services/historyService';
import { getHistory, removeFromHistory, clearHistory } from '../services/historyService';
import { useAuth } from '../contexts/AuthContext';

interface HistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEntry: (entry: HistoryEntry) => void;
  onReusePrompt: (prompt: string) => void;
}
const HistoryPanel: React.FC<HistoryPanelProps> = ({ isOpen, onClose, onSelectEntry, onReusePrompt }) => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [zoomedEntry, setZoomedEntry] = useState<HistoryEntry | null>(null);
  const [viewingPromptId, setViewingPromptId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 履歴を読み込み
  const loadHistory = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const data = await getHistory();
    setEntries(data);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
      setConfirmClear(false);
    }
  }, [isOpen, loadHistory]);

  // 個別削除
  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await removeFromHistory(id);
    setEntries(prev => prev.filter(h => h.id !== id));
  }, []);

  // 全削除
  const handleClearAll = useCallback(async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    if (!user) return;
    await clearHistory();
    setEntries([]);
    setConfirmClear(false);
  }, [confirmClear, user]);

  // 検索クエリで絞り込み
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const query = searchQuery.toLowerCase();
    return entries.filter(entry => 
      (entry.description && entry.description.toLowerCase().includes(query)) ||
      (entry.garmentLabels && entry.garmentLabels.some(l => l.toLowerCase().includes(query)))
    );
  }, [entries, searchQuery]);

  // 日付でグループ化
  const groupedEntries = filteredEntries.reduce<Record<string, HistoryEntry[]>>((acc, entry) => {
    const date = new Date(entry.timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let label: string;
    if (date.toDateString() === today.toDateString()) {
      label = '今日';
    } else if (date.toDateString() === yesterday.toDateString()) {
      label = '昨日';
    } else {
      label = date.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' });
    }

    if (!acc[label]) acc[label] = [];
    acc[label].push(entry);
    return acc;
  }, {});

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-md bg-white dark:bg-[#0e0e1a] border-l border-[#eae5df] shadow-2xl shadow-black/50 transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/95 dark:bg-[#0e0e1a]/95 backdrop-blur-md border-b border-[#eae5df] px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#e4d7c5] to-[#cba77d] flex items-center justify-center text-sm">
                📋
              </div>
              <div>
                <h2 className="text-[#333333] font-bold text-sm">生成履歴</h2>
                <p className="text-[10px] text-[#666]">{entries.length}件の記録</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {entries.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className={`text-[10px] px-3 py-1.5 rounded-lg border transition-all ${
                    confirmClear
                      ? 'bg-red-500/20 border-red-500/50 text-red-400 animate-pulse'
                      : 'bg-white border-[#eae5df] text-[#666] hover:text-red-400 hover:border-red-400/50'
                  }`}
                >
                  {confirmClear ? '⚠️ 本当に全削除？' : '🗑 全削除'}
                </button>
              )}
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-white border border-[#eae5df] text-[#666] hover:text-[#333333] hover:border-[#cba77d] transition-all flex items-center justify-center text-lg"
              >
                ×
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="px-5 pb-4">
            <div className="relative">
              <input
                type="text"
                placeholder="履歴を検索 (ガーメント名など)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#f8f6f3] border border-[#eae5df] rounded-lg pl-9 pr-4 py-2 text-sm text-[#333333] placeholder-gray-400 focus:outline-none focus:border-[#cba77d] focus:ring-1 focus:ring-[#cba77d]"
              />
              <div className="absolute left-3 top-2.5 text-gray-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto h-[calc(100%-120px)] px-5 py-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-[#78909C]">
              <svg className="animate-spin h-6 w-6 mb-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-xs">履歴を読み込み中...</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="text-5xl mb-4 opacity-15">🕐</div>
              <p className="text-[#555] text-sm">履歴がありません</p>
              <p className="text-[#444] text-xs mt-1">着画を生成すると、ここに記録されます</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedEntries).map(([label, items]) => (
                <div key={label}>
                  {/* Day Label */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] font-bold text-[#b0916a] uppercase tracking-wider">{label}</span>
                    <div className="flex-1 h-px bg-[#2a2a3e]" />
                    <span className="text-[9px] text-[#555]">{items.length}件</span>
                  </div>

                  {/* Entries */}
                  <div className="space-y-2">
                    {items.map((entry, idx) => (
                      <div
                        key={entry.id}
                        className="group relative bg-white border border-[#eae5df] rounded-xl overflow-hidden hover:border-[#cba77d]/50 transition-all cursor-pointer"
                        onClick={() => setZoomedEntry(entry)}
                        style={{ animationDelay: `${idx * 50}ms` }}
                      >
                        <div className="flex gap-3 p-3">
                          {/* Thumbnail */}
                          <div className="w-16 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-[#faf9f6] border border-[#eae5df]">
                            <img
                              src={entry.imageUrl}
                              alt="Generated"
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            {/* Time & ID */}
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[9px] text-[#b0916a] font-mono font-bold">
                                #{entry.id.slice(-6).toUpperCase()}
                              </span>
                              <span className="text-[9px] text-[#555]">
                                {new Date(entry.timestamp).toLocaleTimeString('ja-JP', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
                              </span>
                            </div>

                            {/* Generation Time */}
                            {entry.generationTimeMs && (
                              <div className="flex items-center gap-1 mb-2 text-[10px] text-[#00BFA5] font-medium bg-[#00BFA5]/10 w-fit px-2 py-0.5 rounded-full">
                                ⏱️ {(entry.generationTimeMs / 1000).toFixed(1)}秒
                              </div>
                            )}

                            {/* Description */}
                            <p className="text-[11px] text-[#666666] line-clamp-2 mb-2">
                              {entry.description || '説明なし'}
                            </p>

                            {/* Tags */}
                            <div className="flex flex-wrap gap-1">
                              <span className="text-[8px] px-1.5 py-0.5 rounded bg-[#cba77d]/10 text-[#b0916a] font-bold">
                                {entry.resolution}
                              </span>
                              <span className="text-[8px] px-1.5 py-0.5 rounded bg-[#cba77d]/10 text-[#b0916a] font-bold">
                                {entry.format.toUpperCase()}
                              </span>
                              {entry.garmentLabels.map((label, i) => (
                                <span
                                  key={i}
                                  className="text-[8px] px-1.5 py-0.5 rounded bg-[#fbbf24]/10 text-[#cba77d]"
                                >
                                  {label}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewingPromptId(viewingPromptId === entry.id ? null : entry.id);
                              }}
                              className="w-7 h-7 rounded-lg bg-[#00BFA5]/10 text-[#00BFA5] hover:bg-[#00BFA5]/20 flex items-center justify-center text-xs transition-colors"
                              title="プロンプトを確認"
                            >
                              💬
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onClose();
                                onReusePrompt(entry.description || '');
                              }}
                              className="w-7 h-7 rounded-lg bg-[#00d4ff]/10 text-[#00d4ff] hover:bg-[#00d4ff]/20 flex items-center justify-center text-xs transition-colors"
                              title="この状況を再現 (Play)"
                            >
                              ▶️
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectEntry(entry);
                                onClose();
                              }}
                              className="w-7 h-7 rounded-lg bg-[#cba77d]/10 text-[#b0916a] hover:bg-[#cba77d]/20 flex items-center justify-center text-xs transition-colors"
                              title="結果に追加"
                            >
                              ↩
                            </button>
                            <a
                              href={entry.imageUrl}
                              download={`kiga_${entry.id}.${entry.format}`}
                              onClick={(e) => e.stopPropagation()}
                              className="w-7 h-7 rounded-lg bg-[#cba77d]/10 text-[#b0916a] hover:bg-[#00ff88]/20 flex items-center justify-center text-xs transition-colors"
                              title="ダウンロード"
                            >
                              💾
                            </a>
                            <button
                              onClick={(e) => handleDelete(entry.id, e)}
                              className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center justify-center text-xs transition-colors"
                              title="削除"
                            >
                              🗑
                            </button>
                          </div>
                        </div>

                        {/* Expandable Prompt View */}
                        {viewingPromptId === entry.id && entry.description && (
                          <div className="mt-3 p-3 bg-white border border-[#E0E0E0] rounded-lg text-[10px] text-[#444] font-mono whitespace-pre-wrap">
                            <div className="font-bold text-[#00BFA5] mb-1">=== 使用されたプロンプト ===</div>
                            {entry.description}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Zoom Modal */}
      {zoomedEntry && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex items-center justify-center cursor-zoom-out"
          onClick={() => setZoomedEntry(null)}
        >
          <div
            className="relative max-w-[85vw] max-h-[85vh] animate-in"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={zoomedEntry.imageUrl}
              alt="Zoomed"
              className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl"
            />
            {/* Info bar */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent rounded-b-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#333333]/80 mb-1">
                    {zoomedEntry.description || '着画生成結果'}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-[#b0916a] font-mono font-bold">
                      #{zoomedEntry.id.slice(-6).toUpperCase()}
                    </span>
                    <span className="text-[9px] text-[#333333]/40">
                      {new Date(zoomedEntry.timestamp).toLocaleString('ja-JP')}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <a
                    href={zoomedEntry.imageUrl}
                    download={`kiga_${zoomedEntry.id}.${zoomedEntry.format}`}
                    className="px-3 py-1.5 rounded-lg bg-white/10 text-[#333333]/80 text-xs hover:bg-white/20 transition-colors"
                  >
                    💾 保存
                  </a>
                  <button
                    onClick={() => {
                      onSelectEntry(zoomedEntry);
                      setZoomedEntry(null);
                      onClose();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#cba77d]/20 text-[#b0916a] text-xs hover:bg-[#cba77d]/30 transition-colors"
                  >
                    ↩ 結果に復元
                  </button>
                </div>
              </div>
            </div>
            {/* Close */}
            <button
              className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-black/60 text-[#333333]/60 hover:text-[#333333] flex items-center justify-center text-lg backdrop-blur-sm transition-colors"
              onClick={() => setZoomedEntry(null)}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default HistoryPanel;
