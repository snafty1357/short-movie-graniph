import React, { useCallback, useState } from 'react';

interface ImageUploaderProps {
  label: string;
  icon: React.ReactNode;
  previewUrl: string | null;
  onFileSelect: (file: File) => void;
  onClear: () => void;
  accentColor: string;
  hint?: string;
  compact?: boolean;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({
  label, icon, previewUrl, onFileSelect, onClear, accentColor, hint, compact = false
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    // 1. ファイルドロップ（従来通り）
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      onFileSelect(file);
      return;
    }

    // 2. URL / Base64 ドロップ（生成結果画像などから）
    const imageUrl = e.dataTransfer.getData('application/x-tryon-result') ||
                     e.dataTransfer.getData('text/plain');
    if (imageUrl && (imageUrl.startsWith('data:image') || imageUrl.startsWith('http'))) {
      try {
        let targetUrl = imageUrl;
        if (imageUrl.startsWith('http') && !imageUrl.includes(window.location.host)) {
          // CORSを回避するため自社プロキシを経由する
          targetUrl = `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
        }
        
        const response = await fetch(targetUrl);
        const blob = await response.blob();
        const ext = blob.type.split('/')[1] || 'png';
        const imageFile = new File([blob], `dropped-result.${ext}`, { type: blob.type });
        onFileSelect(imageFile);
      } catch (err) {
        console.error('Failed to load dropped image:', err);
      }
    }
  }, [onFileSelect]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
    e.target.value = '';
  }, [onFileSelect]);

  const inputId = `upload-${label.replace(/\s/g, '-')}`;

  return (
    <div className="flex flex-col gap-2">
      <label
        className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5"
        style={{ color: `${accentColor}cc` }}
      >
        <span className="text-base flex items-center">{icon}</span>
        <span>{label}</span>
      </label>

      {previewUrl ? (
        <div className="relative group">
          <div
            className={`w-full ${compact ? 'aspect-square' : 'aspect-[3/4]'} bg-[#FAFAFA] rounded-xl overflow-hidden transition-all duration-300 group-hover:shadow-xl ${isDragging ? 'ring-2 ring-offset-2' : ''}`}
            style={{
              border: isDragging ? `2px solid ${accentColor}` : `2px solid ${accentColor}30`,
              boxShadow: isDragging ? `0 0 20px ${accentColor}30` : `0 0 0 0 ${accentColor}00`,
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <img
              src={previewUrl}
              alt={label}
              className={`w-full h-full object-contain transition-all duration-500 group-hover:scale-[1.02] ${isDragging ? 'opacity-40 scale-95' : ''}`}
            />
            {/* Overlay gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            {/* Drop indicator */}
            {isDragging && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70 z-10">
                <div className="text-3xl mb-2">📥</div>
                <p className="text-xs font-bold" style={{ color: accentColor }}>ここにドロップして差し替え</p>
              </div>
            )}
          </div>

          {/* Clear button */}
          <button
            onClick={onClear}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-[#FAFAFA] backdrop-blur-sm text-[#333333]/60 hover:text-red-400 hover:bg-[#FAFAFA] flex items-center justify-center text-sm font-bold transition-all duration-300 opacity-0 group-hover:opacity-100 border border-[#E0E0E0]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Change button */}
          <label
            htmlFor={inputId}
            className="absolute bottom-2 right-2 px-3 py-1.5 rounded-lg bg-[#FAFAFA] backdrop-blur-sm text-[10px] font-semibold cursor-pointer hover:bg-[#FAFAFA] transition-all duration-300 opacity-0 group-hover:opacity-100 border border-[#E0E0E0]"
            style={{ color: accentColor }}
          >
            変更
          </label>
          <input id={inputId} type="file" accept="image/*" onChange={handleFileInput} className="hidden" />
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className={`w-full ${compact ? 'aspect-square' : 'aspect-[3/4]'} rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all duration-300 ${
            isDragging ? 'scale-[1.02]' : 'hover:scale-[1.01]'
          }`}
          style={{
            borderColor: isDragging ? accentColor : `${accentColor}30`,
            backgroundColor: isDragging ? `${accentColor}10` : `${accentColor}05`,
            boxShadow: isDragging ? `0 0 30px ${accentColor}20` : 'none',
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div
            className={`flex justify-center mb-3 transition-all duration-300 ${isDragging ? 'scale-110' : 'opacity-40'}`}
          >
            {icon}
          </div>
          <p
            className="text-xs font-semibold transition-colors duration-300"
            style={{ color: isDragging ? accentColor : `${accentColor}80` }}
          >
            ドラッグ&ドロップ
          </p>
          <p
            className="text-[10px] mt-1 transition-colors duration-300"
            style={{ color: isDragging ? `${accentColor}aa` : `${accentColor}50` }}
          >
            またはクリックして選択
          </p>
          {hint && (
            <p
              className="text-[9px] mt-3 px-4 text-center transition-colors duration-300"
              style={{ color: `${accentColor}40` }}
            >
              {hint}
            </p>
          )}
          <input id={inputId} type="file" accept="image/*" onChange={handleFileInput} className="hidden" />
        </label>
      )}
    </div>
  );
};

export default ImageUploader;
