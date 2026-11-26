import { z } from "zod";
import type { Env } from "../index";
import { RSSIntegration, RSSItem } from "./rss";
import { GitHubIntegration, GitHubRepo, GitHubRelease } from "./github";

export const ResearchSourceSchema = z.enum([
  "rss",
  "github_trending",
  "github_releases",
  "github_security",
  "hacker_news",
  "hugging_face",
  "product_hunt",
  "arxiv",
  "news_api",
]);

export type ResearchSource = z.infer<typeof ResearchSourceSchema>;

export const RawResearchItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  url: z.string().url(),
  source: ResearchSourceSchema,
  source_name: z.string(),
  category: z.string(),
  credibility: z.number().int().min(1).max(10),
  published_at: z.number(),
  raw_data: z.record(z.unknown()).optional(),
});

export type RawResearchItem = z.infer<typeof RawResearchItemSchema>;

export interface ResearchConfig {
  lookbackHours: number;
  maxItemsPerSource: number;
  credibilityThreshold: number;
  categories: string[];
}

export class ResearchAggregator {
  private rss: RSSIntegration;
  private github: GitHubIntegration;
  private config: ResearchConfig;

  constructor(rss: RSSIntegration, github: GitHubIntegration, config: ResearchConfig) {
    this.rss = rss;
    this.github = github;
    this.config = config;
  }

  static fromEnv(env: Env): ResearchAggregator {
    // Load configs from sources.json and settings.json in production
    return new ResearchAggregator(
      new RSSIntegration([]),
      new GitHubIntegration({
        trendingTopics: [],
        starredOrganizations: [],
        monitorReleases: true,
        monitorSecurityAdvisories: true,
      }),
      {
        lookbackHours: 48,
        maxItemsPerSource: 50,
        credibilityThreshold: 5,
        categories: [
          "ai-news",
          "ai-agents",
          "dev-tools",
          "infrastructure",
          "saas",
          "cybersecurity",
        ],
      }
    );
  }

  async gatherResearch(): Promise<RawResearchItem[]> {
    const allItems: RawResearchItem[] = [];

    // Fetch from RSS feeds by category
    for (const category of this.config.categories) {
      const rssItems = await this.rss.fetchFeedByCategory(category, this.config.lookbackHours);
      for (const item of rssItems.slice(0, this.config.maxItemsPerSource)) {
        if (item.source_credibility >= this.config.credibilityThreshold) {
          allItems.push(this.normalizeRSSItem(item, category));
        }
      }
    }

    // Fetch GitHub trending repos
    try {
      const trendingRepos = await this.github.fetchTrendingRepos(
        this.config.categories.filter((c) => ["ai-news", "ai-agents", "dev-tools"].includes(c)),
        this.config.maxItemsPerSource
      );
      for (const repo of trendingRepos) {
        allItems.push(this.normalizeGitHubRepo(repo));
      }
    } catch (error) {
      console.error("Failed to fetch GitHub trending:", error);
    }

    // Fetch GitHub releases from starred orgs
    try {
      const recentRepos = await this.github.fetchStarredOrgActivity(7);
      for (const repo of recentRepos.slice(0, this.config.maxItemsPerSource)) {
        allItems.push(this.normalizeGitHubRepo(repo, "github_releases"));
      }
    } catch (error) {
      console.error("Failed to fetch GitHub releases:", error);
    }

    // Fetch security advisories
    try {
      const advisories = await this.github.fetchSecurityAdvisories(undefined, this.config.maxItemsPerSource);
      for (const advisory of advisories) {
        allItems.push(this.normalizeSecurityAdvisory(advisory));
      }
    } catch (error) {
      console.error("Failed to fetch security advisories:", error);
    }

    // Deduplicate
    return this.deduplicateItems(allItems);
  }

  private normalizeRSSItem(item: RSSItem & { source_feed: string; source_category: string; source_credibility: number }, category: string): RawResearchItem {
    const publishedAt = item.isoDate
      ? new Date(item.isoDate).getTime()
      : item.pubDate
      ? new Date(item.pubDate).getTime()
      : Date.now();

    return {
      id: `rss-${item.guid || item.link}`,
      title: item.title,
      summary: item.contentSnippet || item.content || "",
      url: item.link,
      source: "rss",
      source_name: item.source_feed,
      category: item.source_category || category,
      credibility: item.source_credibility,
      published_at: publishedAt,
      raw_data: {
        categories: item.categories,
        full_content: item.content,
      },
    };
  }

  private normalizeGitHubRepo(repo: GitHubRepo, source: ResearchSource = "github_trending"): RawResearchItem {
    return {
      id: `github-${repo.id}`,
      title: repo.name,
      summary: repo.description || `A ${repo.language || "multi-language"} project with ${repo.stargazers_count} stars`,
      url: repo.html_url,
      source,
      source_name: repo.owner.login,
      category: this.categorizeGitHubRepo(repo),
      credibility: 8, // GitHub repos generally credible
      published_at: new Date(repo.pushed_at).getTime(),
      raw_data: {
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        language: repo.language,
        topics: repo.topics,
        owner: repo.owner.login,
      },
    };
  }

  private normalizeSecurityAdvisory(advisory: import("./github").GitHubSecurityAdvisory): RawResearchItem {
    return {
      id: `security-${advisory.ghsa_id}`,
      title: `Security Advisory: ${advisory.summary}`,
      summary: advisory.description,
      url: advisory.references[0]?.url || `https://github.com/advisories/${advisory.ghsa_id}`,
      source: "github_security",
      source_name: "GitHub Security",
      category: "cybersecurity",
      credibility: 10,
      published_at: new Date(advisory.published_at).getTime(),
      raw_data: {
        severity: advisory.severity,
        vulnerabilities: advisory.vulnerabilities,
      },
    };
  }

  private categorizeGitHubRepo(repo: GitHubRepo): string {
    const topics = repo.topics.map((t) => t.toLowerCase());
    const description = (repo.description || "").toLowerCase();

    if (topics.some((t) => ["ai", "ml", "llm", "agent", "automation"].includes(t))) return "ai-agents";
    if (topics.some((t) => ["security", "vulnerability", "crypto", "auth"].includes(t))) return "cybersecurity";
    if (topics.some((t) => ["cli", "tool", "developer", "devops", "build"].includes(t))) return "dev-tools";
    if (topics.some((t) => ["saas", "startup", "business", "analytics"].includes(t))) return "saas";
    if (topics.some((t) => ["database", "postgres", "sqlite", "vector", "distributed"].includes(t))) return "infrastructure";
    if (topics.some((t) => ["kubernetes", "docker", "container", "cloud"].includes(t))) return "infrastructure";

    return "dev-tools";
  }

  private deduplicateItems(items: RawResearchItem[]): RawResearchItem[] {
    const unique: RawResearchItem[] = [];
    const seenUrls = new Set<string>();
    const seenTitles = new Map<string, RawResearchItem>();

    for (const item of items) {
      // Exact URL match
      if (seenUrls.has(item.url)) continue;

      // Similar title match
      let isDuplicate = false;
      for (const [existingTitle, existingItem] of seenTitles) {
        if (this.calculateTitleSimilarity(item.title, existingTitle) > 0.85) {
          // Keep the one with higher credibility
          if (item.credibility > existingItem.credibility) {
            seenTitles.set(item.title, item);
            // Replace in unique array
            const idx = unique.findIndex((u) => u.id === existingItem.id);
            if (idx >= 0) unique[idx] = item;
          }
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        seenUrls.add(item.url);
        seenTitles.set(item.title, item);
        unique.push(item);
      }
    }

    // Sort by credibility and recency
    return unique.sort((a, b) => {
      if (b.credibility !== a.credibility) return b.credibility - a.credibility;
      return b.published_at - a.published_at;
    });
  }

  private calculateTitleSimilarity(title1: string, title2: string): number {
    const words1 = new Set(title1.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
    const words2 = new Set(title2.toLowerCase().split(/\s+/).filter((w) => w.length > 3));

    if (words1.size === 0 && words2.size === 0) return 1;
    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }
}

// Hacker News integration (placeholder for future implementation)
export class HackerNewsIntegration {
  async fetchTopStories(limit: number = 50): Promise<RawResearchItem[]> {
    // TODO: Implement Hacker News API integration
    return [];
  }

  async fetchNewStories(limit: number = 100): Promise<RawResearchItem[]> {
    // TODO: Implement Hacker News API integration
    return [];
  }
}

// Hugging Face integration (placeholder)
export class HuggingFaceIntegration {
  async fetchModelReleases(limit: number = 20): Promise<RawResearchItem[]> {
    // TODO: Implement Hugging Face API integration
    return [];
  }
}

// Product Hunt integration (placeholder)
export class ProductHuntIntegration {
  async fetchLaunches(categories: string[] = [], limit: number = 20): Promise<RawResearchItem[]> {
    // TODO: Implement Product Hunt API integration
    return [];
  }
}

// arXiv integration (placeholder)
export class ArxivIntegration {
  async fetchPapers(categories: string[] = [], maxResults: number = 20): Promise<RawResearchItem[]> {
    // TODO: Implement arXiv API integration
    return [];
  }
}