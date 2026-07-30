# Vixel UGC product launch draft

Turn the current planning beta into an account-based, operator-controlled UGC
product without weakening the paid-media safety boundary.

## Product outcome

- Replace the private access-code gate with passwordless email OTP for real users.
- Let visitors join a waitlist from a high-conviction product entry surface.
- Give approved users a cloud account, persisted campaigns, plan history, media
  candidates, delivery receipts, usage/billing state, and account preferences.
- Give admins a protected operator surface for waitlist review, invitations,
  users, email lifecycle, usage, billing, generation jobs, and reconciliation.
- Add transactional email for OTP, welcome, waitlist confirmation, approval,
  and operational reminders. Product updates remain explicit opt-in.
- Add Stripe Checkout for a deliberately small paid beta offer after the user
  is approved. Keep fulfillment idempotent and server-owned.
- Preserve the existing exact-input approval, paid ledger, recovery, quota, and
  fail-closed generation semantics.

## Experience direction

Use the Higgsfield Marketing Studio product entry as a structural reference,
not a visual copy:

- persistent product navigation;
- one dominant campaign composer in the first viewport;
- format examples below the composer;
- login/sign-up and pricing visible without blocking product understanding;
- Vixel's existing black editorial surface, citron accent, source-grounding,
  and one-Director language remain canonical.

The public composer may collect a product URL/reference and campaign intent,
but it must never start paid work before authentication, approval, credits, and
the existing durable ledger gates succeed.

## Email boundary

Follow the `supabase-resend-email-auth-launch` skill at
`Vixel-AI/vixel-skill@52c8674`:

- Supabase Auth sends six-digit email OTP through Resend SMTP.
- Application-owned Resend API sends idempotent transactional lifecycle email.
- Product updates are optional, default-off, and projected from canonical
  application consent into a Resend Segment and Topic.
- Cloudflare Turnstile protects OTP requests in production.
- Suppression/bounce/complaint webhooks force product-update opt-out.

## Infrastructure boundary

- Dedicated Supabase project in `alanyannick's Org`, `us-east-1`.
- Tables are private or RLS-protected; automatic public table exposure is not
  relied upon.
- Browser uses only Supabase publishable configuration.
- Secret Supabase, Resend, Stripe, webhook, and database credentials are
  server-only Vercel variables.
- Cloudflare is used for Turnstile protection; the existing canonical domain
  remains `ugc.vixelai.com`.
- GitHub `main` is the only production source.

## Release sequencing

1. Provision database and apply migrations with live generation still off.
2. Implement auth, waitlist, cloud persistence, admin, email lifecycle, and
   billing behind explicit readiness flags.
3. Verify locally and in Preview.
4. Deploy Production with Stripe and live paid generation still fail-closed if
   their credentials or end-to-end proof are incomplete.
5. Enable paid generation only after an authorized image/video smoke and
   recovery/idempotency checks.

## Explicit non-goals

- No automatic marketing enrollment.
- No mass email send or scheduled broadcast from code.
- No social-network auto-publishing.
- No arbitrary plugin/code execution.
- No multi-user realtime collaboration in this launch.
- No reuse of another Vixel product database or Stripe customer ledger.
