import { PromptTemplate } from "@langchain/core/prompts";
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { z } from "zod";
import { createLLM } from "../../../utils/llm.js";
import { config } from "../../../config/index.js";
import type { RawViolation, Convention } from "../../../types/index.js";

const ViolationsSchema = z.object({
  violations: z.array(
    z.object({
      line: z.number(),
      file: z.string(),
      code: z.string().describe("The problematic code snippet"),
      issue: z.string().describe("Brief description of the pattern issue"),
      severity: z.enum(["error", "warning", "suggestion"]),
      conventionId: z.string().optional(),
    })
  ),
});

const violationsParser = StructuredOutputParser.fromZodSchema(ViolationsSchema);

const PATTERN_REVIEW_PROMPT = PromptTemplate.fromTemplate(`
You are a specialized code pattern reviewer. Your ONLY job is to detect pattern violations.

## Team Approved Patterns:
{conventions}

## Code Diff to Review:
{diff}

## Instructions:
- Check for usage of team-approved design patterns
- Look for anti-patterns the team has banned
- Check error handling patterns
- Verify async/await patterns
- Look for proper state management patterns
- Check for security patterns (input validation, sanitization)
- Only report deviations from team-established patterns

{format_instructions}
`);

export async function reviewPatterns(
  diff: string,
  filePath: string,
  conventions: Convention[]
): Promise<RawViolation[]> {
  const llm = createLLM(config.agents.reviewer);

  const patternConventions = conventions
    .filter(
      (c) =>
        c.category === "pattern" ||
        c.category === "error-handling" ||
        c.category === "security"
    )
    .map((c) => `- [${c.category}] ${c.rule}: ${c.description}`)
    .join("\n");

  const prompt = await PATTERN_REVIEW_PROMPT.format({
    conventions: patternConventions || "No specific pattern conventions defined.",
    diff,
    format_instructions: violationsParser.getFormatInstructions(),
  });

  try {
    const response = await llm.invoke(prompt);
    const parsed = await violationsParser.parse(response.content as string);

    return parsed.violations.map((v) => ({
      id: `pattern-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: "pattern" as const,
      issue: v.issue,
      file: filePath,
      line: v.line,
      code: v.code,
      severity: v.severity,
      conventionId: v.conventionId || "",
    }));
  } catch (error) {
    console.error("Pattern reviewer error:", error);
    return [];
  }
}
