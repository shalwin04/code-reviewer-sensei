"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Trophy,
  Medal,
  Award,
  Flame,
  Star,
  TrendingUp,
  Users,
  Crown,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RepoSelector } from "@/components/dashboard/repo-selector";
import { useAuth } from "@/lib/auth-context";
import apiClient, { type LeaderboardEntry, type Badge as BadgeType } from "@/lib/api";
import { cn } from "@/lib/utils";

const BADGE_CONFIG: Record<string, { icon: string; color: string }> = {
  first_review: { icon: "🎯", color: "bg-blue-500" },
  five_reviews: { icon: "⭐", color: "bg-yellow-500" },
  ten_reviews: { icon: "🌟", color: "bg-yellow-600" },
  twenty_five_reviews: { icon: "💫", color: "bg-purple-500" },
  fifty_reviews: { icon: "🏆", color: "bg-amber-500" },
  perfect_score: { icon: "💯", color: "bg-green-500" },
  streak_3: { icon: "🔥", color: "bg-orange-500" },
  streak_7: { icon: "⚡", color: "bg-red-500" },
  zero_errors: { icon: "✨", color: "bg-emerald-500" },
  fixer: { icon: "🔧", color: "bg-indigo-500" },
};

function getRankIcon(rank: number) {
  switch (rank) {
    case 1:
      return <Crown className="h-6 w-6 text-yellow-500" />;
    case 2:
      return <Medal className="h-5 w-5 text-gray-400" />;
    case 3:
      return <Medal className="h-5 w-5 text-amber-600" />;
    default:
      return <span className="text-lg font-bold text-muted-foreground">{rank}</span>;
  }
}

function getRankBg(rank: number) {
  switch (rank) {
    case 1:
      return "bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border-yellow-500/30";
    case 2:
      return "bg-gradient-to-r from-gray-400/10 to-gray-500/10 border-gray-400/30";
    case 3:
      return "bg-gradient-to-r from-amber-600/10 to-amber-700/10 border-amber-600/30";
    default:
      return "";
  }
}

function LeaderboardRow({ entry, badges }: { entry: LeaderboardEntry; badges: BadgeType[] }) {
  const badgeMap = new Map(badges.map((b) => [b.id, b]));

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-lg border p-4 transition-all hover:shadow-md",
        getRankBg(entry.rank)
      )}
    >
      {/* Rank */}
      <div className="flex h-10 w-10 items-center justify-center">
        {getRankIcon(entry.rank)}
      </div>

      {/* Avatar & Name */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Avatar>
          <AvatarImage src={`https://github.com/${entry.author}.png`} />
          <AvatarFallback>{entry.author.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="font-medium truncate">{entry.author}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{entry.totalReviews} reviews</span>
            {entry.streak > 0 && (
              <span className="flex items-center gap-0.5 text-orange-500">
                <Flame className="h-3 w-3" />
                {entry.streak} day streak
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="hidden md:flex items-center gap-6">
        <div className="text-center">
          <p className="text-2xl font-bold">{entry.avgScore}</p>
          <p className="text-xs text-muted-foreground">Avg Score</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-green-500">{entry.totalIssuesFixed}</p>
          <p className="text-xs text-muted-foreground">Issues Fixed</p>
        </div>
      </div>

      {/* Badges */}
      <div className="hidden lg:flex items-center gap-1">
        <TooltipProvider>
          {entry.badges.slice(0, 5).map((badgeId) => {
            const badge = badgeMap.get(badgeId);
            const config = BADGE_CONFIG[badgeId];
            return (
              <Tooltip key={badgeId}>
                <TooltipTrigger>
                  <div
                    className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center text-sm",
                      config?.color || "bg-gray-500"
                    )}
                  >
                    {config?.icon || "🏅"}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium">{badge?.name || badgeId}</p>
                  <p className="text-xs text-muted-foreground">{badge?.description}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
          {entry.badges.length > 5 && (
            <Tooltip>
              <TooltipTrigger>
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                  +{entry.badges.length - 5}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{entry.badges.length - 5} more badges</p>
              </TooltipContent>
            </Tooltip>
          )}
        </TooltipProvider>
      </div>

      {/* Points */}
      <div className="text-right">
        <p className="text-xl font-bold text-primary">{entry.points.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground">points</p>
      </div>
    </div>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-lg border p-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

export default function LeaderboardPage() {
  const { selectedRepo } = useAuth();
  const [timeframe, setTimeframe] = useState<"all" | "week" | "month">("all");

  const { data: leaderboard, isLoading } = useQuery({
    queryKey: ["leaderboard", selectedRepo, timeframe],
    queryFn: () => apiClient.getLeaderboard(selectedRepo!, timeframe),
    enabled: !!selectedRepo,
  });

  const { data: badges = [] } = useQuery({
    queryKey: ["badges"],
    queryFn: () => apiClient.getAllBadges(),
  });

  // Calculate some stats for the header
  const totalReviews = leaderboard?.reduce((sum, e) => sum + e.totalReviews, 0) || 0;
  const totalParticipants = leaderboard?.length || 0;
  const topScore = leaderboard?.[0]?.avgScore || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Trophy className="h-8 w-8 text-yellow-500" />
            Leaderboard
          </h1>
          <p className="text-muted-foreground">
            Top contributors and their achievements
          </p>
        </div>
        <RepoSelector />
      </div>

      {!selectedRepo ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            Select a repository to view the leaderboard
          </p>
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  Participants
                </CardDescription>
                <CardTitle className="text-3xl">{totalParticipants}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <TrendingUp className="h-4 w-4" />
                  Total Reviews
                </CardDescription>
                <CardTitle className="text-3xl">{totalReviews}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <Star className="h-4 w-4" />
                  Top Score
                </CardDescription>
                <CardTitle className="text-3xl text-green-500">{topScore}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Timeframe Tabs */}
          <Tabs value={timeframe} onValueChange={(v) => setTimeframe(v as typeof timeframe)}>
            <TabsList>
              <TabsTrigger value="all">All Time</TabsTrigger>
              <TabsTrigger value="month">This Month</TabsTrigger>
              <TabsTrigger value="week">This Week</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Leaderboard */}
          {isLoading ? (
            <LeaderboardSkeleton />
          ) : leaderboard && leaderboard.length > 0 ? (
            <div className="space-y-3">
              {leaderboard.map((entry) => (
                <LeaderboardRow key={entry.author} entry={entry} badges={badges} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Trophy className="h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-medium">No data yet</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  Start reviewing PRs to see contributors on the leaderboard.
                  Points are earned for reviews, high scores, and streaks.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Badge Legend */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                Available Badges
              </CardTitle>
              <CardDescription>
                Earn badges by contributing to code reviews
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {badges.map((badge) => {
                  const config = BADGE_CONFIG[badge.id];
                  return (
                    <div
                      key={badge.id}
                      className="flex items-center gap-3 rounded-lg border p-3"
                    >
                      <div
                        className={cn(
                          "h-10 w-10 rounded-full flex items-center justify-center text-lg",
                          config?.color || "bg-gray-500"
                        )}
                      >
                        {config?.icon || badge.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{badge.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {badge.description}
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        +{badge.points}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
