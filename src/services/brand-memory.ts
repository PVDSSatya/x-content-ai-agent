import { z } from "zod";
import type { BrandMemory } from "../database/schema";

export interface BrandMemoryConfig {
  maxMemories: number;
  confidenceDecayRate: number; // per day
  minConfidenceThreshold: number;
  feedbackWeight: number;
}

export class BrandMemoryService {
  private config: BrandMemoryConfig;
  private memories: Map<string, BrandMemory> = new Map();

  constructor(config: BrandMemoryConfig) {
    this.config = config;
  }

  static default(): BrandMemoryService {
    return new BrandMemoryService({
      maxMemories: 1000,
      confidenceDecayRate: 0.01, // 1% per day
      minConfidenceThreshold: 0.3,
      feedbackWeight: 0.15,
    });
  }

  // Load memories from database
  loadMemories(memories: BrandMemory[]): void {
    this.memories.clear();
    for (const memory of memories) {
      // Apply decay based on age
      const daysSinceUpdate = (Date.now() - memory.updated_at) / (1000 * 60 * 60 * 24);
      const decayedConfidence = Math.max(
        memory.confidence - daysSinceUpdate * this.config.confidenceDecayRate,
        this.config.minConfidenceThreshold
      );

      this.memories.set(memory.id, {
        ...memory,
        confidence: decayedConfidence,
      });
    }
  }

  // Get all memories, optionally filtered by type
  getMemories(type?: BrandMemory["memory_type"]): BrandMemory[] {
    let result = Array.from(this.memories.values());

    if (type) {
      result = result.filter((m) => m.memory_type === type);
    }

    // Sort by confidence and usage
    return result
      .filter((m) => m.confidence >= this.config.minConfidenceThreshold)
      .sort((a, b) => b.confidence * (1 + b.usage_count * 0.01) - a.confidence * (1 + a.usage_count * 0.01));
  }

  // Add or update a memory
  addMemory(memory: Omit<BrandMemory, "id" | "created_at" | "updated_at" | "usage_count" | "last_used_at">): BrandMemory {
    const id = `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    const newMemory: BrandMemory = {
      id,
      ...memory,
      usage_count: 0,
      created_at: now,
      updated_at: now,
    };

    // Check for similar existing memory to merge
    const similar = this.findSimilarMemory(newMemory);
    if (similar) {
      return this.mergeMemories(similar, newMemory);
    }

    // Enforce max memories limit
    if (this.memories.size >= this.config.maxMemories) {
      this.evictLowestConfidence();
    }

    this.memories.set(id, newMemory);
    return newMemory;
  }

  // Update memory from feedback
  updateFromFeedback(feedback: {
    draft_id: string;
    feedback_type: string;
    rating?: number;
    liked_elements?: string[];
    disliked_elements?: string[];
    suggested_changes?: string;
    editor_notes?: string;
  }): BrandMemory[] {
    const updates: BrandMemory[] = [];

    // Process liked elements
    if (feedback.liked_elements) {
      for (const element of feedback.liked_elements) {
        const memory = this.addMemory({
          memory_type: "audience_preference",
          content: `Audience responds positively to ${element}`,
          source: "feedback",
          confidence: 0.6,
          metadata: { draft_id: feedback.draft_id, element, feedback_type: feedback.feedback_type },
        });
        updates.push(memory);
      }
    }

    // Process disliked elements
    if (feedback.disliked_elements) {
      for (const element of feedback.disliked_elements) {
        const memory = this.addMemory({
          memory_type: "rejected_pattern",
          content: `Audience responds negatively to ${element}`,
          source: "feedback",
          confidence: 0.7,
          metadata: { draft_id: feedback.draft_id, element, feedback_type: feedback.feedback_type },
        });
        updates.push(memory);
      }
    }

    // Process suggested changes
    if (feedback.suggested_changes) {
      const memory = this.addMemory({
        memory_type: "editorial_feedback",
        content: `Common editorial suggestion: ${feedback.suggested_changes}`,
        source: "feedback",
        confidence: 0.65,
        metadata: { draft_id: feedback.draft_id, suggestion: feedback.suggested_changes },
      });
      updates.push(memory);
    }

    // Process rating
    if (feedback.rating && feedback.rating >= 8) {
      const memory = this.addMemory({
        memory_type: "successful_framework",
        content: `High-rated content (${feedback.rating}/10) for draft ${feedback.draft_id}`,
        source: "feedback",
        confidence: 0.7,
        metadata: { draft_id: feedback.draft_id, rating: feedback.rating },
      });
      updates.push(memory);
    }

    return updates;
  }

  // Update memory from performance data
  updateFromPerformance(performance: {
    draft_id: string;
    post_text: string;
    engagement_rate?: number;
    qualified_inquiries?: number;
    content_category?: string;
    hook_type?: string;
    publishing_time_hour?: number;
  }): BrandMemory[] {
    const updates: BrandMemory[] = [];

    // High engagement pattern
    if (performance.engagement_rate && performance.engagement_rate > 0.05) {
      const memory = this.addMemory({
        memory_type: "performance_insight",
        content: `High engagement (${(performance.engagement_rate * 100).toFixed(1)}%) for ${performance.content_category} with ${performance.hook_type} hook`,
        source: "performance_data",
        confidence: 0.75,
        metadata: {
          draft_id: performance.draft_id,
          engagement_rate: performance.engagement_rate,
          category: performance.content_category,
          hook_type: performance.hook_type,
        },
      });
      updates.push(memory);
    }

    // Business conversion
    if (performance.qualified_inquiries && performance.qualified_inquiries > 0) {
      const memory = this.addMemory({
        memory_type: "successful_framework",
        content: `Content generated ${performance.qualified_inquiries} qualified inquiries (${performance.content_category}, ${performance.hook_type})`,
        source: "performance_data",
        confidence: 0.85,
        metadata: {
          draft_id: performance.draft_id,
          inquiries: performance.qualified_inquiries,
          category: performance.content_category,
          hook_type: performance.hook_type,
        },
      });
      updates.push(memory);
    }

    // Timing insight
    if (performance.publishing_time_hour !== undefined && performance.engagement_rate && performance.engagement_rate > 0.04) {
      const memory = this.addMemory({
        memory_type: "audience_preference",
        content: `${performance.content_category} content performs well when published at ${performance.publishing_time_hour}:00 UTC`,
        source: "performance_data",
        confidence: 0.6,
        metadata: {
          category: performance.content_category,
          hour: performance.publishing_time_hour,
          engagement_rate: performance.engagement_rate,
        },
      });
      updates.push(memory);
    }

    return updates;
  }

  // Get relevant memories for content generation
  getRelevantMemories(context: {
    category?: string;
    format?: string;
    audience?: string;
    framework?: string;
  }): BrandMemory[] {
    const allMemories = this.getMemories();
    const relevant: Array<{ memory: BrandMemory; score: number }> = [];

    for (const memory of allMemories) {
      let score = memory.confidence;

      // Boost based on context match
      if (context.category && memory.metadata?.category === context.category) score += 0.2;
      if (context.format && memory.metadata?.format === context.format) score += 0.15;
      if (context.audience && memory.metadata?.audience === context.audience) score += 0.15;
      if (context.framework && memory.metadata?.framework === context.framework) score += 0.2;

      // Boost based on usage (proven useful)
      score += memory.usage_count * 0.01;

      relevant.push({ memory, score });
    }

    return relevant
      .filter((r) => r.score > 0.4)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.memory)
      .slice(0, 20);
  }

  // Mark memory as used (for reinforcement)
  markUsed(memoryId: string): boolean {
    const memory = this.memories.get(memoryId);
    if (!memory) return false;

    memory.usage_count++;
    memory.last_used_at = Date.now();
    memory.updated_at = Date.now();
    // Slightly increase confidence with use
    memory.confidence = Math.min(memory.confidence + 0.02, 1.0);

    return true;
  }

  // Get memories formatted for AI prompt
  formatForPrompt(context: { category?: string; format?: string }): string {
    const memories = this.getRelevantMemories(context);

    if (memories.length === 0) return "No relevant brand memories.";

    return memories
      .map((m) => {
        const meta = m.metadata
          ? ` [${Object.entries(m.metadata).map(([k, v]) => `${k}: ${v}`).join(", ")}]`
          : "";
        return `- ${m.memory_type}: ${m.content}${meta} (confidence: ${m.confidence.toFixed(2)})`;
      })
      .join("\n");
  }

  // Get all memories for persistence
  getAllForPersistence(): BrandMemory[] {
    return Array.from(this.memories.values());
  }

  private findSimilarMemory(newMemory: BrandMemory): BrandMemory | null {
    for (const existing of this.memories.values()) {
      if (existing.memory_type !== newMemory.memory_type) continue;

      const similarity = this.calculateContentSimilarity(existing.content, newMemory.content);
      if (similarity > 0.8) {
        return existing;
      }
    }
    return null;
  }

  private mergeMemories(existing: BrandMemory, newMemory: BrandMemory): BrandMemory {
    // Merge: keep higher confidence, combine metadata, update timestamp
    const merged: BrandMemory = {
      ...existing,
      confidence: Math.max(existing.confidence, newMemory.confidence),
      metadata: { ...existing.metadata, ...newMemory.metadata },
      updated_at: Date.now(),
      usage_count: existing.usage_count + 1,
    };

    this.memories.set(existing.id, merged);
    return merged;
  }

  private evictLowestConfidence(): void {
    let lowest: BrandMemory | null = null;
    let lowestId = "";

    for (const [id, memory] of this.memories) {
      if (!lowest || memory.confidence < lowest.confidence) {
        lowest = memory;
        lowestId = id;
      }
    }

    if (lowestId) {
      this.memories.delete(lowestId);
    }
  }

  private calculateContentSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length > 0));
    const words2 = new Set(text2.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length > 0));

    if (words1.size === 0 && words2.size === 0) return 1;
    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }
}

// Singleton instance
export const brandMemoryService = BrandMemoryService.default();