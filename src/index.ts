import { Hono } from "hono";
import { cors } from "hono/cors";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { ContentDraft, ResearchTopic, Feedback, BrandMemory, PerformanceData } from "./database/schema";
import {
  GenerateContentRequestSchema,
  GenerateContentResponseSchema,
  DraftListResponseSchema,
  FeedbackRequestSchema,
  HealthCheckResponseSchema,
  ContentDraftSchema,
  FeedbackSchema
} from "./database/schema";
import { createAIProvider, AIProvider } from "./integrations/openrouter";
import { ResearcherAgent } from "./agents/researcher";
import { ViralAnalystAgent } from "./agents/viral-analyst";
import { StrategistAgent } from "./agents/strategist";
import { CopywriterAgent } from "./agents/copywriter";
import { EditorAgent } from "./agents/editor";
import { PerformanceAnalystAgent } from "./agents/performance-analyst";
import { ResearchAggregator } from "./integrations/research";
import { factCheckingService } from "./services/fact-checking";
import { deduplicationService } from "./services/deduplication";
import { brandMemoryService } from "./services/brand-memory";
import { contentScoringService } from "./services/content-scoring";
import { ContentGenerationWorkflow } from "./workflows/content-generation";

export { ContentGenerationWorkflow };

// Environment bindings
export interface Env {
  DB: D1Database;
  ENVIRONMENT?: string;
  CONTENT_GENERATION?: Workflow;
  GITHUB_TOKEN?: string;
  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL: string;
  OPENROUTER_FALLBACK_MODEL: string;
  AI_MAX_TOKENS_PER_REQUEST: string;
  AI_MAX_TOTAL_TOKENS_PER_RUN: string;
  AI_TEMPERATURE: string;
  AI_MAX_RETRIES: string;
  AI_RETRY_BASE_DELAY_MS: string;
  RESEARCH_LOOKBACK_HOURS: string;
  RESEARCH_MAX_TOPICS_PER_RUN: string;
  RESEARCH_MIN_NOVELTY_SCORE: string;
  RESEARCH_MIN_FRESHNESS_SCORE: string;
  API_KEY: string;
  JWT_SECRET: string;
  ENABLE_MOCK_INTEGRATIONS: string;
}

// Extend Hono context with env
declare module "hono" {
  interface ContextVariableMap {
    ai: AIProvider;
    userId: string;
  }
}

const app = new Hono<{ Bindings: Env; Variables: { ai: AIProvider; userId: string } }>();

// CORS middleware
app.use("*", cors({
  origin: ["http://localhost:3000", "http://localhost:8787"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

// Root status endpoint
app.get("/", (c) => {
  return c.json({
    name: "x-content-ai-agent",
    status: "ok",
    version: "1.0.0",
    environment: c.env.ENVIRONMENT || "development",
    endpoints: [
      "GET /api/health",
      "POST /api/generate",
      "GET /api/drafts",
      "GET /api/drafts/:id",
      "POST /api/feedback",
      "GET /api/brand-memory",
      "GET /api/analytics/performance",
      "GET /api/research/topics",
      "POST /api/research/trigger",
    ],
  });
});

// Auth middleware
app.use("/api/*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  const apiKey = c.env.API_KEY;

  if (apiKey && authHeader !== `Bearer ${apiKey}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Initialize AI provider
  const ai = createAIProvider(c.env, c.env.ENABLE_MOCK_INTEGRATIONS === "true");
  c.set("ai", ai);
  c.set("userId", "system"); // In production, extract from JWT

  await next();
});

// Health check
app.get("/api/health", (c) => {
  const response: z.infer<typeof HealthCheckResponseSchema> = {
    status: "healthy",
    timestamp: Date.now(),
    version: "1.0.0",
    services: {
      database: "healthy",
      ai_provider: "healthy",
      workflow: "healthy",
    },
  };
  return c.json(response);
});

// Generate content endpoint
app.post("/api/generate", zValidator("json", GenerateContentRequestSchema), async (c) => {
  const input = c.req.valid("json");
  const ai = c.get("ai");

  try {
    // For now, run simplified pipeline inline
    // In production, this would trigger the Cloudflare Workflow
    const draft = await runContentGenerationPipeline(ai, input, c.env);

    const response: z.infer<typeof GenerateContentResponseSchema> = {
      success: true,
      workflow_id: `wf-${Date.now()}`,
      draft,
    };

    return c.json(response);
  } catch (error) {
    console.error("Generation error:", error);
    const response: z.infer<typeof GenerateContentResponseSchema> = {
      success: false,
      workflow_id: "",
      error: error instanceof Error ? error.message : "Generation failed",
    };
    return c.json(response, 500);
  }
});

// List drafts
app.get("/api/drafts", async (c) => {
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const status = c.req.query("status");

  // In production, query D1 database
  const drafts: ContentDraft[] = [];

  const response: z.infer<typeof DraftListResponseSchema> = {
    drafts,
    total: drafts.length,
    page,
    limit,
  };

  return c.json(response);
});

// Get draft by ID
app.get("/api/drafts/:id", async (c) => {
  const id = c.req.param("id");

  // In production, query D1 database
  const draft: ContentDraft | null = null;

  if (!draft) {
    return c.json({ error: "Draft not found" }, 404);
  }

  return c.json(draft);
});

// Submit feedback
app.post("/api/feedback", zValidator("json", FeedbackRequestSchema), async (c) => {
  const input = c.req.valid("json");
  const userId = c.get("userId");

  // In production, save to D1 database
  const feedback: Feedback = {
    id: `fb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    ...input,
    applied_to_future_generation: false,
    created_at: Date.now(),
  };

  // Update brand memory from feedback
  brandMemoryService.updateFromFeedback({
    draft_id: input.draft_id,
    feedback_type: input.feedback_type,
    rating: input.rating,
    liked_elements: input.liked_elements,
    disliked_elements: input.disliked_elements,
    suggested_changes: input.suggested_changes,
    editor_notes: input.editor_notes,
  });

  return c.json({ success: true, feedback_id: feedback.id });
});

// Get brand memory
app.get("/api/brand-memory", (c) => {
  const type = c.req.query("type") as any;
  const memories = brandMemoryService.getMemories(type);
  return c.json({ memories });
});

// Get performance analysis
app.get("/api/analytics/performance", async (c) => {
  // In production, query D1 database for performance data and feedback
  const performanceData: PerformanceData[] = [];
  const feedbackData: Feedback[] = [];

  const analyst = new PerformanceAnalystAgent(c.get("ai"));
  const analysis = await analyst.analyze({
    performanceData,
    feedbackData,
    currentBrandMemory: brandMemoryService.getAllForPersistence(),
  });

  return c.json(analysis);
});

// Get research topics
app.get("/api/research/topics", async (c) => {
  // In production, query D1 database
  const topics: ResearchTopic[] = [];
  return c.json({ topics });
});

// Trigger research manually
app.post("/api/research/trigger", async (c) => {
  const ai = c.get("ai");
  const researcher = new ResearcherAgent(ai, {
    lookbackHours: 48,
    maxTopicsPerRun: 20,
    minNoveltyScore: 0.6,
    minFreshnessScore: 0.5,
    minRelevanceScore: 0.5,
    deduplicationThreshold: 0.85,
    requireSourceVerification: true,
  });

  // In production, use real aggregator
  const rawItems = [] as any[];
  const existingTopics: ResearchTopic[] = [];

  const topics = await researcher.research({ rawItems, existingTopics, config: {
    lookbackHours: 48,
    maxTopicsPerRun: 20,
    minNoveltyScore: 0.6,
    minFreshnessScore: 0.5,
    minRelevanceScore: 0.5,
    deduplicationThreshold: 0.85,
    requireSourceVerification: true,
  }});

  return c.json({ topics_found: topics.length, topics });
});

// Simplified pipeline for inline execution (development/testing)
async function runContentGenerationPipeline(
  ai: AIProvider,
  input: z.infer<typeof GenerateContentRequestSchema>,
  env: Env
): Promise<ContentDraft> {
  // This is a simplified version for API testing
  // Full pipeline runs in Cloudflare Workflow

  const researcher = new ResearcherAgent(ai, {
    lookbackHours: 48,
    maxTopicsPerRun: 20,
    minNoveltyScore: 0.6,
    minFreshnessScore: 0.5,
    minRelevanceScore: 0.5,
    deduplicationThreshold: 0.85,
    requireSourceVerification: true,
  });

  // Mock research items for testing
  const mockItems = getMockResearchItems(input.mode);
  const existingTopics: ResearchTopic[] = [];

  const topics = await researcher.research({
    rawItems: mockItems,
    existingTopics,
    config: {
      lookbackHours: 48,
      maxTopicsPerRun: 20,
      minNoveltyScore: 0.6,
      minFreshnessScore: 0.5,
      minRelevanceScore: 0.5,
      deduplicationThreshold: 0.85,
      requireSourceVerification: true,
    },
  });

  if (topics.length === 0) {
    throw new Error("No research topics found");
  }

  const selectedTopic = topics[0];
  if (!selectedTopic) {
    throw new Error("No research topics found");
  }

  // Viral analysis (mock)
  const viralAnalyst = new ViralAnalystAgent(ai);
  const viralAnalysis = await viralAnalyst.analyze({
    sourcePosts: getMockSourcePosts(),
    audience: "startup founders, developers, SaaS builders, AI engineers",
    niches: ["AI", "AI automation", "web development", "software engineering", "SaaS"],
    objective: "authority / quality discussion / qualified leads",
    availableMeasurements: "public metrics",
  });

  // Strategy
  const strategist = new StrategistAgent(ai);
  const brandConfig = getBrandConfig();
  const strategy = await strategist.strategize({
    researchTopic: selectedTopic,
    viralAngles: viralAnalysis.original_post_directions || [],
    existingTopics: [],
    brandConfig,
  });

  // Copywriting
  const copywriter = new CopywriterAgent(ai);
  const copywriterOutput = await copywriter.write({
    contentStrategy: strategy.content_strategy,
    researchFacts: {
      verified_facts: selectedTopic.verified_facts,
      source_urls: selectedTopic.source_urls,
    },
    brandConfig: {
      writing_personality: brandConfig.writing_personality,
      preferred_vocabulary: brandConfig.preferred_vocabulary,
      prohibited_expressions: brandConfig.prohibited_expressions,
      personal_opinions: brandConfig.personal_opinions,
      post_formulas: brandConfig.post_formulas,
    },
    maxCharacters: 280,
    enableLongForm: false,
  });

  // Editing
  const editor = new EditorAgent(ai, getEditorConfig());
  const editorOutput = await editor.evaluate({
    variations: copywriterOutput.variations,
    researchFacts: {
      verified_facts: selectedTopic.verified_facts,
      source_urls: selectedTopic.source_urls,
      source_publication_dates: selectedTopic.source_publication_dates,
    },
    topic: selectedTopic.topic,
    category: selectedTopic.category,
    contentFormat: strategy.content_strategy?.selected_format || "educational_insight",
    targetAudience: strategy.content_strategy?.target_audience_segment || "AI engineers",
    brandConfig: getEditorConfig(),
    existingDrafts: [],
    maxRewriteAttempts: 2,
  });

  const now = Date.now();
  return {
    ...editorOutput.final_draft,
    id: `draft-${now}-${Math.random().toString(36).slice(2, 11)}`,
    generation_mode: input.mode,
    input_parameters: input,
    created_at: now,
    updated_at: now,
  };
}

function getMockResearchItems(mode: string) {
  return [
    {
      id: "rss-1",
      title: "Anthropic Releases Claude 3.5 Sonnet with Computer Use",
      summary: "Anthropic announces Claude 3.5 Sonnet with new computer use capability allowing AI to interact with desktop environments.",
      url: "https://anthropic.com/news/claude-3-5-sonnet-computer-use",
      source: "rss" as const,
      source_name: "Anthropic Blog",
      category: "ai-news",
      credibility: 10,
      published_at: Date.now() - 2 * 60 * 60 * 1000,
    },
    {
      id: "github-1",
      title: "browser-use/browser-use: AI Agent for Browser Automation",
      summary: "Open-source browser automation framework for AI agents with 15k+ stars. Enables programmatic web interaction.",
      url: "https://github.com/browser-use/browser-use",
      source: "github_trending" as const,
      source_name: "browser-use",
      category: "ai-agents",
      credibility: 9,
      published_at: Date.now() - 5 * 60 * 60 * 1000,
    },
  ];
}

function getMockSourcePosts() {
  return [
    {
      text: "AI makes prototyping faster. It makes deciding what deserves production more important. The bottleneck shifted from building to judging.",
      metrics: { views: 125000, likes: 3200, reposts: 890, replies: 245 },
      sourceDate: "2024-11-20",
    },
    {
      text: "People assume more automation = less work. The constraint is actually broken handoffs. One fixed handoff saves more time than ten new automations.",
      metrics: { views: 89000, likes: 2100, reposts: 560, replies: 180 },
      sourceDate: "2024-11-18",
    },
  ];
}

function getBrandConfig() {
  return {
    content_pillars: [
      { name: "Original Insights", target_weekly_posts: 10 },
      { name: "Practical AI Education", target_weekly_posts: 6 },
      { name: "Build-in-Public Demos", target_weekly_posts: 5 },
      { name: "Case Studies / Breakdowns", target_weekly_posts: 4 },
      { name: "Service Conversations", target_weekly_posts: 3 },
    ],
    preferred_formats: [
      "punchy one-liner", "contrarian opinion", "educational insight",
      "technical explanation", "curiosity-driven post", "developer humour",
      "relatable observation", "open-source tool discovery", "comparison",
      "future prediction", "storytelling", "debate question", "numbered list"
    ],
    prohibited_expressions: [
      "game-changer", "revolutionary", "groundbreaking", "unprecedented",
      "skyrocket", "10x", "crush it", "hustle", "grind", "secret sauce",
      "magic bullet", "silver bullet", "holy grail", "best practice",
      "guaranteed results", "proven to work", "never fails", "always works",
      "everyone should", "you must", "stop doing", "start doing",
      "🚀", "💯", "🔥", "🧵", "#AI", "#MachineLearning", "#Tech"
    ],
    writing_personality: {
      traits: ["intelligent", "curious", "concise", "technically credible", "occasionally humorous", "direct", "practical", "independently minded"],
      description: "Understands technology, builds products, experiments with AI, shares meaningful insights"
    },
    preferred_vocabulary: [
      "build", "ship", "iterate", "bottleneck", "leverage", "compound",
      "asymmetric", "first-principles", "trade-off", "signal", "noise",
      "handoff", "workflow", "automation", "integration", "reliability"
    ],
    personal_opinions: {
      ai_coding: "AI makes prototyping faster. It makes deciding what deserves production more important.",
      automation: "A business rarely needs ten more automations. It needs one broken handoff fixed.",
      generated_code: "Generated code is abundant. Clear requirements are scarce.",
      manual_work: "The cost of manual lead entry is not typing. It is delayed follow-up.",
    },
    post_formulas: {
      paradox: "[New capability] becomes easier. [Important decision] becomes harder.",
      belief_reversal: "People assume [X]. The constraint is actually [Y].",
      scarcity: "[Commodity] is abundant. [Valuable skill] is scarce.",
      hidden_cost: "The cost of [X] is not just [visible cost]. It is [downstream loss].",
      future_shift: "As [technology] becomes common, [human advantage] matters more.",
      operational_principle: "[Good practice] prevents [failure].",
      observation_implication: "[Concrete observation]. Therefore [practical consequence].",
    },
  };
}

function getEditorConfig() {
  return {
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
      prohibited_content: ["spam", "misinformation", "hate_speech", "harassment", "violence", "illegal_activities", "pii", "copyrighted_material"],
      max_hashtags: 3,
      max_mentions: 2,
      max_urls: 1,
    },
    prohibited_expressions: [
      "game-changer", "revolutionary", "groundbreaking", "unprecedented",
      "skyrocket", "10x", "crush it", "hustle", "grind", "secret sauce",
      "magic bullet", "silver bullet", "holy grail", "best practice",
      "guaranteed results", "proven to work", "never fails", "always works",
      "everyone should", "you must", "stop doing", "start doing",
    ],
  };
}

export default app;