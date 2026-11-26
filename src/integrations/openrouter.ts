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
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/x-content-ai-agent",
        "X-Title": "X Content AI Agent",
      },
    });
  }

  static fromEnv(env: Env): OpenRouterProvider {
    return new OpenRouterProvider({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      defaultModel: env.OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet",
      fallbackModel: env.OPENROUTER_FALLBACK_MODEL || "google/gemini-1.5-flash",
      maxTokensPerRequest: parseInt(env.AI_MAX_TOKENS_PER_REQUEST || "4000"),
      maxTotalTokensPerRun: parseInt(env.AI_MAX_TOTAL_TOKENS_PER_RUN || "50000"),
      temperature: parseFloat(env.AI_TEMPERATURE || "0.7"),
      maxRetries: parseInt(env.AI_MAX_RETRIES || "3"),
      retryBaseDelayMs: parseInt(env.AI_RETRY_BASE_DELAY_MS || "1000"),
    });
  }

  async complete<T>(request: AIRequest): Promise<AIResponse<T>> {
    const model = request.model || this.config.defaultModel;
    const temperature = request.temperature ?? this.config.temperature;
    const maxTokens = request.maxTokens ?? this.config.maxTokensPerRequest;

    // Check token budget
    if (this.totalTokensUsed >= this.config.maxTotalTokensPerRun) {
      throw new Error(`Token budget exceeded: ${this.totalTokensUsed}/${this.config.maxTotalTokensPerRun}`);
    }

    const messages = request.messages;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const completion = await this.client.chat.completions.create({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          response_format: request.responseFormat === "json" ? { type: "json_object" } : undefined,
        });

        const content = completion.choices[0]?.message?.content || "";
        const usage = completion.usage;

        if (!usage) {
          throw new Error("No usage data returned from API");
        }

        this.totalTokensUsed += usage.total_tokens;
        this.requestCount++;

        let parsedContent: T = content as T;

        // Parse and validate JSON if schema provided
        if (request.responseFormat === "json" && request.schema) {
          try {
            const jsonContent = JSON.parse(content);
            parsedContent = request.schema.parse(jsonContent);
          } catch (parseError) {
            throw new Error(`Failed to parse/validate JSON response: ${parseError}`);
          }
        }

        return {
          content: parsedContent,
          usage: {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
          },
          model: completion.model,
          finishReason: completion.choices[0]?.finish_reason || "unknown",
        };
      } catch (error) {
        lastError = error as Error;

        // Don't retry on validation errors
        if (error instanceof z.ZodError) {
          throw error;
        }

        // Don't retry on certain HTTP errors
        if (error instanceof OpenAI.APIError) {
          if (error.status === 400 || error.status === 401 || error.status === 403) {
            throw error;
          }
        }

        // Wait before retry with exponential backoff
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryBaseDelayMs * Math.pow(2, attempt);
          await this.sleep(delay + Math.random() * 1000); // Add jitter
        }
      }
    }

    throw lastError || new Error("Max retries exceeded");
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
    const key = JSON.stringify(request.messages.map((m) => m.content).join("|"));

    // Check for schema-specific response first
    const schemaName = request.schema?.constructor?.name || "";
    const schemaKey = `schema:${schemaName}`;
    const response = this.responses.get(schemaKey) || this.responses.get(key) || this.responses.get("scoring") || this.getDefaultResponse(request);

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