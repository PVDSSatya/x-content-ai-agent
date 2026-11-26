import { describe, it, expect, beforeEach } from "vitest";
import { DeduplicationService } from "../src/services/deduplication";
import { BrandMemoryService } from "../src/services/brand-memory";
import type { ResearchTopic, ContentDraft, BrandMemory } from "../src/database/schema";

describe("DeduplicationService", () => {
  let service: DeduplicationService;

  beforeEach(() => {
    service = new DeduplicationService({
      topicSimilarityThreshold: 0.85,
      contentSimilarityThreshold: 0.80,
      titleSimilarityThreshold: 0.80,
      lookbackDays: 30,
    });
  });

  describe("isDuplicateTopic", () => {
    const existingTopics: ResearchTopic[] = [
      {
        id: "topic-1",
        topic: "Claude 3.5 Sonnet Computer Use",
        category: "ai-news",
        summary: "Anthropic releases new model with computer use",
        verified_facts: ["Claude 3.5 Sonnet released", "Computer use capability"],
        source_urls: ["https://anthropic.com/news/claude-3-5-sonnet"],
        source_publication_dates: ["2024-11-25T10:00:00Z"],
        audience_relevance: 0.9,
        novelty_score: 0.85,
        freshness_score: 0.95,
        content_opportunity_score: 0.88,
        status: "discovered",
        created_at: Date.now() - 24 * 60 * 60 * 1000,
        updated_at: Date.now(),
      },
      {
        id: "topic-2",
        topic: "Vercel AI SDK 4.0 Release",
        category: "ai-coding-tools",
        summary: "Vercel releases AI SDK 4.0 with multi-step tool calling",
        verified_facts: ["AI SDK 4.0 released", "Multi-step tool calling"],
        source_urls: ["https://vercel.com/blog/ai-sdk-4"],
        source_publication_dates: ["2024-11-24T15:00:00Z"],
        audience_relevance: 0.85,
        novelty_score: 0.8,
        freshness_score: 0.9,
        content_opportunity_score: 0.82,
        status: "discovered",
        created_at: Date.now() - 48 * 60 * 60 * 1000,
        updated_at: Date.now(),
      },
    ];

    it("should detect duplicate topic by title similarity", () => {
      const newTopic: ResearchTopic = {
        ...existingTopics[0]!,
        id: "topic-new",
        topic: "Claude 3.5 Sonnet with Computer Use Released", // Very similar
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      const result = service.isDuplicateTopic(newTopic, existingTopics);
      expect(result.isDuplicate).toBe(true);
      expect(result.similarity).toBeGreaterThanOrEqual(0.85);
    });

    it("should not flag different topics as duplicates", () => {
      const newTopic: ResearchTopic = {
        ...existingTopics[0]!,
        id: "topic-new",
        topic: "OpenAI GPT-5 Announcement Rumors", // Different topic
        category: "ai-news",
        verified_facts: ["GPT-5 rumored"],
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      const result = service.isDuplicateTopic(newTopic, existingTopics);
      expect(result.isDuplicate).toBe(false);
      expect(result.similarity).toBeLessThan(0.85);
    });

    it("should ignore archived topics", () => {
      const archivedTopics = [
        { ...existingTopics[0]!, status: "archived" as const },
      ];

      const newTopic: ResearchTopic = {
        ...existingTopics[0]!,
        id: "topic-new",
        topic: "Claude 3.5 Sonnet Computer Use",
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      const result = service.isDuplicateTopic(newTopic, archivedTopics);
      expect(result.isDuplicate).toBe(false);
    });

    it("should ignore topics older than lookbackDays", () => {
      const oldTopics = [
        { ...existingTopics[0]!, created_at: Date.now() - 60 * 24 * 60 * 60 * 1000 }, // 60 days ago
      ];

      const newTopic: ResearchTopic = {
        ...existingTopics[0]!,
        id: "topic-new",
        topic: "Claude 3.5 Sonnet Computer Use",
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      const result = service.isDuplicateTopic(newTopic, oldTopics);
      expect(result.isDuplicate).toBe(false);
    });
  });

  describe("isDuplicateContent", () => {
    const existingDrafts: ContentDraft[] = [
      {
        id: "draft-1",
        draft_id: "draft-1",
        topic: "AI Production Readiness",
        category: "ai-agents",
        content_format: "educational_insight",
        target_audience: "AI engineers",
        hook_type: "unexpected_truth",
        primary_hook: "AI makes prototyping faster. But it makes deciding what deserves production more important.",
        alternative_hooks: [],
        recommended_post: "AI makes prototyping faster. But it makes deciding what deserves production more important. The bottleneck shifted from building to judging.",
        alternative_posts: [],
        character_count: 150,
        content_framework: "F2",
        core_insight: "Bottleneck shifted from building to judging",
        originality_score: 85,
        editorial_score: 90,
        engagement_potential: "high",
        fact_check_status: "passed",
        verified_claims: [],
        source_urls: [],
        source_publication_dates: [],
        visual_content_suggestion: "",
        reason_for_selection: "High score",
        platform_compliance_status: "compliant",
        requires_manual_publication: true,
        status: "published",
        generation_mode: "automatic",
        created_at: Date.now() - 24 * 60 * 60 * 1000,
        updated_at: Date.now(),
      },
    ];

    it("should detect duplicate content", () => {
      const newPost = "AI makes prototyping faster. But it makes deciding what deserves production more important. The bottleneck shifted from building to judging. Every team needs a checklist.";

      const result = service.isDuplicateContent(newPost, existingDrafts);
      expect(result.isDuplicate).toBe(true);
      expect(result.similarity).toBeGreaterThanOrEqual(0.80);
    });

    it("should not flag different content as duplicate", () => {
      const newPost = "Vercel AI SDK 4.0 introduces multi-step tool calling for React applications. This enables complex agent workflows with structured outputs.";

      const result = service.isDuplicateContent(newPost, existingDrafts);
      expect(result.isDuplicate).toBe(false);
      expect(result.similarity).toBeLessThan(0.80);
    });
  });

  describe("isDuplicateTitle", () => {
    const existingTopics: ResearchTopic[] = [
      {
        id: "topic-1",
        topic: "Claude 3.5 Sonnet Computer Use",
        category: "ai-news",
        summary: "Anthropic releases new model",
        verified_facts: [],
        source_urls: [],
        source_publication_dates: [],
        audience_relevance: 0.9,
        novelty_score: 0.85,
        freshness_score: 0.95,
        content_opportunity_score: 0.88,
        status: "discovered",
        created_at: Date.now(),
        updated_at: Date.now(),
      },
    ];

    it("should detect duplicate title", () => {
      const result = service.isDuplicateTitle("Claude 3.5 Sonnet with Computer Use", existingTopics);
      expect(result.isDuplicate).toBe(true);
    });

    it("should not flag different title", () => {
      const result = service.isDuplicateTitle("OpenAI GPT-5 Rumors", existingTopics);
      expect(result.isDuplicate).toBe(false);
    });
  });

  describe("generateContentHash", () => {
    it("should generate consistent hash for same content", () => {
      const text = "AI makes prototyping faster. Production requires judgment.";
      const hash1 = service.generateContentHash(text);
      const hash2 = service.generateContentHash(text);
      expect(hash1).toBe(hash2);
    });

    it("should generate different hash for different content", () => {
      const hash1 = service.generateContentHash("Content A");
      const hash2 = service.generateContentHash("Content B");
      expect(hash1).not.toBe(hash2);
    });

    it("should be case insensitive", () => {
      const hash1 = service.generateContentHash("AI PROTOTYPING FAST");
      const hash2 = service.generateContentHash("ai prototyping fast");
      expect(hash1).toBe(hash2);
    });
  });

  describe("findNearDuplicates", () => {
    it("should find near-duplicate pairs", () => {
      const items = [
        { id: "1", text: "AI makes prototyping faster but production needs judgment" },
        { id: "2", text: "AI makes prototyping faster but production requires judgment" },
        { id: "3", text: "Vercel releases new AI SDK for developers" },
      ];

      const duplicates = service.findNearDuplicates(items, 0.85);
      expect(duplicates.length).toBeGreaterThanOrEqual(1);
      expect(duplicates[0]?.similarity).toBeGreaterThanOrEqual(0.85);
    });
  });
});

describe("BrandMemoryService", () => {
  let service: BrandMemoryService;

  beforeEach(() => {
    service = new BrandMemoryService({
      maxMemories: 100,
      confidenceDecayRate: 0.01,
      minConfidenceThreshold: 0.3,
      feedbackWeight: 0.15,
    });
  });

  describe("addMemory and getMemories", () => {
    it("should add and retrieve memories", () => {
      const memory = service.addMemory({
        memory_type: "successful_framework",
        content: "F2 framework works well for AI misconceptions",
        source: "analysis",
        confidence: 0.8,
      });

      expect(memory.id).toBeDefined();
      expect(memory.content).toBe("F2 framework works well for AI misconceptions");

      const memories = service.getMemories("successful_framework");
      expect(memories.length).toBe(1);
      expect(memories[0]?.id).toBe(memory.id);
    });

    it("should filter by type", () => {
      service.addMemory({ memory_type: "successful_framework", content: "F2 works", source: "analysis", confidence: 0.8 });
      service.addMemory({ memory_type: "audience_preference", content: "Developers like technical details", source: "feedback", confidence: 0.7 });

      const frameworks = service.getMemories("successful_framework");
      const preferences = service.getMemories("audience_preference");

      expect(frameworks.length).toBe(1);
      expect(preferences.length).toBe(1);
    });

    it("should enforce max memories limit", () => {
      const limitedService = new BrandMemoryService({
        maxMemories: 3,
        confidenceDecayRate: 0.01,
        minConfidenceThreshold: 0.3,
        feedbackWeight: 0.15,
      });

      limitedService.addMemory({ memory_type: "writing_pattern", content: "Memory 1", source: "manual", confidence: 0.5 });
      limitedService.addMemory({ memory_type: "writing_pattern", content: "Memory 2", source: "manual", confidence: 0.6 });
      limitedService.addMemory({ memory_type: "writing_pattern", content: "Memory 3", source: "manual", confidence: 0.7 });
      limitedService.addMemory({ memory_type: "writing_pattern", content: "Memory 4", source: "manual", confidence: 0.8 }); // Should evict lowest

      const memories = limitedService.getMemories();
      expect(memories.length).toBe(3);
      // Lowest confidence (0.5) should be evicted
      expect(memories.every(m => m.confidence >= 0.6)).toBe(true);
    });
  });

  describe("updateFromFeedback", () => {
    it("should create memories from positive feedback", () => {
      const updates = service.updateFromFeedback({
        draft_id: "draft-1",
        feedback_type: "approval",
        rating: 9,
        liked_elements: ["specific evidence", "contrarian angle"],
        disliked_elements: [],
        suggested_changes: "",
        editor_notes: "Great post",
      });

      expect(updates.length).toBeGreaterThanOrEqual(2); // liked elements + rating

      const memories = service.getMemories("audience_preference");
      expect(memories.some(m => m.content.includes("specific evidence"))).toBe(true);
      expect(memories.some(m => m.content.includes("contrarian angle"))).toBe(true);
    });

    it("should create rejected pattern memories from negative feedback", () => {
      service.updateFromFeedback({
        draft_id: "draft-1",
        feedback_type: "rejection",
        liked_elements: [],
        disliked_elements: ["engagement bait", "generic advice"],
        suggested_changes: "Remove engagement bait",
        editor_notes: "Rejected for engagement bait",
      });

      const rejected = service.getMemories("rejected_pattern");
      expect(rejected.some(m => m.content.includes("engagement bait"))).toBe(true);
      expect(rejected.some(m => m.content.includes("generic advice"))).toBe(true);
    });

    it("should create editorial feedback memories", () => {
      service.updateFromFeedback({
        draft_id: "draft-1",
        feedback_type: "edit",
        suggested_changes: "Strengthen the hook with more specificity",
        editor_notes: "Hook too generic",
      });

      const editorial = service.getMemories("editorial_feedback");
      expect(editorial.some(m => m.content.includes("Strengthen the hook"))).toBe(true);
    });
  });

  describe("updateFromPerformance", () => {
    it("should create performance insight memories", () => {
      service.updateFromPerformance({
        draft_id: "draft-1",
        post_text: "Test post",
        engagement_rate: 0.06,
        qualified_inquiries: 2,
        content_category: "ai-agents",
        hook_type: "unexpected_truth",
        publishing_time_hour: 15,
      });

      const insights = service.getMemories("performance_insight");
      expect(insights.some(m => m.content.includes("6.0%") && m.content.includes("ai-agents"))).toBe(true);

      const frameworks = service.getMemories("successful_framework");
      expect(frameworks.some(m => m.content.includes("2 qualified inquiries"))).toBe(true);
    });
  });

  describe("getRelevantMemories", () => {
    beforeEach(() => {
      service.addMemory({
        memory_type: "successful_framework",
        content: "F2 framework works for AI topics",
        source: "analysis",
        confidence: 0.8,
        metadata: { category: "ai-news", framework: "F2" },
      });
      service.addMemory({
        memory_type: "audience_preference",
        content: "Developers prefer technical depth",
        source: "feedback",
        confidence: 0.75,
        metadata: { audience: "developers" },
      });
      service.addMemory({
        memory_type: "rejected_pattern",
        content: "Avoid engagement bait",
        source: "feedback",
        confidence: 0.9,
      });
    });

    it("should return relevant memories for context", () => {
      const relevant = service.getRelevantMemories({ category: "ai-news" });
      expect(relevant.some(m => m.content.includes("F2 framework"))).toBe(true);
    });

    it("should boost score for matching metadata", () => {
      const relevant = service.getRelevantMemories({ category: "ai-news", framework: "F2" });
      const f2Memory = relevant.find(m => m.content.includes("F2 framework"));
      expect(f2Memory).toBeDefined();
    });
  });

  describe("markUsed", () => {
    it("should increment usage count and confidence", () => {
      const memory = service.addMemory({
        memory_type: "writing_pattern",
        content: "Test memory",
        source: "manual",
        confidence: 0.5,
      });

      const result = service.markUsed(memory.id);
      expect(result).toBe(true);

      const updated = service.getMemories().find(m => m.id === memory.id);
      expect(updated?.usage_count).toBe(1);
      expect(updated?.confidence).toBeGreaterThan(0.5);
    });

    it("should return false for non-existent memory", () => {
      const result = service.markUsed("non-existent-id");
      expect(result).toBe(false);
    });
  });

  describe("formatForPrompt", () => {
    it("should format memories for AI prompt", () => {
      service.addMemory({
        memory_type: "successful_framework",
        content: "F2 works for misconceptions",
        source: "analysis",
        confidence: 0.85,
        metadata: { category: "ai-news" },
      });

      const formatted = service.formatForPrompt({ category: "ai-news" });
      expect(formatted).toContain("successful_framework");
      expect(formatted).toContain("F2 works for misconceptions");
      expect(formatted).toContain("confidence: 0.85");
    });

    it("should return default message when no memories", () => {
      const emptyService = new BrandMemoryService({
        maxMemories: 100,
        confidenceDecayRate: 0.01,
        minConfidenceThreshold: 0.3,
        feedbackWeight: 0.15,
      });

      const formatted = emptyService.formatForPrompt({});
      expect(formatted).toBe("No relevant brand memories.");
    });
  });

  describe("loadMemories with decay", () => {
    it("should apply confidence decay based on age", () => {
      const oldMemory: BrandMemory = {
        id: "old-1",
        memory_type: "writing_pattern",
        content: "Old memory",
        source: "manual",
        confidence: 0.9,
        usage_count: 0,
        last_used_at: Date.now() - 100 * 24 * 60 * 60 * 1000,
        created_at: Date.now() - 100 * 24 * 60 * 60 * 1000,
        updated_at: Date.now() - 100 * 24 * 60 * 60 * 1000,
      };

      service.loadMemories([oldMemory]);
      const loaded = service.getMemories().find(m => m.id === "old-1");
      // After 100 days at 1%/day decay, confidence should be ~0.8 (min 0.3)
      expect(loaded?.confidence).toBeLessThan(0.9);
      expect(loaded?.confidence).toBeGreaterThanOrEqual(0.3);
    });
  });
});