import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditorAgent } from "../src/agents/editor";
import { MockAIProvider } from "../src/integrations/openrouter";

describe("EditorAgent", () => {
  let mockAI: MockAIProvider;
  let editor: EditorAgent;

  const mockVariations = [
    {
      variation_id: "var-1",
      framework: "AIDA",
      hook: "AI makes prototyping faster. But it makes deciding what deserves production more important.",
      post_text: "AI makes prototyping faster. But it makes deciding what deserves production more important. The bottleneck shifted from building to judging. Every team needs a 'production readiness' checklist before shipping AI features.",
      character_count: 245,
      hook_type: "unexpected_truth",
      core_insight: "The bottleneck shifted from building to judging AI features for production",
      evidence_used: ["Claude 3.5 Sonnet released with computer use", "AI prototyping speed increased"],
      originality_notes: "Contrarian take on AI speed vs judgment",
      compliance_check: {
        character_limit: true,
        no_prohibited_expressions: true,
        no_fabricated_experience: true,
        facts_supported: true,
        opinion_qualified: true,
      },
    },
    {
      variation_id: "var-2",
      framework: "PAS",
      hook: "Your AI prototype works perfectly. That's the problem.",
      post_text: "Your AI prototype works perfectly. That's the problem. Demos hide edge cases. Production reveals them. The teams shipping reliable AI aren't building better models. They're building better evaluation and monitoring. Start there.",
      character_count: 267,
      hook_type: "pattern_interruption",
      core_insight: "Production reliability comes from evaluation/monitoring, not better models",
      evidence_used: ["AI prototyping speed increased", "Production reveals edge cases"],
      originality_notes: "Focus on evaluation over model building",
      compliance_check: {
        character_limit: true,
        no_prohibited_expressions: true,
        no_fabricated_experience: true,
        facts_supported: true,
        opinion_qualified: true,
      },
    },
  ];

  const mockResearchFacts = {
    verified_facts: [
      "Claude 3.5 Sonnet released with computer use capability",
      "AI prototyping speed has increased significantly",
      "Production AI systems require evaluation and monitoring",
    ],
    source_urls: [
      "https://anthropic.com/news/claude-3-5-sonnet",
      "https://example.com/ai-production-study",
    ],
    source_publication_dates: [
      "2024-11-25T10:00:00Z",
      "2024-11-20T15:00:00Z",
    ],
  };

  const mockBrandConfig = {
    editorial_scoring: {
      weights: {
        hook_strength: 0.20,
        originality: 0.20,
        factual_accuracy: 0.20,
        audience_relevance: 0.15,
        clarity_readability: 0.10,
        shareability: 0.10,
        brand_alignment: 0.05,
      },
      thresholds: {
        excellent: 90,
        ready_for_review: 85,
        requires_rewriting: 70,
        reject: 0,
      },
      mandatory_gates: ["factual_accuracy", "platform_compliance"],
    },
    platform_compliance: {
      x_character_limit: 280,
      x_long_form_limit: 25000,
      prohibited_content: ["spam", "misinformation", "hate_speech"],
      max_hashtags: 3,
      max_mentions: 2,
      max_urls: 1,
    },
    prohibited_expressions: [
      "game-changer", "revolutionary", "10x", "crush it", "hustle",
    ],
  };

  beforeEach(() => {
    mockAI = new MockAIProvider();
    editor = new EditorAgent(mockAI, mockBrandConfig);
  });

  it("should pass fact-check for verified claims", async () => {
    const input = {
      variations: mockVariations,
      researchFacts: mockResearchFacts,
      topic: "AI Production Readiness",
      category: "ai-agents",
      contentFormat: "educational_insight",
      targetAudience: "AI engineers",
      brandConfig: mockBrandConfig,
      existingDrafts: [],
      maxRewriteAttempts: 2,
    };

    // Mock AI to return scored evaluations
    const mockScored = mockVariations.map((v, i) => ({
      variation_id: v.variation_id,
      fact_check: {
        status: "passed",
        verified_claims: ["AI prototyping faster - verified", "Production needs evaluation - verified"],
        flagged_claims: [],
        overall: "passed",
      },
      platform_compliance: {
        status: "compliant",
        character_count: v.character_count,
        hashtag_count: 0,
        mention_count: 0,
        url_count: 0,
        issues: [],
      },
      similarity_check: {
        max_similarity: 0.2,
        similar_to: [],
        flagged: false,
      },
      editorial_scores: {
        hook_strength: 88,
        originality: 85,
        factual_accuracy: 95,
        audience_relevance: 90,
        clarity_readability: 88,
        shareability: 82,
        brand_alignment: 88,
        weighted_total: 87.5,
      },
      rewrite_attempts: 0,
      final_score: 87.5,
      decision: "ready_for_review",
      weaknesses: ["shareability could be stronger"],
      rewrite_notes: "Focus on improving shareability",
    }));

    mockAI.setResponse("scoring", mockScored);
    mockAI.setResponseForSchema("EvaluationResultSchema", mockScored);

    const result = await editor.evaluate(input);

    expect(result.evaluation_results.length).toBe(2);
    expect(result.evaluation_results[0]?.fact_check.overall).toBe("passed");
    expect(result.evaluation_results[0]?.platform_compliance.status).toBe("compliant");
  });

  it("should fail fact-check for hallucinated claims", async () => {
    const badVariation = {
      ...mockVariations[0]!,
      variation_id: "var-bad",
      post_text: "Claude 3.5 Sonnet achieves 99.9% accuracy on all benchmarks. GPT-5 will be released next week with 10x performance.",
      character_count: 120,
    };

    const input = {
      variations: [badVariation],
      researchFacts: mockResearchFacts,
      topic: "AI Production Readiness",
      category: "ai-agents",
      contentFormat: "educational_insight",
      targetAudience: "AI engineers",
      brandConfig: mockBrandConfig,
      existingDrafts: [],
      maxRewriteAttempts: 2,
    };

    const mockScored = [{
      variation_id: "var-bad",
      fact_check: {
        status: "failed",
        verified_claims: [],
        flagged_claims: [
          { claim: "Claude 3.5 Sonnet achieves 99.9% accuracy on all benchmarks", issue: "hallucinated", source_checked: "none" },
          { claim: "GPT-5 will be released next week with 10x performance", issue: "unsupported", source_checked: "none" },
        ],
        overall: "failed",
      },
      platform_compliance: {
        status: "compliant",
        character_count: 120,
        hashtag_count: 0,
        mention_count: 0,
        url_count: 0,
        issues: [],
      },
      similarity_check: {
        max_similarity: 0.1,
        similar_to: [],
        flagged: false,
      },
      editorial_scores: {
        hook_strength: 70,
        originality: 60,
        factual_accuracy: 20,
        audience_relevance: 70,
        clarity_readability: 75,
        shareability: 65,
        brand_alignment: 70,
        weighted_total: 55,
      },
      rewrite_attempts: 0,
      final_score: 55,
      decision: "reject",
      weaknesses: ["factual accuracy concerns", "low originality"],
      rewrite_notes: "Focus on improving factual_accuracy",
    }];

    mockAI.setResponse("scoring", mockScored);
    mockAI.setResponseForSchema("EvaluationResultSchema", mockScored);

    const result = await editor.evaluate(input);

    expect(result.evaluation_results[0]?.fact_check.overall).toBe("failed");
    expect(result.evaluation_results[0]?.decision).toBe("reject");
    // When only one variation exists and it's rejected, the evaluation result should show reject
    expect(result.evaluation_results[0]?.decision).toBe("reject");
  });

  it("should reject non-compliant posts (over character limit)", async () => {
    const longVariation = {
      ...mockVariations[0]!,
      variation_id: "var-long",
      post_text: "A".repeat(300), // Over 280 limit
      character_count: 300,
    };

    const input = {
      variations: [longVariation],
      researchFacts: mockResearchFacts,
      topic: "AI Production Readiness",
      category: "ai-agents",
      contentFormat: "educational_insight",
      targetAudience: "AI engineers",
      brandConfig: mockBrandConfig,
      existingDrafts: [],
      maxRewriteAttempts: 2,
    };

    const mockScored = [{
      variation_id: "var-long",
      fact_check: {
        status: "passed",
        verified_claims: [],
        flagged_claims: [],
        overall: "passed",
      },
      platform_compliance: {
        status: "non_compliant",
        character_count: 300,
        hashtag_count: 0,
        mention_count: 0,
        url_count: 0,
        issues: ["Character count 300 exceeds limit 280"],
      },
      similarity_check: {
        max_similarity: 0.1,
        similar_to: [],
        flagged: false,
      },
      editorial_scores: {
        hook_strength: 70,
        originality: 70,
        factual_accuracy: 95,
        audience_relevance: 70,
        clarity_readability: 50,
        shareability: 65,
        brand_alignment: 70,
        weighted_total: 68,
      },
      rewrite_attempts: 0,
      final_score: 68,
      decision: "reject",
      weaknesses: ["clarity issues"],
      rewrite_notes: "Focus on improving clarity_readability",
    }];

    mockAI.setResponse("scoring", mockScored);

    const result = await editor.evaluate(input);

    expect(result.evaluation_results[0]?.platform_compliance.status).toBe("non_compliant");
    expect(result.evaluation_results[0]?.decision).toBe("reject");
  });

  it("should reject posts with prohibited expressions", async () => {
    const badVariation = {
      ...mockVariations[0]!,
      variation_id: "var-prohibited",
      post_text: "This game-changing AI will 10x your productivity. Crush it with revolutionary technology!",
      character_count: 95,
    };

    const input = {
      variations: [badVariation],
      researchFacts: mockResearchFacts,
      topic: "AI Production Readiness",
      category: "ai-agents",
      contentFormat: "educational_insight",
      targetAudience: "AI engineers",
      brandConfig: mockBrandConfig,
      existingDrafts: [],
      maxRewriteAttempts: 2,
    };

    const mockScored = [{
      variation_id: "var-prohibited",
      fact_check: {
        status: "passed",
        verified_claims: [],
        flagged_claims: [],
        overall: "passed",
      },
      platform_compliance: {
        status: "non_compliant",
        character_count: 95,
        hashtag_count: 0,
        mention_count: 0,
        url_count: 0,
        issues: ["Contains prohibited expression: game-changer", "Contains prohibited expression: 10x", "Contains prohibited expression: crush it", "Contains prohibited expression: revolutionary"],
      },
      similarity_check: {
        max_similarity: 0.1,
        similar_to: [],
        flagged: false,
      },
      editorial_scores: {
        hook_strength: 60,
        originality: 40,
        factual_accuracy: 95,
        audience_relevance: 60,
        clarity_readability: 70,
        shareability: 50,
        brand_alignment: 30,
        weighted_total: 55,
      },
      rewrite_attempts: 0,
      final_score: 55,
      decision: "reject",
      weaknesses: ["brand alignment could be better", "low originality"],
      rewrite_notes: "Focus on improving brand_alignment",
    }];

    mockAI.setResponse("scoring", mockScored);

    const result = await editor.evaluate(input);

    expect(result.evaluation_results[0]?.platform_compliance.status).toBe("non_compliant");
    expect(result.evaluation_results[0]?.decision).toBe("reject");
  });

  it("should detect similarity to existing drafts", async () => {
    const existingDrafts = [
      {
        topic: "AI Production Readiness",
        post_text: "AI makes prototyping faster. But it makes deciding what deserves production more important. The bottleneck shifted from building to judging.",
        created_at: Date.now() - 24 * 60 * 60 * 1000,
      },
    ];

    const similarVariation = {
      ...mockVariations[0]!,
      variation_id: "var-similar",
      post_text: "AI makes prototyping faster. But it makes deciding what deserves production more important. The bottleneck shifted from building to judging. Every team needs a production checklist.",
      character_count: 250,
    };

    const input = {
      variations: [similarVariation],
      researchFacts: mockResearchFacts,
      topic: "AI Production Readiness",
      category: "ai-agents",
      contentFormat: "educational_insight",
      targetAudience: "AI engineers",
      brandConfig: mockBrandConfig,
      existingDrafts,
      maxRewriteAttempts: 2,
    };

    const mockScored = [{
      variation_id: "var-similar",
      fact_check: {
        status: "passed",
        verified_claims: [],
        flagged_claims: [],
        overall: "passed",
      },
      platform_compliance: {
        status: "compliant",
        character_count: 250,
        hashtag_count: 0,
        mention_count: 0,
        url_count: 0,
        issues: [],
      },
      similarity_check: {
        max_similarity: 0.92,
        similar_to: ["AI Production Readiness"],
        flagged: true,
      },
      editorial_scores: {
        hook_strength: 85,
        originality: 35,
        factual_accuracy: 95,
        audience_relevance: 90,
        clarity_readability: 88,
        shareability: 80,
        brand_alignment: 85,
        weighted_total: 72,
      },
      rewrite_attempts: 0,
      final_score: 72,
      decision: "rewrite",
      weaknesses: ["low originality"],
      rewrite_notes: "Focus on improving originality",
    }];

    mockAI.setResponse("scoring", mockScored);

    const result = await editor.evaluate(input);

    expect(result.evaluation_results[0]?.similarity_check.flagged).toBe(true);
    expect(result.evaluation_results[0]?.editorial_scores.originality).toBeLessThan(50);
  });

  it("should select best variation based on scores", async () => {
    const input = {
      variations: mockVariations,
      researchFacts: mockResearchFacts,
      topic: "AI Production Readiness",
      category: "ai-agents",
      contentFormat: "educational_insight",
      targetAudience: "AI engineers",
      brandConfig: mockBrandConfig,
      existingDrafts: [],
      maxRewriteAttempts: 2,
    };

    const mockScored = [
      {
        variation_id: "var-1",
        fact_check: { status: "passed", verified_claims: [], flagged_claims: [], overall: "passed" },
        platform_compliance: { status: "compliant", character_count: 245, hashtag_count: 0, mention_count: 0, url_count: 0, issues: [] },
        similarity_check: { max_similarity: 0.2, similar_to: [], flagged: false },
        editorial_scores: { hook_strength: 88, originality: 85, factual_accuracy: 95, audience_relevance: 90, clarity_readability: 88, shareability: 82, brand_alignment: 88, weighted_total: 87.5 },
        rewrite_attempts: 0,
        final_score: 87.5,
        decision: "ready_for_review",
        weaknesses: [],
        rewrite_notes: null,
      },
      {
        variation_id: "var-2",
        fact_check: { status: "passed", verified_claims: [], flagged_claims: [], overall: "passed" },
        platform_compliance: { status: "compliant", character_count: 267, hashtag_count: 0, mention_count: 0, url_count: 0, issues: [] },
        similarity_check: { max_similarity: 0.15, similar_to: [], flagged: false },
        editorial_scores: { hook_strength: 92, originality: 90, factual_accuracy: 95, audience_relevance: 92, clarity_readability: 90, shareability: 88, brand_alignment: 90, weighted_total: 90.5 },
        rewrite_attempts: 0,
        final_score: 90.5,
        decision: "excellent",
        weaknesses: [],
        rewrite_notes: null,
      },
    ];

    mockAI.setResponse("scoring", mockScored);

    const result = await editor.evaluate(input);

    expect(result.selected_variation).toBe("var-2");
    expect(result.final_draft.editorial_score).toBeGreaterThanOrEqual(90);
  });
});