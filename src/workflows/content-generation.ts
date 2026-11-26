import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { Env } from "../index";
import type { AIProvider } from "../integrations/openrouter";
import type { ResearchTopic } from "../database/schema";
import type { ContentDraft } from "../database/schema";
import { ResearcherAgent } from "../agents/researcher";
import { ViralAnalystAgent } from "../agents/viral-analyst";
import { StrategistAgent } from "../agents/strategist";
import { CopywriterAgent } from "../agents/copywriter";
import { EditorAgent } from "../agents/editor";
import { ResearchAggregator, RawResearchItem } from "../integrations/research";
import { createAIProvider } from "../integrations/openrouter";
import { loadPrompt } from "../utils/prompt-loader";

export interface WorkflowInput {
  mode: "automatic" | "topic" | "url" | "viral_framework" | "evergreen";
  topic?: string;
  url?: string;
  sourcePosts?: Array<{ url?: string; text: string; metrics?: Record<string, unknown> }>;
  options?: {
    maxVariations?: number;
    contentFormat?: string;
    targetAudience?: string;
  };
}

export interface WorkflowState {
  currentStep: string;
  researchTopics: ResearchTopic[];
  selectedTopic: ResearchTopic | null;
  viralAnalysis: any;
  contentStrategy: any;
  copywriterOutput: any;
  editorOutput: any;
  finalDraft: ContentDraft | null;
  error: string | null;
}

export class ContentGenerationWorkflow extends WorkflowEntrypoint<Env, WorkflowInput> {
  private getAI(): AIProvider {
    return createAIProvider(this.env, this.env.ENABLE_MOCK_INTEGRATIONS === "true");
  }

  override async run(event: WorkflowEvent<WorkflowInput>, step: WorkflowStep): Promise<ContentDraft> {
    const input = event.payload;

    // Step 1: Research
    const researchTopics = await step.do<any>("research", () => this.runResearch(input));

    if (researchTopics.length === 0) {
      throw new Error("No relevant research topics found");
    }

    // Step 2: Select best topic
    const selectedTopic = this.selectTopic(researchTopics, input);

    // Step 3: Viral Content Analysis
    const viralAnalysis = await step.do<any>("viral-analysis", () => this.runViralAnalysis(selectedTopic));

    // Step 4: Content Strategy
    const contentStrategy = await step.do<any>("strategy", () => this.runStrategy(selectedTopic, viralAnalysis));

    // Step 5: Copywriting
    const copywriterOutput = await step.do<any>("copywriting", () =>
      this.runCopywriting(contentStrategy, selectedTopic)
    );

    // Step 6: Editing & Fact-Checking
    const editorOutput = await step.do<any>("editing", () =>
      this.runEditing(copywriterOutput, selectedTopic, contentStrategy)
    );

    // Step 7: Save Draft
    const finalDraft = await step.do<any>("save-draft", () => this.saveDraft(editorOutput, input));

    return finalDraft;
  }

  private async runResearch(input: WorkflowInput): Promise<ResearchTopic[]> {
    const researcher = new ResearcherAgent(this.getAI(), {
      lookbackHours: parseInt(this.env.RESEARCH_LOOKBACK_HOURS || "48"),
      maxTopicsPerRun: parseInt(this.env.RESEARCH_MAX_TOPICS_PER_RUN || "20"),
      minNoveltyScore: parseFloat(this.env.RESEARCH_MIN_NOVELTY_SCORE || "0.6"),
      minFreshnessScore: parseFloat(this.env.RESEARCH_MIN_FRESHNESS_SCORE || "0.5"),
      minRelevanceScore: 0.5,
      deduplicationThreshold: 0.85,
      requireSourceVerification: true,
    });

    let rawItems: RawResearchItem[] = [];

    if (input.mode === "automatic" || input.mode === "evergreen") {
      rawItems = this.getMockResearchItems(input.mode);
    } else if (input.mode === "topic" && input.topic) {
      rawItems = this.getMockResearchItemsForTopic(input.topic);
    } else if (input.mode === "url" && input.url) {
      rawItems = [{
        id: `url-${Date.now()}`,
        title: "User Provided URL",
        summary: `Research requested for: ${input.url}`,
        url: input.url,
        source: "url" as any,
        source_name: "User Input",
        category: "ai-news",
        credibility: 8,
        published_at: Date.now()
      }];
    } else if (input.mode === "viral_framework" && input.sourcePosts) {
      return [];
    }

    const existingTopics = await this.loadExistingTopics();

    return researcher.research({
      rawItems,
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
  }

  private getMockResearchItems(mode: string): RawResearchItem[] {
    const baseItems: RawResearchItem[] = [
      {
        id: "rss-1",
        title: "Anthropic Releases Claude 3.5 Sonnet with Computer Use",
        summary: "Anthropic announces Claude 3.5 Sonnet with new computer use capability allowing AI to interact with desktop environments.",
        url: "https://anthropic.com/news/claude-3-5-sonnet-computer-use",
        source: "rss",
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
        source: "github_trending",
        source_name: "browser-use",
        category: "ai-agents",
        credibility: 9,
        published_at: Date.now() - 5 * 60 * 60 * 1000,
      },
      {
        id: "rss-2",
        title: "Vercel Releases AI SDK 4.0 with Multi-Step Tool Calling",
        summary: "Vercel AI SDK 4.0 introduces multi-step tool calling, structured outputs, and improved streaming for React/Next.js apps.",
        url: "https://vercel.com/blog/ai-sdk-4",
        source: "rss",
        source_name: "Vercel Blog",
        category: "ai-coding-tools",
        credibility: 9,
        published_at: Date.now() - 8 * 60 * 60 * 1000,
      },
      {
        id: "github-2",
        title: "langchain-ai/langgraph: Multi-Agent Workflows",
        summary: "LangGraph enables building stateful, multi-agent applications with LLMs. Supports cycles, persistence, and human-in-the-loop.",
        url: "https://github.com/langchain-ai/langgraph",
        source: "github_trending",
        source_name: "langchain-ai",
        category: "ai-agents",
        credibility: 9,
        published_at: Date.now() - 12 * 60 * 60 * 1000,
      },
    ];

    if (mode === "evergreen") {
      return baseItems.map((item) => ({
        ...item,
        category: "dev-productivity",
        published_at: Date.now() - 30 * 24 * 60 * 60 * 1000,
      }));
    }

    return baseItems;
  }

  private getMockResearchItemsForTopic(topic: string): RawResearchItem[] {
    return [{
      id: `topic-${Date.now()}`,
      title: topic,
      summary: `Research on: ${topic}`,
      url: "https://example.com/research",
      source: "topic" as any,
      source_name: "User Topic",
      category: "ai-news",
      credibility: 7,
      published_at: Date.now(),
    }];
  }

  private async loadExistingTopics(): Promise<ResearchTopic[]> {
    return [];
  }

  private selectTopic(topics: ResearchTopic[], input: WorkflowInput): ResearchTopic {
    const firstTopic = topics[0];
    if (!firstTopic) {
      throw new Error("No relevant research topics found");
    }
    if (input.mode === "topic" && input.topic) {
      return topics.find((t) => t.topic.toLowerCase().includes(input.topic!.toLowerCase())) ?? firstTopic;
    }
    return topics.reduce((best, current) =>
      current.content_opportunity_score > best.content_opportunity_score ? current : best
    );
  }

  private async runViralAnalysis(topic: ResearchTopic): Promise<any> {
    const viralAnalyst = new ViralAnalystAgent(this.getAI());

    const sourcePosts = [
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

    return viralAnalyst.analyze({
      sourcePosts,
      audience: "startup founders, developers, SaaS builders, AI engineers",
      niches: ["AI", "AI automation", "web development", "software engineering", "SaaS"],
      objective: "authority / quality discussion / qualified leads",
      availableMeasurements: "public metrics",
    });
  }

  private async runStrategy(topic: ResearchTopic, viralAnalysis: any): Promise<any> {
    const strategist = new StrategistAgent(this.getAI());
    const brandConfig = await this.loadBrandConfig();

    return strategist.strategize({
      researchTopic: topic,
      viralAngles: viralAnalysis.original_post_directions || [],
      existingTopics: [],
      brandConfig,
    });
  }

  private async runCopywriting(contentStrategy: any, topic: ResearchTopic): Promise<any> {
    const copywriter = new CopywriterAgent(this.getAI());
    const brandConfig = await this.loadBrandConfig();

    return copywriter.write({
      contentStrategy: contentStrategy.content_strategy,
      researchFacts: {
        verified_facts: topic.verified_facts,
        source_urls: topic.source_urls,
      },
      brandConfig: {
        writing_personality: brandConfig.writing_personality,
        preferred_vocabulary: brandConfig.preferred_vocabulary,
        prohibited_expressions: brandConfig.prohibited_expressions,
        personal_opinions: brandConfig.personal_opinions,
        post_formulas: brandConfig.post_formulas || {},
      },
      maxCharacters: 280,
      enableLongForm: false,
    });
  }

  private async runEditing(copywriterOutput: any, topic: ResearchTopic, contentStrategy: any): Promise<any> {
    const editor = new EditorAgent(this.getAI(), await this.loadEditorConfig());
    const existingDrafts = await this.loadExistingDrafts();

    return editor.evaluate({
      variations: copywriterOutput.variations,
      researchFacts: {
        verified_facts: topic.verified_facts,
        source_urls: topic.source_urls,
        source_publication_dates: topic.source_publication_dates,
      },
      topic: topic.topic,
      category: topic.category,
      contentFormat: contentStrategy.content_strategy?.selected_format || "educational_insight",
      targetAudience: contentStrategy.content_strategy?.target_audience_segment || "AI engineers",
      brandConfig: await this.loadEditorConfig(),
      existingDrafts,
      maxRewriteAttempts: 2,
    });
  }

  private async loadBrandConfig(): Promise<any> {
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

  private async loadEditorConfig(): Promise<any> {
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

  private async loadExistingDrafts(): Promise<any[]> {
    return [];
  }

  private async saveDraft(editorOutput: any, input: WorkflowInput): Promise<ContentDraft> {
    const draft = editorOutput.final_draft;

    const fullDraft: ContentDraft = {
      ...draft,
      id: `draft-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      generation_mode: input.mode,
      input_parameters: input,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    console.log("Draft saved:", fullDraft.draft_id);
    return fullDraft;
  }
}