import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

vi.mock("cloudflare:workers", () => ({
  WorkflowEntrypoint: class {},
}));

import app from "../src/index";
import { OpenRouterProvider } from "../src/integrations/openrouter";
import { loadPrompt } from "../src/utils/prompt-loader";

describe("Worker API endpoints", () => {
  it("GET / returns service status without secrets", async () => {
    const res = await app.request("/", {}, { ENVIRONMENT: "staging" } as any);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; environment: string };
    expect(body.status).toBe("ok");
    expect(body.environment).toBe("staging");
  });

  it("GET /api/health succeeds even when OPENROUTER_API_KEY is not set", async () => {
    const res = await app.request("/api/health", {}, {} as any);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      services: { ai_provider: string; database: string; workflow: string };
    };
    expect(body.status).toBe("degraded");
    expect(body.services.ai_provider).toBe("degraded");
  });

  it("GET /api/health enforces API_KEY when configured", async () => {
    const env = { API_KEY: "secret-123", ENABLE_MOCK_INTEGRATIONS: "true", DB: {}, CONTENT_GENERATION: {} } as any;

    const unauth = await app.request("/api/health", {}, env);
    expect(unauth.status).toBe(401);

    const auth = await app.request(
      "/api/health",
      { headers: { Authorization: "Bearer secret-123" } },
      env
    );
    expect(auth.status).toBe(200);
    const body = (await auth.json()) as { status: string };
    expect(body.status).toBe("healthy");
  });

  it("POST /api/generate returns descriptive JSON error when OPENROUTER_API_KEY is missing", async () => {
    const res = await app.request(
      "/api/generate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "automatic" }),
      },
      {} as any
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toContain("OPENROUTER_API_KEY");
  });

  it("loadPrompt returns bundled markdown prompt content", async () => {
    const prompt = await loadPrompt("researcher");
    expect(prompt).toContain("Output Schema");
    expect(prompt).toContain("verified_facts");
  });

  it("OpenRouterProvider falls back and parses fenced/wrapped JSON arrays", async () => {
    const provider = OpenRouterProvider.fromEnv({
      OPENROUTER_API_KEY: "test-key",
    } as any);

    const createMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("404 model not available"))
      .mockResolvedValueOnce({
        model: "openrouter/free",
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: '```json\n{"items":[{"name":"ok"}]}\n```',
            },
          },
        ],
      });

    (provider as any).client = {
      chat: { completions: { create: createMock } },
    };
    (provider as any).config.maxRetries = 0;

    const result = await provider.complete<Array<{ name: string }>>({
      messages: [{ role: "user", content: "hi" }],
      responseFormat: "json",
      schema: z.array(z.object({ name: z.string() })),
    });

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(createMock.mock.calls[0]?.[0]?.model).toBe("google/gemma-4-31b-it:free");
    expect(createMock.mock.calls[1]?.[0]?.model).toBe("openrouter/free");
    expect(result.content).toEqual([{ name: "ok" }]);
  });
});
