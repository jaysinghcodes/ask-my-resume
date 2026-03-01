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
- An [Anthropic API key](https://console.anthropic.com)

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

Open [http://localhost:5173](http://localhost:5173) — you're live!

---

## Deployment 

### Backend → Render
### Frontend → GitHub Pages

---

## Project Structure

```
ask-my-resume/
├── .github/
│   └── workflows/
│       └── deploy.yml                # Auto-deploys frontend on push to main
├── mcp-server/
│   ├── index.js                      # Express server setup + resume loading
│   ├── resume.pdf                    # Jay's resume (the AI's source of truth)
│   ├── package.json
│   ├── .env.example                  # Environment variable template
│   ├── lib/
│   │   ├── claude.js                 # Anthropic client + agentic loop
│   │   ├── config.js                 # Server configuration
│   │   ├── prompts.js                # System prompts for Claude
│   │   ├── resume.js                 # Resume PDF loading & caching
│   │   └── tools.js                  # MCP tool definitions (search_resume)
│   └── routes/
│       ├── chat.js                   # POST /chat endpoint
│       └── health.js                 # GET /health endpoint
└── frontend/
    ├── index.html
    ├── vite.config.js
    ├── package.json
    ├── .env.example
    ├── public/
    ├── src/
    │   ├── App.jsx                   # Main app with routing
    │   ├── main.jsx                  # React entry point
    │   ├── theme.js                  # MUI theme (beige + dark grey)
    │   ├── config/
    │   │   └── constants.js          # App-wide constants & config
    │   ├── components/
    │   │   ├── ChatHeader.jsx        # Chat page header with status
    │   │   ├── ChatInput.jsx         # Message input with auto-resize
    │   │   ├── EmptyState.jsx        # Initial state with suggested questions
    │   │   ├── Message.jsx           # Individual message bubble
    │   │   ├── MessageAvatar.jsx     # User/AI avatar component
    │   │   ├── MessagesList.jsx      # Messages container with typing indicator
    │   │   ├── NavDrawer.jsx         # Mobile-first navigation menu
    │   │   ├── TypingIndicator.jsx   # Animated dots while AI responds
    │   │   └── index.js              # Component exports
    │   └── pages/
    │       ├── ChatPage.jsx          # Main chat interface
    │       ├── AboutPage.jsx         # About the project & tech stack
    │       ├── ContactPage.jsx       # Contact & social links
    │       └── index.js              # Page exports
    └── README.md
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
