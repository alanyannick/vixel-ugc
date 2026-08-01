"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CreditCard, RefreshCcw } from "lucide-react";
import Link from "next/link";

type BillingState = {
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  customerConfigured: boolean;
  entitled: boolean;
};

type PanelState =
  | { kind: "loading" }
  | { kind: "disabled" }
  | { kind: "sign-in" }
  | { kind: "unavailable"; message: string }
  | { kind: "ready"; billing: BillingState };

async function apiMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;
  return body?.error?.message ?? fallback;
}

async function loadBillingState(): Promise<PanelState> {
  try {
    const response = await fetch("/api/billing/status", {
      cache: "no-store",
    });
    if (response.status === 401 || response.status === 403) {
      return { kind: "sign-in" };
    }
    if (!response.ok) {
      return {
        kind: "unavailable",
        message: await apiMessage(
          response,
          "Subscription billing is not available yet.",
        ),
      };
    }
    const body = (await response.json()) as {
      enabled?: boolean;
      ready?: boolean;
      state?: BillingState;
    };
    if (!body.enabled || !body.ready || !body.state) {
      return {
        kind: "unavailable",
        message: "Subscription billing will open with the paid beta.",
      };
    }
    return { kind: "ready", billing: body.state };
  } catch {
    return {
      kind: "unavailable",
      message: "Subscription status could not be loaded.",
    };
  }
}

export function BillingPanel({
  compact = false,
  enabled = true,
}: {
  compact?: boolean;
  enabled?: boolean;
}) {
  const [loadedState, setLoadedState] = useState<PanelState>({ kind: "loading" });
  const state: PanelState = enabled
    ? loadedState
    : { kind: "disabled" };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoadedState(await loadBillingState());
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void loadBillingState().then((nextState) => {
      if (active) setLoadedState(nextState);
    });
    return () => {
      active = false;
    };
  }, [enabled]);

  async function openBilling(endpoint: "checkout" | "portal") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/billing/${endpoint}`, {
        method: "POST",
        headers:
          endpoint === "checkout"
            ? { "x-idempotency-key": crypto.randomUUID() }
            : undefined,
      });
      if (!response.ok) {
        throw new Error(
          await apiMessage(response, "Billing could not be opened."),
        );
      }
      const body = (await response.json()) as { url?: string };
      if (!body.url) throw new Error("Billing did not return a secure URL.");
      window.location.assign(body.url);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Billing could not open.",
      );
      setBusy(false);
    }
  }

  return (
    <section
      className={`billing-panel ${compact ? "billing-panel--compact" : ""}`}
      aria-live="polite"
    >
      <div className="billing-panel-heading">
        <CreditCard aria-hidden="true" size={compact ? 16 : 20} />
        <span>
          <strong>
            {compact ? "Subscription" : "Vixel Campaigns paid beta"}
          </strong>
          <small>
            {state.kind === "ready"
              ? state.billing.entitled
                ? state.billing.cancelAtPeriodEnd
                  ? "Active until the current period ends"
                  : "Active subscription"
                : `Status: ${state.billing.status.replaceAll("_", " ")}`
              : state.kind === "loading"
                ? "Checking secure billing state…"
                : state.kind === "disabled"
                  ? "Subscription billing is not open on this deployment"
                : state.kind === "sign-in"
                  ? "Sign in with an approved account"
                  : state.message}
          </small>
        </span>
      </div>

      {state.kind === "ready" ? (
        <button
          disabled={busy}
          onClick={() =>
            void openBilling(
              state.billing.customerConfigured ? "portal" : "checkout",
            )
          }
          type="button"
        >
          {busy
            ? "Opening…"
            : state.billing.customerConfigured
              ? "Manage billing"
              : "Start subscription"}
          <ArrowRight aria-hidden="true" size={15} />
        </button>
      ) : state.kind === "sign-in" ? (
        <Link href="/studio">
          Sign in
          <ArrowRight aria-hidden="true" size={15} />
        </Link>
      ) : state.kind === "unavailable" ? (
        <button onClick={() => void refresh()} type="button">
          Retry
          <RefreshCcw aria-hidden="true" size={14} />
        </button>
      ) : null}
      {error ? (
        <small className="billing-panel-error" role="alert">
          {error}
        </small>
      ) : null}
    </section>
  );
}
