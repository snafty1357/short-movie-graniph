/**
 * Project Utilities
 * プロジェクト関連のユーティリティ関数
 */

/**
 * プロジェクトID生成（読みやすい形式）
 * 例: COOL-LOOK-042, CHIC-STYLE-789
 */
export function generateProjectId(): string {
  const adjectives = ['COOL', 'CHIC', 'BOLD', 'SOFT', 'PURE', 'LUXE', 'EDGE', 'GLOW', 'VIBE', 'MOOD'];
  const nouns = ['LOOK', 'STYLE', 'FIT', 'WEAR', 'MOOD', 'FLOW', 'WAVE', 'BEAT', 'TONE', 'LINE'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${adj}-${noun}-${num}`;
}
