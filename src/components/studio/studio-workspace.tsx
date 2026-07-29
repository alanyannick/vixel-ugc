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
  Menu,
  MessageSquareText,
  MoreHorizontal,
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
  useState,
} from "react";

import { IconMark } from "@/components/studio/icon-mark";
import {
  createCreativeBrief,
  createImageCandidate,
  pollVideoCandidate,
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
  parseCampaignExport,
  saveCampaign,
} from "@/lib/client/campaign-store";
import {
  exactInputSignature,
  explainCreativeRoute,
} from "@/lib/domain";

import styles from "./studio.module.css";

type View = "board" | "sources" | "routes" | "candidates" | "receipts";

type PaidApproval =
  | ({
      prompt: string;
      inputSignature: string;
    } & (
      | {
          kind: "image";
          aspectRatio: "9:16";
        }
      | {
          kind: "video";
          ratio: "9:16";
          durationSec: number;
          resolution: "720p";
          generateAudio: boolean;
        }
    ))
  | null;

const planStages = [
  { id: "brief", label: "Brief" },
  { id: "assets", label: "Assets" },
  { id: "production", label: "Production" },
  { id: "post", label: "Post" },
] as const;

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
    `Create an authentic 9:16 KOC creator frame for ${campaign.input.productName}.`,
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

function downloadCampaign(campaign: CampaignState) {
  const payload = JSON.stringify(
    {
      format: "vixel-koc-campaign",
      version: 1,
      exportedAt: new Date().toISOString(),
      campaign,
    },
    null,
    2,
  );
  const href = URL.createObjectURL(
    new Blob([payload], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `${campaign.input.productName || "vixel-koc-campaign"}.json`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  anchor.click();
  URL.revokeObjectURL(href);
}

export function StudioWorkspace() {
  const [campaign, setCampaign] = useState<CampaignState>(demoCampaign);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<View>("board");
  const [directorOpen, setDirectorOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [briefBusy, setBriefBusy] = useState(false);
  const [generationBusy, setGenerationBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [approval, setApproval] = useState<PaidApproval>(null);

  useEffect(() => {
    let active = true;
    loadCampaign()
      .then((stored) => {
        if (active) setCampaign(stored);
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void saveCampaign(campaign);
  }, [campaign, hydrated]);

  useEffect(() => {
    const activeJobs = campaign.jobs.filter(
      (job) => job.status === "queued" || job.status === "processing",
    );
    if (!activeJobs.length) return;
    let cancelled = false;

    async function syncJobs() {
      for (const job of activeJobs) {
        try {
          const polled = await pollVideoCandidate(job.id);
          if (cancelled) return;
          setCampaign((current) => {
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
                    prompt: job.prompt,
                    createdAt: new Date().toISOString(),
                    provider: polled.provider,
                    status: "candidate" as const,
                  }
                : null;
            return {
              ...current,
              revision: terminal ? current.revision + 1 : current.revision,
              updatedAt: new Date().toISOString(),
              jobs: current.jobs.map((item) =>
                item.id === job.id
                  ? {
                      ...item,
                      status: polled.result.status,
                      progress: polled.result.progress,
                      url: polled.result.url,
                      error: polled.result.error,
                      updatedAt: new Date().toISOString(),
                    }
                  : item,
              ),
              candidates: candidate
                ? [candidate, ...current.candidates]
                : current.candidates,
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
        } catch {
          // A polling failure is not the provider job failing. The durable task
          // stays recoverable and will be checked again on the next interval.
        }
      }
    }

    void syncJobs();
    const timer = window.setInterval(() => void syncJobs(), 8_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [campaign.jobs]);

  const updateCampaign = useCallback(
    (
      updater: (current: CampaignState) => CampaignState,
      receipt?: { action: string; detail: string },
    ) => {
      setCampaign((current) => {
        const next = updater(current);
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
    setCampaign(newCampaign());
    setView("sources");
    setMobileNavOpen(false);
    setError("");
    setNotice("New campaign opened. Start with product truth.");
  };

  const restoreDemo = () => {
    setCampaign(demoCampaign);
    setView("board");
    setError("");
    setNotice("Demo campaign restored.");
  };

  const selectHook = (hook: CreativeHook) => {
    updateCampaign(
      (current) => ({ ...current, selectedHookId: hook.id }),
      { action: "Hook selected", detail: hook.label },
    );
    setNotice(`${hook.label} is now the production route.`);
  };

  const selectPersona = (persona: CreatorPersona) => {
    updateCampaign(
      (current) => ({ ...current, selectedPersonaId: persona.id }),
      { action: "Persona selected", detail: persona.label },
    );
    setNotice(`${persona.label} is now the creator anchor.`);
  };

  const adoptCandidate = (candidate: Candidate) => {
    updateCampaign(
      (current) => ({
        ...current,
        candidates: current.candidates.map((item) => ({
          ...item,
          status:
            item.id === candidate.id
              ? "adopted"
              : item.status === "adopted"
                ? "candidate"
                : item.status,
        })),
      }),
      { action: "Candidate adopted", detail: candidate.label },
    );
    setNotice(`${candidate.label} became the accepted visual source.`);
  };

  const startGeneration = () => {
    if (!selectedHook || !selectedPersona) {
      setError("Choose one hook and one creator persona before generation.");
      setView("routes");
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
    setApproval({
      kind: exactInput.kind,
      prompt: exactInput.prompt,
      aspectRatio: exactInput.aspectRatio,
      inputSignature: exactInputSignature(exactInput),
    });
  };

  const startVideoGeneration = () => {
    if (!selectedHook || !selectedPersona) {
      setError("Choose one hook and one creator persona before production.");
      setView("routes");
      return;
    }
    if (!campaign.candidates.some((item) => item.status === "adopted")) {
      setError("Adopt one visual anchor before starting video production.");
      setView("candidates");
      return;
    }
    const durationSec = Math.min(campaign.input.durationSec, 15);
    const prompt = [
      `Create one continuous ${durationSec}-second 9:16 KOC product video for ${campaign.input.productName}.`,
      `Opening dialogue: ${selectedHook.script}`,
      `Creator: ${selectedPersona.description}. Delivery: ${selectedPersona.voice}.`,
      `Product facts allowed: ${campaign.input.facts.filter(Boolean).join("; ")}.`,
      "Product enters frame before second two. Show one observable product action. Natural phone camera, native dialogue and room sound, no subtitles, no invented efficacy claim, no beauty-ad polish.",
      campaign.brief?.shotDirection ?? "",
    ]
      .filter(Boolean)
      .join(" ");
    const exactInput = {
      kind: "video",
      prompt,
      ratio: "9:16",
      durationSec,
      resolution: "720p",
      generateAudio: true,
    } as const;
    setError("");
    setApproval({
      ...exactInput,
      inputSignature: exactInputSignature(exactInput),
    });
  };

  const confirmGeneration = async () => {
    if (!approval) return;
    setGenerationBusy(true);
    setError("");
    try {
      if (approval.kind === "video") {
        const submitted = await submitVideoCandidate({
          prompt: approval.prompt,
          durationSec: approval.durationSec,
          ratio: approval.ratio,
          resolution: approval.resolution,
          generateAudio: approval.generateAudio,
          idempotencyKey: approval.inputSignature,
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
                },
                ...current.jobs.filter(
                  (job) => job.id !== submitted.result.taskId,
                ),
              ],
              candidates: immediateCandidate
                ? [immediateCandidate, ...current.candidates]
                : current.candidates,
            };
          },
          {
            action: "Video job submitted",
            detail: `Provider task ${submitted.result.taskId} is recoverable and will be polled asynchronously.`,
          },
        );
        setApproval(null);
        setView("board");
        setNotice(
          "Video job submitted. You can leave this view; polling resumes from saved task state.",
        );
        return;
      }
      const result = await createImageCandidate({
        prompt: approval.prompt,
        aspectRatio: approval.aspectRatio,
        references: [
          campaign.input.productImageDataUrl
            ? { dataUrl: campaign.input.productImageDataUrl }
            : {},
          campaign.input.creatorImageDataUrl
            ? { dataUrl: campaign.input.creatorImageDataUrl }
            : {},
        ].filter((item) => "dataUrl" in item && Boolean(item.dataUrl)),
        idempotencyKey: approval.inputSignature,
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
      };
      updateCampaign(
        (current) => ({
          ...current,
          candidates: [candidate, ...current.candidates],
        }),
        {
          action: "Provider result claimed",
          detail: `${candidate.label} saved as a reviewable candidate.`,
        },
      );
      setApproval(null);
      setView("candidates");
      setNotice("Generation completed. Review the new candidate before adoption.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Generation failed before a candidate was created.",
      );
    } finally {
      setGenerationBusy(false);
    }
  };

  return (
    <div className={styles.studioShell} data-studio-shell>
      <aside
        className={`${styles.sidebar} ${mobileNavOpen ? styles.sidebarOpen : ""}`}
        aria-label="Studio navigation"
      >
        <div className={styles.brandRow}>
          <Link href="/" aria-label="Vixel KOC home" className={styles.brand}>
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
              setView("board");
              setMobileNavOpen(false);
            }}
          >
            <LayoutGrid size={18} />
            Campaign board
          </button>
          <button
            type="button"
            className={view === "sources" ? styles.navActive : ""}
            onClick={() => {
              setView("sources");
              setMobileNavOpen(false);
            }}
          >
            <FileText size={18} />
            Product sources
          </button>
          <button
            type="button"
            className={view === "routes" ? styles.navActive : ""}
            onClick={() => {
              setView("routes");
              setMobileNavOpen(false);
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
              setView("candidates");
              setMobileNavOpen(false);
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
              setView("receipts");
              setMobileNavOpen(false);
            }}
          >
            <ReceiptText size={18} />
            Receipts
          </button>
        </nav>

        <div className={styles.sidebarCampaigns}>
          <div className={styles.navSectionLabel}>
            <span>Recent</span>
            <button
              type="button"
              aria-label="Campaign options"
              title="Campaign options"
            >
              <MoreHorizontal size={16} />
            </button>
          </div>
          <button
            className={styles.campaignMini}
            type="button"
            onClick={() => {
              setView("board");
              setMobileNavOpen(false);
            }}
          >
            <span className={styles.campaignThumb}>
              <Image
                src="/media/koc-serum-creator.webp"
                alt=""
                width={40}
                height={48}
              />
            </span>
            <span>
              <strong>{campaign.input.productName || "Untitled campaign"}</strong>
              <small>Revision {campaign.revision}</small>
            </span>
          </button>
        </div>

        <div className={styles.sidebarFooter}>
          <div className={styles.localStatus}>
            <ShieldCheck size={16} />
            <span>
              <strong>Local recovery on</strong>
              <small>Campaign state is saved in this browser</small>
            </span>
          </div>
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
              <CircleCheck size={15} />
              Saved locally
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
                      setCampaign({
                        ...imported,
                        revision: imported.revision + 1,
                        updatedAt: new Date().toISOString(),
                        receipts: [
                          nowReceipt(
                            "Campaign imported",
                            "Campaign state restored from a validated Vixel export.",
                          ),
                          ...imported.receipts,
                        ],
                      });
                      setView("board");
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
          onNavigate={(nextView) => setView(nextView)}
        />

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

        <div className={styles.workspaceScroll}>
          {view === "board" ? (
            <CampaignBoard
              campaign={campaign}
              selectedHook={selectedHook}
              selectedPersona={selectedPersona}
              onView={setView}
              onGenerate={startGeneration}
              onGenerateVideo={startVideoGeneration}
              onAdopt={adoptCandidate}
              onRestoreDemo={restoreDemo}
            />
          ) : null}
          {view === "sources" ? (
            <SourcesView
              key={campaign.id}
              campaign={campaign}
              busy={briefBusy}
              onChange={setCampaign}
              onSubmit={async (input) => {
                setBriefBusy(true);
                setError("");
                try {
                  const result = await createCreativeBrief(input);
                  updateCampaign(
                    (current) => ({
                      ...current,
                      name: `${input.productName} · KOC routes`,
                      input,
                      brief: result.brief,
                      selectedHookId: result.brief.recommendedHookId,
                      selectedPersonaId: result.brief.recommendedPersonaId,
                    }),
                    {
                      action: "Creative brief created",
                      detail: `${result.brief.hooks.length} hooks and ${result.brief.personas.length} personas via ${result.provider}.`,
                    },
                  );
                  setView("routes");
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
              onSources={() => setView("sources")}
              onGenerate={startGeneration}
            />
          ) : null}
          {view === "candidates" ? (
            <CandidatesView
              campaign={campaign}
              onAdopt={adoptCandidate}
              onGenerate={startGeneration}
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
            onView={setView}
            onGenerate={startGeneration}
            onGenerateVideo={startVideoGeneration}
            onClose={() => setDirectorOpen(false)}
          />
        </>
      ) : null}

      {approval ? (
        <ApprovalDialog
          approval={approval}
          campaign={campaign}
          busy={generationBusy}
          onCancel={() => {
            if (!generationBusy) setApproval(null);
          }}
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
  const state = {
    brief: campaign.brief ? "done" : "active",
    assets: campaign.candidates.some((item) => item.status === "adopted")
      ? "done"
      : campaign.brief
        ? "active"
        : "waiting",
    production:
      campaign.candidates.some((item) => item.status === "adopted") &&
      campaign.selectedHookId
        ? "active"
        : "waiting",
    post: "optional",
  } as const;

  return (
    <div className={styles.planRail} aria-label="Campaign plan">
      <div className={styles.planTitle}>
        <span>Plan</span>
        <strong>
          {campaign.brief
            ? campaign.candidates.some((item) => item.status === "adopted")
              ? "Production input ready"
              : "Waiting for an accepted anchor"
            : "Waiting for product truth"}
        </strong>
      </div>
      <div className={styles.planStages}>
        {planStages.map((stage, index) => {
          const itemState = state[stage.id];
          return (
            <button
              key={stage.id}
              type="button"
              className={`${styles.planStage} ${styles[`plan_${itemState}`]}`}
              onClick={() =>
                onNavigate(
                  stage.id === "brief"
                    ? "sources"
                    : stage.id === "assets"
                      ? "candidates"
                      : "board",
                )
              }
            >
              <span className={styles.planDot}>
                {itemState === "done" ? <Check size={12} /> : index + 1}
              </span>
              <span>{stage.label}</span>
              <small>
                {itemState === "done"
                  ? "Complete"
                  : itemState === "active"
                    ? "Active"
                    : itemState === "optional"
                      ? "If needed"
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
  onRestoreDemo,
}: {
  campaign: CampaignState;
  selectedHook: CreativeHook | null;
  selectedPersona: CreatorPersona | null;
  onView: (view: View) => void;
  onGenerate: () => void;
  onGenerateVideo: () => void;
  onAdopt: (candidate: Candidate) => void;
  onRestoreDemo: () => void;
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

  const adopted = campaign.candidates.find((item) => item.status === "adopted");
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
                {adopted ? "Accepted source" : "A candidate needs your review"}
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
          {adopted ? (
            <CandidateCard
              candidate={adopted}
              featured
              onAdopt={() => onAdopt(adopted)}
            />
          ) : (
            <button
              className={styles.missingAnchor}
              type="button"
              onClick={onGenerate}
            >
              <ImagePlus size={24} />
              <span>
                <strong>Create a creator + product anchor</strong>
                <small>Exact provider input will be shown before spend.</small>
              </span>
              <ArrowRight size={18} />
            </button>
          )}
        </div>

        <div className={styles.productionSection}>
          <span className={styles.objectNumber}>03</span>
          <p className={styles.sectionEyebrow}>Production packet</p>
          <h3>12 seconds, directed—not guessed</h3>
          <ol className={styles.shotList}>
            <li>
              <time>0–3s</time>
              <span>
                <strong>Visible hook</strong>
                {selectedHook?.script}
              </span>
            </li>
            <li>
              <time>3–8s</time>
              <span>
                <strong>Product action</strong>
                Show texture and two-drop application in the same take.
              </span>
            </li>
            <li>
              <time>8–12s</time>
              <span>
                <strong>Native close</strong>
                Name the fragrance-free fact; point to product page without an
                inflated promise.
              </span>
            </li>
          </ol>
          <div className={styles.productionMeta}>
            <span>Dialogue + room sound</span>
            <span>Subtitles off</span>
            <span>9:16</span>
          </div>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={adopted ? onGenerateVideo : onGenerate}
          >
            {adopted ? "Queue production video" : "Generate next anchor"}
            <Sparkles size={17} />
          </button>
          {campaign.jobs.length ? (
            <div className={styles.jobStack}>
              {campaign.jobs.slice(0, 2).map((job) => (
                <div key={job.id} className={styles.jobRow}>
                  <span
                    className={
                      job.status === "failed"
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
                      {job.id.slice(0, 14)}
                    </small>
                  </span>
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
  onChange,
  onSubmit,
}: {
  campaign: CampaignState;
  busy: boolean;
  onChange: (campaign: CampaignState) => void;
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
    onChange({ ...campaign, input: normalized });
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
                <option value={8}>8 seconds</option>
                <option value={12}>12 seconds</option>
                <option value={15}>15 seconds</option>
                <option value={20}>20 seconds</option>
                <option value={30}>30 seconds</option>
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
            request. Maximum 2 MB per reference.
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
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Keep this reference under 2 MB.");
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
          <input type="file" accept="image/*" onChange={handle} />
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
}: {
  campaign: CampaignState;
  selectedHook: CreativeHook | null;
  selectedPersona: CreatorPersona | null;
  onHook: (hook: CreativeHook) => void;
  onPersona: (persona: CreatorPersona) => void;
  onSources: () => void;
  onGenerate: () => void;
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
        >
          Continue to assets
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
}: {
  campaign: CampaignState;
  onAdopt: (candidate: Candidate) => void;
  onGenerate: () => void;
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
        >
          <ImagePlus size={17} />
          Generate anchor
        </button>
      </section>
      {campaign.candidates.length ? (
        <div className={styles.candidateGrid}>
          {campaign.candidates.map((candidate) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              onAdopt={() => onAdopt(candidate)}
            />
          ))}
        </div>
      ) : (
        <button
          type="button"
          className={styles.candidateEmpty}
          onClick={onGenerate}
        >
          <ImagePlus size={28} />
          <strong>No candidates yet</strong>
          <span>Approve exact input to create the first visual anchor.</span>
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
            {candidate.provider} · {formatTime(candidate.createdAt)}
          </span>
        </div>
        <p>{candidate.prompt}</p>
        {candidate.status === "adopted" ? (
          <span className={styles.acceptedLabel}>
            <BadgeCheck size={16} />
            Accepted source
          </span>
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
  onClose,
}: {
  campaign: CampaignState;
  selectedHook: CreativeHook | null;
  selectedPersona: CreatorPersona | null;
  routerDecision: ReturnType<typeof explainCreativeRoute>;
  onView: (view: View) => void;
  onGenerate: () => void;
  onGenerateVideo: () => void;
  onClose: () => void;
}) {
  const accepted = campaign.candidates.find((item) => item.status === "adopted");
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
              ? accepted
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
            <strong>{accepted?.label ?? "Waiting for adoption"}</strong>
            <button type="button" onClick={() => onView("candidates")}>
              {accepted ? "Inspect" : "Review"}
            </button>
          </div>
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
            onClick={
              !campaign.brief
                ? () => onView("sources")
                : !selectedHook || !selectedPersona
                  ? () => onView("routes")
                  : accepted
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
                    : accepted
                      ? "Queue production video"
                      : "Create next anchor"}
              </strong>
              <small>
                {!campaign.brief
                  ? "No provider spend"
                  : "Exact input shown before provider spend"}
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
  campaign,
  busy,
  onCancel,
  onConfirm,
}: {
  approval: NonNullable<PaidApproval>;
  campaign: CampaignState;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const references = [
    campaign.input.productImageDataUrl,
    campaign.input.creatorImageDataUrl,
  ].filter(Boolean);
  return (
    <div className={styles.dialogBackdrop} role="presentation">
      <div
        className={styles.approvalDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-title"
      >
        <header>
          <div>
            <span className={styles.dialogIcon}>
              <ShieldCheck size={19} />
            </span>
            <div>
              <p className={styles.sectionEyebrow}>Paid provider boundary</p>
              <h2 id="approval-title">Approve exact input</h2>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close approval"
            onClick={onCancel}
            disabled={busy}
          >
            <X size={20} />
          </button>
        </header>
        <div className={styles.approvalBody}>
          <p>
            This is the canonical input that will be sent to the configured
            {approval.kind === "image" ? " image" : " video"} provider.
            Changing any field requires a new approval.
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
                  ? references.length || "None"
                  : "Accepted anchor lineage"}
              </dd>
            </div>
            <div>
              <dt>Output</dt>
              <dd>
                {approval.kind === "image"
                  ? "1 image candidate"
                  : `1 × ${approval.durationSec}s video`}
              </dd>
            </div>
            <div>
              <dt>Approval hash</dt>
              <dd>{approval.inputSignature.slice(-12)}</dd>
            </div>
          </dl>
          <div className={styles.promptReview}>
            <span>Provider prompt</span>
            <p>{approval.prompt}</p>
          </div>
          <div className={styles.spendNote}>
            <CircleAlert size={17} />
            <p>
              Provider pricing depends on the configured model. Vixel will make
              one submission and will not retry a successful provider task.
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
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? (
              <>
                <RefreshCcw className={styles.spin} size={17} />
                Provider is working
              </>
            ) : (
              <>
                Confirm and generate
                <Sparkles size={17} />
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}
