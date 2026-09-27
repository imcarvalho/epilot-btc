# Setup checklist

**Live:** https://main.d2wmdgm5qnm2sa.amplifyapp.com/ · **Repo:** `imcarvalho/epilot-btc` (private until delivery)

Accounts and one-off admin, in dependency order. Everything here is a human task - accounts, cards, credentials and consent screens are not the agent's to create. The agent runs `cdk bootstrap` and deploys once credentials exist.

Tick as you go, so the agent can tell what is already standing.

## AWS

- [x] Account created, Personal, Basic support plan
- [x] MFA on the root user; no root access keys
- [x] Zero spend budget with an email alert
- [x] IAM user `ines-cli`, `AdministratorAccess`, no console access
- [x] Access key created, CLI use case
- [x] `aws configure` - region `eu-central-1`, output `json`
- [ ] `aws sts get-caller-identity` returns the `ines-cli` ARN
- [ ] `npx cdk bootstrap aws://<ACCOUNT_ID>/eu-central-1`
- [ ] **At the end of the project:** delete the access key

Region is `eu-central-1` everywhere. The console's region selector is per-session and resets - a resource that "disappeared" is almost always in another region.

## GitHub

Private while building, public at delivery. The brief asks for a public repository, and flipping visibility is one click - but it publishes the **whole history**, so treat every commit as if it were already public.

- [x] Private repository created - `imcarvalho/epilot-btc`
- [x] Skeleton committed and pushed (`CLAUDE.md`, `docs/`, `src/lib/`)
- [x] History scanned: no access keys, no private keys, no `.env` tracked
- [ ] `.git/index.lock.stale-remove-me` deleted - harmless, does not block git, just clutter
- [ ] **At delivery:** switch the repository to public

Blocks Amplify, which deploys from the repository.

## Amplify Hosting

- [x] App connected to the GitHub repository
- [x] Next.js auto-detected, `npm run build` / `.next`, new service role created (that role is for CloudWatch SSR logs - it is **not** what grants the app access to DynamoDB)
- [x] First deploy green - https://main.d2wmdgm5qnm2sa.amplifyapp.com/
- [ ] The Amplify compute role (`epilot-btc-amplify-compute`) has `PlayersTableAccessPolicyArn` attached - the role exists but has no policies yet
- [x] Environment variables set on the app: `PLAYERS_TABLE_NAME`, `PLAYERS_TABLE_REGION`, `CRON_SECRET` (index names are constants in code). `amplify.yml` copies them into `.env.production` so the SSR runtime sees them
- [ ] **Region mismatch:** the Amplify app is in `eu-north-1`, the table in `eu-central-1`. It works - the table region is explicit - but every request crosses regions. Decide whether to recreate the app in `eu-central-1`

Do this as soon as there is something buildable - Amplify needs a `package.json` and a build command, so it comes after the Next scaffold, not before. Everything after that point should deploy on a push, because the deployed link is the deliverable most likely to fail and the only one that cannot be recovered afterwards.

## Google sign-in

Needed before section 6 of the engineering spec, not before that.

- [ ] Google Cloud project created
- [ ] OAuth consent screen configured, scopes `openid` and `profile` only
- [ ] **App published, not left in Testing.** In Testing mode only listed test users can sign in, so a reviewer would be locked out with no explanation. Both scopes are non-sensitive, so publishing needs no verification review.
- [ ] OAuth client created; client ID and secret stored
- [ ] Redirect URI `http://localhost:3000/api/auth/callback/google`
- [ ] Redirect URI `https://main.d2wmdgm5qnm2sa.amplifyapp.com/api/auth/callback/google`

## Secrets

Three parameters in SSM Parameter Store, never in the repository:

- [ ] `AUTH_SECRET` (`openssl rand -base64 32`)
- [ ] Google client ID
- [ ] Google client secret
- [ ] Cron shared secret for `POST /api/cron/resolve`

## Nothing needed

**Coinbase.** The spot, candles and ticker endpoints are public - no account, no API key, no auth. If you find yourself signing up, you are reading the docs for the authenticated API, which is a different product.

**A domain.** Amplify's URL is enough.

## Day one checks, before feature code

From engineering spec §2.1. Each one can invalidate work done after it:

- [ ] StyleX compiling, with a real Astryx component rendering and atomic CSS emitted - starting from Astryx's own Next.js StyleX example
- [x] Infrastructure hello world deployed and serving
- [ ] The app's compute role reaching DynamoDB - configured separately from the service role above
- [x] Coinbase CORS checked - `access-control-allow-origin: *` on both hosts, confirmed in the browser from the deployed origin. Chart fetches client-side; no proxy route needed

## Delivery

- [ ] Public repository link
- [ ] Deployed link, reachable - https://main.d2wmdgm5qnm2sa.amplifyapp.com/
- [ ] README covering the design, how to run it, how to deploy it
- [ ] Aiko's colleague in copy - confirm the address now rather than at send time
