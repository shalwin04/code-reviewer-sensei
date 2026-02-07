"use client";

import {
  AlertCircle,
  AlertTriangle,
  Lightbulb,
  Info,
  FileCode,
  GitPullRequest,
  FileText,
  BookOpen,
  Wrench,
  Clock,
  ExternalLink,
  EyeOff,
  Eye,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Convention } from "@/lib/api";

interface ConventionCardProps {
  convention: Convention;
  isIgnored?: boolean;
  onToggleIgnore?: (id: string) => void;
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

const defaultConfig = {
  icon: Info,
  color: "text-muted-foreground",
  badgeVariant: "outline" as const,
  label: "Note",
};

const sourceTypeConfig: Record<string, {
  icon: typeof FileCode;
  label: string;
  color: string;
}> = {
  codebase: {
    icon: FileCode,
    label: "Codebase",
    color: "text-purple-500",
  },
  "pr-review": {
    icon: GitPullRequest,
    label: "PR Review",
    color: "text-green-500",
  },
  adr: {
    icon: FileText,
    label: "ADR",
    color: "text-blue-500",
  },
  incident: {
    icon: AlertCircle,
    label: "Incident",
    color: "text-red-500",
  },
  manual: {
    icon: Wrench,
    label: "Manual",
    color: "text-orange-500",
  },
  documentation: {
    icon: BookOpen,
    label: "Docs",
    color: "text-cyan-500",
  },
};

// Helper to parse source info
function parseSource(source: Convention["source"]): {
  type: string | null;
  reference: string | null;
  file: string | null;
  line: number | null;
  timestamp: string | null;
} {
  if (!source) return { type: null, reference: null, file: null, line: null, timestamp: null };

  if (typeof source === "string") {
    // Try to extract file:line pattern
    const fileMatch = source.match(/([^:]+):(\d+)/);
    if (fileMatch) {
      return {
        type: "codebase",
        reference: source,
        file: fileMatch[1],
        line: parseInt(fileMatch[2]),
        timestamp: null,
      };
    }
    return { type: null, reference: source, file: null, line: null, timestamp: null };
  }

  // Object format
  const reference = source.reference || "";
  let file: string | null = null;
  let line: number | null = null;

  // Try to extract file:line from reference
  const fileMatch = reference.match(/([^:]+):(\d+)/);
  if (fileMatch) {
    file = fileMatch[1];
    line = parseInt(fileMatch[2]);
  } else if (reference && !reference.includes("://")) {
    // Assume it's a file path if it doesn't look like a URL
    file = reference;
  }

  return {
    type: source.type || null,
    reference,
    file,
    line,
    timestamp: source.timestamp || null,
  };
}

function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return timestamp;
  }
}

export function ConventionCard({ convention, isIgnored, onToggleIgnore }: ConventionCardProps) {
  const severityKey = convention.severity?.toLowerCase() || "suggestion";
  const config = severityConfig[severityKey] || defaultConfig;
  const Icon = config.icon;

  const title = convention.title || convention.rule || convention.description?.slice(0, 50) || "Unnamed Convention";
  const description = convention.description || "No description provided";
  const category = convention.category || "general";
  const confidence = typeof convention.confidence === "number" ? convention.confidence : 0.5;
  const conventionId = convention.id || `${category}-${title}`.slice(0, 50);

  // Parse source info
  const sourceInfo = parseSource(convention.source);
  const sourceTypeConf = sourceInfo.type ? sourceTypeConfig[sourceInfo.type] : null;
  const SourceIcon = sourceTypeConf?.icon || FileCode;

  // Get examples
  const examples = convention.examples || [];
  const singleExample = convention.example || examples[0]?.good;

  return (
    <Card className={cn(
      "transition-all hover:border-primary/50 hover:shadow-md",
      isIgnored && "opacity-50 border-dashed"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <Icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${config.color}`} />
            <div className="min-w-0">
              <CardTitle className="text-base line-clamp-2">
                {title}
                {isIgnored && (
                  <Badge variant="outline" className="ml-2 text-xs">Ignored</Badge>
                )}
              </CardTitle>
              <CardDescription className="mt-1 line-clamp-3">
                {description}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant={config.badgeVariant}>{config.label}</Badge>
            {onToggleIgnore && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleIgnore(conventionId);
                      }}
                    >
                      {isIgnored ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isIgnored ? "Enable this rule" : "Ignore this rule"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
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

        {/* Source Info - Enhanced */}
        {(sourceInfo.type || sourceInfo.file || sourceInfo.reference) && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <SourceIcon className={`h-4 w-4 ${sourceTypeConf?.color || "text-muted-foreground"}`} />
              <span className="font-medium">
                {sourceTypeConf?.label || "Source"}
              </span>
              {sourceInfo.timestamp && (
                <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto">
                  <Clock className="h-3 w-3" />
                  {formatTimestamp(sourceInfo.timestamp)}
                </span>
              )}
            </div>
            {sourceInfo.file && (
              <div className="flex items-center gap-2 text-xs">
                <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
                <code className="bg-muted px-1.5 py-0.5 rounded font-mono">
                  {sourceInfo.file}
                  {sourceInfo.line && (
                    <span className="text-primary">:{sourceInfo.line}</span>
                  )}
                </code>
              </div>
            )}
            {sourceInfo.reference && !sourceInfo.file && (
              <p className="text-xs text-muted-foreground truncate">
                {sourceInfo.reference.startsWith("http") ? (
                  <a
                    href={sourceInfo.reference}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-primary"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {sourceInfo.reference}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  sourceInfo.reference
                )}
              </p>
            )}
          </div>
        )}

        {/* Examples - Expandable */}
        {(singleExample || examples.length > 0) && (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="examples" className="border-none">
              <AccordionTrigger className="py-2 text-sm hover:no-underline">
                <span className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  Examples ({examples.length || 1})
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-2">
                {examples.length > 0 ? (
                  examples.map((ex, idx) => (
                    <div key={idx} className="space-y-2">
                      {ex.good && (
                        <div className="rounded-md border border-green-500/20 bg-green-500/5 overflow-hidden">
                          <div className="px-3 py-1 bg-green-500/10 border-b border-green-500/20 text-xs text-green-600 dark:text-green-400 font-medium">
                            Good
                          </div>
                          <pre className="p-3 text-xs overflow-x-auto">
                            <code>{ex.good}</code>
                          </pre>
                        </div>
                      )}
                      {ex.bad && (
                        <div className="rounded-md border border-red-500/20 bg-red-500/5 overflow-hidden">
                          <div className="px-3 py-1 bg-red-500/10 border-b border-red-500/20 text-xs text-red-600 dark:text-red-400 font-medium">
                            Bad
                          </div>
                          <pre className="p-3 text-xs overflow-x-auto">
                            <code>{ex.bad}</code>
                          </pre>
                        </div>
                      )}
                      {ex.explanation && (
                        <p className="text-xs text-muted-foreground italic">
                          {ex.explanation}
                        </p>
                      )}
                    </div>
                  ))
                ) : singleExample ? (
                  <div className="rounded-md bg-muted p-3">
                    <pre className="overflow-x-auto text-xs">
                      <code>{singleExample}</code>
                    </pre>
                  </div>
                ) : null}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
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
