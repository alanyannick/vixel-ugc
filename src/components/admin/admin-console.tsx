"use client";

import type { CSSProperties, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Ban,
  ChevronRight,
  CircleAlert,
  Database,
  KeyRound,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";

import { AdminAdmissions } from "./admin-waitlist";
import styles from "./admin.module.css";

type AdminTab = "overview" | "admissions" | "users" | "growth";
type AttentionFilter =
  | "all"
  | "email_delivery"
  | "generation_reconciliation"
  | "billing_attention";
type AccountStatus = "pending" | "approved" | "suspended";
type AppRole = "user" | "admin";
type Readiness = "ready" | "not_ready" | "disabled" | "unavailable";
type AdminUserAction =
  | "suspend"
  | "restore"
  | "grant_admin"
  | "revoke_admin";

type AccountResponse = {
  authenticated?: boolean;
  account?: {
    userId?: string;
    email?: string;
    accountStatus?: AccountStatus;
    appRole?: AppRole;
  };
};

type AdminUser = {
  userId: string | null;
  email: string;
  displayName: string | null;
  company: string | null;
  waitlistStatus:
    | "pending"
    | "approved"
    | "invited"
    | "rejected"
    | "converted"
    | null;
  accountStatus: AccountStatus | null;
  appRole: AppRole | null;
  subscriptionStatus: string;
  campaignCount: number;
  successfulGenerationCount: number | null;
  generationAttentionCount: number | null;
  emailFailureCount: number;
  createdAt: string;
  approvedAt: string | null;
  isBootstrapAdmin: boolean;
};

type AdminOverview = {
  generatedAt: string;
  windowDays: 7 | 30 | 90;
  source: {
    status: "ready" | "partial" | "unavailable";
    parts: {
      product: "ready" | "unavailable";
      generationLedger: "ready" | "unavailable";
      audit: "ready" | "unavailable";
    };
  };
  caveats: string[];
  queues: Array<{
    id: string;
    label: string;
    count: number | null;
    status: "ready" | "unavailable";
    severity: "attention" | "warning";
  }>;
  readiness: {
    productDatabase: Readiness;
    accountAuth: Readiness;
    cloudCampaigns: Readiness;
    lifecycleEmail: Readiness;
    billing: Readiness;
    generationProvider: Readiness;
    generationLedger: Readiness;
  };
  metrics: {
    totalAccounts: number | null;
    approvedAccounts: number | null;
    activeSubscriptions: number | null;
    campaignCount: number | null;
    successfulGenerationCount: number | null;
  };
  funnel: Array<{
    id: string;
    label: string;
    value: number | null;
    conversionFromPreviousPercent: number | null;
    status: "ready" | "unavailable";
    source: "product" | "generation_ledger";
  }>;
  audit: {
    status: "ready" | "unavailable";
    entries: Array<{
      id: string;
      actorEmail: string | null;
      subjectEmail: string | null;
      action: string;
      reason: string | null;
      createdAt: string;
    }>;
  };
};

const TABS: Array<{ id: AdminTab; label: string }> = [
  { id: "overview", label: "Today" },
  { id: "admissions", label: "Admissions" },
  { id: "users", label: "Users & access" },
  { id: "growth", label: "Growth" },
];

const READINESS_LABELS: Array<
  [keyof AdminOverview["readiness"], string]
> = [
  ["productDatabase", "Product database"],
  ["accountAuth", "Account auth"],
  ["cloudCampaigns", "Cloud campaigns"],
  ["lifecycleEmail", "Lifecycle email"],
  ["billing", "Billing"],
  ["generationProvider", "Generation provider"],
  ["generationLedger", "Generation ledger"],
];

const ACTION_LABELS: Record<AdminUserAction, string> = {
  suspend: "Suspend account",
  restore: "Restore account",
  grant_admin: "Grant admin",
  revoke_admin: "Revoke admin",
};

async function errorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;
  return body?.error?.message ?? fallback;
}

function value(value: number | null | undefined) {
  return value === null || value === undefined
    ? "Unavailable"
    : value.toLocaleString();
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function prettyAction(action: string) {
  return action.replaceAll(".", " · ").replaceAll("_", " ");
}

function StatusSignal({ status }: { status: Readiness }) {
  const label = status.replace("_", " ");
  return (
    <span className={`${styles.signal} ${styles[`signal_${status}`]}`}>
      <span aria-hidden="true" />
      {label}
    </span>
  );
}

function OverviewPanel({
  overview,
  loading,
  error,
  onNavigate,
}: {
  overview: AdminOverview | null;
  loading: boolean;
  error: string;
  onNavigate: (tab: AdminTab, attention?: AttentionFilter) => void;
}) {
  if (loading && !overview) {
    return <section className={styles.panelState}>Loading today&apos;s operations…</section>;
  }
  if (!overview) {
    return (
      <section className={styles.panelState}>
        <CircleAlert aria-hidden="true" />
        <h2>Overview unavailable</h2>
        <p>{error || "The operations summary could not load."}</p>
      </section>
    );
  }

  const metrics = [
    ["Accounts", overview.metrics.totalAccounts],
    ["Approved", overview.metrics.approvedAccounts],
    ["Active plans", overview.metrics.activeSubscriptions],
    ["Campaigns", overview.metrics.campaignCount],
    ["Generations", overview.metrics.successfulGenerationCount],
  ] as const;

  return (
    <div className={styles.workspace}>
      {error ? <p className={styles.inlineError}>{error}</p> : null}
      <section aria-labelledby="metrics-title" className={styles.metricStrip}>
        <div className={styles.sectionLead}>
          <span>Current state</span>
          <h2 id="metrics-title">Product pulse</h2>
        </div>
        {metrics.map(([label, metric]) => (
          <div className={styles.metric} key={label}>
            <strong className={metric === null ? styles.unavailable : ""}>
              {value(metric)}
            </strong>
            <span>{label}</span>
          </div>
        ))}
      </section>

      <div className={styles.overviewGrid}>
        <section className={styles.queueSection} aria-labelledby="queue-title">
          <div className={styles.sectionHeading}>
            <div>
              <span>Action queue</span>
              <h2 id="queue-title">Needs attention</h2>
            </div>
            <span>{dateTime(overview.generatedAt)}</span>
          </div>
          <div className={styles.queueList}>
            {overview.queues.map((queue) => (
              <button
                disabled={queue.status === "unavailable" || queue.count === null}
                key={queue.id}
                onClick={() =>
                  queue.id === "waitlist_review"
                    ? onNavigate("admissions")
                    : onNavigate("users", queue.id as AttentionFilter)
                }
                type="button"
              >
                <span className={styles.queueIcon} aria-hidden="true">
                  {queue.severity === "attention" ? (
                    <UsersRound size={17} />
                  ) : (
                    <CircleAlert size={17} />
                  )}
                </span>
                <span>
                  <strong>{queue.label}</strong>
                  <small>
                    {queue.status === "unavailable"
                      ? "Source unavailable"
                      : queue.count === 0
                        ? "Queue clear"
                        : "Review records"}
                  </small>
                </span>
                <b className={queue.count === null ? styles.unavailable : ""}>
                  {value(queue.count)}
                </b>
                <ChevronRight aria-hidden="true" size={16} />
              </button>
            ))}
          </div>
        </section>

        <section className={styles.readinessSection} aria-labelledby="readiness-title">
          <div className={styles.sectionHeading}>
            <div>
              <span>Runtime</span>
              <h2 id="readiness-title">System readiness</h2>
            </div>
            <Database aria-hidden="true" size={18} />
          </div>
          <dl className={styles.readinessList}>
            {READINESS_LABELS.map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>
                  <StatusSignal status={overview.readiness[key]} />
                </dd>
              </div>
            ))}
          </dl>
          <p className={styles.sourceNote}>
            Source status: <strong>{overview.source.status}</strong>. Unavailable
            values are never inferred.
          </p>
        </section>
      </div>

      <section className={styles.auditSection} aria-labelledby="audit-title">
        <div className={styles.sectionHeading}>
          <div>
            <span>Trace</span>
            <h2 id="audit-title">Recent operator activity</h2>
          </div>
          <ShieldCheck aria-hidden="true" size={18} />
        </div>
        {overview.audit.status === "unavailable" ? (
          <p className={styles.sectionUnavailable}>Audit source unavailable.</p>
        ) : overview.audit.entries.length ? (
          <div className={styles.auditList}>
            {overview.audit.entries.slice(0, 8).map((entry) => (
              <article key={entry.id}>
                <time dateTime={entry.createdAt}>{dateTime(entry.createdAt)}</time>
                <div>
                  <strong>{prettyAction(entry.action)}</strong>
                  <span>
                    {entry.actorEmail || "System"} → {entry.subjectEmail || "record"}
                  </span>
                </div>
                <p>{entry.reason || "No operator reason recorded"}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.sectionUnavailable}>No operator activity recorded.</p>
        )}
      </section>
    </div>
  );
}

function UsersPanel({
  currentUserId,
  initialAttention,
  reloadNonce,
  onMutation,
}: {
  currentUserId: string | null;
  initialAttention: AttentionFilter;
  reloadNonce: number;
  onMutation: () => void;
}) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [searchNonce, setSearchNonce] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [attentionFilter, setAttentionFilter] =
    useState<AttentionFilter>(initialAttention);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<AdminUserAction | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    async function loadUsers() {
      try {
        const params = new URLSearchParams({ limit: "200" });
        if (submittedSearch) params.set("search", submittedSearch);
        const response = await fetch(`/api/admin/users?${params}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(await errorMessage(response, "Users could not load."));
        }
        const body = (await response.json()) as { users?: AdminUser[] };
        if (active) setUsers(body.users ?? []);
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Users could not load.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadUsers();
    return () => { active = false; };
  }, [reloadNonce, searchNonce, submittedSearch]);

  const visibleUsers = useMemo(
    () =>
      users.filter((user) => {
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "waitlist_only"
            ? !user.userId
            : user.accountStatus === statusFilter);
        const matchesRole =
          roleFilter === "all" ||
          (roleFilter === "none" ? !user.appRole : user.appRole === roleFilter);
        const matchesAttention =
          attentionFilter === "all" ||
          (attentionFilter === "email_delivery" && user.emailFailureCount > 0) ||
          (attentionFilter === "generation_reconciliation" &&
            (user.generationAttentionCount ?? 0) > 0) ||
          (attentionFilter === "billing_attention" &&
            ["past_due", "unpaid", "incomplete"].includes(
              user.subscriptionStatus,
            ));
        return matchesStatus && matchesRole && matchesAttention;
      }),
    [attentionFilter, roleFilter, statusFilter, users],
  );

  const selected =
    users.find((user) => (user.userId ?? user.email) === selectedKey) ?? null;

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSubmittedSearch(search.replace(/\s+/g, " ").trim());
    setSearchNonce((value) => value + 1);
  }

  async function mutate(action: AdminUserAction) {
    if (!selected?.userId || reason.trim().length < 4) return;
    setBusy(action);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/admin/users/${selected.userId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      if (!response.ok) {
        throw new Error(await errorMessage(response, "Account could not update."));
      }
      const body = (await response.json()) as { user: AdminUser };
      setUsers((current) =>
        current.map((user) =>
          user.userId === body.user.userId ? body.user : user,
        ),
      );
      setReason("");
      setSuccess(`${ACTION_LABELS[action]} completed for ${body.user.email}.`);
      onMutation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Account could not update.");
    } finally {
      setBusy(null);
    }
  }

  const isSelf = Boolean(selected?.userId && selected.userId === currentUserId);
  const hasReason = reason.trim().length >= 4;
  const actionDisabled = !selected?.userId || isSelf || !hasReason || Boolean(busy);

  return (
    <div className={styles.workspace}>
      <section className={styles.userToolbar} aria-label="User filters">
        <form onSubmit={submitSearch}>
          <Search aria-hidden="true" size={16} />
          <input
            aria-label="Search users"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Email, name, or company"
            value={search}
          />
          <button type="submit">Search</button>
        </form>
        <label>
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="waitlist_only">Waitlist only</option>
            <option value="pending">Pending account</option>
            <option value="approved">Approved</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>
        <label>
          <span>Role</span>
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
            <option value="all">All roles</option>
            <option value="user">User</option>
            <option value="admin">Admin</option>
            <option value="none">No account role</option>
          </select>
        </label>
        <label>
          <span>Attention</span>
          <select
            value={attentionFilter}
            onChange={(event) =>
              setAttentionFilter(event.target.value as AttentionFilter)
            }
          >
            <option value="all">All identities</option>
            <option value="email_delivery">Email failures</option>
            <option value="generation_reconciliation">Generation issues</option>
            <option value="billing_attention">Billing attention</option>
          </select>
        </label>
      </section>

      {error ? <p className={styles.inlineError} role="alert">{error}</p> : null}
      {success ? <p className={styles.inlineSuccess} role="status">{success}</p> : null}

      <section className={styles.usersWorkspace}>
        <div className={styles.userList}>
          <div className={styles.tableHeader}>
            <span>{loading ? "Loading…" : `${visibleUsers.length} identities`}</span>
            <span>Access</span>
            <span>Product</span>
          </div>
          {visibleUsers.map((user) => {
            const key = user.userId ?? user.email;
            return (
              <button
                aria-pressed={selectedKey === key}
                key={key}
                onClick={() => {
                  setSelectedKey(key);
                  setReason("");
                  setError("");
                  setSuccess("");
                }}
                type="button"
              >
                <span className={styles.userIdentity}>
                  <strong>{user.displayName || user.email}</strong>
                  <small>{user.company || user.email}</small>
                </span>
                <span className={styles.userAccess}>
                  <i className={styles[user.accountStatus ?? "waitlistOnly"]}>
                    {user.accountStatus ?? "waitlist only"}
                  </i>
                  {user.appRole === "admin" ? <i className={styles.adminRole}>admin</i> : null}
                </span>
                <span className={styles.userProduct}>
                  <b>{user.campaignCount}</b> campaigns
                  <b>{value(user.successfulGenerationCount)}</b> generations
                </span>
                <ChevronRight aria-hidden="true" size={16} />
              </button>
            );
          })}
          {!loading && !visibleUsers.length ? (
            <p className={styles.empty}>No identities match these filters.</p>
          ) : null}
        </div>

        <aside className={styles.userInspector}>
          {selected ? (
            <>
              <div className={styles.inspectorHeader}>
                <span>Account access</span>
                {selected.isBootstrapAdmin ? <span>Bootstrap protected</span> : null}
              </div>
              <h2>{selected.displayName || selected.email}</h2>
              <a href={`mailto:${selected.email}`}>{selected.email}</a>

              <dl className={styles.accountFacts}>
                <div><dt>Account</dt><dd>{selected.accountStatus ?? "Not created"}</dd></div>
                <div><dt>Role</dt><dd>{selected.appRole ?? "None"}</dd></div>
                <div><dt>Waitlist</dt><dd>{selected.waitlistStatus ?? "None"}</dd></div>
                <div><dt>Subscription</dt><dd>{selected.subscriptionStatus}</dd></div>
                <div><dt>Email failures</dt><dd>{selected.emailFailureCount}</dd></div>
                <div><dt>Generation issues</dt><dd>{value(selected.generationAttentionCount)}</dd></div>
              </dl>

              {!selected.userId ? (
                <>
                  <div className={styles.operationNotice}>
                    <KeyRound aria-hidden="true" size={17} />
                    <div>
                      <strong>Account not created</strong>
                      <p>Approve this identity in Admissions. Account actions unlock after the user completes email sign-in.</p>
                    </div>
                  </div>
                  <div className={styles.accountActions} aria-label="Unavailable account actions">
                    <button disabled type="button">Suspend</button>
                    <button disabled type="button">Restore</button>
                    <button disabled type="button">Grant admin</button>
                    <button disabled type="button">Revoke admin</button>
                  </div>
                </>
              ) : isSelf ? (
                <div className={styles.operationNotice}>
                  <ShieldAlert aria-hidden="true" size={17} />
                  <div>
                    <strong>Your operator account</strong>
                    <p>Self-service role and status changes are blocked.</p>
                  </div>
                </div>
              ) : (
                <>
                  <label className={styles.reasonField}>
                    Audit reason
                    <textarea
                      maxLength={240}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="Required: why is this access change needed?"
                      value={reason}
                    />
                    <span>{reason.trim().length}/240 · minimum 4 characters</span>
                  </label>
                  <div className={styles.accountActions}>
                    {selected.accountStatus === "approved" ? (
                      <button disabled={actionDisabled || selected.isBootstrapAdmin} onClick={() => void mutate("suspend")} type="button">
                        <Ban aria-hidden="true" size={15} /> Suspend
                      </button>
                    ) : null}
                    {selected.accountStatus === "suspended" ? (
                      <button disabled={actionDisabled} onClick={() => void mutate("restore")} type="button">
                        <RotateCcw aria-hidden="true" size={15} /> Restore
                      </button>
                    ) : null}
                    {selected.appRole === "user" && selected.accountStatus === "approved" ? (
                      <button disabled={actionDisabled} onClick={() => void mutate("grant_admin")} type="button">
                        <UserRoundCheck aria-hidden="true" size={15} /> Grant admin
                      </button>
                    ) : null}
                    {selected.appRole === "admin" ? (
                      <button className={styles.danger} disabled={actionDisabled || selected.isBootstrapAdmin} onClick={() => void mutate("revoke_admin")} type="button">
                        <ShieldAlert aria-hidden="true" size={15} /> Revoke admin
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className={styles.detailEmpty}>
              <UsersRound aria-hidden="true" />
              <p>Select an identity to inspect access and product state.</p>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}

function GrowthPanel({
  overview,
  loading,
  error,
  windowDays,
  onWindowChange,
}: {
  overview: AdminOverview | null;
  loading: boolean;
  error: string;
  windowDays: 7 | 30 | 90;
  onWindowChange: (window: 7 | 30 | 90) => void;
}) {
  const baseline = overview?.funnel.find((stage) => stage.value !== null)?.value ?? 0;
  return (
    <div className={styles.workspace}>
      <section className={styles.growthHeader}>
        <div>
          <span>Current-state cohort</span>
          <h2>Activation funnel</h2>
          <p>External waitlist identities created inside the selected window.</p>
        </div>
        <div className={styles.windowPicker} aria-label="Growth window">
          {([7, 30, 90] as const).map((days) => (
            <button aria-pressed={windowDays === days} key={days} onClick={() => onWindowChange(days)} type="button">
              {days}d
            </button>
          ))}
        </div>
      </section>

      {error ? <p className={styles.inlineError}>{error}</p> : null}
      {loading && !overview ? (
        <section className={styles.panelState}>Loading cohort…</section>
      ) : overview ? (
        <>
          <section className={styles.funnel} aria-label={`${overview.windowDays} day activation funnel`}>
            {overview.funnel.map((stage, index) => {
              const width = stage.value === null || baseline <= 0 ? 0 : Math.max(3, (stage.value / baseline) * 100);
              return (
                <article key={stage.id}>
                  <span className={styles.stageIndex}>{String(index + 1).padStart(2, "0")}</span>
                  <div className={styles.stageBody}>
                    <div>
                      <h3>{stage.label}</h3>
                      <span>{stage.source === "generation_ledger" ? "Generation ledger" : "Product database"}</span>
                    </div>
                    <div className={styles.funnelTrack}>
                      <span style={{ "--funnel-width": `${width}%` } as CSSProperties} />
                    </div>
                  </div>
                  <strong className={stage.value === null ? styles.unavailable : ""}>{value(stage.value)}</strong>
                  <span className={styles.conversion}>
                    {index === 0
                      ? "Cohort"
                      : stage.conversionFromPreviousPercent === null
                        ? "Unavailable"
                        : `${stage.conversionFromPreviousPercent}% from prior`}
                  </span>
                </article>
              );
            })}
          </section>
          <details className={styles.caveats}>
            <summary>Measurement notes</summary>
            <ul>{overview.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul>
          </details>
        </>
      ) : (
        <section className={styles.panelState}>Growth data unavailable.</section>
      )}
    </div>
  );
}

export function AdminConsole() {
  const [accessState, setAccessState] = useState<"checking" | "forbidden" | "ready" | "error">("checking");
  const [account, setAccount] = useState<
    NonNullable<AccountResponse["account"]> | null
  >(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [userAttention, setUserAttention] =
    useState<AttentionFilter>("all");
  const [windowDays, setWindowDays] = useState<7 | 30 | 90>(30);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    let active = true;
    async function checkAccess() {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as AccountResponse | null;
        if (!active) return;
        if (!response.ok || !body?.authenticated || body.account?.accountStatus !== "approved" || body.account?.appRole !== "admin") {
          setAccessState("forbidden");
          return;
        }
        setAccount(body.account);
        setAccessState("ready");
      } catch {
        if (active) setAccessState("error");
      }
    }
    void checkAccess();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (accessState !== "ready") return;
    let active = true;
    async function loadOverview() {
      setOverviewLoading(true);
      setOverviewError("");
      try {
        const response = await fetch(`/api/admin/overview?window=${windowDays}`, { cache: "no-store" });
        if (!response.ok) throw new Error(await errorMessage(response, "Overview could not load."));
        const body = (await response.json()) as { overview?: AdminOverview };
        if (!body.overview) throw new Error("Overview returned no data.");
        if (active) setOverview(body.overview);
      } catch (caught) {
        if (active) setOverviewError(caught instanceof Error ? caught.message : "Overview could not load.");
      } finally {
        if (active) setOverviewLoading(false);
      }
    }
    void loadOverview();
    return () => { active = false; };
  }, [accessState, refreshNonce, windowDays]);

  if (accessState === "checking") {
    return <div className={styles.statePage} data-studio-shell>Checking operator access…</div>;
  }
  if (accessState === "forbidden") {
    return (
      <div className={styles.statePage} data-studio-shell>
        <ShieldAlert aria-hidden="true" />
        <h1>Admin access required</h1>
        <p>Sign in with an approved operator account to manage Vixel UGC.</p>
        <Link href="/studio">Go to sign in</Link>
      </div>
    );
  }
  if (accessState === "error") {
    return (
      <div className={styles.statePage} data-studio-shell>
        <CircleAlert aria-hidden="true" />
        <h1>Operations are unavailable</h1>
        <p>Operator access could not be verified. Please try again.</p>
      </div>
    );
  }

  return (
    <div className={styles.console} data-studio-shell>
      <header className={styles.consoleHeader}>
        <div className={styles.headerBrand}>
          <Link href="/">
            <ArrowLeft aria-hidden="true" size={15} /> Product
          </Link>
          <span>VX</span>
          <div>
            <strong>Vixel UGC</strong>
            <small>Operations console</small>
          </div>
        </div>
        <nav aria-label="Admin sections" className={styles.adminNav}>
          {TABS.map((tab) => (
            <button
              aria-current={activeTab === tab.id ? "page" : undefined}
              key={tab.id}
              onClick={() => {
                if (tab.id === "users") setUserAttention("all");
                setActiveTab(tab.id);
              }}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className={styles.operatorMeta}>
          <span><Activity aria-hidden="true" size={13} /> Live operations</span>
          <small>{account?.email}</small>
          <button aria-label="Refresh current data" onClick={() => setRefreshNonce((value) => value + 1)} type="button">
            <RefreshCw aria-hidden="true" size={16} />
          </button>
        </div>
      </header>

      <div className={styles.pageHeading}>
        <div>
          <span>{activeTab === "overview" ? "Today" : TABS.find((tab) => tab.id === activeTab)?.label}</span>
          <h1>
            {activeTab === "overview" && "Run the beta."}
            {activeTab === "admissions" && "Review access."}
            {activeTab === "users" && "Control permissions."}
            {activeTab === "growth" && "Find the drop-off."}
          </h1>
        </div>
        {activeTab === "overview" ? (
          <button className={styles.headingAction} onClick={() => setActiveTab("admissions")} type="button">
            Review admissions <ArrowRight aria-hidden="true" size={16} />
          </button>
        ) : null}
      </div>

      {activeTab === "overview" ? (
        <OverviewPanel
          error={overviewError}
          loading={overviewLoading}
          onNavigate={(tab, attention = "all") => {
            if (tab === "users") setUserAttention(attention);
            setActiveTab(tab);
          }}
          overview={overview}
        />
      ) : null}
      {activeTab === "admissions" ? <AdminAdmissions reloadNonce={refreshNonce} /> : null}
      {activeTab === "users" ? (
        <UsersPanel
          currentUserId={account?.userId ?? null}
          initialAttention={userAttention}
          onMutation={() => setRefreshNonce((value) => value + 1)}
          reloadNonce={refreshNonce}
        />
      ) : null}
      {activeTab === "growth" ? (
        <GrowthPanel error={overviewError} loading={overviewLoading} onWindowChange={setWindowDays} overview={overview} windowDays={windowDays} />
      ) : null}
    </div>
  );
}
