import { z } from "zod";
import type { ResearchTopic } from "../database/schema";
import type { ContentDraft } from "../database/schema";

export interface DeduplicationConfig {
  topicSimilarityThreshold: number;
  contentSimilarityThreshold: number;
  titleSimilarityThreshold: number;
  lookbackDays: number;
}

export class DeduplicationService {
  private config: DeduplicationConfig;

  constructor(config: DeduplicationConfig) {
    this.config = config;
  }

  static default(): DeduplicationService {
    return new DeduplicationService({
      topicSimilarityThreshold: 0.85,
      contentSimilarityThreshold: 0.80,
      titleSimilarityThreshold: 0.80,
      lookbackDays: 30,
    });
  }

  // Check if a new topic is duplicate of existing topics
  isDuplicateTopic(newTopic: ResearchTopic, existingTopics: ResearchTopic[]): {
    isDuplicate: boolean;
    similarTo: ResearchTopic | null;
    similarity: number;
  } {
    let maxSimilarity = 0;
    let similarTo: ResearchTopic | null = null;

    const cutoffTime = Date.now() - this.config.lookbackDays * 24 * 60 * 60 * 1000;
    const recentTopics = existingTopics.filter((t) => t.created_at > cutoffTime && t.status !== "archived");

    for (const existing of recentTopics) {
      const similarity = this.calculateTopicSimilarity(newTopic, existing);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        similarTo = existing;
      }
    }

    return {
      isDuplicate: maxSimilarity >= this.config.topicSimilarityThreshold,
      similarTo,
      similarity: maxSimilarity,
    };
  }

  // Check if post content is duplicate of existing drafts
  isDuplicateContent(newPost: string, existingDrafts: ContentDraft[]): {
    isDuplicate: boolean;
    similarTo: ContentDraft | null;
    similarity: number;
  } {
    let maxSimilarity = 0;
    let similarTo: ContentDraft | null = null;

    const cutoffTime = Date.now() - this.config.lookbackDays * 24 * 60 * 60 * 1000;
    const recentDrafts = existingDrafts.filter((d) => d.created_at > cutoffTime && d.status !== "archived");

    for (const existing of recentDrafts) {
      // Compare recommended_post
      const similarity = this.calculateTextSimilarity(newPost, existing.recommended_post);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        similarTo = existing;
      }
    }

    return {
      isDuplicate: maxSimilarity >= this.config.contentSimilarityThreshold,
      similarTo,
      similarity: maxSimilarity,
    };
  }

  // Check topic title similarity
  isDuplicateTitle(newTitle: string, existingTopics: ResearchTopic[]): {
    isDuplicate: boolean;
    similarTo: ResearchTopic | null;
    similarity: number;
  } {
    let maxSimilarity = 0;
    let similarTo: ResearchTopic | null = null;

    for (const existing of existingTopics) {
      const similarity = this.calculateTitleSimilarity(newTitle, existing.topic);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        similarTo = existing;
      }
    }

    return {
      isDuplicate: maxSimilarity >= this.config.titleSimilarityThreshold,
      similarTo,
      similarity: maxSimilarity,
    };
  }

  // Calculate topic similarity (title + category + key entities)
  private calculateTopicSimilarity(topic1: ResearchTopic, topic2: ResearchTopic): number {
    // Title similarity (50% weight)
    const titleSim = this.calculateTitleSimilarity(topic1.topic, topic2.topic);

    // Category match (20% weight)
    const categoryMatch = topic1.category === topic2.category ? 1 : 0;

    // Verified facts overlap (30% weight)
    const factsSim = this.calculateFactsSimilarity(topic1.verified_facts, topic2.verified_facts);

    return titleSim * 0.5 + categoryMatch * 0.2 + factsSim * 0.3;
  }

  private tokenize(text: string): Set<string> {
    const stopwords = new Set([
      "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
      "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
      "it", "this", "that", "as", "every", "what", "more",
    ]);
    return new Set(
      text
        .toLowerCase()
        .replace(/[^\w.\s-]/g, " ")
        .split(/\s+/)
        .map((w) => w.replace(/^[.-]+|[.-]+$/g, ""))
        .filter((w) => w.length >= 2 && !stopwords.has(w))
    );
  }

  private calculateTitleSimilarity(title1: string, title2: string): number {
    const words1 = this.tokenize(title1);
    const words2 = this.tokenize(title2);

    if (words1.size === 0 && words2.size === 0) return 1;
    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    return (2 * intersection.size) / (words1.size + words2.size);
  }

  private calculateFactsSimilarity(facts1: string[], facts2: string[]): number {
    if (facts1.length === 0 && facts2.length === 0) return 1;
    if (facts1.length === 0 || facts2.length === 0) return 0;

    let matches = 0;
    for (const f1 of facts1) {
      for (const f2 of facts2) {
        if (this.calculateTitleSimilarity(f1, f2) > 0.6) {
          matches++;
          break;
        }
      }
    }

    return matches / Math.max(facts1.length, facts2.length);
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = this.tokenize(text1);
    const words2 = this.tokenize(text2);

    if (words1.size === 0 && words2.size === 0) return 1;
    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    return (2 * intersection.size) / (words1.size + words2.size);
  }

  // Generate content hash for quick duplicate detection
  generateContentHash(text: string): string {
    // Simple hash based on normalized content
    const normalized = text
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    return Math.abs(hash).toString(36);
  }

  // Find near-duplicates in a collection
  findNearDuplicates<T extends { id: string; text: string }>(
    items: T[],
    threshold: number = 0.85
  ): Array<{ item1: T; item2: T; similarity: number }> {
    const duplicates: Array<{ item1: T; item2: T; similarity: number }> = [];

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const item1 = items[i];
        const item2 = items[j];
        if (!item1 || !item2) continue;

        const similarity = this.calculateTextSimilarity(item1.text, item2.text);
        if (similarity >= threshold) {
          duplicates.push({
            item1,
            item2,
            similarity,
          });
        }
      }
    }

    return duplicates.sort((a, b) => b.similarity - a.similarity) as Array<{ item1: T; item2: T; similarity: number }>;
  }
}

export const deduplicationService = DeduplicationService.default();