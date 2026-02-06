const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// ============================================
// Types
// ============================================

export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  avatarUrl: string;
  isAuthenticated: boolean;
}

export interface Repository {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  private: boolean;
  url: string;
  language: string | null;
  updatedAt: string;
  defaultBranch: string;
  owner: {
    login: string;
    avatarUrl: string;
  };
}

export interface Organization {
  id: number;
  login: string;
  description: string | null;
  avatarUrl: string;
}

export interface Convention {
  id?: string;
  title?: string;
  rule?: string;  // Backend uses 'rule' instead of 'title'
  description?: string;
  category?: string;
  severity?: string;
  confidence?: number;
  example?: string;
  examples?: Array<{
    good?: string;
    bad?: string;
    explanation?: string;
  }>;
  source?: string | {
    type?: string;
    reference?: string;
    timestamp?: string;
  };
  tags?: string[];
}

export interface StatsResponse {
  // Frontend expected format
  totalConventions?: number;
  byCategory?: Record<string, number>;
  bySeverity?: Record<string, number>;
  recentActivity?: Activity[];
  // Backend actual format
  conventions?: number;
  lastLearned?: string;
}

export interface Activity {
  id?: string;
  type?: 'review' | 'ask' | 'learn' | string;
  description?: string;
  timestamp?: string;
}

export interface AskRequest {
  repo: string;
  question: string;
  context?: string;
}

export interface AskResponse {
  answer?: string;
  relatedConventions?: Convention[];
}

export interface ReviewRequest {
  repo: string;
  prNumber: number;
}

export interface Violation {
  id?: string;
  file?: string;
  line?: number;
  rule?: string;
  message?: string;
  severity?: string;
  suggestion?: string;
  codeSnippet?: string;
  // Backend may send these alternative field names
  path?: string;
  body?: string;
  explanation?: string;
  conventionId?: string;
  category?: string;
}

export interface ReviewResponse {
  violations?: Violation[];
  comments?: Violation[];
  summary?: string;
  score?: number;
  reviewId?: string;
  // Backend may send different field names
  feedback?: Violation[];
}

export interface ReviewHistoryItem {
  id: string;
  repository_id: string;
  pr_number: number;
  pr_title: string;
  pr_url: string;
  pr_author: string | null;
  status: "pending" | "in_progress" | "completed" | "failed";
  trigger_type: "webhook" | "manual";
  violations_count: number;
  errors_count: number;
  warnings_count: number;
  suggestions_count: number;
  score: number;
  summary: string | null;
  review_data: Record<string, unknown> | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface WebhookSetupResponse {
  webhookUrl: string;
  isActive: boolean;
  eventsReceived: number;
  lastReceivedAt: string | null;
  instructions: {
    step1: string;
    step2: string;
    step3: string;
    step4: string;
    step5: string;
    step6: string;
  };
}

export interface GitHubAppInfo {
  configured: boolean;
  installUrl: string | null;
  appSlug: string | null;
}

export interface InstalledRepository {
  repository_full_name: string;
  installation_id: number;
  is_private: boolean;
}

export interface RepoInstallStatus {
  installed: boolean;
  installationId: number | null;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

// ============================================
// API Client
// ============================================

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = endpoint.startsWith('/api') || endpoint.startsWith('/auth')
      ? `${this.baseUrl}${endpoint}`
      : `${this.baseUrl}/api${endpoint}`;

    const response = await fetch(url, {
      ...options,
      credentials: 'include', // Important for cookies/sessions
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || errorData.error || `API Error: ${response.status}`,
        response.status
      );
    }

    return response.json();
  }

  // ============================================
  // Auth Endpoints
  // ============================================

  async getCurrentUser(): Promise<User> {
    return this.request<User>('/auth/me');
  }

  async logout(): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>('/auth/logout', {
      method: 'POST',
    });
  }

  getLoginUrl(): string {
    return `${this.baseUrl}/auth/github`;
  }

  // ============================================
  // Repository Endpoints
  // ============================================

  async getRepositories(): Promise<Repository[]> {
    return this.request<Repository[]>('/auth/repositories');
  }

  async getOrganizations(): Promise<Organization[]> {
    return this.request<Organization[]>('/auth/organizations');
  }

  async getOrgRepositories(org: string): Promise<Repository[]> {
    return this.request<Repository[]>(`/auth/organizations/${encodeURIComponent(org)}/repositories`);
  }

  async verifyRepoAccess(owner: string, repo: string): Promise<{ hasAccess: boolean }> {
    return this.request<{ hasAccess: boolean }>(
      `/auth/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/verify`
    );
  }

  // ============================================
  // Convention Endpoints
  // ============================================

  async getStats(repo: string): Promise<StatsResponse> {
    return this.request<StatsResponse>(`/stats?repo=${encodeURIComponent(repo)}`);
  }

  async getConventions(repo: string): Promise<Convention[]> {
    return this.request<Convention[]>(`/conventions?repo=${encodeURIComponent(repo)}`);
  }

  async searchConventions(repo: string, query: string): Promise<Convention[]> {
    return this.request<Convention[]>(
      `/conventions/search?repo=${encodeURIComponent(repo)}&q=${encodeURIComponent(query)}`
    );
  }

  // ============================================
  // AI Endpoints
  // ============================================

  async ask(data: AskRequest): Promise<AskResponse> {
    return this.request<AskResponse>('/ask', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async review(data: ReviewRequest): Promise<ReviewResponse> {
    return this.request<ReviewResponse>('/review', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ============================================
  // Review History Endpoints
  // ============================================

  async getReviewHistory(repo: string, limit: number = 20): Promise<ReviewHistoryItem[]> {
    return this.request<ReviewHistoryItem[]>(
      `/reviews?repo=${encodeURIComponent(repo)}&limit=${limit}`
    );
  }

  async getReviewById(reviewId: string): Promise<ReviewHistoryItem> {
    return this.request<ReviewHistoryItem>(`/reviews/${encodeURIComponent(reviewId)}`);
  }

  // ============================================
  // Webhook Setup Endpoints
  // ============================================

  async getWebhookSetup(repo: string): Promise<WebhookSetupResponse> {
    return this.request<WebhookSetupResponse>(
      `/webhook/setup?repo=${encodeURIComponent(repo)}`
    );
  }

  // ============================================
  // GitHub App Endpoints
  // ============================================

  async getGitHubAppInfo(): Promise<GitHubAppInfo> {
    return this.request<GitHubAppInfo>('/github-app/info');
  }

  async getGitHubAppRepositories(): Promise<InstalledRepository[]> {
    return this.request<InstalledRepository[]>('/github-app/repositories');
  }

  async checkRepoInstalled(repo: string): Promise<RepoInstallStatus> {
    return this.request<RepoInstallStatus>(
      `/github-app/check?repo=${encodeURIComponent(repo)}`
    );
  }
}

export const apiClient = new ApiClient();
export default apiClient;
