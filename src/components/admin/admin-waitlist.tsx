"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Clock3,
  MailPlus,
  RefreshCw,
  Search,
  ShieldAlert,
  Undo2,
  X,
} from "lucide-react";

import styles from "./admin.module.css";

type WaitlistStatus =
  | "pending"
  | "approved"
  | "invited"
  | "rejected"
  | "converted";

type WaitlistEntry = {
  id: string;
  email: string;
  displayName: string | null;
  company: string | null;
  useCase: string | null;
  expectedVolume: string | null;
  status: WaitlistStatus;
  internalNote: string | null;
  invitedAt: string | null;
  createdAt: string;
};

type AccountResponse = {
  authenticated?: boolean;
  account?: {
    email?: string;
    accountStatus?: string;
    appRole?: string;
  };
};

const FILTERS: Array<{ value: "" | WaitlistStatus; label: string }> = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "invited", label: "Invited" },
  { value: "converted", label: "Converted" },
  { value: "rejected", label: "Rejected" },
];

async function errorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;
  return body?.error?.message ?? fallback;
}

export function AdminWaitlist() {
  const [state, setState] = useState<
    "checking" | "forbidden" | "ready" | "error"
  >("checking");
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [filter, setFilter] = useState<"" | WaitlistStatus>("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const selected = useMemo(
    () => entries.find((entry) => entry.id === selectedId) ?? null,
    [entries, selectedId],
  );

  const load = useCallback(async () => {
    setError("");
    const params = new URLSearchParams();
    if (filter) params.set("status", filter);
    if (search.trim()) params.set("search", search.trim());
    const response = await fetch(`/api/admin/waitlist?${params}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(await errorMessage(response, "The waitlist could not load."));
    }
    const body = (await response.json()) as { entries?: WaitlistEntry[] };
    setEntries(body.entries ?? []);
  }, [filter, search]);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        const body = (await response.json().catch(() => null)) as
          | AccountResponse
          | null;
        if (!active) return;
        if (
          !response.ok ||
          !body?.authenticated ||
          body.account?.accountStatus !== "approved" ||
          body.account?.appRole !== "admin"
        ) {
          setState("forbidden");
          return;
        }
        await load();
        if (active) setState("ready");
      } catch (caught) {
        if (active) {
          setError(
            caught instanceof Error ? caught.message : "Admin is unavailable.",
          );
          setState("error");
        }
      }
    }
    void initialize();
    return () => {
      active = false;
    };
  }, [load]);

  async function mutate(
    entry: WaitlistEntry,
    body:
      | {
          operation: "transition";
          action: "approve" | "reject" | "invite" | "revoke";
        }
      | { operation: "note"; note: string | null },
  ) {
    setBusy(entry.id);
    setError("");
    try {
      const response = await fetch(`/api/admin/waitlist/${entry.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(
          await errorMessage(response, "The waitlist entry could not update."),
        );
      }
      const payload = (await response.json()) as { entry: WaitlistEntry };
      setEntries((current) =>
        current.map((item) =>
          item.id === payload.entry.id ? payload.entry : item,
        ),
      );
      setNote(payload.entry.internalNote ?? "");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The update failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    void load().catch((caught) =>
      setError(caught instanceof Error ? caught.message : "Search failed."),
    );
  }

  if (state === "checking") {
    return <main className={styles.statePage}>Checking operator access…</main>;
  }
  if (state === "forbidden") {
    return (
      <main className={styles.statePage}>
        <ShieldAlert aria-hidden="true" />
        <h1>Admin access required</h1>
        <p>Sign in with an approved operator account to manage the beta.</p>
        <Link href="/studio">Go to sign in</Link>
      </main>
    );
  }
  if (state === "error") {
    return (
      <main className={styles.statePage}>
        <h1>Operations are unavailable</h1>
        <p>{error}</p>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <Link href="/">
            <ArrowLeft aria-hidden="true" size={16} />
            Product
          </Link>
          <p>Vixel UGC / Operations</p>
          <h1>Beta admissions</h1>
        </div>
        <button type="button" onClick={() => void load()}>
          <RefreshCw aria-hidden="true" size={16} />
          Refresh
        </button>
      </header>

      <section className={styles.toolbar} aria-label="Waitlist filters">
        <div className={styles.filters}>
          {FILTERS.map((item) => (
            <button
              aria-pressed={filter === item.value}
              key={item.value || "all"}
              onClick={() => setFilter(item.value)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <form onSubmit={submitSearch}>
          <Search aria-hidden="true" size={16} />
          <input
            aria-label="Search waitlist"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Email, name, company"
            value={search}
          />
        </form>
      </section>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <section className={styles.content}>
        <div className={styles.list}>
          <div className={styles.listHeader}>
            <span>{entries.length} people</span>
            <span>Newest first</span>
          </div>
          {entries.map((entry) => (
            <button
              className={entry.id === selectedId ? styles.selected : ""}
              key={entry.id}
              onClick={() => {
                setSelectedId(entry.id);
                setNote(entry.internalNote ?? "");
              }}
              type="button"
            >
              <span>
                <strong>{entry.displayName || entry.email}</strong>
                <small>{entry.company || entry.email}</small>
              </span>
              <span className={styles[entry.status]}>{entry.status}</span>
            </button>
          ))}
          {!entries.length ? (
            <p className={styles.empty}>No entries match this view.</p>
          ) : null}
        </div>

        <aside className={styles.detail}>
          {selected ? (
            <>
              <div className={styles.detailHeader}>
                <span className={styles[selected.status]}>
                  {selected.status}
                </span>
                <time dateTime={selected.createdAt}>
                  Joined {new Date(selected.createdAt).toLocaleDateString()}
                </time>
              </div>
              <h2>{selected.displayName || "Unnamed creator"}</h2>
              <a href={`mailto:${selected.email}`}>{selected.email}</a>
              <dl>
                <div>
                  <dt>Company</dt>
                  <dd>{selected.company || "—"}</dd>
                </div>
                <div>
                  <dt>Expected volume</dt>
                  <dd>{selected.expectedVolume || "—"}</dd>
                </div>
                <div>
                  <dt>Use case</dt>
                  <dd>{selected.useCase || "—"}</dd>
                </div>
              </dl>

              <div className={styles.actions}>
                {["pending", "rejected"].includes(selected.status) ? (
                  <button
                    disabled={busy === selected.id}
                    onClick={() =>
                      void mutate(selected, {
                        operation: "transition",
                        action: "approve",
                      })
                    }
                    type="button"
                  >
                    <Check size={15} />
                    Approve
                  </button>
                ) : null}
                {selected.status === "approved" ? (
                  <button
                    disabled={busy === selected.id}
                    onClick={() =>
                      void mutate(selected, {
                        operation: "transition",
                        action: "invite",
                      })
                    }
                    type="button"
                  >
                    <MailPlus size={15} />
                    Send invite
                  </button>
                ) : null}
                {selected.status === "invited" ? (
                  <button
                    disabled={busy === selected.id}
                    onClick={() =>
                      void mutate(selected, {
                        operation: "transition",
                        action: "revoke",
                      })
                    }
                    type="button"
                  >
                    <Undo2 size={15} />
                    Revoke invite
                  </button>
                ) : null}
                {["pending", "approved", "invited"].includes(selected.status) ? (
                  <button
                    className={styles.danger}
                    disabled={busy === selected.id}
                    onClick={() =>
                      void mutate(selected, {
                        operation: "transition",
                        action: "reject",
                      })
                    }
                    type="button"
                  >
                    <X size={15} />
                    Reject
                  </button>
                ) : null}
              </div>

              <label className={styles.notes}>
                Internal note
                <textarea
                  maxLength={4_000}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Operator-only context"
                  value={note}
                />
                <button
                  disabled={busy === selected.id}
                  onClick={() =>
                    void mutate(selected, {
                      operation: "note",
                      note: note || null,
                    })
                  }
                  type="button"
                >
                  Save note
                </button>
              </label>
            </>
          ) : (
            <div className={styles.detailEmpty}>
              <Clock3 aria-hidden="true" />
              <p>Select a person to review their beta context.</p>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
