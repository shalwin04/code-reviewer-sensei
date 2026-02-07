"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { format, subDays, parseISO, startOfDay } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReviewHistoryItem } from "@/lib/api";

interface ReviewChartsProps {
  reviews: ReviewHistoryItem[];
  isLoading: boolean;
}

const COLORS = {
  errors: "#ef4444",
  warnings: "#eab308",
  suggestions: "#3b82f6",
  score: "#22c55e",
};

export function ReviewCharts({ reviews, isLoading }: ReviewChartsProps) {
  // Process data for charts
  const { trendData, severityData, scoreData } = useMemo(() => {
    if (!reviews || reviews.length === 0) {
      return { trendData: [], severityData: [], scoreData: [] };
    }

    // Get last 14 days of data
    const today = startOfDay(new Date());
    const days = Array.from({ length: 14 }, (_, i) => {
      const date = subDays(today, 13 - i);
      return format(date, "yyyy-MM-dd");
    });

    // Aggregate reviews by day
    const dailyStats: Record<string, {
      date: string;
      reviews: number;
      errors: number;
      warnings: number;
      suggestions: number;
      totalScore: number;
      scoreCount: number;
    }> = {};

    days.forEach((day) => {
      dailyStats[day] = {
        date: day,
        reviews: 0,
        errors: 0,
        warnings: 0,
        suggestions: 0,
        totalScore: 0,
        scoreCount: 0,
      };
    });

    reviews.forEach((review) => {
      if (review.status !== "completed") return;

      const reviewDate = format(parseISO(review.created_at), "yyyy-MM-dd");
      if (dailyStats[reviewDate]) {
        dailyStats[reviewDate].reviews += 1;
        dailyStats[reviewDate].errors += review.errors_count;
        dailyStats[reviewDate].warnings += review.warnings_count;
        dailyStats[reviewDate].suggestions += review.suggestions_count;
        dailyStats[reviewDate].totalScore += review.score;
        dailyStats[reviewDate].scoreCount += 1;
      }
    });

    const trendData = days.map((day) => {
      const stats = dailyStats[day];
      return {
        date: format(parseISO(day), "MMM d"),
        reviews: stats.reviews,
        errors: stats.errors,
        warnings: stats.warnings,
        suggestions: stats.suggestions,
        avgScore: stats.scoreCount > 0
          ? Math.round(stats.totalScore / stats.scoreCount)
          : null,
      };
    });

    // Severity breakdown
    const totalErrors = reviews.reduce((sum, r) => sum + r.errors_count, 0);
    const totalWarnings = reviews.reduce((sum, r) => sum + r.warnings_count, 0);
    const totalSuggestions = reviews.reduce((sum, r) => sum + r.suggestions_count, 0);

    const severityData = [
      { name: "Errors", value: totalErrors, color: COLORS.errors },
      { name: "Warnings", value: totalWarnings, color: COLORS.warnings },
      { name: "Suggestions", value: totalSuggestions, color: COLORS.suggestions },
    ].filter((d) => d.value > 0);

    // Score distribution
    const scoreRanges = [
      { range: "90-100", min: 90, max: 100, count: 0 },
      { range: "80-89", min: 80, max: 89, count: 0 },
      { range: "70-79", min: 70, max: 79, count: 0 },
      { range: "60-69", min: 60, max: 69, count: 0 },
      { range: "<60", min: 0, max: 59, count: 0 },
    ];

    reviews.filter((r) => r.status === "completed").forEach((review) => {
      const range = scoreRanges.find((r) => review.score >= r.min && review.score <= r.max);
      if (range) range.count += 1;
    });

    const scoreData = scoreRanges.map((r) => ({
      range: r.range,
      count: r.count,
    }));

    return { trendData, severityData, scoreData };
  }, [reviews]);

  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-60" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-60" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (reviews.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Issue Trends (Last 14 Days)</CardTitle>
          <CardDescription>
            Track errors, warnings, and suggestions over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="colorErrors" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.errors} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.errors} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorWarnings" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.warnings} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.warnings} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorSuggestions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.suggestions} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.suggestions} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="errors"
                  stackId="1"
                  stroke={COLORS.errors}
                  fill="url(#colorErrors)"
                  name="Errors"
                />
                <Area
                  type="monotone"
                  dataKey="warnings"
                  stackId="1"
                  stroke={COLORS.warnings}
                  fill="url(#colorWarnings)"
                  name="Warnings"
                />
                <Area
                  type="monotone"
                  dataKey="suggestions"
                  stackId="1"
                  stroke={COLORS.suggestions}
                  fill="url(#colorSuggestions)"
                  name="Suggestions"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Severity Breakdown */}
        {severityData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Issue Breakdown</CardTitle>
              <CardDescription>Distribution by severity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={severityData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                      labelLine={false}
                    >
                      {severityData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Score Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Score Distribution</CardTitle>
            <CardDescription>PR review scores breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoreData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="range"
                    tick={{ fontSize: 12 }}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill={COLORS.score}
                    radius={[0, 4, 4, 0]}
                    name="Reviews"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
