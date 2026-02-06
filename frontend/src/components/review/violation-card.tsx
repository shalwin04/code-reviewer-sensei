"use client";

import { AlertCircle, AlertTriangle, Lightbulb, FileCode, Wand2, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Violation } from "@/lib/api";

interface ViolationCardProps {
  violation: Violation;
}

const severityConfig: Record<string, {
  icon: typeof AlertCircle;
  color: string;
  bgColor: string;
  borderColor: string;
  badgeVariant: "destructive" | "default" | "secondary" | "outline";
  label: string;
}> = {
  error: {
    icon: AlertCircle,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/50",
    badgeVariant: "destructive",
    label: "Error",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/50",
    badgeVariant: "default",
    label: "Warning",
  },
  suggestion: {
    icon: Lightbulb,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/50",
    badgeVariant: "secondary",
    label: "Suggestion",
  },
  info: {
    icon: Info,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/50",
    badgeVariant: "secondary",
    label: "Info",
  },
};

// Default config for unknown severity types
const defaultConfig = {
  icon: Info,
  color: "text-muted-foreground",
  bgColor: "bg-muted",
  borderColor: "border-border",
  badgeVariant: "outline" as const,
  label: "Note",
};

export function ViolationCard({ violation }: ViolationCardProps) {
  // Get config with fallback to default
  const severityKey = violation.severity?.toLowerCase() || "suggestion";
  const config = severityConfig[severityKey] || defaultConfig;
  const Icon = config.icon;

  // Handle missing fields gracefully
  const rule = violation.rule || "Unnamed Rule";
  const message = violation.message || "No description provided";
  const file = violation.file || "unknown";
  const line = violation.line || 0;

  return (
    <Card className={`border-l-4 ${config.borderColor}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 rounded-full p-1.5 ${config.bgColor}`}>
              <Icon className={`h-4 w-4 ${config.color}`} />
            </div>
            <div>
              <CardTitle className="text-base">{rule}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {message}
              </p>
            </div>
          </div>
          <Badge variant={config.badgeVariant}>{config.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* File Location */}
        {file && (
          <div className="flex items-center gap-2 text-sm">
            <FileCode className="h-4 w-4 text-muted-foreground" />
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              {file}{line > 0 ? `:${line}` : ""}
            </code>
          </div>
        )}

        {/* Code Snippet */}
        {violation.codeSnippet && (
          <div className="overflow-hidden rounded-md border border-border/50 bg-muted/50">
            <div className="flex items-center justify-between border-b border-border/50 bg-muted/50 px-3 py-1.5">
              <span className="text-xs text-muted-foreground">
                {line > 0 ? `Line ${line}` : "Code"}
              </span>
            </div>
            <pre className="overflow-x-auto p-3">
              <code className="text-xs">{violation.codeSnippet}</code>
            </pre>
          </div>
        )}

        {/* Suggestion */}
        {violation.suggestion && (
          <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-green-500">
              <Wand2 className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Suggested Fix</span>
            </div>
            <p className="text-sm">{violation.suggestion}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
