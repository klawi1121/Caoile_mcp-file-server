import { Request, Response, NextFunction } from "express";

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const configuredToken = process.env.AUTH_TOKEN;

  // If no auth token is configured, allow open traffic (e.g., local development)
  if (!configuredToken) {
    next();
    return;
  }

  // Check Authorization Bearer header or X-API-Key or query param ?token=
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers["x-api-key"];
  const queryToken = req.query.token as string | undefined;

  let providedToken: string | undefined;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    providedToken = authHeader.substring(7).trim();
  } else if (typeof apiKeyHeader === "string") {
    providedToken = apiKeyHeader.trim();
  } else if (queryToken) {
    providedToken = queryToken.trim();
  }

  if (!providedToken || providedToken !== configuredToken) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Missing or invalid authorization token for this MCP file-server endpoint",
    });
    return;
  }

  next();
}
