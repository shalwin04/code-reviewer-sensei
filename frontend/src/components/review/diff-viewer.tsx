"use client";

import { useState } from "react";
import {
  FileCode,
  Plus,
  Minus,
  FileEdit,
  FilePlus,
  FileX,
  ChevronDown,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { PRDiffFile } from "@/lib/api";

interface DiffViewerProps {
  files: PRDiffFile[];
  violations?: Array<{
    file: string;
    line: number;
    message: string;
    severity: string;
  }>;
  isLoading?: boolean;
}

interface ParsedLine {
  type: "added" | "removed" | "context" | "header";
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

function parseDiff(diff: string): ParsedLine[] {
  if (!diff) return [];

  const lines = diff.split("\n");
  const parsed: ParsedLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      // Parse hunk header: @@ -start,count +start,count @@
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      parsed.push({ type: "header", content: line });
    } else if (line.startsWith("+")) {
      parsed.push({
        type: "added",
        content: line.substring(1),
        newLineNum: newLine++,
      });
    } else if (line.startsWith("-")) {
      parsed.push({
        type: "removed",
        content: line.substring(1),
        oldLineNum: oldLine++,
      });
    } else if (line.startsWith(" ") || line === "") {
      parsed.push({
        type: "context",
        content: line.substring(1) || "",
        oldLineNum: oldLine++,
        newLineNum: newLine++,
      });
    }
  }

  return parsed;
}

const statusConfig = {
  added: { icon: FilePlus, color: "text-green-500", label: "Added" },
  removed: { icon: FileX, color: "text-red-500", label: "Deleted" },
  modified: { icon: FileEdit, color: "text-yellow-500", label: "Modified" },
  renamed: { icon: FileEdit, color: "text-blue-500", label: "Renamed" },
};

function FileCard({
  file,
  violations,
  defaultExpanded = false,
}: {
  file: PRDiffFile;
  violations?: DiffViewerProps["violations"];
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const statusConf = statusConfig[file.status] || statusConfig.modified;
  const StatusIcon = statusConf.icon;
  const parsedLines = parseDiff(file.diff);

  const fileViolations = violations?.filter((v) => v.file === file.path) || [];

  return (
    <Card className="overflow-hidden">
      <CardHeader
        className="py-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            )}
            <StatusIcon className={cn("h-4 w-4 flex-shrink-0", statusConf.color)} />
            <code className="text-sm truncate">{file.path}</code>
            {fileViolations.length > 0 && (
              <Badge variant="destructive" className="flex-shrink-0">
                <AlertCircle className="h-3 w-3 mr-1" />
                {fileViolations.length}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm flex-shrink-0">
            <span className="text-green-500 flex items-center gap-1">
              <Plus className="h-3 w-3" />
              {file.additions}
            </span>
            <span className="text-red-500 flex items-center gap-1">
              <Minus className="h-3 w-3" />
              {file.deletions}
            </span>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="p-0 border-t">
          <div className="overflow-x-auto max-w-full" style={{ overflowX: 'scroll' }}>
            <table className="min-w-full text-xs font-mono" style={{ tableLayout: 'auto' }}>
              <tbody>
                {parsedLines.map((line, idx) => {
                  const hasViolation = fileViolations.some(
                    (v) => v.line === line.newLineNum
                  );
                  const violation = fileViolations.find(
                    (v) => v.line === line.newLineNum
                  );

                  return (
                    <tr
                      key={idx}
                      className={cn(
                        "border-b border-border/30 last:border-b-0",
                        line.type === "header" && "bg-blue-500/10",
                        line.type === "added" && "bg-green-500/10",
                        line.type === "removed" && "bg-red-500/10",
                        hasViolation && "ring-2 ring-inset ring-yellow-500/50"
                      )}
                    >
                      {line.type === "header" ? (
                        <td
                          colSpan={3}
                          className="px-3 py-1 text-blue-500 select-none"
                        >
                          {line.content}
                        </td>
                      ) : (
                        <>
                          <td className="w-12 px-2 py-0.5 text-right text-muted-foreground select-none border-r border-border/30">
                            {line.oldLineNum || ""}
                          </td>
                          <td className="w-12 px-2 py-0.5 text-right text-muted-foreground select-none border-r border-border/30">
                            {line.newLineNum || ""}
                          </td>
                          <td className="px-3 py-0.5 whitespace-pre min-w-max">
                            <span
                              className={cn(
                                "inline-block min-w-max",
                                line.type === "added" && "text-green-600 dark:text-green-400",
                                line.type === "removed" && "text-red-600 dark:text-red-400"
                              )}
                            >
                              {line.type === "added" && "+"}
                              {line.type === "removed" && "-"}
                              {line.type === "context" && " "}
                              {line.content}
                            </span>
                            {hasViolation && violation && (
                              <div className="mt-1 p-2 rounded bg-yellow-500/20 border border-yellow-500/30 text-yellow-700 dark:text-yellow-300">
                                <div className="flex items-start gap-2">
                                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                  <span>{violation.message}</span>
                                </div>
                              </div>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function DiffViewer({ files, violations, isLoading }: DiffViewerProps) {
  const [expandAll, setExpandAll] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="py-3">
              <Skeleton className="h-5 w-3/4" />
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  }

  if (!files || files.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileCode className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium">No files changed</h3>
          <p className="text-sm text-muted-foreground">
            This PR doesn't have any file changes.
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            {files.length} file{files.length !== 1 ? "s" : ""} changed
          </span>
          <span className="text-green-500 flex items-center gap-1">
            <Plus className="h-3.5 w-3.5" />
            {totalAdditions} additions
          </span>
          <span className="text-red-500 flex items-center gap-1">
            <Minus className="h-3.5 w-3.5" />
            {totalDeletions} deletions
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setExpandAll(!expandAll)}
        >
          {expandAll ? "Collapse All" : "Expand All"}
        </Button>
      </div>

      {/* Files */}
      <div className="space-y-3">
        {files.map((file) => (
          <FileCard
            key={file.path}
            file={file}
            violations={violations}
            defaultExpanded={expandAll}
          />
        ))}
      </div>
    </div>
  );
}
