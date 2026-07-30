import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccessGate, useAccessGateSession } from "./access-gate";

function SessionProbe() {
  const { canSignOut, signOut, signingOut } = useAccessGateSession();
  return (
    <button
      type="button"
      disabled={signingOut}
      onClick={() => void signOut()}
    >
      {canSignOut ? "Sign out" : "Planning mode"}
    </button>
  );
}

describe("AccessGate session controls", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("signs out through the session endpoint while retaining recovery guidance", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            authenticated: true,
            required: true,
            configured: true,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            authenticated: false,
          }),
          { status: 200 },
        ),
      );

    render(
      <AccessGate>
        <SessionProbe />
      </AccessGate>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/auth/access", {
        method: "DELETE",
      });
    });
    expect(
      await screen.findByText(/paid-job recovery identity stays on this browser/i),
    ).toBeVisible();
    expect(screen.getByLabelText("Access code")).toBeVisible();
  });

  it("does not expose sign-out controls in unprotected planning mode", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          authenticated: true,
          required: false,
          configured: false,
        }),
        { status: 200 },
      ),
    );

    render(
      <AccessGate>
        <SessionProbe />
      </AccessGate>,
    );

    expect(await screen.findByText("Planning mode")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });
});
