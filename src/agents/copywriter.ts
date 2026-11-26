import { z } from "zod";
import type { AIProvider } from "../integrations/openrouter";
import { loadPrompt } from "../utils/prompt-loader";

const CopywriterOutputSchema = z.object({
  variations: z.array(z.object({
    variation_id: z.string(),
    framework: z.enum([
      "AIDA", "PAS", "BAB", "curiosity_gap", "pattern_interruption",
      "contrarian", "expectation_vs_reality", "observation_insight",
      "problem_opportunity", "prediction_reasoning", "first_principles",
      "narrative", "info_compression", "open_loop"
    ]),
    hook: z.string(),
    post_text: z.string(),
    character_count: z.number().int().min(0),
    hook_type: z.enum(["unexpected_truth", "cost_reframing", "founder_observation", "diagnostic", "outcome_first"]),
    core_insight: z.string(),
    evidence_used: z.array(z.string()),
    originality_notes: z.string(),
    compliance_check: z.object({
      character_limit: z.boolean(),
      no_prohibited_expressions: z.boolean(),
      no_fabricated_experience: z.boolean(),
      facts_supported: z.boolean(),
      opinion_qualified: z.boolean(),
    }),
  })),
  recommended_variation: z.string(),
  selection_reason: z.string(),
});

export interface CopywriterInput {
  contentStrategy: {
    selected_format: string;
    recommended_framework: string;
    hook_type: string;
    target_audience_segment: string;
    core_insight: string;
    key_angles: Array<{ angle: string; evidence_needed: string[] }>;
    content_pillar: string;
  };
  researchFacts: {
    verified_facts: string[];
    source_urls: string[];
  };
  brandConfig: {
    writing_personality: { traits: string[]; description: string };
    preferred_vocabulary: string[];
    prohibited_expressions: string[];
    personal_opinions: Record<string, string>;
    post_formulas: Record<string, string>;
  };
  maxCharacters: number;
  enableLongForm: boolean;
}

export class CopywriterAgent {
  private ai: AIProvider;

  constructor(ai: AIProvider) {
    this.ai = ai;
  }

  async write(input: CopywriterInput): Promise<z.infer<typeof CopywriterOutputSchema>> {
    const prompt = this.buildPrompt(input);

    const response = await this.ai.complete<z.infer<typeof CopywriterOutputSchema>>({
      messages: [
        { role: "system", content: await loadPrompt("copywriter") },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      maxTokens: 4000,
      responseFormat: "json",
      schema: CopywriterOutputSchema,
    });

    // Post-process: validate character counts, compliance
    const validated = this.validateVariations(response.content, input.maxCharacters, input.brandConfig.prohibited_expressions);
    return validated;
  }

  private buildPrompt(input: CopywriterInput): string {
    const { contentStrategy, researchFacts, brandConfig, maxCharacters, enableLongForm } = input;

    return `Generate 5 DISTINCT post variations for this content strategy.

CONTENT STRATEGY:
- Format: ${contentStrategy.selected_format}
- Framework: ${contentStrategy.recommended_framework}
- Hook Type: ${contentStrategy.hook_type}
- Target Audience: ${contentStrategy.target_audience_segment}
- Core Insight: ${contentStrategy.core_insight}
- Content Pillar: ${contentStrategy.content_pillar}
- Key Angles: ${contentStrategy.key_angles.map((a) => a.angle).join("; ")}

VERIFIED FACTS (must use these, don't invent):
${researchFacts.verified_facts.map((f) => `- ${f}`).join("\n")}

SOURCE URLs (for reference):
${researchFacts.source_urls.map((u) => `- ${u}`).join("\n")}

BRAND VOICE:
Traits: ${brandConfig.writing_personality.traits.join(", ")}
Description: ${brandConfig.writing_personality.description}
Preferred Vocabulary: ${brandConfig.preferred_vocabulary.slice(0, 15).join(", ")}
Prohibited Expressions: ${brandConfig.prohibited_expressions.slice(0, 15).join(", ")}
Personal Opinions (use as anchors): ${Object.entries(brandConfig.personal_opinions).map(([k, v]) => `${k}: ${v}`).join("; ")}

POST FORMULAS:
${Object.entries(brandConfig.post_formulas).map(([k, v]) => `${k}: ${v}`).join("\n")}

REQUIREMENTS:
- Generate 5 variations using DIFFERENT frameworks
- Character limit: ${maxCharacters} (standard) ${enableLongForm ? `or ${25000} (long-form)` : ""}
- Each variation: different framework, different hook, different angle
- Follow ALL writing instructions from system prompt
- No fabricated experience, no engagement bait, no prohibited expressions
- All facts must trace to verified_facts
- Opinions clearly distinguished from facts

VARIATION STRATEGY:
1. Primary framework (${contentStrategy.recommended_framework}) + AIDA/PAS
2. Contrarian/Pattern interruption
3. Educational/Insight-driven (Observation → Insight)
4. Narrative/Storytelling or First-principles
5. Curiosity gap or Open-loop

Return JSON with variations array and recommended_variation.`;
  }

  private validateVariations(
    output: z.infer<typeof CopywriterOutputSchema>,
    maxChars: number,
    prohibitedExpressions: string[]
  ): z.infer<typeof CopywriterOutputSchema> {
    const validatedVariations = output.variations.map((v) => {
      const issues: string[] = [];

      // Character limit check
      if (v.character_count > maxChars) {
        issues.push(`Character count ${v.character_count} exceeds limit ${maxChars}`);
      }

      // Prohibited expressions check
      const lowerText = v.post_text.toLowerCase();
      for (const expr of prohibitedExpressions) {
        if (lowerText.includes(expr.toLowerCase())) {
          issues.push(`Contains prohibited expression: ${expr}`);
        }
      }

      // Update compliance check
      const complianceCheck = {
        ...v.compliance_check,
        character_limit: v.character_count <= maxChars,
        no_prohibited_expressions: issues.filter((i) => i.includes("prohibited")).length === 0,
      };

      return {
        ...v,
        compliance_check: complianceCheck,
      };
    });

    return {
      ...output,
      variations: validatedVariations,
    };
  }
}

export async function createCopywriterAgent(ai: AIProvider): Promise<CopywriterAgent> {
  return new CopywriterAgent(ai);
}