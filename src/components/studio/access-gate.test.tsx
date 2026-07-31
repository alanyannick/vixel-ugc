import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
    cleanup();
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it("keeps email OTP as the only visible default sign-in path", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          authenticated: false,
          ready: true,
        }),
        { status: 200 },
      ),
    );

    render(
      <AccessGate>
        <SessionProbe />
      </AccessGate>,
    );

    expect(await screen.findByLabelText("Email")).toBeVisible();
    expect(screen.queryByText("Emergency operator access")).toBeNull();
    expect(screen.queryByText("Operator recovery access")).toBeNull();
  });

  it("shows emergency operator access only from the dedicated URL", async () => {
    window.history.replaceState({}, "", "/studio?operator=recovery");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            authenticated: false,
            ready: true,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            authenticated: false,
            required: true,
            configured: true,
          }),
          { status: 200 },
        ),
      );

    render(
      <AccessGate>
        <SessionProbe />
      </AccessGate>,
    );

    expect(await screen.findByLabelText("Operator recovery code")).toBeVisible();
    expect(screen.getByText("Emergency operator access.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Back to email sign-in" }),
    ).toBeVisible();
  });

  it("signs out through the recovery endpoint while retaining recovery guidance", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            authenticated: false,
            ready: false,
          }),
          { status: 200 },
        ),
      )
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
      expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/auth/access", {
        method: "DELETE",
      });
    });
    expect(
      await screen.findByText(/paid-job recovery identity stays on this browser/i),
    ).toBeVisible();
    expect(screen.getByLabelText("Operator recovery code")).toBeVisible();
  });

  it("does not expose sign-out controls in unprotected planning mode", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            authenticated: false,
            ready: false,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
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

  it("keeps an authenticated pending account outside Studio", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          authenticated: true,
          ready: true,
          account: {
            email: "pending@example.com",
            accountStatus: "pending",
          },
        }),
        { status: 200 },
      ),
    );

    render(
      <AccessGate>
        <SessionProbe />
      </AccessGate>,
    );

    expect(await screen.findByText("You’re on the list.")).toBeVisible();
    expect(screen.queryByText("Planning mode")).toBeNull();
  });

  it("opens Studio for an approved account and signs out the account cookie", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            authenticated: true,
            ready: true,
            account: {
              email: "approved@example.com",
              accountStatus: "approved",
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

    render(
      <AccessGate>
        <SessionProbe />
      </AccessGate>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/auth/session", {
        method: "DELETE",
      });
    });
    expect(await screen.findByLabelText("Email")).toBeVisible();
  });
});
