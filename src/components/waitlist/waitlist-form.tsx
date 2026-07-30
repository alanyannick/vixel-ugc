"use client";

import { FormEvent, useCallback, useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { TurnstileWidget } from "@/components/auth/turnstile-widget";

type WaitlistFormProps = {
  initialIntent?: string;
  initialProductUrl?: string;
  source?: string;
};

async function responseMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;
  return body?.error?.message ?? "The waitlist is temporarily unavailable.";
}

export function WaitlistForm({
  initialIntent = "",
  initialProductUrl = "",
  source = "waitlist-page",
}: WaitlistFormProps) {
  const [captchaToken, setCaptchaToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const onCaptchaToken = useCallback((value: string) => {
    setCaptchaToken(value);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const intent = String(data.get("intent") ?? "").trim();
    const productUrl = String(data.get("productUrl") ?? "").trim();
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          displayName: data.get("displayName"),
          company: data.get("company"),
          expectedVolume: data.get("expectedVolume"),
          useCase: [intent, productUrl ? `Product: ${productUrl}` : ""]
            .filter(Boolean)
            .join("\n"),
          productUpdatesOptedIn: data.get("productUpdatesOptedIn") === "on",
          source,
          captchaToken,
        }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setComplete(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The waitlist is temporarily unavailable.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (complete) {
    return (
      <div className="waitlist-success" role="status">
        <CheckCircle2 aria-hidden="true" size={28} />
        <span>Request received</span>
        <h2>You’re on the Vixel UGC list.</h2>
        <p>
          We sent a confirmation and will email you again when your Studio
          access is approved.
        </p>
      </div>
    );
  }

  return (
    <form className="waitlist-form" onSubmit={submit}>
      <div className="waitlist-form-grid">
        <label>
          <span>Email</span>
          <input
            autoComplete="email"
            maxLength={320}
            name="email"
            placeholder="you@company.com"
            required
            type="email"
          />
        </label>
        <label>
          <span>Name</span>
          <input
            autoComplete="name"
            maxLength={120}
            name="displayName"
            placeholder="Your name"
          />
        </label>
        <label>
          <span>Company</span>
          <input
            autoComplete="organization"
            maxLength={160}
            name="company"
            placeholder="Brand or studio"
          />
        </label>
        <label>
          <span>Monthly video volume</span>
          <select defaultValue="" name="expectedVolume">
            <option disabled value="">
              Select a range
            </option>
            <option value="1-10">1–10 videos</option>
            <option value="11-50">11–50 videos</option>
            <option value="51-200">51–200 videos</option>
            <option value="200+">200+ videos</option>
          </select>
        </label>
      </div>
      <label>
        <span>Campaign idea</span>
        <textarea
          defaultValue={initialIntent}
          maxLength={500}
          name="intent"
          placeholder="What product and creator angle do you want to test?"
          rows={4}
        />
      </label>
      <label>
        <span>Product link</span>
        <input
          defaultValue={initialProductUrl}
          maxLength={512}
          name="productUrl"
          placeholder="https://…"
          type="url"
        />
      </label>
      <label className="waitlist-consent">
        <input name="productUpdatesOptedIn" type="checkbox" />
        <span>
          Send me occasional product updates. This is optional and can be
          turned off anytime.
        </span>
      </label>
      <TurnstileWidget action="waitlist" onToken={onCaptchaToken} />
      {error ? (
        <p className="waitlist-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="button button--citron" disabled={submitting} type="submit">
        {submitting ? "Joining…" : "Join the private beta"}
        <ArrowRight aria-hidden="true" size={18} />
      </button>
      <small>
        Joining the waitlist does not start a subscription or trigger paid
        generation.
      </small>
    </form>
  );
}
