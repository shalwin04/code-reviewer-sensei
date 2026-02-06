"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface CategoryFilterProps {
  categories: string[];
  selectedCategory: string | null;
  onCategoryChange: (category: string | null) => void;
}

export function CategoryFilter({
  categories,
  selectedCategory,
  onCategoryChange,
}: CategoryFilterProps) {
  return (
    <Tabs
      value={selectedCategory || "all"}
      onValueChange={(value) => onCategoryChange(value === "all" ? null : value)}
    >
      <TabsList className="flex-wrap h-auto gap-1 bg-transparent p-0">
        <TabsTrigger
          value="all"
          className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
        >
          All
        </TabsTrigger>
        {categories.map((category) => (
          <TabsTrigger
            key={category}
            value={category}
            className="capitalize data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            {category}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
