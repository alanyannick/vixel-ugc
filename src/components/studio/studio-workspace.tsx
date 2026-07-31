"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  FileText,
  GalleryVerticalEnd,
  ImagePlus,
  LayoutGrid,
  LogOut,
  Menu,
  MessageSquareText,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  ReceiptText,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAccessGateSession } from "@/components/studio/access-gate";
import { BillingPanel } from "@/components/billing/billing-panel";
import { IconMark } from "@/components/studio/icon-mark";
import {
  approveMediaInput,
  createCreativeBrief,
  createImageCandidate,
  listCloudCampaigns,
  listRecoverableMediaJobs,
  pollVideoCandidate,
  readRecoverableMediaJob,
  saveCloudCampaign,
  StudioApiError,
  submitVideoCandidate,
} from "@/lib/client/api";
import {
  CampaignInput,
  CampaignState,
  Candidate,
  CreativeHook,
  CreatorPersona,
  demoCampaign,
  loadCampaign,
  newCampaign,
  nextReplacementRevision,
  parseCampaignExport,
  saveCampaign,
} from "@/lib/client/campaign-store";
import {
  advanceExecutionPlan,
  buildExecutionPlanForCampaign,
  ensureExecutionPlan,
} from "@/lib/client/execution-plan";
import {
  exactInputSignature,
  explainCreativeRoute,
} from "@/lib/domain";

import styles from "./studio.module.css";

type View = "board" | "sources" | "routes" | "candidates" | "receipts";
type SaveStatus = "saving" | "saved-local" | "saved-cloud" | "failed";
type StorageMode = "checking" | "local" | "cloud";
type PaidRuntimeReadiness = "checking" | "ready" | "not-ready";

export type StudioCapabilities = {
  paidGenerationReady: boolean;
  liveGenerationEnabled: boolean;
  accountAuthEnabled: boolean;
};

type PaidApproval =
  | ({
      prompt: string;
      inputSignature: string;
      idempotencyKey: string;
      serverApprovalToken?: string;
      providerModel?: string;
      adapterVersion?: string;
      expiresAt?: string;
    } & (
      | {
          kind: "image";
          aspectRatio: "9:16";
          references: Array<{ dataUrl: string }>;
        }
      | {
          kind: "video";
          ratio: "9:16";
          durationSec: number;
          resolution: "720p";
          generateAudio: boolean;
          anchorCandidateId: string;
          anchorDigest: string;
          imageDataUrl: string;
        }
    ))
  | null;

type ProductionBeat = {
  range: string;
  label: string;
  direction: string;
};

function mediaJobKey(
  kind: "image" | "video",
  campaign: CampaignState,
  inputSignature: string,
): string {
  const campaignFragment = campaignJobFragment(campaign);
  const intentDigest = exactInputSignature({
    kind,
    campaignId: campaign.id,
    campaignRevision: campaign.revision,
    inputSignature,
  }).slice(-20);
  return `${kind}:${campaignFragment}:${campaign.revision}:${intentDigest}`;
}

function campaignJobFragment(campaign: CampaignState): string {
  return campaign.id
    .replace(/[^A-Za-z0-9._:-]/g, "-")
    .slice(-24);
}

function nowReceipt(action: string, detail: string) {
  return {
    id: `receipt-${crypto.randomUUID()}`,
    action,
    at: new Date().toISOString(),
    detail,
  };
}

function derivePrompt(campaign: CampaignState) {
  const hook = campaign.brief?.hooks.find(
    (item) => item.id === campaign.selectedHookId,
  );
  const persona = campaign.brief?.personas.find(
    (item) => item.id === campaign.selectedPersonaId,
  );
  return [
    `Create a 9:16 creator-style AI UGC frame for ${campaign.input.productName}.`,
    persona ? `Creator: ${persona.description}. Voice and posture: ${persona.voice}.` : "",
    hook ? `Opening beat: ${hook.script}` : "",
    `Visible facts only: ${campaign.input.facts.filter(Boolean).join("; ")}.`,
    campaign.input.creatorDescription
      ? `Visual direction: ${campaign.input.creatorDescription}.`
      : "",
    "Natural phone-camera optics, believable hands and packaging, readable product label, no beauty-ad polish, no text overlay.",
  ]
    .filter(Boolean)
    .join(" ");
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function imageReferenceDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:image/")) return url;
  const response = await fetch(url, {
    credentials: "same-origin",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok) {
    throw new Error("The adopted anchor could not be loaded for video.");
  }
  const blob = await response.blob();
  if (!["image/png", "image/jpeg", "image/webp"].includes(blob.type)) {
    throw new Error("The adopted anchor is not a supported image.");
  }
  if (blob.size > 1_200_000) {
    throw new Error("Keep the adopted video anchor under 1.2 MB.");
  }
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The adopted anchor could not be read."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function downloadJson(payload: unknown, fileName: string) {
  const href = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(href);
}

function safeExportName(value: string, fallback: string) {
  const normalized = (value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function downloadCampaign(campaign: CampaignState) {
  downloadJson(
    {
      format: "vixel-koc-campaign",
      version: 1,
      exportedAt: new Date().toISOString(),
      campaign,
    },
    `${safeExportName(campaign.input.productName, "vixel-koc-campaign")}.json`,
  );
}

function downloadDeliveryReceipt(
  campaign: CampaignState,
  candidate: Candidate,
) {
  downloadJson(
    {
      format: "vixel-koc-delivery-receipt",
      version: 1,
      exportedAt: new Date().toISOString(),
      campaign: {
        id: campaign.id,
        revision: campaign.revision,
        name: campaign.name,
        productName: campaign.input.productName,
        platform: campaign.input.platform,
        durationSec: campaign.input.durationSec,
      },
      delivery: {
        candidateId: candidate.id,
        kind: candidate.kind,
        assetUrl: candidate.url,
        provider: candidate.provider,
        model: candidate.model ?? null,
        ledgerEntryId: candidate.ledgerEntryId ?? null,
        providerTaskId: candidate.providerTaskId ?? null,
        inputSignature: candidate.inputSignature ?? null,
        accepted: candidate.status === "adopted",
      },
    },
    `${safeExportName(campaign.input.productName, "vixel-koc")}-delivery.json`,
  );
}

function productionBeats(durationSec: number): ProductionBeat[] {
  const firstEnd = durationSec === 4 ? 1 : 2;
  const actionEnd = durationSec === 8 ? 6 : durationSec - 1;
  return [
    {
      range: `0–${firstEnd}s`,
      label: "Visible hook",
      direction: "Lead with the selected opening line and readable product.",
    },
    {
      range: `${firstEnd}–${actionEnd}s`,
      label: "Product action",
      direction: "Show one observable use moment in the same continuous take.",
    },
    {
      range: `${actionEnd}–${durationSec}s`,
      label: "Native close",
      direction: "Close on one supplied fact without inflating the promise.",
    },
  ];
}

function paidMediaInput(approval: NonNullable<PaidApproval>) {
  return approval.kind === "video"
    ? {
        prompt: approval.prompt,
        imageDataUrl: approval.imageDataUrl,
        durationSec: approval.durationSec,
        ratio: approval.ratio,
        resolution: approval.resolution,
        generateAudio: approval.generateAudio,
        idempotencyKey: approval.idempotencyKey,
      }
    : {
        prompt: approval.prompt,
        aspectRatio: approval.aspectRatio,
        references: approval.references,
        idempotencyKey: approval.idempotencyKey,
      };
}

export function StudioWorkspace({
  capabilities,
}: {
  capabilities: StudioCapabilities;
}) {
  const {
    canSignOut,
    sessionKind,
    signOut: onSignOut,
    signOutError,
    signingOut,
    storageScope,
  } = useAccessGateSession();
  const [campaign, setCampaign] = useState<CampaignState>(demoCampaign);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<View>("board");
  const [directorOpen, setDirectorOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [briefBusy, setBriefBusy] = useState(false);
  const [generationBusy, setGenerationBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pollingIssue, setPollingIssue] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saving");
  const [storageMode, setStorageMode] = useState<StorageMode>("checking");
  const [paidRuntimeReadiness, setPaidRuntimeReadiness] =
    useState<PaidRuntimeReadiness>("checking");
  const [approval, setApproval] = useState<PaidApproval>(null);
  const generationLockRef = useRef(false);
  const anchorLockRef = useRef(false);
  const recoveryAttemptedRef = useRef(false);
  const cloudSyncAvailableRef = useRef(false);
  const cloudRevisionsRef = useRef<Map<string, number>>(new Map());
  const cloudSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveSequenceRef = useRef(0);
  const workspaceScrollRef = useRef<HTMLDivElement>(null);
  const canUsePaidGeneration = Boolean(
    capabilities.paidGenerationReady &&
      paidRuntimeReadiness === "ready" &&
      (!capabilities.accountAuthEnabled || sessionKind === "account"),
  );
  const generationUnavailableMessage = !capabilities.liveGenerationEnabled
    ? "Planning mode is active. Campaign planning works, but live image and video generation is disabled on this deployment."
    : !capabilities.paidGenerationReady
      ? "Campaign planning is available, but paid generation is not ready yet."
      : capabilities.accountAuthEnabled && sessionKind !== "account"
        ? "Sign in with an approved account to use paid generation."
        : paidRuntimeReadiness === "checking"
          ? "Checking paid generation readiness. Campaign planning remains available."
          : "Paid generation is paused because a production dependency is not healthy.";

  const navigateTo = useCallback((nextView: View) => {
    setView(nextView);
    setMobileNavOpen(false);
    window.requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 760px)").matches) {
        window.scrollTo({ top: 0, behavior: "auto" });
        return;
      }
      workspaceScrollRef.current?.scrollTo({
        top: 0,
        behavior: "auto",
      });
    });
  }, []);

  const updateCampaign = useCallback(
    (
      updater: (current: CampaignState) => CampaignState,
      receipt?: { action: string; detail: string },
    ) => {
      setCampaign((current) => {
        const next = updater(current);
        if (next === current) return current;
        return {
          ...next,
          revision: current.revision + 1,
          updatedAt: new Date().toISOString(),
          receipts: receipt
            ? [
                nowReceipt(receipt.action, receipt.detail),
                ...next.receipts,
              ]
            : next.receipts,
        };
      });
    },
    [],
  );

  const replaceCampaign = useCallback(
    (
      replacement: CampaignState,
      receipt: { action: string; detail: string },
    ) => {
      const next = ensureExecutionPlan(replacement);
      setCampaign({
        ...next,
        revision: nextReplacementRevision(
          next.revision,
          cloudRevisionsRef.current.get(next.id) ?? null,
        ),
        updatedAt: new Date().toISOString(),
        receipts: [nowReceipt(receipt.action, receipt.detail), ...next.receipts],
      });
    },
    [],
  );

  useEffect(() => {
    let active = true;
    if (!capabilities.paidGenerationReady) {
      setPaidRuntimeReadiness("not-ready");
      return () => {
        active = false;
      };
    }

    setPaidRuntimeReadiness("checking");
    void fetch("/api/health", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | { checks?: { liveGeneration?: string } }
          | null;
        if (active) {
          setPaidRuntimeReadiness(
            body?.checks?.liveGeneration === "ready" ? "ready" : "not-ready",
          );
        }
      })
      .catch(() => {
        if (active) setPaidRuntimeReadiness("not-ready");
      });

    return () => {
      active = false;
    };
  }, [capabilities.paidGenerationReady]);

  useEffect(() => {
    let active = true;
    async function hydrateCampaign() {
      try {
        const cloudCampaigns = await listCloudCampaigns();
        if (!active) return;
        cloudSyncAvailableRef.current = true;
        cloudRevisionsRef.current = new Map(
          cloudCampaigns.map((item) => [item.id, item.revision]),
        );
        setStorageMode("cloud");
        if (cloudCampaigns[0]) {
          setCampaign(ensureExecutionPlan(cloudCampaigns[0]));
          return;
        }
        let stored: CampaignState | null = null;
        try {
          stored = await loadCampaign(storageScope);
        } catch {
          if (active) {
            setNotice(
              "Cloud sync is active, but browser recovery is unavailable on this device.",
            );
          }
        }
        if (active) {
          setCampaign(ensureExecutionPlan(stored ?? newCampaign()));
        }
      } catch {
        // Recovery/operator sessions and not-yet-configured deployments keep
        // an account-scoped browser recovery path. Only the operator scope may
        // migrate the old shared key; account sessions never inherit it.
        cloudSyncAvailableRef.current = false;
        if (active) setStorageMode("local");
        let stored: CampaignState | null = null;
        try {
          stored = await loadCampaign(storageScope, {
            allowLegacyMigration: sessionKind === "recovery",
          });
        } catch {
          if (active) {
            setError(
              "Browser recovery is unavailable. Export your campaign before leaving this page.",
            );
          }
        }
        if (active) {
          setCampaign(
            ensureExecutionPlan(
              stored ?? (sessionKind === "recovery" ? demoCampaign : newCampaign()),
            ),
          );
        }
      } finally {
        if (active) setHydrated(true);
      }
    }
    void hydrateCampaign();
    return () => {
      active = false;
    };
  }, [sessionKind, storageScope]);

  useEffect(() => {
    if (!hydrated) return;
    const sequence = ++saveSequenceRef.current;
    const snapshot = campaign;
    setSaveStatus("saving");

    async function persistCampaign() {
      let localSaved = false;
      try {
        await saveCampaign(snapshot, storageScope);
        localSaved = true;
      } catch {
        if (
          !cloudSyncAvailableRef.current &&
          saveSequenceRef.current === sequence
        ) {
          setSaveStatus("failed");
          setError(
            "This browser could not save the campaign. Export a copy before leaving this page.",
          );
        }
      }

      if (!cloudSyncAvailableRef.current) {
        if (localSaved && saveSequenceRef.current === sequence) {
          setSaveStatus("saved-local");
        }
        return;
      }

      const queuedSave = cloudSaveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const expectedRevision =
            cloudRevisionsRef.current.get(snapshot.id) ?? null;
          if (expectedRevision === snapshot.revision) return;
          if (
            expectedRevision !== null &&
            snapshot.revision !== expectedRevision + 1
          ) {
            throw new StudioApiError(
              "The cloud campaign has a newer revision. Your browser copy remains available for recovery.",
              "revision_conflict",
              false,
            );
          }
          const saved = await saveCloudCampaign(snapshot, expectedRevision);
          cloudRevisionsRef.current.set(snapshot.id, saved.revision);
        });
      cloudSaveQueueRef.current = queuedSave.catch(() => undefined);

      try {
        await queuedSave;
        if (saveSequenceRef.current === sequence) {
          setSaveStatus("saved-cloud");
        }
      } catch (caught) {
        cloudSyncAvailableRef.current = false;
        setStorageMode("local");
        if (saveSequenceRef.current === sequence) {
          setSaveStatus(localSaved ? "saved-local" : "failed");
          if (!localSaved) {
            setError(
              "Cloud sync and browser recovery both failed. Export a copy before leaving this page.",
            );
          }
        }
        setNotice(
          caught instanceof StudioApiError &&
            caught.code === "revision_conflict"
            ? caught.message
            : "Cloud sync paused. This campaign is still safe in this browser and can be exported.",
        );
      }
    }

    void persistCampaign();
  }, [campaign, hydrated, storageScope]);

  useEffect(() => {
    if (!hydrated || recoveryAttemptedRef.current) return;
    recoveryAttemptedRef.current = true;
    let active = true;

    async function recoverServerLedger() {
      try {
        const fragment = campaignJobFragment(campaign);
        const ledgerJobs = (await listRecoverableMediaJobs()).filter((job) =>
          job.idempotencyKey.startsWith(`${job.kind}:${fragment}:`),
        );
        const recoveredResults = new Map<
          string,
          Awaited<ReturnType<typeof readRecoverableMediaJob>>["result"]
        >();
        for (const job of ledgerJobs
          .filter((entry) => entry.status === "succeeded" && entry.hasResult)
          .slice(0, 10)) {
          const detail = await readRecoverableMediaJob(job.id);
          recoveredResults.set(job.id, detail.result);
        }
        if (!active || !ledgerJobs.length) return;

        updateCampaign((current) => {
          let recoveredCount = 0;
          let nextPlan = current.executionPlan;
          const candidates = [...current.candidates];
          const jobs = [...current.jobs];

          for (const ledgerJob of ledgerJobs) {
            const result = recoveredResults.get(ledgerJob.id);
            const candidateId = `candidate-ledger-${ledgerJob.id}`;
            if (
              ledgerJob.status === "succeeded" &&
              result?.url &&
              !candidates.some(
                (candidate) =>
                  candidate.ledgerEntryId === ledgerJob.id ||
                  candidate.id === candidateId,
              )
            ) {
              candidates.unshift({
                id: candidateId,
                kind: ledgerJob.kind,
                url: result.url,
                label: `${current.input.productName} recovered ${ledgerJob.kind}`,
                prompt: "Recovered from the server media ledger.",
                createdAt: ledgerJob.updatedAt,
                provider: ledgerJob.provider,
                status: "candidate",
                ledgerEntryId: ledgerJob.id,
                providerTaskId: ledgerJob.taskId ?? undefined,
                inputSignature: ledgerJob.inputSignature,
                model: ledgerJob.model,
              });
              recoveredCount += 1;
              nextPlan = advanceExecutionPlan(
                nextPlan,
                ledgerJob.kind === "image"
                  ? "image_candidate"
                  : "video_succeeded",
              );
            }

            if (
              ledgerJob.kind === "video" &&
              ledgerJob.taskId &&
              !jobs.some((job) => job.id === ledgerJob.taskId)
            ) {
              jobs.unshift({
                id: ledgerJob.taskId,
                kind: "video",
                status:
                  ledgerJob.status === "submitted"
                    ? "queued"
                    : ledgerJob.status === "submit_unknown" ||
                        ledgerJob.status === "reconciliation_required"
                      ? "reconciliation_required"
                      : ledgerJob.status === "submitting"
                        ? "queued"
                        : ledgerJob.status,
                prompt: "Recovered server-ledgered video input.",
                createdAt: ledgerJob.createdAt,
                updatedAt: ledgerJob.updatedAt,
                provider: ledgerJob.provider,
                progress: null,
                url: result?.url ?? null,
                error: ledgerJob.error?.message ?? null,
                ledgerEntryId: ledgerJob.id,
                idempotencyKey: ledgerJob.idempotencyKey,
                inputSignature: ledgerJob.inputSignature,
                model: ledgerJob.model,
              });
            }
          }

          if (
            candidates.length === current.candidates.length &&
            jobs.length === current.jobs.length
          ) {
            return current;
          }
          return {
            ...current,
            candidates,
            jobs,
            executionPlan: nextPlan,
            receipts: [
              nowReceipt(
                "Server ledger reconciled",
                `${recoveredCount} provider result${recoveredCount === 1 ? "" : "s"} recovered after reload.`,
              ),
              ...current.receipts,
            ],
          };
        });
      } catch {
        // Recovery is capability-based. A planning-only deployment has no
        // server ledger, and the browser-local campaign remains fully usable.
      }
    }

    void recoverServerLedger();
    return () => {
      active = false;
    };
  }, [campaign, hydrated, updateCampaign]);

  const activeJobKey = useMemo(
    () =>
      campaign.jobs
        .filter(
          (job) => job.status === "queued" || job.status === "processing",
        )
        .map((job) => `${job.id}@${Date.parse(job.createdAt)}`)
        .sort()
        .join("|"),
    [campaign.jobs],
  );

  useEffect(() => {
    if (!activeJobKey) return;
    const trackedJobs = activeJobKey.split("|").map((entry) => {
      const separator = entry.lastIndexOf("@");
      return {
        id: entry.slice(0, separator),
        createdAtMs: Number(entry.slice(separator + 1)),
      };
    });
    const abortController = new AbortController();
    let stopped = false;
    let timer: number | undefined;
    let failureStreak = 0;

    async function syncJobs() {
      if (stopped) return;
      if (document.visibilityState === "hidden") {
        timer = window.setTimeout(() => void syncJobs(), 8_000);
        return;
      }

      const pollableJobs = trackedJobs.filter(
        (job) =>
          Number.isFinite(job.createdAtMs) &&
          Date.now() - job.createdAtMs < 24 * 60 * 60 * 1_000,
      );
      if (!pollableJobs.length) {
        updateCampaign((current) => {
          const trackedIds = new Set(trackedJobs.map((job) => job.id));
          const staleJobs = current.jobs.filter(
            (job) =>
              trackedIds.has(job.id) &&
              (job.status === "queued" || job.status === "processing"),
          );
          if (!staleJobs.length) return current;
          return {
            ...current,
            jobs: current.jobs.map((job) =>
              trackedIds.has(job.id) &&
              (job.status === "queued" || job.status === "processing")
                ? {
                    ...job,
                    status: "reconciliation_required" as const,
                    error:
                      "The 24-hour browser polling window closed. Reconcile this ledgered task before any new paid submission.",
                    updatedAt: new Date().toISOString(),
                  }
                : job,
            ),
            receipts: [
              nowReceipt(
                "Video reconciliation required",
                "A ledgered video task exceeded the browser polling window without a terminal result.",
              ),
              ...current.receipts,
            ],
          };
        });
        setPollingIssue(
          "A video task exceeded the polling window. Its ledger claim is preserved; review Receipts before any new paid submission.",
        );
        return;
      }
      let hadPollingFailure = false;

      for (const job of pollableJobs) {
        try {
          const polled = await pollVideoCandidate(
            job.id,
            abortController.signal,
          );
          if (stopped) return;
          updateCampaign((current) => {
            const currentJob = current.jobs.find((item) => item.id === job.id);
            if (
              !currentJob ||
              (currentJob.status !== "queued" &&
                currentJob.status !== "processing")
            ) {
              return current;
            }
            const terminal =
              polled.result.status === "succeeded" ||
              polled.result.status === "failed";
            const alreadyMaterialized = current.candidates.some(
              (candidate) => candidate.id === `candidate-video-${job.id}`,
            );
            const candidate =
              polled.result.status === "succeeded" &&
              polled.result.url &&
              !alreadyMaterialized
                ? {
                    id: `candidate-video-${job.id}`,
                    kind: "video" as const,
                    url: polled.result.url,
                    label: `${current.input.productName} production take`,
                    prompt: currentJob.prompt,
                    createdAt: new Date().toISOString(),
                    provider: polled.provider,
                    status: "candidate" as const,
                    ledgerEntryId: currentJob.ledgerEntryId,
                    providerTaskId: job.id,
                    inputSignature: currentJob.inputSignature,
                    model: currentJob.model,
                  }
                : null;
            const jobChanged =
              currentJob.status !== polled.result.status ||
              currentJob.progress !== polled.result.progress ||
              currentJob.url !== polled.result.url ||
              currentJob.error !== polled.result.error;
            if (!jobChanged && !candidate) return current;
            const updatedAt = new Date().toISOString();
            const terminalEvent =
              terminal && currentJob.status !== polled.result.status
                ? polled.result.status === "succeeded"
                  ? "video_succeeded"
                  : "video_failed"
                : null;
            return {
              ...current,
              jobs: current.jobs.map((item) =>
                item.id === job.id
                  ? {
                      ...item,
                      status: polled.result.status,
                      progress: polled.result.progress,
                      url: polled.result.url,
                      error: polled.result.error,
                      updatedAt,
                    }
                  : item,
              ),
              candidates: candidate
                ? [candidate, ...current.candidates]
                : current.candidates,
              executionPlan: terminalEvent
                ? advanceExecutionPlan(current.executionPlan, terminalEvent)
                : current.executionPlan,
              receipts:
                terminal && currentJob.status !== polled.result.status
                  ? [
                      nowReceipt(
                        polled.result.status === "succeeded"
                          ? "Video result claimed"
                          : "Video generation failed",
                        polled.result.status === "succeeded"
                          ? "The provider result was preserved as a reviewable candidate."
                          : polled.result.error ??
                              "The provider marked the job as failed.",
                      ),
                      ...current.receipts,
                    ]
                  : current.receipts,
            };
          });
        } catch (caught) {
          if (stopped) return;
          if (caught instanceof StudioApiError && !caught.retryable) {
            const terminalStatus =
              caught.code === "VIDEO_JOB_CANCELLED"
                ? ("cancelled" as const)
                : caught.code ===
                    "VIDEO_SUBMISSION_RECONCILIATION_REQUIRED"
                  ? ("reconciliation_required" as const)
                  : ("failed" as const);
            updateCampaign((current) => {
              const currentJob = current.jobs.find(
                (item) => item.id === job.id,
              );
              if (
                !currentJob ||
                (currentJob.status !== "queued" &&
                  currentJob.status !== "processing")
              ) {
                return current;
              }
              const updatedAt = new Date().toISOString();
              return {
                ...current,
                jobs: current.jobs.map((item) =>
                  item.id === job.id
                    ? {
                        ...item,
                        status: terminalStatus,
                        error: caught.message,
                        updatedAt,
                      }
                    : item,
                ),
                executionPlan:
                  terminalStatus === "reconciliation_required"
                    ? current.executionPlan
                    : advanceExecutionPlan(
                        current.executionPlan,
                        "video_failed",
                      ),
                receipts: [
                  nowReceipt(
                    terminalStatus === "reconciliation_required"
                      ? "Video reconciliation required"
                      : terminalStatus === "cancelled"
                        ? "Video generation cancelled"
                        : "Video generation failed",
                    caught.message,
                  ),
                  ...current.receipts,
                ],
              };
            });
            continue;
          }
          hadPollingFailure = true;
        }
      }

      failureStreak = hadPollingFailure
        ? Math.min(failureStreak + 1, 3)
        : 0;
      setPollingIssue(
        hadPollingFailure
          ? "Provider polling is temporarily delayed. The task is ledgered and will retry without another paid submission."
          : "",
      );
      const nextDelay = Math.min(8_000 * 2 ** failureStreak, 60_000);
      if (!stopped) {
        timer = window.setTimeout(() => void syncJobs(), nextDelay);
      }
    }

    void syncJobs();
    return () => {
      stopped = true;
      abortController.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [activeJobKey, updateCampaign]);

  const selectedHook = useMemo(
    () =>
      campaign.brief?.hooks.find(
        (hook) => hook.id === campaign.selectedHookId,
      ) ?? null,
    [campaign.brief, campaign.selectedHookId],
  );
  const selectedPersona = useMemo(
    () =>
      campaign.brief?.personas.find(
        (persona) => persona.id === campaign.selectedPersonaId,
      ) ?? null,
    [campaign.brief, campaign.selectedPersonaId],
  );
  const routerDecision = useMemo(
    () =>
      explainCreativeRoute({
        intent: campaign.brief ? "campaign" : "explore_hooks",
        deliverableCount: campaign.brief ? 2 : 1,
        stageCount: campaign.brief ? 4 : 1,
        groundedFactCount: campaign.input.facts.filter(Boolean).length,
        unresolvedDecisionCount:
          Number(!campaign.selectedHookId) + Number(!campaign.selectedPersonaId),
        hasApprovedBrief: Boolean(
          campaign.brief &&
            campaign.selectedHookId &&
            campaign.selectedPersonaId,
        ),
        requiresPaidMedia: Boolean(campaign.brief),
      }),
    [campaign],
  );

  const beginNewCampaign = () => {
    const fresh = newCampaign();
    setCampaign({
      ...fresh,
      receipts: [
        nowReceipt(
          "Campaign created",
          "A new source-grounded campaign workspace was opened.",
        ),
      ],
    });
    navigateTo("sources");
    setError("");
    setNotice("New campaign opened. Start with product truth.");
  };

  const restoreDemo = () => {
    replaceCampaign(demoCampaign, {
      action: "Demo restored",
      detail: "The built-in source-grounded demo campaign was restored.",
    });
    navigateTo("board");
    setError("");
    setNotice("Demo campaign restored.");
  };

  const selectHook = (hook: CreativeHook) => {
    updateCampaign(
      (current) => {
        const next = { ...current, selectedHookId: hook.id };
        return {
          ...next,
          executionPlan: buildExecutionPlanForCampaign(next),
        };
      },
      { action: "Hook selected", detail: hook.label },
    );
    setNotice(`${hook.label} is now the production route.`);
  };

  const selectPersona = (persona: CreatorPersona) => {
    updateCampaign(
      (current) => {
        const next = { ...current, selectedPersonaId: persona.id };
        return {
          ...next,
          executionPlan: buildExecutionPlanForCampaign(next),
        };
      },
      { action: "Persona selected", detail: persona.label },
    );
    setNotice(`${persona.label} is now the creator anchor.`);
  };

  const adoptCandidate = (candidate: Candidate) => {
    updateCampaign(
      (current) => {
        const next = {
          ...current,
          candidates: current.candidates.map((item) => ({
            ...item,
            status:
              item.id === candidate.id
                ? ("adopted" as const)
                : item.kind === candidate.kind && item.status === "adopted"
                  ? ("candidate" as const)
                  : item.status,
          })),
        };
        return {
          ...next,
          executionPlan: advanceExecutionPlan(
            next.executionPlan,
            candidate.kind === "image" ? "image_adopted" : "video_adopted",
          ),
        };
      },
      { action: "Candidate adopted", detail: candidate.label },
    );
    setNotice(
      candidate.kind === "video"
        ? `${candidate.label} became the accepted final video.`
        : `${candidate.label} became the accepted visual source.`,
    );
  };

  const startGeneration = () => {
    if (!canUsePaidGeneration) {
      setNotice(generationUnavailableMessage);
      return;
    }
    if (!selectedHook || !selectedPersona) {
      setError("Choose one hook and one creator persona before generation.");
      navigateTo("routes");
      return;
    }
    setError("");
    const exactInput = {
      kind: "image",
      prompt: derivePrompt(campaign),
      aspectRatio: "9:16",
      references: [
        campaign.input.productImageDataUrl ?? null,
        campaign.input.creatorImageDataUrl ?? null,
      ],
    } as const;
    const inputSignature = exactInputSignature(exactInput);
    setApproval({
      kind: exactInput.kind,
      prompt: exactInput.prompt,
      aspectRatio: exactInput.aspectRatio,
      references: exactInput.references
        .filter((reference): reference is string => Boolean(reference))
        .map((dataUrl) => ({ dataUrl })),
      inputSignature,
      idempotencyKey: mediaJobKey("image", campaign, inputSignature),
    });
  };

  const startVideoGeneration = async () => {
    if (!canUsePaidGeneration) {
      setNotice(generationUnavailableMessage);
      return;
    }
    if (!selectedHook || !selectedPersona) {
      setError("Choose one hook and one creator persona before production.");
      navigateTo("routes");
      return;
    }
    const adoptedAnchor = campaign.candidates.find(
      (item) => item.status === "adopted" && item.kind === "image",
    );
    if (!adoptedAnchor) {
      setError("Adopt one image anchor before starting video production.");
      navigateTo("candidates");
      return;
    }
    if (anchorLockRef.current) return;
    anchorLockRef.current = true;
    const durationSec = campaign.input.durationSec;
    const prompt = [
      `Create one continuous ${durationSec}-second 9:16 creator-style AI UGC product video for ${campaign.input.productName}.`,
      `Opening dialogue: ${selectedHook.script}`,
      `Creator: ${selectedPersona.description}. Delivery: ${selectedPersona.voice}.`,
      `Product facts allowed: ${campaign.input.facts.filter(Boolean).join("; ")}.`,
      "Product enters frame before second two. Show one observable product action. Natural phone camera, native dialogue and room sound, no subtitles, no invented efficacy claim, no beauty-ad polish.",
      campaign.brief?.shotDirection ?? "",
    ]
      .filter(Boolean)
      .join(" ");
    setError("");
    setNotice("Preparing the adopted image anchor for exact-input review.");
    try {
      const imageDataUrl = await imageReferenceDataUrl(adoptedAnchor.url);
      const anchorDigest = await sha256Text(imageDataUrl);
      const exactInput = {
        kind: "video",
        prompt,
        ratio: "9:16",
        durationSec,
        resolution: "720p",
        generateAudio: true,
        anchorCandidateId: adoptedAnchor.id,
        anchorDigest,
      } as const;
      const inputSignature = exactInputSignature(exactInput);
      setApproval({
        ...exactInput,
        imageDataUrl,
        inputSignature,
        idempotencyKey: mediaJobKey("video", campaign, inputSignature),
      });
      setNotice("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The adopted anchor could not be prepared for video.",
      );
    } finally {
      anchorLockRef.current = false;
    }
  };

  const reviewGeneration = async () => {
    if (!canUsePaidGeneration) {
      setApproval(null);
      setNotice(generationUnavailableMessage);
      return;
    }
    if (
      !approval ||
      approval.serverApprovalToken ||
      generationLockRef.current
    ) {
      return;
    }
    generationLockRef.current = true;
    setGenerationBusy(true);
    setError("");
    try {
      const signed = await approveMediaInput(
        approval.kind,
        paidMediaInput(approval),
      );
      setApproval((current) =>
        current?.idempotencyKey === approval.idempotencyKey
          ? {
              ...current,
              serverApprovalToken: signed.approvalToken,
              providerModel: signed.providerModel,
              adapterVersion: signed.adapterVersion,
              inputSignature: signed.inputSignature,
              expiresAt: signed.expiresAt,
            }
          : current,
      );
      setNotice(
        "Exact input is locked without provider spend. Review the model and canonical parameters, then confirm the paid submission.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The server could not lock this exact paid input.",
      );
    } finally {
      generationLockRef.current = false;
      setGenerationBusy(false);
    }
  };

  const confirmGeneration = async () => {
    if (!canUsePaidGeneration) {
      setApproval(null);
      setNotice(generationUnavailableMessage);
      return;
    }
    if (!approval || generationLockRef.current) return;
    if (!approval.serverApprovalToken) {
      setError("Lock and review the exact provider input before paid submission.");
      return;
    }
    if (
      !approval.expiresAt ||
      Date.parse(approval.expiresAt) <= Date.now() + 5_000
    ) {
      setApproval((current) =>
        current?.idempotencyKey === approval.idempotencyKey
          ? {
              ...current,
              serverApprovalToken: undefined,
              providerModel: undefined,
              adapterVersion: undefined,
              expiresAt: undefined,
            }
          : current,
      );
      setError(
        "This exact-input approval expired. Lock the unchanged input again; no provider call was made.",
      );
      return;
    }
    generationLockRef.current = true;
    setGenerationBusy(true);
    setError("");
    try {
      if (approval.kind === "video") {
        const mediaInput = {
          prompt: approval.prompt,
          imageDataUrl: approval.imageDataUrl,
          durationSec: approval.durationSec,
          ratio: approval.ratio,
          resolution: approval.resolution,
          generateAudio: approval.generateAudio,
          idempotencyKey: approval.idempotencyKey,
        };
        const submitted = await submitVideoCandidate({
          ...mediaInput,
          approvalToken: approval.serverApprovalToken,
        });
        const submittedAt = new Date().toISOString();
        updateCampaign(
          (current) => {
            const immediateCandidate =
              submitted.result.status === "succeeded" && submitted.result.url
                ? {
                    id: `candidate-video-${submitted.result.taskId}`,
                    kind: "video" as const,
                    url: submitted.result.url,
                    label: `${current.input.productName} production take`,
                    prompt: approval.prompt,
                    createdAt: submittedAt,
                    provider: submitted.provider,
                    status: "candidate" as const,
                    ledgerEntryId: submitted.job.id,
                    providerTaskId: submitted.result.taskId,
                    inputSignature: submitted.job.inputSignature,
                    model: submitted.job.model,
                  }
                : null;
            return {
              ...current,
              jobs: [
                {
                  id: submitted.result.taskId,
                  kind: "video",
                  status: submitted.result.status,
                  prompt: approval.prompt,
                  createdAt: submittedAt,
                  updatedAt: submittedAt,
                  provider: submitted.provider,
                  progress: submitted.result.progress,
                  url: submitted.result.url,
                  error: submitted.result.error,
                  ledgerEntryId: submitted.job.id,
                  idempotencyKey: submitted.job.idempotencyKey,
                  inputSignature: submitted.job.inputSignature,
                  model: submitted.job.model,
                },
                ...current.jobs.filter(
                  (job) => job.id !== submitted.result.taskId,
                ),
              ],
              candidates: immediateCandidate
                ? [immediateCandidate, ...current.candidates]
                : current.candidates,
              executionPlan:
                submitted.result.status === "succeeded"
                  ? advanceExecutionPlan(
                      advanceExecutionPlan(
                        current.executionPlan,
                        "video_submitted",
                      ),
                      "video_succeeded",
                    )
                  : submitted.result.status === "failed"
                    ? advanceExecutionPlan(
                        advanceExecutionPlan(
                          current.executionPlan,
                          "video_submitted",
                        ),
                        "video_failed",
                      )
                    : advanceExecutionPlan(
                        current.executionPlan,
                        "video_submitted",
                      ),
            };
          },
          {
            action: "Video job submitted",
            detail: `Provider task ${submitted.result.taskId} is recoverable and will be polled asynchronously.`,
          },
        );
        setApproval(null);
        navigateTo("board");
        setNotice(
          "Video job submitted. You can leave this view; polling resumes from saved task state.",
        );
        return;
      }
      const mediaInput = {
        prompt: approval.prompt,
        aspectRatio: approval.aspectRatio,
        references: approval.references,
        idempotencyKey: approval.idempotencyKey,
      };
      const result = await createImageCandidate({
        ...mediaInput,
        approvalToken: approval.serverApprovalToken,
      });
      const candidate: Candidate = {
        id: `candidate-${crypto.randomUUID()}`,
        kind: "image",
        url: result.url,
        label: `${campaign.input.productName} creator anchor`,
        prompt: approval.prompt,
        createdAt: new Date().toISOString(),
        provider: result.provider,
        status: "candidate",
        ledgerEntryId: result.job.id,
        inputSignature: result.job.inputSignature,
        model: result.job.model,
      };
      updateCampaign(
        (current) => ({
          ...current,
          candidates: [candidate, ...current.candidates],
          executionPlan: advanceExecutionPlan(
            current.executionPlan,
            "image_candidate",
          ),
        }),
        {
          action: "Provider result claimed",
          detail: `${candidate.label} saved as a reviewable candidate.`,
        },
      );
      setApproval(null);
      navigateTo("candidates");
      setNotice("Generation completed. Review the new candidate before adoption.");
    } catch (caught) {
      if (
        caught instanceof StudioApiError &&
        caught.code === "invalid_media_approval"
      ) {
        setApproval((current) =>
          current?.idempotencyKey === approval.idempotencyKey
            ? {
                ...current,
                serverApprovalToken: undefined,
                providerModel: undefined,
                adapterVersion: undefined,
                expiresAt: undefined,
              }
            : current,
        );
        setNotice(
          "The approval expired before submission. Lock the unchanged input again; no provider call was made.",
        );
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "Generation failed before a candidate was created.",
      );
    } finally {
      generationLockRef.current = false;
      setGenerationBusy(false);
    }
  };

  const exportDelivery = () => {
    const acceptedVideo = campaign.candidates.find(
      (candidate) =>
        candidate.kind === "video" && candidate.status === "adopted",
    );
    if (!acceptedVideo) {
      setError("Adopt one completed video before exporting a delivery receipt.");
      navigateTo("candidates");
      return;
    }
    downloadDeliveryReceipt(campaign, acceptedVideo);
    updateCampaign(
      (current) => ({
        ...current,
        executionPlan: advanceExecutionPlan(
          current.executionPlan,
          "delivery_exported",
        ),
      }),
      {
        action: "Delivery receipt exported",
        detail: `${acceptedVideo.label} was exported with provider, model, ledger, task, and input lineage.`,
      },
    );
    setNotice(
      "Delivery receipt exported. Download or open the accepted provider asset while it is available.",
    );
  };

  return (
    <div className={styles.studioShell} data-studio-shell>
      <aside
        className={`${styles.sidebar} ${mobileNavOpen ? styles.sidebarOpen : ""}`}
        aria-label="Studio navigation"
      >
        <div className={styles.brandRow}>
          <Link href="/" aria-label="Vixel UGC home" className={styles.brand}>
            <IconMark className={styles.brandMark} />
            <span>VIXEL</span>
          </Link>
          <button
            className={styles.mobileClose}
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>

        <button
          className={styles.newCampaignButton}
          type="button"
          onClick={beginNewCampaign}
        >
          <Plus size={18} />
          New campaign
        </button>

        <nav className={styles.primaryNav}>
          <button
            type="button"
            className={view === "board" ? styles.navActive : ""}
            onClick={() => {
              navigateTo("board");
            }}
          >
            <LayoutGrid size={18} />
            Campaign board
          </button>
          <button
            type="button"
            className={view === "sources" ? styles.navActive : ""}
            onClick={() => {
              navigateTo("sources");
            }}
          >
            <FileText size={18} />
            Product sources
          </button>
          <button
            type="button"
            className={view === "routes" ? styles.navActive : ""}
            onClick={() => {
              navigateTo("routes");
            }}
          >
            <Sparkles size={18} />
            Creative routes
            {campaign.brief ? <span>{campaign.brief.hooks.length}</span> : null}
          </button>
          <button
            type="button"
            className={view === "candidates" ? styles.navActive : ""}
            onClick={() => {
              navigateTo("candidates");
            }}
          >
            <GalleryVerticalEnd size={18} />
            Candidates
            {campaign.candidates.length ? (
              <span>{campaign.candidates.length}</span>
            ) : null}
          </button>
          <button
            type="button"
            className={view === "receipts" ? styles.navActive : ""}
            onClick={() => {
              navigateTo("receipts");
            }}
          >
            <ReceiptText size={18} />
            Receipts
          </button>
        </nav>

        <div className={styles.sidebarCampaigns}>
          <div className={styles.navSectionLabel}>
            <span>Current</span>
          </div>
          <button
            className={styles.campaignMini}
            type="button"
            onClick={() => {
              navigateTo("board");
            }}
          >
            <span className={styles.campaignThumb}>
              <IconMark className={styles.campaignThumbMark} />
            </span>
            <span>
              <strong>{campaign.input.productName || "Untitled campaign"}</strong>
              <small>Revision {campaign.revision}</small>
            </span>
          </button>
        </div>

        <div className={styles.sidebarFooter}>
          <BillingPanel compact />
          <div className={styles.localStatus}>
            <ShieldCheck size={16} />
            <span>
              <strong>
                {storageMode === "cloud"
                  ? "Cloud sync on"
                  : storageMode === "checking"
                    ? "Checking storage"
                    : "Local recovery on"}
              </strong>
              <small>
                {storageMode === "cloud"
                  ? "Browser recovery is scoped to this account"
                  : storageMode === "checking"
                    ? "Confirming the safest campaign copy"
                    : "This browser only; export before switching devices"}
              </small>
            </span>
          </div>
          {!canUsePaidGeneration ? (
            <div className={styles.localStatus}>
              <Sparkles size={16} />
              <span>
                <strong>Planning mode</strong>
                <small>Creative routes work; paid media generation is closed</small>
              </span>
            </div>
          ) : null}
          {canSignOut ? (
            <div className={styles.sessionAccess}>
              <span>
                <strong>Private beta session</strong>
                <small>Sign out keeps paid-job recovery on this browser</small>
              </span>
              <button
                type="button"
                disabled={signingOut}
                onClick={() => void onSignOut()}
              >
                <LogOut size={15} />
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
              {signOutError ? (
                <small className={styles.sessionError} role="alert">
                  {signOutError}
                </small>
              ) : null}
            </div>
          ) : null}
          <Link href="/product-truth">
            Product truth guide
            <ArrowRight size={15} />
          </Link>
        </div>
      </aside>

      {mobileNavOpen ? (
        <button
          type="button"
          aria-label="Close navigation overlay"
          className={styles.mobileOverlay}
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <section
        className={`${styles.workspace} ${directorOpen ? "" : styles.workspaceWide}`}
      >
        <header className={styles.workspaceHeader}>
          <div className={styles.headerIdentity}>
            <button
              type="button"
              className={styles.mobileMenu}
              aria-label="Open navigation"
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div>
              <div className={styles.breadcrumb}>
                Campaigns <ChevronRight size={13} />{" "}
                <span>{campaign.input.productName || "New campaign"}</span>
              </div>
              <h1>{campaign.name}</h1>
            </div>
          </div>
          <div className={styles.headerActions}>
            <span className={styles.saveState}>
              {saveStatus === "saving" ? (
                <RefreshCcw className={styles.spin} size={15} />
              ) : saveStatus === "failed" ? (
                <CircleAlert size={15} />
              ) : (
                <CircleCheck size={15} />
              )}
              {saveStatus === "saving"
                ? "Saving…"
                : saveStatus === "saved-cloud"
                  ? "Saved to cloud"
                  : saveStatus === "saved-local"
                    ? "Saved in this browser"
                    : "Save failed"}
            </span>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => downloadCampaign(campaign)}
            >
              <ArrowDownToLine size={17} />
              Export
            </button>
            <label className={styles.importButton}>
              <span>Import</span>
              <input
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  if (file.size > 32 * 1024 * 1024) {
                    setError("The campaign export is larger than 32 MB.");
                    return;
                  }
                  file
                    .text()
                    .then((raw) => {
                      const imported = parseCampaignExport(raw);
                      replaceCampaign(imported, {
                        action: "Campaign imported",
                        detail:
                          "Campaign state restored from a validated Vixel export.",
                      });
                      navigateTo("board");
                      setNotice("Campaign restored from export.");
                    })
                    .catch((caught) =>
                      setError(
                        caught instanceof Error
                          ? caught.message
                          : "The campaign could not be imported.",
                      ),
                    );
                }}
              />
            </label>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={directorOpen ? "Close Director" : "Open Director"}
              title={directorOpen ? "Close Director" : "Open Director"}
              onClick={() => setDirectorOpen((current) => !current)}
            >
              {directorOpen ? (
                <PanelRightClose size={19} />
              ) : (
                <PanelRightOpen size={19} />
              )}
            </button>
          </div>
        </header>

        <PlanRail
          campaign={campaign}
          onNavigate={navigateTo}
        />

        {!canUsePaidGeneration ? (
          <div className={styles.planningNotice} role="status">
            <Sparkles size={17} />
            <span>
              <strong>Planning mode</strong>
              {generationUnavailableMessage}
            </span>
          </div>
        ) : null}

        {notice ? (
          <div className={styles.notice} role="status">
            <BadgeCheck size={17} />
            <span>{notice}</span>
            <button
              type="button"
              aria-label="Dismiss message"
              onClick={() => setNotice("")}
            >
              <X size={15} />
            </button>
          </div>
        ) : null}
        {error ? (
          <div className={styles.errorNotice} role="alert">
            <CircleAlert size={17} />
            <span>{error}</span>
            <button
              type="button"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              <X size={15} />
            </button>
          </div>
        ) : null}
        {pollingIssue ? (
          <div className={styles.pollingNotice} role="status">
            <Clock3 size={17} />
            <span>{pollingIssue}</span>
            <button
              type="button"
              aria-label="Dismiss polling status"
              onClick={() => setPollingIssue("")}
            >
              <X size={15} />
            </button>
          </div>
        ) : null}

        <div className={styles.workspaceScroll} ref={workspaceScrollRef}>
          {view === "board" ? (
            <CampaignBoard
              campaign={campaign}
              selectedHook={selectedHook}
              selectedPersona={selectedPersona}
              onView={navigateTo}
              onGenerate={startGeneration}
              onGenerateVideo={startVideoGeneration}
              onAdopt={adoptCandidate}
              onExportDelivery={exportDelivery}
              onRestoreDemo={restoreDemo}
              canGenerate={canUsePaidGeneration}
              generationUnavailableMessage={generationUnavailableMessage}
            />
          ) : null}
          {view === "sources" ? (
            <SourcesView
              key={campaign.id}
              campaign={campaign}
              busy={briefBusy}
              onSubmit={async (input) => {
                setBriefBusy(true);
                setError("");
                try {
                  const result = await createCreativeBrief(input);
                  updateCampaign(
                    (current) => {
                      const next = {
                        ...current,
                        name: `${input.productName} · UGC routes`,
                        input,
                        brief: result.brief,
                        selectedHookId: result.brief.recommendedHookId,
                        selectedPersonaId: result.brief.recommendedPersonaId,
                      };
                      return {
                        ...next,
                        executionPlan: buildExecutionPlanForCampaign(next),
                      };
                    },
                    {
                      action: "Creative brief created",
                      detail: `${result.brief.hooks.length} hooks and ${result.brief.personas.length} personas via ${result.provider}.`,
                    },
                  );
                  navigateTo("routes");
                  setNotice(
                    `${result.brief.hooks.length} routes ready. Choose one hook and one persona.`,
                  );
                } catch (caught) {
                  setError(
                    caught instanceof Error
                      ? caught.message
                      : "The Director could not create a brief.",
                  );
                } finally {
                  setBriefBusy(false);
                }
              }}
            />
          ) : null}
          {view === "routes" ? (
            <RoutesView
              campaign={campaign}
              selectedHook={selectedHook}
              selectedPersona={selectedPersona}
              onHook={selectHook}
              onPersona={selectPersona}
              onSources={() => navigateTo("sources")}
              onGenerate={startGeneration}
              canGenerate={canUsePaidGeneration}
            />
          ) : null}
          {view === "candidates" ? (
            <CandidatesView
              campaign={campaign}
              onAdopt={adoptCandidate}
              onGenerate={startGeneration}
              canGenerate={canUsePaidGeneration}
              generationUnavailableMessage={generationUnavailableMessage}
            />
          ) : null}
          {view === "receipts" ? <ReceiptsView campaign={campaign} /> : null}
        </div>
      </section>

      {directorOpen ? (
        <>
          <button
            type="button"
            className={styles.mobileDirectorOverlay}
            aria-label="Close Director overlay"
            onClick={() => setDirectorOpen(false)}
          />
          <DirectorPanel
            campaign={campaign}
            selectedHook={selectedHook}
            selectedPersona={selectedPersona}
            routerDecision={routerDecision}
            onView={navigateTo}
            onGenerate={startGeneration}
            onGenerateVideo={startVideoGeneration}
            onExportDelivery={exportDelivery}
            onClose={() => setDirectorOpen(false)}
            canGenerate={canUsePaidGeneration}
            generationUnavailableMessage={generationUnavailableMessage}
          />
        </>
      ) : null}

      {approval ? (
        <ApprovalDialog
          approval={approval}
          busy={generationBusy}
          onCancel={() => {
            if (!generationBusy) setApproval(null);
          }}
          onReview={reviewGeneration}
          onConfirm={confirmGeneration}
        />
      ) : null}
    </div>
  );
}

function PlanRail({
  campaign,
  onNavigate,
}: {
  campaign: CampaignState;
  onNavigate: (view: View) => void;
}) {
  const plan = campaign.executionPlan;
  const stages = plan
    ? [...plan.stages].sort(
        (left, right) => left.planner.order - right.planner.order,
      )
    : [];

  return (
    <div className={styles.planRail} aria-label="Campaign plan">
      <div className={styles.planTitle}>
        <span>Plan</span>
        <strong>
          {plan
            ? `${plan.runtime.status} · r${plan.revision}`
            : "Waiting for approved product truth"}
        </strong>
      </div>
      <div className={styles.planStages}>
        {(stages.length
          ? stages
          : [
              {
                id: "brief-pending",
                planner: { title: "Product brief", order: 0 },
                runtime: { status: "ready" as const },
              },
            ]
        ).map((stage, index) => {
          const itemState =
            stage.runtime.status === "succeeded"
              ? "done"
              : ["ready", "running", "failed"].includes(stage.runtime.status)
                ? "active"
                : "waiting";
          return (
            <button
              key={stage.id}
              type="button"
              data-plan-stage-id={stage.id}
              title={`${stage.planner.title} · ${stage.id}`}
              className={`${styles.planStage} ${styles[`plan_${itemState}`]}`}
              onClick={() =>
                onNavigate(
                  !plan
                    ? "sources"
                    : index === 0
                      ? "routes"
                      : index === 1
                        ? "candidates"
                        : "receipts",
                )
              }
            >
              <span className={styles.planDot}>
                {itemState === "done" ? <Check size={12} /> : index + 1}
              </span>
              <span>{stage.planner.title}</span>
              <small>
                {itemState === "done"
                  ? "Complete"
                  : itemState === "active"
                    ? stage.runtime.status
                    : "Waiting"}
              </small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CampaignBoard({
  campaign,
  selectedHook,
  selectedPersona,
  onView,
  onGenerate,
  onGenerateVideo,
  onAdopt,
  onExportDelivery,
  onRestoreDemo,
  canGenerate,
  generationUnavailableMessage,
}: {
  campaign: CampaignState;
  selectedHook: CreativeHook | null;
  selectedPersona: CreatorPersona | null;
  onView: (view: View) => void;
  onGenerate: () => void;
  onGenerateVideo: () => void;
  onAdopt: (candidate: Candidate) => void;
  onExportDelivery: () => void;
  onRestoreDemo: () => void;
  canGenerate: boolean;
  generationUnavailableMessage: string;
}) {
  if (!campaign.brief) {
    return (
      <section className={styles.emptyCampaign}>
        <div className={styles.emptyIndex}>01</div>
        <p className={styles.sectionEyebrow}>Campaign intake</p>
        <h2>Start with what the product can honestly prove.</h2>
        <p>
          Add visible facts, audience, platform, and intended action. The
          Director will turn those inputs into five distinct opening routes.
        </p>
        <div className={styles.emptyActions}>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => onView("sources")}
          >
            Add product sources
            <ArrowRight size={18} />
          </button>
          <button
            className={styles.textButton}
            type="button"
            onClick={onRestoreDemo}
          >
            Restore the demo campaign
          </button>
        </div>
      </section>
    );
  }

  const adoptedImage = campaign.candidates.find(
    (item) => item.status === "adopted" && item.kind === "image",
  );
  const adoptedVideo = campaign.candidates.find(
    (item) => item.status === "adopted" && item.kind === "video",
  );
  const deliveryExported = campaign.executionPlan?.stages
    .flatMap((stage) => stage.items)
    .some(
      (item) =>
        item.planner.kind === "export" &&
        item.runtime.status === "succeeded",
    );
  const beats = productionBeats(campaign.input.durationSec);
  return (
    <div className={styles.board}>
      <section className={styles.boardIntro}>
        <div>
          <p className={styles.sectionEyebrow}>Campaign board</p>
          <h2>
            One product truth.
            <br />
            One production route.
          </h2>
        </div>
        <div className={styles.boardSummary}>
          <p>{campaign.brief.summary}</p>
          <button
            type="button"
            className={styles.textButton}
            onClick={() => onView("sources")}
          >
            Inspect {campaign.brief.productTruth.length} sources
            <ArrowRight size={16} />
          </button>
        </div>
      </section>

      <section className={styles.routeSnapshot}>
        <div className={styles.snapshotHeader}>
          <div>
            <span className={styles.objectNumber}>01</span>
            <p className={styles.sectionEyebrow}>Approved direction</p>
            <h3>Route locked for production</h3>
          </div>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => onView("routes")}
          >
            Compare all routes
          </button>
        </div>
        <div className={styles.approvedRoute}>
          <div>
            <span>Hook</span>
            <strong>{selectedHook?.label ?? "Choose a hook"}</strong>
            <blockquote>
              “{selectedHook?.script ?? "No opening route selected yet."}”
            </blockquote>
          </div>
          <div>
            <span>Creator</span>
            <strong>{selectedPersona?.label ?? "Choose a persona"}</strong>
            <p>{selectedPersona?.description}</p>
          </div>
          <div>
            <span>Output</span>
            <strong>
              {campaign.input.durationSec}s · {campaign.input.platform}
            </strong>
            <p>{campaign.input.format}</p>
          </div>
        </div>
      </section>

      <section className={styles.assetProductionGrid}>
        <div className={styles.anchorSection}>
          <div className={styles.snapshotHeader}>
            <div>
              <span className={styles.objectNumber}>02</span>
              <p className={styles.sectionEyebrow}>Visual anchor</p>
              <h3>
                {adoptedImage
                  ? "Accepted source"
                  : "A candidate needs your review"}
              </h3>
            </div>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => onView("candidates")}
            >
              View candidates
              <ArrowRight size={16} />
            </button>
          </div>
          {adoptedImage ? (
            <CandidateCard
              candidate={adoptedImage}
              featured
              onAdopt={() => onAdopt(adoptedImage)}
            />
          ) : (
            <button
              className={styles.missingAnchor}
              type="button"
              onClick={onGenerate}
              disabled={!canGenerate}
              title={!canGenerate ? generationUnavailableMessage : undefined}
            >
              <ImagePlus size={24} />
              <span>
                <strong>
                  {canGenerate
                    ? "Create a creator + product anchor"
                    : "Anchor generation is not open yet"}
                </strong>
                <small>
                  {canGenerate
                    ? "Exact provider input will be shown before spend."
                    : "Finish the campaign plan now and export it for later production."}
                </small>
              </span>
              <ArrowRight size={18} />
            </button>
          )}
        </div>

        <div className={styles.productionSection}>
          <span className={styles.objectNumber}>03</span>
          <p className={styles.sectionEyebrow}>Production packet</p>
          <h3>{campaign.input.durationSec} seconds, directed—not guessed</h3>
          <ol className={styles.shotList}>
            {beats.map((beat, index) => (
              <li key={beat.range}>
                <time>{beat.range}</time>
                <span>
                  <strong>{beat.label}</strong>
                  {index === 0 ? selectedHook?.script : beat.direction}
                </span>
              </li>
            ))}
          </ol>
          <div className={styles.productionMeta}>
            <span>Dialogue + room sound</span>
            <span>Subtitles off</span>
            <span>9:16</span>
          </div>
          {adoptedVideo ? (
            <div className={styles.deliveryComplete}>
              <div>
                <CircleCheck size={20} />
                <span>
                  <strong>Final video accepted</strong>
                  <small>
                    {deliveryExported
                      ? "Delivery receipt exported"
                      : "Export the lineage receipt to complete delivery"}
                  </small>
                </span>
              </div>
              <div className={styles.deliveryActions}>
                <a
                  className={styles.secondaryButton}
                  href={adoptedVideo.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ArrowDownToLine size={16} />
                  Open / download video
                </a>
                <button
                  className={styles.primaryButton}
                  type="button"
                  onClick={onExportDelivery}
                >
                  <ReceiptText size={16} />
                  {deliveryExported
                    ? "Export receipt again"
                    : "Export delivery receipt"}
                </button>
              </div>
              <button
                className={styles.textButton}
                type="button"
                onClick={onGenerateVideo}
                disabled={!canGenerate}
                title={!canGenerate ? generationUnavailableMessage : undefined}
              >
                {canGenerate ? "Create another take" : "Production is not open"}
              </button>
              <p>
                The current asset is provider-hosted. Download it now; the
                receipt preserves its ledger and task lineage.
              </p>
            </div>
          ) : (
            <button
              className={styles.primaryButton}
              type="button"
              onClick={adoptedImage ? onGenerateVideo : onGenerate}
              disabled={!canGenerate}
              title={!canGenerate ? generationUnavailableMessage : undefined}
            >
              {!canGenerate
                ? "Production opens with paid beta"
                : adoptedImage
                  ? "Queue production video"
                  : "Generate next anchor"}
              <Sparkles size={17} />
            </button>
          )}
          {campaign.jobs.length ? (
            <div className={styles.jobStack}>
              {campaign.jobs.slice(0, 2).map((job) => (
                <div key={job.id} className={styles.jobRow}>
                  <span
                    className={
                      job.status === "failed" ||
                      job.status === "cancelled" ||
                      job.status === "reconciliation_required"
                        ? styles.jobFailed
                        : job.status === "succeeded"
                          ? styles.jobDone
                          : styles.jobLive
                    }
                  />
                  <span>
                    <strong>Video · {job.status}</strong>
                    <small>
                      {job.progress !== null
                        ? `${Math.round(job.progress)}% · `
                        : ""}
                      {job.error
                        ? `${job.error} · `
                        : ""}
                      {job.id.slice(0, 14)}
                    </small>
                  </span>
                  {job.status === "reconciliation_required" ? (
                    <button
                      type="button"
                      onClick={() => onView("receipts")}
                    >
                      Review recovery
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function SourcesView({
  campaign,
  busy,
  onSubmit,
}: {
  campaign: CampaignState;
  busy: boolean;
  onSubmit: (input: CampaignInput) => Promise<void>;
}) {
  const [input, setInput] = useState<CampaignInput>(campaign.input);
  const [inlineError, setInlineError] = useState("");

  const setField = <Key extends keyof CampaignInput>(
    key: Key,
    value: CampaignInput[Key],
  ) => setInput((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const facts = input.facts.map((fact) => fact.trim()).filter(Boolean);
    if (
      !input.productName.trim() ||
      !input.audience.trim() ||
      !input.goal.trim() ||
      facts.length < 1
    ) {
      setInlineError(
        "Add a product name, target audience, desired action, and at least one source-backed fact.",
      );
      return;
    }
    setInlineError("");
    const normalized = { ...input, facts };
    void onSubmit(normalized);
  };

  return (
    <div className={styles.detailView}>
      <section className={styles.detailIntro}>
        <span className={styles.objectNumber}>01</span>
        <p className={styles.sectionEyebrow}>Product sources</p>
        <h2>Give the Director facts it can defend.</h2>
        <p>
          Each claim becomes part of the source ledger. Anything not supplied
          here is treated as unsupported and kept out of generation.
        </p>
      </section>

      <form className={styles.sourceForm} onSubmit={submit}>
        <fieldset>
          <legend>Product</legend>
          <div className={styles.twoColumnFields}>
            <label>
              <span>Product name</span>
              <input
                value={input.productName}
                onChange={(event) => setField("productName", event.target.value)}
                placeholder="Dewdrop Barrier Serum"
              />
            </label>
            <label>
              <span>Category</span>
              <input
                value={input.category}
                onChange={(event) => setField("category", event.target.value)}
                placeholder="Skincare"
              />
            </label>
          </div>
          <div className={styles.factFields}>
            <span className={styles.labelText}>Visible or sourced facts</span>
            {input.facts.map((fact, index) => (
              <div className={styles.factRow} key={`fact-${index}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <input
                  aria-label={`Product fact ${index + 1}`}
                  value={fact}
                  onChange={(event) => {
                    const facts = [...input.facts];
                    facts[index] = event.target.value;
                    setField("facts", facts);
                  }}
                  placeholder={
                    index === 0
                      ? "Fragrance-free formula"
                      : "Add a packaging, texture, feature, or sourced fact"
                  }
                />
                {input.facts.length > 1 ? (
                  <button
                    type="button"
                    aria-label={`Remove fact ${index + 1}`}
                    onClick={() =>
                      setField(
                        "facts",
                        input.facts.filter((_, factIndex) => factIndex !== index),
                      )
                    }
                  >
                    <X size={16} />
                  </button>
                ) : null}
              </div>
            ))}
            <button
              className={styles.addFact}
              type="button"
              onClick={() => setField("facts", [...input.facts, ""])}
            >
              <Plus size={16} />
              Add another fact
            </button>
          </div>
        </fieldset>

        <fieldset>
          <legend>Audience and outcome</legend>
          <label>
            <span>Target audience</span>
            <textarea
              rows={2}
              value={input.audience}
              onChange={(event) => setField("audience", event.target.value)}
              placeholder="Who should recognize themselves in this creator?"
            />
          </label>
          <label>
            <span>Desired action</span>
            <input
              value={input.goal}
              onChange={(event) => setField("goal", event.target.value)}
              placeholder="Earn qualified product-page visits"
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>Channel direction</legend>
          <div className={styles.threeColumnFields}>
            <label>
              <span>Platform</span>
              <select
                value={input.platform}
                onChange={(event) =>
                  setField("platform", event.target.value as CampaignInput["platform"])
                }
              >
                <option>TikTok</option>
                <option>Instagram Reels</option>
                <option>YouTube Shorts</option>
                <option>小红书</option>
              </select>
            </label>
            <label>
              <span>Duration</span>
              <select
                value={input.durationSec}
                onChange={(event) =>
                  setField("durationSec", Number(event.target.value))
                }
              >
                <option value={4}>4 seconds</option>
                <option value={6}>6 seconds</option>
                <option value={8}>8 seconds</option>
              </select>
            </label>
            <label>
              <span>Language</span>
              <select
                value={input.language}
                onChange={(event) => setField("language", event.target.value)}
              >
                <option>English</option>
                <option>简体中文</option>
                <option>日本語</option>
                <option>한국어</option>
              </select>
            </label>
          </div>
          <label>
            <span>Creator and camera direction (optional)</span>
            <textarea
              rows={3}
              value={input.creatorDescription ?? ""}
              onChange={(event) =>
                setField("creatorDescription", event.target.value)
              }
              placeholder="Natural daylight, creator profile, filming context, delivery style"
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>Reference anchors</legend>
          <div className={styles.uploadGrid}>
            <ReferenceUpload
              label="Product image"
              hint="Packaging or product-in-context"
              value={input.productImageDataUrl}
              onChange={(value) => setField("productImageDataUrl", value)}
            />
            <ReferenceUpload
              label="Creator reference"
              hint="Identity or casting direction"
              value={input.creatorImageDataUrl}
              onChange={(value) => setField("creatorImageDataUrl", value)}
            />
          </div>
          <p className={styles.formHint}>
            Images stay in this browser until you explicitly approve a provider
            request. Maximum 1.2 MB per reference.
          </p>
        </fieldset>

        {inlineError ? (
          <p className={styles.formError} role="alert">
            {inlineError}
          </p>
        ) : null}
        <div className={styles.formFooter}>
          <p>
            The Director will return five hooks and three personas. No media is
            generated in this step.
          </p>
          <button className={styles.primaryButton} type="submit" disabled={busy}>
            {busy ? (
              <>
                <RefreshCcw className={styles.spin} size={17} />
                Building routes
              </>
            ) : (
              <>
                Build creative routes
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function ReferenceUpload({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value?: string;
  onChange: (value?: string) => void;
}) {
  const [error, setError] = useState("");
  const handle = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Choose a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > 1_200_000) {
      setError("Keep this reference under 1.2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setError("");
      onChange(String(reader.result));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className={styles.referenceUpload}>
      {value ? (
        <div className={styles.referencePreview}>
          <Image
            src={value}
            alt={`${label} preview`}
            fill
            sizes="(max-width: 760px) 100vw, 440px"
            unoptimized
          />
          <button
            type="button"
            aria-label={`Remove ${label.toLowerCase()}`}
            onClick={() => onChange(undefined)}
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <label>
          <ImagePlus size={21} />
          <strong>{label}</strong>
          <span>{hint}</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handle}
          />
        </label>
      )}
      {error ? <small className={styles.uploadError}>{error}</small> : null}
    </div>
  );
}

function RoutesView({
  campaign,
  selectedHook,
  selectedPersona,
  onHook,
  onPersona,
  onSources,
  onGenerate,
  canGenerate,
}: {
  campaign: CampaignState;
  selectedHook: CreativeHook | null;
  selectedPersona: CreatorPersona | null;
  onHook: (hook: CreativeHook) => void;
  onPersona: (persona: CreatorPersona) => void;
  onSources: () => void;
  onGenerate: () => void;
  canGenerate: boolean;
}) {
  if (!campaign.brief) {
    return (
      <section className={styles.emptyCampaign}>
        <p className={styles.sectionEyebrow}>Creative routes</p>
        <h2>No routes yet.</h2>
        <p>Add product truth first so each opening can be defended.</p>
        <button className={styles.primaryButton} type="button" onClick={onSources}>
          Add product sources
          <ArrowRight size={18} />
        </button>
      </section>
    );
  }

  return (
    <div className={styles.detailView}>
      <section className={styles.detailIntro}>
        <span className={styles.objectNumber}>02</span>
        <p className={styles.sectionEyebrow}>Creative routes</p>
        <h2>Five openings. One decision.</h2>
        <p>
          Each route changes the first three seconds—not just the wording.
          Choose the reason to watch, then choose who can say it credibly.
        </p>
      </section>
      <section className={styles.routeChooser}>
        <div className={styles.chooserHeader}>
          <div>
            <span>Hook routes</span>
            <strong>Choose one opening</strong>
          </div>
          <small>{campaign.brief.hooks.length} routes ready</small>
        </div>
        <div className={styles.hookList}>
          {campaign.brief.hooks.map((hook, index) => {
            const selected = hook.id === selectedHook?.id;
            return (
              <button
                type="button"
                key={hook.id}
                className={selected ? styles.hookSelected : ""}
                onClick={() => onHook(hook)}
                aria-pressed={selected}
              >
                <span className={styles.hookNumber}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className={styles.hookBody}>
                  <span>
                    <strong>{hook.label}</strong>
                    {hook.id === campaign.brief?.recommendedHookId ? (
                      <small>Director pick</small>
                    ) : null}
                  </span>
                  <q>{hook.script}</q>
                  <em>{hook.why}</em>
                </span>
                <span className={styles.choiceControl}>
                  {selected ? <Check size={14} /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.personaChooser}>
        <div className={styles.chooserHeader}>
          <div>
            <span>Creator personas</span>
            <strong>Choose one point of view</strong>
          </div>
          <small>{campaign.brief.personas.length} casting routes</small>
        </div>
        <div className={styles.personaGrid}>
          {campaign.brief.personas.map((persona, index) => {
            const selected = persona.id === selectedPersona?.id;
            const images = [
              "/media/koc-serum-creator.webp",
              "/media/koc-blender-demo.webp",
              "/media/koc-earbuds-unboxing.webp",
            ];
            return (
              <button
                type="button"
                key={persona.id}
                className={selected ? styles.personaSelected : ""}
                onClick={() => onPersona(persona)}
                aria-pressed={selected}
              >
                <span className={styles.personaImage}>
                  <Image
                    src={images[index % images.length]}
                    alt=""
                    fill
                    sizes="(max-width: 760px) 130px, 300px"
                  />
                </span>
                <span className={styles.personaBody}>
                  <span>
                    <strong>{persona.label}</strong>
                    <span className={styles.choiceControl}>
                      {selected ? <Check size={14} /> : null}
                    </span>
                  </span>
                  <p>{persona.description}</p>
                  <small>{persona.voice}</small>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.routeDecisionBar}>
        <div>
          <span>Production route</span>
          <strong>
            {selectedHook?.label ?? "Choose a hook"} ×{" "}
            {selectedPersona?.label ?? "Choose a persona"}
          </strong>
        </div>
        <button
          className={styles.primaryButton}
          type="button"
          onClick={onGenerate}
          disabled={!canGenerate}
        >
          {canGenerate ? "Continue to assets" : "Asset generation not open"}
          <ArrowRight size={18} />
        </button>
      </section>
    </div>
  );
}

function CandidatesView({
  campaign,
  onAdopt,
  onGenerate,
  canGenerate,
  generationUnavailableMessage,
}: {
  campaign: CampaignState;
  onAdopt: (candidate: Candidate) => void;
  onGenerate: () => void;
  canGenerate: boolean;
  generationUnavailableMessage: string;
}) {
  return (
    <div className={styles.detailView}>
      <section className={styles.detailIntroRow}>
        <div>
          <span className={styles.objectNumber}>03</span>
          <p className={styles.sectionEyebrow}>Candidates</p>
          <h2>Review before anything becomes truth.</h2>
          <p>
            Provider results stay immutable. Adoption changes the campaign
            source; rejection never deletes lineage.
          </p>
        </div>
        <button
          className={styles.primaryButton}
          type="button"
          onClick={onGenerate}
          disabled={!canGenerate}
          title={!canGenerate ? generationUnavailableMessage : undefined}
        >
          <ImagePlus size={17} />
          {canGenerate ? "Generate anchor" : "Generation not open"}
        </button>
      </section>
      {campaign.candidates.length ? (
        <div className={styles.candidateGrid}>
          {campaign.candidates.map((candidate, index) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              featured={index === 0}
              onAdopt={() => onAdopt(candidate)}
            />
          ))}
        </div>
      ) : (
        <button
          type="button"
          className={styles.candidateEmpty}
          onClick={onGenerate}
          disabled={!canGenerate}
          title={!canGenerate ? generationUnavailableMessage : undefined}
        >
          <ImagePlus size={28} />
          <strong>No candidates yet</strong>
          <span>
            {canGenerate
              ? "Approve exact input to create the first visual anchor."
              : "Complete and export the campaign plan while generation is closed."}
          </span>
        </button>
      )}
    </div>
  );
}

function CandidateCard({
  candidate,
  featured,
  onAdopt,
}: {
  candidate: Candidate;
  featured?: boolean;
  onAdopt: () => void;
}) {
  return (
    <article
      className={`${styles.candidateCard} ${featured ? styles.candidateFeatured : ""}`}
    >
      <div className={styles.candidateMedia}>
        {candidate.kind === "video" ? (
          <video
            src={candidate.url}
            controls
            playsInline
            preload="metadata"
            aria-label={`${candidate.label} candidate`}
          />
        ) : candidate.url.startsWith("http") ? (
          // Provider URLs are displayed directly and never sent through the
          // Next image proxy, so an arbitrary provider host cannot become an
          // application-side fetch target.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={candidate.url}
            alt={`${candidate.label} candidate`}
            referrerPolicy="no-referrer"
          />
        ) : (
          <Image
            src={candidate.url}
            alt={`${candidate.label} candidate`}
            fill
            sizes={featured ? "(max-width: 900px) 100vw, 55vw" : "360px"}
            unoptimized={candidate.url.startsWith("data:")}
            priority={featured}
          />
        )}
        <span
          className={
            candidate.status === "adopted"
              ? styles.statusAdopted
              : styles.statusCandidate
          }
        >
          {candidate.status === "adopted" ? (
            <Check size={13} />
          ) : (
            <Clock3 size={13} />
          )}
          {candidate.status}
        </span>
      </div>
      <div className={styles.candidateInfo}>
        <div>
          <strong>{candidate.label}</strong>
          <span>
            {candidate.provider}
            {candidate.model ? ` / ${candidate.model}` : ""} ·{" "}
            {candidate.inputSignature
              ? `${candidate.inputSignature.slice(0, 10)} · `
              : ""}
            {formatTime(candidate.createdAt)}
          </span>
        </div>
        <p>{candidate.prompt}</p>
        {candidate.status === "adopted" ? (
          <div className={styles.acceptedActions}>
            <span className={styles.acceptedLabel}>
              <BadgeCheck size={16} />
              {candidate.kind === "video"
                ? "Accepted final video"
                : "Accepted visual source"}
            </span>
            {candidate.kind === "video" ? (
              <a
                href={candidate.url}
                target="_blank"
                rel="noreferrer"
                className={styles.candidateAssetLink}
              >
                <ArrowDownToLine size={15} />
                Open / download asset
              </a>
            ) : null}
          </div>
        ) : (
          <button type="button" onClick={onAdopt}>
            Adopt candidate
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    </article>
  );
}

function ReceiptsView({ campaign }: { campaign: CampaignState }) {
  return (
    <div className={styles.detailView}>
      <section className={styles.detailIntro}>
        <span className={styles.objectNumber}>04</span>
        <p className={styles.sectionEyebrow}>Receipts</p>
        <h2>A visible trail of every canonical decision.</h2>
        <p>
          Receipts make the campaign recoverable and explain why the current
          route, source, and candidate are active.
        </p>
      </section>
      <div className={styles.receiptTable} role="table" aria-label="Campaign receipts">
        <div role="row" className={styles.receiptHeader}>
          <span role="columnheader">Event</span>
          <span role="columnheader">Detail</span>
          <span role="columnheader">Time</span>
        </div>
        {campaign.receipts.map((receipt) => (
          <div role="row" key={receipt.id} className={styles.receiptRow}>
            <span role="cell">
              <ReceiptText size={16} />
              <strong>{receipt.action}</strong>
            </span>
            <span role="cell">{receipt.detail}</span>
            <time role="cell" dateTime={receipt.at}>
              {formatTime(receipt.at)}
            </time>
          </div>
        ))}
        {!campaign.receipts.length ? (
          <div className={styles.receiptEmpty}>
            The first brief decision will create a receipt here.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DirectorPanel({
  campaign,
  selectedHook,
  selectedPersona,
  routerDecision,
  onView,
  onGenerate,
  onGenerateVideo,
  onExportDelivery,
  onClose,
  canGenerate,
  generationUnavailableMessage,
}: {
  campaign: CampaignState;
  selectedHook: CreativeHook | null;
  selectedPersona: CreatorPersona | null;
  routerDecision: ReturnType<typeof explainCreativeRoute>;
  onView: (view: View) => void;
  onGenerate: () => void;
  onGenerateVideo: () => void;
  onExportDelivery: () => void;
  onClose: () => void;
  canGenerate: boolean;
  generationUnavailableMessage: string;
}) {
  const acceptedImage = campaign.candidates.find(
    (item) => item.status === "adopted" && item.kind === "image",
  );
  const acceptedVideo = campaign.candidates.find(
    (item) => item.status === "adopted" && item.kind === "video",
  );
  const nextActionNeedsGeneration = Boolean(
    campaign.brief && selectedHook && selectedPersona && !acceptedVideo,
  );
  return (
    <aside className={styles.directorPanel} aria-label="Director">
      <header>
        <span className={styles.directorAvatar}>V</span>
        <div>
          <strong>Director</strong>
          <small>
            <span />
            Campaign-aware
          </small>
        </div>
        <button
          className={styles.directorCloseButton}
          type="button"
          aria-label="Close Director"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div className={styles.directorScroll}>
        <div className={styles.routerBadge}>
          <span>Router</span>
          <strong>{routerDecision.route}</strong>
          <small>{routerDecision.reasons.join(" · ").replaceAll("_", " ")}</small>
        </div>
        <div className={styles.directorNote}>
          <MessageSquareText size={17} />
          <p>
            {campaign.brief
              ? acceptedVideo
                ? "The final video is accepted. Export its delivery receipt and download the provider asset."
                : acceptedImage
                  ? "The route and visual anchor are accepted. Production can now use a stable, source-backed input."
                : "The creative route is ready. I’m waiting for one accepted visual anchor before production."
              : "I need product truth before I can create a defensible campaign route."}
          </p>
        </div>

        <section className={styles.directorSection}>
          <span>Current decision</span>
          <div className={styles.decisionItem}>
            <small>Hook</small>
            <strong>{selectedHook?.label ?? "Not selected"}</strong>
            {selectedHook ? (
              <button type="button" onClick={() => onView("routes")}>
                Change
              </button>
            ) : null}
          </div>
          <div className={styles.decisionItem}>
            <small>Creator</small>
            <strong>{selectedPersona?.label ?? "Not selected"}</strong>
            {selectedPersona ? (
              <button type="button" onClick={() => onView("routes")}>
                Change
              </button>
            ) : null}
          </div>
          <div className={styles.decisionItem}>
            <small>Source</small>
            <strong>{acceptedImage?.label ?? "Waiting for adoption"}</strong>
            <button type="button" onClick={() => onView("candidates")}>
              {acceptedImage ? "Inspect" : "Review"}
            </button>
          </div>
          {acceptedVideo ? (
            <div className={styles.decisionItem}>
              <small>Final video</small>
              <strong>{acceptedVideo.label}</strong>
              <button type="button" onClick={() => onView("candidates")}>
                Inspect
              </button>
            </div>
          ) : null}
        </section>

        <section className={styles.directorSection}>
          <span>Guardrails</span>
          <ul className={styles.guardrailList}>
            {(campaign.brief?.guardrails ?? [
              "Unsupported claims stay out of the script.",
              "No paid call before exact input approval.",
            ]).map((guardrail) => (
              <li key={guardrail}>
                <ShieldCheck size={15} />
                {guardrail}
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.directorSection}>
          <span>Next action</span>
          <button
            className={styles.directorAction}
            type="button"
            disabled={nextActionNeedsGeneration && !canGenerate}
            title={
              nextActionNeedsGeneration && !canGenerate
                ? generationUnavailableMessage
                : undefined
            }
            onClick={
              !campaign.brief
                ? () => onView("sources")
                : !selectedHook || !selectedPersona
                  ? () => onView("routes")
                  : acceptedVideo
                    ? onExportDelivery
                    : acceptedImage
                    ? onGenerateVideo
                    : onGenerate
            }
          >
            <span>
              <strong>
                {!campaign.brief
                  ? "Add product truth"
                  : !selectedHook || !selectedPersona
                    ? "Choose one route"
                    : acceptedVideo
                      ? "Export final delivery"
                      : !canGenerate
                        ? "Paid generation is not open"
                      : acceptedImage
                        ? "Queue production video"
                        : "Create next anchor"}
              </strong>
              <small>
                {!campaign.brief
                  ? "No provider spend"
                  : acceptedVideo
                    ? "No provider spend"
                    : !canGenerate
                      ? generationUnavailableMessage
                    : "Two-step exact input review before provider spend"}
              </small>
            </span>
            <ArrowRight size={18} />
          </button>
        </section>
      </div>
      <footer>
        <span>
          Revision <strong>{campaign.revision}</strong>
        </span>
        <span>
          {campaign.receipts.length} receipt
          {campaign.receipts.length === 1 ? "" : "s"}
        </span>
      </footer>
    </aside>
  );
}

function ApprovalDialog({
  approval,
  busy,
  onCancel,
  onReview,
  onConfirm,
}: {
  approval: NonNullable<PaidApproval>;
  busy: boolean;
  onCancel: () => void;
  onReview: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const locked = Boolean(approval.serverApprovalToken);

  useEffect(() => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    closeButtonRef.current?.focus();
    return () => {
      if (dialog?.open) dialog.close();
      returnFocusRef.current?.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={styles.approvalDialog}
      aria-labelledby="approval-title"
      aria-describedby="approval-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <header>
        <div>
          <span className={styles.dialogIcon}>
            <ShieldCheck size={19} />
          </span>
          <div>
            <p className={styles.sectionEyebrow}>Paid provider boundary</p>
            <h2 id="approval-title">
              {locked ? "Confirm paid generation" : "Review exact input"}
            </h2>
          </div>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          aria-label="Close approval"
          onClick={onCancel}
          disabled={busy}
        >
          <X size={20} />
        </button>
      </header>
      <div className={styles.approvalBody}>
        <p id="approval-description">
          {locked
            ? "The server has canonicalized and locked this exact input without contacting the provider. Review every field below before the separate paid submission."
            : `Review the complete ${approval.kind} input. Locking validates the current provider model and canonical digest without provider spend.`}
        </p>
        <dl className={styles.approvalMeta}>
          <div>
            <dt>Work item</dt>
            <dd>
              {approval.kind === "image"
                ? "Creator + product anchor"
                : "Production video"}
            </dd>
          </div>
          <div>
            <dt>Provider model</dt>
            <dd>{approval.providerModel ?? "Resolved after lock"}</dd>
          </div>
          <div>
            <dt>Adapter build</dt>
            <dd>
              {approval.adapterVersion
                ? approval.adapterVersion.slice(-12)
                : "Resolved after lock"}
            </dd>
          </div>
          <div>
            <dt>Ratio</dt>
            <dd>
              {approval.kind === "image"
                ? approval.aspectRatio
                : approval.ratio}
            </dd>
          </div>
          <div>
            <dt>References</dt>
            <dd>
              {approval.kind === "image"
                ? approval.references.length || "None"
                : `1 adopted image · ${approval.anchorDigest.slice(0, 10)}`}
            </dd>
          </div>
          <div>
            <dt>Output</dt>
            <dd>
              {approval.kind === "image"
                ? "1 image · 1024×1536"
                : `1 × ${approval.durationSec}s video`}
            </dd>
          </div>
          {approval.kind === "video" ? (
            <>
              <div>
                <dt>Resolution</dt>
                <dd>{approval.resolution}</dd>
              </div>
              <div>
                <dt>Audio</dt>
                <dd>
                  {approval.generateAudio
                    ? "Native audio on"
                    : "Audio off"}
                </dd>
              </div>
            </>
          ) : null}
          <div>
            <dt>{locked ? "Canonical digest" : "Draft digest"}</dt>
            <dd>{approval.inputSignature.slice(-12)}</dd>
          </div>
          <div>
            <dt>Approval expiry</dt>
            <dd>
              {approval.expiresAt
                ? formatTime(approval.expiresAt)
                : "Not locked"}
            </dd>
          </div>
          <div>
            <dt>Job intent</dt>
            <dd>{approval.idempotencyKey.slice(-12)}</dd>
          </div>
        </dl>
        <div className={styles.referenceReview}>
          <span>Ordered visual inputs</span>
          <div>
            {approval.kind === "image" ? (
              approval.references.length ? (
                approval.references.map((reference, index) => (
                  // Exact data-URL snapshots are intentionally rendered
                  // directly; they never leave this locked approval object.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${index}-${reference.dataUrl.length}`}
                    src={reference.dataUrl}
                    alt={`Reference input ${index + 1}`}
                  />
                ))
              ) : (
                <small>No visual references; this is text-to-image.</small>
              )
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={approval.imageDataUrl}
                alt="Adopted first-frame input"
              />
            )}
          </div>
        </div>
        <div className={styles.promptReview}>
          <span>Provider prompt</span>
          <p>{approval.prompt}</p>
        </div>
        <div className={styles.spendNote}>
          <CircleAlert size={17} />
          <p>
            {locked
              ? "Exact price is not available from the configured provider. The next button creates one server-ledgered, potentially billable submission; ambiguous requests are never automatically resubmitted."
              : "Locking is a no-spend validation step. It does not call the image or video provider and cannot create a billed generation."}
          </p>
        </div>
      </div>
      <footer>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          className={styles.primaryButton}
          type="button"
          onClick={locked ? onConfirm : onReview}
          disabled={busy}
        >
          {busy ? (
            <>
              <RefreshCcw className={styles.spin} size={17} />
              {locked ? "Submitting once" : "Locking input"}
            </>
          ) : locked ? (
            <>
              Confirm paid generation
              <Sparkles size={17} />
            </>
          ) : (
            <>
              Lock exact input · no spend
              <ShieldCheck size={17} />
            </>
          )}
        </button>
      </footer>
    </dialog>
  );
}
