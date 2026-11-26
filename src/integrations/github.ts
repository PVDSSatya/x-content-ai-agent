import { z } from "zod";

export const GitHubRepoSchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  description: z.string().nullable(),
  html_url: z.string().url(),
  stargazers_count: z.number(),
  forks_count: z.number(),
  language: z.string().nullable(),
  topics: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
  pushed_at: z.string(),
  owner: z.object({
    login: z.string(),
    avatar_url: z.string().url(),
  }),
  license: z.object({
    name: z.string(),
    spdx_id: z.string(),
  }).nullable(),
});

export type GitHubRepo = z.infer<typeof GitHubRepoSchema>;

export const GitHubReleaseSchema = z.object({
  id: z.number(),
  tag_name: z.string(),
  name: z.string().nullable(),
  body: z.string().nullable(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  created_at: z.string(),
  published_at: z.string(),
  html_url: z.string().url(),
  author: z.object({
    login: z.string(),
  }),
  assets: z.array(z.object({
    name: z.string(),
    size: z.number(),
    download_count: z.number(),
  })),
});

export type GitHubRelease = z.infer<typeof GitHubReleaseSchema>;

export const GitHubSecurityAdvisorySchema = z.object({
  ghsa_id: z.string(),
  summary: z.string(),
  description: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  published_at: z.string(),
  updated_at: z.string(),
  withdrawn_at: z.string().nullable(),
  vulnerabilities: z.array(z.object({
    package: z.object({
      name: z.string(),
      ecosystem: z.string(),
    }),
    severity: z.string(),
    vulnerable_version_range: z.string(),
    first_patched_version: z.string().nullable(),
  })),
  references: z.array(z.object({
    url: z.string().url(),
  })),
});

export type GitHubSecurityAdvisory = z.infer<typeof GitHubSecurityAdvisorySchema>;

export interface GitHubConfig {
  token?: string;
  trendingTopics: string[];
  starredOrganizations: string[];
  monitorReleases: boolean;
  monitorSecurityAdvisories: boolean;
}

export class GitHubIntegration {
  private config: GitHubConfig;
  private baseURL = "https://api.github.com";

  constructor(config: GitHubConfig) {
    this.config = config;
  }

  static fromConfig(config: { github: GitHubConfig }): GitHubIntegration {
    return new GitHubIntegration(config.github);
  }

  private async request<T>(endpoint: string, schema: z.ZodSchema<T>): Promise<T> {
    const headers: HeadersInit = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "X-Content-AI-Agent",
    };

    if (this.config.token) {
      headers.Authorization = `Bearer ${this.config.token}`;
    }

    const response = await fetch(`${this.baseURL}${endpoint}`, { headers });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return schema.parse(data);
  }

  async fetchTrendingRepos(topics: string[] = [], limit: number = 30): Promise<GitHubRepo[]> {
    const allRepos: GitHubRepo[] = [];

    for (const topic of topics.length > 0 ? topics : this.config.trendingTopics) {
      try {
        const query = `topic:${topic} stars:>100 pushed:>${this.getDateDaysAgo(30)}`;
        const endpoint = `/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${Math.min(limit, 100)}`;

        const result = await this.request<{ items: GitHubRepo[] }>(endpoint, z.object({ items: z.array(GitHubRepoSchema) }));
        allRepos.push(...result.items);
      } catch (error) {
        console.error(`Failed to fetch trending repos for topic ${topic}:`, error);
      }
    }

    // Deduplicate by full_name
    const uniqueRepos = new Map<string, GitHubRepo>();
    for (const repo of allRepos) {
      if (!uniqueRepos.has(repo.full_name)) {
        uniqueRepos.set(repo.full_name, repo);
      }
    }

    return Array.from(uniqueRepos.values())
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, limit);
  }

  async fetchOrgReleases(org: string, limit: number = 10): Promise<GitHubRelease[]> {
    try {
      const endpoint = `/repos/${org}/*/releases?per_page=${limit}`;
      // Note: GitHub doesn't support wildcard in repos endpoint
      // This would need to be called per repo
      return [];
    } catch (error) {
      console.error(`Failed to fetch releases for org ${org}:`, error);
      return [];
    }
  }

  async fetchRepoReleases(owner: string, repo: string, limit: number = 10): Promise<GitHubRelease[]> {
    try {
      const endpoint = `/repos/${owner}/${repo}/releases?per_page=${limit}`;
      const result = await this.request<GitHubRelease[]>(endpoint, z.array(GitHubReleaseSchema));
      return result;
    } catch (error) {
      console.error(`Failed to fetch releases for ${owner}/${repo}:`, error);
      return [];
    }
  }

  async fetchSecurityAdvisories(ecosystem?: string, limit: number = 50): Promise<GitHubSecurityAdvisory[]> {
    if (!this.config.monitorSecurityAdvisories) return [];

    try {
      let endpoint = `/advisories?per_page=${limit}`;
      if (ecosystem) {
        endpoint += `&ecosystem=${ecosystem}`;
      }
      const result = await this.request<GitHubSecurityAdvisory[]>(endpoint, z.array(GitHubSecurityAdvisorySchema));
      return result;
    } catch (error) {
      console.error("Failed to fetch security advisories:", error);
      return [];
    }
  }

  async fetchStarredOrgActivity(days: number = 7): Promise<GitHubRepo[]> {
    const repos: GitHubRepo[] = [];
    const cutoff = this.getDateDaysAgo(days);

    for (const org of this.config.starredOrganizations) {
      try {
        const endpoint = `/orgs/${org}/repos?sort=pushed&direction=desc&per_page=50`;
        const result = await this.request<GitHubRepo[]>(endpoint, z.array(GitHubRepoSchema));

        const recentRepos = result.filter((repo) => new Date(repo.pushed_at).getTime() >= new Date(cutoff).getTime());
        repos.push(...recentRepos);
      } catch (error) {
        console.error(`Failed to fetch activity for org ${org}:`, error);
      }
    }

    return repos.sort((a, b) => new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime());
  }

  private getDateDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split("T")[0];
  }
}

export function createGitHubIntegration(env: Env): GitHubIntegration {
  // Load from config in production
  return new GitHubIntegration({
    token: env.GITHUB_TOKEN,
    trendingTopics: [],
    starredOrganizations: [],
    monitorReleases: true,
    monitorSecurityAdvisories: true,
  });
}