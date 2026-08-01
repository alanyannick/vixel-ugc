"use client";

import {
  createContext,
  FormEvent,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { ArrowRight, KeyRound, LockKeyhole, MailCheck } from "lucide-react";
import Link from "next/link";

import {
  TurnstileWidget,
  type TurnstileState,
  turnstileVerificationRequired,
} from "@/components/auth/turnstile-widget";
import { IconMark } from "@/components/studio/icon-mark";

import styles from "./studio.module.css";

type GateState =
  "checking" | "open" | "email" | "otp" | "pending" | "suspended" | "recovery";

export type SessionKind = "none" | "account" | "recovery";

export type AccessGateSession = {
  canSignOut: boolean;
  sessionKind: SessionKind;
  signOutError: string;
  signingOut: boolean;
  signOut: () => Promise<void>;
  storageScope: string;
};

type AccountSessionResponse = {
  authenticated?: boolean;
  ready?: boolean;
  account?: {
    userId?: string;
    email?: string;
    accountStatus?: "pending" | "approved" | "suspended";
  };
};

type AccountSessionErrorResponse = {
  error?: { code?: string; message?: string };
};

const AccessGateSessionContext = createContext<AccessGateSession | null>(null);

export function useAccessGateSession(): AccessGateSession {
  const session = useContext(AccessGateSessionContext);
  if (!session) {
    throw new Error("useAccessGateSession must be used inside AccessGate.");
  }
  return session;
}

async function responseMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return body?.error?.message ?? fallback;
}

export function AccessGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>("checking");
  const [sessionKind, setSessionKind] = useState<SessionKind>("none");
  const [accountUserId, setAccountUserId] = useState<string | null>(null);
  const [accessRequired, setAccessRequired] = useState(false);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaRequired = turnstileVerificationRequired();
  const [captchaVerified, setCaptchaVerified] = useState(!captchaRequired);
  const [captchaAttempt, setCaptchaAttempt] = useState(0);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [operatorRecoveryEnabled, setOperatorRecoveryEnabled] = useState(false);

  const onCaptchaToken = useCallback((value: string) => {
    setCaptchaToken(value);
  }, []);
  const onCaptchaState = useCallback((captchaState: TurnstileState) => {
    setCaptchaVerified(!captchaState.required || captchaState.verified);
  }, []);
  const resetCaptcha = useCallback(() => {
    setCaptchaToken("");
    setCaptchaVerified(!turnstileVerificationRequired());
    setCaptchaAttempt((value) => value + 1);
  }, []);

  const acceptAccountState = useCallback((body: AccountSessionResponse) => {
    if (body.authenticated) {
      if (!body.account?.userId) return false;
      setSessionKind("account");
      setAccountUserId(body.account.userId);
      setAccessRequired(true);
      setState(body.account.accountStatus === "approved" ? "open" : "pending");
      return true;
    }
    if (body.ready) {
      setSessionKind("none");
      setAccountUserId(null);
      setState("email");
      return true;
    }
    return false;
  }, []);

  const acceptAccountError = useCallback(
    (body: AccountSessionErrorResponse | null) => {
      if (body?.error?.code !== "account_suspended") return false;
      setSessionKind("account");
      setAccountUserId(null);
      setAccessRequired(true);
      setError("");
      setState("suspended");
      return true;
    },
    [],
  );

  useEffect(() => {
    let active = true;
    async function checkAccess() {
      const operatorRecoveryRequested =
        new URLSearchParams(window.location.search).get("operator") ===
        "recovery";
      setOperatorRecoveryEnabled(operatorRecoveryRequested);
      let accountFailure =
        "Account access could not be verified. Check your connection and try again.";
      try {
        const accountResponse = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        if (!active) return;
        if (accountResponse.ok) {
          const accountBody = (await accountResponse
            .json()
            .catch(() => null)) as AccountSessionResponse | null;
          if (
            accountBody &&
            (!operatorRecoveryRequested ||
              (accountBody.authenticated &&
                accountBody.account?.accountStatus === "approved")) &&
            acceptAccountState(accountBody)
          ) {
            return;
          }
          if (accountBody?.ready === false) {
            accountFailure =
              "Email account access is not available on this deployment.";
          } else if (accountBody?.authenticated) {
            accountFailure =
              "Account access returned an incomplete session. Sign in again to continue.";
          }
        } else {
          const accountError = (await accountResponse
            .json()
            .catch(() => null)) as AccountSessionErrorResponse | null;
          accountFailure =
            accountError?.error?.message ??
            "Account access could not be verified. Try again shortly.";
          if (acceptAccountError(accountError)) return;
        }
      } catch {
        accountFailure =
          "Account access could not be verified. Check your connection and try again.";
      }

      if (!active) return;
      if (!operatorRecoveryRequested) {
        setSessionKind("none");
        setAccountUserId(null);
        setError(accountFailure);
        setState("email");
        return;
      }

      try {
        const recoveryResponse = await fetch("/api/auth/access", {
          cache: "no-store",
        });
        if (!active) return;
        if (!recoveryResponse.ok) {
          setError(
            "Operator recovery access could not be verified. Check your connection and try again.",
          );
          setState("recovery");
          return;
        }
        const recoveryBody = (await recoveryResponse
          .json()
          .catch(() => null)) as {
          authenticated?: boolean;
          required?: boolean;
        } | null;
        if (!recoveryBody) {
          setError("Operator recovery returned an invalid response.");
          setState("recovery");
          return;
        }
        setAccountUserId(null);
        setAccessRequired(recoveryBody.required === true);
        if (recoveryBody.authenticated || recoveryBody.required === false) {
          setSessionKind(recoveryBody.required === false ? "none" : "recovery");
          setState("open");
        } else {
          setState("recovery");
        }
      } catch {
        if (active) {
          setError(
            "Operator recovery access could not be verified. Check your connection and try again.",
          );
          setState("recovery");
        }
      }
    }
    void checkAccess();
    return () => {
      active = false;
    };
  }, [acceptAccountError, acceptAccountState]);

  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) {
      setError("Enter your email address.");
      return;
    }
    if (captchaRequired && !captchaVerified) {
      setError("Complete the security check before requesting a sign-in code.");
      return;
    }
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, captchaToken }),
      });
      if (!response.ok) {
        throw new Error(
          await responseMessage(
            response,
            "The sign-in code could not be sent.",
          ),
        );
      }
      setNotice("A six-digit code is on its way. It expires shortly.");
      setState("otp");
    } catch (caught) {
      resetCaptcha();
      setError(
        caught instanceof Error
          ? caught.message
          : "The code could not be sent.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    if (!/^[0-9]{6}$/.test(otp)) {
      setError("Enter the six-digit code from your email.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code: otp }),
      });
      if (!response.ok) {
        throw new Error(
          await responseMessage(response, "The sign-in code is not valid."),
        );
      }
      const sessionResponse = await fetch("/api/auth/session", {
        cache: "no-store",
      });
      if (!sessionResponse.ok) {
        const sessionError = (await sessionResponse
          .json()
          .catch(() => null)) as AccountSessionErrorResponse | null;
        if (acceptAccountError(sessionError)) return;
        throw new Error(
          sessionError?.error?.message ??
            "Your account was verified, but Studio access could not be loaded.",
        );
      }
      const sessionBody = (await sessionResponse
        .json()
        .catch(() => null)) as AccountSessionResponse | null;
      if (!sessionBody?.authenticated || !acceptAccountState(sessionBody)) {
        throw new Error(
          "Your account was verified, but Studio returned an incomplete session.",
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Verification failed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function submitRecovery(event: FormEvent) {
    event.preventDefault();
    if (!code.trim()) {
      setError("Enter the operator recovery code.");
      return;
    }
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/auth/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!response.ok) {
        throw new Error(
          await responseMessage(response, "That recovery code is not valid."),
        );
      }
      const body = (await response.json().catch(() => null)) as {
        required?: boolean;
      } | null;
      setAccountUserId(null);
      setAccessRequired(body?.required !== false);
      setSessionKind(body?.required === false ? "none" : "recovery");
      setState("open");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Access failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function signOut() {
    if (!accessRequired || signingOut) return;
    setSigningOut(true);
    setError("");
    setNotice("");
    try {
      const endpoint =
        sessionKind === "account" ? "/api/auth/session" : "/api/auth/access";
      const response = await fetch(endpoint, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(
          await responseMessage(response, "The studio could not sign out."),
        );
      }
      setCode("");
      setOtp("");
      if (sessionKind === "recovery") {
        setNotice(
          "Signed out. Your paid-job recovery identity stays on this browser so prior jobs can be recovered after you sign in again.",
        );
        setState("recovery");
      } else {
        setNotice("Signed out of Vixel Campaigns.");
        resetCaptcha();
        setState("email");
      }
      setSessionKind("none");
      setAccountUserId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign out failed.");
    } finally {
      setSigningOut(false);
    }
  }

  if (state === "open") {
    const storageScope =
      sessionKind === "account" && accountUserId
        ? accountUserId
        : sessionKind === "recovery"
          ? "operator-recovery"
          : "planning";
    return (
      <AccessGateSessionContext.Provider
        value={{
          canSignOut: accessRequired,
          sessionKind,
          signOutError: error,
          signingOut,
          signOut,
          storageScope,
        }}
      >
        {children}
      </AccessGateSessionContext.Provider>
    );
  }

  if (state === "checking") {
    return (
      <div className={styles.gatePage} data-studio-shell>
        <IconMark className={styles.gateMark} />
        <p className={styles.gateEyebrow}>Vixel Campaigns</p>
        <p className={styles.gateChecking}>Checking UGC Campaign access…</p>
      </div>
    );
  }

  if (state === "pending") {
    return (
      <div className={styles.gatePage} data-studio-shell>
        <section className={styles.gateCard} aria-labelledby="gate-title">
          <div className={styles.gateHeader}>
            <IconMark className={styles.gateMark} />
            <span className={styles.gateLock}>
              <MailCheck size={16} />
              Waitlist received
            </span>
          </div>
          <p className={styles.gateEyebrow}>Vixel Campaigns private beta</p>
          <h1 id="gate-title">You’re on the list.</h1>
          <p>
            Your account is ready. Studio opens after an operator approves your
            beta access; we’ll email you when the room is available.
          </p>
          <div className={styles.gateActions}>
            <Link href="/">Return to product</Link>
            <Link href="/pricing">Manage billing</Link>
            <button type="button" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (state === "suspended") {
    return (
      <div className={styles.gatePage} data-studio-shell>
        <section className={styles.gateCard} aria-labelledby="gate-title">
          <div className={styles.gateHeader}>
            <IconMark className={styles.gateMark} />
            <span className={styles.gateLock}>
              <LockKeyhole size={16} />
              Studio access suspended
            </span>
          </div>
          <p className={styles.gateEyebrow}>Vixel Campaigns account</p>
          <h1 id="gate-title">Studio access is suspended.</h1>
          <p>
            Product access is paused. If you have a paid subscription, you can
            still open Stripe from Pricing to manage or cancel billing.
          </p>
          <div className={styles.gateActions}>
            <Link href="/pricing">Manage billing</Link>
            <button type="button" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </section>
      </div>
    );
  }

  const accountMode = state === "email" || state === "otp";
  return (
    <div className={styles.gatePage} data-studio-shell>
      <section className={styles.gateCard} aria-labelledby="gate-title">
        <div className={styles.gateHeader}>
          <IconMark className={styles.gateMark} />
          <span className={styles.gateLock}>
            {accountMode ? <MailCheck size={16} /> : <LockKeyhole size={16} />}
            {accountMode ? "Email sign up or login" : "Emergency access"}
          </span>
        </div>
        <p className={styles.gateEyebrow}>Vixel Campaigns</p>
        <h1 id="gate-title">
          {state === "otp"
            ? "Check your inbox."
            : accountMode
              ? "Create an account or sign in."
              : "Emergency operator access."}
        </h1>
        <p>
          {state === "otp"
            ? `Enter the six-digit code sent to ${email.trim().toLowerCase()}.`
            : accountMode
              ? "Use the same email you joined the waitlist with. We’ll send a six-digit code—no password needed. New accounts stay pending until approval."
              : "Use the recovery code only when email sign-in is unavailable."}
        </p>

        {state === "email" ? (
          <form onSubmit={requestOtp} className={styles.gateForm}>
            <label htmlFor="account-email">Email</label>
            <div className={styles.gateInputRow}>
              <input
                id="account-email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                type="email"
              />
              <button
                type="submit"
                disabled={submitting || (captchaRequired && !captchaVerified)}
              >
                <span>{submitting ? "Sending" : "Send sign-in code"}</span>
                <ArrowRight size={18} />
              </button>
            </div>
            <TurnstileWidget
              key={captchaAttempt}
              onStateChange={onCaptchaState}
              onToken={onCaptchaToken}
            />
          </form>
        ) : null}

        {state === "otp" ? (
          <form onSubmit={verifyOtp} className={styles.gateForm}>
            <label htmlFor="account-otp">Six-digit code</label>
            <div className={styles.gateInputRow}>
              <input
                id="account-otp"
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(event) =>
                  setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
              />
              <button type="submit" disabled={submitting}>
                <span>{submitting ? "Checking" : "Verify"}</span>
                <ArrowRight size={18} />
              </button>
            </div>
            <button
              className={styles.gateTextButton}
              type="button"
              onClick={() => {
                resetCaptcha();
                setState("email");
              }}
            >
              Use a different email
            </button>
          </form>
        ) : null}

        {state === "recovery" ? (
          <form onSubmit={submitRecovery} className={styles.gateForm}>
            <label htmlFor="access-code">Operator recovery code</label>
            <div className={styles.gateInputRow}>
              <input
                id="access-code"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Enter operator recovery code"
                type="password"
              />
              <button type="submit" disabled={submitting}>
                <span>{submitting ? "Checking" : "Recover"}</span>
                <ArrowRight size={18} />
              </button>
            </div>
          </form>
        ) : null}

        {error ? <p className={styles.formError}>{error}</p> : null}
        {notice ? (
          <p className={styles.formNotice} role="status">
            {notice}
          </p>
        ) : null}

        {state === "recovery" ||
        (state === "email" && operatorRecoveryEnabled) ? (
          <button
            className={styles.gateRecoveryToggle}
            type="button"
            onClick={() => {
              setError("");
              if (state === "recovery") {
                setOperatorRecoveryEnabled(false);
                window.history.replaceState(
                  window.history.state,
                  "",
                  window.location.pathname,
                );
                resetCaptcha();
                setState("email");
                return;
              }
              setState("recovery");
            }}
          >
            <KeyRound size={14} />
            {state === "recovery"
              ? "Back to email sign-in"
              : "Emergency operator access"}
          </button>
        ) : null}
      </section>
    </div>
  );
}
