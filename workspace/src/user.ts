/**
 * User Service
 * Implemented by Agent 2 (Builder), building on src/schemas.ts and src/auth.ts
 */
import { verifyToken } from "./auth";
import type { UserPayload } from "./schemas";

const VALID_ROLES: ReadonlyArray<UserPayload["role"]> = ["admin", "editor", "viewer"];

export interface User extends UserPayload {
  id: string;
  createdAt: string;
}

/** Returns true when the payload has a non-empty username and a known role. */
export function validateUserPayload(payload: UserPayload): boolean {
  return (
    typeof payload?.username === "string" &&
    payload.username.trim().length > 0 &&
    VALID_ROLES.includes(payload.role)
  );
}

/**
 * Creates a user record. Requires a valid auth token and a valid payload.
 * Throws on failure so callers cannot silently ignore a rejected request.
 */
export function createUser(token: string, payload: UserPayload): User {
  if (!verifyToken(token)) {
    throw new Error("Unauthorized: invalid or expired token");
  }
  if (!validateUserPayload(payload)) {
    throw new Error("Invalid user payload");
  }
  return {
    id: `usr_${Date.now().toString(36)}`,
    username: payload.username.trim(),
    role: payload.role,
    createdAt: new Date().toISOString(),
  };
}
