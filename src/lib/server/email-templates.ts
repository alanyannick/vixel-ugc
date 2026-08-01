export type LifecycleEmailType =
  | "waitlist_confirmation"
  | "welcome"
  | "waitlist_approved"
  | "invitation"
  | "invitation_reminder";

export type LifecycleEmail = {
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character]!,
  );
}

function shell(input: {
  eyebrow: string;
  heading: string;
  body: string;
  actionLabel?: string;
  actionUrl?: string;
}): string {
  const action =
    input.actionLabel && input.actionUrl
      ? `<p style="margin:30px 0 0"><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;padding:13px 18px;border-radius:6px;background:#c7f43d;color:#11140b;font-weight:700;text-decoration:none">${escapeHtml(input.actionLabel)}</a></p>`
      : "";
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#090a08;color:#f3f0e8;font-family:Arial,sans-serif">
    <div style="max-width:600px;margin:0 auto;padding:40px 24px">
      <p style="margin:0 0 24px;color:#c7f43d;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase">${escapeHtml(input.eyebrow)}</p>
      <h1 style="margin:0;font-size:38px;line-height:1.05;letter-spacing:-.04em">${escapeHtml(input.heading)}</h1>
      <p style="margin:22px 0 0;color:#b3b8ae;font-size:16px;line-height:1.65">${escapeHtml(input.body)}</p>
      ${action}
      <p style="margin:42px 0 0;padding-top:18px;border-top:1px solid #2b2f27;color:#777d72;font-size:12px;line-height:1.6">Vixel Campaigns · AI Product-to-UGC Campaign Studio</p>
    </div>
  </body>
</html>`;
}

function name(payload: Record<string, unknown>): string {
  const value =
    typeof payload.displayName === "string"
      ? payload.displayName.trim()
      : "";
  return value ? ` ${value}` : "";
}

export function lifecycleEmail(
  type: LifecycleEmailType,
  payload: Record<string, unknown>,
  siteUrl: string,
): LifecycleEmail {
  const greeting = `Hi${name(payload)},`;
  switch (type) {
    case "waitlist_confirmation": {
      const body = `${greeting} your Vixel Campaigns beta request is recorded. We review access by product fit and expected production volume, and we’ll email you when the Campaign Studio is ready.`;
      return {
        subject: "You’re on the Vixel Campaigns beta list",
        text: body,
        html: shell({
          eyebrow: "Waitlist confirmed",
          heading: "Your place is recorded.",
          body,
          actionLabel: "See the product",
          actionUrl: siteUrl,
        }),
      };
    }
    case "welcome": {
      const body = `${greeting} your passwordless Vixel Campaigns account is ready. If your beta access is still pending, the Campaign Studio will open automatically after approval.`;
      return {
        subject: "Your Vixel Campaigns account is ready",
        text: body,
        html: shell({
          eyebrow: "Account ready",
          heading: "One account. No password.",
          body,
          actionLabel: "Check access",
          actionUrl: `${siteUrl}/studio`,
        }),
      };
    }
    case "waitlist_approved": {
      const body = `${greeting} your Vixel Campaigns beta request has been approved. An operator can now issue your Campaign Studio invitation.`;
      return {
        subject: "Your Vixel Campaigns beta access is approved",
        text: body,
        html: shell({
          eyebrow: "Beta approved",
          heading: "You’re through the first gate.",
          body,
        }),
      };
    }
    case "invitation": {
      const body = `${greeting} your Vixel Campaigns invitation is live. Sign in with this email to enter the Campaign Studio.`;
      return {
        subject: "Your Vixel Campaigns invitation",
        text: `${body}\n\n${siteUrl}/studio`,
        html: shell({
          eyebrow: "Studio invitation",
          heading: "The campaign room is open.",
          body,
          actionLabel: "Enter Studio",
          actionUrl: `${siteUrl}/studio`,
        }),
      };
    }
    case "invitation_reminder": {
      const body = `${greeting} a quick reminder that your Vixel Campaigns invitation is still available. Sign in with this email before the invitation window closes.`;
      return {
        subject: "Reminder: your Vixel Campaigns invitation is waiting",
        text: `${body}\n\n${siteUrl}/studio`,
        html: shell({
          eyebrow: "Invitation reminder",
          heading: "Your campaign room is waiting.",
          body,
          actionLabel: "Enter Studio",
          actionUrl: `${siteUrl}/studio`,
        }),
      };
    }
  }
}
