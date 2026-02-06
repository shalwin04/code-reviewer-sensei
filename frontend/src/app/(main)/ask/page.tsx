"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChatInterface } from "@/components/ask/chat-interface";
import { RepoSelector } from "@/components/dashboard/repo-selector";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import apiClient, { ApiError } from "@/lib/api";
import type { Message } from "@/components/ask/message-bubble";

// Sample questions
const sampleQuestions = [
  "What naming conventions should I use for React components?",
  "How should I handle errors in API calls?",
  "What's the preferred way to structure test files?",
  "What patterns are used for state management?",
];

export default function AskPage() {
  const { selectedRepo } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);

  const askMutation = useMutation({
    mutationFn: async (question: string) => {
      if (!selectedRepo) {
        throw new Error("Please select a repository first");
      }
      return apiClient.ask({
        repo: selectedRepo,
        question,
      });
    },
    onMutate: (question) => {
      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: question,
      };
      setMessages((prev) => [...prev, userMessage]);
    },
    onSuccess: (data) => {
      const answer = data?.answer || "I couldn't generate a response. Please try again.";
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: answer,
        isTyping: true,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Remove typing animation after content is displayed
      setTimeout(() => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id ? { ...msg, isTyping: false } : msg
          )
        );
      }, Math.min(answer.length * 20, 3000) + 500);
    },
    onError: (error) => {
      // Remove the last user message if the request failed
      setMessages((prev) => prev.slice(0, -1));

      if (error instanceof ApiError) {
        if (error.status === 401) {
          toast.error("Please sign in to use the AI Coach");
        } else {
          toast.error(error.message);
        }
      } else {
        toast.error("Failed to get a response. Please try again.");
      }
    },
  });

  const handleSendMessage = (message: string) => {
    if (!selectedRepo) {
      toast.error("Please select a repository first");
      return;
    }
    askMutation.mutate(message);
  };

  const handleSampleQuestion = (question: string) => {
    handleSendMessage(question);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Coach</h1>
          <p className="text-muted-foreground">
            Ask questions about your codebase conventions
          </p>
        </div>
        <RepoSelector />
      </div>

      {!selectedRepo ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            Select a repository to start asking questions
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          {/* Chat Interface */}
          <ChatInterface
            messages={messages}
            onSendMessage={handleSendMessage}
            isLoading={askMutation.isPending}
          />

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Sample Questions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Sample Questions</CardTitle>
                <CardDescription>Click to ask</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {sampleQuestions.map((question) => (
                  <button
                    key={question}
                    onClick={() => handleSampleQuestion(question)}
                    disabled={askMutation.isPending}
                    className="w-full rounded-lg border border-border/50 p-3 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    {question}
                  </button>
                ))}
              </CardContent>
            </Card>

            {/* Context Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Context</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Repository</span>
                    <Badge variant="secondary" className="max-w-[150px] truncate">
                      {selectedRepo?.split("/")[1] || selectedRepo}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
