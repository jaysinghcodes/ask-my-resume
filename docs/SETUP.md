# Ask Jay setup

Jay does these steps in the dashboards. Do the Anthropic step first, then Vercel. The repo does not create the Vercel project. There is nothing to link until these steps are done.

## 1. Anthropic workspace, key, and spend limit

Do this before the Vercel import. This is the real cost backstop. If Hobby use goes past the included allowance, Vercel pauses features until the 30 day window resets, so the Anthropic limit is what caps spend.

1. Open the Anthropic console.
2. Create a workspace named Ask Jay.
3. Create a new API key in that workspace.
4. Set a monthly spend limit on that workspace. Suggested limit: $10 a month. Raise it only if real traffic needs it.

## 2. Vercel project

1. In Vercel, use the same account as Cleat.
2. Import the GitHub repo `jaysinghcodes/ask-my-resume` as a new project.
3. Name the project `ask-jay`, so production is `ask-jay.vercel.app`. If that name is taken, pick the closest free name at import time and record the final URL on the pull request.
4. Leave the root directory as the repo root. `vercel.json` already sets the install command, the build command `npm run build`, the output directory `frontend/dist`, Fluid compute, a 60 second function duration, and the single page app fallback.
5. Deploy.

## 3. Environment variables

Set both variables for Production and for Preview.

- `ANTHROPIC_API_KEY`: the new Ask Jay key from step 1.
- `MODEL_ID`: the current Claude Sonnet model id. As of October 2026 that id is `claude-sonnet-5-5`.

`MODEL_ID` is required. The app has no hardcoded model. If either variable is missing, `/api/chat` returns a friendly error and `/api/health` returns `{ "status": "ok", "configured": false }`. When both are set, health returns `{ "status": "ok", "configured": true }`. Health never calls Claude.

`KB_BANNED_TERMS` is the comma separated list from section 5. It is not an API key. Set it locally, as a GitHub Actions secret, and as a Vercel environment variable.

`IP_HASH_SALT` is a long random string. Set it in Vercel for both Preview and Production. The chat function hashes visitor IPs with this salt and stores only the hash. If the salt is missing on Preview or Production, chat stays unavailable. The function logs why and does not hash or store an IP. Local development warns once and uses a temporary salt.

The cap variables in `.env.example` are optional. Empty values use the defaults: 12 messages of history, 8,000 characters per message, 30 questions per IP per day, 500 questions per day for the whole site, 1,024 output tokens, a 60 second request timeout, and 5 tool rounds. Sections 6 and 7 are the Jay setup for Redis and the firewall rule.

## 4. Preview deploys

Confirm preview deploys are on for pull requests. That is the default with the Git integration.

## 5. Banned terms for the knowledge base

The knowledge base build reads `KB_BANNED_TERMS`. The value is a comma separated list of terms that must not appear in a public field. Real client names belong in this list, not in the repo.

If the variable is missing, blank, or still the `.env.example` placeholder, the build prints a warning and still succeeds. Set it in all three places below so the check actually runs.

`kb/kb.json` records `meta.built_at` as the UTC calendar date of the build.

### Local

1. Copy `.env.example` to `.env` if you have not already.
2. Replace the placeholder on `KB_BANNED_TERMS` with your comma separated list.
3. `npm run kb:build` loads `.env` when the variable is not already set in the shell.
4. `npm run build` runs the knowledge base build before the Vite build.

### GitHub Actions

1. Open the repository on GitHub.
2. Open Settings, then Secrets and variables, then Actions.
3. Choose New repository secret.
4. Name it `KB_BANNED_TERMS`.
5. Paste the same comma separated list.
6. Save the secret.

`.github/workflows/ci.yml` passes this secret into the build. A missing secret warns and does not fail the build.

### Vercel

1. Open the Vercel project from step 2.
2. Open Settings, then Environment Variables.
3. Add `KB_BANNED_TERMS` for Production and for Preview.
4. Use the same comma separated list.
5. Redeploy so the build sees the variable.

## Where shared logic lives

Shared server logic lives in the root `lib/` directory: `claude.js`, `tools.js`, `prompts.js`, `sources.js`, `kb-data.js`, `docs-index.js`, `jd-fit.js`, `config.js`, `chat.js`, `limits.js`, and `kb-build.js`. `api/chat.js` and `api/health.js` import it, and so do the Vitest tests.

`npm run kb:build` writes `kb/kb.json` and the MiniSearch doc index `kb/docs-index.json`. Both are generated, gitignored, and bundled into the chat function through `includeFiles` in `vercel.json`.

It used to live in `mcp-server/lib/`. It moved to the repo root so the functions and the tests import one copy, without a second package. The phone free resume PDF is `frontend/public/Jay-Singh-Resume-Oct-2026.pdf`. The page links it for download; the chat answers from the knowledge base, not the PDF. The tool use loop itself is the same logic, with two required changes from this ticket: `MODEL_ID` comes from the environment with no fallback model, and the loop stops after 5 tool rounds.

`api/chat.js` is the POST function. `api/health.js` is the GET function. Both are Node.js functions on Fluid compute with `maxDuration` of 60 seconds. The ticket asks for these two files, so they stay separate. The Vite app in `frontend/` is served as static files from the same project. The page calls `/api` on the same origin. There is no CORS middleware.

## Chat API request contract

`POST /api/chat` takes a JSON body with these fields and nothing else. Any other top level field is rejected.

| Field | Required | Rule |
| --- | --- | --- |
| `messages` | yes | 1 to 12 messages (`CHAT_MAX_HISTORY`), each exactly `{ "role": "user" or "assistant", "content": "..." }`. Content is a non empty string of at most 8000 characters (`CHAT_MAX_MESSAGE_CHARS`). |
| `mode` | no | Only `"jd_fit"`, for a pasted job description. The answer comes back in the Strong matches, Partial matches and Closest experience sections. |
| `scope` | no | Exactly `{ "type": "role" or "project", "id": "..." }`. The id must be a public role or project id in `kb/kb.json`, and its type must match: a role id with `"role"`, a project id with `"project"`. |

`mode` and `scope` are never allowed together.

Errors come back as one SSE `error` event:

1. A malformed body, an unknown field, another mode, a scope that is not a real role or project of that type, or `mode` with `scope` returns HTTP 400 with code `invalid`.
2. Too many messages, or a message over 8000 characters (a long job description included), returns HTTP 400 with code `too_long` and the T2 length text.
3. A foreign Origin returns HTTP 403 with `{"code":"forbidden"}`.

A good request streams `status`, `delta`, `sources` and `done` events. Each `[record id]` cite in the answer becomes one `sources` entry, `{ "id", "label", "href" }`, in first cite order. A cite to an id that is not a public record is dropped from `sources` and stripped from the streamed text. With a `scope`, so is a cite outside that scope: a role scope allows the role, its bullets, and skills or achievements evidenced by them; a project scope allows the project, its doc chunks, and skills or achievements evidenced by it. A JD fit answer is checked before it is sent and arrives as one `delta`. If nothing cited is left after the filter, the stream still ends with status 200: no `delta`, `sources` with an empty list, then `done`.

The dev server in `frontend/vite.config.js` proxies `/api` to `http://127.0.0.1:3000`. `npx vercel dev` serves the Vite app and the functions together on that port.

## Hobby limits that matter

This project stays on the free Hobby plan.

- Personal use only. Do not sell anything through the site.
- The functions in this repo cap themselves at 60 seconds. Hobby allows up to 300 seconds.
- Memory and CPU on Hobby are 2 GB and 1 vCPU.
- The request body limit is 4.5 MB.
- If use goes past the included Hobby allowance, features pause until the 30 day window resets.

The page is static, so the first paint does not wait on the function.

## Local check

```bash
npm install
npm install --prefix frontend
npm run lint
npm run typecheck
npm test
npm run build
```

Copy `.env.example` to `.env` and fill in `ANTHROPIC_API_KEY`, `MODEL_ID`, and `KB_BANNED_TERMS` before `npx vercel dev`. Section 5 explains the banned terms list.

## 6. Upstash Redis

Counters for the per IP daily cap and the site daily cap live in Upstash Redis on the free tier. Function instances do not share memory, so the counters have to live outside the function. If neither the Upstash REST pair nor the KV REST pair is set, the function falls back to in memory counters and logs that once. That fallback is for local development and tests. Production and Preview need Redis, or the caps reset whenever a new instance starts. With Redis, the per IP cap and the site cap reset at midnight UTC.

The function stores an IP only as a salted hash. The key expires after 24 hours. Set `IP_HASH_SALT` in Vercel for both Preview and Production. Do not commit the salt. If the salt is missing on Preview or Production, chat stays unavailable. The function logs one line that says why, and it does not hash or store an IP. Local development warns once and uses a temporary salt.

### Jay setup

1. Open the Vercel project from step 2.
2. Open the Marketplace.
3. Add Upstash for Redis on the free tier.
4. Connect it to this project.
5. Include Production and Preview.
6. The integration may write `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, or `KV_REST_API_URL` and `KV_REST_API_TOKEN`. The function reads the Upstash pair first, then the KV pair. Leave those values in Vercel. Do not copy them into the repo.
7. Redeploy so the function can read them.

## 7. Firewall rate limit

Vercel Hobby allows one rate limit rule. Use it on `/api/chat`. This is separate from the Anthropic monthly spend limit in section 1, which remains the spend backstop.

### Jay setup

1. Open the Vercel project from step 2.
2. Open Firewall.
3. Add one rate limit rule.
4. Match the path `/api/chat`.
5. Allow 20 requests per 10 minutes per IP.
6. Use a fixed window.
7. Keep the Default action, which returns 429. The page shows the rate limited text for that response. A deny action returns 403, and the page would not show that text.

The function still enforces its own caps after the firewall: 30 questions per IP per day, and 500 questions per day for the whole site. Change those with `CHAT_PER_IP_DAILY` and `CHAT_SITE_DAILY` if you need to. The defaults are in `.env.example`.

## 8. Cutover

Issue 13 moves the live site from GitHub Pages to Vercel. Before that cutover, set `IP_HASH_SALT` in Vercel for both Preview and Production. Chat stays unavailable on either environment until the salt is set.
