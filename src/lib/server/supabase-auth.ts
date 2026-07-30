import { createClient } from "@supabase/supabase-js";

import { envValue, getServerRuntimeConfig } from "./env";

export class SupabaseAuthError extends Error {
  constructor(
    readonly code:
      | "auth_not_configured"
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
  captchaToken?: string;
}): Promise<void> {
  const client = authClient();
  const { error } = await client.auth.signInWithOtp({
    email: input.email,
    options: {
      captchaToken: input.captchaToken,
      shouldCreateUser: true,
    },
  });
  if (error) {
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
  const { data, error } = await client.auth.verifyOtp({
    email: input.email,
    token: input.token,
    type: "email",
  });
  const email = data.user?.email?.trim().toLowerCase();
  if (error || !data.user?.id || !email) {
    throw new SupabaseAuthError(
      "otp_verification_failed",
      "The sign-in code is invalid or has expired.",
    );
  }
  return { userId: data.user.id, email };
}
