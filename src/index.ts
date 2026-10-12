import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Sandbox } from "./security/sandbox.js";
import { FileOpsService } from "./services/fileOps.js";
import { registerMcpTools } from "./tools.js";
import { authMiddleware } from "./security/auth.js";

// Initialize Sandbox and Services
const sandbox = new Sandbox(process.env.WORKSPACE_ROOT);
const fileOps = new FileOpsService(sandbox);

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "caoile-mcp-file-server",
    version: "1.0.0",
  });

  registerMcpTools(server, fileOps);
  return server;
}

// Mode Detection: Stdio for local CLI tools or HTTP for Remote / Tunnel
const isStdio = process.argv.includes("--stdio");

if (isStdio) {
  const mcpServer = createMcpServer();
  const transport = new StdioServerTransport();
  mcpServer.connect(transport).catch((err) => {
    console.error("Stdio server failed:", err);
    process.exit(1);
  });
} else {
  // Streamable HTTP Transport (Official MCP Reference Choice)
  const app = express();
  const port = parseInt(process.env.PORT || "3000", 10);
  const host = process.env.HOST || "0.0.0.0";

  // Health check endpoint
  app.get("/health", (req, res) => {
    res.json({
      status: "healthy",
      service: "caoile-mcp-file-server",
      transport: "Streamable HTTP",
      sandboxRoot: sandbox.rootPath,
      timestamp: new Date().toISOString(),
    });
  });

  // Session map for multi-session support
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: McpServer }>();

  // Secure MCP Endpoint with Auth Middleware
  app.all("/mcp", authMiddleware, express.json(), async (req, res) => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      // If existing session, route to it
      if (sessionId && sessions.has(sessionId)) {
        const { transport } = sessions.get(sessionId)!;
        await transport.handleRequest(req, res, req.body);
        return;
      }

      // If initialization request or new session, spawn a fresh session transport + server
      const newSessionId = "sess-" + Math.random().toString(36).substring(2, 10);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
      });

      const server = createMcpServer();
      await server.connect(transport);

      sessions.set(newSessionId, { transport, server });

      transport.onclose = () => {
        sessions.delete(newSessionId);
      };

      await transport.handleRequest(req, res, req.body);
    } catch (err: any) {
      console.error("[MCP Request Error]:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal Server Error", message: err.message });
      }
    }
  });

  const server = app.listen(port, host, () => {
    console.log("=================================================");
    console.log(`🚀 Caoile MCP File Server running at http://${host}:${port}`);
    console.log(`🔒 Sandbox Root: ${sandbox.rootPath}`);
    console.log(`📡 Transport: Streamable HTTP (/mcp)`);
    if (process.env.AUTH_TOKEN) {
      console.log(`🔑 Auth Token Protected: Yes (header: Authorization: Bearer <token>)`);
    } else {
      console.log(`⚠️  Auth Token Protected: No (Open for local testing)`);
    }
    console.log("=================================================");
  });

  const shutdown = () => {
    console.log("\n[MCP] Shutting down gracefully...");
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
