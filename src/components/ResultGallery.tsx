import React, { useState, useMemo } from 'react';
// Re-export for backward compatibility
export { generateProjectId } from '../utils/projectUtils';

export interface ResultItem {
  id: string;
  projectId: string;  // プロジェクトID（検索用）
  imageUrl: string;
  timestamp: Date;
  description?: string;
  resolution?: string;
  garmentType?: string;
  generationTimeMs?: number;
}

interface ResultGalleryProps {
  results: ResultItem[];
}

const ResultGallery: React.FC<ResultGalleryProps> = ({ results }) => {
  const [zoomedUrl, setZoomedUrl] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // 検索フィルター
  const filteredResults = useMemo(() => {
    if (!searchQuery.trim()) return results;
    const query = searchQuery.toLowerCase();
    return results.filter(item =>
      item.projectId.toLowerCase().includes(query) ||
      item.description?.toLowerCase().includes(query) ||
      item.garmentType?.toLowerCase().includes(query)
    );
  }, [results, searchQuery]);

  // プログラムによる確実なダウンロード
  const handleDownload = async (url: string, filename: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      // Base64またはURLからBlobを作成
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
  };

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
        <div className="text-6xl mb-4 opacity-20">👗</div>
        <p className="text-[#78909C] text-sm">生成結果がここに表示されます</p>
        <p className="text-[#78909C] text-xs mt-1">左パネルから画像をアップロードして着画を生成</p>
      </div>
    );
  }

  return (
    <>
      {/* Search Bar */}
      <div className="mb-4">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="プロジェクトIDで検索..."
            className="w-full bg-[#FAFAFA] border border-[#E0E0E0] rounded-xl px-4 py-2.5 pl-10 text-xs text-[#333333] placeholder-[#555] focus:outline-none focus:border-[#00BFA5]/50 transition-all duration-300"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#78909C]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#78909C] hover:text-[#333333]"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {searchQuery && (
          <p className="text-[10px] text-[#78909C] mt-1.5">
            {filteredResults.length}件の結果
          </p>
        )}
      </div>

      {/* Results Grid */}
      <div className="grid grid-cols-2 gap-3">
        {filteredResults.map((item) => (
          <div
            key={item.id}
            className="group relative bg-[#FAFAFA] border border-[#E0E0E0] rounded-xl overflow-hidden cursor-zoom-in hover:border-[#00BFA5]/50 transition-all duration-300"
            onClick={() => setZoomedUrl(item.imageUrl)}
          >
            {/* Project ID Badge */}
            <div className="absolute top-2 left-2 z-10">
              <span className="text-[9px] px-2 py-1 rounded-lg bg-gradient-to-r from-[#00BFA5]/90 to-[#78909C]/90 text-[#333333] font-mono font-bold backdrop-blur-sm shadow-lg">
                {item.projectId}
              </span>
            </div>
            {/* Timestamp & Resolution */}
            <div className="absolute top-2 right-2 z-10 flex gap-1">
              {item.resolution && (
                <span className="text-[8px] px-1.5 py-0.5 rounded bg-[#FAFAFA] text-[#fbbf24] backdrop-blur-sm">
                  {item.resolution}
                </span>
              )}
              {item.generationTimeMs && (
                <span className="text-[8px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 backdrop-blur-sm border border-blue-500/20">
                  ⚡️{(item.generationTimeMs / 1000).toFixed(1)}s
                </span>
              )}
              <span className="text-[8px] px-1.5 py-0.5 rounded bg-[#FAFAFA] text-[#333333]/60 backdrop-blur-sm border border-[#E0E0E0]">
                {item.timestamp.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div
              className="aspect-[3/4]"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', item.imageUrl);
                e.dataTransfer.setData('application/x-tryon-result', item.imageUrl);
                e.dataTransfer.effectAllowed = 'copy';
              }}
            >
              <img
                src={item.imageUrl}
                alt="Generated try-on"
                className="w-full h-full object-cover pointer-events-none"
              />
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white/90 via-white/60 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              {item.garmentType && (
                <p className="text-[9px] text-[#00BFA5] mb-1">{item.garmentType}</p>
              )}
              <p className="text-[10px] text-[#333333]/70 line-clamp-2">{item.description || '着画生成結果'}</p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={(e) => handleDownload(item.imageUrl, `tryon_${item.projectId}.png`, e)}
                  className="text-[9px] px-2.5 py-1 rounded-lg bg-[#F5F5F5] text-[#333333]/80 hover:bg-[#F5F5F5] transition-colors flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  保存
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(item.projectId);
                  }}
                  className="text-[9px] px-2.5 py-1 rounded-lg bg-[#F5F5F5] text-[#333333]/80 hover:bg-[#F5F5F5] transition-colors flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  ID
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* No Results */}
      {filteredResults.length === 0 && searchQuery && (
        <div className="text-center py-8">
          <p className="text-[#78909C] text-xs">「{searchQuery}」に一致する結果がありません</p>
        </div>
      )}

      {/* Zoom Modal */}
      {zoomedUrl && (
        <div
          className="fixed inset-0 z-50 bg-[#FAFAFA] backdrop-blur-sm flex items-center justify-center cursor-zoom-out animate-in"
          onClick={() => setZoomedUrl(null)}
        >
          <img
            src={zoomedUrl}
            alt="Zoomed result"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl"
          />
          <div className="absolute top-6 right-6 flex gap-3">
            <button
              className="w-10 h-10 rounded-full bg-[#FAFAFA] text-[#333333] hover:bg-[#FAFAFA] flex items-center justify-center transition-all duration-300"
              onClick={(e) => {
                e.stopPropagation();
                handleDownload(zoomedUrl, `tryon_result_${Date.now()}.png`);
              }}
              title="ダウンロード"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            <button
              className="w-10 h-10 rounded-full bg-[#F5F5F5] text-[#333333]/60 hover:text-[#333333] hover:bg-[#F5F5F5] flex items-center justify-center transition-all duration-300"
              onClick={() => setZoomedUrl(null)}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default ResultGallery;
