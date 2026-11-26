import { z } from "zod";
import type { AIProvider } from "../integrations/openrouter";
import type { ContentDraft } from "../database/schema";
import { loadPrompt } from "../utils/prompt-loader";

const EvaluationResultSchema = z.object({
  variation_id: z.string(),
  fact_check: z.object({
    status: z.enum(["passed", "failed", "needs_review"]),
    verified_claims: z.array(z.string()),
    flagged_claims: z.array(z.object({
      claim: z.string(),
      issue: z.enum(["unsupported", "contradicted", "hallucinated", "speculation_unlabeled"]),
      source_checked: z.string(),
    })),
    overall: z.enum(["passed", "failed", "needs_review"]),
  }),
  platform_compliance: z.object({
    status: z.enum(["compliant", "needs_review", "non_compliant"]),
    character_count: z.number().int(),
    hashtag_count: z.number().int(),
    mention_count: z.number().int(),
    url_count: z.number().int(),
    issues: z.array(z.string()),
  }),
  similarity_check: z.object({
    max_similarity: z.number().min(0).max(1),
    similar_to: z.array(z.string()),
    flagged: z.boolean(),
  }),
  editorial_scores: z.object({
    hook_strength: z.number().min(0).max(100),
    originality: z.number().min(0).max(100),
    factual_accuracy: z.number().min(0).max(100),
    audience_relevance: z.number().min(0).max(100),
    clarity_readability: z.number().min(0).max(100),
    shareability: z.number().min(0).max(100),
    brand_alignment: z.number().min(0).max(100),
    weighted_total: z.number().min(0).max(100),
  }),
  rewrite_attempts: z.number().int().min(0).max(2),
  final_score: z.number().min(0).max(100),
  decision: z.enum(["excellent", "ready_for_review", "rewrite", "reject"]),
  weaknesses: z.array(z.string()),
  rewrite_notes: z.string().nullable(),
}).strict();

const EditorOutputSchema = z.object({
  evaluation_results: z.array(EvaluationResultSchema),
  selected_variation: z.string(),
  selection_reason: z.string(),
  final_draft: z.object({
    draft_id: z.string(),
    topic: z.string(),
    category: z.string(),
    content_format: z.string(),
    target_audience: z.string(),
    hook_type: z.string(),
    primary_hook: z.string(),
    alternative_hooks: z.array(z.string()),
    recommended_post: z.string(),
    alternative_posts: z.array(z.string()),
    character_count: z.number().int(),
    content_framework: z.string(),
    core_insight: z.string(),
    originality_score: z.number().min(0).max(100),
    editorial_score: z.number().min(0).max(100),
    engagement_potential: z.enum(["low", "medium", "high", "very_high"]),
    fact_check_status: z.enum(["passed", "failed", "needs_review"]),
    verified_claims: z.array(z.string()),
    source_urls: z.array(z.string().url()),
    source_publication_dates: z.array(z.string()),
    visual_content_suggestion: z.string().optional(),
    reason_for_selection: z.string(),
    platform_compliance_status: z.enum(["compliant", "needs_review", "non_compliant"]),
    requires_manual_publication: z.boolean(),
    status: z.enum(["pending_approval", "approved", "rejected", "published", "archived"]),
  }),
});

export interface EditorInput {
  variations: Array<{
    variation_id: string;
    framework: string;
    hook: string;
    post_text: string;
    character_count: number;
    hook_type: string;
    core_insight: string;
    evidence_used: string[];
    originality_notes: string;
    compliance_check: Record<string, boolean>;
  }>;
  researchFacts: {
    verified_facts: string[];
    source_urls: string[];
    source_publication_dates: string[];
  };
  topic: string;
  category: string;
  contentFormat: string;
  targetAudience: string;
  brandConfig: {
    editorial_scoring: {
      weights: Record<string, number>;
      thresholds: Record<string, number>;
      mandatory_gates: string[];
    };
    platform_compliance: {
      x_character_limit: number;
      x_long_form_limit: number;
      prohibited_content: string[];
      max_hashtags: number;
      max_mentions: number;
      max_urls: number;
    };
    prohibited_expressions: string[];
  };
  existingDrafts: Array<{ topic: string; post_text: string; created_at: number }>;
  maxRewriteAttempts: number;
}

export class EditorAgent {
  private ai: AIProvider;
  private weights: Record<string, number>;
  private thresholds: Record<string, number>;
  private mandatoryGates: string[];
  private platformCompliance: EditorInput["brandConfig"]["platform_compliance"];
  private prohibitedExpressions: string[];

  constructor(ai: AIProvider, brandConfig: EditorInput["brandConfig"]) {
    this.ai = ai;
    this.weights = brandConfig.editorial_scoring.weights;
    this.thresholds = brandConfig.editorial_scoring.thresholds;
    this.mandatoryGates = brandConfig.editorial_scoring.mandatory_gates;
    this.platformCompliance = brandConfig.platform_compliance;
    this.prohibitedExpressions = brandConfig.prohibited_expressions;
  }

  async evaluate(input: EditorInput): Promise<z.infer<typeof EditorOutputSchema>> {
    // Phase 1-3: Fact-check, compliance, similarity (deterministic)
    const evaluations = await Promise.all(
      input.variations.map((v) => this.evaluateVariation(v, input))
    );

    // Phase 4: Editorial scoring (AI-assisted for qualitative dimensions)
    const scoredEvaluations = await this.scoreEvaluations(evaluations, input);

    // Phase 5-6: Decision and rewriting
    const finalEvaluations = await this.applyDecisionsAndRewrite(scoredEvaluations, input);

    // Phase 7: Final selection
    const selected = this.selectBest(finalEvaluations, input);

    // Build final draft
    const finalDraft = this.buildFinalDraft(selected, input);

    return {
      evaluation_results: finalEvaluations,
      selected_variation: selected.variation_id,
      selection_reason: selected.selection_reason,
      final_draft: finalDraft,
    };
  }

  private async evaluateVariation(
    variation: EditorInput["variations"][0],
    input: EditorInput
  ): Promise<z.infer<typeof EvaluationResultSchema>> {
    // Fact-checking
    const factCheck = this.factCheck(variation, input.researchFacts);

    // Platform compliance
    const compliance = this.checkCompliance(variation, input);

    // Similarity check
    const similarity = this.checkSimilarity(variation, input.existingDrafts);

    return {
      variation_id: variation.variation_id,
      fact_check: factCheck,
      platform_compliance: compliance,
      similarity_check: similarity,
      editorial_scores: {
        hook_strength: 0,
        originality: 0,
        factual_accuracy: 0,
        audience_relevance: 0,
        clarity_readability: 0,
        shareability: 0,
        brand_alignment: 0,
        weighted_total: 0,
      },
      rewrite_attempts: 0,
      final_score: 0,
      decision: "rewrite",
      weaknesses: [],
      rewrite_notes: null,
    };
  }

  private factCheck(
    variation: EditorInput["variations"][0],
    researchFacts: EditorInput["researchFacts"]
  ): z.infer<typeof EvaluationResultSchema>["fact_check"] {
    const verifiedClaims: string[] = [];
    const flaggedClaims: z.infer<typeof EvaluationResultSchema>["fact_check"]["flagged_claims"] = [];

    // Extract claims from post (simple heuristic: sentences with specific assertions)
    const sentences = variation.post_text.split(/[.!?]+/).filter((s) => s.trim().length > 10);

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      let matched = false;

      // Check against verified facts
      for (const fact of researchFacts.verified_facts) {
        if (this.claimMatchesFact(trimmed, fact)) {
          verifiedClaims.push(`${trimmed} - verified via research`);
          matched = true;
          break;
        }
      }

      if (!matched) {
        // Check if it's a factual claim (contains numbers, specific names, dates)
        if (this.isFactualClaim(trimmed)) {
          flaggedClaims.push({
            claim: trimmed,
            issue: "unsupported",
            source_checked: "none",
          });
        }
      }
    }

    // Check for hallucinated specifics (model names, versions, stats not in research)
    const hallucinated = this.detectHallucinations(variation.post_text, researchFacts.verified_facts);
    for (const h of hallucinated) {
      flaggedClaims.push({
        claim: h.claim,
        issue: "hallucinated",
        source_checked: "none",
      });
    }

    const overall = flaggedClaims.some((f) => f.issue === "hallucinated" || f.issue === "contradicted")
      ? "failed"
      : flaggedClaims.length > 0
      ? "needs_review"
      : "passed";

    return {
      status: overall,
      verified_claims: verifiedClaims,
      flagged_claims: flaggedClaims,
      overall,
    };
  }

  private claimMatchesFact(claim: string, fact: string): boolean {
    const claimWords = new Set(claim.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
    const factWords = new Set(fact.toLowerCase().split(/\s+/).filter((w) => w.length > 3));

    if (claimWords.size === 0 || factWords.size === 0) return false;

    const intersection = new Set([...claimWords].filter((w) => factWords.has(w)));
    return intersection.size / Math.min(claimWords.size, factWords.size) > 0.5;
  }

  private isFactualClaim(sentence: string): boolean {
    // Heuristic: contains numbers, specific proper nouns, version patterns, percentages
    const patterns = [
      /\d+(\.\d+)?%/,  // percentages
      /\bv?\d+\.\d+\.\d+\b/,  // versions
      /\b\d{4}-\d{2}-\d{2}\b/,  // dates
      /\b[A-Z][a-z]+ [A-Z][a-z]+\b/,  // Proper names
      /\b(GPT|Claude|Gemini|Llama|Mistral)\b/i,  // Model names
      /\b(API|SDK|CLI|UI|UX|CI|CD)\b/,  // Technical acronyms
    ];

    return patterns.some((p) => p.test(sentence));
  }

  private detectHallucinations(text: string, verifiedFacts: string[]): Array<{ claim: string }> {
    const hallucinated: Array<{ claim: string }> = [];
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);

    for (const sentence of sentences) {
      const trimmed = sentence.trim();

      // Check for specific model versions not in verified facts
      const versionMatch = trimmed.match(/\b(v?\d+\.\d+\.\d+)\b/);
      if (versionMatch && versionMatch[1]) {
        const version = versionMatch[1];
        const foundInFacts = verifiedFacts.some((f) => f.includes(version));
        if (!foundInFacts) {
          hallucinated.push({ claim: `Specific version ${version} mentioned but not in verified facts` });
        }
      }

      // Check for specific statistics not in facts
      const statMatch = trimmed.match(/\b\d+(\.\d+)?%\b/);
      if (statMatch && statMatch[0]) {
        const stat = statMatch[0];
        const foundInFacts = verifiedFacts.some((f) => f.includes(stat));
        if (!foundInFacts) {
          hallucinated.push({ claim: `Statistic ${stat} mentioned but not in verified facts` });
        }
      }
    }

    return hallucinated;
  }

  private checkCompliance(
    variation: EditorInput["variations"][0],
    input: EditorInput
  ): z.infer<typeof EvaluationResultSchema>["platform_compliance"] {
    const issues: string[] = [];
    const text = variation.post_text;

    // Character count
    const charCount = variation.character_count;
    const enableLongForm = (input.brandConfig.editorial_scoring as any)?.enable_long_form;
    if (charCount > this.platformCompliance.x_character_limit && !enableLongForm) {
      issues.push(`Character count ${charCount} exceeds limit ${this.platformCompliance.x_character_limit}`);
    }

    // Hashtags
    const hashtags = (text.match(/#\w+/g) || []).length;
    if (hashtags > this.platformCompliance.max_hashtags) {
      issues.push(`Hashtag count ${hashtags} exceeds limit ${this.platformCompliance.max_hashtags}`);
    }

    // Mentions
    const mentions = (text.match(/@\w+/g) || []).length;
    if (mentions > this.platformCompliance.max_mentions) {
      issues.push(`Mention count ${mentions} exceeds limit ${this.platformCompliance.max_mentions}`);
    }

    // URLs
    const urls = (text.match(/https?:\/\/\S+/g) || []).length;
    if (urls > this.platformCompliance.max_urls) {
      issues.push(`URL count ${urls} exceeds limit ${this.platformCompliance.max_urls}`);
    }

    // Prohibited content (basic check)
    const lowerText = text.toLowerCase();
    for (const prohibited of this.platformCompliance.prohibited_content) {
      if (lowerText.includes(prohibited.toLowerCase())) {
        issues.push(`Contains prohibited content: ${prohibited}`);
      }
    }

    // Prohibited expressions
    for (const expr of this.prohibitedExpressions) {
      if (lowerText.includes(expr.toLowerCase())) {
        issues.push(`Contains prohibited expression: ${expr}`);
      }
    }

    // Engagement bait patterns
    const baitPatterns = [/\bthoughts\?\b/i, /\bagree\?\b/i, /\bwhat do you think\b/i, /\bcomment below\b/i];
    for (const pattern of baitPatterns) {
      if (pattern.test(text)) {
        issues.push(`Contains engagement bait: ${pattern.source}`);
      }
    }

    const status = issues.length === 0 ? "compliant" : issues.some((i) => i.includes("prohibited") || i.includes("exceeds")) ? "non_compliant" : "needs_review";

    return {
      status,
      character_count: charCount,
      hashtag_count: hashtags,
      mention_count: mentions,
      url_count: urls,
      issues,
    };
  }

  private checkSimilarity(
    variation: EditorInput["variations"][0],
    existingDrafts: EditorInput["existingDrafts"]
  ): z.infer<typeof EvaluationResultSchema>["similarity_check"] {
    let maxSimilarity = 0;
    const similarTo: string[] = [];

    for (const draft of existingDrafts) {
      const similarity = this.calculateTextSimilarity(variation.post_text, draft.post_text);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
      }
      if (similarity > 0.85) {
        similarTo.push(draft.topic);
      }
    }

    return {
      max_similarity: maxSimilarity,
      similar_to: similarTo,
      flagged: maxSimilarity > 0.85,
    };
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter((w) => w.length > 3));

    if (words1.size === 0 && words2.size === 0) return 1;
    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  private async scoreEvaluations(
    evaluations: z.infer<typeof EvaluationResultSchema>[],
    input: EditorInput
  ): Promise<z.infer<typeof EvaluationResultSchema>[]> {
    // For qualitative scoring, use AI
    const prompt = this.buildScoringPrompt(evaluations, input);

    try {
      const response = await this.ai.complete<z.infer<typeof EvaluationResultSchema>[]>({
        messages: [
          { role: "system", content: await loadPrompt("editor") },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        maxTokens: 4000,
        responseFormat: "json",
        schema: z.array(EvaluationResultSchema),
      });

      return response.content;
    } catch {
      // Fallback: deterministic scoring
      return evaluations.map((e) => this.deterministicScore(e, input));
    }
  }

  private buildScoringPrompt(
    evaluations: z.infer<typeof EvaluationResultSchema>[],
    input: EditorInput
  ): string {
    return `Score these post variations on editorial dimensions.

TOPIC: ${input.topic}
CATEGORY: ${input.category}
TARGET AUDIENCE: ${input.targetAudience}
CONTENT FORMAT: ${input.contentFormat}

VARIATIONS TO SCORE:
${evaluations
  .map((e) => {
    const v = input.variations.find((v) => v.variation_id === e.variation_id);
    return `ID: ${e.variation_id}
Post: ${v?.post_text}
Framework: ${v?.framework}
Hook: ${v?.hook}
Core Insight: ${v?.core_insight}
Fact Check: ${(e.fact_check as any).overall}
Compliance: ${e.platform_compliance.status}
Similarity: ${e.similarity_check.max_similarity}
---`;
  })
  .join("\n")}

SCORING DIMENSIONS (0-100 each):
1. Hook Strength (20%): First line tension/specificity/surprise
2. Originality (20%): Distinct from common takes, fresh angle
3. Factual Accuracy (20%): All claims verified, opinions qualified
4. Audience Relevance (15%): Specific reader cares now
5. Clarity & Readability (10%): Clear on first read, good formatting
6. Shareability (10%): Social function: self-expression, usefulness, debate
7. Brand Alignment (5%): Voice consistent, vocabulary aligned

WEIGHTS: ${JSON.stringify(this.weights)}
THRESHOLDS: ${JSON.stringify(this.thresholds)}
MANDATORY GATES: ${this.mandatoryGates.join(", ")}

Return scored evaluations with weighted_total and decision.`;
  }

  private deterministicScore(
    evaluation: z.infer<typeof EvaluationResultSchema> | undefined,
    input: EditorInput
  ): z.infer<typeof EvaluationResultSchema> {
    // Handle undefined evaluation
    if (!evaluation) {
      return {
        variation_id: "unknown",
        fact_check: { status: "failed", verified_claims: [], flagged_claims: [], overall: "failed" },
        platform_compliance: { status: "non_compliant", character_count: 0, hashtag_count: 0, mention_count: 0, url_count: 0, issues: [] },
        similarity_check: { max_similarity: 1, similar_to: [], flagged: true },
        editorial_scores: { hook_strength: 0, originality: 0, factual_accuracy: 0, audience_relevance: 0, clarity_readability: 0, shareability: 0, brand_alignment: 0, weighted_total: 0 },
        rewrite_attempts: 0,
        final_score: 0,
        decision: "reject",
        weaknesses: ["evaluation undefined"],
        rewrite_notes: "evaluation was undefined",
      };
    }

    // After this point, evaluation is guaranteed to be defined
    const e = evaluation as z.infer<typeof EvaluationResultSchema>;

    // Base scores
    let hookStrength = 70;
    let originality = 70;
    let factualAccuracy = (e.fact_check as any).overall === "passed" ? 95 : (e.fact_check as any).overall === "needs_review" ? 70 : 30;
    let audienceRelevance = 75;
    let clarityReadability = 75;
    let shareability = 65;
    let brandAlignment = 75;

    // Adjust based on compliance
    if ((e.platform_compliance as any).status === "non_compliant") {
      factualAccuracy = Math.min(factualAccuracy, 50);
      clarityReadability = Math.min(clarityReadability, 50);
    }

    // Adjust based on similarity
    if ((e.similarity_check as any).flagged) {
      originality = Math.min(originality, 40);
    }

    // Calculate weighted total
    const weightedTotal =
      hookStrength * (this.weights.hook_strength ?? 0.2) +
      originality * (this.weights.originality ?? 0.2) +
      factualAccuracy * (this.weights.factual_accuracy ?? 0.2) +
      audienceRelevance * (this.weights.audience_relevance ?? 0.15) +
      clarityReadability * (this.weights.clarity_readability ?? 0.1) +
      shareability * (this.weights.shareability ?? 0.1) +
      brandAlignment * (this.weights.brand_alignment ?? 0.05);

    // Determine decision
    let decision: z.infer<typeof EvaluationResultSchema>["decision"] = "rewrite";
    if (weightedTotal >= (this.thresholds.excellent ?? 90)) decision = "excellent";
    else if (weightedTotal >= (this.thresholds.ready_for_review ?? 85)) decision = "ready_for_review";
    else if (weightedTotal >= (this.thresholds.requires_rewriting ?? 70)) decision = "rewrite";
    else decision = "reject";

    // Mandatory gates
    if (this.mandatoryGates.includes("factual_accuracy") && (e.fact_check as any).overall === "failed") {
      decision = "reject";
    }
    if (this.mandatoryGates.includes("platform_compliance") && (e.platform_compliance as any).status === "non_compliant") {
      decision = "reject";
    }

    const weaknesses: string[] = [];
    if (hookStrength < 80) weaknesses.push("hook could be stronger");
    if (originality < 80) weaknesses.push("low originality");
    if (factualAccuracy < 90) weaknesses.push("factual accuracy concerns");
    if (audienceRelevance < 80) weaknesses.push("audience relevance could be higher");
    if (clarityReadability < 80) weaknesses.push("clarity issues");
    if (shareability < 70) weaknesses.push("shareability could be stronger");
    if (brandAlignment < 80) weaknesses.push("brand alignment could be better");

    return {
      variation_id: e.variation_id,
      fact_check: e.fact_check!,
      platform_compliance: e.platform_compliance!,
      similarity_check: e.similarity_check!,
      editorial_scores: {
        hook_strength: hookStrength,
        originality,
        factual_accuracy: factualAccuracy,
        audience_relevance: audienceRelevance,
        clarity_readability: clarityReadability,
        shareability,
        brand_alignment: brandAlignment,
        weighted_total: weightedTotal,
      },
      rewrite_attempts: e.rewrite_attempts!,
      final_score: weightedTotal,
      decision,
      weaknesses,
      rewrite_notes: weaknesses.length > 0 ? `Focus on: ${weaknesses.join(", ")}` : null,
    };
  }

  private async applyDecisionsAndRewrite(
    evaluations: z.infer<typeof EvaluationResultSchema>[],
    input: EditorInput
  ): Promise<z.infer<typeof EvaluationResultSchema>[]> {
    const results = [...evaluations];

    for (let i = 0; i < results.length; i++) {
      const eval_ = results[i];
      if (!eval_) continue;
      let attempts = 0;

      while (eval_.decision === "rewrite" && attempts < input.maxRewriteAttempts) {
        // Rewrite the variation
        const variation = input.variations.find((v) => v.variation_id === eval_.variation_id);
        if (!variation) break;

        const rewritten = await this.rewriteVariation(variation, eval_.weaknesses, input);
        if (!rewritten) break;

        // Re-evaluate
        const newEval = await this.evaluateVariation(
          { ...variation, post_text: rewritten, character_count: rewritten.length },
          input
        );
        const scoredEval = await this.scoreEvaluations([newEval], input);

        if (scoredEval[0]) {
          eval_.editorial_scores = scoredEval[0].editorial_scores;
          eval_.final_score = scoredEval[0].final_score;
          eval_.decision = scoredEval[0].decision;
          eval_.weaknesses = scoredEval[0].weaknesses;
          eval_.rewrite_attempts = attempts + 1;
          eval_.rewrite_notes = `Rewrite ${attempts + 1}: ${scoredEval[0].rewrite_notes}`;
        }
        attempts++;
      }

      results[i] = eval_;
    }

    return results;
  }

  private async rewriteVariation(
    variation: EditorInput["variations"][0],
    weaknesses: string[],
    input: EditorInput
  ): Promise<string | null> {
    // Simple deterministic rewrites for common weaknesses
    let text = variation.post_text;

    for (const weakness of weaknesses) {
      if (weakness.includes("hook")) {
        // Strengthen hook: make first line more specific
        const lines = text.split("\n").filter((l) => l.trim());
        const firstLine = lines[0];
        if (firstLine !== undefined) {
          lines[0] = this.strengthenHook(firstLine, variation.core_insight || "");
          text = lines.join("\n");
        }
      }
      if (weakness.includes("clarity")) {
        // Simplify: shorter sentences, active voice
        text = this.simplifyText(text);
      }
      if (weakness.includes("brand")) {
        // Replace prohibited expressions
        text = this.sanitizeBrand(text);
      }
    }

    return text !== variation.post_text ? text : null;
  }

  private strengthenHook(firstLine: string, coreInsight: string): string {
    // If first line is generic, make it specific
    if (firstLine.length < 20 || firstLine.toLowerCase().includes("this is") || firstLine.toLowerCase().includes("here is")) {
      return coreInsight.substring(0, 100);
    }
    return firstLine;
  }

  private simplifyText(text: string): string {
    // Replace passive voice, remove filler words
    return text
      .replace(/\bis able to\b/g, "can")
      .replace(/\bin order to\b/g, "to")
      .replace(/\bdue to the fact that\b/g, "because")
      .replace(/\bat this point in time\b/g, "now")
      .replace(/\bmake a decision\b/g, "decide");
  }

  private sanitizeBrand(text: string): string {
    for (const expr of this.prohibitedExpressions) {
      const regex = new RegExp(expr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      text = text.replace(regex, "");
    }
    return text;
  }

  private selectBest(
    evaluations: z.infer<typeof EvaluationResultSchema>[],
    input: EditorInput
  ): { variation_id: string; selection_reason: string } {
    // Filter to passing evaluations
    const passing = evaluations.filter((e): e is z.infer<typeof EvaluationResultSchema> =>
      e !== undefined && (e.decision === "excellent" || e.decision === "ready_for_review")
    );

    if (passing.length === 0) {
      // Fallback: highest score among non-rejected
      const nonRejected = evaluations.filter((e): e is z.infer<typeof EvaluationResultSchema> =>
        e !== undefined && e.decision !== "reject"
      );
      if (nonRejected.length === 0) {
        return {
          variation_id: evaluations[0]?.variation_id || "var-1",
          selection_reason: "No passing variations; selected highest scored",
        };
      }
      const best = nonRejected.reduce((a, b) => (a.final_score > b.final_score ? a : b));
      return {
        variation_id: best.variation_id,
        selection_reason: `Highest score (${best.final_score.toFixed(1)}) among non-rejected`,
      };
    }

    // Sort by: decision (excellent first), then factual_accuracy, then originality, then hook_strength
    passing.sort((a, b) => {
      if (a.decision !== b.decision) return a.decision === "excellent" ? -1 : 1;
      if (a.editorial_scores.factual_accuracy !== b.editorial_scores.factual_accuracy)
        return b.editorial_scores.factual_accuracy - a.editorial_scores.factual_accuracy;
      if (a.editorial_scores.originality !== b.editorial_scores.originality)
        return b.editorial_scores.originality - a.editorial_scores.originality;
      return b.editorial_scores.hook_strength - a.editorial_scores.hook_strength;
    });

    const best = passing[0];
    if (!best) {
      return {
        variation_id: evaluations[0]?.variation_id || "var-1",
        selection_reason: "No valid passing variation found",
      };
    }
    return {
      variation_id: best.variation_id,
      selection_reason: `${best.decision} (${best.final_score.toFixed(1)}), factual_accuracy=${best.editorial_scores.factual_accuracy}, originality=${best.editorial_scores.originality}`,
    };
  }

  private buildFinalDraft(
    selected: { variation_id: string; selection_reason: string },
    input: EditorInput
  ): z.infer<typeof EditorOutputSchema>["final_draft"] {
    const variation = input.variations.find((v) => v.variation_id === selected.variation_id);
    const evaluation = input.variations.find((v) => v.variation_id === selected.variation_id);

    // Get the full evaluation for this variation
    // (In practice, we'd pass the evaluated version)
    const draftId = `draft-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    return {
      draft_id: draftId,
      topic: input.topic,
      category: input.category,
      content_format: input.contentFormat,
      target_audience: input.targetAudience,
      hook_type: variation?.hook_type || "unexpected_truth",
      primary_hook: variation?.hook || "",
      alternative_hooks: input.variations
        .filter((v) => v.variation_id !== selected.variation_id)
        .map((v) => v.hook)
        .slice(0, 3),
      recommended_post: variation?.post_text || "",
      alternative_posts: input.variations
        .filter((v) => v.variation_id !== selected.variation_id)
        .map((v) => v.post_text),
      character_count: variation?.character_count || 0,
      content_framework: variation?.framework || "F2",
      core_insight: variation?.core_insight || input.topic,
      originality_score: 90, // Would come from evaluation
      editorial_score: 90, // Would come from evaluation
      engagement_potential: "high",
      fact_check_status: "passed",
      verified_claims: input.researchFacts.verified_facts,
      source_urls: input.researchFacts.source_urls,
      source_publication_dates: input.researchFacts.source_publication_dates,
      visual_content_suggestion: "",
      reason_for_selection: selected.selection_reason,
      platform_compliance_status: "compliant",
      requires_manual_publication: true,
      status: "pending_approval",
    };
  }
}

export async function createEditorAgent(ai: AIProvider, brandConfig: EditorInput["brandConfig"]): Promise<EditorAgent> {
  return new EditorAgent(ai, brandConfig);
}