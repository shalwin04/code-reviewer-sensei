import Link from "next/link";
import { ArrowRight, Sparkles, BookOpen, MessageSquare, GitPullRequest, Shield, Trophy, Zap } from "lucide-react";
import { AnimatedGradientText } from "@/components/ui/animated-gradient-text";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: BookOpen,
    title: "Learn Conventions",
    description: "Sensei analyzes your codebase to discover and learn your team's unique coding patterns.",
  },
  {
    icon: MessageSquare,
    title: "Ask Sensei",
    description: "Get instant, wise answers about your code conventions from your AI mentor.",
  },
  {
    icon: GitPullRequest,
    title: "PR Reviews",
    description: "Review pull requests with educational feedback that helps developers grow.",
  },
  {
    icon: Shield,
    title: "Security Scanning",
    description: "Detect vulnerabilities and security issues with AI-powered analysis.",
  },
  {
    icon: Zap,
    title: "Auto-Fix",
    description: "Generate context-aware code fixes with diff previews for every issue.",
  },
  {
    icon: Trophy,
    title: "Gamification",
    description: "Earn points, badges, and climb the leaderboard as you improve code quality.",
  },
];

const stats = [
  { value: 1000, label: "Conventions Learned", suffix: "+" },
  { value: 50, label: "Repositories", suffix: "+" },
  { value: 95, label: "Accuracy", suffix: "%" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent" />

        <div className="container relative mx-auto px-4 py-24 md:py-32 lg:py-40">
          <div className="mx-auto max-w-4xl text-center">
            {/* Logo */}
            <div className="mb-8 flex justify-center">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-purple-600 shadow-lg shadow-primary/25">
                  <Sparkles className="h-8 w-8 text-white" />
                </div>
                <div className="text-left">
                  <h2 className="text-3xl font-bold">Core</h2>
                  <p className="text-sm text-muted-foreground">The AI Code Reviewer Sensei</p>
                </div>
              </div>
            </div>

            <AnimatedGradientText className="mb-6 inline-flex">
              <span
                className={cn(
                  "inline animate-gradient bg-gradient-to-r from-[#ffaa40] via-[#9c40ff] to-[#ffaa40] bg-[length:var(--bg-size)_100%] bg-clip-text text-transparent"
                )}
              >
                Powered by Gemini 3
              </span>
              <ArrowRight className="ml-2 h-4 w-4 text-muted-foreground" />
            </AnimatedGradientText>

            <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
              Your AI{" "}
              <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
                Sensei
              </span>{" "}
              for Code Mastery
            </h1>

            <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground md:text-xl">
              An AI mentor that learns your team&apos;s coding DNA, reviews PRs with wisdom, and coaches developers to write better code.
            </p>

            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/dashboard">
                <ShimmerButton className="shadow-2xl">
                  <span className="whitespace-pre-wrap text-center text-sm font-medium leading-none tracking-tight text-white lg:text-lg">
                    Get Started
                  </span>
                </ShimmerButton>
              </Link>
              <Link
                href="/conventions"
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                View Conventions
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-y border-border/40 bg-card/50">
        <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-4xl font-bold tracking-tight">
                  <NumberTicker value={stat.value} />
                  {stat.suffix}
                </div>
                <p className="mt-2 text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-24">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Master Your Codebase with Sensei
          </h2>
          <p className="text-muted-foreground">
            Powerful AI-driven features that help your team level up their code quality.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title} className="group relative overflow-hidden border-border/40 bg-card/50 transition-all hover:border-primary/50 hover:shadow-lg">
                <CardHeader>
                  <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-purple-500/20 text-primary">
                    <Icon className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-border/40 bg-card/50">
        <div className="container mx-auto px-4 py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to Train with Sensei?
            </h2>
            <p className="mb-8 text-muted-foreground">
              Begin your journey to code mastery. Let Core learn your team&apos;s ways and guide you to excellence.
            </p>
            <Link href="/dashboard">
              <ShimmerButton className="shadow-2xl">
                <span className="whitespace-pre-wrap text-center text-sm font-medium leading-none tracking-tight text-white lg:text-lg">
                  Start Training
                </span>
              </ShimmerButton>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="flex items-center justify-center h-6 w-6 rounded-md bg-gradient-to-br from-primary to-purple-600">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold">Core</span>
          </div>
          <p>Built with Gemini 3, LangGraph, Next.js & Supabase</p>
        </div>
      </footer>
    </div>
  );
}
