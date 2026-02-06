"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { RepoSelector } from "@/components/dashboard/repo-selector";
import { ConventionCard } from "@/components/conventions/convention-card";
import { CategoryFilter } from "@/components/conventions/category-filter";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";
import apiClient, { type Convention } from "@/lib/api";

export default function ConventionsPage() {
  const { selectedRepo } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

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
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        title.toLowerCase().includes(query) ||
        description.toLowerCase().includes(query);
      const matchesCategory =
        !selectedCategory || convention.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [conventions, searchQuery, selectedCategory]);

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
          </div>

          {/* Results count */}
          {!isLoading && conventions && (
            <p className="text-sm text-muted-foreground">
              Showing {filteredConventions.length} of {conventions.length} conventions
            </p>
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
              {filteredConventions.map((convention, index) => (
                <ConventionCard key={convention.id || `convention-${index}`} convention={convention} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
