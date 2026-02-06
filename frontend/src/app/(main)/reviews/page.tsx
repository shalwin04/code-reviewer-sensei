"use client";

import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  AlertTriangle,
  Lightbulb,
  ExternalLink,
  GitPullRequest,
  Webhook,
  User,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RepoSelector } from "@/components/dashboard/repo-selector";
import { useAuth } from "@/lib/auth-context";
import apiClient, { type ReviewHistoryItem } from "@/lib/api";

const statusConfig = {
  pending: { icon: Clock, color: "text-yellow-500", bg: "bg-yellow-500/10", label: "Pending" },
  in_progress: { icon: Loader2, color: "text-blue-500", bg: "bg-blue-500/10", label: "In Progress" },
  completed: { icon: CheckCircle, color: "text-green-500", bg: "bg-green-500/10", label: "Completed" },
  failed: { icon: XCircle, color: "text-red-500", bg: "bg-red-500/10", label: "Failed" },
};

function ReviewCard({ review }: { review: ReviewHistoryItem }) {
  const status = statusConfig[review.status] || statusConfig.pending;
  const StatusIcon = status.icon;

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`mt-1 rounded-full p-2 ${status.bg}`}>
              <StatusIcon className={`h-4 w-4 ${status.color} ${review.status === "in_progress" ? "animate-spin" : ""}`} />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base flex items-center gap-2">
                <GitPullRequest className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="truncate">PR #{review.pr_number}: {review.pr_title}</span>
              </CardTitle>
              <CardDescription className="mt-1 flex items-center gap-3 flex-wrap">
                {review.pr_author && (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {review.pr_author}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  {review.trigger_type === "webhook" ? (
                    <>
                      <Webhook className="h-3 w-3" />
                      Auto
                    </>
                  ) : (
                    <>
                      <User className="h-3 w-3" />
                      Manual
                    </>
                  )}
                </span>
                <span>
                  {formatDistanceToNow(new Date(review.created_at), { addSuffix: true })}
                </span>
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant="outline" className={status.color}>
              {status.label}
            </Badge>
            {review.status === "completed" && (
              <div className={`text-2xl font-bold ${getScoreColor(review.score)}`}>
                {review.score}
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      {review.status === "completed" && (
        <CardContent className="pt-0">
          <div className="flex items-center gap-6 text-sm">
            {review.errors_count > 0 && (
              <div className="flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <span>{review.errors_count} errors</span>
              </div>
            )}
            {review.warnings_count > 0 && (
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <span>{review.warnings_count} warnings</span>
              </div>
            )}
            {review.suggestions_count > 0 && (
              <div className="flex items-center gap-1.5">
                <Lightbulb className="h-4 w-4 text-blue-500" />
                <span>{review.suggestions_count} suggestions</span>
              </div>
            )}
            {review.violations_count === 0 && (
              <div className="flex items-center gap-1.5 text-green-500">
                <CheckCircle className="h-4 w-4" />
                <span>No issues found</span>
              </div>
            )}
            <div className="ml-auto">
              <Button variant="ghost" size="sm" asChild>
                <a href={review.pr_url} target="_blank" rel="noopener noreferrer">
                  View PR
                  <ExternalLink className="ml-1 h-3 w-3" />
                </a>
              </Button>
            </div>
          </div>
          {review.summary && (
            <p className="mt-3 text-sm text-muted-foreground line-clamp-2">
              {review.summary}
            </p>
          )}
        </CardContent>
      )}
      {review.status === "failed" && review.summary && (
        <CardContent className="pt-0">
          <p className="text-sm text-destructive">{review.summary}</p>
        </CardContent>
      )}
    </Card>
  );
}

function ReviewHistorySkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <Skeleton className="h-6 w-20" />
            </div>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function ReviewsPage() {
  const { selectedRepo } = useAuth();

  const { data: reviews, isLoading, error } = useQuery({
    queryKey: ["reviews", selectedRepo],
    queryFn: async () => {
      if (!selectedRepo) return [];
      return apiClient.getReviewHistory(selectedRepo);
    },
    enabled: !!selectedRepo,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const completedReviews = reviews?.filter((r) => r.status === "completed") || [];
  const avgScore = completedReviews.length > 0
    ? Math.round(completedReviews.reduce((sum, r) => sum + r.score, 0) / completedReviews.length)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Review History</h1>
          <p className="text-muted-foreground">
            Track all PR reviews for your repository
          </p>
        </div>
        <RepoSelector />
      </div>

      {!selectedRepo ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            Select a repository to view review history
          </p>
        </div>
      ) : (
        <>
          {/* Stats */}
          {!isLoading && reviews && reviews.length > 0 && (
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Reviews</CardDescription>
                  <CardTitle className="text-2xl">{reviews.length}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Webhook Triggered</CardDescription>
                  <CardTitle className="text-2xl">
                    {reviews.filter((r) => r.trigger_type === "webhook").length}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Average Score</CardDescription>
                  <CardTitle className={`text-2xl ${avgScore >= 80 ? "text-green-500" : avgScore >= 60 ? "text-yellow-500" : "text-red-500"}`}>
                    {avgScore}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Issues Found</CardDescription>
                  <CardTitle className="text-2xl">
                    {reviews.reduce((sum, r) => sum + r.violations_count, 0)}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>
          )}

          {/* Review List */}
          {isLoading ? (
            <ReviewHistorySkeleton />
          ) : error ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <XCircle className="h-12 w-12 text-destructive" />
                <h3 className="mt-4 text-lg font-medium">Failed to load reviews</h3>
                <p className="text-sm text-muted-foreground">
                  Make sure the backend is running and you have access to this repository.
                </p>
              </CardContent>
            </Card>
          ) : reviews && reviews.length > 0 ? (
            <div className="space-y-4">
              {reviews.map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <GitPullRequest className="h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-medium">No reviews yet</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  Reviews will appear here when PRs are reviewed. Set up a webhook for automatic reviews or manually review a PR.
                </p>
                <Button className="mt-4" asChild>
                  <a href="/review">Review a PR</a>
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
