import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TurnstileWidget } from "./turnstile-widget";

const SCRIPT_ID = "vixel-turnstile-script";

function configureProductionWidget() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site-key-test");

  const renderWidget = vi.fn().mockReturnValue("widget-1");
  const remove = vi.fn();
  const reset = vi.fn();
  window.turnstile = { render: renderWidget, remove, reset };
  return { renderWidget, remove, reset };
}

describe("TurnstileWidget", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    delete window.turnstile;
    document.getElementById(SCRIPT_ID)?.remove();
  });

  it("publishes verified, expired, timeout, and retry states", () => {
    const { renderWidget, reset } = configureProductionWidget();
    const onToken = vi.fn();
    const onStateChange = vi.fn();

    render(
      <TurnstileWidget
        onStateChange={onStateChange}
        onToken={onToken}
      />,
    );

    const options = renderWidget.mock.calls[0][1];
    expect(screen.getByText("Complete the security check to continue.")).toBeVisible();
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ required: true, status: "ready", verified: false }),
    );

    act(() => options.callback("verified-token"));
    expect(onToken).toHaveBeenLastCalledWith("verified-token");
    expect(screen.getByText("Security check complete.")).toBeVisible();

    act(() => options["expired-callback"]());
    expect(onToken).toHaveBeenLastCalledWith("");
    expect(screen.getByText(/security check expired/i)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry security check" }));
    expect(reset).toHaveBeenCalledWith("widget-1");

    act(() => options["timeout-callback"]());
    expect(screen.getByText(/security check timed out/i)).toBeVisible();
  });

  it("shows Cloudflare error codes and lets the visitor retry", () => {
    const { renderWidget, reset } = configureProductionWidget();
    render(<TurnstileWidget onToken={vi.fn()} />);

    let handled = false;
    act(() => {
      handled = renderWidget.mock.calls[0][1]["error-callback"]("110200");
    });
    expect(handled).toBe(true);
    expect(screen.getByText(/not enabled for this domain/i)).toBeVisible();
    expect(screen.getByText("110200")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Retry security check" }));
    expect(reset).toHaveBeenCalledWith("widget-1");
  });

  it("makes a blocked or failed script visible and retryable", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site-key-test");
    const onToken = vi.fn();

    render(<TurnstileWidget onToken={onToken} />);

    const failedScript = document.getElementById(SCRIPT_ID);
    expect(failedScript).toBeInstanceOf(HTMLScriptElement);
    fireEvent.error(failedScript!);

    expect(screen.getByText(/could not load/i)).toBeVisible();
    expect(screen.getByText("script-load-failed")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry security check" }));

    expect(document.getElementById(SCRIPT_ID)).toBeInstanceOf(HTMLScriptElement);
    expect(document.getElementById(SCRIPT_ID)).not.toBe(failedScript);
    expect(onToken).toHaveBeenLastCalledWith("");
  });
});
