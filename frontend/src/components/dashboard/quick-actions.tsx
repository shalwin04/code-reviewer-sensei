"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquare, GitPullRequest, BookOpen, ArrowRight, GraduationCap, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import apiClient from "@/lib/api";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const actions = [
  {
    title: "Ask AI Coach",
    description: "Get answers about your code conventions",
    href: "/ask",
    icon: MessageSquare,
    color: "bg-blue-500/10 text-blue-500",
  },
  {
    title: "Review PR",
    description: "Check a pull request for violations",
    href: "/review",
    icon: GitPullRequest,
    color: "bg-purple-500/10 text-purple-500",
  },
  {
    title: "View Conventions",
    description: "Browse all learned conventions",
    href: "/conventions",
    icon: BookOpen,
    color: "bg-green-500/10 text-green-500",
  },
];

export function QuickActions() {
  const { selectedRepo } = useAuth();
  const queryClient = useQueryClient();
  const [isLearning, setIsLearning] = useState(false);

  const handleLearnConventions = async () => {
    if (!selectedRepo) {
      toast.error("Please select a repository first");
      return;
    }

    setIsLearning(true);
    toast.info("Learning conventions from repository...", {
      description: "This may take a few moments.",
    });

    try {
      const result = await apiClient.learn(selectedRepo);

      if (result.success) {
        toast.success("Learning complete!", {
          description: result.message,
        });
        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ["stats"] });
        queryClient.invalidateQueries({ queryKey: ["conventions"] });
      } else {
        toast.error("Learning failed", {
          description: result.message,
        });
      }
    } catch (error) {
      console.error("Failed to learn conventions:", error);
      toast.error("Failed to learn conventions", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsLearning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Quick Actions</CardTitle>
        <CardDescription>Common tasks you can perform</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {/* Learn Conventions Button */}
          <Button
            variant="outline"
            className="group flex h-auto items-center justify-start gap-4 rounded-lg border border-border/50 p-4 transition-all hover:border-primary/50 hover:bg-accent"
            onClick={handleLearnConventions}
            disabled={isLearning || !selectedRepo}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500">
              {isLearning ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <GraduationCap className="h-5 w-5" />
              )}
            </div>
            <div className="flex-1 text-left">
              <h3 className="font-medium">
                {isLearning ? "Learning..." : "Learn Conventions"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isLearning
                  ? "Analyzing codebase for patterns"
                  : "Analyze codebase to learn conventions"}
              </p>
            </div>
          </Button>

          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="group flex items-center gap-4 rounded-lg border border-border/50 p-4 transition-all hover:border-primary/50 hover:bg-accent"
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${action.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">{action.title}</h3>
                  <p className="text-sm text-muted-foreground">{action.description}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
