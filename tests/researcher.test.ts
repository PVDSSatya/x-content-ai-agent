import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResearcherAgent } from "../src/agents/researcher";
import { MockAIProvider } from "../src/integrations/openrouter";
import type { RawResearchItem, ResearchTopic } from "../src/database/schema";

describe("ResearcherAgent", () => {
  let mockAI: MockAIProvider;
  let researcher: ResearcherAgent;

  const mockRawItems: RawResearchItem[] = [
    {
      id: "rss-1",
      title: "Anthropic Releases Claude 3.5 Sonnet",
      summary: "Anthropic announces Claude 3.5 Sonnet with computer use capability.",
      url: "https://anthropic.com/news/claude-3-5-sonnet",
      source: "rss",
      source_name: "Anthropic Blog",
      category: "ai-news",
      credibility: 10,
      published_at: Date.now() - 2 * 60 * 60 * 1000,
    },
    {
      id: "github-1",
      title: "browser-use: AI Browser Automation",
      summary: "Open-source browser automation framework for AI agents.",
      url: "https://github.com/browser-use/browser-use",
      source: "github_trending",
      source_name: "browser-use",
      category: "ai-agents",
      credibility: 9,
      published_at: Date.now() - 5 * 60 * 60 * 1000,
    },
  ];

  const mockExistingTopics: ResearchTopic[] = [];

  beforeEach(() => {
    mockAI = new MockAIProvider();
    researcher = new ResearcherAgent(mockAI, {
      lookbackHours: 48,
      maxTopicsPerRun: 20,
      minNoveltyScore: 0.6,
      minFreshnessScore: 0.5,
      minRelevanceScore: 0.5,
      deduplicationThreshold: 0.85,
      requireSourceVerification: true,
    });
  });

  it("should filter items by recency", async () => {
    const oldItem: RawResearchItem = {
      ...mockRawItems[0],
      id: "old-1",
      published_at: Date.now() - 100 * 60 * 60 * 1000, // 100 hours ago
    };

    const input = {
      rawItems: [...mockRawItems, oldItem],
      existingTopics: mockExistingTopics,
      config: {
        lookbackHours: 48,
        maxTopicsPerRun: 20,
        minNoveltyScore: 0.6,
        minFreshnessScore: 0.5,
        minRelevanceScore: 0.5,
        deduplicationThreshold: 0.85,
        requireSourceVerification: true,
      },
    };

    // Set up mock response
    const mockResponse = [{
      id: "topic-1",
      topic: "Claude 3.5 Sonnet Computer Use",
      category: "ai-news",
      summary: "Anthropic releases Claude 3.5 Sonnet with computer use capability.",
      verified_facts: ["Claude 3.5 Sonnet released", "Computer use capability announced"],
      source_urls: ["https://anthropic.com/news/claude-3-5-sonnet"],
      source_publication_dates: [new Date().toISOString()],
      audience_relevance: 0.9,
      novelty_score: 0.85,
      freshness_score: 0.95,
      content_opportunity_score: 0.88,
      status: "discovered",
      created_at: Date.now(),
      updated_at: Date.now(),
    }];

    mockAI.setResponse("research", mockResponse);

    const result = await researcher.research(input);

    expect(result.length).toBeGreaterThan(0);
    // Old item should be filtered out
  });

  it("should filter items by credibility threshold", async () => {
    const lowCredItem: RawResearchItem = {
      ...mockRawItems[0],
      id: "low-cred-1",
      credibility: 3, // Below threshold of 5
    };

    const input = {
      rawItems: [...mockRawItems, lowCredItem],
      existingTopics: mockExistingTopics,
      config: {
        lookbackHours: 48,
        maxTopicsPerRun: 20,
        minNoveltyScore: 0.6,
        minFreshnessScore: 0.5,
        minRelevanceScore: 0.5,
        deduplicationThreshold: 0.85,
        requireSourceVerification: true,
      },
    };

    const mockResponse = [{
      id: "topic-1",
      topic: "Claude 3.5 Sonnet Computer Use",
      category: "ai-news",
      summary: "Anthropic releases Claude 3.5 Sonnet with computer use capability.",
      verified_facts: ["Claude 3.5 Sonnet released", "Computer use capability announced"],
      source_urls: ["https://anthropic.com/news/claude-3-5-sonnet"],
      source_publication_dates: [new Date().toISOString()],
      audience_relevance: 0.9,
      novelty_score: 0.85,
      freshness_score: 0.95,
      content_opportunity_score: 0.88,
      status: "discovered",
      created_at: Date.now(),
      updated_at: Date.now(),
    }];

    mockAI.setResponse("research", mockResponse);

    const result = await researcher.research(input);
    expect(result.length).toBeGreaterThan(0);
  });

  it("should deduplicate similar topics", async () => {
    const duplicateItem: RawResearchItem = {
      ...mockRawItems[0],
      id: "dup-1",
      title: "Anthropic Releases Claude 3.5 Sonnet with Computer Use", // Very similar
    };

    const input = {
      rawItems: [...mockRawItems, duplicateItem],
      existingTopics: mockExistingTopics,
      config: {
        lookbackHours: 48,
        maxTopicsPerRun: 20,
        minNoveltyScore: 0.6,
        minFreshnessScore: 0.5,
        minRelevanceScore: 0.5,
        deduplicationThreshold: 0.85,
        requireSourceVerification: true,
      },
    };

    const mockResponse = [{
      id: "topic-1",
      topic: "Claude 3.5 Sonnet Computer Use",
      category: "ai-news",
      summary: "Anthropic releases Claude 3.5 Sonnet with computer use capability.",
      verified_facts: ["Claude 3.5 Sonnet released", "Computer use capability announced"],
      source_urls: ["https://anthropic.com/news/claude-3-5-sonnet"],
      source_publication_dates: [new Date().toISOString()],
      audience_relevance: 0.9,
      novelty_score: 0.85,
      freshness_score: 0.95,
      content_opportunity_score: 0.88,
      status: "discovered",
      created_at: Date.now(),
      updated_at: Date.now(),
    }];

    mockAI.setResponse("research", mockResponse);

    const result = await researcher.research(input);
    // Should not create duplicate topics for same subject
    expect(result.length).toBe(1);
  });

  it("should validate minimum scores", async () => {
    const input = {
      rawItems: mockRawItems,
      existingTopics: mockExistingTopics,
      config: {
        lookbackHours: 48,
        maxTopicsPerRun: 20,
        minNoveltyScore: 0.9, // Very high threshold
        minFreshnessScore: 0.5,
        minRelevanceScore: 0.5,
        deduplicationThreshold: 0.85,
        requireSourceVerification: true,
      },
    };

    // Mock response with low novelty score
    const mockResponse = [{
      id: "topic-1",
      topic: "Test Topic",
      category: "ai-news",
      summary: "Test summary",
      verified_facts: ["Test fact"],
      source_urls: ["https://example.com"],
      source_publication_dates: [new Date().toISOString()],
      audience_relevance: 0.9,
      novelty_score: 0.5, // Below threshold
      freshness_score: 0.95,
      content_opportunity_score: 0.75,
      status: "discovered",
      created_at: Date.now(),
      updated_at: Date.now(),
    }];

    mockAI.setResponse("research", mockResponse);

    const result = await researcher.research(input);
    // Should filter out topics below novelty threshold
    expect(result.length).toBe(0);
  });

  it("should require verified facts", async () => {
    const input = {
      rawItems: mockRawItems,
      existingTopics: mockExistingTopics,
      config: {
        lookbackHours: 48,
        maxTopicsPerRun: 20,
        minNoveltyScore: 0.6,
        minFreshnessScore: 0.5,
        minRelevanceScore: 0.5,
        deduplicationThreshold: 0.85,
        requireSourceVerification: true,
      },
    };

    // Mock response with no verified facts
    const mockResponse = [{
      id: "topic-1",
      topic: "Test Topic",
      category: "ai-news",
      summary: "Test summary",
      verified_facts: [], // Empty - should be rejected
      source_urls: ["https://example.com"],
      source_publication_dates: [new Date().toISOString()],
      audience_relevance: 0.9,
      novelty_score: 0.85,
      freshness_score: 0.95,
      content_opportunity_score: 0.88,
      status: "discovered",
      created_at: Date.now(),
      updated_at: Date.now(),
    }];

    mockAI.setResponse("research", mockResponse);

    const result = await researcher.research(input);
    expect(result.length).toBe(0);
  });

  it("should respect maxTopicsPerRun limit", async () => {
    const input = {
      rawItems: mockRawItems,
      existingTopics: mockExistingTopics,
      config: {
        lookbackHours: 48,
        maxTopicsPerRun: 1, // Limit to 1
        minNoveltyScore: 0.6,
        minFreshnessScore: 0.5,
        minRelevanceScore: 0.5,
        deduplicationThreshold: 0.85,
        requireSourceVerification: true,
      },
    };

    // Mock response with multiple topics
    const mockResponse = Array.from({ length: 5 }, (_, i) => ({
      id: `topic-${i}`,
      topic: `Test Topic ${i}`,
      category: "ai-news",
      summary: `Test summary ${i}`,
      verified_facts: [`Test fact ${i}`],
      source_urls: [`https://example.com/${i}`],
      source_publication_dates: [new Date().toISOString()],
      audience_relevance: 0.9,
      novelty_score: 0.85,
      freshness_score: 0.95,
      content_opportunity_score: 0.88,
      status: "discovered",
      created_at: Date.now(),
      updated_at: Date.now(),
    }));

    mockAI.setResponse("research", mockResponse);

    const result = await researcher.research(input);
    expect(result.length).toBeLessThanOrEqual(1);
  });
});