import { describe, expect, it } from "vitest";

import {
  normalizeWaitlistEmail,
  waitlistTransitionTarget,
  type WaitlistStatus,
} from "./waitlist";

describe("waitlist domain rules", () => {
  it("normalizes email as the canonical duplicate key", () => {
    expect(normalizeWaitlistEmail("  Creator+UGC@Example.COM ")).toBe(
      "creator+ugc@example.com",
    );
  });

  it("allows only explicit operator status transitions", () => {
    expect(waitlistTransitionTarget("pending", "approve")).toBe("approved");
    expect(waitlistTransitionTarget("approved", "invite")).toBe("invited");
    expect(waitlistTransitionTarget("invited", "revoke")).toBe("approved");
    expect(waitlistTransitionTarget("invited", "reject")).toBe("rejected");
  });

  it("rejects transitions that would resend or skip lifecycle gates", () => {
    const statuses: WaitlistStatus[] = [
      "pending",
      "approved",
      "invited",
      "rejected",
      "converted",
    ];
    expect(waitlistTransitionTarget("pending", "invite")).toBeNull();
    expect(waitlistTransitionTarget("invited", "invite")).toBeNull();
    expect(waitlistTransitionTarget("converted", "reject")).toBeNull();
    expect(
      statuses.filter(
        (status) => waitlistTransitionTarget(status, "approve") !== null,
      ),
    ).toEqual(["pending", "rejected"]);
  });
});
