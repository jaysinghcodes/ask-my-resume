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

## 4. Preview deploys

Confirm preview deploys are on for pull requests. That is the default with the Git integration.

## 5. Banned terms for the knowledge base

The knowledge base build reads `KB_BANNED_TERMS`. The value is a comma separated list of terms that must not appear in a public field. Real client names belong in this list, not in the repo.

If the variable is missing or blank, the build prints a warning and still succeeds. Set it in all three places below so the check actually runs.

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

Shared server logic lives in the root `lib/` directory: `claude.js`, `tools.js`, `prompts.js`, `resume.js`, `config.js`, and `chat.js`. `api/chat.js` and `api/health.js` import it, and so do the Vitest tests.

It used to live in `mcp-server/lib/`. It moved to the repo root so the functions and the tests import one copy, without a second package, and so `mcp-server/` only keeps `resume.pdf` until a later ticket replaces that file. The tool use loop itself is the same logic, with two required changes from this ticket: `MODEL_ID` comes from the environment with no fallback model, and the loop stops after 5 tool rounds.

`api/chat.js` is the POST function. `api/health.js` is the GET function. Both are Node.js functions on Fluid compute with `maxDuration` of 60 seconds. The ticket asks for these two files, so they stay separate. The Vite app in `frontend/` is served as static files from the same project. The page calls `/api` on the same origin. There is no CORS middleware.

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
