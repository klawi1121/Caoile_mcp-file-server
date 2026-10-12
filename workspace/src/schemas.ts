/**
 * Request Schemas
 * Implemented by Agent 2 (Builder)
 */
export interface UserPayload {
  username: string;
  role: "admin" | "editor" | "viewer";
}
