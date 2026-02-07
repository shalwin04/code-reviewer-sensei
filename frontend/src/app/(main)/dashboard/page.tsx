"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { RepoSelector } from "@/components/dashboard/repo-selector";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { ReviewCharts } from "@/components/dashboard/review-charts";
import { useAuth } from "@/lib/auth-context";
import apiClient, { ApiError } from "@/lib/api";
import { toast } from "sonner";

export default function DashboardPage() {
  const { selectedRepo, user } = useAuth();

  const { data: stats, isLoading, error } = useQuery({
    queryKey: ["stats", selectedRepo],
    queryFn: async () => {
      if (!selectedRepo) return null;
      try {
        const data = await apiClient.getStats(selectedRepo);
        // Normalize backend response to frontend format
        return {
          totalConventions: data.totalConventions ?? data.conventions ?? 0,
          byCategory: data.byCategory ?? {},
          bySeverity: data.bySeverity ?? {},
          recentActivity: data.recentActivity ?? [],
        };
      } catch (err) {
        // Return empty stats on error to avoid breaking the UI
        if (err instanceof ApiError && err.status === 404) {
          return {
            totalConventions: 0,
            byCategory: {},
            bySeverity: {},
            recentActivity: [],
          };
        }
        throw err;
      }
    },
    enabled: !!selectedRepo,
    retry: false,
  });

  // Fetch review history for charts
  const { data: reviews, isLoading: reviewsLoading } = useQuery({
    queryKey: ["reviews-dashboard", selectedRepo],
    queryFn: async () => {
      if (!selectedRepo) return [];
      try {
        return await apiClient.getReviewHistory(selectedRepo, 50);
      } catch {
        return [];
      }
    },
    enabled: !!selectedRepo,
    retry: false,
  });

  // Show error toast if API fails (in useEffect to avoid render-time side effects)
  useEffect(() => {
    if (error) {
      toast.error("Failed to load stats. Backend may be offline or repo not yet analyzed.");
    }
  }, [error]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {user?.displayName || user?.username}
          </p>
        </div>
        <RepoSelector />
      </div>

      {!selectedRepo ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            Select a repository to view conventions and stats
          </p>
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <StatsCards
            stats={stats ? {
              totalConventions: stats.totalConventions ?? 0,
              byCategory: stats.byCategory ?? {},
              bySeverity: stats.bySeverity ?? {},
            } : null}
            isLoading={isLoading}
          />

          {/* Activity & Quick Actions */}
          <div className="grid gap-6 lg:grid-cols-2">
            <ActivityFeed
              activities={stats?.recentActivity ?? []}
              isLoading={isLoading}
            />
            <QuickActions />
          </div>

          {/* Review Charts */}
          <ReviewCharts reviews={reviews || []} isLoading={reviewsLoading} />

          {/* Category Breakdown */}
          {stats?.byCategory && Object.keys(stats.byCategory).length > 0 && (
            <div className="rounded-lg border border-border/40 bg-card p-6">
              <h2 className="mb-4 text-lg font-semibold">Conventions by Category</h2>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                {Object.entries(stats.byCategory).map(([category, count]) => (
                  <div
                    key={category}
                    className="rounded-lg bg-muted/50 p-4 text-center"
                  >
                    <div className="text-2xl font-bold">{count}</div>
                    <div className="text-sm capitalize text-muted-foreground">
                      {category}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
