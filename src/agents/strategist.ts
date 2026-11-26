import { z } from "zod";
import type { AIProvider } from "../integrations/openrouter";
import type { ResearchTopic } from "../database/schema";
import { loadPrompt } from "../utils/prompt-loader";

const StrategistOutputSchema = z.object({
  content_strategy: z.object({
    topic_id: z.string(),
    selected_format: z.enum([
      "punchy_one_liner",
      "contrarian_opinion",
      "educational_insight",
      "breaking_technology_news",
      "technical_explanation",
      "curiosity_driven_post",
      "developer_humour",
      "relatable_observation",
      "open_source_tool_discovery",
      "comparison",
      "future_prediction",
      "storytelling",
      "debate_question",
      "numbered_list",
      "long_form_post",
    ]),
    recommended_framework: z.enum(["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8"]),
    hook_type: z.enum(["unexpected_truth", "cost_reframing", "founder_observation", "diagnostic", "outcome_first"]),
    target_audience_segment: z.string(),
    core_insight: z.string(),
    key_angles: z.array(z.object({
      angle: z.string(),
      evidence_needed: z.array(z.string()),
      estimated_engagement: z.enum(["high", "medium", "low"]),
      reasoning: z.string(),
    })),
    content_pillar: z.enum([
      "Original Insights",
      "Practical AI Education",
      "Build-in-Public Demos",
      "Case Studies / Breakdowns",
      "Service Conversations",
    ]),
    duplication_check: z.object({
      similar_topics_found: z.array(z.string()),
      is_duplicate: z.boolean(),
      differentiation: z.string(),
    }),
    timing_recommendation: z.enum(["immediate", "this_week", "evergreen"]),
    priority_score: z.number().min(0).max(1),
  }),
});

export interface StrategistInput {
  researchTopic: ResearchTopic;
  viralAngles: Array<{
    core_claim: string;
    mechanism_used: string;
    framework_applied: string;
    target_audience: string;
    evidence_needed: string[];
    draft_post: string;
  }>;
  existingTopics: ResearchTopic[];
  brandConfig: {
    content_pillars: Array<{ name: string; target_weekly_posts: number }>;
    preferred_formats: string[];
    prohibited_expressions: string[];
  };
}

export class StrategistAgent {
  private ai: AIProvider;

  constructor(ai: AIProvider) {
    this.ai = ai;
  }

  async strategize(input: StrategistInput): Promise<z.infer<typeof StrategistOutputSchema>> {
    const prompt = this.buildPrompt(input);

    const response = await this.ai.complete<z.infer<typeof StrategistOutputSchema>>({
      messages: [
        { role: "system", content: await loadPrompt("strategist") },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      maxTokens: 3000,
      responseFormat: "json",
      schema: StrategistOutputSchema,
    });

    return response.content;
  }

  private buildPrompt(input: StrategistInput): string {
    const topic = input.researchTopic;
    const viralAnglesText = input.viralAngles
      .map((a, i) => `${i + 1}. ${a.core_claim} (Framework: ${a.framework_applied}, Mechanism: ${a.mechanism_used})`)
      .join("\n");

    const existingTitles = input.existingTopics
      .filter((t) => t.status !== "archived" && Date.now() - t.created_at < 30 * 24 * 60 * 60 * 1000)
      .map((t) => t.topic)
      .slice(0, 30);

    return `Create a content strategy for this research topic.

RESEARCH TOPIC:
- ID: ${topic.id}
- Topic: ${topic.topic}
- Category: ${topic.category}
- Summary: ${topic.summary}
- Verified Facts: ${topic.verified_facts.join("; ")}
- Source URLs: ${topic.source_urls.join(", ")}
- Scores: Relevance=${topic.audience_relevance}, Novelty=${topic.novelty_score}, Freshness=${topic.freshness_score}, Opportunity=${topic.content_opportunity_score}

VIRAL ANGLES FROM ANALYSIS:
${viralAnglesText}

RECENTLY PUBLISHED TOPICS (avoid duplication):
${existingTitles.length > 0 ? existingTitles.join(", ") : "None"}

BRAND CONFIG:
Content Pillars: ${input.brandConfig.content_pillars.map((p) => `${p.name} (${p.target_weekly_posts}/week)`).join(", ")}
Preferred Formats: ${input.brandConfig.preferred_formats.join(", ")}
Prohibited: ${input.brandConfig.prohibited_expressions.slice(0, 10).join(", ")}...

SELECT:
1. Best content format from 15 options
2. Best framework (F1-F8) from viral analysis
3. Best hook type from hook library
4. Specific target audience segment
5. Core insight (one sentence)
6. Key angles with evidence needs
7. Content pillar alignment
8. Duplication check
9. Timing recommendation
10. Priority score (0-1)

DECISION RULES:
- Accuracy → Audience Relevance → Clarity → Distinctiveness → Engagement → Conversion
- One central idea, one reader, one action
- Balance 60% timely / 40% evergreen
- Minimum editorial score threshold: 85
- Reject if factual accuracy or platform compliance fails`;
  }
}

export async function createStrategistAgent(ai: AIProvider): Promise<StrategistAgent> {
  return new StrategistAgent(ai);
}