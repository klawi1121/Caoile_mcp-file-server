# Architectural & Engineering Decisions

## Decision Record

### ADR-001: Sandboxed Root Enforcement
- **Context**: File-server allows autonomous agents to modify files on host system.
- **Decision**: Resolve all paths strictly inside `WORKSPACE_ROOT`. Reject path traversal (`../`, `..\`, null bytes, drive roots).
- **Consequences**: Safe execution without danger of wiping host disk or reading sensitive host credentials.

### ADR-002: Line Chunking on File Reads
- **Context**: Autonomous agents often read whole 5000+ line files, blowing token windows.
- **Decision**: Default line caps at 200 lines, hard cap at 500 lines per tool call.
- **Consequences**: High agent efficiency score, reduced API costs.

### ADR-003: Structured Handoff Over In-Memory Chat History
- **Context**: Agent sessions have finite context windows; context degradation occurs over long conversations.
- **Decision**: Rely on physical markdown handoff files (`PROJECT_STATE`, `PLAN_LOG`, `CHECKPOINTS`, `DECISIONS`) stored in workspace.
- **Consequences**: Completely seamless cross-session persistence across different models and agents.
