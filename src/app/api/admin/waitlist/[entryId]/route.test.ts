import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockWaitlistTransitionError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = "WaitlistTransitionError";
    }
  }
  return {
    authorizeAccount: vi.fn(),
    transitionWaitlist: vi.fn(),
    updateWaitlistNote: vi.fn(),
    WaitlistTransitionError: MockWaitlistTransitionError,
  };
});

vi.mock("@/lib/server/accounts", () => ({
  authorizeAccount: mocks.authorizeAccount,
}));

vi.mock("@/lib/server/waitlist", () => ({
  transitionWaitlist: mocks.transitionWaitlist,
  updateWaitlistNote: mocks.updateWaitlistNote,
  WaitlistTransitionError: mocks.WaitlistTransitionError,
}));

import { PATCH } from "./route";

const ACTOR_ID = "0f54f1be-129d-4adb-a731-6fd54cfc1bc1";
const ENTRY_ID = "1f54f1be-129d-4adb-a731-6fd54cfc1bc2";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizeAccount.mockResolvedValue({
    allowed: true,
    session: {},
    account: {
      userId: ACTOR_ID,
      email: "operator@example.com",
      accountStatus: "approved",
      appRole: "admin",
    },
  });
});

function request(body: unknown): Request {
  return new Request(
    `https://ugc.vixelai.com/api/admin/waitlist/${ENTRY_ID}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        origin: "https://ugc.vixelai.com",
        "x-request-id": "request-admission",
      },
      body: JSON.stringify(body),
    },
  );
}

describe("admin waitlist mutation route", () => {
  it("passes a transition reason into the transactional domain mutation", async () => {
    mocks.transitionWaitlist.mockResolvedValue({
      id: ENTRY_ID,
      status: "rejected",
    });

    const response = await PATCH(
      request({
        operation: "transition",
        action: "reject",
        reason: "Customer requested access removal",
      }),
      { params: Promise.resolve({ entryId: ENTRY_ID }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.transitionWaitlist).toHaveBeenCalledWith({
      entryId: ENTRY_ID,
      action: "reject",
      reason: "Customer requested access removal",
      actorUserId: ACTOR_ID,
      requestId: "request-admission",
    });
  });

  it("returns a non-retryable bad request for a missing linked-account reason", async () => {
    mocks.transitionWaitlist.mockRejectedValue(
      new mocks.WaitlistTransitionError(
        "invalid_reason",
        "A meaningful audit reason is required for an account-linked admission change.",
      ),
    );

    const response = await PATCH(
      request({ operation: "transition", action: "reject" }),
      { params: Promise.resolve({ entryId: ENTRY_ID }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "invalid_reason", retryable: false },
    });
  });

  it("returns forbidden when the transaction-time actor recheck fails", async () => {
    mocks.transitionWaitlist.mockRejectedValue(
      new mocks.WaitlistTransitionError(
        "actor_not_authorized",
        "The operator no longer has approved administrator access.",
      ),
    );

    const response = await PATCH(
      request({
        operation: "transition",
        action: "reject",
        reason: "Access policy changed",
      }),
      { params: Promise.resolve({ entryId: ENTRY_ID }) },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "actor_not_authorized", retryable: false },
    });
  });

  it("also returns forbidden when a note actor loses authority in flight", async () => {
    mocks.updateWaitlistNote.mockRejectedValue(
      new mocks.WaitlistTransitionError(
        "actor_not_authorized",
        "The operator no longer has approved administrator access.",
      ),
    );

    const response = await PATCH(
      request({ operation: "note", note: "Do not persist this note" }),
      { params: Promise.resolve({ entryId: ENTRY_ID }) },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "actor_not_authorized", retryable: false },
    });
  });
});
