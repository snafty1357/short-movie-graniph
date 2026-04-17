-- KIGA セキュリティアップデート用SQL
-- Supabaseの「SQL Editor」タブで以下を実行してください。

-- 1. Generations テーブルが正しく設定され、RLSが有効化されていることを保証
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;

-- 2. 既存のガバガバなポリシー（もしあれば）を念のため削除
DROP POLICY IF EXISTS "Users can insert their own generations" ON generations;
DROP POLICY IF EXISTS "Users can view their own generations" ON generations;
DROP POLICY IF EXISTS "Users can update their own generations" ON generations;
DROP POLICY IF EXISTS "Users can delete their own generations" ON generations;

-- 3. 強固なセキュリティポリシーの再適用
-- "auth.uid()" は発行されたJWT（トークン）内のUID（暗号化で保護されている）を参照します
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

-- ※ 注意: Supabaseダッシュボードの [Authentication] -> [Providers] -> [Email]（または設定画面）で
-- 「Anonymous sign-ins」が有効（ON）になっていることを確認してください。無効だと匿名ユーザー機能が動作しません。
