import { createClient } from "@supabase/supabase-js";

import { envValue, getServerRuntimeConfig } from "./env";

export class SupabaseAuthError extends Error {
  constructor(
    readonly code:
      | "auth_not_configured"
      | "bot_check_failed"
      | "otp_request_failed"
      | "otp_verification_failed",
    message: string,
  ) {
    super(message);
    this.name = "SupabaseAuthError";
  }
}

function authClient() {
  const runtime = getServerRuntimeConfig();
  const url = runtime.product.supabase.url;
  const publishableKey = envValue(
    process.env,
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );
  if (!url || !publishableKey) {
    throw new SupabaseAuthError(
      "auth_not_configured",
      "Account authentication is not configured.",
    );
  }
  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export async function requestSupabaseEmailOtp(input: {
  email: string;
  captchaToken: string;
}): Promise<void> {
  const client = authClient();
  const { error } = await client.auth.signInWithOtp({
    email: input.email,
    options: {
      // Supabase Auth must redeem the single-use token itself. CAPTCHA is
      // enabled at the Auth provider so direct calls with the public key are
      // protected by the same challenge as this application route.
      captchaToken: input.captchaToken,
      shouldCreateUser: true,
    },
  });
  if (error) {
    if (error.code === "captcha_failed") {
      throw new SupabaseAuthError(
        "bot_check_failed",
        "The security check could not be verified.",
      );
    }
    throw new SupabaseAuthError(
      "otp_request_failed",
      "The sign-in code could not be sent.",
    );
  }
}

export async function verifySupabaseEmailOtp(input: {
  email: string;
  token: string;
}): Promise<{ userId: string; email: string }> {
  const client = authClient();
  const requestedEmail = input.email.trim().toLowerCase();
  const { data, error } = await client.auth.verifyOtp({
    email: requestedEmail,
    token: input.token,
    type: "email",
  });
  const userId = data.user?.id?.trim().toLowerCase();
  const email = data.user?.email?.trim().toLowerCase();
  if (
    error ||
    !userId ||
    !email ||
    email.length > 320 ||
    email !== requestedEmail
  ) {
    throw new SupabaseAuthError(
      "otp_verification_failed",
      "The sign-in code is invalid or has expired.",
    );
  }
  return { userId, email };
}
