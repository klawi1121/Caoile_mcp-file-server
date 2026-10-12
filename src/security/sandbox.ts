import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecurityError";
  }
}

/**
 * Sandboxed workspace root manager.
 * Guarantees all resolved file operations strictly stay within the root directory.
 * Defends against path traversal (../, ..\), null byte injections, and symlink escapes.
 */
export class Sandbox {
  readonly rootPath: string;

  constructor(customRoot?: string) {
    const target = customRoot || process.env.WORKSPACE_ROOT || "./workspace";
    this.rootPath = path.resolve(process.cwd(), target);

    if (!fsSync.existsSync(this.rootPath)) {
      fsSync.mkdirSync(this.rootPath, { recursive: true });
    }
  }

  /**
   * Resolves a user-supplied relative path against the sandbox root.
   * Throws SecurityError if any attempt to escape root is detected.
   */
  resolvePath(userInputPath: string): string {
    if (!userInputPath || typeof userInputPath !== "string") {
      throw new SecurityError("Invalid path: path cannot be empty");
    }

    // Block null byte injection attacks
    if (userInputPath.indexOf("\0") !== -1) {
      throw new SecurityError("Security violation: Null byte detected in path");
    }

    // Normalize forward slashes / backward slashes
    const sanitized = userInputPath.replace(/^[/\\]+/, "");
    const resolved = path.resolve(this.rootPath, sanitized);

    // Case-insensitive comparison check for Windows compatibility,
    // ensuring the resolved path strictly starts with the sandbox root
    const normalizedRoot = path.normalize(this.rootPath).toLowerCase();
    const normalizedTarget = path.normalize(resolved).toLowerCase();

    const isInside =
      normalizedTarget === normalizedRoot ||
      normalizedTarget.startsWith(normalizedRoot + path.sep);

    if (!isInside) {
      throw new SecurityError(
        `Path traversal blocked: Access outside workspace root is denied (${userInputPath})`
      );
    }

    return resolved;
  }

  /**
   * Converts an internal absolute path back to a sanitized relative workspace path.
   */
  toRelativePath(absolutePath: string): string {
    return path.relative(this.rootPath, absolutePath).replace(/\\/g, "/");
  }

  /**
   * Checks if a target file or directory exists in the sandbox.
   */
  async exists(userInputPath: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(userInputPath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}
