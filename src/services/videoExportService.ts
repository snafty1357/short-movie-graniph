/**
 * Video Export Service
 * 動画のダウンロード機能
 */

/**
 * 外部URLの動画をBlobとしてダウンロード（CORS対応）
 */
export async function downloadVideoFromUrl(
  url: string,
  filename: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  try {
    onProgress?.(10);

    // Fetch the video as blob
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch video: ${response.status}`);
    }

    onProgress?.(50);

    const blob = await response.blob();
    onProgress?.(80);

    // Create download link
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Cleanup
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    onProgress?.(100);
  } catch (error: any) {
    console.error('[VideoExport] Download error:', error);
    throw new Error(`動画のダウンロードに失敗しました: ${error.message}`);
  }
}

/**
 * 複数の動画を一括ダウンロード（ZIPなし、順次ダウンロード）
 */
export async function downloadAllVideos(
  videoUrls: string[],
  baseFilename: string,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  for (let i = 0; i < videoUrls.length; i++) {
    onProgress?.(i, videoUrls.length);
    const filename = `${baseFilename}_cut${i + 1}.mp4`;
    await downloadVideoFromUrl(videoUrls[i], filename);
    // 少し待機して連続ダウンロードの問題を回避
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  onProgress?.(videoUrls.length, videoUrls.length);
}

/**
 * 単一の動画をダウンロード（直接リンク）
 */
export function downloadVideoDirect(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
