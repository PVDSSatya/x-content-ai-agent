import { z } from "zod";

export const ScoringWeightsSchema = z.object({
  hook_strength: z.number().min(0).max(1),
  originality: z.number().min(0).max(1),
  factual_accuracy: z.number().min(0).max(1),
  audience_relevance: z.number().min(0).max(1),
  clarity_readability: z.number().min(0).max(1),
  shareability: z.number().min(0).max(1),
  brand_alignment: z.number().min(0).max(1),
});

export type ScoringWeights = z.infer<typeof ScoringWeightsSchema>;

export const ScoringThresholdsSchema = z.object({
  excellent: z.number().min(0).max(100),
  ready_for_review: z.number().min(0).max(100),
  requires_rewriting: z.number().min(0).max(100),
  reject: z.number().min(0).max(100),
});

export type ScoringThresholds = z.infer<typeof ScoringThresholdsSchema>;

export interface EditorialScores {
  hook_strength: number;
  originality: number;
  factual_accuracy: number;
  audience_relevance: number;
  clarity_readability: number;
  shareability: number;
  brand_alignment: number;
  weighted_total: number;
}

export class ContentScoringService {
  private weights: ScoringWeights;
  private thresholds: ScoringThresholds;
  private mandatoryGates: string[];

  constructor(
    weights: ScoringWeights,
    thresholds: ScoringThresholds,
    mandatoryGates: string[] = ["factual_accuracy", "platform_compliance"]
  ) {
    this.weights = weights;
    this.thresholds = thresholds;
    this.mandatoryGates = mandatoryGates;
  }

  static default(): ContentScoringService {
    return new ContentScoringService(
      {
        hook_strength: 0.20,
        originality: 0.20,
        factual_accuracy: 0.20,
        audience_relevance: 0.15,
        clarity_readability: 0.10,
        shareability: 0.10,
        brand_alignment: 0.05,
      },
      {
        excellent: 90,
        ready_for_review: 85,
        requires_rewriting: 70,
        reject: 0,
      }
    );
  }

  calculateWeightedScore(scores: Omit<EditorialScores, "weighted_total">): number {
    return (
      scores.hook_strength * this.weights.hook_strength +
      scores.originality * this.weights.originality +
      scores.factual_accuracy * this.weights.factual_accuracy +
      scores.audience_relevance * this.weights.audience_relevance +
      scores.clarity_readability * this.weights.clarity_readability +
      scores.shareability * this.weights.shareability +
      scores.brand_alignment * this.weights.brand_alignment
    );
  }

  determineDecision(
    weightedScore: number,
    factCheckStatus: "passed" | "failed" | "needs_review",
    complianceStatus: "compliant" | "needs_review" | "non_compliant"
  ): "excellent" | "ready_for_review" | "rewrite" | "reject" {
    // Mandatory gates
    if (this.mandatoryGates.includes("factual_accuracy") && factCheckStatus === "failed") {
      return "reject";
    }
    if (this.mandatoryGates.includes("platform_compliance") && complianceStatus === "non_compliant") {
      return "reject";
    }

    if (weightedScore >= this.thresholds.excellent) return "excellent";
    if (weightedScore >= this.thresholds.ready_for_review) return "ready_for_review";
    if (weightedScore >= this.thresholds.requires_rewriting) return "rewrite";
    return "reject";
  }

  getWeaknesses(scores: Omit<EditorialScores, "weighted_total">): string[] {
    const weaknesses: string[] = [];
    const threshold = 80;

    if (scores.hook_strength < threshold) weaknesses.push("hook_strength");
    if (scores.originality < threshold) weaknesses.push("originality");
    if (scores.factual_accuracy < 90) weaknesses.push("factual_accuracy");
    if (scores.audience_relevance < threshold) weaknesses.push("audience_relevance");
    if (scores.clarity_readability < threshold) weaknesses.push("clarity_readability");
    if (scores.shareability < 70) weaknesses.push("shareability");
    if (scores.brand_alignment < threshold) weaknesses.push("brand_alignment");

    return weaknesses;
  }

  getImprovementFocus(weaknesses: string[]): string {
    if (weaknesses.length === 0) return "No significant weaknesses";

    // Priority order for improvements
    const priority = [
      "factual_accuracy",
      "hook_strength",
      "originality",
      "audience_relevance",
      "clarity_readability",
      "brand_alignment",
      "shareability",
    ];

    for (const p of priority) {
      if (weaknesses.includes(p)) {
        return `Focus on improving ${p.replace("_", " ")}`;
      }
    }

    const firstWeakness = weaknesses[0];
    return firstWeakness ? `Focus on improving ${firstWeakness.replace("_", " ")}` : "No significant weaknesses";
  }
}

export const contentScoringService = ContentScoringService.default();