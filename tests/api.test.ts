import { describe, it, expect, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  WorkflowEntrypoint: class {},
}));

import app from "../src/index";

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
});
