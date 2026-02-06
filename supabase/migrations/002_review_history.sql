-- ============================================
-- Review History Table
-- Stores all PR reviews for history/analytics
-- ============================================

CREATE TABLE IF NOT EXISTS review_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  pr_number INTEGER NOT NULL,
  pr_title TEXT NOT NULL,
  pr_url TEXT NOT NULL,
  pr_author TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  trigger_type TEXT NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('webhook', 'manual')),
  violations_count INTEGER NOT NULL DEFAULT 0,
  errors_count INTEGER NOT NULL DEFAULT 0,
  warnings_count INTEGER NOT NULL DEFAULT 0,
  suggestions_count INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 100,
  summary TEXT,
  review_data JSONB,
  github_review_id TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups by repository
CREATE INDEX IF NOT EXISTS idx_review_history_repo ON review_history(repository_id);
CREATE INDEX IF NOT EXISTS idx_review_history_created ON review_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_history_pr ON review_history(repository_id, pr_number);

-- ============================================
-- Webhook Registrations Table
-- Tracks webhook setup per repository
-- ============================================

CREATE TABLE IF NOT EXISTS webhook_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE UNIQUE,
  webhook_secret TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  github_webhook_id TEXT,
  last_received_at TIMESTAMPTZ,
  events_received INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for webhook lookups
CREATE INDEX IF NOT EXISTS idx_webhook_reg_repo ON webhook_registrations(repository_id);

-- ============================================
-- Function to increment webhook events
-- ============================================

CREATE OR REPLACE FUNCTION increment_webhook_events(repo_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE webhook_registrations
  SET
    events_received = events_received + 1,
    last_received_at = NOW(),
    updated_at = NOW()
  WHERE repository_id = repo_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Enable Row Level Security (optional)
-- ============================================

ALTER TABLE review_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_registrations ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role has full access to review_history"
  ON review_history FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access to webhook_registrations"
  ON webhook_registrations FOR ALL
  USING (true)
  WITH CHECK (true);
