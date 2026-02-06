"use client";

import { useState, useEffect } from "react";
import { GitPullRequest, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ReviewFormProps {
  onSubmit: (repo: string, prNumber: number) => void;
  isLoading: boolean;
  defaultRepo?: string;
}

export function ReviewForm({ onSubmit, isLoading, defaultRepo = "" }: ReviewFormProps) {
  const [repo, setRepo] = useState(defaultRepo);
  const [prNumber, setPrNumber] = useState("");

  // Update repo when defaultRepo changes
  useEffect(() => {
    if (defaultRepo) {
      setRepo(defaultRepo);
    }
  }, [defaultRepo]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (repo && prNumber) {
      onSubmit(repo, parseInt(prNumber, 10));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitPullRequest className="h-5 w-5" />
          Review Pull Request
        </CardTitle>
        <CardDescription>
          Enter the repository and PR number to review
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="repo" className="text-sm font-medium">
              Repository
            </label>
            <Input
              id="repo"
              placeholder="owner/repository"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="prNumber" className="text-sm font-medium">
              PR Number
            </label>
            <Input
              id="prNumber"
              type="number"
              placeholder="123"
              value={prNumber}
              onChange={(e) => setPrNumber(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <Button
            type="submit"
            disabled={!repo || !prNumber || isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Reviewing...
              </>
            ) : (
              "Start Review"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
