import { envValue, getServerRuntimeConfig } from "./env";

type TurnstileResponse = {
  success?: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
};

// Cloudflare's documented always-pass test credentials intentionally return
// `example.com` as the hostname. Keep that exception limited to Vercel Preview
// deployments using the exact public test key pair so production continues to
// require the configured application hostname.
const CLOUDFLARE_ALWAYS_PASS_TEST_SITE_KEY = "1x00000000000000000000AA";
const CLOUDFLARE_ALWAYS_PASS_TEST_SECRET =
  "1x0000000000000000000000000000000AA";

function hostnameMatches(input: {
  hostname?: string;
  expectedHostname: string;
  siteKey: string | null;
  secret: string;
  env: NodeJS.ProcessEnv;
}): boolean {
  const hostname = input.hostname?.toLowerCase();
  if (hostname === input.expectedHostname) return true;

  return (
    input.env.VERCEL_ENV === "preview" &&
    input.siteKey === CLOUDFLARE_ALWAYS_PASS_TEST_SITE_KEY &&
    input.secret === CLOUDFLARE_ALWAYS_PASS_TEST_SECRET &&
    hostname === "example.com"
  );
}

export async function verifyTurnstile(input: {
  token: string;
  remoteIp?: string;
  expectedAction: string;
}, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const runtime = getServerRuntimeConfig(env);
  if (!runtime.production) return true;

  const secret = envValue(env, "TURNSTILE_SECRET_KEY");
  const siteUrl = runtime.product.siteUrl;
  if (!secret || !siteUrl || !input.token) return false;

  const body = new URLSearchParams({
    secret,
    response: input.token,
  });
  if (input.remoteIp) body.set("remoteip", input.remoteIp);

  let response: Response;
  try {
    response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      },
    );
  } catch {
    return false;
  }
  if (!response.ok) return false;

  const result = (await response.json().catch(() => null)) as
    | TurnstileResponse
    | null;
  if (!result?.success) return false;

  const expectedHostname = new URL(siteUrl).hostname.toLowerCase();
  return (
    hostnameMatches({
      hostname: result.hostname,
      expectedHostname,
      siteKey: runtime.product.turnstile.siteKey,
      secret,
      env,
    }) &&
    (!result.action || result.action === input.expectedAction)
  );
}
