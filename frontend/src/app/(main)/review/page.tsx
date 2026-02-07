"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle, AlertCircle, AlertTriangle, Lightbulb, BarChart3, Loader2 } from "lucide-react";
import { ReviewForm } from "@/components/review/review-form";
import { ViolationCard } from "@/components/review/violation-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Markdown } from "@/components/ui/markdown";
import { useAuth } from "@/lib/auth-context";
import apiClient, { type Violation, ApiError } from "@/lib/api";

interface NormalizedReviewResult {
  violations: Violation[];
  summary: string;
  score: number;
}

// Normalize the backend response to a consistent format
function normalizeReviewResponse(data: any): NormalizedReviewResult {
  // Handle different response formats from backend
  let violations: Violation[] = [];

  // Try different field names the backend might use
  const rawViolations = data.violations || data.comments || data.feedback || [];

  violations = rawViolations.map((v: any, index: number) => ({
    id: v.id || `violation-${index}`,
    file: v.file || v.path || "unknown",
    line: v.line || v.lineNumber || 0,
    rule: v.rule || v.conventionId || v.category || "Convention Violation",
    message: v.message || v.body || v.explanation || v.description || "No description",
    severity: normalizeSeverity(v.severity),
    suggestion: v.suggestion || v.fix || v.recommendation,
    codeSnippet: v.codeSnippet || v.code || v.snippet,
  }));

  // Calculate score if not provided
  let score = data.score;
  if (score === undefined) {
    const errorCount = violations.filter(v => v.severity === "error").length;
    const warningCount = violations.filter(v => v.severity === "warning").length;
    score = Math.max(0, 100 - (errorCount * 10) - (warningCount * 5));
  }

  return {
    violations,
    summary: data.summary || `Found ${violations.length} issue(s) in this PR.`,
    score,
  };
}

function normalizeSeverity(severity: any): string {
  if (!severity) return "suggestion";
  const s = String(severity).toLowerCase();
  if (s.includes("error") || s.includes("critical")) return "error";
  if (s.includes("warn")) return "warning";
  return "suggestion";
}

export default function ReviewPage() {
  const { selectedRepo } = useAuth();
  const queryClient = useQueryClient();
  const [reviewResult, setReviewResult] = useState<NormalizedReviewResult | null>(null);

  const reviewMutation = useMutation({
    mutationFn: async ({ repo, prNumber }: { repo: string; prNumber: number }) => {
      const response = await apiClient.review({ repo, prNumber });
      return normalizeReviewResponse(response);
    },
    onSuccess: (data) => {
      setReviewResult(data);
      toast.success("Review completed successfully");
      // Invalidate cache to refresh dashboard and reviews list
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
      queryClient.invalidateQueries({ queryKey: ["reviews-dashboard"] });
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        if (error.status === 401) {
          toast.error("Please sign in to review PRs");
        } else {
          toast.error(error.message);
        }
      } else {
        toast.error("Failed to review PR. Please try again.");
      }
    },
  });

  const handleSubmit = (repo: string, prNumber: number) => {
    setReviewResult(null);
    reviewMutation.mutate({ repo, prNumber });
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return "Good";
    if (score >= 60) return "Needs Work";
    return "Needs Attention";
  };

  const countBySeverity = (violations: Violation[]) => ({
    error: violations.filter((v) => v.severity === "error").length,
    warning: violations.filter((v) => v.severity === "warning").length,
    suggestion: violations.filter((v) => v.severity === "suggestion" || !v.severity).length,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">PR Review</h1>
        <p className="text-muted-foreground">
          Review pull requests against your codebase conventions
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        {/* Review Form */}
        <div>
          <ReviewForm
            onSubmit={handleSubmit}
            isLoading={reviewMutation.isPending}
            defaultRepo={selectedRepo || ""}
          />
        </div>

        {/* Results */}
        <div className="space-y-6">
          {reviewMutation.isPending && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-4 text-muted-foreground">
                  Analyzing PR against your conventions...
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  This may take a moment
                </p>
              </CardContent>
            </Card>
          )}

          {reviewResult && !reviewMutation.isPending && (
            <>
              {/* Score Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Review Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6 sm:grid-cols-2">
                    {/* Score */}
                    <div className="text-center">
                      <div
                        className={`text-5xl font-bold ${getScoreColor(
                          reviewResult.score
                        )}`}
                      >
                        {reviewResult.score}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Code Quality Score
                      </p>
                      <Badge
                        variant={
                          reviewResult.score >= 80
                            ? "default"
                            : reviewResult.score >= 60
                            ? "secondary"
                            : "destructive"
                        }
                        className="mt-2"
                      >
                        {getScoreLabel(reviewResult.score)}
                      </Badge>
                    </div>

                    {/* Breakdown */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium">Issues Found</h4>
                      {(() => {
                        const counts = countBySeverity(reviewResult.violations);
                        return (
                          <>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 text-red-500" />
                                <span className="text-sm">Errors</span>
                              </div>
                              <Badge variant="destructive">{counts.error}</Badge>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                <span className="text-sm">Warnings</span>
                              </div>
                              <Badge variant="secondary">{counts.warning}</Badge>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Lightbulb className="h-4 w-4 text-blue-500" />
                                <span className="text-sm">Suggestions</span>
                              </div>
                              <Badge variant="outline">{counts.suggestion}</Badge>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  <Separator className="my-4" />

                  <div>
                    <h4 className="mb-2 text-sm font-medium">Summary</h4>
                    <div className="text-sm text-muted-foreground">
                      <Markdown>{reviewResult.summary}</Markdown>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Violations */}
              {reviewResult.violations.length > 0 ? (
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold">
                    Issues ({reviewResult.violations.length})
                  </h2>
                  {reviewResult.violations.map((violation, index) => (
                    <ViolationCard key={violation.id || index} violation={violation} />
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <CheckCircle className="h-12 w-12 text-green-500" />
                    <h3 className="mt-4 text-lg font-medium">No Issues Found</h3>
                    <p className="text-sm text-muted-foreground">
                      This PR follows all the codebase conventions
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {!reviewResult && !reviewMutation.isPending && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground">
                  Enter a repository and PR number to start reviewing
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
