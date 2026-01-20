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
      issue: z.string().describe("Brief description of the structural issue"),
      severity: z.enum(["error", "warning", "suggestion"]),
      conventionId: z.string().optional(),
    })
  ),
});

const violationsParser = StructuredOutputParser.fromZodSchema(ViolationsSchema);

const STRUCTURE_REVIEW_PROMPT = PromptTemplate.fromTemplate(`
You are a specialized code structure reviewer. Your ONLY job is to detect structural issues.

## Team Structure Conventions:
{conventions}

## Code Diff to Review:
{diff}

## Instructions:
- Check file organization and module structure
- Look for proper separation of concerns
- Check import/export patterns
- Verify component/class organization
- Look for proper layering (controllers, services, repositories, etc.)
- Only report actual violations against team conventions

{format_instructions}
`);

export async function reviewStructure(
  diff: string,
  filePath: string,
  conventions: Convention[]
): Promise<RawViolation[]> {
  const llm = createLLM(config.agents.reviewer);

  const structureConventions = conventions
    .filter((c) => c.category === "structure")
    .map((c) => `- ${c.rule}: ${c.description}`)
    .join("\n");

  const prompt = await STRUCTURE_REVIEW_PROMPT.format({
    conventions:
      structureConventions || "No specific structure conventions defined.",
    diff,
    format_instructions: violationsParser.getFormatInstructions(),
  });

  try {
    const response = await llm.invoke(prompt);
    const parsed = await violationsParser.parse(response.content as string);

    return parsed.violations.map((v) => ({
      id: `structure-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: "structure" as const,
      file: filePath,
      line: v.line,
      code: v.code,
      issue: v.issue,
      severity: v.severity,
      conventionId: v.conventionId,
    }));
  } catch (error) {
    console.error("Structure reviewer error:", error);
    return [];
  }
}
