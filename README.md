# Ask Jay, AI Resume Assistant

An AI chat interface that lets recruiters and hiring managers ask questions about Jay Singh's background. Claude answers from the resume through a tool use loop.

**[Live demo](https://jaysinghcodes.github.io/ask-my-resume)**

The live demo above is the current GitHub Pages site. This repo is set up as one Vercel Hobby project: the static frontend and `/api` on the same origin. Jay's dashboard steps are in [docs/SETUP.md](docs/SETUP.md). The Pages workflow stays until a later cutover.

## What is this?

Instead of a static resume PDF, anyone can ask about experience, skills, and role fit. Claude calls a `search_resume` tool and answers from the resume text.

## Architecture

The Vite app in `frontend/` builds to static files. `api/chat.js` (POST) and `api/health.js` (GET) are Node.js Vercel Functions on Fluid compute, with a 60 second max duration. They import the shared logic in `lib/`. The resume PDF stays at `mcp-server/resume.pdf`.

The page and the API share one origin. There is no CORS middleware and no separate API host.

## Local development

### Prerequisites

- Node.js 20 or newer
- An Anthropic API key and a Claude model id. See [docs/SETUP.md](docs/SETUP.md). The Anthropic workspace, key, and monthly spend limit come first.

### Install and check

```bash
git clone https://github.com/jaysinghcodes/ask-my-resume.git
cd ask-my-resume
npm install
npm install --prefix frontend
npm run lint
npm run typecheck
npm test
npm run build
```

### Run locally

Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY` and `MODEL_ID`.

`npx vercel dev` serves the Vite app and the functions together. The Vite dev server also proxies `/api` to `http://127.0.0.1:3000`, the default `vercel dev` port.

If `MODEL_ID` or `ANTHROPIC_API_KEY` is missing, the chat shows "Something went wrong getting that answer. Try again." and `/api/health` reports `configured: false`. Health does not call Claude.

## Deployment

Create the Vercel project from [docs/SETUP.md](docs/SETUP.md). Name it `ask-jay` in the same account as Cleat. Set `ANTHROPIC_API_KEY` and `MODEL_ID` for Production and Preview. `.github/workflows/deploy.yml` still publishes the frontend to GitHub Pages and is left in place on purpose.

## Project structure

- `api/chat.js` and `api/health.js`: Vercel Functions
- `lib/`: shared server logic (`claude.js`, `tools.js`, `prompts.js`, `resume.js`, `config.js`, `chat.js`)
- `frontend/`: Vite app
- `mcp-server/resume.pdf`: resume file kept until a later ticket
- `docs/SETUP.md`: Jay's Anthropic and Vercel steps
- `vercel.json`: build, output directory, Fluid compute, function duration, single page app fallback
- `.github/workflows/ci.yml`: lint, typecheck, test, and build on every pull request
- `.github/workflows/deploy.yml`: existing Pages deploy, unchanged

## How the tool loop works

The user asks a question. Claude may call `search_resume`. The function returns the resume text. Claude writes the answer. The loop allows at most 5 tool rounds, then it stops.

Built by [Jay Singh](https://linkedin.com/in/j-singh19). [GitHub](https://github.com/jaysinghcodes)
