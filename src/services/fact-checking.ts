import { z } from "zod";

export const ClaimSchema = z.object({
  text: z.string(),
  type: z.enum(["fact", "statistic", "date", "version", "quote", "prediction", "opinion"]),
  confidence: z.number().min(0).max(1),
  source_urls: z.array(z.string().url()),
  verification_status: z.enum(["verified", "unverified", "contradicted", "speculative"]),
});

export type Claim = z.infer<typeof ClaimSchema>;

export const FactCheckResultSchema = z.object({
  overall_status: z.enum(["passed", "failed", "needs_review"]),
  claims: z.array(ClaimSchema),
  summary: z.string(),
  requires_human_review: z.boolean(),
});

export type FactCheckResult = z.infer<typeof FactCheckResultSchema>;

export interface FactCheckerConfig {
  requireMultipleSources: boolean;
  minSourceCredibility: number;
  trustedDomains: string[];
}

export class FactCheckingService {
  private config: FactCheckerConfig;

  constructor(config: FactCheckerConfig) {
    this.config = config;
  }

  static default(): FactCheckingService {
    return new FactCheckingService({
      requireMultipleSources: true,
      minSourceCredibility: 7,
      trustedDomains: [
        "openai.com",
        "anthropic.com",
        "huggingface.co",
        "github.com",
        "blog.cloudflare.com",
        "vercel.com",
        "supabase.com",
        "planetscale.com",
        "linear.app",
        "stripe.com",
        "aws.amazon.com",
        "cloud.google.com",
        "arxiv.org",
      ],
    });
  }

  async factCheck(postText: string, verifiedFacts: string[], sourceUrls: string[]): Promise<FactCheckResult> {
    // Extract claims from post
    const claims = this.extractClaims(postText);

    // Verify each claim
    const verifiedClaims: Claim[] = [];

    for (const claim of claims) {
      const verification = await this.verifyClaim(claim, verifiedFacts, sourceUrls);
      verifiedClaims.push(verification);
    }

    // Determine overall status
    const hasFailed = verifiedClaims.some((c) => c.verification_status === "contradicted");
    const hasUnverified = verifiedClaims.some((c) => c.verification_status === "unverified");
    const hasSpeculative = verifiedClaims.some((c) => c.verification_status === "speculative");

    let overallStatus: FactCheckResult["overall_status"] = "passed";
    if (hasFailed) overallStatus = "failed";
    else if (hasUnverified || hasSpeculative) overallStatus = "needs_review";

    const requiresHumanReview = hasFailed || hasSpeculative;

    return {
      overall_status: overallStatus,
      claims: verifiedClaims,
      summary: this.generateSummary(verifiedClaims),
      requires_human_review: requiresHumanReview,
    };
  }

  private extractClaims(text: string): Claim[] {
    const claims: Claim[] = [];
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      const claim = this.classifyClaim(trimmed);
      if (claim) {
        claims.push(claim);
      }
    }

    return claims;
  }

  private classifyClaim(sentence: string): Claim | null {
    const lower = sentence.toLowerCase();

    // Check for opinion markers
    const opinionMarkers = ["i think", "i believe", "in my opinion", "it seems", "appears to", "likely", "probably", "maybe", "could be"];
    const isOpinion = opinionMarkers.some((m) => lower.includes(m));

    // Check for prediction markers
    const predictionMarkers = ["will", "predict", "forecast", "expect", "future", "coming", "next year", "soon"];
    const isPrediction = predictionMarkers.some((m) => lower.includes(m)) && !isOpinion;

    // Check for speculative markers
    const speculativeMarkers = ["might", "could", "may", "possibly", "potentially", "speculat"];
    const isSpeculative = speculativeMarkers.some((m) => lower.includes(m));

    let type: Claim["type"] = "fact";
    if (isOpinion) type = "opinion";
    else if (isPrediction) type = "prediction";
    else if (isSpeculative) type = "prediction"; // Treat speculative as prediction for type, will be marked speculative in verification
    else if (/\d+(\.\d+)?%/.test(sentence)) type = "statistic";
    else if (/\bv?\d+\.\d+\.\d+\b/.test(sentence)) type = "version";
    else if (/\b\d{4}-\d{2}-\d{2}\b/.test(sentence)) type = "date";
    else if (/["'`].+["'`]/.test(sentence)) type = "quote";

    return {
      text: sentence,
      type,
      confidence: isOpinion ? 0.3 : isPrediction ? 0.4 : isSpeculative ? 0.5 : 0.8,
      source_urls: [],
      verification_status: "unverified",
    };
  }

  private async verifyClaim(
    claim: Claim,
    verifiedFacts: string[],
    sourceUrls: string[]
  ): Promise<Claim> {
    // Check for contradictions first so opposing claims aren't falsely marked verified
    for (const fact of verifiedFacts) {
      if (this.claimContradictsFact(claim.text, fact)) {
        return {
          ...claim,
          verification_status: "contradicted",
          confidence: 0.1,
        };
      }
    }

    // Check against verified facts
    for (const fact of verifiedFacts) {
      if (this.claimMatchesFact(claim.text, fact)) {
        return {
          ...claim,
          verification_status: "verified",
          source_urls: sourceUrls,
          confidence: Math.min(claim.confidence + 0.3, 1.0),
        };
      }
    }

    // For predictions, mark as speculative if not clearly labeled, verified if clearly labeled
    if (claim.type === "prediction") {
      if (!this.isClearlyLabeledPrediction(claim.text)) {
        return {
          ...claim,
          verification_status: "speculative",
          confidence: Math.min(claim.confidence, 0.5),
        };
      }
      return {
        ...claim,
        verification_status: "verified",
        confidence: 0.7,
      };
    }

    if (claim.type === "opinion") {
      return {
        ...claim,
        verification_status: "verified", // Opinions are verified as opinions
        confidence: 0.9,
      };
    }

    // Unverified factual claim
    return {
      ...claim,
      verification_status: "unverified",
      confidence: Math.max(claim.confidence - 0.2, 0.1),
    };
  }

  private claimMatchesFact(claim: string, fact: string): boolean {
    const stopwords = new Set([
      "is", "are", "was", "were", "be", "been", "has", "have", "had",
      "the", "and", "or", "for", "with", "now", "much", "very", "this",
      "that", "in", "on", "at", "to", "of", "by", "from", "as",
    ]);
    const tokenize = (s: string) =>
      new Set(
        s
          .toLowerCase()
          .replace(/[^\w.%\s-]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length >= 2 && !stopwords.has(w))
      );

    const claimWords = tokenize(claim);
    const factWords = tokenize(fact);

    if (claimWords.size === 0 || factWords.size === 0) return false;

    const intersection = new Set([...claimWords].filter((w) => factWords.has(w)));
    const overlap = intersection.size / Math.min(claimWords.size, factWords.size);

    return overlap > 0.5;
  }

  private claimContradictsFact(claim: string, fact: string): boolean {
    // Simple contradiction detection: same entities, opposite assertions
    const claimLower = claim.toLowerCase();
    const factLower = fact.toLowerCase();

    // Check for negation patterns
    const negationPairs: Array<[string, string]> = [
      ["increase", "decrease"],
      ["improve", "worsen"],
      ["better", "worse"],
      ["faster", "slower"],
      ["more", "less"],
      ["higher", "lower"],
      ["success", "failure"],
      ["works", "fails"],
      ["secure", "vulnerable"],
      ["reliable", "unreliable"],
    ];

    for (const [pos, neg] of negationPairs) {
      if (claimLower.includes(pos) && factLower.includes(neg)) return true;
      if (claimLower.includes(neg) && factLower.includes(pos)) return true;
    }

    return false;
  }

  private isClearlyLabeledPrediction(text: string): boolean {
    const labels = ["prediction:", "forecast:", "i predict", "my forecast", "expect", "will likely", "project"];
    const lower = text.toLowerCase();
    return labels.some((l) => lower.includes(l));
  }

  private extractVersion(text: string): string | undefined {
    const match = text.match(/\bv?\d+\.\d+\.\d+\b/);
    return match?.[0];
  }

  private extractStatistic(text: string): string | undefined {
    const match = text.match(/\b\d+(\.\d+)?%\b/);
    return match?.[0];
  }

  private generateSummary(claims: Claim[]): string {
    const verified = claims.filter((c) => c.verification_status === "verified").length;
    const unverified = claims.filter((c) => c.verification_status === "unverified").length;
    const contradicted = claims.filter((c) => c.verification_status === "contradicted").length;
    const speculative = claims.filter((c) => c.verification_status === "speculative").length;

    return `Fact-check: ${verified} verified, ${unverified} unverified, ${contradicted} contradicted, ${speculative} speculative claims`;
  }
}

// Export singleton
export const factCheckingService = FactCheckingService.default();