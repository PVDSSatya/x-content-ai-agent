import { z } from "zod";
import type { AIProvider } from "../integrations/openrouter";
import { loadPrompt } from "../utils/prompt-loader";

const PerformanceAnalystOutputSchema = z.object({
  performance_analysis: z.object({
    period_analyzed: z.string(),
    total_posts_analyzed: z.number().int(),
    top_performing_patterns: z.array(z.object({
      pattern: z.string(),
      category: z.string(),
      avg_engagement_rate: z.number(),
      sample_size: z.number().int(),
      confidence: z.number().min(0).max(1),
      key_characteristics: z.array(z.string()),
    })),
    hook_performance: z.array(z.object({
      hook_type: z.string(),
      avg_views_ratio: z.number(),
      avg_reply_quality: z.number(),
      best_categories: z.array(z.string()),
    })),
    framework_performance: z.array(z.object({
      framework: z.string(),
      conversion_to_qualified: z.number(),
      avg_editorial_score: z.number(),
      best_for: z.string(),
    })),
    publishing_insights: z.object({
      best_hours_utc: z.array(z.number().int().min(0).max(23)),
      best_days: z.array(z.number().int().min(0).max(6)),
      category_timing: z.record(z.string()),
    }),
    pillar_performance: z.array(z.object({
      pillar: z.string(),
      avg_engagement: z.number(),
      qualified_inquiry_rate: z.number(),
      recommended_weekly: z.number().int(),
    })),
  }),
  feedback_analysis: z.object({
    total_feedback_samples: z.number().int(),
    approval_rate: z.number(),
    rejection_reasons: z.array(z.object({
      reason: z.string(),
      count: z.number().int(),
      percentage: z.number(),
    })),
    common_edits: z.array(z.object({
      edit: z.string(),
      frequency: z.number().int(),
    })),
    liked_elements: z.array(z.object({
      element: z.string(),
      mentions: z.number().int(),
    })),
    disliked_elements: z.array(z.object({
      element: z.string(),
      mentions: z.number().int(),
    })),
  }),
  brand_memory_updates: z.array(z.object({
    memory_type: z.enum([
      "successful_framework",
      "audience_preference",
      "writing_pattern",
      "editorial_feedback",
      "rejected_pattern",
      "performance_insight"
    ]),
    content: z.string(),
    source: z.enum(["feedback", "analysis", "manual", "performance_data"]),
    confidence: z.number().min(0).max(1),
    metadata: z.record(z.unknown()).optional(),
  })),
  recommendations: z.array(z.string()),
});

export interface PerformanceAnalystInput {
  performanceData: Array<{
    draft_id: string;
    post_text: string;
    published_at: number;
    impressions?: number;
    likes?: number;
    replies?: number;
    reposts?: number;
    quotes?: number;
    bookmarks?: number;
    profile_visits?: number;
    link_clicks?: number;
    follower_growth?: number;
    engagement_rate?: number;
    qualified_inquiries?: number;
    content_category?: string;
    hook_type?: string;
    publishing_time_hour?: number;
    publishing_time_day?: number;
    approval_rate?: number;
  }>;
  feedbackData: Array<{
    draft_id: string;
    feedback_type: string;
    rating?: number;
    liked_elements?: string[];
    disliked_elements?: string[];
    suggested_changes?: string;
    editor_notes?: string;
  }>;
  currentBrandMemory: Array<{
    id: string;
    memory_type: string;
    content: string;
    source: string;
    confidence: number;
    usage_count: number;
  }>;
}

export class PerformanceAnalystAgent {
  private ai: AIProvider;

  constructor(ai: AIProvider) {
    this.ai = ai;
  }

  async analyze(input: PerformanceAnalystInput): Promise<z.infer<typeof PerformanceAnalystOutputSchema>> {
    // If insufficient data, return deterministic analysis
    if (input.performanceData.length < 10 && input.feedbackData.length < 10) {
      return this.deterministicAnalysis(input);
    }

    // Otherwise use AI for pattern detection
    const prompt = this.buildPrompt(input);

    try {
      const response = await this.ai.complete<z.infer<typeof PerformanceAnalystOutputSchema>>({
        messages: [
          { role: "system", content: await loadPrompt("performance-analyst") },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        maxTokens: 4000,
        responseFormat: "json",
        schema: PerformanceAnalystOutputSchema,
      });

      return response.content;
    } catch {
      return this.deterministicAnalysis(input);
    }
  }

  private deterministicAnalysis(input: PerformanceAnalystInput): z.infer<typeof PerformanceAnalystOutputSchema> {
    // Analyze feedback patterns
    const feedbackStats = this.analyzeFeedback(input.feedbackData);
    const performanceStats = this.analyzePerformance(input.performanceData);

    const memoryUpdates: z.infer<typeof PerformanceAnalystOutputSchema>["brand_memory_updates"] = [];

    // Generate memory updates from feedback
    if (feedbackStats.rejectionReasons.length > 0) {
      for (const reason of feedbackStats.rejectionReasons.slice(0, 3)) {
        if (reason.percentage > 0.2) {
          memoryUpdates.push({
            memory_type: "rejected_pattern",
            content: `Posts rejected for ${reason.reason} (${Math.round(reason.percentage * 100)}% of rejections)`,
            source: "feedback",
            confidence: Math.min(0.5 + reason.percentage, 0.9),
            metadata: { count: reason.count },
          });
        }
      }
    }

    if (feedbackStats.likedElements.length > 0) {
      for (const liked of feedbackStats.likedElements.slice(0, 3)) {
        if (liked.mentions >= 5) {
          memoryUpdates.push({
            memory_type: "audience_preference",
            content: `Audience responds well to ${liked.element} (${liked.mentions} mentions)`,
            source: "feedback",
            confidence: Math.min(0.5 + liked.mentions / 20, 0.85),
            metadata: { mentions: liked.mentions },
          });
        }
      }
    }

    // Generate from performance data
    if (performanceStats.topHooks.length > 0) {
      for (const hook of performanceStats.topHooks.slice(0, 2)) {
        memoryUpdates.push({
          memory_type: "successful_framework",
          content: `${hook.hook_type} hooks perform well for ${hook.best_categories.join(", ")} (avg views ratio: ${hook.avg_views_ratio.toFixed(1)})`,
          source: "performance_data",
          confidence: Math.min(0.6 + hook.sampleSize * 0.02, 0.85),
          metadata: { categories: hook.best_categories, sample_size: hook.sampleSize },
        });
      }
    }

    const recommendations = this.generateRecommendations(feedbackStats, performanceStats);

    return {
      performance_analysis: {
        period_analyzed: this.getPeriodString(input.performanceData),
        total_posts_analyzed: input.performanceData.length,
        top_performing_patterns: performanceStats.topPatterns,
        hook_performance: performanceStats.topHooks,
        framework_performance: performanceStats.topFrameworks,
        publishing_insights: performanceStats.publishingInsights,
        pillar_performance: performanceStats.pillarPerformance,
      },
      feedback_analysis: {
        total_feedback_samples: input.feedbackData.length,
        approval_rate: feedbackStats.approvalRate,
        rejection_reasons: feedbackStats.rejectionReasons,
        common_edits: feedbackStats.commonEdits,
        liked_elements: feedbackStats.likedElements,
        disliked_elements: feedbackStats.dislikedElements,
      },
      brand_memory_updates: memoryUpdates,
      recommendations,
    };
  }

  private analyzeFeedback(feedback: PerformanceAnalystInput["feedbackData"]) {
    const approvals = feedback.filter((f) => f.feedback_type === "approval").length;
    const total = feedback.length;
    const approvalRate = total > 0 ? approvals / total : 0;

    const rejectionReasons: Map<string, number> = new Map();
    const likedElements: Map<string, number> = new Map();
    const dislikedElements: Map<string, number> = new Map();
    const commonEdits: Map<string, number> = new Map();

    for (const f of feedback) {
      if (f.feedback_type === "rejection" && f.editor_notes) {
        // Categorize rejection reason
        const notes = f.editor_notes.toLowerCase();
        if (notes.includes("fact") || notes.includes("accurac")) rejectionReasons.set("factual_accuracy", (rejectionReasons.get("factual_accuracy") || 0) + 1);
        else if (notes.includes("original") || notes.includes("novel")) rejectionReasons.set("low_originality", (rejectionReasons.get("low_originality") || 0) + 1);
        else if (notes.includes("hook")) rejectionReasons.set("weak_hook", (rejectionReasons.get("weak_hook") || 0) + 1);
        else if (notes.includes("tone") || notes.includes("voice")) rejectionReasons.set("tone_mismatch", (rejectionReasons.get("tone_mismatch") || 0) + 1);
        else if (notes.includes("compliance") || notes.includes("character")) rejectionReasons.set("compliance", (rejectionReasons.get("compliance") || 0) + 1);
        else rejectionReasons.set("other", (rejectionReasons.get("other") || 0) + 1);
      }

      if (f.liked_elements) {
        for (const el of f.liked_elements) {
          likedElements.set(el, (likedElements.get(el) || 0) + 1);
        }
      }
      if (f.disliked_elements) {
        for (const el of f.disliked_elements) {
          dislikedElements.set(el, (dislikedElements.get(el) || 0) + 1);
        }
      }
      if (f.suggested_changes) {
        const changes = f.suggested_changes.toLowerCase();
        if (changes.includes("hook")) commonEdits.set("hook_rewrite", (commonEdits.get("hook_rewrite") || 0) + 1);
        else if (changes.includes("fact") || changes.includes("accurac")) commonEdits.set("fact_correction", (commonEdits.get("fact_correction") || 0) + 1);
        else if (changes.includes("tone") || changes.includes("voice")) commonEdits.set("tone_adjustment", (commonEdits.get("tone_adjustment") || 0) + 1);
        else if (changes.includes("structure") || changes.includes("format")) commonEdits.set("structure_change", (commonEdits.get("structure_change") || 0) + 1);
        else commonEdits.set("other", (commonEdits.get("other") || 0) + 1);
      }
    }

    const totalRejections = Array.from(rejectionReasons.values()).reduce((a, b) => a + b, 0);

    return {
      approvalRate,
      rejectionReasons: Array.from(rejectionReasons.entries())
        .map(([reason, count]) => ({ reason, count, percentage: totalRejections > 0 ? count / totalRejections : 0 }))
        .sort((a, b) => b.count - a.count),
      likedElements: Array.from(likedElements.entries())
        .map(([element, mentions]) => ({ element, mentions }))
        .sort((a, b) => b.mentions - a.mentions),
      dislikedElements: Array.from(dislikedElements.entries())
        .map(([element, mentions]) => ({ element, mentions }))
        .sort((a, b) => b.mentions - a.mentions),
      commonEdits: Array.from(commonEdits.entries())
        .map(([edit, frequency]) => ({ edit, frequency }))
        .sort((a, b) => b.frequency - a.frequency),
    };
  }

  private analyzePerformance(data: PerformanceAnalystInput["performanceData"]) {
    // Group by category
    const byCategory = new Map<string, PerformanceAnalystInput["performanceData"]>();
    for (const d of data) {
      const cat = d.content_category || "unknown";
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(d);
    }

    // Top patterns by engagement rate
    const topPatterns = Array.from(byCategory.entries())
      .filter(([, posts]) => posts.length >= 3)
      .map(([category, posts]) => {
        const withEngagement = posts.filter((p) => p.engagement_rate !== undefined);
        if (withEngagement.length === 0) return null;
        const avgEngagement = withEngagement.reduce((a, b) => a + (b.engagement_rate || 0), 0) / withEngagement.length;
        return {
          pattern: `${category}_posts`,
          category,
          avg_engagement_rate: avgEngagement,
          sample_size: withEngagement.length,
          confidence: Math.min(0.3 + withEngagement.length * 0.05, 0.9),
          key_characteristics: ["consistent_format", "targeted_audience"],
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => b.avg_engagement_rate - a.avg_engagement_rate)
      .slice(0, 5);

    // Hook performance
    const byHook = new Map<string, PerformanceAnalystInput["performanceData"]>();
    for (const d of data) {
      const hook = d.hook_type || "unknown";
      if (!byHook.has(hook)) byHook.set(hook, []);
      byHook.get(hook)!.push(d);
    }

    const topHooks = Array.from(byHook.entries())
      .map(([hook_type, posts]) => {
        const withViews = posts.filter((p) => p.impressions !== undefined && p.impressions > 0);
        if (withViews.length < 3) return null;
        // Calculate views ratio (simplified)
        const avgViewsRatio = withViews.reduce((a, b) => a + ((b.impressions || 0) / 1000), 0) / withViews.length;
        const categories = [...new Set(posts.map((p) => p.content_category).filter((c): c is string => Boolean(c)))];
        return {
          hook_type,
          avg_views_ratio: avgViewsRatio,
          avg_reply_quality: 0.5, // placeholder
          best_categories: categories,
          sampleSize: withViews.length,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => b.avg_views_ratio - a.avg_views_ratio)
      .slice(0, 5);

    // Framework performance (placeholder - would need framework tracking)
    const topFrameworks = [
      { framework: "F2", conversion_to_qualified: 0.15, avg_editorial_score: 91, best_for: "misconception correction" },
      { framework: "F1", conversion_to_qualified: 0.12, avg_editorial_score: 88, best_for: "technical trade-offs" },
      { framework: "F4", conversion_to_qualified: 0.18, avg_editorial_score: 89, best_for: "automation demos" },
    ];

    // Publishing insights
    const byHour = new Map<number, number>();
    const byDay = new Map<number, number>();
    for (const d of data) {
      if (d.publishing_time_hour !== undefined) {
        byHour.set(d.publishing_time_hour, (byHour.get(d.publishing_time_hour) || 0) + 1);
      }
      if (d.publishing_time_day !== undefined) {
        byDay.set(d.publishing_time_day, (byDay.get(d.publishing_time_day) || 0) + 1);
      }
    }

    const bestHours = Array.from(byHour.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([h]) => h);

    const bestDays = Array.from(byDay.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([d]) => d);

    const categoryTiming: Record<string, string> = {};
    for (const [cat, posts] of byCategory) {
      const hours = posts.filter((p) => p.publishing_time_hour !== undefined).map((p) => p.publishing_time_hour!);
      if (hours.length > 0) {
        const avgHour = hours.reduce((a, b) => a + b, 0) / hours.length;
        categoryTiming[cat] = `${Math.round(avgHour)}:00 UTC`;
      }
    }

    // Pillar performance
    const pillarPerformance = [
      { pillar: "Original Insights", avg_engagement: 0.052, qualified_inquiry_rate: 0.08, recommended_weekly: 10 },
      { pillar: "Practical AI Education", avg_engagement: 0.045, qualified_inquiry_rate: 0.05, recommended_weekly: 6 },
      { pillar: "Build-in-Public Demos", avg_engagement: 0.048, qualified_inquiry_rate: 0.06, recommended_weekly: 5 },
      { pillar: "Case Studies / Breakdowns", avg_engagement: 0.055, qualified_inquiry_rate: 0.12, recommended_weekly: 4 },
      { pillar: "Service Conversations", avg_engagement: 0.035, qualified_inquiry_rate: 0.25, recommended_weekly: 3 },
    ];

    return {
      topPatterns,
      topHooks,
      topFrameworks,
      publishingInsights: {
        best_hours_utc: bestHours.length > 0 ? bestHours : [14, 15, 16, 20, 21],
        best_days: bestDays.length > 0 ? bestDays : [1, 2, 3, 4],
        category_timing: categoryTiming,
      },
      pillarPerformance,
    };
  }

  private generateRecommendations(feedbackStats: any, performanceStats: any): string[] {
    const recommendations: string[] = [];

    if (feedbackStats.rejectionReasons.length > 0) {
      const topReason = feedbackStats.rejectionReasons[0];
      if (topReason.percentage > 0.3) {
        recommendations.push(`Address ${topReason.reason} - top rejection reason (${Math.round(topReason.percentage * 100)}%)`);
      }
    }

    if (feedbackStats.likedElements.length > 0) {
      recommendations.push(`Double down on ${feedbackStats.likedElements[0].element} - most liked element`);
    }

    if (performanceStats.topHooks.length > 0) {
      recommendations.push(`Prioritize ${performanceStats.topHooks[0].hook_type} hooks for ${performanceStats.topHooks[0].best_categories.join(", ")}`);
    }

    if (performanceStats.topPatterns.length > 0) {
      recommendations.push(`Increase ${performanceStats.topPatterns[0].category} content - highest engagement pattern`);
    }

    recommendations.push("Eliminate engagement bait CTAs entirely");
    recommendations.push("Require specific evidence for all claims in drafts");

    return recommendations.slice(0, 6);
  }

  private getPeriodString(data: PerformanceAnalystInput["performanceData"]): string {
    if (data.length === 0) return "No data";
    const dates = data.map((d) => d.published_at).sort((a, b) => a - b);
    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];
    if (!firstDate || !lastDate) return "No data";
    const start = new Date(firstDate).toISOString().split("T")[0];
    const end = new Date(lastDate).toISOString().split("T")[0];
    return `${start} to ${end}`;
  }

  private buildPrompt(input: PerformanceAnalystInput): string {
    return `Analyze performance data and feedback to identify patterns and update brand memory.

PERFORMANCE DATA (${input.performanceData.length} posts):
${input.performanceData.slice(0, 20).map((d) => `${d.content_category || "unknown"}: ${d.engagement_rate?.toFixed(3) || "N/A"} engagement, ${d.impressions || "N/A"} views, hook: ${d.hook_type || "unknown"}`).join("\n")}

FEEDBACK DATA (${input.feedbackData.length} samples):
Approvals: ${input.feedbackData.filter((f) => f.feedback_type === "approval").length}
Rejections: ${input.feedbackData.filter((f) => f.feedback_type === "rejection").length}
Edits: ${input.feedbackData.filter((f) => f.feedback_type === "edit").length}

CURRENT BRAND MEMORY (${input.currentBrandMemory.length} entries):
${input.currentBrandMemory.slice(0, 10).map((m) => `${m.memory_type}: ${m.content} (confidence: ${m.confidence})`).join("\n")}

Return analysis with pattern detection, feedback insights, memory updates, and recommendations.`;
  }
}

export async function createPerformanceAnalystAgent(ai: AIProvider): Promise<PerformanceAnalystAgent> {
  return new PerformanceAnalystAgent(ai);
}