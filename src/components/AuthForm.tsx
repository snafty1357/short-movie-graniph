/**
 * Auth Form - Login / Sign Up Component
 */
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const AuthForm: React.FC = () => {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) setError(error.message);
      } else {
        const { error } = await signUp(email, password);
        if (error) {
          setError(error.message);
        } else {
          // 登録成功 → 自動ログイン試行
          const { error: loginError } = await signIn(email, password);
          if (loginError) {
            // 確認メールが必要な場合
            setMessage('アカウントを作成しました。確認メールが届かない場合は、Supabaseダッシュボードで「Confirm email」を無効にしてください。');
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    const { error } = await signInWithGoogle();
    if (error) setError(error.message);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#a78bfa] to-[#7c3aed] flex items-center justify-center text-3xl font-black mx-auto mb-4">
            K
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">KIGA</h1>
          <p className="text-sm text-[#a0a0b0] mt-1">AI Virtual Try-On</p>
        </div>

        {/* Form Card */}
        <div className="bg-[#1a1a2e] border border-[#2a2a3e] rounded-2xl p-8">
          <h2 className="text-white font-bold text-lg mb-6 text-center">
            {isLogin ? 'ログイン' : 'アカウント作成'}
          </h2>

          {/* Google Sign In */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-3 bg-white text-gray-800 hover:bg-gray-100 transition-colors mb-4"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Googleでログイン
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-[#2a2a3e]"></div>
            <span className="text-xs text-[#555]">または</span>
            <div className="flex-1 h-px bg-[#2a2a3e]"></div>
          </div>

          {/* Email Form */}
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[#a0a0b0] mb-2 block">メールアドレス</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  required
                  className="w-full bg-[#0a0a0f] border border-[#2a2a3e] rounded-xl px-4 py-3 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#a78bfa] transition-colors"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#a0a0b0] mb-2 block">パスワード</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8文字以上"
                  required
                  minLength={8}
                  className="w-full bg-[#0a0a0f] border border-[#2a2a3e] rounded-xl px-4 py-3 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#a78bfa] transition-colors"
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mt-4 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                {error}
              </div>
            )}

            {/* Success Message */}
            {message && (
              <div className="mt-4 px-4 py-2.5 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-xs">
                {message}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-6 py-4 rounded-xl font-extrabold text-base bg-gradient-to-r from-[#a78bfa] via-[#7c3aed] to-[#a78bfa] bg-[length:200%_auto] text-white shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 hover:bg-right transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  処理中...
                </span>
              ) : isLogin ? (
                'ログイン'
              ) : (
                'アカウント作成'
              )}
            </button>
          </form>

          {/* Toggle */}
          <p className="text-center text-sm text-[#a0a0b0] mt-6">
            {isLogin ? 'アカウントをお持ちでない方は' : 'すでにアカウントをお持ちの方は'}
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setError(null);
                setMessage(null);
              }}
              className="text-[#a78bfa] font-bold hover:underline ml-1"
            >
              {isLogin ? '新規登録' : 'ログイン'}
            </button>
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-[#444] mt-6">
          Powered by Supabase Auth
        </p>
      </div>
    </div>
  );
};

export default AuthForm;
