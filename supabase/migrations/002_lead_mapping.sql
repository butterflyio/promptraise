-- Supabase migration: Phase 4 lead mapping + LLM audit readiness (PR-35).
-- Applied to live project (drxlgxmerjfrsfmcjipd) 2026-08-20; captured here for
-- version control / reproducibility.

-- Lead disposition fields on audit_leads.
ALTER TABLE audit_leads
  ADD COLUMN IF NOT EXISTS lead_tier       TEXT,           -- 'warm' | 'hot'
  ADD COLUMN IF NOT EXISTS llm_audit_status TEXT,          -- 'queued'|'running'|'done'|'failed'
  ADD COLUMN IF NOT EXISTS llm_audit_url   TEXT,           -- published deep-audit slug URL (butterflyio.github.io)
  ADD COLUMN IF NOT EXISTS trello_card_id  TEXT,           -- Trello card id for idempotent bridge updates
  ADD COLUMN IF NOT EXISTS consent_at      TIMESTAMP WITH TIME ZONE, -- when consent captured
  ADD COLUMN IF NOT EXISTS requires_llm    BOOLEAN NOT NULL DEFAULT FALSE;

-- Indexes to keep the bridges + LLM runner fast.
CREATE INDEX IF NOT EXISTS audit_leads_lead_tier_idx
  ON audit_leads (lead_tier);
CREATE INDEX IF NOT EXISTS audit_leads_llm_status_idx
  ON audit_leads (llm_audit_status)
  WHERE llm_audit_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_leads_consent_at_idx
  ON audit_leads (consent_at);
