import { afterEach, describe, expect, it, vi } from "vitest";

const { settingsSeen } = vi.hoisted(() => ({
  settingsSeen: [] as Array<Record<string, unknown>>,
}));

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: () => ({ chatModel: () => ({}) }),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    ToolLoopAgent: class {
      private settings: {
        tools: Record<
          string,
          { execute?: (input: Record<string, string>) => Promise<unknown> }
        >;
      };

      constructor(settings: typeof this.settings) {
        this.settings = settings;
        settingsSeen.push(settings as unknown as Record<string, unknown>);
      }

      async generate() {
        await this.settings.tools.recommendRoute?.execute?.({
          hookId: "hook-1",
          personaId: "persona-1",
          rationale: "The supplied proof and voice align.",
        });
        await this.settings.tools.recommendView?.execute?.({
          view: "routes",
          reason: "Review the proposed pairing.",
        });
        return { text: "I recommend the proof-first route. Apply it to change the campaign." };
      }
    },
  };
});

import { runDirectorTurn } from "./director-agent";

afterEach(() => {
  vi.unstubAllEnvs();
  settingsSeen.length = 0;
});

function enableDirector(): void {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("ENABLE_LIVE_CREATIVE_BRIEF", "true");
  vi.stubEnv("ENABLE_ACCOUNT_AUTH", "true");
  vi.stubEnv("DATABASE_APP_URL", "postgresql://runtime@example.test/postgres");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "turnstile-site-key");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "turnstile-secret-key");
  vi.stubEnv("NEWAPI_BASE_URL", "https://gateway.example.test/v1");
  vi.stubEnv("NEWAPI_API_KEY", "provider-key");
}

describe("bounded Director agent", () => {
  it("exposes only proposal tools and returns validated campaign IDs", async () => {
    enableDirector();
    const response = await runDirectorTurn(
      {
        message: "Which route should I use?",
        campaign: {
          id: "campaign-1",
          revision: 2,
          productName: "Source Bottle",
          facts: ["Made from stainless steel."],
          audience: "Commuters",
          goal: "Product consideration",
          platform: "TikTok",
          language: "English",
          hooks: Array.from({ length: 5 }, (_, index) => ({
            id: `hook-${index + 1}`,
            label: `Hook ${index + 1}`,
            script: "Show the supplied product fact.",
            why: "The proof is visible.",
          })),
          personas: Array.from({ length: 3 }, (_, index) => ({
            id: `persona-${index + 1}`,
            label: `Persona ${index + 1}`,
            description: "A precise creator.",
            voice: "Calm and specific.",
          })),
          selectedHookId: null,
          selectedPersonaId: null,
          hasAcceptedImage: false,
          hasAcceptedVideo: false,
        },
      },
      "request-director-test",
    );

    const tools = settingsSeen[0]?.tools as Record<string, unknown>;
    expect(Object.keys(tools)).toEqual(["recommendRoute", "recommendView"]);
    expect(response).toMatchObject({
      provider: "live",
      campaignRevision: 2,
      recommendation: { hookId: "hook-1", personaId: "persona-1" },
      nextView: { view: "routes" },
    });
  });
});
