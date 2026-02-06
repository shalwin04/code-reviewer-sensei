"use client";

import { GitBranch, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";

interface RepoSelectorProps {
  disabled?: boolean;
}

export function RepoSelector({ disabled = false }: RepoSelectorProps) {
  const { repositories, selectedRepo, setSelectedRepo, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading repositories...</span>
      </div>
    );
  }

  if (repositories.length === 0) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <GitBranch className="h-4 w-4" />
        <span className="text-sm">No repositories found</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <GitBranch className="h-4 w-4 text-muted-foreground" />
      <Select
        value={selectedRepo || undefined}
        onValueChange={setSelectedRepo}
        disabled={disabled || isLoading}
      >
        <SelectTrigger className="w-[280px]">
          <SelectValue placeholder="Select a repository" />
        </SelectTrigger>
        <SelectContent>
          {repositories.map((repo) => (
            <SelectItem key={repo.id} value={repo.fullName}>
              <div className="flex items-center gap-2">
                <span>{repo.fullName}</span>
                {repo.private && (
                  <span className="text-xs text-muted-foreground">(private)</span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
