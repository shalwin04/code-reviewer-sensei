"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "ignored-conventions";

interface IgnoredConventions {
  [repo: string]: string[]; // repo -> array of convention IDs
}

export function useIgnoredConventions(repo: string | null) {
  const [ignored, setIgnored] = useState<string[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    if (!repo) {
      setIgnored([]);
      return;
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data: IgnoredConventions = JSON.parse(stored);
        setIgnored(data[repo] || []);
      }
    } catch {
      setIgnored([]);
    }
  }, [repo]);

  // Save to localStorage
  const saveToStorage = useCallback((repoName: string, ids: string[]) => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const data: IgnoredConventions = stored ? JSON.parse(stored) : {};
      data[repoName] = ids;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      console.error("Failed to save ignored conventions");
    }
  }, []);

  const toggleIgnore = useCallback((conventionId: string) => {
    if (!repo) return;

    setIgnored((prev) => {
      const isIgnored = prev.includes(conventionId);
      const updated = isIgnored
        ? prev.filter((id) => id !== conventionId)
        : [...prev, conventionId];
      saveToStorage(repo, updated);
      return updated;
    });
  }, [repo, saveToStorage]);

  const isIgnored = useCallback((conventionId: string) => {
    return ignored.includes(conventionId);
  }, [ignored]);

  const clearIgnored = useCallback(() => {
    if (!repo) return;
    setIgnored([]);
    saveToStorage(repo, []);
  }, [repo, saveToStorage]);

  return {
    ignored,
    toggleIgnore,
    isIgnored,
    clearIgnored,
    ignoredCount: ignored.length,
  };
}
