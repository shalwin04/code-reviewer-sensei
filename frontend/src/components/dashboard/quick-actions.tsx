"use client";

import Link from "next/link";
import { MessageSquare, GitPullRequest, BookOpen, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Quick Actions</CardTitle>
        <CardDescription>Common tasks you can perform</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
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
