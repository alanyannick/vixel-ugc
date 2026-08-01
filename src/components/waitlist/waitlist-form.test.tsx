import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WaitlistForm } from "./waitlist-form";

describe("WaitlistForm onboarding", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    delete window.turnstile;
    document.getElementById("vixel-turnstile-script")?.remove();
  });

  it("blocks production submission until verified and offers same-email account setup", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site-key-test");
    const renderWidget = vi.fn().mockReturnValue("widget-1");
    window.turnstile = {
      render: renderWidget,
      remove: vi.fn(),
      reset: vi.fn(),
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 202 }),
    );

    render(<WaitlistForm />);

    const submit = screen.getByRole("button", { name: /join the private beta/i });
    expect(submit).toBeDisabled();

    act(() => renderWidget.mock.calls[0][1].callback("verified-token"));
    expect(submit).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "Creator@Example.com" },
    });
    fireEvent.click(submit);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      email: "Creator@Example.com",
      captchaToken: "verified-token",
    });

    const accountLink = await screen.findByRole("link", {
      name: /set up account or sign in/i,
    });
    expect(accountLink).toHaveAttribute("href", "/studio");
    expect(screen.getByText("creator@example.com")).toBeVisible();
  });
});
