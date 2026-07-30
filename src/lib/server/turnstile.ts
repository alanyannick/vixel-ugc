import { envValue, getServerRuntimeConfig } from "./env";

type TurnstileResponse = {
  success?: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
};

export async function verifyTurnstile(input: {
  token: string;
  remoteIp?: string;
  expectedAction: string;
}): Promise<boolean> {
  const runtime = getServerRuntimeConfig();
  if (!runtime.production) return true;

  const secret = envValue(process.env, "TURNSTILE_SECRET_KEY");
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
    result.hostname?.toLowerCase() === expectedHostname &&
    (!result.action || result.action === input.expectedAction)
  );
}
