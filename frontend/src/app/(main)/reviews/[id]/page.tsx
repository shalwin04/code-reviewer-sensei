"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
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
  FileCode,
  Wand2,
  Code,
  List,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Markdown } from "@/components/ui/markdown";
import { DiffViewer } from "@/components/review/diff-viewer";
import { FixPreviewModal } from "@/components/review/fix-preview-modal";
import apiClient, { type ReviewHistoryItem } from "@/lib/api";

// Normalized violation type
interface NormalizedViolation {
  id: string;
  file: string;
  line: number;
  rule: string;
  message: string;
  severity: string;
  suggestion?: string;
  codeSnippet?: string;
  category?: string;
  reasoning?: string;
  impact?: string;
  teamExpectation?: string;
}

// Raw violation from backend (RawViolation or ExplainedFeedback)
interface RawViolationData {
  id?: string;
  file?: string;
  path?: string;
  line?: number;
  lineNumber?: number;
  type?: string;  // Category type from RawViolation
  issue?: string; // Main message from RawViolation
  rule?: string;
  conventionId?: string;
  category?: string;
  message?: string;
  body?: string;
  explanation?: string;
  description?: string;
  severity?: string;
  suggestion?: string;
  fix?: string;
  recommendation?: string;
  codeSnippet?: string;
  code?: string;
  snippet?: string;
  reasoning?: string;
  impact?: string;
  teamExpectation?: string;
  // ExplainedFeedback wraps RawViolation
  violation?: RawViolationData;
}

// Raw data from backend
interface ReviewData {
  violations?: RawViolationData[];
  comments?: Array<{
    path: string;
    line: number;
    body: string;
  }>;
}

const statusConfig = {
  pending: { icon: Clock, color: "text-yellow-500", bg: "bg-yellow-500/10", label: "Pending" },
  in_progress: { icon: Loader2, color: "text-blue-500", bg: "bg-blue-500/10", label: "In Progress" },
  completed: { icon: CheckCircle, color: "text-green-500", bg: "bg-green-500/10", label: "Completed" },
  failed: { icon: XCircle, color: "text-red-500", bg: "bg-red-500/10", label: "Failed" },
};

const severityConfig = {
  error: { icon: AlertCircle, color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/30", borderLeft: "border-l-red-500" },
  warning: { icon: AlertTriangle, color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/30", borderLeft: "border-l-yellow-500" },
  suggestion: { icon: Lightbulb, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/30", borderLeft: "border-l-blue-500" },
  info: { icon: Lightbulb, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/30", borderLeft: "border-l-blue-500" },
};

// Normalize severity string
function normalizeSeverity(severity?: string): string {
  if (!severity) return "suggestion";
  const s = String(severity).toLowerCase();
  if (s.includes("error") || s.includes("critical")) return "error";
  if (s.includes("warn")) return "warning";
  return "suggestion";
}

// Format category/type to human readable
function formatRuleType(type?: string): string {
  if (!type) return "Convention Violation";
  // Convert kebab-case or snake_case to Title Case
  return type
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Normalize review data to consistent format
function normalizeReviewData(reviewData: ReviewData | null): NormalizedViolation[] {
  if (!reviewData) return [];

  const violations: NormalizedViolation[] = [];
  const seenKeys = new Set<string>();

  // Process violations array
  if (reviewData.violations && Array.isArray(reviewData.violations)) {
    reviewData.violations.forEach((v, index) => {
      const file = v.file || v.path || "unknown";
      const line = v.line || v.lineNumber || 0;
      const key = `${file}:${line}:${index}`;

      if (!seenKeys.has(key)) {
        seenKeys.add(key);

        // RawViolation uses 'type' for category, 'issue' for message
        // ExplainedFeedback wraps RawViolation in 'violation' field
        const rawViolation = v.violation || v;

        violations.push({
          id: v.id || rawViolation.id || `violation-${index}`,
          file: rawViolation.file || file,
          line: rawViolation.line || line,
          // Rule: use type (formatted), or category, avoid using conventionId (UUID)
          rule: formatRuleType(rawViolation.type || v.type || v.category || rawViolation.category),
          // Message: 'issue' is the main message in RawViolation, also check 'explanation'
          message: rawViolation.issue || v.issue || v.explanation || rawViolation.explanation ||
                   v.message || v.body || v.description || "No description provided",
          severity: normalizeSeverity(rawViolation.severity || v.severity),
          // Suggestion: 'recommendation' in RawViolation
          suggestion: rawViolation.recommendation || v.recommendation || v.suggestion || v.fix,
          codeSnippet: rawViolation.code || v.code || v.codeSnippet || v.snippet,
          category: rawViolation.type || v.type || v.category || rawViolation.category,
          // Additional context from ExplainedFeedback
          reasoning: rawViolation.reasoning || v.reasoning,
          impact: rawViolation.impact || v.impact,
          teamExpectation: v.teamExpectation,
        });
      }
    });
  }

  // Process comments array (from formatForGitHub)
  if (reviewData.comments && Array.isArray(reviewData.comments)) {
    reviewData.comments.forEach((c, index) => {
      const key = `comment:${c.path}:${c.line}`;

      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        violations.push({
          id: `comment-${index}`,
          file: c.path,
          line: c.line,
          rule: "Review Comment",
          message: c.body,
          severity: "suggestion",
        });
      }
    });
  }

  return violations;
}

function ViolationCard({ violation, repo }: { violation: NormalizedViolation; repo: string | null }) {
  const [showFixModal, setShowFixModal] = useState(false);
  const severity = severityConfig[violation.severity as keyof typeof severityConfig] || severityConfig.suggestion;
  const SeverityIcon = severity.icon;

  return (
    <>
      <Card className={`border-l-4 ${severity.borderLeft}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 rounded-full p-1.5 ${severity.bg}`}>
                <SeverityIcon className={`h-4 w-4 ${severity.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base">{violation.rule}</CardTitle>
                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                  <FileCode className="h-3.5 w-3.5" />
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    {violation.file}
                    {violation.line > 0 && <span className="text-primary">:{violation.line}</span>}
                  </code>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {repo && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFixModal(true)}
                  className="text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-950/50"
                >
                  <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                  Fix
                </Button>
              )}
              <Badge
                variant={violation.severity === "error" ? "destructive" : violation.severity === "warning" ? "default" : "secondary"}
                className="capitalize"
              >
                {violation.severity}
              </Badge>
            </div>
          </div>
        </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {/* Message with Markdown */}
        <div className="text-sm">
          <Markdown>{violation.message}</Markdown>
        </div>

        {/* Code Snippet */}
        {violation.codeSnippet && (
          <div className="overflow-hidden rounded-md border border-border/50 bg-muted/50">
            <div className="flex items-center justify-between border-b border-border/50 bg-muted/50 px-3 py-1.5">
              <span className="text-xs text-muted-foreground">
                {violation.line > 0 ? `Line ${violation.line}` : "Code"}
              </span>
            </div>
            <pre className="overflow-x-auto p-3">
              <code className="text-xs">{violation.codeSnippet}</code>
            </pre>
          </div>
        )}

        {/* Reasoning / Why it matters */}
        {(violation.reasoning || violation.impact) && (
          <div className="rounded-md border border-purple-500/30 bg-purple-500/5 p-3 space-y-2">
            {violation.reasoning && (
              <div>
                <span className="text-xs font-medium text-purple-600 dark:text-purple-400">Why this matters:</span>
                <p className="text-sm mt-1">{violation.reasoning}</p>
              </div>
            )}
            {violation.impact && (
              <div>
                <span className="text-xs font-medium text-purple-600 dark:text-purple-400">Impact:</span>
                <p className="text-sm mt-1">{violation.impact}</p>
              </div>
            )}
          </div>
        )}

        {/* Team Expectation */}
        {violation.teamExpectation && (
          <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3">
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Team Expectation:</span>
            <p className="text-sm mt-1">{violation.teamExpectation}</p>
          </div>
        )}

        {/* Suggestion */}
        {violation.suggestion && (
          <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-green-600 dark:text-green-400">
              <Wand2 className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Suggested Fix</span>
            </div>
            <div className="text-sm">
              <Markdown>{violation.suggestion}</Markdown>
            </div>
          </div>
        )}

        {/* Category */}
        {violation.category && (
          <Badge variant="outline" className="text-xs capitalize">
            {violation.category.replace(/[-_]/g, " ")}
          </Badge>
        )}
      </CardContent>
    </Card>

      {/* Fix Preview Modal */}
      {repo && (
        <FixPreviewModal
          isOpen={showFixModal}
          onClose={() => setShowFixModal(false)}
          violation={{
            file: violation.file,
            line: violation.line,
            message: violation.message,
            suggestion: violation.suggestion,
            codeSnippet: violation.codeSnippet,
          }}
          repo={repo}
        />
      )}
    </>
  );
}

function ReviewDetailsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-32" />
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    </div>
  );
}

export default function ReviewDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const reviewId = params.id as string;
  const [activeTab, setActiveTab] = useState("issues");

  const { data: review, isLoading, error } = useQuery({
    queryKey: ["review", reviewId],
    queryFn: () => apiClient.getReviewById(reviewId),
    enabled: !!reviewId,
    // Poll every 3 seconds if review is pending or in progress
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === "pending" || data?.status === "in_progress") {
        return 3000;
      }
      return false;
    },
  });

  // Extract repo info from pr_url for fetching diff
  const getRepoFromUrl = (url: string): string | null => {
    const match = url.match(/github\.com\/([^/]+\/[^/]+)\/pull/);
    return match ? match[1] : null;
  };

  const repoFullName = review?.pr_url ? getRepoFromUrl(review.pr_url) : null;

  const { data: prDiff, isLoading: diffLoading } = useQuery({
    queryKey: ["pr-diff", repoFullName, review?.pr_number],
    queryFn: () => apiClient.getPRDiff(repoFullName!, review!.pr_number),
    enabled: !!repoFullName && !!review?.pr_number && activeTab === "diff",
  });

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <ReviewDetailsSkeleton />
      </div>
    );
  }

  if (error || !review) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <XCircle className="h-12 w-12 text-destructive" />
            <h3 className="mt-4 text-lg font-medium">Review not found</h3>
            <p className="text-sm text-muted-foreground">
              This review may have been deleted or you don't have access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const status = statusConfig[review.status] || statusConfig.pending;
  const StatusIcon = status.icon;

  // Normalize the review data
  const violations = normalizeReviewData(review.review_data as ReviewData | null);

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="ghost" size="sm" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Reviews
      </Button>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className={`rounded-full p-3 ${status.bg}`}>
            <StatusIcon className={`h-6 w-6 ${status.color} ${review.status === "in_progress" ? "animate-spin" : ""}`} />
          </div>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GitPullRequest className="h-6 w-6 text-muted-foreground" />
              PR #{review.pr_number}
            </h1>
            <p className="text-lg text-muted-foreground mt-1">{review.pr_title}</p>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
              {review.pr_author && (
                <span className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  {review.pr_author}
                </span>
              )}
              <span className="flex items-center gap-1">
                {review.trigger_type === "webhook" ? (
                  <>
                    <Webhook className="h-4 w-4" />
                    Automatic Review
                  </>
                ) : (
                  <>
                    <User className="h-4 w-4" />
                    Manual Review
                  </>
                )}
              </span>
              <span>
                {format(new Date(review.created_at), "MMM d, yyyy 'at' h:mm a")}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={status.color}>
            {status.label}
          </Badge>
          <Button variant="outline" asChild>
            <a href={review.pr_url} target="_blank" rel="noopener noreferrer">
              View on GitHub
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>

      {/* In Progress Indicator */}
      {(review.status === "pending" || review.status === "in_progress") && (
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="flex items-center gap-4 py-6">
            <div className="relative">
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
              <div className="absolute inset-0 h-8 w-8 rounded-full border-2 border-blue-500/20" />
            </div>
            <div>
              <h3 className="font-medium text-blue-600 dark:text-blue-400">
                {review.status === "pending" ? "Review Queued" : "Review in Progress"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {review.status === "pending"
                  ? "Your review is queued and will start shortly..."
                  : "Analyzing code against your conventions..."}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                This page will update automatically when complete.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {review.status === "completed" && (
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Score</CardDescription>
              <CardTitle className={`text-3xl ${getScoreColor(review.score)}`}>
                {review.score}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Issues</CardDescription>
              <CardTitle className="text-2xl">{review.violations_count}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-red-500/20">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <AlertCircle className="h-3 w-3 text-red-500" />
                Errors
              </CardDescription>
              <CardTitle className="text-2xl text-red-500">{review.errors_count}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-yellow-500/20">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-yellow-500" />
                Warnings
              </CardDescription>
              <CardTitle className="text-2xl text-yellow-500">{review.warnings_count}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-blue-500/20">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <Lightbulb className="h-3 w-3 text-blue-500" />
                Suggestions
              </CardDescription>
              <CardTitle className="text-2xl text-blue-500">{review.suggestions_count}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Summary */}
      {review.summary && (
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <Markdown>{review.summary}</Markdown>
          </CardContent>
        </Card>
      )}

      {/* Tabs for Issues and Diff */}
      {review.status === "completed" && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="issues" className="flex items-center gap-2">
              <List className="h-4 w-4" />
              Issues ({violations.length})
            </TabsTrigger>
            <TabsTrigger value="diff" className="flex items-center gap-2">
              <Code className="h-4 w-4" />
              Diff
            </TabsTrigger>
          </TabsList>

          <TabsContent value="issues" className="mt-6">
            {violations.length > 0 ? (
              <div className="space-y-4">
                {violations.map((violation) => (
                  <ViolationCard key={violation.id} violation={violation} repo={repoFullName} />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <CheckCircle className="h-12 w-12 text-green-500" />
                  <h3 className="mt-4 text-lg font-medium">No issues found</h3>
                  <p className="text-sm text-muted-foreground">
                    This PR passed all convention checks.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="diff" className="mt-6">
            <DiffViewer
              files={prDiff?.files || []}
              violations={violations.map((v) => ({
                file: v.file,
                line: v.line,
                message: v.message,
                severity: v.severity,
              }))}
              isLoading={diffLoading}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* Timestamps */}
      <Separator />
      <div className="flex items-center gap-6 text-xs text-muted-foreground flex-wrap">
        <span>Created: {format(new Date(review.created_at), "PPpp")}</span>
        {review.started_at && (
          <span>Started: {format(new Date(review.started_at), "PPpp")}</span>
        )}
        {review.completed_at && (
          <span>Completed: {format(new Date(review.completed_at), "PPpp")}</span>
        )}
      </div>
    </div>
  );
}
