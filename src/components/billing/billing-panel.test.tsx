import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BillingPanel } from "./billing-panel";

function billingStatusResponse(input: {
  status: string;
  customerConfigured: boolean;
  subscriptionConfigured: boolean;
  entitled?: boolean;
}) {
  return new Response(
    JSON.stringify({
      enabled: true,
      ready: true,
      state: {
        status: input.status,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        customerConfigured: input.customerConfigured,
        subscriptionConfigured: input.subscriptionConfigured,
        entitled: input.entitled ?? false,
      },
    }),
    { status: 200 },
  );
}

describe("BillingPanel", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("lets an abandoned checkout_pending customer start Checkout again", async () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "00000000-0000-4000-8000-000000000001",
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        billingStatusResponse({
          status: "checkout_pending",
          customerConfigured: true,
          subscriptionConfigured: false,
        }),
      )
      .mockImplementationOnce(() => new Promise<Response>(() => {}));

    render(<BillingPanel />);
    fireEvent.click(
      await screen.findByRole("button", { name: /Start subscription/i }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "/api/billing/checkout",
        expect.objectContaining({
          method: "POST",
          headers: {
            "x-idempotency-key":
              "00000000-0000-4000-8000-000000000001",
          },
        }),
      );
    });
  });

  it.each([
    ["past_due", true],
    ["active", false],
  ] as const)(
    "routes %s state to billing management even when subscriptionConfigured is %s",
    async (status, subscriptionConfigured) => {
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          billingStatusResponse({
            status,
            customerConfigured: true,
            subscriptionConfigured,
            entitled: status === "active",
          }),
        )
        .mockImplementationOnce(() => new Promise<Response>(() => {}));

      render(<BillingPanel compact />);
      fireEvent.click(
        await screen.findByRole("button", { name: /Manage billing/i }),
      );

      await waitFor(() => {
        expect(fetchMock).toHaveBeenNthCalledWith(
          2,
          "/api/billing/portal",
          expect.objectContaining({ method: "POST" }),
        );
      });
    },
  );
});
