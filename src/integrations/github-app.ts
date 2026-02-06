import { App, Octokit } from "octokit";
import { getSupabaseClient } from "./supabase.js";

// ============================================
// GitHub App Configuration
// ============================================

interface GitHubAppConfig {
  appId: string;
  privateKey: string;
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
}

let githubApp: App | null = null;

function getAppConfig(): GitHubAppConfig | null {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;
  const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET;

  if (!appId || !privateKey || !clientId || !clientSecret) {
    return null;
  }

  return {
    appId,
    privateKey,
    clientId,
    clientSecret,
    webhookSecret: webhookSecret || "",
  };
}

export function isGitHubAppConfigured(): boolean {
  return getAppConfig() !== null;
}

export function getGitHubApp(): App | null {
  if (githubApp) return githubApp;

  const config = getAppConfig();
  if (!config) return null;

  githubApp = new App({
    appId: config.appId,
    privateKey: config.privateKey,
    webhooks: {
      secret: config.webhookSecret,
    },
  });

  return githubApp;
}

// ============================================
// Get Installation Access Token
// ============================================

export async function getInstallationOctokit(installationId: number): Promise<Octokit | null> {
  const app = getGitHubApp();
  if (!app) return null;

  return app.getInstallationOctokit(installationId);
}

export async function getInstallationForRepo(repoFullName: string): Promise<number | null> {
  const supabase = getSupabaseClient();

  const { data } = await supabase
    .from("github_app_repositories")
    .select("installation_id")
    .eq("repository_full_name", repoFullName)
    .single();

  return data?.installation_id || null;
}

// ============================================
// Installation Management
// ============================================

export interface InstallationPayload {
  action: "created" | "deleted" | "suspend" | "unsuspend" | "new_permissions_accepted";
  installation: {
    id: number;
    account: {
      login: string;
      id: number;
      type: "User" | "Organization";
    };
    repository_selection: "all" | "selected";
    suspended_at: string | null;
  };
  repositories?: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
  }>;
}

export async function handleInstallationCreated(payload: InstallationPayload): Promise<void> {
  const supabase = getSupabaseClient();
  const { installation, repositories } = payload;

  console.log(`📦 GitHub App installed for ${installation.account.login}`);

  // Store installation
  const { error: installError } = await supabase
    .from("github_app_installations")
    .upsert({
      installation_id: installation.id,
      account_login: installation.account.login,
      account_type: installation.account.type,
      account_id: installation.account.id,
      repository_selection: installation.repository_selection,
      suspended_at: installation.suspended_at,
      installed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: "installation_id",
    });

  if (installError) {
    console.error("Failed to store installation:", installError);
    return;
  }

  // Store repositories if provided
  if (repositories && repositories.length > 0) {
    const repoRecords = repositories.map((repo) => ({
      installation_id: installation.id,
      repository_id: repo.id,
      repository_full_name: repo.full_name,
      repository_name: repo.name,
      is_private: repo.private,
      added_at: new Date().toISOString(),
    }));

    const { error: repoError } = await supabase
      .from("github_app_repositories")
      .upsert(repoRecords, {
        onConflict: "installation_id,repository_id",
      });

    if (repoError) {
      console.error("Failed to store repositories:", repoError);
    }

    console.log(`   Added ${repositories.length} repositories`);
  }
}

export async function handleInstallationDeleted(payload: InstallationPayload): Promise<void> {
  const supabase = getSupabaseClient();
  const { installation } = payload;

  console.log(`🗑️ GitHub App uninstalled for ${installation.account.login}`);

  // Delete installation (cascades to repositories)
  const { error } = await supabase
    .from("github_app_installations")
    .delete()
    .eq("installation_id", installation.id);

  if (error) {
    console.error("Failed to delete installation:", error);
  }
}

export async function handleInstallationSuspend(payload: InstallationPayload): Promise<void> {
  const supabase = getSupabaseClient();
  const { installation } = payload;

  console.log(`⏸️ GitHub App suspended for ${installation.account.login}`);

  await supabase
    .from("github_app_installations")
    .update({
      suspended_at: installation.suspended_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("installation_id", installation.id);
}

export async function handleInstallationUnsuspend(payload: InstallationPayload): Promise<void> {
  const supabase = getSupabaseClient();
  const { installation } = payload;

  console.log(`▶️ GitHub App unsuspended for ${installation.account.login}`);

  await supabase
    .from("github_app_installations")
    .update({
      suspended_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("installation_id", installation.id);
}

// ============================================
// Repository Events
// ============================================

export interface InstallationReposPayload {
  action: "added" | "removed";
  installation: {
    id: number;
    account: {
      login: string;
    };
  };
  repositories_added?: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
  }>;
  repositories_removed?: Array<{
    id: number;
    name: string;
    full_name: string;
  }>;
}

export async function handleInstallationReposAdded(payload: InstallationReposPayload): Promise<void> {
  const supabase = getSupabaseClient();
  const { installation, repositories_added } = payload;

  if (!repositories_added || repositories_added.length === 0) return;

  console.log(`➕ Added ${repositories_added.length} repos to installation ${installation.account.login}`);

  const repoRecords = repositories_added.map((repo) => ({
    installation_id: installation.id,
    repository_id: repo.id,
    repository_full_name: repo.full_name,
    repository_name: repo.name,
    is_private: repo.private,
    added_at: new Date().toISOString(),
  }));

  await supabase
    .from("github_app_repositories")
    .upsert(repoRecords, {
      onConflict: "installation_id,repository_id",
    });
}

export async function handleInstallationReposRemoved(payload: InstallationReposPayload): Promise<void> {
  const supabase = getSupabaseClient();
  const { installation, repositories_removed } = payload;

  if (!repositories_removed || repositories_removed.length === 0) return;

  console.log(`➖ Removed ${repositories_removed.length} repos from installation ${installation.account.login}`);

  const repoIds = repositories_removed.map((repo) => repo.id);

  await supabase
    .from("github_app_repositories")
    .delete()
    .eq("installation_id", installation.id)
    .in("repository_id", repoIds);
}

// ============================================
// Query Functions
// ============================================

export async function getInstalledRepositories(): Promise<Array<{
  repository_full_name: string;
  installation_id: number;
  is_private: boolean;
}>> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("github_app_repositories")
    .select(`
      repository_full_name,
      installation_id,
      is_private,
      github_app_installations!inner(suspended_at)
    `)
    .is("github_app_installations.suspended_at", null);

  if (error) {
    console.error("Failed to get installed repositories:", error);
    return [];
  }

  return data || [];
}

export async function isRepoInstalled(repoFullName: string): Promise<boolean> {
  const installationId = await getInstallationForRepo(repoFullName);
  return installationId !== null;
}

export function getAppInstallUrl(): string | null {
  const config = getAppConfig();
  if (!config) return null;

  // GitHub App installation URL format
  const appSlug = process.env.GITHUB_APP_SLUG || "ai-code-reviewer";
  return `https://github.com/apps/${appSlug}/installations/new`;
}
