"use client";

import {
  createContext,
  FormEvent,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";

import { IconMark } from "@/components/studio/icon-mark";

import styles from "./studio.module.css";

type GateState = "checking" | "open" | "locked";

export type AccessGateSession = {
  canSignOut: boolean;
  signOutError: string;
  signingOut: boolean;
  signOut: () => Promise<void>;
};

const AccessGateSessionContext = createContext<AccessGateSession | null>(null);

export function useAccessGateSession(): AccessGateSession {
  const session = useContext(AccessGateSessionContext);
  if (!session) {
    throw new Error("useAccessGateSession must be used inside AccessGate.");
  }
  return session;
}

export function AccessGate({
  children,
}: {
  children: ReactNode;
}) {
  const [state, setState] = useState<GateState>("checking");
  const [accessRequired, setAccessRequired] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/access", { cache: "no-store" })
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) {
          setError(
            "Studio access could not be verified. Check your connection and try again.",
          );
          setState("locked");
          return;
        }
        const body = (await response.json().catch(() => null)) as
          | { authenticated?: boolean; required?: boolean }
          | null;
        if (!body) {
          setError(
            "Studio access could not be verified. Check your connection and try again.",
          );
          setState("locked");
          return;
        }
        setAccessRequired(body.required === true);
        setState(
          body.authenticated || body.required === false ? "open" : "locked",
        );
      })
      .catch(() => {
        if (active) {
          setError(
            "Studio access could not be verified. Check your connection and try again.",
          );
          setState("locked");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!code.trim()) {
      setError("Enter the studio access code.");
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
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(body?.error?.message ?? "That access code is not valid.");
      }
      const body = (await response.json().catch(() => null)) as
        | { required?: boolean }
        | null;
      setAccessRequired(body?.required !== false);
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
      const response = await fetch("/api/auth/access", { method: "DELETE" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(body?.error?.message ?? "The studio could not sign out.");
      }
      setCode("");
      setNotice(
        "Signed out. Your paid-job recovery identity stays on this browser so prior jobs can be recovered after you sign in again.",
      );
      setState("locked");
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

  return (
    <div className={styles.gatePage} data-studio-shell>
      <section className={styles.gateCard} aria-labelledby="gate-title">
        <div className={styles.gateHeader}>
          <IconMark className={styles.gateMark} />
          <span className={styles.gateLock}>
            <LockKeyhole size={16} />
            Private beta
          </span>
        </div>
        <p className={styles.gateEyebrow}>Vixel UGC Studio</p>
        <h1 id="gate-title">The campaign room is protected.</h1>
        <p>
          Enter the beta access code to inspect the creative router and run
          source-grounded generation.
        </p>
        <form onSubmit={submit} className={styles.gateForm}>
          <label htmlFor="access-code">Access code</label>
          <div className={styles.gateInputRow}>
            <input
              id="access-code"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Enter beta access code"
              type="password"
            />
            <button type="submit" disabled={submitting}>
              <span>{submitting ? "Checking" : "Enter"}</span>
              <ArrowRight size={18} />
            </button>
          </div>
          {error ? <p className={styles.formError}>{error}</p> : null}
          {notice ? (
            <p className={styles.formNotice} role="status">
              {notice}
            </p>
          ) : null}
        </form>
      </section>
    </div>
  );
}
