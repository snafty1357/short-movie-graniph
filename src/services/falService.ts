/**
 * Fal.ai Nano Banana 2 Service
 * バーチャル試着の画像生成
 */

const PROXY_BASE = '/api/proxy';

export type Resolution = '1K' | '2K' | '4K';
export type ImageFormat = 'png' | 'jpeg' | 'webp';

const RESOLUTION_MAP: Record<Resolution, number> = {
  '1K': 1024,
  '2K': 2048,
  '4K': 4096,
};

interface TryOnRequest {
  humanImageUrl: string;
  garmentImageUrl: string;
  description?: string;
  negativePrompt?: string;
  resolution?: Resolution;
  format?: ImageFormat;
  pose?: string;
  garmentCategory?: string; // 'top' | 'inner' | 'outer' | 'bottom' | 'dress' | 'shoes' | 'accessory'
}

interface TryOnResult {
  imageUrl: string;
  maskUrl?: string;
}

/**
 * Fal.ai にリクエストを送信 (パス指定)
 * @param useSync true の場合は fal.run を使用（同期モード）
 */
async function falRequest(path: string, method: string = 'GET', body?: any, useSync: boolean = false): Promise<any> {
  const params = new URLSearchParams({ path });
  if (useSync) {
    params.set('sync', '1');
  }
  const url = `${PROXY_BASE}?${params.toString()}`;
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.detail || errorData.error || `API Error: ${response.status}`);
  }
  return response.json();
}

/**
 * フルURLを使用してFal.ai にリクエストを送信
 */
async function falRequestUrl(fullUrl: string, method: string = 'GET'): Promise<any> {
  const params = new URLSearchParams({ url: fullUrl });
  const url = `${PROXY_BASE}?${params.toString()}`;
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  const response = await fetch(url, options);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.detail || errorData.error || `API Error: ${response.status}`);
  }
  return response.json();
}

/**
 * ステータスをポーリング (status_url と response_url を使用)
 */
async function pollWithUrls(statusUrl: string, responseUrl: string): Promise<any> {
  const maxAttempts = 240; // 最大8分（2秒×240回）

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      const status = await falRequestUrl(statusUrl, 'GET');
      console.log(`[Fal.ai] Status: ${status.status}`);

      if (status.status === 'COMPLETED') {
        // 結果を取得
        return await falRequestUrl(responseUrl, 'GET');
      }

      if (status.status === 'FAILED') {
        throw new Error(`Generation failed: ${status.error || 'Unknown error'}`);
      }

      // IN_QUEUE, IN_PROGRESS の場合は継続
    } catch (e: any) {
      if (e.message.includes('Generation failed')) throw e;
      console.warn(`[Fal.ai] Poll error (attempt ${i + 1}):`, e.message);
      // 一時的なエラーの場合は継続
    }
  }

  throw new Error('Generation timed out after 8 minutes');
}

/**
 * バーチャル試着を実行 (Nano Banana 2)
 */
export async function generateTryOn(request: TryOnRequest): Promise<TryOnResult> {
  console.log('[TryOn] Starting generation with Nano Banana 2...');
  console.log('[TryOn] Prompt:', request.description);

  // 解像度を取得
  const size = request.resolution ? RESOLUTION_MAP[request.resolution] : 1024;

  // ポジティブプロンプトのみ抽出（セクションタグを除去）
  let prompt = request.description || 'A person wearing this garment naturally';
  prompt = prompt
    .replace(/===.*?===/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\n+/g, ' ')
    .trim();

  // プロンプトが長すぎる場合は切り詰め
  if (prompt.length > 1000) {
    prompt = prompt.substring(0, 1000);
  }

  console.log('[TryOn] Final prompt:', prompt.substring(0, 200) + '...');

  // 解像度をAPIの形式に変換
  const resolutionMap: Record<number, string> = {
    1024: '1K',
    2048: '2K',
    4096: '4K',
  };

  // ポーズ指定があれば追加
  const poseInstruction = request.pose ? ` The person should be in a ${request.pose} pose.` : '';

  // カテゴリ別のレイヤリング指示を構築
  const category = request.garmentCategory || 'top';
  let layeringInstruction = '';
  
  if (category === 'outer') {
    // アウター：モデルの既存のインナー/トップスを維持し、その上にアウターを重ねる
    layeringInstruction = ' IMPORTANT: Keep the person\'s existing inner clothing (t-shirt, shirt, sweater, etc.) exactly as shown in the original image. Layer the new outerwear ON TOP of their current clothing. Do NOT remove or replace their existing top/inner garment.';
  } else if (category === 'bottom') {
    // ボトムス：モデルの既存のトップスを維持し、ボトムスだけ変更
    layeringInstruction = ' IMPORTANT: Keep the person\'s existing upper body clothing (shirt, t-shirt, jacket, etc.) exactly as shown in the original image. Only change the lower body garment (pants/skirt/shorts) to the new item. Do NOT modify their top clothing.';
  } else if (category === 'shoes') {
    // シューズ：全ての服を維持し、靴だけ変更
    layeringInstruction = ' IMPORTANT: Keep ALL of the person\'s existing clothing exactly as shown in the original image. Only change their footwear/shoes to the new item.';
  } else if (category === 'accessory') {
    // アクセサリー：全ての服を維持し、アクセサリーだけ追加
    layeringInstruction = ' IMPORTANT: Keep ALL of the person\'s existing clothing exactly as shown in the original image. Add the accessory item without changing any clothing.';
  } else if (category === 'inner') {
    // インナー：アウターがあればそれを維持
    layeringInstruction = ' IMPORTANT: If the person is wearing an outer layer (jacket, coat, etc.), keep it. Replace only the inner/base layer with the new garment.';
  } else if (category === 'top') {
    // トップス：インナー（キャミソール、タンクトップ等）を維持
    layeringInstruction = ' IMPORTANT: If the person is wearing an undershirt, camisole, or tank top underneath, keep that inner layer visible. Replace only the main top garment with the new item. Preserve any visible neckline of the inner layer.';
  }
  // dress は従来通り（服全体を置き換え）

  // プロンプトを試着用に構築（人物画像が最初、服の画像が次）
  const tryOnPrompt = `Using the first image as the person, make them wear the clothing item shown in the second image.${poseInstruction}${layeringInstruction} ${prompt}. Preserve the exact design details of the garment including all buttons, pockets, collars, patterns, decorations, and proportions. The garment must look identical to the reference.`;

  // Nano Banana 2 Edit API - queue.fal.run で非同期キュー送信
  // （fal.run 同期モードはVercelの10秒タイムアウトで失敗するため、キューモードを使用）
  const submitResult = await falRequest('fal-ai/nano-banana-2/edit', 'POST', {
    prompt: tryOnPrompt,
    image_urls: [request.humanImageUrl, request.garmentImageUrl],
    resolution: resolutionMap[size] || '1K',
    num_images: 1,
    safety_tolerance: "5",
    output_format: request.format || 'png',
  }, false);  // useSync = false でキューモード（queue.fal.run）を使用

  console.log('[TryOn] Submit response:', JSON.stringify(submitResult).substring(0, 300));

  // If we got a direct result (synchronous - unlikely in queue mode)
  if (submitResult.images && submitResult.images.length > 0) {
    console.log('[TryOn] Got direct result');
    return {
      imageUrl: submitResult.images[0].url,
    };
  }

  // キューレスポンスの場合（status_url と response_url を使用）
  if (submitResult.status_url && submitResult.response_url) {
    console.log(`[TryOn] Queued - status_url: ${submitResult.status_url}`);
    console.log(`[TryOn] Queued - response_url: ${submitResult.response_url}`);

    const result = await pollWithUrls(submitResult.status_url, submitResult.response_url);

    const imageUrl = result.images?.[0]?.url || result.image?.url;
    if (!imageUrl) {
      console.error('[TryOn] No image URL in result:', result);
      throw new Error('No image URL in response');
    }

    console.log('[TryOn] Generation complete:', imageUrl);
    return {
      imageUrl: imageUrl,
    };
  }

  // request_id のみの場合（フォールバック）
  if (submitResult.request_id) {
    console.log(`[TryOn] Queued with ID only: ${submitResult.request_id}`);
    // 手動でURLを構築
    const statusUrl = `https://queue.fal.run/fal-ai/nano-banana-2/edit/requests/${submitResult.request_id}/status`;
    const responseUrl = `https://queue.fal.run/fal-ai/nano-banana-2/edit/requests/${submitResult.request_id}`;

    const result = await pollWithUrls(statusUrl, responseUrl);

    const imageUrl = result.images?.[0]?.url || result.image?.url;
    if (!imageUrl) {
      console.error('[TryOn] No image URL in result:', result);
      throw new Error('No image URL in response');
    }

    console.log('[TryOn] Generation complete:', imageUrl);
    return {
      imageUrl: imageUrl,
    };
  }
  console.error('[TryOn] Unexpected response format:', submitResult);
  throw new Error('Unexpected response format from Fal.ai');
}

export interface PoseGenerationRequest {
  humanImageUrl: string;
  pose: string;
  resolution?: Resolution;
  format?: ImageFormat;
  subCharacterImageUrl?: string; // IPキャラクター画像（オプション）
  subCharacterPrompt?: string;   // IPキャラクターの説明
}

/**
 * 人物の単体ポーズ変更を実行 (Nano Banana 2) - 着画コンポーネントの「ポーズ版」
 */
export async function generatePose(request: PoseGenerationRequest): Promise<TryOnResult> {
  console.log('[PoseGen] Starting generation with Nano Banana 2...');
  console.log('[PoseGen] Detailed pose:', request.pose);

  const resolutionMap: Record<number, string> = {
    1024: '1K',
    2048: '2K',
    4096: '4K',
  };

  const size = request.resolution ? RESOLUTION_MAP[request.resolution] : 1024;

  // プロンプトを構築（IPキャラクターがある場合は追加）
  let prompt = `Change the posture of the person in the image to strike exactly a ${request.pose} pose. Strictly preserve their face identity, features, and their current clothing exactly as it is.`;

  if (request.subCharacterImageUrl && request.subCharacterPrompt) {
    prompt += ` Also include a companion character in the scene: ${request.subCharacterPrompt}. Place the companion character naturally within the composition.`;
  }

  // 画像配列を構築
  const imageUrls = [request.humanImageUrl];
  if (request.subCharacterImageUrl) {
    imageUrls.push(request.subCharacterImageUrl);
  }

  const submitResult = await falRequest('fal-ai/nano-banana-2/edit', 'POST', {
    prompt: prompt,
    image_urls: imageUrls,
    resolution: resolutionMap[size] || '1K',
    num_images: 1,
    safety_tolerance: "5",
    output_format: request.format || 'png',
  }, false);  

  console.log('[PoseGen] Queued response:', JSON.stringify(submitResult).substring(0, 300));

  if (submitResult.images && submitResult.images.length > 0) {
    return { imageUrl: submitResult.images[0].url };
  }

  if (submitResult.status_url && submitResult.response_url) {
    const result = await pollWithUrls(submitResult.status_url, submitResult.response_url);
    const imageUrl = result.images?.[0]?.url || result.image?.url;
    if (!imageUrl) throw new Error('No image URL in response');
    return { imageUrl };
  }

  if (submitResult.request_id) {
    const statusUrl = `https://queue.fal.run/fal-ai/nano-banana-2/edit/requests/${submitResult.request_id}/status`;
    const responseUrl = `https://queue.fal.run/fal-ai/nano-banana-2/edit/requests/${submitResult.request_id}`;
    const result = await pollWithUrls(statusUrl, responseUrl);
    const imageUrl = result.images?.[0]?.url || result.image?.url;
    if (!imageUrl) throw new Error('No image URL in response');
    return { imageUrl };
  }

  throw new Error('Unexpected response format from API');
}

// =====================
// Kling Video Generation
// =====================

export type KlingModel = 'v1-standard' | 'v1-pro' | 'v2-master' | 'v2.1-pro' | 'v2.6-pro';
export type KlingDuration = '5' | '10';
export type KlingAspectRatio = '16:9' | '9:16' | '1:1';

interface KlingVideoRequest {
  imageUrl: string;
  prompt: string;
  negativePrompt?: string;
  duration?: KlingDuration;
  aspectRatio?: KlingAspectRatio;
  model?: KlingModel;
}

interface KlingVideoResult {
  videoUrl: string;
  thumbnailUrl?: string;
}

const KLING_MODEL_PATHS: Record<KlingModel, string> = {
  'v1-standard': 'fal-ai/kling-video/v1/standard/image-to-video',
  'v1-pro': 'fal-ai/kling-video/v1/pro/image-to-video',
  'v2-master': 'fal-ai/kling-video/v2/master/image-to-video',
  'v2.1-pro': 'fal-ai/kling-video/v2.1/pro/image-to-video',
  'v2.6-pro': 'fal-ai/kling-video/v2.6/pro/image-to-video',
};

/**
 * Kling 動画生成 (Image to Video)
 */
export async function generateKlingVideo(request: KlingVideoRequest): Promise<KlingVideoResult> {
  const model = request.model || 'v2.6-pro';
  const path = KLING_MODEL_PATHS[model];

  console.log(`[Kling] Starting video generation with ${model}...`);
  console.log('[Kling] Prompt:', request.prompt);

  const submitResult = await falRequest(path, 'POST', {
    image_url: request.imageUrl,
    prompt: request.prompt,
    negative_prompt: request.negativePrompt || '',
    duration: request.duration || '5',
    aspect_ratio: request.aspectRatio || '16:9',
  }, false);

  console.log('[Kling] Submit response:', JSON.stringify(submitResult).substring(0, 300));

  // Direct result
  if (submitResult.video?.url) {
    return {
      videoUrl: submitResult.video.url,
      thumbnailUrl: submitResult.thumbnail?.url,
    };
  }

  // Queue response
  if (submitResult.status_url && submitResult.response_url) {
    console.log(`[Kling] Queued - polling for result...`);
    const result = await pollWithUrls(submitResult.status_url, submitResult.response_url);

    const videoUrl = result.video?.url;
    if (!videoUrl) {
      console.error('[Kling] No video URL in result:', result);
      throw new Error('No video URL in response');
    }

    return {
      videoUrl,
      thumbnailUrl: result.thumbnail?.url,
    };
  }

  // Fallback with request_id
  if (submitResult.request_id) {
    const statusUrl = `https://queue.fal.run/${path}/requests/${submitResult.request_id}/status`;
    const responseUrl = `https://queue.fal.run/${path}/requests/${submitResult.request_id}`;
    const result = await pollWithUrls(statusUrl, responseUrl);

    const videoUrl = result.video?.url;
    if (!videoUrl) throw new Error('No video URL in response');

    return {
      videoUrl,
      thumbnailUrl: result.thumbnail?.url,
    };
  }

  throw new Error('Unexpected response format from Kling API');
}

/**
 * ローカルの File を data URL に変換（大きな画像はリサイズ）
 * Vercelのbody制限（4.5MB）を超えないように、画像をリサイズしてからBase64に変換
 */
export function fileToDataUrl(file: File, maxSize: number = 1536): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const dataUrl = reader.result as string;

      // 画像をCanvasでリサイズ
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        // maxSize以下ならそのまま返す
        if (width <= maxSize && height <= maxSize) {
          // Vercel制限(4.5MB)を考慮し、1画像あたり約1.4MB(~2000000 chars)以下ならそのまま返す
          if (dataUrl.length < 2_000_000) {
            resolve(dataUrl);
            return;
          }
        }

        // アスペクト比を維持してリサイズ
        if (width > height) {
          if (width > maxSize) {
            height = Math.round(height * (maxSize / width));
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round(width * (maxSize / height));
            height = maxSize;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl); // fallback
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        // JPEG 92%品質でエンコード（画質とサイズのバランス）
        const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
        console.log(`[Resize] ${img.naturalWidth}x${img.naturalHeight} → ${width}x${height}, ${Math.round(dataUrl.length/1024)}KB → ${Math.round(resizedDataUrl.length/1024)}KB`);
        resolve(resizedDataUrl);
      };
      img.onerror = () => resolve(dataUrl); // fallback
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
