"use client";

import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Wand2,
  Copy,
  Check,
  Loader2,
  X,
  GitBranch,
  FileCode,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import apiClient, { type FixResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

interface FixPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  violation: {
    file: string;
    line?: number;
    message: string;
    suggestion?: string;
    codeSnippet?: string;
  };
  repo: string;
}

function DiffLine({ type, content }: { type: "add" | "remove" | "context"; content: string }) {
  return (
    <div
      className={cn(
        "px-4 py-0.5 font-mono text-xs",
        type === "add" && "bg-green-500/20 text-green-700 dark:text-green-400",
        type === "remove" && "bg-red-500/20 text-red-700 dark:text-red-400",
        type === "context" && "text-muted-foreground"
      )}
    >
      <span className="select-none inline-block w-4">
        {type === "add" ? "+" : type === "remove" ? "-" : " "}
      </span>
      {content}
    </div>
  );
}

function SimpleDiffViewer({
  originalCode,
  fixedCode,
}: {
  originalCode: string;
  fixedCode: string;
}) {
  const originalLines = originalCode.split("\n");
  const fixedLines = fixedCode.split("\n");

  // Simple line-by-line diff
  const maxLines = Math.max(originalLines.length, fixedLines.length);
  const diffElements: React.ReactNode[] = [];

  for (let i = 0; i < maxLines; i++) {
    const original = originalLines[i] ?? "";
    const fixed = fixedLines[i] ?? "";

    if (original === fixed) {
      diffElements.push(
        <DiffLine key={`ctx-${i}`} type="context" content={original} />
      );
    } else {
      if (original) {
        diffElements.push(
          <DiffLine key={`rm-${i}`} type="remove" content={original} />
        );
      }
      if (fixed) {
        diffElements.push(
          <DiffLine key={`add-${i}`} type="add" content={fixed} />
        );
      }
    }
  }

  return (
    <div className="rounded-md border bg-muted/30 overflow-hidden">
      <div className="border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground flex items-center gap-2">
        <GitBranch className="h-3.5 w-3.5" />
        Diff Preview
      </div>
      <div className="overflow-x-auto max-h-80 overflow-y-auto">
        {diffElements}
      </div>
    </div>
  );
}

export function FixPreviewModal({
  isOpen,
  onClose,
  violation,
  repo,
}: FixPreviewModalProps) {
  const [activeTab, setActiveTab] = useState<"diff" | "fixed">("diff");
  const [copied, setCopied] = useState(false);
  const [fixResult, setFixResult] = useState<FixResponse | null>(null);

  const generateFixMutation = useMutation({
    mutationFn: () =>
      apiClient.generateFix({
        repo,
        file: violation.file,
        line: violation.line,
        originalCode: violation.codeSnippet || "",
        violation: violation.message,
        suggestion: violation.suggestion,
      }),
    onSuccess: (data) => {
      setFixResult(data);
    },
  });

  const handleCopy = async () => {
    if (fixResult?.fixedCode) {
      await navigator.clipboard.writeText(fixResult.fixedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    setFixResult(null);
    setActiveTab("diff");
    generateFixMutation.reset();
    onClose();
  };

  // Auto-generate fix when modal opens
  useEffect(() => {
    if (isOpen && !fixResult && !generateFixMutation.isPending) {
      // Small delay to ensure component is mounted
      const timer = setTimeout(() => {
        if (!generateFixMutation.isPending && !fixResult) {
          generateFixMutation.mutate();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, violation.file, violation.message]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      handleClose();
    }
  };

  // Determine current state
  const isLoading = generateFixMutation.isPending;
  const hasError = generateFixMutation.isError;
  const hasResult = !!fixResult;
  const showGenerateButton = !isLoading && !hasError && !hasResult;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-purple-500" />
            AI Auto-Fix
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <FileCode className="h-4 w-4" />
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
              {violation.file}
              {violation.line && <span className="text-primary">:{violation.line}</span>}
            </code>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col space-y-4">
          {/* Violation Summary */}
          <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3">
            <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400">
              Issue:
            </span>
            <p className="text-sm mt-1">{violation.message}</p>
          </div>

          {/* Idle/Initial State - Show Generate Button */}
          {showGenerateButton && (
            <div className="flex flex-col items-center justify-center py-12">
              <Wand2 className="h-12 w-12 text-purple-500 mb-4" />
              <p className="text-sm text-muted-foreground mb-4 text-center">
                Click the button below to generate an AI-powered fix for this issue
              </p>
              <Button
                onClick={() => generateFixMutation.mutate()}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Wand2 className="h-4 w-4 mr-2" />
                Generate Fix
              </Button>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 text-purple-500 animate-spin" />
              <p className="text-sm text-muted-foreground mt-4">
                Generating fix with AI...
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                This may take a few seconds
              </p>
            </div>
          )}

          {/* Error State */}
          {hasError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 p-4 text-center">
              <X className="h-8 w-8 text-red-500 mx-auto" />
              <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                Failed to generate fix. Please try again.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => generateFixMutation.mutate()}
              >
                <Wand2 className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          )}

          {/* Success State */}
          {hasResult && fixResult && (
            <div className="flex-1 overflow-hidden flex flex-col">
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as "diff" | "fixed")}
                className="flex-1 flex flex-col"
              >
                <TabsList className="grid w-full grid-cols-2 max-w-xs">
                  <TabsTrigger value="diff">Diff View</TabsTrigger>
                  <TabsTrigger value="fixed">Fixed Code</TabsTrigger>
                </TabsList>

                <TabsContent value="diff" className="flex-1 overflow-auto mt-4">
                  <SimpleDiffViewer
                    originalCode={fixResult.originalCode || "// Original code not available"}
                    fixedCode={fixResult.fixedCode}
                  />
                </TabsContent>

                <TabsContent value="fixed" className="flex-1 overflow-auto mt-4">
                  <div className="rounded-md border bg-muted/30 overflow-hidden">
                    <div className="border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <FileCode className="h-3.5 w-3.5" />
                        Fixed Code
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        AI Generated
                      </Badge>
                    </div>
                    <pre className="p-4 overflow-x-auto max-h-80 overflow-y-auto">
                      <code className="text-xs font-mono">
                        {fixResult.fixedCode}
                      </code>
                    </pre>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Actions */}
              <div className="space-y-3 pt-4 border-t mt-4">
                <div className="flex items-center gap-2 p-3 rounded-md bg-blue-500/10 border border-blue-500/30">
                  <FileCode className="h-4 w-4 text-blue-500 flex-shrink-0" />
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    <strong>Manual Application Required:</strong> Copy the fixed code and paste it into your file.
                    The fix is not applied automatically to ensure you can review it first.
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCopy}
                    className="min-w-[140px] bg-green-600 hover:bg-green-700"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Copied to Clipboard!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Fix to Apply
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
