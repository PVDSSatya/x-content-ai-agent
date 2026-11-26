import { describe, it, expect } from "vitest";
import { factCheckingService, FactCheckingService } from "../src/services/fact-checking";

describe("FactCheckingService", () => {
  const verifiedFacts = [
    "Claude 3.5 Sonnet released with computer use capability on November 25, 2024",
    "AI prototyping speed has increased significantly in 2024",
    "Production AI systems require evaluation and monitoring",
    "Vercel AI SDK 4.0 introduced multi-step tool calling",
  ];

  const sourceUrls = [
    "https://anthropic.com/news/claude-3-5-sonnet",
    "https://vercel.com/blog/ai-sdk-4",
  ];

  it("should verify claims matching verified facts", async () => {
    const post = "Claude 3.5 Sonnet was released with computer use capability. AI prototyping is much faster now.";

    const result = await factCheckingService.factCheck(post, verifiedFacts, sourceUrls);

    expect(result.overall_status).toBe("passed");
    expect(result.claims.some(c => c.verification_status === "verified")).toBe(true);
  });

  it("should flag unsupported factual claims", async () => {
    const post = "Claude 3.5 Sonnet has 99% accuracy on coding benchmarks. GPT-5 will launch next month.";

    const result = await factCheckingService.factCheck(post, verifiedFacts, sourceUrls);

    expect(result.overall_status).toBe("needs_review");
    expect(result.claims.some(c => c.verification_status === "unverified" || c.verification_status === "speculative")).toBe(true);
    expect(result.requires_human_review).toBe(true);
  });

  it("should handle opinions correctly", async () => {
    const post = "I think AI will transform software development. In my opinion, the biggest impact will be on code review.";

    const result = await factCheckingService.factCheck(post, verifiedFacts, sourceUrls);

    expect(result.overall_status).toBe("passed");
    expect(result.claims.some(c => c.type === "opinion" && c.verification_status === "verified")).toBe(true);
  });

  it("should handle predictions with proper labeling", async () => {
    const post = "Prediction: AI agents will handle 50% of coding tasks by 2026. I expect this to happen.";

    const result = await factCheckingService.factCheck(post, verifiedFacts, sourceUrls);

    expect(result.overall_status).toBe("passed");
    expect(result.claims.some(c => c.type === "prediction")).toBe(true);
  });

  it("should flag unlabeled predictions as speculative", async () => {
    const post = "AI agents will handle 50% of coding tasks by 2026. This will change everything.";

    const result = await factCheckingService.factCheck(post, verifiedFacts, sourceUrls);

    expect(result.overall_status).toBe("needs_review");
    expect(result.claims.some(c => c.verification_status === "speculative")).toBe(true);
  });

  it("should detect contradictions", async () => {
    const post = "AI prototyping speed has decreased significantly this year.";

    const result = await factCheckingService.factCheck(post, verifiedFacts, sourceUrls);

    expect(result.overall_status).toBe("failed");
    expect(result.claims.some(c => c.verification_status === "contradicted")).toBe(true);
  });

  it("should extract statistics as claims", async () => {
    const post = "Studies show 85% of developers now use AI coding tools.";

    const result = await factCheckingService.factCheck(post, verifiedFacts, sourceUrls);

    expect(result.claims.some(c => c.type === "statistic")).toBe(true);
    expect(result.claims.some(c => c.verification_status === "unverified")).toBe(true);
  });

  it("should handle empty post", async () => {
    const result = await factCheckingService.factCheck("", verifiedFacts, sourceUrls);
    expect(result.overall_status).toBe("passed");
    expect(result.claims.length).toBe(0);
  });
});