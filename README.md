# Caoile MCP File-Server Connector

> **CS 3A / CS 3B Elective - Midterms PT 1: Build Your Own**  
> Sandboxed MCP File-Server Connector with Multi-Agent Session Handoff Protocol & Git-Lite Engine.

---

## 🎯 Architecture & Features Overview

- **Runtime & SDK**: Node.js (v24+) with the official TypeScript `@modelcontextprotocol/sdk` (v1.32.1).
- **Transport**: **Streamable HTTP** (`/mcp` endpoint) with stateful session management, plus `--stdio` mode for CLI tools.
- **Sandboxing**: Canonical path validation prevents any directory traversal attempts (`../`, `..\`, null bytes, drive escapes).
- **Auth Guard**: Bearer token authentication middleware protects public endpoints exposed via tunnel.
- **Tools**: 9 robust, single-purpose MCP tools with strict Zod validation schemas.
- **Handoff Protocol**: Built-in physical markdown protocol files (`PROJECT_STATE.md`, `PLAN_LOG.md`, `CHECKPOINTS.md`, `DECISIONS.md`) for persistent multi-agent workflows.

---

## 🛠️ Tool Catalog (9 Implemented Tools)

| Tool Name | Parameters | Description |
| :--- | :--- | :--- |
| `list_files` | `path` (str), `recursive` (bool) | Lists files within the sandboxed workspace. Enforces root boundary. |
| `read_file` | `path` (str), `startLine` (int), `maxLines` (int) | Reads content with 1-indexed line chunking to prevent token budget blowouts. |
| `write_file` | `path` (str), `content` (str) | Creates or replaces a file in the workspace. Auto-creates directories. |
| `str_replace` | `path` (str), `old_str` (str), `new_str` (str) | Surgically replaces a unique substring inside an existing file. |
| `delete_file` | `path` (str), `confirm` (bool) | Destructively deletes a file/directory. Requires explicit `confirm: true`. |
| `search_files` | `query` (str), `path` (str), `maxMatches` (int) | Fast text/regex search across workspace files. Skips `.git` and `node_modules`. |
| `git_status` | *(none)* | Git-lite: Inspects modified and untracked files in sandbox git repo. |
| `git_commit` | `message` (str) | Git-lite: Stages all workspace changes and creates a checkpoint commit. |
| `git_diff` | *(none)* | Git-lite: Views unstaged diffs before committing. |

---

## 🚀 Setup & Reproduction Instructions

### 1. Prerequisites
- Node.js >= 18.0.0
- Git

### 2. Installation
```bash
git clone https://github.com/klawi1121/Caoile_mcp-file-server.git
cd Caoile_mcp-file-server
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Default parameters in `.env`:
```env
PORT=3000
HOST=0.0.0.0
WORKSPACE_ROOT=./workspace
AUTH_TOKEN=caoile-secret-token-2026
```

### 4. Build and Run Tests
Run automated unit tests verifying the sandbox defenses and file ops:
```bash
npm run build
npm test
```

### 5. Running the MCP Server

#### Option A: Development / Direct Node Run
```bash
npm start
```
Server starts on `http://localhost:3000/mcp`.

#### Option B: Process Manager (PM2)
```bash
# Install PM2 if not yet globally installed
npm install -g pm2

# Start server managed by PM2
pm2 start ecosystem.config.cjs

# Check logs and status
pm2 status
pm2 logs caoile-mcp-server
```

---

## 🌐 Public Tunnel Setup (Cloudflare / ngrok)

To serve over HTTPS through a secure tunnel:

### Using Cloudflare Tunnel:
```bash
# Run quick tunnel (no account required)
cloudflared tunnel --url http://localhost:3000
```
This generates a public URL like `https://example-subdomain.trycloudflare.com`.

### Using ngrok:
```bash
ngrok http 3000
```

---

## 🤖 Connecting to Claude Desktop / MCP Clients

Add the configuration into your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "caoile-file-server": {
      "command": "node",
      "args": [
        "C:/Users/almen/Documents/caoile/Caoile_mcp-file-server/dist/index.js",
        "--stdio"
      ],
      "env": {
        "WORKSPACE_ROOT": "C:/Users/almen/Documents/caoile/Caoile_mcp-file-server/workspace"
      }
    }
  }
}
```

Or connect via HTTP / Remote MCP URL:
- **Endpoint**: `https://<your-tunnel-url>/mcp`
- **Header**: `Authorization: Bearer caoile-secret-token-2026`

---

## 🧪 Multi-Agent Proof of Execution

To automatically run and verify the multi-session task across Agent 1 (Architect) and Agent 2 (Builder):

```bash
# 1. Ensure server is running on port 3000 (npm start)
# 2. Run simulation in another terminal:
npx tsx src/simulation/runDemo.ts
```

This execution generates:
- `DEMO_TRANSCRIPT.json`: Machine-readable raw tool calls and server responses.
- `DEMO_TRANSCRIPT.md`: Formatted step-by-step transcript with timestamps.
- Checkpoint commit in `workspace/.git`.

---

## 📂 Repository Structure

```
Caoile_mcp-file-server/
├── src/
│   ├── index.ts                # Server entrypoint (HTTP + Stdio)
│   ├── tools.ts                # 9 Tool schemas and handlers
│   ├── security/
│   │   ├── sandbox.ts          # Path canonicalization & traversal block
│   │   ├── sandbox.test.ts     # Path traversal unit tests
│   │   └── auth.ts             # Bearer token authentication middleware
│   ├── services/
│   │   ├── fileOps.ts          # File, search, and git operations
│   │   └── fileOps.test.ts     # Service unit tests
│   └── simulation/
│       └── runDemo.ts          # Multi-agent simulation runner
├── workspace/                  # Sandboxed directory (Root for agents)
│   ├── PROJECT_STATE.md        # Session handoff state
│   ├── PLAN_LOG.md             # Execution objectives & blueprint
│   ├── CHECKPOINTS.md          # Git commit checkpoint logs
│   └── DECISIONS.md            # Architecture decision records
├── DEMO_TRANSCRIPT.md          # Multi-agent execution transcript
├── DEMO_TRANSCRIPT.json        # Raw transcript evidence
├── TECHNICAL_REPORT.md         # Architecture, design choices & security report
├── ecosystem.config.cjs        # PM2 process manager config
├── package.json
└── tsconfig.json
```