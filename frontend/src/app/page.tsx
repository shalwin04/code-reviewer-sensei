import Link from "next/link";
import { ArrowRight, Code2, BookOpen, MessageSquare, GitPullRequest } from "lucide-react";
import { AnimatedGradientText } from "@/components/ui/animated-gradient-text";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: BookOpen,
    title: "Learn Conventions",
    description: "Automatically discovers and learns your codebase's coding conventions and patterns.",
  },
  {
    icon: MessageSquare,
    title: "AI Coach",
    description: "Ask questions about your code conventions and get instant, context-aware answers.",
  },
  {
    icon: GitPullRequest,
    title: "PR Reviews",
    description: "Review pull requests against your learned conventions with actionable feedback.",
  },
  {
    icon: Code2,
    title: "Code Intelligence",
    description: "Deep understanding of your codebase structure, patterns, and best practices.",
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
            <AnimatedGradientText className="mb-6 inline-flex">
              <span
                className={cn(
                  "inline animate-gradient bg-gradient-to-r from-[#ffaa40] via-[#9c40ff] to-[#ffaa40] bg-[length:var(--bg-size)_100%] bg-clip-text text-transparent"
                )}
              >
                AI-Powered Code Reviews
              </span>
              <ArrowRight className="ml-2 h-4 w-4 text-muted-foreground" />
            </AnimatedGradientText>

            <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
              Code Reviews That{" "}
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Understand
              </span>{" "}
              Your Codebase
            </h1>

            <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground md:text-xl">
              An AI assistant that learns your coding conventions and helps maintain consistency across your entire codebase.
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
            Everything You Need for Better Code Reviews
          </h2>
          <p className="text-muted-foreground">
            Powerful features designed to help teams maintain code quality and consistency.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title} className="group relative overflow-hidden border-border/40 bg-card/50 transition-all hover:border-primary/50 hover:shadow-lg">
                <CardHeader>
                  <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
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
              Ready to Improve Your Code Reviews?
            </h2>
            <p className="mb-8 text-muted-foreground">
              Start using AI-powered code reviews today and maintain consistent coding standards across your team.
            </p>
            <Link href="/dashboard">
              <ShimmerButton className="shadow-2xl">
                <span className="whitespace-pre-wrap text-center text-sm font-medium leading-none tracking-tight text-white lg:text-lg">
                  Go to Dashboard
                </span>
              </ShimmerButton>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Built with Next.js, shadcn/ui, and Magic UI</p>
        </div>
      </footer>
    </div>
  );
}
