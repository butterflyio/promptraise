-- Track audit outcomes and BotSee credit consumption
CREATE TABLE IF NOT EXISTS audit_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID REFERENCES audits(id) ON DELETE CASCADE,
  botsee_site_uuid TEXT,
  botsee_analysis_uuid TEXT,
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'success', 'failed')),
  credits_consumed NUMERIC,
  failure_reason TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audit_metrics_audit_id ON audit_metrics(audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_metrics_status ON audit_metrics(status);

-- Enable RLS
ALTER TABLE audit_metrics ENABLE ROW LEVEL SECURITY;

-- Policies (open for now; tighten when auth is in place)
CREATE POLICY "Allow select" ON audit_metrics FOR SELECT USING (true);
CREATE POLICY "Allow insert" ON audit_metrics FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update" ON audit_metrics FOR UPDATE USING (true);
