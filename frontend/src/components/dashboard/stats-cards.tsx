"use client";

import { BookOpen, AlertTriangle, Lightbulb, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Skeleton } from "@/components/ui/skeleton";

interface StatsCardsProps {
  stats: {
    totalConventions: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
  } | null;
  isLoading: boolean;
}

export function StatsCards({ stats, isLoading }: StatsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4 rounded" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="mt-1 h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const cards = [
    {
      title: "Total Conventions",
      value: stats.totalConventions,
      description: "Learned from codebase",
      icon: BookOpen,
      color: "text-blue-500",
    },
    {
      title: "Errors",
      value: stats.bySeverity?.error || 0,
      description: "Critical issues to fix",
      icon: AlertCircle,
      color: "text-red-500",
    },
    {
      title: "Warnings",
      value: stats.bySeverity?.warning || 0,
      description: "Should be addressed",
      icon: AlertTriangle,
      color: "text-yellow-500",
    },
    {
      title: "Suggestions",
      value: stats.bySeverity?.suggestion || 0,
      description: "Nice to have improvements",
      icon: Lightbulb,
      color: "text-green-500",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <Icon className={cn("h-4 w-4", card.color)} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                <NumberTicker value={card.value} />
              </div>
              <p className="text-xs text-muted-foreground">{card.description}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function cn(...classes: (string | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
