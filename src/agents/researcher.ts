import { z } from "zod";
import type { AIProvider } from "../integrations/openrouter";
import type { ResearchAggregator, RawResearchItem } from "../integrations/research";
import type { ResearchTopic } from "../database/schema";
import { ResearchTopicSchema } from "../database/schema";
import { loadPrompt } from "../utils/prompt-loader";

const ResearcherOutputSchema = z.array(ResearchTopicSchema);

export interface ResearcherConfig {
  lookbackHours: number;
  maxTopicsPerRun: number;
  minNoveltyScore: number;
  minFreshnessScore: number;
  minRelevanceScore: number;
  deduplicationThreshold: number;
  requireSourceVerification: boolean;
}

export interface ResearcherInput {
  rawItems: RawResearchItem[];
  existingTopics: ResearchTopic[];
  config: ResearcherConfig;
}

export class ResearcherAgent {
  private ai: AIProvider;
  private config: ResearcherConfig;

  constructor(ai: AIProvider, config: ResearcherConfig) {
    this.ai = ai;
    this.config = config;
  }

  static fromEnv(ai: AIProvider, env: any): ResearcherAgent {
    return new ResearcherAgent(ai, {
      lookbackHours: parseInt(env.RESEARCH_LOOKBACK_HOURS || "48"),
      maxTopicsPerRun: parseInt(env.RESEARCH_MAX_TOPICS_PER_RUN || "20"),
      minNoveltyScore: parseFloat(env.RESEARCH_MIN_NOVELTY_SCORE || "0.6"),
      minFreshnessScore: parseFloat(env.RESEARCH_MIN_FRESHNESS_SCORE || "0.5"),
      minRelevanceScore: 0.5,
      deduplicationThreshold: 0.85,
      requireSourceVerification: true,
    });
  }

  async research(input: ResearcherInput): Promise<ResearchTopic[]> {
    const { rawItems, existingTopics, config } = input;

    // Filter items by recency and credibility
    const filteredItems = this.prefilterItems(rawItems);

    if (filteredItems.length === 0) {
      return [];
    }

    // Build prompt with items and existing topics
    const prompt = this.buildPrompt(filteredItems, existingTopics);

    // Call AI with structured output
    const response = await this.ai.complete<z.infer<typeof ResearcherOutputSchema>>({
      messages: [
        { role: "system", content: await loadPrompt("researcher") },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      maxTokens: 4000,
      responseFormat: "json",
      schema: ResearcherOutputSchema,
    });

    const topics = response.content;

    // Post-process: score, deduplicate, validate
    const scoredTopics = this.scoreTopics(topics, filteredItems);
    const deduplicated = this.deduplicateTopics(scoredTopics, existingTopics);
    const validated = this.validateTopics(deduplicated);

    return validated.slice(0, config.maxTopicsPerRun);
  }

  private prefilterItems(items: RawResearchItem[]): RawResearchItem[] {
    const cutoffTime = Date.now() - this.config.lookbackHours * 60 * 60 * 1000;

    return items.filter((item) => {
      // Recency check
      if (item.published_at < cutoffTime) return false;

      // Credibility check (minimum 5 for citation)
      if (item.credibility < 5) return false;

      // Must have title and URL
      if (!item.title || !item.url) return false;

      return true;
    });
  }

  private buildPrompt(items: RawResearchItem[], existingTopics: ResearchTopic[]): string {
    const existingTitles = existingTopics
      .filter((t) => t.status !== "archived")
      .map((t) => t.topic)
      .slice(0, 50);

    const itemsText = items
      .slice(0, 30)
      .map((item, idx) => {
        return `[${idx + 1}] ${item.title}
Source: ${item.source_name} (${item.source})
Category: ${item.category}
Credibility: ${item.credibility}/10
Published: ${new Date(item.published_at).toISOString()}
URL: ${item.url}
Summary: ${item.summary.substring(0, 500)}
---`;
      })
      .join("\n");

    return `Analyze these ${items.length} raw research items and produce structured research topics.

EXISTING TOPICS (avoid duplicates):
${existingTitles.length > 0 ? existingTitles.join(", ") : "None"}

RAW RESEARCH ITEMS:
${itemsText}

INSTRUCTIONS:
1. Group related items into distinct topics
2. Extract verified facts from each item (specific claims with numbers, dates, names)
3. Score each topic on:
   - audience_relevance (0-1): relevance to developers, AI engineers, founders, SaaS builders
   - novelty_score (0-1): how new/unique vs existing knowledge
   - freshness_score (0-1): recency (1=just published, 0=at ${this.config.lookbackHours}h limit)
   - content_opportunity_score (0-1): overall content potential
4. Only include topics with scores >= thresholds:
   - novelty >= ${this.config.minNoveltyScore}
   - freshness >= ${this.config.minFreshnessScore}
   - relevance >= ${this.config.minRelevanceScore}
5. Distinguish confirmed facts from rumors/speculation
6. Prefer primary sources (company blogs > news > social media)
7. Include technical specifics: model names, versions, metrics, dates
8. Filter out marketing fluff, recruitment posts, pure speculation

Return JSON array of research topics.`;
  }

  private scoreTopics(topics: ResearchTopic[], items: RawResearchItem[]): ResearchTopic[] {
    return topics.map((topic) => {
      // Find source items for this topic
      const sourceItems = items.filter((item) =>
        topic.source_urls.includes(item.url) ||
        this.calculateSimilarity(topic.topic, item.title) > 0.7
      );

      // Recalculate freshness based on actual source dates
      if (sourceItems.length > 0) {
        const latestSource = Math.max(...sourceItems.map((i) => i.published_at));
        const hoursOld = (Date.now() - latestSource) / (1000 * 60 * 60);
        topic.freshness_score = Math.max(0, 1 - hoursOld / this.config.lookbackHours);
      }

      // Ensure content_opportunity_score is calculated
      topic.content_opportunity_score =
        0.3 * topic.novelty_score +
        0.3 * topic.audience_relevance +
        0.2 * topic.freshness_score +
        0.2 * (sourceItems.length > 0 ? Math.max(...sourceItems.map((i) => i.credibility)) / 10 : 0.5);

      return topic;
    });
  }

  private deduplicateTopics(topics: ResearchTopic[], existingTopics: ResearchTopic[]): ResearchTopic[] {
    const allExisting = [...existingTopics, ...topics];
    const unique: ResearchTopic[] = [];

    for (const topic of topics) {
      const isDuplicate = allExisting.some((existing) =>
        existing.id !== topic.id &&
        this.calculateSimilarity(topic.topic, existing.topic) >= this.config.deduplicationThreshold
      );

      if (!isDuplicate) {
        unique.push(topic);
      }
    }

    return unique;
  }

  private validateTopics(topics: ResearchTopic[]): ResearchTopic[] {
    return topics.filter((topic) => {
      // Must have at least one verified fact
      if (topic.verified_facts.length === 0) return false;

      // Must have at least one source URL
      if (topic.source_urls.length === 0) return false;

      // Scores must be valid
      if (
        topic.audience_relevance < this.config.minRelevanceScore ||
        topic.novelty_score < this.config.minNoveltyScore ||
        topic.freshness_score < this.config.minFreshnessScore
      ) {
        return false;
      }

      // Topic must be substantive
      if (topic.topic.length < 10 || topic.summary.length < 20) return false;

      return true;
    });
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
    const words2 = new Set(str2.toLowerCase().split(/\s+/).filter((w) => w.length > 3));

    if (words1.size === 0 && words2.size === 0) return 1;
    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }
}

// Factory function
export async function createResearcherAgent(ai: AIProvider, env: any): Promise<ResearcherAgent> {
  return ResearcherAgent.fromEnv(ai, env);
}