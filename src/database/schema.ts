import { z } from "zod";

// Research topic schema
export const ResearchTopicSchema = z.object({
  id: z.string(),
  topic: z.string(),
  category: z.string(),
  summary: z.string(),
  verified_facts: z.array(z.string()),
  source_urls: z.array(z.string().url()),
  source_publication_dates: z.array(z.string()),
  audience_relevance: z.number().min(0).max(1),
  novelty_score: z.number().min(0).max(1),
  freshness_score: z.number().min(0).max(1),
  content_opportunity_score: z.number().min(0).max(1),
  status: z.enum(["discovered", "analyzed", "used", "archived"]),
  created_at: z.number(),
  updated_at: z.number(),
  metadata: z.record(z.unknown()).optional(),
});

export type ResearchTopic = z.infer<typeof ResearchTopicSchema>;

// Viral framework schema
export const ViralFrameworkSchema = z.object({
  id: z.string(),
  source_post_url: z.string().url().optional(),
  source_post_text: z.string().optional(),
  source_post_metrics: z.record(z.unknown()).optional(),
  context_analysis: z.record(z.unknown()).optional(),
  mechanisms_identified: z.array(z.string()),
  frameworks_extracted: z.array(z.string()),
  transferable_principle: z.string(),
  competing_explanations: z.array(z.string()).optional(),
  original_applications: z.array(z.string()).optional(),
  created_at: z.number(),
  updated_at: z.number(),
});

export type ViralFramework = z.infer<typeof ViralFrameworkSchema>;

// Content draft schema
export const ContentDraftSchema = z.object({
  id: z.string(),
  draft_id: z.string(),
  topic_id: z.string().optional(),
  topic: z.string(),
  category: z.string(),
  content_format: z.string(),
  target_audience: z.string(),
  hook_type: z.string(),
  primary_hook: z.string(),
  alternative_hooks: z.array(z.string()),
  recommended_post: z.string(),
  alternative_posts: z.array(z.string()),
  character_count: z.number().int().min(0),
  content_framework: z.string(),
  core_insight: z.string(),
  originality_score: z.number().min(0).max(100),
  editorial_score: z.number().min(0).max(100),
  engagement_potential: z.enum(["low", "medium", "high", "very_high"]),
  fact_check_status: z.enum(["passed", "failed", "needs_review"]),
  verified_claims: z.array(z.string()),
  source_urls: z.array(z.string().url()),
  source_publication_dates: z.array(z.string()),
  visual_content_suggestion: z.string().optional(),
  reason_for_selection: z.string(),
  platform_compliance_status: z.enum(["compliant", "needs_review", "non_compliant"]),
  requires_manual_publication: z.boolean(),
  status: z.enum(["pending_approval", "approved", "rejected", "published", "archived"]),
  generation_mode: z.enum(["automatic", "topic", "url", "viral_framework", "evergreen"]),
  input_parameters: z.record(z.unknown()).optional(),
  created_at: z.number(),
  updated_at: z.number(),
  approved_at: z.number().optional(),
  published_at: z.number().optional(),
});

export type ContentDraft = z.infer<typeof ContentDraftSchema>;

// Feedback schema
export const FeedbackSchema = z.object({
  id: z.string(),
  draft_id: z.string(),
  feedback_type: z.enum(["approval", "rejection", "edit", "rewrite", "rating"]),
  rating: z.number().int().min(1).max(10).optional(),
  liked_elements: z.array(z.string()).optional(),
  disliked_elements: z.array(z.string()).optional(),
  suggested_changes: z.string().optional(),
  editor_notes: z.string().optional(),
  applied_to_future_generation: z.boolean(),
  created_at: z.number(),
});

export type Feedback = z.infer<typeof FeedbackSchema>;

// Brand memory schema
export const BrandMemorySchema = z.object({
  id: z.string(),
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
  confidence: z.number().min(0).max(1).default(0.5),
  usage_count: z.number().int().default(0),
  last_used_at: z.number().optional(),
  created_at: z.number(),
  updated_at: z.number(),
  metadata: z.record(z.unknown()).optional(),
});

export type BrandMemory = z.infer<typeof BrandMemorySchema>;

// Performance data schema
export const PerformanceDataSchema = z.object({
  id: z.string(),
  draft_id: z.string(),
  post_text: z.string(),
  published_at: z.number(),
  platform_post_id: z.string().optional(),
  impressions: z.number().int().optional(),
  likes: z.number().int().optional(),
  replies: z.number().int().optional(),
  reposts: z.number().int().optional(),
  quotes: z.number().int().optional(),
  bookmarks: z.number().int().optional(),
  profile_visits: z.number().int().optional(),
  link_clicks: z.number().int().optional(),
  follower_growth: z.number().int().optional(),
  engagement_rate: z.number().optional(),
  qualified_inquiries: z.number().int().optional(),
  content_category: z.string().optional(),
  hook_type: z.string().optional(),
  publishing_time_hour: z.number().int().min(0).max(23).optional(),
  publishing_time_day: z.number().int().min(0).max(6).optional(),
  approval_rate: z.number().optional(),
  rejection_reasons: z.array(z.string()).optional(),
  human_editing_preferences: z.record(z.unknown()).optional(),
  snapshot_at: z.number(),
  created_at: z.number(),
});

export type PerformanceData = z.infer<typeof PerformanceDataSchema>;

// Workflow execution schema
export const WorkflowExecutionSchema = z.object({
  id: z.string(),
  workflow_name: z.string(),
  status: z.enum(["running", "completed", "failed", "paused"]),
  current_step: z.string().optional(),
  input_parameters: z.record(z.unknown()).optional(),
  step_outputs: z.record(z.unknown()).optional(),
  error_message: z.string().optional(),
  retry_count: z.number().int().default(0),
  started_at: z.number(),
  completed_at: z.number().optional(),
  updated_at: z.number(),
});

export type WorkflowExecution = z.infer<typeof WorkflowExecutionSchema>;

// API request/response schemas
export const GenerateContentRequestSchema = z.object({
  mode: z.enum(["automatic", "topic", "url", "viral_framework", "evergreen"]),
  topic: z.string().optional(),
  url: z.string().url().optional(),
  source_posts: z.array(z.object({
    url: z.string().url().optional(),
    text: z.string().optional(),
    metrics: z.record(z.unknown()).optional(),
  })).optional(),
  options: z.object({
    max_variations: z.number().int().min(1).max(10).optional(),
    content_format: z.string().optional(),
    target_audience: z.string().optional(),
  }).optional(),
});

export type GenerateContentRequest = z.infer<typeof GenerateContentRequestSchema>;

export const GenerateContentResponseSchema = z.object({
  success: z.boolean(),
  workflow_id: z.string(),
  draft: ContentDraftSchema.optional(),
  error: z.string().optional(),
});

export type GenerateContentResponse = z.infer<typeof GenerateContentResponseSchema>;

export const DraftListResponseSchema = z.object({
  drafts: z.array(ContentDraftSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

export type DraftListResponse = z.infer<typeof DraftListResponseSchema>;

export const FeedbackRequestSchema = z.object({
  draft_id: z.string(),
  feedback_type: z.enum(["approval", "rejection", "edit", "rewrite", "rating"]),
  rating: z.number().int().min(1).max(10).optional(),
  liked_elements: z.array(z.string()).optional(),
  disliked_elements: z.array(z.string()).optional(),
  suggested_changes: z.string().optional(),
  editor_notes: z.string().optional(),
});

export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;

export const HealthCheckResponseSchema = z.object({
  status: z.enum(["healthy", "degraded", "unhealthy"]),
  timestamp: z.number(),
  version: z.string(),
  services: z.record(z.enum(["healthy", "degraded", "unhealthy"])),
});

export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;