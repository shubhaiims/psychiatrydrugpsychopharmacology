# Security Controls

## Layer 1: Application

Sensitive endpoints enforce shared IP request limits: 15 authentication requests
per 15 minutes, 30 billing requests per 5 minutes, and 180 other protected API
requests per minute. Vercel uses a Postgres atomic counter across function
instances; local development uses memory. Hosted requests fail closed with 503
when counters cannot be checked. A blocked request returns 429 and Retry-After.
Shared networks may reach these limits; review logs before changing thresholds.

Existing server-side session, administrator, membership, same-origin and CSRF
checks remain mandatory. Authentication bodies are limited to 16 KiB, normal
requests to 64 KiB, and admin drug/source uploads to 12 MiB. Payment verification
checks signatures, ownership, amounts, currency and captured status. External
Supabase and Razorpay calls time out after 15 seconds.

## Layer 2: Database and Platform

Browser roles cannot access drug/source tables directly. Access goes through
server membership and administrator checks. Payments, memberships, rate counters
and audit records are server-only. Database triggers log changes to drugs, sources,
admin assignments, payments and memberships without copying medical text or
credentials. Service-role changes have no end-user actor ID; these records prove
which records changed, not which individual administrator made a server call.

Vercel HTTPS, HSTS, CSP and frame protection remain enabled. Checkout alone allows
Razorpay scripts. Preview deployment authentication remains enabled. Weekly and
push/PR CI runs test/build and dependency vulnerability checks; Dependabot proposes
dependency and workflow updates. CI failures do not automatically prevent Vercel
Git deployments; configure branch protection/required checks in GitHub.

## Layer 3: Deployment Request Filter

Vercel routing middleware runs before normal route handling. It rejects private
configuration/repository/backend paths (including encoded probes), cross-site API
mutations, unsupported API methods, non-JSON mutation bodies and oversized declared
sensitive request bodies. It makes no database or payment-provider calls.
The local Node server applies the same filter for consistency.

Drug and notebook-source upload routes bypass middleware so its platform body
limit does not reduce their existing upload limits. Those routes retain layers
1 and 2. Static assets under /assets also bypass middleware to reduce compute.
Content-Length checks are early screening; layer 1 still checks actual body size.
This filter does not provide a new distributed network rate limiter or replace a
managed WAF. Custom WAF configuration could not be activated through the connected
Vercel API (configuration-not-found response); no custom firewall rules are claimed.

## Deployment

Apply the security_layers migration before deploying the app. Rate limiting fails
closed if that migration is absent. Do not grant browser roles EXECUTE on
consume_security_limit or grant_membership. Do not expose the private schema.

## Operations Requiring Account Access

- Rotate any Razorpay secret previously shared in chat in the Razorpay dashboard.
  Replace its Vercel environment value and redeploy; never commit it.
- Enable Supabase leaked-password protection if available on the current plan.
- Enable MFA for GitHub, Vercel, Supabase and Razorpay owner accounts.
- Configure GitHub required checks and review before merging Dependabot updates.
- Review rate-limit/server error logs and database audit records after releases.
- Verify backups and test restoration. Keep audit retention appropriate to the
  business; rate counters expire and are cleaned in bounded batches.

These controls reduce identified risks. They do not guarantee protection from
all future vulnerabilities or replace regular security reviews.
