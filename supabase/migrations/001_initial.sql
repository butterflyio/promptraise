-- Supabase migration for audit-promptraise

-- Create audits table
CREATE TABLE IF NOT EXISTS audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_code TEXT UNIQUE NOT NULL,
  website_url TEXT NOT NULL,
  company_name TEXT,
  telegram_handle TEXT,
  telegram_chat_id TEXT,
  botsee_site_uuid TEXT,
  botsee_analysis_uuid TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  results JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create telegram_users table to store chat IDs
CREATE TABLE IF NOT EXISTS telegram_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  chat_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_audits_access_code ON audits(access_code);
CREATE INDEX IF NOT EXISTS idx_audits_status ON audits(status);
CREATE INDEX IF NOT EXISTS idx_telegram_users_username ON telegram_users(username);

-- Enable RLS (Row Level Security)
ALTER TABLE audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_users ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (start audit)
CREATE POLICY "Allow insert" ON audits FOR INSERT WITH CHECK (true);

-- Allow anyone to select (get audit by code)
CREATE POLICY "Allow select by code" ON audits FOR SELECT USING (true);

-- Allow updates (for polling status)
CREATE POLICY "Allow update" ON audits FOR UPDATE USING (true);

-- Allow public access to telegram_users for updates
CREATE POLICY "Allow insert" ON telegram_users FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update" ON telegram_users FOR UPDATE USING (true);
CREATE POLICY "Allow select" ON telegram_users FOR SELECT USING (true);

-- Create function to generate random 8-digit code
CREATE OR REPLACE FUNCTION generate_access_code()
RETURNS TEXT AS $$
DECLARE
  code TEXT;
BEGIN
  -- Generate random 8-digit number
  code := LPAD(FLOOR(RANDOM() * 100000000)::TEXT, 8, '0');
  
  -- Ensure uniqueness
  WHILE EXISTS (SELECT 1 FROM audits WHERE access_code = code) LOOP
    code := LPAD(FLOOR(RANDOM() * 100000000)::TEXT, 8, '0');
  END LOOP;
  
  RETURN code;
END;
$$ LANGUAGE plpgsql;
