"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  AlertCircle,
  Info,
  Search,
  FileCode,
  Lock,
  Key,
  Bug,
  Loader2,
  Wand2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { RepoSelector } from "@/components/dashboard/repo-selector";
import { FixPreviewModal } from "@/components/review/fix-preview-modal";
import { useAuth } from "@/lib/auth-context";
import apiClient, { type SecurityScanResponse, type SecurityFinding } from "@/lib/api";
import { cn } from "@/lib/utils";

const severityConfig = {
  critical: {
    icon: ShieldX,
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    badge: "destructive" as const,
    label: "Critical",
  },
  high: {
    icon: ShieldAlert,
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    badge: "default" as const,
    label: "High",
  },
  medium: {
    icon: AlertTriangle,
    color: "text-yellow-600 dark:text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    badge: "secondary" as const,
    label: "Medium",
  },
  low: {
    icon: Info,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    badge: "outline" as const,
    label: "Low",
  },
  info: {
    icon: Info,
    color: "text-gray-600 dark:text-gray-400",
    bg: "bg-gray-500/10",
    border: "border-gray-500/30",
    badge: "outline" as const,
    label: "Info",
  },
};

const categoryIcons: Record<string, typeof Shield> = {
  secrets: Key,
  injection: Bug,
  xss: AlertCircle,
  crypto: Lock,
  "access-control": Shield,
  transport: Shield,
};

function FindingCard({ finding, repo }: { finding: SecurityFinding; repo: string | null }) {
  const [showFixModal, setShowFixModal] = useState(false);
  const config = severityConfig[finding.severity];
  const SeverityIcon = config.icon;
  const CategoryIcon = categoryIcons[finding.category] || Shield;

  return (
    <>
      <Card className={cn("border-l-4", config.border)}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={cn("mt-0.5 rounded-full p-1.5", config.bg)}>
                <SeverityIcon className={cn("h-4 w-4", config.color)} />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base">{finding.name}</CardTitle>
                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                  <FileCode className="h-3.5 w-3.5" />
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    {finding.file}
                    {finding.line > 0 && <span className="text-primary">:{finding.line}</span>}
                  </code>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {repo && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFixModal(true)}
                  className="text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-950/50"
                >
                  <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                  Fix
                </Button>
              )}
              <Badge variant="outline" className="capitalize flex items-center gap-1">
                <CategoryIcon className="h-3 w-3" />
                {finding.category}
              </Badge>
              <Badge variant={config.badge} className="capitalize">
                {config.label}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <p className="text-sm text-muted-foreground">{finding.description}</p>
          {finding.code && (
            <div className="overflow-hidden rounded-md border border-border/50 bg-muted/50">
              <div className="flex items-center border-b border-border/50 bg-muted/50 px-3 py-1.5">
                <span className="text-xs text-muted-foreground">
                  {finding.line > 0 ? `Line ${finding.line}` : "Vulnerable Code"}
                </span>
              </div>
              <pre className="overflow-x-auto p-3">
                <code className="text-xs font-mono">{finding.code}</code>
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fix Preview Modal */}
      {repo && (
        <FixPreviewModal
          isOpen={showFixModal}
          onClose={() => setShowFixModal(false)}
          violation={{
            file: finding.file,
            line: finding.line,
            message: `${finding.name}: ${finding.description}`,
            suggestion: `Fix the ${finding.category} security vulnerability`,
            codeSnippet: finding.code,
          }}
          repo={repo}
        />
      )}
    </>
  );
}

function ScanResultsSummary({ summary }: { summary: SecurityScanResponse["summary"] }) {
  return (
    <div className="grid gap-4 md:grid-cols-5">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Total Issues</CardDescription>
          <CardTitle className="text-3xl">{summary.total}</CardTitle>
        </CardHeader>
      </Card>
      <Card className="border-red-500/20">
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1">
            <ShieldX className="h-3 w-3 text-red-500" />
            Critical
          </CardDescription>
          <CardTitle className="text-2xl text-red-500">{summary.critical}</CardTitle>
        </CardHeader>
      </Card>
      <Card className="border-orange-500/20">
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1">
            <ShieldAlert className="h-3 w-3 text-orange-500" />
            High
          </CardDescription>
          <CardTitle className="text-2xl text-orange-500">{summary.high}</CardTitle>
        </CardHeader>
      </Card>
      <Card className="border-yellow-500/20">
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-yellow-500" />
            Medium
          </CardDescription>
          <CardTitle className="text-2xl text-yellow-500">{summary.medium}</CardTitle>
        </CardHeader>
      </Card>
      <Card className="border-blue-500/20">
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1">
            <Info className="h-3 w-3 text-blue-500" />
            Low
          </CardDescription>
          <CardTitle className="text-2xl text-blue-500">{summary.low}</CardTitle>
        </CardHeader>
      </Card>
    </div>
  );
}

export default function SecurityPage() {
  const { selectedRepo } = useAuth();
  const [prNumber, setPrNumber] = useState("");
  const [scanResult, setScanResult] = useState<SecurityScanResponse | null>(null);

  const scanMutation = useMutation({
    mutationFn: () =>
      apiClient.scanSecurity({
        repo: selectedRepo!,
        prNumber: prNumber ? parseInt(prNumber, 10) : undefined,
      }),
    onSuccess: (data) => {
      setScanResult(data);
    },
  });

  const handleScan = () => {
    if (selectedRepo) {
      scanMutation.mutate();
    }
  };

  // Group findings by file
  const findingsByFile = scanResult?.findings.reduce((acc, finding) => {
    if (!acc[finding.file]) {
      acc[finding.file] = [];
    }
    acc[finding.file].push(finding);
    return acc;
  }, {} as Record<string, SecurityFinding[]>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-8 w-8 text-green-500" />
            Security Scanner
          </h1>
          <p className="text-muted-foreground">
            Scan your code for security vulnerabilities
          </p>
        </div>
        <RepoSelector />
      </div>

      {!selectedRepo ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            Select a repository to scan for security issues
          </p>
        </div>
      ) : (
        <>
          {/* Scan Form */}
          <Card>
            <CardHeader>
              <CardTitle>Start Security Scan</CardTitle>
              <CardDescription>
                Scan a PR for common security vulnerabilities (OWASP Top 10, hardcoded secrets, etc.)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="pr-number">PR Number (Optional)</Label>
                  <Input
                    id="pr-number"
                    type="number"
                    placeholder="e.g., 123"
                    value={prNumber}
                    onChange={(e) => setPrNumber(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to scan the entire repository
                  </p>
                </div>
                <Button
                  onClick={handleScan}
                  disabled={scanMutation.isPending}
                  className="min-w-[140px]"
                >
                  {scanMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Start Scan
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Error State */}
          {scanMutation.isError && (
            <Card className="border-red-500/30 bg-red-500/5">
              <CardContent className="flex items-center gap-4 py-6">
                <ShieldX className="h-8 w-8 text-red-500" />
                <div>
                  <h3 className="font-medium text-red-600 dark:text-red-400">
                    Scan Failed
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {scanMutation.error instanceof Error
                      ? scanMutation.error.message
                      : "Failed to complete security scan. Please try again."}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Loading State */}
          {scanMutation.isPending && (
            <Card className="border-blue-500/30 bg-blue-500/5">
              <CardContent className="flex items-center gap-4 py-6">
                <div className="relative">
                  <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
                  <div className="absolute inset-0 h-8 w-8 rounded-full border-2 border-blue-500/20" />
                </div>
                <div>
                  <h3 className="font-medium text-blue-600 dark:text-blue-400">
                    Scanning for Vulnerabilities
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Analyzing code for security issues...
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Results */}
          {scanResult && !scanMutation.isPending && (
            <>
              {/* Summary */}
              <ScanResultsSummary summary={scanResult.summary} />

              {/* Findings */}
              {scanResult.findings.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">
                      Findings ({scanResult.findings.length})
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Scanned at {new Date(scanResult.scannedAt).toLocaleString()}
                    </p>
                  </div>

                  {/* Group by File */}
                  {findingsByFile && Object.keys(findingsByFile).length > 1 ? (
                    <Accordion type="multiple" className="space-y-2">
                      {Object.entries(findingsByFile).map(([file, findings]) => (
                        <AccordionItem key={file} value={file} className="border rounded-lg">
                          <AccordionTrigger className="px-4 hover:no-underline">
                            <div className="flex items-center gap-3">
                              <FileCode className="h-4 w-4 text-muted-foreground" />
                              <span className="font-mono text-sm">{file}</span>
                              <Badge variant="secondary">{findings.length}</Badge>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-4 pb-4 space-y-3">
                            {findings.map((finding) => (
                              <FindingCard key={finding.id} finding={finding} repo={selectedRepo} />
                            ))}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  ) : (
                    <div className="space-y-3">
                      {scanResult.findings.map((finding) => (
                        <FindingCard key={finding.id} finding={finding} repo={selectedRepo} />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <ShieldCheck className="h-16 w-16 text-green-500" />
                    <h3 className="mt-4 text-xl font-medium">No Vulnerabilities Found</h3>
                    <p className="text-sm text-muted-foreground text-center max-w-md mt-2">
                      Great news! No security issues were detected in the scanned code.
                      Keep up the good security practices!
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* What We Check */}
          {!scanResult && !scanMutation.isPending && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  What We Scan For
                </CardTitle>
                <CardDescription>
                  Our security scanner checks for common vulnerabilities
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    { icon: Key, name: "Hardcoded Secrets", desc: "API keys, passwords, tokens in code" },
                    { icon: Bug, name: "SQL Injection", desc: "Unparameterized database queries" },
                    { icon: AlertCircle, name: "XSS Vulnerabilities", desc: "Unsanitized HTML rendering" },
                    { icon: Lock, name: "Weak Cryptography", desc: "MD5, SHA1, insecure random" },
                    { icon: Shield, name: "Command Injection", desc: "Unsafe shell command execution" },
                    { icon: AlertTriangle, name: "Path Traversal", desc: "Unvalidated file paths" },
                  ].map((item) => (
                    <div key={item.name} className="flex items-start gap-3 rounded-lg border p-3">
                      <item.icon className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
