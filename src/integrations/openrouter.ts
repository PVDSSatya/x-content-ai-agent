import OpenAI from "openai";
import { z } from "zod";
import type { Env } from "../index";

export interface AIProviderConfig {
  apiKey: string;
  baseURL: string;
  defaultModel: string;
  fallbackModel: string;
  maxTokensPerRequest: number;
  maxTotalTokensPerRun: number;
  temperature: number;
  maxRetries: number;
  retryBaseDelayMs: number;
}

export interface AIRequest {
  model?: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "json" | "text";
  schema?: z.ZodSchema;
}

export interface AIResponse<T = unknown> {
  content: T;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  finishReason: string;
}

export interface AIProvider {
  complete<T>(request: AIRequest): Promise<AIResponse<T>>;
  getTokenUsage(): number;
  resetTokenUsage(): void;
}

export class OpenRouterProvider implements AIProvider {
  private client: OpenAI;
  private config: AIProviderConfig;
  private totalTokensUsed = 0;
  private requestCount = 0;

  constructor(config: AIProviderConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      maxRetries: 0, // Disable SDK internal retries so our retry/fallback loop doesn't multiply requests
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/x-content-ai-agent",
        "X-Title": "X Content AI Agent",
      },
    });
  }

  static fromEnv(env: Env): OpenRouterProvider {
    if (!env.OPENROUTER_API_KEY) {
      throw new Error(
        "OPENROUTER_API_KEY is not configured. Set it as a Worker secret or set ENABLE_MOCK_INTEGRATIONS=true."
      );
    }
    return new OpenRouterProvider({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      defaultModel: env.OPENROUTER_MODEL || "google/gemma-4-31b-it:free",
      fallbackModel: env.OPENROUTER_FALLBACK_MODEL || "openrouter/free",
      maxTokensPerRequest: parseInt(env.AI_MAX_TOKENS_PER_REQUEST || "4000"),
      maxTotalTokensPerRun: parseInt(env.AI_MAX_TOTAL_TOKENS_PER_RUN || "50000"),
      temperature: parseFloat(env.AI_TEMPERATURE || "0.7"),
      maxRetries: parseInt(env.AI_MAX_RETRIES || "3"),
      retryBaseDelayMs: parseInt(env.AI_RETRY_BASE_DELAY_MS || "1000"),
    });
  }

  async complete<T>(request: AIRequest): Promise<AIResponse<T>> {
    const primaryModel = request.model || this.config.defaultModel;

    // Check token budget
    if (this.totalTokensUsed >= this.config.maxTotalTokensPerRun) {
      throw new Error(`Token budget exceeded: ${this.totalTokensUsed}/${this.config.maxTotalTokensPerRun}`);
    }

    try {
      return await this.completeWithModel<T>(primaryModel, request);
    } catch (primaryError) {
      // Do not fall back on invalid credentials
      if (primaryError instanceof OpenAI.APIError && (primaryError.status === 401 || primaryError.status === 403)) {
        throw primaryError;
      }

      const fallback = this.config.fallbackModel;
      const isGlobalFreeRateLimit = this.isGlobalFreeTierRateLimit(primaryError);
      if (fallback && fallback !== primaryModel && !(isGlobalFreeRateLimit && this.isFreeModel(fallback))) {
        console.warn(`Primary model "${primaryModel}" failed, falling back to "${fallback}":`, primaryError);
        return await this.completeWithModel<T>(fallback, request);
      }

      throw primaryError;
    }
  }

  private isFreeModel(model: string): boolean {
    return model === "openrouter/free" || model.endsWith(":free");
  }

  private isGlobalFreeTierRateLimit(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("free-models-per-min") || message.includes("free-models-per-day");
  }

  private async completeWithModel<T>(model: string, request: AIRequest): Promise<AIResponse<T>> {
    const temperature = request.temperature ?? this.config.temperature;
    const maxTokens = request.maxTokens ?? this.config.maxTokensPerRequest;
    const messages = request.messages;
    let useJsonFormat = request.responseFormat === "json";
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const completion = await this.client.chat.completions.create({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          response_format: useJsonFormat ? { type: "json_object" } : undefined,
        });

        const content = completion.choices[0]?.message?.content || "";
        const usage = completion.usage;
        const promptTokens = usage?.prompt_tokens ?? 0;
        const completionTokens = usage?.completion_tokens ?? 0;
        const totalTokens = usage?.total_tokens ?? (promptTokens + completionTokens);

        this.totalTokensUsed += totalTokens;
        this.requestCount++;

        let parsedContent: T = content as T;

        // Parse and validate JSON if schema provided
        if (request.responseFormat === "json" && request.schema) {
          parsedContent = this.parseJsonResponse<T>(content, request.schema);
        }

        return {
          content: parsedContent,
          usage: {
            promptTokens,
            completionTokens,
            totalTokens,
          },
          model: completion.model || model,
          finishReason: completion.choices[0]?.finish_reason || "unknown",
        };
      } catch (error) {
        lastError = error as Error;

        // Don't retry on validation errors
        if (error instanceof z.ZodError) {
          throw error;
        }

        if (error instanceof OpenAI.APIError) {
          // If provider rejects response_format, retry once without it
          if (error.status === 400 && useJsonFormat) {
            useJsonFormat = false;
            continue;
          }
          // Don't retry on permanent auth/client/missing-model/daily-limit errors
          if (
            error.status === 400 ||
            error.status === 401 ||
            error.status === 403 ||
            error.status === 404 ||
            (error.status === 429 && error.message.includes("free-models-per-day"))
          ) {
            throw error;
          }
        }

        // Wait before retry (honor Retry-After header when available, capped for Worker request limits)
        if (attempt < this.config.maxRetries) {
          const retryAfterHeader =
            error instanceof OpenAI.APIError ? error.headers?.get?.("retry-after") : null;
          const retryAfterMs = retryAfterHeader ? parseFloat(retryAfterHeader) * 1000 : NaN;
          const backoffMs =
            Number.isFinite(retryAfterMs) && retryAfterMs > 0
              ? Math.min(retryAfterMs, 15000)
              : Math.min(this.config.retryBaseDelayMs * Math.pow(2, attempt), 10000);
          await this.sleep(backoffMs + Math.random() * 500); // Add jitter
        }
      }
    }

    throw lastError || new Error("Max retries exceeded");
  }

  private parseJsonResponse<T>(rawContent: string, schema: z.ZodSchema): T {
    try {
      const cleaned = this.extractJsonString(rawContent);
      let jsonContent: unknown = JSON.parse(cleaned);

      // Unwrap `{ topics: [...] }` style objects when the schema expects a top-level array
      if (
        schema instanceof z.ZodArray &&
        jsonContent &&
        typeof jsonContent === "object" &&
        !Array.isArray(jsonContent)
      ) {
        const arrayProp = Object.values(jsonContent as Record<string, unknown>).find(Array.isArray);
        if (arrayProp) {
          jsonContent = arrayProp;
        }
      }

      return schema.parse(jsonContent) as T;
    } catch (parseError) {
      throw new Error(`Failed to parse/validate JSON response: ${parseError}`);
    }
  }

  private extractJsonString(raw: string): string {
    const trimmed = raw.trim();
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch?.[1]) {
      return fenceMatch[1].trim();
    }

    const firstObj = trimmed.indexOf("{");
    const firstArr = trimmed.indexOf("[");
    let start = -1;
    let end = -1;

    if (firstArr !== -1 && (firstObj === -1 || firstArr < firstObj)) {
      start = firstArr;
      end = trimmed.lastIndexOf("]");
    } else if (firstObj !== -1) {
      start = firstObj;
      end = trimmed.lastIndexOf("}");
    }

    if (start !== -1 && end > start) {
      return trimmed.slice(start, end + 1);
    }

    return trimmed;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getTokenUsage(): number {
    return this.totalTokensUsed;
  }

  resetTokenUsage(): void {
    this.totalTokensUsed = 0;
    this.requestCount = 0;
  }

  getRequestCount(): number {
    return this.requestCount;
  }
}

// Mock provider for testing
export class MockAIProvider implements AIProvider {
  private responses: Map<string, unknown> = new Map();
  private callLog: Array<{ request: AIRequest; response: unknown }> = [];

  setResponse(key: string, response: unknown): void {
    this.responses.set(key, response);
  }

  async complete<T>(request: AIRequest): Promise<AIResponse<T>> {
    const fullContent = request.messages.map((m) => m.content).join("|");
    const key = JSON.stringify(fullContent);
    const fullContentLower = fullContent.toLowerCase();

    // Check for schema-specific response first, then exact prompt, then registered keyword keys
    const schemaName = request.schema?.constructor?.name || "";
    const schemaKey = `schema:${schemaName}`;
    let matchedKeywordResponse: unknown;
    for (const [registeredKey, val] of this.responses.entries()) {
      if (!registeredKey.startsWith("schema:") && registeredKey.length > 0 && fullContentLower.includes(registeredKey.toLowerCase())) {
        matchedKeywordResponse = val;
        break;
      }
    }
    const response =
      this.responses.get(schemaKey) ??
      this.responses.get(key) ??
      matchedKeywordResponse ??
      this.responses.get("scoring") ??
      this.getDefaultResponse(request);

    this.callLog.push({ request, response });

    return {
      content: response as T,
      usage: {
        promptTokens: 100,
        completionTokens: 100,
        totalTokens: 200,
      },
      model: "mock-model",
      finishReason: "stop",
    };
  }

  private getDefaultResponse(request: AIRequest): unknown {
    if (request.schema) {
      // Try to infer what the schema expects
      const schemaName = request.schema.constructor.name;
      // For evaluation scoring, return an array of scored evaluations
      if (schemaName.includes("EvaluationResultSchema") || schemaName.includes("Array")) {
        return [];
      }
      // For researcher output
      return [];
    }
    return "Mock response";
  }

  // For testing: allow setting response by schema name
  setResponseForSchema(schemaName: string, response: unknown): void {
    this.responses.set(`schema:${schemaName}`, response);
  }

  getCallLog(): Array<{ request: AIRequest; response: unknown }> {
    return this.callLog;
  }

  getTokenUsage(): number {
    return 0;
  }

  resetTokenUsage(): void {}
}

// Factory function to create provider based on environment
export function createAIProvider(env: Env, mock?: boolean): AIProvider {
  if (mock || env.ENABLE_MOCK_INTEGRATIONS === "true") {
    return new MockAIProvider();
  }
  return OpenRouterProvider.fromEnv(env);
}