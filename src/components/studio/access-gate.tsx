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

import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { IconMark } from "@/components/studio/icon-mark";

import styles from "./studio.module.css";

type GateState =
  | "checking"
  | "open"
  | "email"
  | "otp"
  | "pending"
  | "recovery";

type SessionKind = "none" | "account" | "recovery";

export type AccessGateSession = {
  canSignOut: boolean;
  signOutError: string;
  signingOut: boolean;
  signOut: () => Promise<void>;
};

type AccountSessionResponse = {
  authenticated?: boolean;
  ready?: boolean;
  account?: {
    email?: string;
    accountStatus?: "pending" | "approved" | "suspended";
  };
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
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;
  return body?.error?.message ?? fallback;
}

export function AccessGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>("checking");
  const [sessionKind, setSessionKind] = useState<SessionKind>("none");
  const [accessRequired, setAccessRequired] = useState(false);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [operatorRecoveryEnabled, setOperatorRecoveryEnabled] =
    useState(false);

  const acceptAccountState = useCallback((body: AccountSessionResponse) => {
    if (body.authenticated && body.account?.accountStatus === "approved") {
      setSessionKind("account");
      setAccessRequired(true);
      setState("open");
      return true;
    }
    if (body.authenticated) {
      setSessionKind("account");
      setAccessRequired(true);
      setState("pending");
      return true;
    }
    if (body.ready) {
      setState("email");
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    let active = true;
    async function checkAccess() {
      const operatorRecoveryRequested =
        new URLSearchParams(window.location.search).get("operator") ===
        "recovery";
      setOperatorRecoveryEnabled(operatorRecoveryRequested);
      try {
        const accountResponse = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        if (!active) return;
        if (accountResponse.ok) {
          const accountBody =
            (await accountResponse.json().catch(() => null)) as
              | AccountSessionResponse
              | null;
          if (
            accountBody &&
            (accountBody.authenticated || !operatorRecoveryRequested) &&
            acceptAccountState(accountBody)
          ) {
            return;
          }
        }

        const recoveryResponse = await fetch("/api/auth/access", {
          cache: "no-store",
        });
        if (!active) return;
        if (!recoveryResponse.ok) {
          setError(
            "Studio access could not be verified. Check your connection and try again.",
          );
          setState("recovery");
          return;
        }
        const recoveryBody = (await recoveryResponse.json().catch(() => null)) as
          | { authenticated?: boolean; required?: boolean }
          | null;
        if (!recoveryBody) {
          setState("recovery");
          return;
        }
        setAccessRequired(recoveryBody.required === true);
        if (
          recoveryBody.authenticated ||
          recoveryBody.required === false
        ) {
          setSessionKind(
            recoveryBody.required === false ? "none" : "recovery",
          );
          setState("open");
        } else {
          setState("recovery");
        }
      } catch {
        if (active) {
          setError(
            "Studio access could not be verified. Check your connection and try again.",
          );
          setState("recovery");
        }
      }
    }
    void checkAccess();
    return () => {
      active = false;
    };
  }, [acceptAccountState]);

  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) {
      setError("Enter your email address.");
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
          await responseMessage(response, "The sign-in code could not be sent."),
        );
      }
      setNotice("A six-digit code is on its way. It expires shortly.");
      setState("otp");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The code could not be sent.",
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
      const body = (await response.json()) as {
        account?: { accountStatus?: "pending" | "approved" | "suspended" };
      };
      setSessionKind("account");
      setAccessRequired(true);
      setState(
        body.account?.accountStatus === "approved" ? "open" : "pending",
      );
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
      const body = (await response.json().catch(() => null)) as
        | { required?: boolean }
        | null;
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
        setNotice("Signed out of Vixel UGC.");
        setState("email");
      }
      setSessionKind("none");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign out failed.");
    } finally {
      setSigningOut(false);
    }
  }

  if (state === "open") {
    return (
      <AccessGateSessionContext.Provider
        value={{
          canSignOut: accessRequired,
          signOutError: error,
          signingOut,
          signOut,
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
        <p className={styles.gateEyebrow}>Vixel UGC Studio</p>
        <p className={styles.gateChecking}>Checking studio access…</p>
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
          <p className={styles.gateEyebrow}>Vixel UGC private beta</p>
          <h1 id="gate-title">You’re on the list.</h1>
          <p>
            Your account is ready. Studio opens after an operator approves your
            beta access; we’ll email you when the room is available.
          </p>
          <div className={styles.gateActions}>
            <Link href="/">Return to product</Link>
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
            {accountMode ? "Email access" : "Emergency access"}
          </span>
        </div>
        <p className={styles.gateEyebrow}>Vixel UGC Studio</p>
        <h1 id="gate-title">
          {state === "otp"
            ? "Check your inbox."
            : accountMode
              ? "Enter the campaign room."
              : "Emergency operator access."}
        </h1>
        <p>
          {state === "otp"
            ? `Enter the six-digit code sent to ${email.trim().toLowerCase()}.`
            : accountMode
              ? "Use your approved beta email. New accounts remain on the waitlist until an operator admits them."
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
              <button type="submit" disabled={submitting}>
                <span>{submitting ? "Sending" : "Send code"}</span>
                <ArrowRight size={18} />
              </button>
            </div>
            <TurnstileWidget onToken={setCaptchaToken} />
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
              onClick={() => setState("email")}
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
