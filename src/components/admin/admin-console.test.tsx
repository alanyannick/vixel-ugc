import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminConsole } from "./admin-console";

const OPERATOR_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function overview(windowDays: 7 | 30 | 90 = 30) {
  return {
    generatedAt: "2026-08-01T04:00:00.000Z",
    windowDays,
    source: {
      status: "partial",
      parts: {
        product: "ready",
        generationLedger: "unavailable",
        audit: "ready",
      },
    },
    caveats: ["Generation data is not available."],
    queues: [
      {
        id: "waitlist_review",
        label: "Waitlist review",
        count: 3,
        status: "ready",
        severity: "attention",
      },
      {
        id: "email_delivery",
        label: "Failed email delivery",
        count: 1,
        status: "ready",
        severity: "warning",
      },
      {
        id: "generation_reconciliation",
        label: "Generation reconciliation",
        count: null,
        status: "unavailable",
        severity: "warning",
      },
    ],
    readiness: {
      productDatabase: "ready",
      accountAuth: "ready",
      cloudCampaigns: "ready",
      lifecycleEmail: "ready",
      billing: "disabled",
      generationProvider: "not_ready",
      generationLedger: "unavailable",
    },
    metrics: {
      totalAccounts: 8,
      approvedAccounts: 5,
      activeSubscriptions: 1,
      campaignCount: 11,
      successfulGenerationCount: null,
    },
    funnel: [
      {
        id: "waitlist_submitted",
        label: "Waitlist submitted",
        value: 10,
        conversionFromPreviousPercent: null,
        status: "ready",
        source: "product",
      },
      {
        id: "first_successful_generation",
        label: "First successful generation",
        value: null,
        conversionFromPreviousPercent: null,
        status: "unavailable",
        source: "generation_ledger",
      },
    ],
    audit: {
      status: "ready",
      entries: [
        {
          id: "audit-1",
          actorEmail: "operator@vixelai.com",
          subjectEmail: "creator@example.com",
          action: "account.grant_admin",
          reason: "Operations coverage",
          createdAt: "2026-08-01T03:00:00.000Z",
        },
      ],
    },
  };
}

const waitingIdentity = {
  userId: null,
  email: "waiting@example.com",
  displayName: "Waiting Person",
  company: "Acme",
  waitlistStatus: "pending",
  accountStatus: null,
  appRole: null,
  subscriptionStatus: "none",
  campaignCount: 0,
  successfulGenerationCount: 0,
  generationAttentionCount: 0,
  emailFailureCount: 1,
  createdAt: "2026-08-01T02:00:00.000Z",
  approvedAt: null,
  isBootstrapAdmin: false,
};

const productUser = {
  userId: USER_ID,
  email: "creator@example.com",
  displayName: "Creator Person",
  company: "Creator Co",
  waitlistStatus: "converted",
  accountStatus: "approved",
  appRole: "user",
  subscriptionStatus: "active",
  campaignCount: 2,
  successfulGenerationCount: 4,
  generationAttentionCount: 1,
  emailFailureCount: 0,
  createdAt: "2026-07-30T02:00:00.000Z",
  approvedAt: "2026-07-30T03:00:00.000Z",
  isBootstrapAdmin: false,
};

function authorizedFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === "/api/auth/session") {
      return json({
        authenticated: true,
        account: {
          userId: OPERATOR_ID,
          email: "operator@vixelai.com",
          accountStatus: "approved",
          appRole: "admin",
        },
      });
    }
    if (url.startsWith("/api/admin/overview")) {
      const days = Number(new URL(url, "https://ugc.vixelai.com").searchParams.get("window"));
      return json({ overview: overview(days as 7 | 30 | 90) });
    }
    if (url.startsWith("/api/admin/users?")) {
      return json({ users: [waitingIdentity, productUser], generatedAt: "2026-08-01T04:00:00.000Z" });
    }
    if (url === `/api/admin/users/${USER_ID}` && init?.method === "PATCH") {
      return json({
        user: { ...productUser, accountStatus: "suspended" },
        audit: { id: "audit-2" },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe("AdminConsole", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps the console behind approved admin access", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      json({
        authenticated: true,
        account: {
          accountStatus: "approved",
          appRole: "user",
        },
      }),
    );

    render(<AdminConsole />);

    expect(await screen.findByRole("heading", { name: "Admin access required" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Go to sign in" })).toHaveAttribute("href", "/studio");
  });

  it("renders partial overview data honestly and reloads the selected growth window", async () => {
    const fetchMock = authorizedFetch();
    render(<AdminConsole />);

    expect(await screen.findByRole("heading", { name: "Product pulse" })).toBeVisible();
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
    expect(
      screen.getByText((_, element) =>
        element?.tagName === "P" &&
        element.textContent?.includes("Source status: partial") === true,
      ),
    ).toBeVisible();
    expect(screen.getByText("account · grant admin")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Growth" }));
    fireEvent.click(screen.getByRole("button", { name: "7d" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/overview?window=7",
        { cache: "no-store" },
      );
    });
    expect(await screen.findByLabelText("7 day activation funnel")).toBeVisible();
  });

  it("opens attention queues with the matching user filter", async () => {
    authorizedFetch();
    render(<AdminConsole />);

    fireEvent.click(
      await screen.findByRole("button", { name: /Failed email delivery/i }),
    );

    expect(await screen.findByRole("heading", { name: "Control permissions." })).toBeVisible();
    expect(screen.getByLabelText("Attention")).toHaveValue("email_delivery");
    expect(screen.getByRole("button", { name: /Waiting Person/i })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Creator Person/i })).toBeNull();
  });

  it("disables waitlist-only operations and requires an audit reason for account changes", async () => {
    const fetchMock = authorizedFetch();
    render(<AdminConsole />);

    fireEvent.click(await screen.findByRole("button", { name: "Users & access" }));
    fireEvent.click(await screen.findByRole("button", { name: /Waiting Person/i }));

    expect(screen.getByText("Account not created")).toBeVisible();
    expect(screen.getByRole("button", { name: "Grant admin" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Creator Person/i }));
    const suspend = screen.getByRole("button", { name: "Suspend" });
    expect(suspend).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Audit reason/i), {
      target: { value: "Requested by support" },
    });
    expect(suspend).toBeEnabled();
    fireEvent.click(suspend);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/admin/users/${USER_ID}`,
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            action: "suspend",
            reason: "Requested by support",
          }),
        }),
      );
    });
    expect(await screen.findByText(/Suspend account completed/)).toBeVisible();
  });
});
