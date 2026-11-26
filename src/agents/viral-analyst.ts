import { z } from "zod";
import type { AIProvider } from "../integrations/openrouter";
import { loadPrompt } from "../utils/prompt-loader";

const ViralAnalystOutputSchema = z.object({
  observed_source_facts: z.array(z.object({
    url: z.string().url().optional(),
    text: z.string(),
    metrics: z.record(z.unknown()).optional(),
    source_date: z.string().optional(),
    observable_facts: z.array(z.string()),
  })),
  context_structure_teardown: z.array(z.object({
    source_url: z.string().url().optional(),
    cultural_moment: z.string(),
    original_claim: z.string(),
    network_conditions: z.string(),
    target_reader: z.string(),
    evidence_experience: z.string(),
    expression_format: z.string(),
    transferable_principle: z.string(),
    hook: z.string(),
    tension: z.string(),
    payoff: z.string(),
    social_function: z.string(),
    sentence_roles: z.array(z.string()),
  })),
  candidate_mechanisms: z.array(z.object({
    mechanism: z.string(),
    description: z.string(),
    supporting_evidence: z.string(),
    competing_explanation: z.string(),
    confidence: z.enum(["observed", "inferred", "unknown"]),
  })),
  reusable_frameworks: z.array(z.object({
    framework_id: z.string(),
    name: z.string(),
    structure: z.string(),
    guardrail: z.string(),
    best_for: z.string(),
  })),
  original_post_directions: z.array(z.object({
    angle_id: z.string(),
    core_claim: z.string(),
    mechanism_used: z.string(),
    framework_applied: z.string(),
    target_audience: z.string(),
    evidence_needed: z.array(z.string()),
    draft_post: z.string(),
    originality_check: z.object({
      distinct_from_source: z.boolean(),
      new_claim: z.boolean(),
      new_evidence: z.boolean(),
      new_language: z.boolean(),
      new_audience_application: z.boolean(),
    }),
    ranking_scores: z.object({
      relevance: z.number().min(0).max(1),
      specificity: z.number().min(0).max(1),
      value: z.number().min(0).max(1),
      credibility: z.number().min(0).max(1),
      novelty: z.number().min(0).max(1),
    }),
  })),
  test_plan: z.object({
    hypothesis: z.string(),
    format: z.string(),
    metric: z.string(),
    confounders: z.array(z.string()),
    disconfirming_result: z.string(),
  }),
  warnings: z.array(z.string()),
});

export interface ViralAnalystInput {
  sourcePosts: Array<{
    url?: string;
    text: string;
    metrics?: Record<string, unknown>;
    sourceDate?: string;
  }>;
  audience: string;
  niches: string[];
  objective: string;
  availableMeasurements: string;
}

export class ViralAnalystAgent {
  private ai: AIProvider;

  constructor(ai: AIProvider) {
    this.ai = ai;
  }

  async analyze(input: ViralAnalystInput): Promise<z.infer<typeof ViralAnalystOutputSchema>> {
    const prompt = this.buildPrompt(input);

    const response = await this.ai.complete<z.infer<typeof ViralAnalystOutputSchema>>({
      messages: [
        { role: "system", content: await loadPrompt("viral-analyst") },
        { role: "user", content: prompt },
      ],
      temperature: 0.5,
      maxTokens: 4000,
      responseFormat: "json",
      schema: ViralAnalystOutputSchema,
    });

    return response.content;
  }

  private buildPrompt(input: ViralAnalystInput): string {
    const postsText = input.sourcePosts
      .map((post, idx) => {
        return `SOURCE POST ${idx + 1}:
${post.url ? `URL: ${post.url}` : ""}
${post.sourceDate ? `Date: ${post.sourceDate}` : ""}
${post.metrics ? `Metrics: ${JSON.stringify(post.metrics)}` : ""}
Text: ${post.text}
---`;
      })
      .join("\n");

    return `Analyze these high-performing X posts using the R.E.C.O.N. process.

TARGET AUDIENCE: ${input.audience}
NICHES: ${input.niches.join(", ")}
OBJECTIVE: ${input.objective}
AVAILABLE MEASUREMENTS: ${input.availableMeasurements}

SOURCE POSTS:
${postsText}

Follow the R.E.C.O.N. process:
1. RETRIEVE: Identify which posts outperform comparators
2. EXAMINE: Decode context (cultural moment, audience, network, target, evidence, format, transferable principle)
3. CLASSIFY: Identify mechanisms from the 12 mechanisms list
4. ORIGINATE: Generate 5 ORIGINAL angles using F1-F8 frameworks
5. NORMALIZE: Create test plan

KEY RULES:
- Separate observable facts, hypotheses, and unknowns
- Never invent source posts or metrics
- Abstract mechanisms, don't replicate wording
- Generate ORIGINAL claims for YOUR audience/niches
- Each angle needs distinct claim + practical relevance
- Rank on relevance, specificity, value, credibility, novelty
- No guaranteed virality predictions
- Label all uncertainty appropriately`;
  }
}

export async function createViralAnalystAgent(ai: AIProvider): Promise<ViralAnalystAgent> {
  return new ViralAnalystAgent(ai);
}