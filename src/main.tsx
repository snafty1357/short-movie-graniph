import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import PublicHistory from './pages/PublicHistory'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import React from 'react'

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ background: '#0a0a0f', color: '#ff6b6b', padding: 40, minHeight: '100vh', fontFamily: 'monospace' }}>
          <h1 style={{ color: '#fff', marginBottom: 16 }}>⚠️ VESTRA - Error</h1>
          <p style={{ marginBottom: 8 }}>Application crashed:</p>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#ffa0a0' }}>{this.state.error?.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#888', fontSize: 12, marginTop: 8 }}>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

try {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <Routes>
            {/* 公開ギャラリーページ - 認証不要 */}
            <Route path="/gallery/:slug" element={
              <ThemeProvider>
                <PublicHistory />
              </ThemeProvider>
            } />
            <Route path="/gallery" element={
              <ThemeProvider>
                <PublicHistory />
              </ThemeProvider>
            } />
            {/* メインアプリ - 認証必要 */}
            <Route path="/*" element={
              <AuthProvider>
                <ThemeProvider>
                  <App />
                </ThemeProvider>
              </AuthProvider>
            } />
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>,
  )
} catch (e: any) {
  document.body.innerHTML = `<div style="background:#0a0a0f;color:#ff6b6b;padding:40px;min-height:100vh;font-family:monospace">
    <h1 style="color:#fff">⚠️ VESTRA - Startup Error</h1>
    <pre>${e.message}\n${e.stack}</pre>
  </div>`;
}
