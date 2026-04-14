-- KIGA 履歴管理用 Supabaseテーブル作成クエリ
-- Supabaseの「SQL Editor」タブを開き、以下のクエリを貼り付けて「Run」を実行してください。

CREATE TABLE IF NOT EXISTS generations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  device_id TEXT,
  project_id TEXT,
  image_url TEXT,
  garment_types TEXT[],
  description TEXT,
  resolution TEXT,
  format TEXT,
  generation_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 既存のテーブルに対して明示的にカラムを追加 (CREATE TABLE IF NOT EXISTS ではすでに存在するテーブルにカラムは追加されないため)
ALTER TABLE generations ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 認証されたユーザー自身のデータのみ操作可能にする
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;

-- 既存のポリシーを削除（再実行時のエラー回避用）
DROP POLICY IF EXISTS "Users can insert their own generations" ON generations;
DROP POLICY IF EXISTS "Users can view their own generations" ON generations;
DROP POLICY IF EXISTS "Users can update their own generations" ON generations;
DROP POLICY IF EXISTS "Users can delete their own generations" ON generations;

CREATE POLICY "Users can insert their own generations" 
  ON generations FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own generations" 
  ON generations FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own generations" 
  ON generations FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own generations" 
  ON generations FOR DELETE 
  USING (auth.uid() = user_id);
