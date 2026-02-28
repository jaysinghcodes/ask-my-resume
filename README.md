# Ask Jay — AI Resume Assistant

An AI-powered chat interface that lets recruiters and hiring managers ask questions about my background. Powered by **Claude AI** and an **MCP (Model Context Protocol) server** that grounds every answer in my actual resume.

**[🚀 Live Demo](https://jaysinghcodes.github.io/ask-my-resume)**

---

## What is this?

Instead of a static resume PDF, this project lets anyone have a real conversation about my experience:

> _"Does Jay have AWS experience?"_  
> _"Would he be a good fit for a full-stack role?"_  
> _"What's his most impressive project?"_

Claude uses an MCP tool to search my resume and give specific, grounded answers — not hallucinations.

## Architecture

```
resume.pdf
    ↓
MCP Server (Node.js/Express)   ← defines a "search_resume" tool
    ↑
Claude API (claude-sonnet)     ← calls the tool, forms responses
    ↑
React Frontend (Vite)          ← chat UI, hosted on GitHub Pages
```

**Tech used:** React, Vite, Node.js, Express, Anthropic SDK, MCP tool use, GitHub Actions, Render

---

## Local Development Setup

### Prerequisites
- [Node.js 20+](https://nodejs.org) installed
- An [Anthropic API key](https://console.anthropic.com) (free tier works)

### 1. Clone the repo
```bash
git clone https://github.com/jaysinghcodes/ask-my-resume.git
cd ask-my-resume
```

### 2. Start the MCP backend server

```bash
cd mcp-server
npm install
```

Create a `.env` file (copy from the example):
```bash
cp .env.example .env
```

Open `.env` and add your Anthropic API key:
```
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
```

Start the server:
```bash
npm start
```

You should see: `✅ Resume loaded successfully` and `🚀 MCP Server running on port 3001`

### 3. Start the React frontend

Open a **new terminal tab**:
```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) — you're live! 🎉

---

## Deployment (Free)

### Backend → Render

1. Go to [render.com](https://render.com) and sign up with GitHub
2. Click **New → Web Service** and connect this repo
3. Configure:
   - **Root Directory:** `mcp-server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment Variable:** `ANTHROPIC_API_KEY` = your key
4. Deploy — Render gives you a URL like `https://ask-my-resume-xxxx.onrender.com`

### Frontend → GitHub Pages

1. In your GitHub repo, go to **Settings → Secrets and variables → Actions**
2. Add a secret: `VITE_API_URL` = your Render URL from above
3. Go to **Settings → Pages** and set source to **GitHub Actions**
4. Push to `main` — the GitHub Action will build and deploy automatically

---

## Project Structure

```
ask-my-resume/
├── .github/
│   └── workflows/
│       └── deploy.yml        # Auto-deploys frontend on push to main
├── mcp-server/
│   ├── index.js              # Express server + MCP tool + Claude agentic loop
│   ├── resume.pdf            # My resume (the AI's source of truth)
│   ├── .env.example          # Environment variable template
│   └── package.json
└── frontend/
    ├── src/
    │   ├── App.jsx           # Chat UI + API calls
    │   └── main.jsx          # React entry point
    ├── index.html
    ├── vite.config.js
    ├── .env.example
    └── package.json
```

---

## How MCP Works Here

The MCP server exposes a single tool called `search_resume`. When a user asks a question, Claude decides whether to call this tool, executes it, gets the resume content back, and then formulates a response. This is the **agentic loop** pattern:

```
User asks question
     ↓
Claude sees it needs resume context
     ↓
Claude calls search_resume tool
     ↓
Server returns resume text
     ↓
Claude synthesizes final answer
     ↓
User gets grounded, specific response
```

---

Built by [Jay Singh](https://linkedin.com/in/j-singh19) · [GitHub](https://github.com/jaysinghcodes)
