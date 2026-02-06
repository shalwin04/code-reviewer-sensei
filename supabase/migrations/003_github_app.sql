-- ============================================
-- GitHub App Installations Table
-- Tracks which repos have the app installed
-- ============================================

CREATE TABLE IF NOT EXISTS github_app_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id BIGINT NOT NULL UNIQUE,
  account_login TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('User', 'Organization')),
  account_id BIGINT NOT NULL,
  repository_selection TEXT NOT NULL DEFAULT 'selected' CHECK (repository_selection IN ('all', 'selected')),
  suspended_at TIMESTAMPTZ,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Installed Repositories Table
-- Links installations to specific repos
-- ============================================

CREATE TABLE IF NOT EXISTS github_app_repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id BIGINT NOT NULL REFERENCES github_app_installations(installation_id) ON DELETE CASCADE,
  repository_id BIGINT NOT NULL,
  repository_full_name TEXT NOT NULL,
  repository_name TEXT NOT NULL,
  is_private BOOLEAN NOT NULL DEFAULT false,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(installation_id, repository_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_app_installations_account ON github_app_installations(account_login);
CREATE INDEX IF NOT EXISTS idx_app_repos_installation ON github_app_repositories(installation_id);
CREATE INDEX IF NOT EXISTS idx_app_repos_fullname ON github_app_repositories(repository_full_name);

-- ============================================
-- RLS Policies
-- ============================================

ALTER TABLE github_app_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_app_repositories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to github_app_installations"
  ON github_app_installations FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access to github_app_repositories"
  ON github_app_repositories FOR ALL
  USING (true)
  WITH CHECK (true);
