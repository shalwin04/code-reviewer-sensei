"use client";

import { AlertCircle, AlertTriangle, Lightbulb, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Convention } from "@/lib/api";

interface ConventionCardProps {
  convention: Convention;
}

const severityConfig: Record<string, {
  icon: typeof AlertCircle;
  color: string;
  badgeVariant: "destructive" | "default" | "secondary" | "outline";
  label: string;
}> = {
  error: {
    icon: AlertCircle,
    color: "text-red-500",
    badgeVariant: "destructive",
    label: "Error",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-yellow-500",
    badgeVariant: "default",
    label: "Warning",
  },
  suggestion: {
    icon: Lightbulb,
    color: "text-blue-500",
    badgeVariant: "secondary",
    label: "Suggestion",
  },
  info: {
    icon: Info,
    color: "text-blue-500",
    badgeVariant: "secondary",
    label: "Info",
  },
};

// Default config for unknown severity types
const defaultConfig = {
  icon: Info,
  color: "text-muted-foreground",
  badgeVariant: "outline" as const,
  label: "Note",
};

// Helper to get source display text
function getSourceText(source: Convention["source"]): string | null {
  if (!source) return null;
  if (typeof source === "string") return source;
  // Handle object format: { type, reference, timestamp }
  if (source.reference) return source.reference;
  if (source.type) return source.type;
  return null;
}

export function ConventionCard({ convention }: ConventionCardProps) {
  // Get config with fallback to default
  const severityKey = convention.severity?.toLowerCase() || "suggestion";
  const config = severityConfig[severityKey] || defaultConfig;
  const Icon = config.icon;

  // Handle missing fields gracefully - backend uses 'rule' instead of 'title'
  const title = convention.title || convention.rule || convention.description?.slice(0, 50) || "Unnamed Convention";
  const description = convention.description || "No description provided";
  const category = convention.category || "general";
  const confidence = typeof convention.confidence === "number" ? convention.confidence : 0.5;

  // Get first example from examples array if available
  const example = convention.example || convention.examples?.[0]?.good;
  const sourceText = getSourceText(convention.source);

  return (
    <Card className="transition-all hover:border-primary/50 hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <Icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${config.color}`} />
            <div className="min-w-0">
              <CardTitle className="text-base line-clamp-2">{title}</CardTitle>
              <CardDescription className="mt-1 line-clamp-3">
                {description}
              </CardDescription>
            </div>
          </div>
          <Badge variant={config.badgeVariant} className="flex-shrink-0">{config.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Category & Confidence */}
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Category:</span>
            <Badge variant="outline" className="capitalize">
              {category}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Confidence:</span>
            <ConfidenceBar confidence={confidence} />
          </div>
        </div>

        {/* Example */}
        {example && (
          <div className="rounded-md bg-muted p-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Example:
            </p>
            <pre className="overflow-x-auto text-xs">
              <code>{example}</code>
            </pre>
          </div>
        )}

        {/* Tags */}
        {convention.tags && convention.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {convention.tags.map((tag, idx) => (
              <Badge key={idx} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Source */}
        {sourceText && (
          <p className="text-xs text-muted-foreground truncate">
            Source: {sourceText}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const percentage = Math.round((confidence || 0) * 100);
  const getColor = () => {
    if (percentage >= 80) return "bg-green-500";
    if (percentage >= 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full transition-all ${getColor()}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <span className="text-xs font-medium">{percentage}%</span>
    </div>
  );
}
