import type { Convention, RawViolation } from "../../../types/index.js";

/**
 * Naming Reviewer
 * Checks file names, variable names, function names
 */
export async function reviewNaming(
  diff: string,
  filePath: string,
  conventions: Convention[]
): Promise<RawViolation[]> {
  const violations: RawViolation[] = [];

  // Only naming conventions
  const namingConventions = conventions.filter(
    (c) => c.category === "naming"
  );

  if (namingConventions.length === 0) {
    return violations;
  }

  // ---------- FILE NAME CHECK ----------
  for (const conv of namingConventions) {
    if (conv.rule.toLowerCase().includes("pascalcase")) {
      const fileName = filePath.split("/").pop() ?? "";

      const pascalCaseRegex = /^[A-Z][a-zA-Z0-9]*\.(ts|tsx)$/;

      if (!pascalCaseRegex.test(fileName)) {
        violations.push({
          id: `naming-file-${Date.now()}`,
          type: "naming",
          issue: conv.rule,
          conventionId: conv.id,
          file: filePath,
          line: 1,
          code: fileName,
          severity: "warning",
        });
      }
    }
  }

  // ---------- VARIABLE / FUNCTION CHECK ----------
  const lines = diff.split("\n");

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // match: const my_var = ...
    const variableMatch = trimmed.match(
      /(const|let|var)\s+([a-zA-Z0-9_]+)/
    );

    if (variableMatch) {
      const variableName = variableMatch[2];

      for (const conv of namingConventions) {
        if (conv.rule.toLowerCase().includes("camelcase")) {
          const camelCaseRegex = /^[a-z][a-zA-Z0-9]*$/;

          if (!camelCaseRegex.test(variableName)) {
            violations.push({
              id: `naming-var-${Date.now()}-${index}`,
              type: "naming",
              issue: `Variable "${variableName}" should be camelCase`,
              conventionId: conv.id,
              file: filePath,
              line: index + 1,
              code: line,
              severity: "warning",
            });
          }
        }
      }
    }
  });

  return violations;
}
