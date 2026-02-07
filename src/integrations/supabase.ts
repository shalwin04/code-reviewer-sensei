import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config/index.js";

// ============================================
// Supabase Client Singleton
// ============================================

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const url = config.supabase.url;
    const key = config.supabase.serviceKey || config.supabase.anonKey;

    if (!url || !key) {
      throw new Error(
        "Supabase configuration missing. Please set SUPABASE_URL and SUPABASE_ANON_KEY in .env"
      );
    }

    supabaseClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return supabaseClient;
}

// ============================================
// Database Types
// ============================================

export interface DbRepository {
  id: string;
  name: string;
  full_name: string;
  platform: string;
  external_id: string | null;
  default_branch: string;
  description: string | null;
  primary_language: string | null;
  created_at: string;
  updated_at: string;
  last_learned_at: string | null;
}

export interface DbConvention {
  id: string;
  repository_id: string;
  learning_run_id: string | null;
  category: string;
  rule: string;
  description: string | null;
  severity: string;
  confidence: number;
  source_type: string;
  source_reference: string | null;
  tags: string[];
  applies_to: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbConventionExample {
  id: string;
  convention_id: string;
  example_type: "good" | "bad";
  code: string;
  explanation: string | null;
  file_reference: string | null;
  created_at: string;
}

export interface DbLearningRun {
  id: string;
  repository_id: string;
  started_at: string;
  completed_at: string | null;
  status: "running" | "completed" | "failed";
  sources_summary: Record<string, number>;
  conventions_found: number;
  conventions_added: number;
  error_message: string | null;
}

// ============================================
// Type for convention with examples joined
// ============================================

export interface DbConventionWithExamples extends DbConvention {
  convention_examples?: DbConventionExample[];
}

// ============================================
// Review History Types
// ============================================

export interface DbReviewHistory {
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
  github_review_id: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface DbWebhookRegistration {
  id: string;
  repository_id: string;
  webhook_secret: string;
  is_active: boolean;
  github_webhook_id: string | null;
  last_received_at: string | null;
  events_received: number;
  created_at: string;
  updated_at: string;
}

// ============================================
// Review History Functions
// ============================================

export async function createReviewHistory(
  repositoryFullName: string,
  prNumber: number,
  prTitle: string,
  prAuthor: string | null,
  triggerType: "webhook" | "manual"
): Promise<DbReviewHistory | null> {
  const supabase = getSupabaseClient();

  // First get or create repository
  let { data: repo } = await supabase
    .from("repositories")
    .select("id")
    .eq("full_name", repositoryFullName)
    .single();

  if (!repo) {
    // Create repository if it doesn't exist
    const name = repositoryFullName.split("/")[1] || repositoryFullName;
    const { data: newRepo } = await supabase
      .from("repositories")
      .insert({
        name,
        full_name: repositoryFullName,
        platform: "github",
        default_branch: "main",
      })
      .select("id")
      .single();
    repo = newRepo;
  }

  if (!repo) return null;

  const prUrl = `https://github.com/${repositoryFullName}/pull/${prNumber}`;

  const { data, error } = await supabase
    .from("review_history")
    .insert({
      repository_id: repo.id,
      pr_number: prNumber,
      pr_title: prTitle,
      pr_url: prUrl,
      pr_author: prAuthor,
      status: "pending",
      trigger_type: triggerType,
      violations_count: 0,
      errors_count: 0,
      warnings_count: 0,
      suggestions_count: 0,
      score: 100,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create review history:", error);
    return null;
  }

  return data;
}

export async function updateReviewHistory(
  reviewId: string,
  updates: {
    status?: DbReviewHistory["status"];
    violations_count?: number;
    errors_count?: number;
    warnings_count?: number;
    suggestions_count?: number;
    score?: number;
    summary?: string;
    review_data?: Record<string, unknown>;
    github_review_id?: string;
    completed_at?: string;
  }
): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from("review_history")
    .update(updates)
    .eq("id", reviewId);

  if (error) {
    console.error("Failed to update review history:", error);
  }
}

export async function getReviewHistory(
  repositoryFullName: string,
  limit: number = 20
): Promise<DbReviewHistory[]> {
  const supabase = getSupabaseClient();

  const { data: repo } = await supabase
    .from("repositories")
    .select("id")
    .eq("full_name", repositoryFullName)
    .single();

  if (!repo) return [];

  const { data, error } = await supabase
    .from("review_history")
    .select("*")
    .eq("repository_id", repo.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to get review history:", error);
    return [];
  }

  return data || [];
}

export async function getReviewById(reviewId: string): Promise<DbReviewHistory | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("review_history")
    .select("*")
    .eq("id", reviewId)
    .single();

  if (error) {
    console.error("Failed to get review:", error);
    return null;
  }

  return data;
}

// ============================================
// Webhook Registration Functions
// ============================================

export async function getOrCreateWebhookRegistration(
  repositoryFullName: string
): Promise<DbWebhookRegistration | null> {
  const supabase = getSupabaseClient();

  // Get repository
  const { data: repo } = await supabase
    .from("repositories")
    .select("id")
    .eq("full_name", repositoryFullName)
    .single();

  if (!repo) return null;

  // Check for existing registration
  const { data: existing } = await supabase
    .from("webhook_registrations")
    .select("*")
    .eq("repository_id", repo.id)
    .single();

  if (existing) return existing;

  // Create new registration with unique secret
  const webhookSecret = crypto.randomUUID() + "-" + Date.now().toString(36);

  const { data, error } = await supabase
    .from("webhook_registrations")
    .insert({
      repository_id: repo.id,
      webhook_secret: webhookSecret,
      is_active: true,
      events_received: 0,
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create webhook registration:", error);
    return null;
  }

  return data;
}

export async function validateWebhookSecret(
  repositoryFullName: string,
  secret: string
): Promise<boolean> {
  const supabase = getSupabaseClient();

  const { data: repo } = await supabase
    .from("repositories")
    .select("id")
    .eq("full_name", repositoryFullName)
    .single();

  if (!repo) return false;

  const { data } = await supabase
    .from("webhook_registrations")
    .select("webhook_secret, is_active")
    .eq("repository_id", repo.id)
    .single();

  return data?.is_active && data?.webhook_secret === secret;
}

export async function recordWebhookReceived(repositoryFullName: string): Promise<void> {
  const supabase = getSupabaseClient();

  const { data: repo } = await supabase
    .from("repositories")
    .select("id")
    .eq("full_name", repositoryFullName)
    .single();

  if (!repo) return;

  await supabase.rpc("increment_webhook_events", { repo_id: repo.id });
}

// ============================================
// Leaderboard & Gamification Types
// ============================================

export interface LeaderboardEntry {
  rank: number;
  author: string;
  totalReviews: number;
  avgScore: number;
  totalIssuesFixed: number;
  totalErrors: number;
  totalWarnings: number;
  streak: number;
  badges: string[];
  points: number;
}

export interface UserStats {
  author: string;
  totalReviews: number;
  avgScore: number;
  totalErrors: number;
  totalWarnings: number;
  totalSuggestions: number;
  improvementRate: number; // Percentage improvement over last 5 reviews
  recentReviews: {
    prNumber: number;
    prTitle: string;
    score: number;
    date: string;
  }[];
  badges: string[];
  points: number;
}

// ============================================
// Badge Definitions
// ============================================

const BADGES = {
  first_review: { name: "First Steps", description: "Completed your first PR review", icon: "🎯", points: 10 },
  five_reviews: { name: "Getting Started", description: "Completed 5 PR reviews", icon: "⭐", points: 25 },
  ten_reviews: { name: "Reviewer", description: "Completed 10 PR reviews", icon: "🌟", points: 50 },
  twenty_five_reviews: { name: "Senior Reviewer", description: "Completed 25 PR reviews", icon: "💫", points: 100 },
  fifty_reviews: { name: "Expert Reviewer", description: "Completed 50 PR reviews", icon: "🏆", points: 200 },
  perfect_score: { name: "Perfect 100", description: "Got a perfect score on a PR", icon: "💯", points: 50 },
  streak_3: { name: "On a Roll", description: "3-day review streak", icon: "🔥", points: 30 },
  streak_7: { name: "Week Warrior", description: "7-day review streak", icon: "⚡", points: 75 },
  zero_errors: { name: "Clean Code", description: "10 reviews with zero errors", icon: "✨", points: 100 },
  fixer: { name: "Bug Fixer", description: "Fixed 50 issues total", icon: "🔧", points: 75 },
};

// ============================================
// Leaderboard Functions
// ============================================

export async function getLeaderboard(
  repositoryFullName: string,
  timeframe: "all" | "week" | "month" = "all"
): Promise<LeaderboardEntry[]> {
  const supabase = getSupabaseClient();

  // Get repository ID
  const { data: repo } = await supabase
    .from("repositories")
    .select("id")
    .eq("full_name", repositoryFullName)
    .single();

  if (!repo) return [];

  // Build query with timeframe filter
  let query = supabase
    .from("review_history")
    .select("pr_author, score, errors_count, warnings_count, suggestions_count, created_at, status")
    .eq("repository_id", repo.id)
    .eq("status", "completed")
    .not("pr_author", "is", null);

  // Apply timeframe filter
  if (timeframe === "week") {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    query = query.gte("created_at", weekAgo.toISOString());
  } else if (timeframe === "month") {
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    query = query.gte("created_at", monthAgo.toISOString());
  }

  const { data: reviews, error } = await query;

  if (error || !reviews) {
    console.error("Failed to get leaderboard data:", error);
    return [];
  }

  // Aggregate by author
  const authorStats = new Map<string, {
    totalReviews: number;
    totalScore: number;
    totalErrors: number;
    totalWarnings: number;
    totalSuggestions: number;
    reviewDates: string[];
  }>();

  for (const review of reviews) {
    const author = review.pr_author;
    if (!author) continue;

    const existing = authorStats.get(author) || {
      totalReviews: 0,
      totalScore: 0,
      totalErrors: 0,
      totalWarnings: 0,
      totalSuggestions: 0,
      reviewDates: [],
    };

    existing.totalReviews++;
    existing.totalScore += review.score || 0;
    existing.totalErrors += review.errors_count || 0;
    existing.totalWarnings += review.warnings_count || 0;
    existing.totalSuggestions += review.suggestions_count || 0;
    existing.reviewDates.push(review.created_at);

    authorStats.set(author, existing);
  }

  // Calculate entries with badges and points
  const entries: LeaderboardEntry[] = [];

  for (const [author, stats] of authorStats) {
    const avgScore = stats.totalReviews > 0 ? Math.round(stats.totalScore / stats.totalReviews) : 0;
    const totalIssuesFixed = stats.totalErrors + stats.totalWarnings + stats.totalSuggestions;

    // Calculate streak
    const streak = calculateStreak(stats.reviewDates);

    // Calculate badges
    const badges = calculateBadges(stats.totalReviews, avgScore, streak, stats.totalErrors, totalIssuesFixed);

    // Calculate points
    const points = calculatePoints(stats.totalReviews, avgScore, streak, badges);

    entries.push({
      rank: 0, // Will be set after sorting
      author,
      totalReviews: stats.totalReviews,
      avgScore,
      totalIssuesFixed,
      totalErrors: stats.totalErrors,
      totalWarnings: stats.totalWarnings,
      streak,
      badges,
      points,
    });
  }

  // Sort by points descending
  entries.sort((a, b) => b.points - a.points);

  // Assign ranks
  entries.forEach((entry, index) => {
    entry.rank = index + 1;
  });

  return entries;
}

function calculateStreak(reviewDates: string[]): number {
  if (reviewDates.length === 0) return 0;

  const sortedDates = reviewDates
    .map((d) => new Date(d).toDateString())
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  // Remove duplicates (same day)
  const uniqueDays = [...new Set(sortedDates)];

  let streak = 1;
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  // Check if most recent review is today or yesterday
  if (uniqueDays[0] !== today && uniqueDays[0] !== yesterday) {
    return 0; // Streak broken
  }

  for (let i = 1; i < uniqueDays.length; i++) {
    const current = new Date(uniqueDays[i - 1]);
    const previous = new Date(uniqueDays[i]);
    const diffDays = (current.getTime() - previous.getTime()) / 86400000;

    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

function calculateBadges(
  totalReviews: number,
  avgScore: number,
  streak: number,
  totalErrors: number,
  totalIssuesFixed: number
): string[] {
  const badges: string[] = [];

  if (totalReviews >= 1) badges.push("first_review");
  if (totalReviews >= 5) badges.push("five_reviews");
  if (totalReviews >= 10) badges.push("ten_reviews");
  if (totalReviews >= 25) badges.push("twenty_five_reviews");
  if (totalReviews >= 50) badges.push("fifty_reviews");
  if (avgScore === 100) badges.push("perfect_score");
  if (streak >= 3) badges.push("streak_3");
  if (streak >= 7) badges.push("streak_7");
  if (totalReviews >= 10 && totalErrors === 0) badges.push("zero_errors");
  if (totalIssuesFixed >= 50) badges.push("fixer");

  return badges;
}

function calculatePoints(
  totalReviews: number,
  avgScore: number,
  streak: number,
  badges: string[]
): number {
  let points = 0;

  // Base points per review
  points += totalReviews * 10;

  // Bonus for high average score
  if (avgScore >= 90) points += totalReviews * 5;
  if (avgScore >= 95) points += totalReviews * 3;
  if (avgScore === 100) points += totalReviews * 2;

  // Streak bonus
  points += streak * 5;

  // Badge points
  for (const badge of badges) {
    const badgeInfo = BADGES[badge as keyof typeof BADGES];
    if (badgeInfo) {
      points += badgeInfo.points;
    }
  }

  return points;
}

export function getBadgeInfo(badgeId: string): { name: string; description: string; icon: string; points: number } | null {
  return BADGES[badgeId as keyof typeof BADGES] || null;
}

export function getAllBadges(): { id: string; name: string; description: string; icon: string; points: number }[] {
  return Object.entries(BADGES).map(([id, info]) => ({ id, ...info }));
}
