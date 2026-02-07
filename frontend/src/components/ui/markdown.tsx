"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface MarkdownProps {
  children: string;
  className?: string;
}

export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={cn("prose prose-sm dark:prose-invert max-w-none break-words overflow-hidden", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
        // Customize rendering
        p: ({ children }) => <p className="mb-2 last:mb-0 break-words whitespace-pre-wrap">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
        li: ({ children }) => <li className="mb-1 break-words">{children}</li>,
        code: ({ className, children, ...props }) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code className="bg-background/50 px-1.5 py-0.5 rounded text-sm font-mono break-all" {...props}>
                {children}
              </code>
            );
          }
          return (
            <code className={cn("block bg-background/50 p-3 rounded-md text-sm font-mono overflow-x-auto whitespace-pre-wrap break-all", className)} {...props}>
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="bg-background/50 rounded-md overflow-x-auto mb-2 max-w-full">{children}</pre>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline break-all"
          >
            {children}
          </a>
        ),
        h1: ({ children }) => <h1 className="text-xl font-bold mb-2 break-words">{children}</h1>,
        h2: ({ children }) => <h2 className="text-lg font-semibold mb-2 break-words">{children}</h2>,
        h3: ({ children }) => <h3 className="text-base font-semibold mb-1 break-words">{children}</h3>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-primary/30 pl-4 italic text-muted-foreground mb-2 break-words">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto mb-2">
            <table className="min-w-full border-collapse border border-border">
              {children}
            </table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-border bg-muted px-3 py-1.5 text-left font-medium break-words">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-border px-3 py-1.5 break-words">{children}</td>
        ),
      }}
    >
      {children}
      </ReactMarkdown>
    </div>
  );
}
