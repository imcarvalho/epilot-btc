# Setup checklist

Accounts and one-off admin, in dependency order. Everything here is a human task — accounts, cards, credentials and consent screens are not the agent's to create. The agent runs `cdk bootstrap` and deploys once credentials exist.

Tick as you go, so the agent can tell what is already standing.

## AWS

- [x] Account created, Personal, Basic support plan
- [x] MFA on the root user; no root access keys
- [x] Zero spend budget with an email alert
- [x] IAM user `ines-cli`, `AdministratorAccess`, no console access
- [x] Access key created, CLI use case
- [x] `aws configure` — region `eu-central-1`, output `json`
- [ ] `aws sts get-caller-identity` returns the `ines-cli` ARN
- [ ] `npx cdk bootstrap aws://<ACCOUNT_ID>/eu-central-1`
- [ ] **At the end of the project:** delete the access key

Region is `eu-central-1` everywhere. The console's region selector is per-session and resets — a resource that "disappeared" is almost always in another region.

## GitHub

- [ ] Public repository created
- [ ] Skeleton pushed (`CLAUDE.md`, `docs/`, `src/lib/`)
- [ ] Confirm nothing secret is in the history — the repo is public from commit one

Blocks Amplify, which deploys from the repository.

## Amplify Hosting

- [ ] App connected to the GitHub repository (authorising the GitHub app is an interactive step)
- [ ] First deploy green, and the `*.amplifyapp.com` URL noted
- [ ] The Amplify compute role has an IAM policy for the DynamoDB table
- [ ] Environment variables wired to the CDK stack's outputs (table name, index names)

Do this early even with nothing to show. The deployed link is the deliverable most likely to fail, and the only one that cannot be recovered afterwards.

## Google sign-in

Needed before section 6 of the engineering spec, not before that.

- [ ] Google Cloud project created
- [ ] OAuth consent screen configured, scopes `openid` and `profile` only
- [ ] **App published, not left in Testing.** In Testing mode only listed test users can sign in, so a reviewer would be locked out with no explanation. Both scopes are non-sensitive, so publishing needs no verification review.
- [ ] OAuth client created; client ID and secret stored
- [ ] Redirect URI `http://localhost:3000/api/auth/callback/google`
- [ ] Redirect URI `https://<amplify-domain>/api/auth/callback/google` — needs the domain from the Amplify step, so this comes after it

## Secrets

Three parameters in SSM Parameter Store, never in the repository:

- [ ] `AUTH_SECRET` (`openssl rand -base64 32`)
- [ ] Google client ID
- [ ] Google client secret
- [ ] Cron shared secret for `POST /api/cron/resolve`

## Nothing needed

**Coinbase.** The spot, candles and ticker endpoints are public — no account, no API key, no auth. If you find yourself signing up, you are reading the docs for the authenticated API, which is a different product.

**A domain.** Amplify's URL is enough.

## Day one checks, before feature code

From engineering spec §2.1. Each one can invalidate work done after it:

- [ ] StyleX compiling, with a real Astryx component rendering and atomic CSS emitted — starting from Astryx's own Next.js StyleX example
- [ ] Infrastructure hello world deployed, and the Amplify role reaching DynamoDB
- [ ] Coinbase endpoints checked with `curl` for response shape **and CORS** — this decides whether chart data is fetched in the browser or served from `GET /api/history`, so it settles before that part of the frontend is written

## Delivery

- [ ] Public repository link
- [ ] Deployed link, reachable
- [ ] README covering the design, how to run it, how to deploy it
- [ ] Aiko's colleague in copy — confirm the address now rather than at send time
