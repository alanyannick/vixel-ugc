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
  const {
    canSignOut,
    sessionKind,
    signOut,
    signingOut,
    storageScope,
  } = useAccessGateSession();
  return (
    <>
      <button
        type="button"
        disabled={signingOut}
        onClick={() => void signOut()}
      >
        {canSignOut ? "Sign out" : "Planning mode"}
      </button>
      <output aria-label="Session storage scope">
        {sessionKind}:{storageScope}
      </output>
    </>
  );
}

describe("AccessGate session controls", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it("keeps email OTP as the only visible default sign-in path", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/auth/access",
      expect.anything(),
    );
  });

  it("shows an account error without falling back to recovery", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message: "Account status is temporarily unavailable.",
          },
        }),
        { status: 503 },
      ),
    );

    render(
      <AccessGate>
        <SessionProbe />
      </AccessGate>,
    );

    expect(
      await screen.findByText("Account status is temporarily unavailable."),
    ).toBeVisible();
    expect(screen.getByLabelText("Email")).toBeVisible();
    expect(screen.queryByLabelText("Operator recovery code")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    window.history.replaceState({}, "", "/studio?operator=recovery");
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

    const signOutButton = await screen.findByRole("button", {
      name: "Sign out",
    });
    expect(screen.getByLabelText("Session storage scope")).toHaveTextContent(
      "recovery:operator-recovery",
    );
    fireEvent.click(signOutButton);

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

  it("opens unprotected planning mode only through the dedicated recovery URL", async () => {
    window.history.replaceState({}, "", "/studio?operator=recovery");
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
    expect(screen.getByLabelText("Session storage scope")).toHaveTextContent(
      "none:planning",
    );
  });

  it("keeps an authenticated pending account outside Studio", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          authenticated: true,
          ready: true,
          account: {
            userId: "0f54f1be-129d-4adb-a731-6fd54cfc1bc1",
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
            userId: "0f54f1be-129d-4adb-a731-6fd54cfc1bc1",
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

    expect(await screen.findByLabelText("Session storage scope")).toHaveTextContent(
      "account:0f54f1be-129d-4adb-a731-6fd54cfc1bc1",
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
