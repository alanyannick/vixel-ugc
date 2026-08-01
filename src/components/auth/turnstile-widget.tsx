"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (
    target: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      appearance: "interaction-only";
      theme: "dark";
      retry: "never";
      "refresh-expired": "manual";
      "refresh-timeout": "manual";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "timeout-callback": () => void;
      "unsupported-callback": () => void;
      "error-callback": (errorCode: string) => boolean;
    },
  ) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export type TurnstileStatus =
  | "disabled"
  | "loading"
  | "ready"
  | "verified"
  | "expired"
  | "timeout"
  | "unsupported"
  | "error";

export type TurnstileState = {
  required: boolean;
  status: TurnstileStatus;
  verified: boolean;
  errorCode?: string;
};

const SCRIPT_ID = "vixel-turnstile-script";
const SCRIPT_LOAD_TIMEOUT_MS = 10_000;

export function turnstileVerificationRequired(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim())
  );
}

function stateFor(
  status: TurnstileStatus,
  required: boolean,
  errorCode?: string,
): TurnstileState {
  return {
    required,
    status,
    verified: status === "verified",
    ...(errorCode ? { errorCode } : {}),
  };
}

function errorMessage(errorCode?: string): string {
  if (!errorCode) return "The security check failed. Please try again.";
  if (["110100", "110110", "400020", "400070"].includes(errorCode)) {
    return "The security check is misconfigured. Please contact support.";
  }
  if (errorCode === "110200") {
    return "The security check is not enabled for this domain. Please contact support.";
  }
  if (errorCode === "200100") {
    return "Check your device clock, refresh the page, and try again.";
  }
  if (errorCode === "200500" || errorCode.startsWith("script-")) {
    return "The security check could not load. Check your connection or content blocker, then retry.";
  }
  if (errorCode.startsWith("300") || errorCode.startsWith("600")) {
    return "The security check failed. Retry or use a different browser or network.";
  }
  return "The security check failed. Please retry before continuing.";
}

function statusMessage(state: TurnstileState): string {
  switch (state.status) {
    case "disabled":
      return "Security check is not required in this environment.";
    case "loading":
      return "Preparing security check…";
    case "ready":
      return "Complete the security check to continue.";
    case "verified":
      return "Security check complete.";
    case "expired":
      return "The security check expired. Retry to get a fresh check.";
    case "timeout":
      return "The security check timed out. Retry when you’re ready.";
    case "unsupported":
      return "This browser cannot run the security check. Try another supported browser.";
    case "error":
      return errorMessage(state.errorCode);
  }
}

export function TurnstileWidget({
  onToken,
  onStateChange,
  action = "otp",
}: {
  onToken: (token: string) => void;
  onStateChange?: (state: TurnstileState) => void;
  action?: "otp" | "waitlist";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const required = turnstileVerificationRequired();
  const [state, setState] = useState<TurnstileState>(() =>
    stateFor(siteKey ? "loading" : "disabled", required),
  );

  const publish = useCallback(
    (next: TurnstileState) => {
      setState(next);
      onStateChange?.(next);
    },
    [onStateChange],
  );

  useEffect(() => {
    if (!siteKey || !containerRef.current) {
      onToken("");
      publish(stateFor("disabled", false));
      return;
    }

    let active = true;
    let loadTimer: ReturnType<typeof setTimeout> | undefined;
    let script: HTMLScriptElement | null = null;

    const fail = (errorCode: string) => {
      if (!active) return;
      if (loadTimer) clearTimeout(loadTimer);
      onToken("");
      publish(stateFor("error", required, errorCode));
    };

    const renderWidget = () => {
      if (
        !active ||
        !window.turnstile ||
        !containerRef.current ||
        widgetIdRef.current
      ) {
        return;
      }
      if (loadTimer) clearTimeout(loadTimer);
      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          appearance: "interaction-only",
          theme: "dark",
          retry: "never",
          "refresh-expired": "manual",
          "refresh-timeout": "manual",
          callback: (token) => {
            if (!active) return;
            onToken(token);
            publish(stateFor("verified", required));
          },
          "expired-callback": () => {
            if (!active) return;
            onToken("");
            publish(stateFor("expired", required));
          },
          "timeout-callback": () => {
            if (!active) return;
            onToken("");
            publish(stateFor("timeout", required));
          },
          "unsupported-callback": () => {
            if (!active) return;
            onToken("");
            publish(stateFor("unsupported", required));
          },
          "error-callback": (errorCode) => {
            fail(errorCode);
            return true;
          },
        });
        publish(stateFor("ready", required));
      } catch {
        fail("render-failed");
      }
    };

    const handleScriptError = () => fail("script-load-failed");
    onToken("");
    publish(stateFor("loading", required));

    if (window.turnstile) {
      renderWidget();
    } else {
      script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement("script");
        script.id = SCRIPT_ID;
        script.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", renderWidget, { once: true });
      script.addEventListener("error", handleScriptError, { once: true });
      loadTimer = setTimeout(
        () => fail("script-timeout"),
        SCRIPT_LOAD_TIMEOUT_MS,
      );
    }

    return () => {
      active = false;
      if (loadTimer) clearTimeout(loadTimer);
      script?.removeEventListener("load", renderWidget);
      script?.removeEventListener("error", handleScriptError);
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [action, onToken, publish, required, retryNonce, siteKey]);

  const retry = useCallback(() => {
    onToken("");
    publish(stateFor("loading", required));
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
        publish(stateFor("ready", required));
        return;
      } catch {
        // Recreate the widget below when an existing instance cannot reset.
      }
    }
    if (!window.turnstile) document.getElementById(SCRIPT_ID)?.remove();
    setRetryNonce((value) => value + 1);
  }, [onToken, publish, required]);

  if (!siteKey) return null;

  const recoverable = [
    "expired",
    "timeout",
    "unsupported",
    "error",
  ].includes(state.status);
  const problem = recoverable;

  return (
    <div className="turnstile-check" data-state={state.status}>
      <div ref={containerRef} aria-label="Security check" />
      <div
        className="turnstile-feedback"
        data-tone={problem ? "error" : state.status === "verified" ? "success" : "neutral"}
        role={problem ? "alert" : "status"}
      >
        <span>{statusMessage(state)}</span>
        {state.errorCode ? <code>{state.errorCode}</code> : null}
        {recoverable ? (
          <button type="button" onClick={retry}>
            Retry security check
          </button>
        ) : null}
      </div>
    </div>
  );
}
