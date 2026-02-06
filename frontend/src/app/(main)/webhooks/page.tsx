"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Webhook,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  Shield,
  GitBranch,
  Zap,
  Lock,
  Unlock,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RepoSelector } from "@/components/dashboard/repo-selector";
import { useAuth } from "@/lib/auth-context";
import apiClient from "@/lib/api";

export default function WebhooksPage() {
  const { selectedRepo, isAuthenticated } = useAuth();

  // Get GitHub App info
  const { data: appInfo, isLoading: appLoading } = useQuery({
    queryKey: ["github-app-info"],
    queryFn: () => apiClient.getGitHubAppInfo(),
    enabled: isAuthenticated,
  });

  // Get installed repositories
  const { data: installedRepos, isLoading: reposLoading } = useQuery({
    queryKey: ["github-app-repositories"],
    queryFn: () => apiClient.getGitHubAppRepositories(),
    enabled: isAuthenticated && appInfo?.configured,
  });

  // Check if selected repo is installed
  const { data: repoStatus, isLoading: statusLoading } = useQuery({
    queryKey: ["github-app-check", selectedRepo],
    queryFn: () => apiClient.checkRepoInstalled(selectedRepo!),
    enabled: !!selectedRepo && isAuthenticated && appInfo?.configured,
  });

  const isLoading = appLoading || reposLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Automatic Reviews</h1>
          <p className="text-muted-foreground">
            Install our GitHub App to enable automatic PR reviews
          </p>
        </div>
        <RepoSelector />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-72" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        </div>
      ) : !appInfo?.configured ? (
        // GitHub App not configured on backend
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-yellow-500" />
            <h3 className="mt-4 text-lg font-medium">GitHub App Not Configured</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md mt-2">
              The GitHub App integration is not configured on this server.
              Please contact the administrator to set up the GitHub App for automatic PR reviews.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Installation Status Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    GitHub App Installation
                  </CardTitle>
                  <CardDescription>
                    Install the AI Code Reviewer app on your repositories
                  </CardDescription>
                </div>
                {selectedRepo && !statusLoading && (
                  <Badge variant={repoStatus?.installed ? "default" : "secondary"}>
                    {repoStatus?.installed ? (
                      <>
                        <CheckCircle className="mr-1 h-3 w-3" />
                        Installed
                      </>
                    ) : (
                      <>
                        <Clock className="mr-1 h-3 w-3" />
                        Not Installed
                      </>
                    )}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {selectedRepo ? (
                repoStatus?.installed ? (
                  <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-4">
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                      <CheckCircle className="h-5 w-5" />
                      <span className="font-medium">
                        Automatic reviews are enabled for {selectedRepo}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      When a pull request is opened or updated, we'll automatically review it
                      against your team's coding conventions.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
                      <p className="text-sm text-muted-foreground">
                        The GitHub App is not installed for <strong>{selectedRepo}</strong>.
                        Install it to enable automatic PR reviews.
                      </p>
                    </div>
                    <Button asChild>
                      <a
                        href={appInfo.installUrl || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Install GitHub App
                        <ExternalLink className="ml-2 h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                )
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Select a repository above to check its installation status, or install
                    the GitHub App to get started.
                  </p>
                  <Button asChild>
                    <a
                      href={appInfo.installUrl || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Install GitHub App
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Installed Repositories */}
          {installedRepos && installedRepos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5" />
                  Installed Repositories
                </CardTitle>
                <CardDescription>
                  These repositories have automatic PR reviews enabled
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {installedRepos.map((repo) => (
                    <div
                      key={repo.repository_full_name}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-3">
                        {repo.is_private ? (
                          <Lock className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Unlock className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="font-medium">{repo.repository_full_name}</span>
                      </div>
                      <Badge variant="outline" className="text-green-600">
                        <CheckCircle className="mr-1 h-3 w-3" />
                        Active
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* How it Works */}
          <Card>
            <CardHeader>
              <CardTitle>How It Works</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-3">
                <div className="text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10">
                    <Shield className="h-6 w-6 text-blue-500" />
                  </div>
                  <h4 className="font-medium">1. Install App</h4>
                  <p className="text-sm text-muted-foreground">
                    Install the GitHub App on your repositories with one click
                  </p>
                </div>
                <div className="text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/10">
                    <Webhook className="h-6 w-6 text-purple-500" />
                  </div>
                  <h4 className="font-medium">2. PR Opened</h4>
                  <p className="text-sm text-muted-foreground">
                    GitHub automatically notifies us when a PR is opened or updated
                  </p>
                </div>
                <div className="text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                    <Zap className="h-6 w-6 text-green-500" />
                  </div>
                  <h4 className="font-medium">3. AI Reviews</h4>
                  <p className="text-sm text-muted-foreground">
                    Our AI reviews the code and posts comments directly on the PR
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Benefits */}
          <Card>
            <CardHeader>
              <CardTitle>Why Use the GitHub App?</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                  <div>
                    <h4 className="font-medium">One-Click Setup</h4>
                    <p className="text-sm text-muted-foreground">
                      No manual webhook configuration needed
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                  <div>
                    <h4 className="font-medium">Automatic Updates</h4>
                    <p className="text-sm text-muted-foreground">
                      Reviews trigger automatically on new PRs
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                  <div>
                    <h4 className="font-medium">Secure Access</h4>
                    <p className="text-sm text-muted-foreground">
                      Fine-grained permissions for your repos
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                  <div>
                    <h4 className="font-medium">Easy Management</h4>
                    <p className="text-sm text-muted-foreground">
                      Add or remove repos anytime from GitHub
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
