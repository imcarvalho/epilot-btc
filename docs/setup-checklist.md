# Setup checklist

**Live:** https://main.dalnijp0oanzq.amplifyapp.com/ · **Repo:** `imcarvalho/epilot-btc` (private until delivery)

Accounts and one-off admin, in dependency order. Everything here is a human task - accounts, cards, credentials and consent screens are not the agent's to create. The agent runs `cdk bootstrap` and deploys once credentials exist.

Tick as you go, so the agent can tell what is already standing.

## AWS

- [x] Account created, Personal, Basic support plan
- [x] MFA on the root user; no root access keys
- [x] Zero spend budget with an email alert
- [x] IAM user `ines-cli`, `AdministratorAccess`, no console access
- [x] Access key created, CLI use case
- [x] `aws configure` - region `eu-central-1`, output `json`
- [x] `aws sts get-caller-identity` returns the `ines-cli` ARN
- [x] `npx cdk bootstrap aws://<ACCOUNT_ID>/eu-central-1`
- [ ] **At the end of the project:** delete the access key

Region is `eu-central-1` everywhere. The console's region selector is per-session and resets - a resource that "disappeared" is almost always in another region.

## GitHub

Private while building, public at delivery. The brief asks for a public repository, and flipping visibility is one click - but it publishes the **whole history**, so treat every commit as if it were already public.

- [x] Private repository created - `imcarvalho/epilot-btc`
- [x] Skeleton committed and pushed (`CLAUDE.md`, `docs/`, `src/lib/`)
- [x] History scanned: no access keys, no private keys, no `.env` tracked
- [x] `.git/index.lock.stale-remove-me` deleted - harmless, does not block git, just clutter
- [ ] **At delivery:** switch the repository to public

Blocks Amplify, which deploys from the repository.

## Amplify Hosting

- [x] App connected to the GitHub repository
- [x] Next.js auto-detected, `npm run build` / `.next`, new service role created (that role is for CloudWatch SSR logs - it is **not** what grants the app access to DynamoDB)
- [x] First deploy green - https://main.dalnijp0oanzq.amplifyapp.com/ (app `dalnijp0oanzq`, `eu-central-1`)
- [x] The Amplify compute role (`epilot-btc-amplify-compute`) has `PlayersTableAccessPolicyArn` attached, and is set on the app
- [x] Environment variables set on the app: `PLAYERS_TABLE_NAME`, `PLAYERS_TABLE_REGION`, `CRON_SECRET` (index names are constants in code). `amplify.yml` copies them into `.env.production` so the SSR runtime sees them
- [x] App recreated in `eu-central-1`, next to the table. The first one had landed in `eu-north-1` by accident (the console's region selector)
- [x] Old `eu-north-1` app `d2wmdgm5qnm2sa` deleted, with its logging role and policy (`AmplifySSRLoggingRole-8dba662f-...`)

Do this as soon as there is something buildable - Amplify needs a `package.json` and a build command, so it comes after the Next scaffold, not before. Everything after that point should deploy on a push, because the deployed link is the deliverable most likely to fail and the only one that cannot be recovered afterwards.

## Google sign-in

Needed before section 6 of the engineering spec, not before that.

- [x] Google Cloud project created
- [x] OAuth consent screen configured, scope `openid` only (the UI never shows the Google name, so `profile` is not asked for - eng §6.2)
- [x] **App published, not left in Testing.** In Testing mode only listed test users can sign in, so a reviewer would be locked out with no explanation. The scope is non-sensitive, so publishing needs no verification review.
- [x] Brand verification skipped: it needs a domain registered to us and a privacy policy, and only adds the app's name and logo to the consent screen (README)
- [x] OAuth client created; client ID and secret stored
- [x] Redirect URI `http://localhost:3000/api/auth/callback/google`
- [x] Redirect URI `https://main.dalnijp0oanzq.amplifyapp.com/api/auth/callback/google`

## Secrets

Never in the repository. The auth values are Amplify app environment variables, copied into the runtime by `amplify.yml`; locally they live in `.env.local`, with a different `AUTH_SECRET`:

- [x] `AUTH_SECRET` (`openssl rand -base64 32`)
- [x] `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
- [x] `AUTH_URL` = `https://main.dalnijp0oanzq.amplifyapp.com` - behind Amplify's proxy the app sees itself as `localhost:3000`, and Auth.js would build its Google callback from that
- [x] Compute role allowed `dynamodb:DeleteItem`: the sign-in merge deletes the anonymous item it promotes. Verified: signed in on the deployed app, on the board, counter at 1
- [x] Cron shared secret for `POST /api/cron/resolve` - SecureString `/btc-guess/cron-secret` in `eu-central-1`, same value as `CRON_SECRET` on the Amplify app. Change one, change both
- [x] `cd infra && npx cdk deploy` for the sweep schedule and its Lambda - verified: runs every minute, settled an abandoned guess with no browser involved

## Nothing needed

**Coinbase.** The Exchange ticker, candles and WebSocket feed are public - no account, no API key, no auth. If you find yourself signing up, you are reading the docs for the authenticated API, which is a different product.

**A domain.** Amplify's URL is enough.

## Day one checks, before feature code

From engineering spec §2.1. Each one can invalidate work done after it:

- [x] StyleX compiling, with a real Astryx component rendering and atomic CSS emitted - starting from Astryx's own Next.js StyleX example
- [x] Infrastructure hello world deployed and serving
- [x] The app's compute role reaching DynamoDB - configured separately from the service role above
- [x] Coinbase CORS checked - `access-control-allow-origin: *` on both hosts, confirmed in the browser from the deployed origin. Moot since: the browser no longer calls Coinbase, the server does (eng §5)

## Delivery

- [ ] Public repository link
- [x] Deployed link, reachable - https://main.dalnijp0oanzq.amplifyapp.com/
- [x] README covering the design, how to run it, how to deploy it
- [ ] Aiko's colleague in copy - confirm the address now rather than at send time
