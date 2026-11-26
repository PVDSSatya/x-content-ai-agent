import Parser from "rss-parser";
import { z } from "zod";
import type { Env } from "../index";

export const RSSFeedConfigSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  category: z.string(),
  credibility: z.number().int().min(1).max(10),
  enabled: z.boolean(),
});

export type RSSFeedConfig = z.infer<typeof RSSFeedConfigSchema>;

export const RSSItemSchema = z.object({
  title: z.string(),
  link: z.string().url(),
  pubDate: z.string().optional(),
  content: z.string().optional(),
  contentSnippet: z.string().optional(),
  categories: z.array(z.string()).optional(),
  guid: z.string().optional(),
  isoDate: z.string().optional(),
  source_feed: z.string().optional(),
  source_category: z.string().optional(),
  source_credibility: z.number().optional(),
});

export type RSSItem = z.infer<typeof RSSItemSchema>;

export interface ParsedFeed {
  feed: {
    title: string;
    link: string;
    description: string;
  };
  items: RSSItem[];
}

export class RSSIntegration {
  private parser: Parser;
  private feeds: RSSFeedConfig[];
  private credibilityThreshold: number;

  constructor(feeds: RSSFeedConfig[], credibilityThreshold = 5) {
    this.parser = new Parser({
      customFields: {
        item: ["content", "contentSnippet", "categories", "guid", "isoDate"],
      },
      timeout: 10000,
    });
    this.feeds = feeds.filter((f) => f.enabled);
    this.credibilityThreshold = credibilityThreshold;
  }

  static fromConfig(config: { rss_feeds: RSSFeedConfig[]; source_credibility_thresholds: { minimum_for_citation: number } }): RSSIntegration {
    return new RSSIntegration(config.rss_feeds, config.source_credibility_thresholds.minimum_for_citation);
  }

  async fetchAllFeeds(lookbackHours: number = 48): Promise<Map<string, RSSItem[]>> {
    const results = new Map<string, RSSItem[]>();
    const cutoffTime = Date.now() - lookbackHours * 60 * 60 * 1000;

    const fetchPromises = this.feeds
      .filter((feed) => feed.credibility >= this.credibilityThreshold)
      .map(async (feed) => {
        try {
          const feedData = await this.fetchFeed(feed.url);
          const filteredItems = feedData.items
            .filter((item) => this.isWithinLookback(item, cutoffTime))
            .map((item) => ({
              ...item,
              source_feed: feed.name,
              source_category: feed.category,
              source_credibility: feed.credibility,
            }));

          results.set(feed.name, filteredItems);
        } catch (error) {
          console.error(`Failed to fetch RSS feed ${feed.name}:`, error);
          results.set(feed.name, []);
        }
      });

    await Promise.allSettled(fetchPromises);
    return results;
  }

  async fetchFeed(url: string): Promise<ParsedFeed> {
    const feed = await this.parser.parseURL(url);
    return {
      feed: {
        title: feed.title || "",
        link: feed.link || "",
        description: feed.description || "",
      },
      items: feed.items.map((item) => ({
        title: item.title || "",
        link: item.link || "",
        pubDate: item.pubDate,
        content: item.content,
        contentSnippet: item.contentSnippet,
        categories: item.categories || [],
        guid: item.guid,
        isoDate: item.isoDate,
      })),
    };
  }

  private isWithinLookback(item: RSSItem, cutoffTime: number): boolean {
    if (item.isoDate) {
      return new Date(item.isoDate).getTime() >= cutoffTime;
    }
    if (item.pubDate) {
      return new Date(item.pubDate).getTime() >= cutoffTime;
    }
    // If no date, include it (could be recent)
    return true;
  }

  async fetchFeedByCategory(category: string, lookbackHours: number = 48): Promise<RSSItem[]> {
    const allFeeds = await this.fetchAllFeeds(lookbackHours);
    const items: RSSItem[] = [];

    for (const [, feedItems] of allFeeds) {
      for (const item of feedItems) {
        if (item.source_category === category) {
          items.push(item);
        }
      }
    }

    return items.sort((a, b) => {
      const dateA = a.isoDate ? new Date(a.isoDate).getTime() : (a.pubDate ? new Date(a.pubDate).getTime() : 0);
      const dateB = b.isoDate ? new Date(b.isoDate).getTime() : (b.pubDate ? new Date(b.pubDate).getTime() : 0);
      return dateB - dateA; // Most recent first
    });
  }

  deduplicateItems(items: RSSItem[], threshold: number = 0.85): RSSItem[] {
    const unique: RSSItem[] = [];

    for (const item of items) {
      const isDuplicate = unique.some((existing) =>
        this.calculateSimilarity(item.title, existing.title) >= threshold
      );

      if (!isDuplicate) {
        unique.push(item);
      }
    }

    return unique;
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

// Helper function to create RSS integration from environment
export function createRSSIntegration(env: Env): RSSIntegration {
  // In production, load from config/sources.json
  // For now, return empty - will be populated by config loader
  return new RSSIntegration([]);
}