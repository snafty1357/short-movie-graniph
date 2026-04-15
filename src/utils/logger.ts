/**
 * Logger Utility
 * 本番環境ではログ出力を抑制し、開発環境でのみ詳細なログを出力
 */

const isDev = import.meta.env.DEV;

interface Logger {
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  log: (message: string, ...args: unknown[]) => void;
}

const noop = () => {};

/**
 * アプリケーション用ロガー
 * - 開発環境: すべてのログを出力
 * - 本番環境: warn と error のみ出力
 */
export const logger: Logger = {
  debug: isDev
    ? (message: string, ...args: unknown[]) => console.debug(`[DEBUG] ${message}`, ...args)
    : noop,
  info: isDev
    ? (message: string, ...args: unknown[]) => console.info(`[INFO] ${message}`, ...args)
    : noop,
  warn: (message: string, ...args: unknown[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: unknown[]) => console.error(`[ERROR] ${message}`, ...args),
  log: isDev
    ? (message: string, ...args: unknown[]) => console.log(message, ...args)
    : noop,
};

/**
 * 条件付きログ出力
 * 特定の機能やモジュールのデバッグ時に使用
 */
export function createLogger(prefix: string): Logger {
  return {
    debug: isDev
      ? (message: string, ...args: unknown[]) => console.debug(`[${prefix}] ${message}`, ...args)
      : noop,
    info: isDev
      ? (message: string, ...args: unknown[]) => console.info(`[${prefix}] ${message}`, ...args)
      : noop,
    warn: (message: string, ...args: unknown[]) => console.warn(`[${prefix}] ${message}`, ...args),
    error: (message: string, ...args: unknown[]) => console.error(`[${prefix}] ${message}`, ...args),
    log: isDev
      ? (message: string, ...args: unknown[]) => console.log(`[${prefix}] ${message}`, ...args)
      : noop,
  };
}

export default logger;
