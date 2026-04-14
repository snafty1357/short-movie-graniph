/**
 * Public History Page - 認証不要で誰でもアクセスできる履歴ページ
 * /gallery/:companySlug でアクセス可能（企業別）
 * /gallery で全件表示
 * 選択ダウンロード & 一括ダウンロード対応
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

interface GarmentInfo {
  id: string;
  label: string;
  url: string;
}

interface PublicHistoryEntry {
  id: string;
  imageUrl: string;
  timestamp: string;
  description?: string;
  resolution: string;
  format: string;
  garmentLabels: string[];
  generationTimeMs?: number;
  modelImageUrl?: string;
  garmentImageUrls?: GarmentInfo[];
  companySlug?: string;
}

const PublicHistory: React.FC = () => {
  const { slug } = useParams<{ slug?: string }>();
  const [entries, setEntries] = useState<PublicHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<PublicHistoryEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  // 選択モード
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Supabaseから履歴を取得
  useEffect(() => {
    async function fetchHistory() {
      setIsLoading(true);
      try {
        let query = supabase
          .from('generations')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);

        if (slug) {
          query = query.eq('company_slug', slug);
        }

        const { data, error } = await query;

        if (error) {
          console.error('[PublicHistory] Fetch error:', error);
          setEntries([]);
          return;
        }

        if (!data) { setEntries([]); return; }

        setEntries(data.map(row => ({
          id: row.id,
          imageUrl: row.image_url || '',
          timestamp: row.created_at,
          description: row.description || '',
          resolution: row.resolution || '1K',
          format: row.format || 'png',
          garmentLabels: row.garment_types || [],
          generationTimeMs: row.generation_time_ms,
          modelImageUrl: row.model_image_url || null,
          garmentImageUrls: row.garment_image_urls || [],
          companySlug: row.company_slug || null,
        })));
      } catch (e) {
        console.error('[PublicHistory] Error:', e);
        setEntries([]);
      } finally {
        setIsLoading(false);
      }
    }
    fetchHistory();
  }, [slug]);

  // 検索フィルタ
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter(e =>
      (e.description && e.description.toLowerCase().includes(q)) ||
      e.garmentLabels.some(l => l.toLowerCase().includes(q))
    );
  }, [entries, searchQuery]);

  // 日付グルーピング
  const groupedEntries = useMemo(() => {
    const groups: Record<string, PublicHistoryEntry[]> = {};
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    filteredEntries.forEach(entry => {
      const date = new Date(entry.timestamp);
      let label: string;
      if (date.toDateString() === today.toDateString()) label = '今日';
      else if (date.toDateString() === yesterday.toDateString()) label = '昨日';
      else label = date.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' });

      if (!groups[label]) groups[label] = [];
      groups[label].push(entry);
    });
    return groups;
  }, [filteredEntries]);

  // 画像期限切れチェック
  const getExpiryLabel = (timestamp: string) => {
    const created = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    const remainDays = 30 - diffDays;
    if (remainDays <= 0) return { text: '期限切れ', color: 'text-red-400' };
    if (remainDays <= 7) return { text: `残り${remainDays}日`, color: 'text-orange-400' };
    return { text: `残り${remainDays}日`, color: 'text-green-400' };
  };

  const displayName = slug ? slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null;

  // 選択トグル
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // 全選択 / 全解除
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredEntries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEntries.map(e => e.id)));
    }
  }, [filteredEntries, selectedIds.size]);

  // 画像を1枚ダウンロード
  const downloadSingleImage = useCallback(async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Download failed:', err);
      // フォールバック
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
    }
  }, []);

  // 選択した画像を順次ダウンロード
  const downloadSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setIsDownloading(true);

    const entriesToDownload = filteredEntries.filter(e => selectedIds.has(e.id));

    for (let i = 0; i < entriesToDownload.length; i++) {
      const entry = entriesToDownload[i];
      const timestamp = new Date(entry.timestamp).toISOString().slice(0, 10);
      const filename = `kiga_${timestamp}_${entry.id.toString().slice(-6)}.${entry.format}`;
      await downloadSingleImage(entry.imageUrl, filename);
      // ブラウザが並行ダウンロードを処理できるよう少しディレイ
      if (i < entriesToDownload.length - 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    setIsDownloading(false);
  }, [selectedIds, filteredEntries, downloadSingleImage]);

  // 全てダウンロード
  const downloadAll = useCallback(async () => {
    setIsDownloading(true);

    for (let i = 0; i < filteredEntries.length; i++) {
      const entry = filteredEntries[i];
      const timestamp = new Date(entry.timestamp).toISOString().slice(0, 10);
      const filename = `kiga_${timestamp}_${entry.id.toString().slice(-6)}.${entry.format}`;
      await downloadSingleImage(entry.imageUrl, filename);
      if (i < filteredEntries.length - 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    setIsDownloading(false);
  }, [filteredEntries, downloadSingleImage]);

  // 選択した画像を削除
  const deleteSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);

    try {
      const idsToDelete = Array.from(selectedIds);
      const { error } = await supabase
        .from('generations')
        .delete()
        .in('id', idsToDelete);

      if (error) {
        console.error('[PublicHistory] Delete error:', error);
        alert('削除に失敗しました: ' + error.message);
      } else {
        // ローカルステートからも削除
        setEntries(prev => prev.filter(e => !selectedIds.has(e.id)));
        setSelectedIds(new Set());
      }
    } catch (e) {
      console.error('[PublicHistory] Delete error:', e);
      alert('削除中にエラーが発生しました');
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  }, [selectedIds]);

  // 選択モード切り替え
  const exitSelectMode = useCallback(() => {
    setIsSelectMode(false);
    setSelectedIds(new Set());
    setConfirmDelete(false);
  }, []);

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-[#00BFA5] opacity-[0.03] blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-[#00d4ff] opacity-[0.03] blur-[120px] rounded-full"></div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E0E0E0] shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#00BFA5] to-[#78909C] flex items-center justify-center text-xl font-black shadow-lg shadow-teal-500/20">
              着
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-[#333333] tracking-tight">
                着てみるAI{' '}
                <span className="text-sm font-medium text-[#78909C]">
                  | {displayName ? `${displayName} ギャラリー` : 'ギャラリー'}
                </span>
              </h1>
              <p className="text-[10px] text-[#78909C] -mt-0.5 tracking-widest font-medium">
                {slug ? `${slug} の生成履歴` : '生成された着画の公開一覧'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Download Buttons */}
            {!isSelectMode ? (
              <>
                {filteredEntries.length > 0 && (
                  <>
                    <button
                      onClick={() => setIsSelectMode(true)}
                      className="text-xs px-3 py-2 rounded-lg bg-[#F5F5F5] text-[#555] border border-[#E0E0E0] hover:border-[#00BFA5] hover:text-[#00BFA5] transition-all"
                    >
                      ☑️ 選択
                    </button>
                    <button
                      onClick={downloadAll}
                      disabled={isDownloading}
                      className="text-xs px-3 py-2 rounded-lg bg-[#F5F5F5] text-[#555] border border-[#E0E0E0] hover:border-[#00BFA5] hover:text-[#00BFA5] transition-all disabled:opacity-50"
                    >
                      {isDownloading ? '⏳ DL中...' : '📦 一括DL'}
                    </button>
                  </>
                )}
                <a
                  href="/"
                  className="text-xs px-4 py-2 rounded-lg bg-gradient-to-r from-[#00BFA5] to-[#78909C] text-white font-bold hover:shadow-lg transition-all"
                >
                  着画を生成する →
                </a>
              </>
            ) : (
              <>
                <button
                  onClick={toggleSelectAll}
                  className="text-xs px-3 py-2 rounded-lg bg-[#F5F5F5] text-[#555] border border-[#E0E0E0] hover:border-[#00BFA5] transition-all"
                >
                  {selectedIds.size === filteredEntries.length ? '☐ 全解除' : '☑️ 全選択'}
                </button>
                <button
                  onClick={downloadSelected}
                  disabled={selectedIds.size === 0 || isDownloading}
                  className="text-xs px-3 py-2 rounded-lg bg-gradient-to-r from-[#00BFA5] to-[#00d4ff] text-white font-bold hover:shadow-lg transition-all disabled:opacity-50"
                >
                  {isDownloading ? '⏳ DL中...' : `💾 ${selectedIds.size}件をDL`}
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  disabled={selectedIds.size === 0 || isDeleting}
                  className="text-xs px-3 py-2 rounded-lg bg-red-50 text-red-500 border border-red-200 font-bold hover:bg-red-100 hover:border-red-400 transition-all disabled:opacity-50"
                >
                  {isDeleting ? '⏳ 削除中...' : `🗑 ${selectedIds.size}件を削除`}
                </button>
                <button
                  onClick={exitSelectMode}
                  className="text-xs px-3 py-2 rounded-lg bg-[#F5F5F5] text-[#999] border border-[#E0E0E0] hover:text-[#333] transition-all"
                >
                  ✕ 閉じる
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-8 relative z-10">
        {/* Company Badge */}
        {slug && (
          <div className="flex items-center justify-center mb-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[#00BFA5]/10 to-[#00d4ff]/10 border border-[#00BFA5]/20">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#00BFA5] to-[#00d4ff] flex items-center justify-center text-white text-[10px] font-bold">
                {slug[0]?.toUpperCase()}
              </div>
              <span className="text-sm font-bold text-[#333]">{displayName}</span>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="mb-8">
          <div className="relative max-w-md mx-auto">
            <input
              type="text"
              placeholder="ガーメント名やキーワードで検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-[#E0E0E0] rounded-xl pl-10 pr-4 py-3 text-sm text-[#333] placeholder-[#999] focus:outline-none focus:border-[#00BFA5] focus:ring-2 focus:ring-[#00BFA5]/20 transition-all shadow-sm"
            />
            <svg className="w-4 h-4 absolute left-3.5 top-3.5 text-[#999]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p className="text-center text-xs text-[#999] mt-3">
            {filteredEntries.length} 件の履歴
            {isSelectMode && selectedIds.size > 0 && (
              <span className="ml-2 text-[#00BFA5] font-bold">({selectedIds.size}件選択中)</span>
            )}
          </p>
        </div>

        {/* Loading */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <svg className="animate-spin h-8 w-8 mb-4 text-[#00BFA5]" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-[#78909C] text-sm">履歴を読み込み中...</p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4 opacity-20">🖼️</div>
            <p className="text-[#555] text-sm">
              {slug ? `「${displayName}」の履歴はまだありません` : 'まだ履歴がありません'}
            </p>
            {slug && (
              <p className="text-[#999] text-xs mt-2">
                着画を生成する際に企業IDを「{slug}」に設定してください
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-10">
            {Object.entries(groupedEntries).map(([label, items]) => (
              <div key={label}>
                {/* Day header */}
                <div className="flex items-center gap-3 mb-5">
                  <span className="text-xs font-bold text-[#00BFA5] uppercase tracking-wider">{label}</span>
                  <div className="flex-1 h-px bg-[#E0E0E0]" />
                  <span className="text-[10px] text-[#999]">{items.length}件</span>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {items.map((entry) => {
                    const expiry = getExpiryLabel(entry.timestamp);
                    const isSelected = selectedIds.has(entry.id);
                    return (
                      <div
                        key={entry.id}
                        className={`group relative bg-white border-2 rounded-xl overflow-hidden transition-all duration-300 cursor-pointer ${
                          isSelected
                            ? 'border-[#00BFA5] shadow-lg shadow-[#00BFA5]/20 ring-2 ring-[#00BFA5]/30'
                            : 'border-[#E0E0E0] hover:border-[#00BFA5]/50 hover:shadow-lg'
                        }`}
                        onClick={() => {
                          if (isSelectMode) {
                            toggleSelect(entry.id);
                          } else {
                            setZoomedImage(entry.imageUrl);
                          }
                        }}
                      >
                        {/* Selection Checkbox */}
                        {isSelectMode && (
                          <div className="absolute top-2 left-2 z-10">
                            <div className={`w-6 h-6 rounded-md flex items-center justify-center transition-all ${
                              isSelected
                                ? 'bg-[#00BFA5] text-white shadow-lg'
                                : 'bg-white/90 border-2 border-[#E0E0E0] text-transparent backdrop-blur-sm'
                            }`}>
                              {isSelected && (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Image */}
                        <div className="aspect-[3/4] bg-[#F5F5F5] overflow-hidden">
                          <img
                            src={entry.imageUrl}
                            alt="Generated try-on"
                            className={`w-full h-full object-cover transition-all duration-500 ${
                              isSelected ? 'scale-95 rounded-lg' : 'group-hover:scale-105'
                            }`}
                            loading="lazy"
                          />
                        </div>

                        {/* Info */}
                        <div className="p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[9px] text-[#00BFA5] font-mono font-bold">
                              #{entry.id.toString().slice(-6).toUpperCase()}
                            </span>
                            <span className={`text-[9px] font-medium ${expiry.color}`}>
                              {expiry.text}
                            </span>
                          </div>

                          {/* Tags */}
                          <div className="flex flex-wrap gap-1 mb-2">
                            <span className="text-[8px] px-1.5 py-0.5 rounded bg-[#00BFA5]/10 text-[#00BFA5] font-bold">
                              {entry.resolution}
                            </span>
                            {entry.garmentLabels.map((lbl, i) => (
                              <span key={i} className="text-[8px] px-1.5 py-0.5 rounded bg-[#fbbf24]/10 text-[#b08d57]">
                                {lbl}
                              </span>
                            ))}
                          </div>

                          {/* Time */}
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] text-[#999]">
                              {new Date(entry.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {entry.generationTimeMs && (
                              <span className="text-[9px] text-[#999]">
                                ⏱ {(entry.generationTimeMs / 1000).toFixed(1)}s
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Play Button & Download (non-select mode) */}
                        {!isSelectMode && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEntry(entry);
                              }}
                              className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-[#00BFA5] hover:scale-110 shadow-lg backdrop-blur-sm"
                              title="詳細を見る"
                            >
                              ▶
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const ts = new Date(entry.timestamp).toISOString().slice(0, 10);
                                downloadSingleImage(entry.imageUrl, `kiga_${ts}_${entry.id.toString().slice(-6)}.${entry.format}`);
                              }}
                              className="absolute top-2 left-2 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-[#00d4ff] hover:scale-110 shadow-lg backdrop-blur-sm text-sm"
                              title="ダウンロード"
                            >
                              💾
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Notice */}
        <div className="mt-12 text-center">
          <p className="text-[11px] text-[#999]">
            ※ 画像は生成後30日間保存されます。期限切れの画像は自動的に削除されます。
          </p>
        </div>
      </main>

      {/* Downloading Progress Overlay */}
      {isDownloading && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white rounded-xl shadow-2xl border border-[#E0E0E0] px-6 py-3 flex items-center gap-3" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
          <svg className="animate-spin h-5 w-5 text-[#00BFA5]" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-sm text-[#333] font-medium">ダウンロード中...</span>
        </div>
      )}

      {/* Play Modal */}
      {selectedEntry && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setSelectedEntry(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: 'fadeInUp 0.3s ease-out' }}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#E0E0E0] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00BFA5] to-[#00d4ff] flex items-center justify-center text-sm">
                  ▶
                </div>
                <div>
                  <h3 className="text-[#333] font-bold text-sm">着画詳細</h3>
                  <p className="text-[9px] text-[#999] font-mono">#{selectedEntry.id.toString().slice(-6).toUpperCase()}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                className="w-8 h-8 rounded-lg bg-[#F5F5F5] text-[#999] hover:text-[#333] hover:bg-[#E0E0E0] flex items-center justify-center transition-colors text-lg"
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto">
              {/* Image Comparison */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                {/* Model */}
                <div className="text-center">
                  <p className="text-[10px] font-bold text-[#00d4ff] mb-2 uppercase tracking-wider">モデル</p>
                  <div className="aspect-[3/4] bg-[#F5F5F5] rounded-xl overflow-hidden border-2 border-[#00d4ff]/30">
                    {selectedEntry.modelImageUrl ? (
                      <img
                        src={selectedEntry.modelImageUrl}
                        alt="Model"
                        className="w-full h-full object-cover cursor-zoom-in"
                        onClick={() => setZoomedImage(selectedEntry.modelImageUrl!)}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#999]">
                        <div className="text-center">
                          <div className="text-3xl mb-2 opacity-30">👤</div>
                          <p className="text-[10px]">モデル画像なし</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Garments */}
                <div className="text-center">
                  <p className="text-[10px] font-bold text-[#00BFA5] mb-2 uppercase tracking-wider">使用アイテム</p>
                  <div className="space-y-2">
                    {selectedEntry.garmentImageUrls && selectedEntry.garmentImageUrls.length > 0 ? (
                      selectedEntry.garmentImageUrls.map((g, i) => (
                        <div key={i}>
                          <div className="aspect-square bg-[#F5F5F5] rounded-xl overflow-hidden border-2 border-[#00BFA5]/30">
                            <img
                              src={g.url}
                              alt={g.label}
                              className="w-full h-full object-contain cursor-zoom-in"
                              onClick={() => setZoomedImage(g.url)}
                            />
                          </div>
                          <p className="text-[9px] text-[#999] mt-1">{g.label}</p>
                        </div>
                      ))
                    ) : (
                      <div className="aspect-square bg-[#F5F5F5] rounded-xl flex items-center justify-center border-2 border-[#00BFA5]/30">
                        <div className="text-center text-[#999]">
                          <div className="text-3xl mb-2 opacity-30">👕</div>
                          <p className="text-[10px]">アイテム画像なし</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Result */}
                <div className="text-center">
                  <p className="text-[10px] font-bold text-[#fbbf24] mb-2 uppercase tracking-wider">生成結果</p>
                  <div className="aspect-[3/4] bg-[#F5F5F5] rounded-xl overflow-hidden border-2 border-[#fbbf24]/30">
                    <img
                      src={selectedEntry.imageUrl}
                      alt="Result"
                      className="w-full h-full object-cover cursor-zoom-in"
                      onClick={() => setZoomedImage(selectedEntry.imageUrl)}
                    />
                  </div>
                </div>
              </div>

              {/* Details */}
              <div className="bg-[#F8F8F8] rounded-xl p-4 border border-[#E0E0E0]">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                  <div>
                    <p className="text-[9px] text-[#999] uppercase tracking-wider mb-1">解像度</p>
                    <p className="text-xs font-bold text-[#333]">{selectedEntry.resolution}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-[#999] uppercase tracking-wider mb-1">フォーマット</p>
                    <p className="text-xs font-bold text-[#333]">{selectedEntry.format.toUpperCase()}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-[#999] uppercase tracking-wider mb-1">生成時間</p>
                    <p className="text-xs font-bold text-[#333]">
                      {selectedEntry.generationTimeMs ? `${(selectedEntry.generationTimeMs / 1000).toFixed(1)}秒` : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] text-[#999] uppercase tracking-wider mb-1">日時</p>
                    <p className="text-xs font-bold text-[#333]">
                      {new Date(selectedEntry.timestamp).toLocaleString('ja-JP')}
                    </p>
                  </div>
                </div>

                {/* Garment Labels */}
                <div className="flex flex-wrap gap-1.5">
                  {selectedEntry.garmentLabels.map((lbl, i) => (
                    <span key={i} className="text-[10px] px-2 py-1 rounded-full bg-[#00BFA5]/10 text-[#00BFA5] font-medium">
                      {lbl}
                    </span>
                  ))}
                </div>
              </div>

              {/* Download */}
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => {
                    const ts = new Date(selectedEntry.timestamp).toISOString().slice(0, 10);
                    downloadSingleImage(selectedEntry.imageUrl, `kiga_${ts}_${selectedEntry.id.toString().slice(-6)}.${selectedEntry.format}`);
                  }}
                  className="flex-1 py-3 rounded-xl font-bold text-sm text-center bg-gradient-to-r from-[#00BFA5] to-[#00d4ff] text-white hover:shadow-lg transition-all"
                >
                  💾 ダウンロード
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Zoom Modal */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center cursor-zoom-out"
          onClick={() => setZoomedImage(null)}
        >
          <img
            src={zoomedImage}
            alt="Zoomed"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
          />
          <button
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white text-xl hover:bg-white/20 flex items-center justify-center backdrop-blur-sm transition-colors"
            onClick={() => setZoomedImage(null)}
          >
            ×
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setConfirmDelete(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: 'fadeInUp 0.2s ease-out' }}
          >
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🗑</span>
              </div>
              <h3 className="text-[#333] font-bold text-base mb-2">削除の確認</h3>
              <p className="text-sm text-[#666] mb-6">
                選択した <span className="font-bold text-red-500">{selectedIds.size}件</span> の画像を削除しますか？<br />
                <span className="text-xs text-[#999]">この操作は取り消せません。</span>
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[#F5F5F5] text-[#666] border border-[#E0E0E0] hover:bg-[#EAEAEA] transition-all"
                >
                  キャンセル
                </button>
                <button
                  onClick={deleteSelected}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-500 text-white hover:bg-red-600 transition-all disabled:opacity-50"
                >
                  {isDeleting ? '⏳ 削除中...' : '🗑 削除する'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSS Animation */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default PublicHistory;
