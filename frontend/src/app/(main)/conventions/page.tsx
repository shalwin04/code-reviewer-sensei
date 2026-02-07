"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Loader2, EyeOff, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RepoSelector } from "@/components/dashboard/repo-selector";
import { ConventionCard } from "@/components/conventions/convention-card";
import { CategoryFilter } from "@/components/conventions/category-filter";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";
import { useIgnoredConventions } from "@/hooks/use-ignored-conventions";
import apiClient, { type Convention } from "@/lib/api";

export default function ConventionsPage() {
  const { selectedRepo } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showIgnored, setShowIgnored] = useState(false);
  const { isIgnored, toggleIgnore, ignoredCount, clearIgnored } = useIgnoredConventions(selectedRepo);

  const { data: conventions, isLoading, error } = useQuery({
    queryKey: ["conventions", selectedRepo],
    queryFn: async () => {
      if (!selectedRepo) return [];
      return apiClient.getConventions(selectedRepo);
    },
    enabled: !!selectedRepo,
  });

  // Get unique categories
  const categories = useMemo(() => {
    if (!conventions) return [];
    const uniqueCategories = [...new Set(
      conventions
        .map((c) => c.category)
        .filter((cat): cat is string => !!cat)
    )];
    return uniqueCategories.sort();
  }, [conventions]);

  // Filter conventions
  const filteredConventions = useMemo(() => {
    if (!conventions) return [];
    return conventions.filter((convention) => {
      const title = convention.title || convention.rule || "";
      const description = convention.description || "";
      const conventionId = convention.id || `${convention.category}-${title}`.slice(0, 50);
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        title.toLowerCase().includes(query) ||
        description.toLowerCase().includes(query);
      const matchesCategory =
        !selectedCategory || convention.category === selectedCategory;
      const matchesIgnored = showIgnored || !isIgnored(conventionId);
      return matchesSearch && matchesCategory && matchesIgnored;
    });
  }, [conventions, searchQuery, selectedCategory, showIgnored, isIgnored]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Conventions</h1>
          <p className="text-muted-foreground">
            Browse learned coding conventions
          </p>
        </div>
        <RepoSelector />
      </div>

      {!selectedRepo ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            Select a repository to view conventions
          </p>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="space-y-4">
            {/* Search */}
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search conventions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Category Filter */}
            {categories.length > 0 && (
              <CategoryFilter
                categories={categories}
                selectedCategory={selectedCategory}
                onCategoryChange={setSelectedCategory}
              />
            )}

            {/* Ignored toggle */}
            {ignoredCount > 0 && (
              <div className="flex items-center gap-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="show-ignored"
                    checked={showIgnored}
                    onCheckedChange={setShowIgnored}
                  />
                  <Label htmlFor="show-ignored" className="text-sm">
                    Show ignored ({ignoredCount})
                  </Label>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearIgnored}
                  className="text-xs"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reset all
                </Button>
              </div>
            )}
          </div>

          {/* Results count */}
          {!isLoading && conventions && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {filteredConventions.length} of {conventions.length} conventions
                {ignoredCount > 0 && !showIgnored && ` (${ignoredCount} ignored)`}
              </p>
            </div>
          )}

          {/* Convention Cards */}
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-lg border p-6">
                  <div className="flex items-start gap-3">
                    <Skeleton className="h-5 w-5" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="rounded-lg border border-dashed p-12 text-center">
              <p className="text-destructive">Failed to load conventions</p>
              <p className="text-sm text-muted-foreground mt-2">
                Make sure the backend is running and you have access to this repository.
              </p>
            </div>
          ) : filteredConventions.length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center">
              <p className="text-muted-foreground">
                {conventions && conventions.length === 0
                  ? "No conventions learned for this repository yet"
                  : "No conventions found matching your filters"}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredConventions.map((convention, index) => {
                const conventionId = convention.id || `${convention.category}-${convention.title || convention.rule}`.slice(0, 50);
                return (
                  <ConventionCard
                    key={convention.id || `convention-${index}`}
                    convention={convention}
                    isIgnored={isIgnored(conventionId)}
                    onToggleIgnore={toggleIgnore}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
