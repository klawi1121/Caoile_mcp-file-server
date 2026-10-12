# Technical Report: Architecture, Tool Design Choices, and Security Trade-offs

**Author**: Caoile  
**Course & Project**: CS 3A / CS 3B Elective - Midterms PT 1: Build Your Own MCP File-Server Connector  
**Date**: October 2026  

---

## 1. Executive Summary

This project implements a sandboxed Model Context Protocol (MCP) file-server connector designed to provide persistent, multi-agent context across separate operational sessions. The server exposes 9 single-purpose tools via Streamable HTTP and Stdio transports, backed by strict path canonicalization, bearer token authentication, and a physical Markdown-driven handoff protocol (`PROJECT_STATE`, `PLAN_LOG`, `CHECKPOINTS`, `DECISIONS`).

---

## 2. Tech Stack Justification

| Layer | Selection | Justification & Alternatives Considered |
| :--- | :--- | :--- |
| **Runtime & SDK** | **Node.js (TypeScript) + `@modelcontextprotocol/sdk` (v1.32.1)** | Node.js provides native async I/O well suited for real-time streaming transports. TypeScript ensures compile-time type safety for complex JSON-RPC schemas. Python with FastMCP was considered, but TypeScript provides first-class compatibility with the official MCP reference implementation and Claude Desktop ecosystem. |
| **Transport** | **Streamable HTTP (`/mcp`) & Stdio** | Streamable HTTP represents the latest standard in the MCP specification, supporting both bidirectional SSE streaming and standard HTTP POST request-response flows. Stdio mode is provided concurrently to enable zero-network local execution via desktop agents. |
| **Input Validation** | **Zod (v3.24)** | Zod schemas are integrated directly into the `McpServer.tool()` API, providing automatic JSON-RPC error generation (`isError: true`) and strict type parsing before inputs touch internal file operation routines. |
| **Process Management** | **PM2 (`ecosystem.config.cjs`)** | PM2 ensures high availability, automatic restart upon unhandled crashes, memory capping (`300M`), and background daemonization on host servers. Systemd was evaluated but PM2 is cross-platform across Linux and Windows developer environments. |
| **Exposure / Tunnel** | **Cloudflare Tunnel (`cloudflared`) / ngrok** | Exposes the local HTTP server over HTTPS with minimal latency and automatic SSL termination without requiring static public IP allocations or router port forwarding. |

---

## 3. Tool Design Decisions & Agent Efficiency

The tool catalog was specifically architected around LLM efficiency and token window conservation, aligning with Rubric Criteria A and B:

1. **Chunked Reading (`read_file`)**:
   - *Problem*: Traditional MCP file servers return entire files, risking immediate context exhaustion if an agent inspects a 2,000-line file.
   - *Solution*: Implemented 1-indexed pagination (`startLine`, `maxLines`). The server defaults to 200 lines and hard-caps responses at 500 lines per call, appending continuation hints when truncation occurs.
2. **Surgical Mutation (`str_replace`)**:
   - *Problem*: Overwriting files with full content wastes tokens and increases the probability of accidental hallucinated regressions in untouched functions.
   - *Solution*: `str_replace` checks for exact character matches and guarantees uniqueness before applying changes.
3. **Safety Gated Deletion (`delete_file`)**:
   - *Problem*: Rogue or hallucinating agents can wipe directory structures without user intent.
   - *Solution*: Destructive operations require an explicit `confirm: true` parameter; unconfirmed requests are rejected cleanly with `isError: true`.
4. **Git-Lite Engine (`git_status`, `git_commit`, `git_diff`)**:
   - *Problem*: LLMs lack version control awareness, making rollbacks and multi-agent traceability difficult.
   - *Solution*: Native workspace Git operations allow Agent 2 to stage and commit checkpoint states (`CP-001`), recording exact commit hashes directly in `CHECKPOINTS.md`.

---

## 4. Security Architecture & Threat Analysis

### 4.1. Sandbox Path Traversal Defense
The file server implements a defensive canonicalization routine in `src/security/sandbox.ts`:
- Resolves all user inputs against the absolute `WORKSPACE_ROOT`.
- Sanitizes leading forward slashes and backward slashes.
- Null-byte detection prevents poison-null-byte string truncation vulnerabilities (`\0`).
- Case-normalized Windows path comparison guarantees that the resolved path strictly starts with the workspace root directory and separator.
- Unit tests (`src/security/sandbox.test.ts`) verify that traversal attacks (`../`, `..\..\Windows\System32`, absolute drive letters) throw explicit `SecurityError` exceptions.

### 4.2. Public Endpoint Authentication
When exposed through a public tunnel, the endpoint is vulnerable to unauthenticated discovery and manipulation:
- `authMiddleware` intercepts incoming `/mcp` requests.
- Validates the `Authorization: Bearer <token>` header or `X-API-Key` against the environment secret (`AUTH_TOKEN`).
- Unauthenticated requests receive HTTP 401 Unauthorized before any JSON-RPC parsing occurs.

### 4.3. Residual Risks & Future Hardening
- **Process Sandbox Boundary**: Currently, the server executes as the host process user. In high-security multi-tenant production, containerizing the runtime in Docker or Firecracker microVMs would prevent any memory-space vulnerabilities.
- **Symlink Attacks**: Future iterations could perform `fs.realpath` verification on existing files to block malicious symlink redirection.

---

## 5. Multi-Agent Handoff Protocol & Verification

The server was validated using a real multi-agent task execution simulating two separate agent roles with isolated contexts:

```
[Agent 1: Architect / Planner]
       │
       ├─► list_files() -> Inspects workspace structure
       ├─► read_file("PLAN_LOG.md") -> Analyzes project goals
       ├─► write_file("PLAN_LOG.md") -> Generates technical blueprint
       └─► write_file("PROJECT_STATE.md") -> Sets status to PLANNING_COMPLETED
       
   [Clean Session Handoff via Disk State]
       
[Agent 2: Builder / Software Engineer]
       │
       ├─► read_file("PROJECT_STATE.md") -> Reads handoff status & directives
       ├─► read_file("PLAN_LOG.md") -> Reads implementation blueprint
       ├─► write_file("src/auth.ts") -> Codes verifyToken()
       ├─► write_file("src/schemas.ts") -> Codes UserPayload schema
       ├─► str_replace("src/auth.ts") -> Applies surgical bugfix
       ├─► git_status() -> Checks working tree
       ├─► git_commit() -> Commits changes to workspace git repo
       └─► write_file("CHECKPOINTS.md") -> Appends CP-001 checkpoint log
```

Both JSON-RPC message logs and formatted Markdown transcripts (`DEMO_TRANSCRIPT.md`) were captured during execution, providing verifiable empirical evidence of zero looped calls, minimal token overhead, and successful handoff continuity.
