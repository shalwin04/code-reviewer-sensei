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
      issue: z.string().describe("Brief description of the naming issue"),
      severity: z.enum(["error", "warning", "suggestion"]),
      conventionId: z.string().optional(),
    })
  ),
});

const violationsParser = StructuredOutputParser.fromZodSchema(ViolationsSchema);

const NAMING_REVIEW_PROMPT = PromptTemplate.fromTemplate(`
You are a specialized naming convention reviewer. Your ONLY job is to detect naming violations.

## Team Naming Conventions:
{conventions}

## Code Diff to Review:
{diff}

## Instructions:
- Check variable names, function names, class names, file names, constants
- Compare against the team's established naming conventions
- Only report actual violations - not style preferences
- Be specific about line numbers and the exact issue

{format_instructions}
`);

export async function reviewNaming(
  diff: string,
  filePath: string,
  conventions: Convention[]
): Promise<RawViolation[]> {
  const llm = createLLM(config.agents.reviewer);

  const namingConventions = conventions
    .filter((c) => c.category === "naming")
    .map((c) => `- ${c.rule}: ${c.description}`)
    .join("\n");

  const prompt = await NAMING_REVIEW_PROMPT.format({
    conventions: namingConventions || "No specific naming conventions defined.",
    diff,
    format_instructions: violationsParser.getFormatInstructions(),
  });

  try {
    const response = await llm.invoke(prompt);
    const parsed = await violationsParser.parse(response.content as string);

    return parsed.violations.map((v) => ({
      id: `naming-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: "naming" as const,
      issue: v.issue,
      file: filePath,
      line: v.line,
      code: v.code,
      severity: v.severity,
      conventionId: v.conventionId || "",
    }));
  } catch (error) {
    console.error("Naming reviewer error:", error);
    return [];
  }
}
