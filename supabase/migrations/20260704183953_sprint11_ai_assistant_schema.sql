/*
# Sprint 11 — KaSandra AI Assistant Schema

1. New Tables
- `ai_settings` — AI provider config (provider name, API key, model, system prompt)
- `ai_conversations` — chat history (role, content, created_at)

2. Columns
- ai_settings: id, provider (openai/gemini/openrouter), api_key, model, system_prompt, is_active, updated_at
- ai_conversations: id, role (user/assistant), content, metadata (jsonb), created_at

3. Security
- RLS enabled, scoped to authenticated users
*/

CREATE TABLE IF NOT EXISTS ai_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'openai',
  api_key text,
  model text NOT NULL DEFAULT 'gpt-4o-mini',
  system_prompt text,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ai_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_ai_settings" ON ai_settings;
CREATE POLICY "select_ai_settings" ON ai_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "update_ai_settings" ON ai_settings;
CREATE POLICY "update_ai_settings" ON ai_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "insert_ai_settings" ON ai_settings;
CREATE POLICY "insert_ai_settings" ON ai_settings FOR INSERT TO authenticated WITH CHECK (true);

INSERT INTO ai_settings (id, provider, model, system_prompt)
SELECT gen_random_uuid(), 'openai', 'gpt-4o-mini',
'Anda adalah KaSandra AI, asisten bisnis untuk aplikasi POS KaSandra. Jawab pertanyaan user dalam Bahasa Indonesia secara singkat dan jelas. Gunakan data bisnis yang disediakan untuk memberikan insight, ringkasan, dan rekomendasi yang actionable.'
WHERE NOT EXISTS (SELECT 1 FROM ai_settings);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_ai_conversations" ON ai_conversations;
CREATE POLICY "select_ai_conversations" ON ai_conversations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_ai_conversations" ON ai_conversations;
CREATE POLICY "insert_ai_conversations" ON ai_conversations FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "delete_ai_conversations" ON ai_conversations;
CREATE POLICY "delete_ai_conversations" ON ai_conversations FOR DELETE TO authenticated USING (true);
