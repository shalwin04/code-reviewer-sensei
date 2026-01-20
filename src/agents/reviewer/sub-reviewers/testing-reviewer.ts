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
      issue: z.string().describe("Brief description of the testing issue"),
      severity: z.enum(["error", "warning", "suggestion"]),
      conventionId: z.string().optional(),
    })
  ),
});

const violationsParser = StructuredOutputParser.fromZodSchema(ViolationsSchema);

const TESTING_REVIEW_PROMPT = PromptTemplate.fromTemplate(`
You are a specialized testing reviewer. Your ONLY job is to detect testing issues.

## Team Testing Conventions:
{conventions}

## Code Diff to Review:
{diff}

## Instructions:
- Check if new code has corresponding tests
- Verify test naming conventions
- Look for proper test structure (arrange-act-assert, given-when-then)
- Check for adequate edge case coverage
- Verify mock/stub usage patterns
- Look for test isolation issues
- Check for proper async test handling
- Only report issues that violate team testing standards

{format_instructions}
`);

export async function reviewTesting(
  diff: string,
  filePath: string,
  conventions: Convention[]
): Promise<RawViolation[]> {
  const llm = createLLM(config.agents.reviewer);

  const testingConventions = conventions
    .filter((c) => c.category === "testing")
    .map((c) => `- ${c.rule}: ${c.description}`)
    .join("\n");

  const prompt = await TESTING_REVIEW_PROMPT.format({
    conventions:
      testingConventions || "No specific testing conventions defined.",
    diff,
    format_instructions: violationsParser.getFormatInstructions(),
  });

  try {
    const response = await llm.invoke(prompt);
    const parsed = await violationsParser.parse(response.content as string);

    return parsed.violations.map((v) => ({
      id: `testing-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: "testing" as const,
      file: filePath,
      line: v.line,
      code: v.code,
      issue: v.issue,
      severity: v.severity,
      conventionId: v.conventionId,
    }));
  } catch (error) {
    console.error("Testing reviewer error:", error);
    return [];
  }
}
