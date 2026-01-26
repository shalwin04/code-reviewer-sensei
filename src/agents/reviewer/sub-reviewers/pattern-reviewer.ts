import type { Convention, RawViolation } from "../../../types/index.js";

/**
 * Pattern Reviewer
 * Checks architectural & coding patterns
 */
export async function reviewPatterns(
  diff: string,
  filePath: string,
  conventions: Convention[]
): Promise<RawViolation[]> {
  const violations: RawViolation[] = [];

  const patternConventions = conventions.filter(
    (c) => c.category === "pattern"
  );

  if (patternConventions.length === 0) {
    return violations;
  }

  const lines = diff.split("\n");

  for (const conv of patternConventions) {
    // Example: "Avoid direct database access in controllers"
    if (conv.rule.toLowerCase().includes("avoid")) {
      const forbiddenKeyword =
        conv.tags.find((t) => t.startsWith("forbid:"))?.split(":")[1];

      if (!forbiddenKeyword) continue;

      lines.forEach((line, index) => {
        if (line.includes(forbiddenKeyword)) {
          violations.push({
            id: `pattern-${Date.now()}-${index}`,
            type: "pattern",
            issue: conv.rule,
            conventionId: conv.id,
            file: filePath,
            line: index + 1,
            code: line,
            severity: "error",
          });
        }
      });
    }

    // Example: "Use repository pattern"
    if (conv.rule.toLowerCase().includes("repository")) {
      const hasRepositoryUsage = lines.some((l) =>
        l.toLowerCase().includes("repository")
      );

      if (!hasRepositoryUsage) {
        violations.push({
          id: `pattern-missing-${Date.now()}`,
          type: "pattern",
          issue: conv.rule,
          conventionId: conv.id,
          file: filePath,
          line: 1,
          code: "",
          severity: "suggestion",
        });
      }
    }
  }

  return violations;
}
