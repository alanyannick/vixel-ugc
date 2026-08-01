## 1. Database and configuration

- [x] 1.1 Add pinned Supabase, Resend, Svix, and Stripe dependencies
- [x] 1.2 Create account, waitlist, campaign, email, billing, event, and audit migrations
- [x] 1.3 Apply paid-ledger and product migrations to the dedicated Supabase project
- [x] 1.4 Add typed server/public environment validation and readiness switches
- [x] 1.5 Verify database grants, indexes, replay constraints, and security advisors

## 2. Account access

- [x] 2.1 Extend application sessions with immutable user ID, email, status, and role
- [x] 2.2 Implement Turnstile-protected OTP request and Supabase OTP verification exchange
- [x] 2.3 Implement sign-out, current-account, pending, approved, and admin route gates
- [x] 2.4 Add account access unit and authorization tests

## 3. Waitlist and admin

- [x] 3.1 Implement normalized idempotent waitlist submission and consent storage
- [x] 3.2 Implement waitlist status, transition, invitation, note, and audit repositories
- [x] 3.3 Add protected admin list, detail, filter, transition, and invitation APIs
- [x] 3.4 Add pending-user and admin operator interfaces
- [x] 3.5 Add waitlist state-machine, duplicate, and non-admin tests
- [x] 3.6 Add unified user/access operations with suspend, restore, role-change,
      reason, audit, self-protection, and last-admin protection
- [x] 3.7 Add operator overview, product-owned growth funnel, readiness, and
      audit evidence without importing Growth OS execution surfaces

## 4. Email lifecycle

- [x] 4.1 Implement delivery ledger, deterministic keys, atomic claim, and bounded retry
- [x] 4.2 Add waitlist confirmation, welcome, invite, and reminder templates
- [x] 4.3 Add cron-safe lifecycle delivery and reminder endpoints
- [x] 4.4 Add verified Resend webhook replay and suppression handling
- [x] 4.5 Add email idempotency, cooldown, consent, and forged-webhook tests

## 5. Cloud campaigns and generation ownership

- [x] 5.1 Implement user-owned campaign list/create/update/delete repositories and APIs
- [x] 5.2 Add revision conflict handling and local recovery synchronization
- [x] 5.3 Bind paid-generation ledger ownership to authenticated account identity
- [x] 5.4 Add cross-user, stale-revision, and cross-device recovery tests

## 6. Subscription entitlements

- [x] 6.1 Implement Stripe customer creation/reuse and recurring Checkout
- [x] 6.2 Implement hosted billing portal
- [x] 6.3 Implement verified replay-safe Stripe webhook projection
- [x] 6.4 Add server-owned subscription entitlement before paid generation
- [x] 6.5 Add billing state UI and Checkout/webhook/entitlement tests
- [x] 6.6 Publish and verify the USD $39 monthly Founding Beta price contract
- [x] 6.7 Reject duplicate subscriptions and webhook entitlement from a
      different price or customer
- [x] 6.8 Isolate Stripe modes so Vercel Production requires live resources
      while Preview, Development, and non-Vercel local builds require test resources
- [x] 6.9 Revalidate the provider contract before webhook grants and revoke
      stale entitlement when a bound subscription degrades or drifts

## 7. Product entry

- [x] 7.1 Build persistent public navigation and first-viewport campaign composer
- [x] 7.2 Add format examples and safe intent carryover into waitlist/account onboarding
- [x] 7.3 Add login, OTP verification, waitlist, pricing, and account status surfaces
- [x] 7.4 Verify responsive layout, keyboard access, focus, contrast, and reduced motion
- [x] 7.5 Continue a successful waitlist request into same-email passwordless
      account setup and make Turnstile failures actionable and retryable

## 8. Provider and deployment setup

- [x] 8.1 Configure scoped Cloudflare Turnstile widget for `ugc.vixelai.com`
- [ ] 8.2 Configure Supabase custom SMTP, six-digit OTP, redirect allowlist,
      keys, and provider-level Turnstile CAPTCHA
- [ ] 8.3 Configure purpose-named Resend lifecycle key, webhook, sender, segment, and topic
- [x] 8.4 Configure Stripe recurring product/price and webhook endpoint
- [ ] 8.5 Configure Vercel Preview/Production environment variables and cron

## 9. Verification and release

- [x] 9.1 Pass lint, types, unit, integration, production build, and single-worker browser tests
- [ ] 9.2 Pass Preview waitlist, auth, admin, email, billing, and fail-closed generation smoke
- [ ] 9.3 Promote the verified commit to `main` and pass Production smoke
- [x] 9.4 Update runbooks, environment example, workspace canonical docs, and rollback notes
- [ ] 9.5 Enable paid generation only after authorized provider, ledger, recovery, and entitlement proofs
- [x] 9.6 Keep Google Auth disabled for private beta while documenting the
      single-identity/session boundary required before a future provider launch
