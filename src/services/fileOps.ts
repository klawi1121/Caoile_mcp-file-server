import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { Sandbox } from "../security/sandbox.js";

const execAsync = promisify(exec);

export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

function successResult(text: string): ToolResult {
  return {
    content: [{ type: "text", text }],
  };
}

function errorResult(message: string): ToolResult {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

export class FileOpsService {
  constructor(private sandbox: Sandbox) {}

  /**
   * 1. list_files: List files and directories within a relative workspace path
   */
  async listFiles(relPath: string = "", recursive: boolean = false): Promise<ToolResult> {
    try {
      const fullPath = this.sandbox.resolvePath(relPath || ".");
      const stat = await fs.stat(fullPath);

      if (!stat.isDirectory()) {
        return errorResult(`Path "${relPath}" is a file, not a directory.`);
      }

      const results: string[] = [];

      async function scanDir(currentDir: string, currentRel: string, currentDepth: number) {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const entryRel = currentRel ? `${currentRel}/${entry.name}` : entry.name;
          const isDir = entry.isDirectory();
          results.push(`${isDir ? "[DIR] " : "[FILE]"} ${entryRel}`);

          if (isDir && recursive && currentDepth < 5) {
            await scanDir(path.join(currentDir, entry.name), entryRel, currentDepth + 1);
          }
        }
      }

      await scanDir(fullPath, relPath === "." ? "" : relPath, 0);

      if (results.length === 0) {
        return successResult(`Directory "${relPath || "."}" is empty.`);
      }

      return successResult(`Directory listing for "${relPath || "."}":\n${results.join("\n")}`);
    } catch (err: any) {
      return errorResult(err.message);
    }
  }

  /**
   * 2. read_file: Read file with chunking / line-limit support to prevent context exhaustion
   */
  async readFile(relPath: string, startLine?: number, maxLines?: number): Promise<ToolResult> {
    try {
      const fullPath = this.sandbox.resolvePath(relPath);
      const rawContent = await fs.readFile(fullPath, "utf-8");
      const lines = rawContent.split(/\r?\n/);

      const start = Math.max(1, startLine || 1);
      const limit = Math.min(maxLines || 200, 500); // capped at 500 to protect token windows

      const startIndex = start - 1;
      const selected = lines.slice(startIndex, startIndex + limit);

      const numbered = selected.map((line, idx) => `${start + idx}: ${line}`).join("\n");
      const footer =
        lines.length > startIndex + limit
          ? `\n... [Truncated: showing lines ${start}-${start + selected.length - 1} of ${lines.length} total lines. Pass startLine=${start + selected.length} for more]`
          : `\n[End of file: ${lines.length} lines total]`;

      return successResult(`File: ${relPath} (Lines ${start}-${start + selected.length - 1}):\n${numbered}${footer}`);
    } catch (err: any) {
      return errorResult(err.message);
    }
  }

  /**
   * 3. write_file: Create or completely overwrite a file, automatically creating parent directories
   */
  async writeFile(relPath: string, content: string): Promise<ToolResult> {
    try {
      const fullPath = this.sandbox.resolvePath(relPath);
      const parentDir = path.dirname(fullPath);
      await fs.mkdir(parentDir, { recursive: true });
      await fs.writeFile(fullPath, content, "utf-8");
      return successResult(`Successfully written ${Buffer.byteLength(content, "utf-8")} bytes to "${relPath}".`);
    } catch (err: any) {
      return errorResult(err.message);
    }
  }

  /**
   * 4. str_replace: Exact surgical replacement inside a file
   */
  async strReplace(relPath: string, oldStr: string, newStr: string): Promise<ToolResult> {
    try {
      const fullPath = this.sandbox.resolvePath(relPath);
      const content = await fs.readFile(fullPath, "utf-8");

      if (!content.includes(oldStr)) {
        return errorResult(
          `Target substring to replace was not found in "${relPath}". Verify the exact character sequence.`
        );
      }

      // Check for multiple occurrences to prevent accidental multi-edits unless unique
      const matches = content.split(oldStr).length - 1;
      if (matches > 1) {
        return errorResult(
          `Target string found ${matches} times in "${relPath}". Please provide more surrounding context to make the match unique.`
        );
      }

      const updated = content.replace(oldStr, newStr);
      await fs.writeFile(fullPath, updated, "utf-8");
      return successResult(`Successfully replaced target string in "${relPath}".`);
    } catch (err: any) {
      return errorResult(err.message);
    }
  }

  /**
   * 5. delete_file: Delete a file or directory with explicit safety confirmation
   */
  async deleteFile(relPath: string, confirm: boolean): Promise<ToolResult> {
    try {
      if (!confirm) {
        return errorResult(
          `Destructive action denied: "confirm" parameter must be explicitly set to true to delete "${relPath}".`
        );
      }

      const fullPath = this.sandbox.resolvePath(relPath);
      const stat = await fs.stat(fullPath);

      if (stat.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true });
        return successResult(`Successfully deleted directory "${relPath}".`);
      } else {
        await fs.unlink(fullPath);
        return successResult(`Successfully deleted file "${relPath}".`);
      }
    } catch (err: any) {
      return errorResult(err.message);
    }
  }

  /**
   * 6. search_files: Regex or substring pattern search across sandboxed files
   */
  async searchFiles(query: string, relPath: string = "", maxMatches: number = 20): Promise<ToolResult> {
    try {
      const fullPath = this.sandbox.resolvePath(relPath || ".");
      const matches: string[] = [];

      async function searchDir(currentDir: string, currentRel: string, sandbox: Sandbox) {
        if (matches.length >= maxMatches) return;
        const entries = await fs.readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
          if (matches.length >= maxMatches) break;
          // Skip node_modules or .git directories if present
          if (entry.name === "node_modules" || entry.name === ".git") continue;

          const entryPath = path.join(currentDir, entry.name);
          const entryRel = currentRel ? `${currentRel}/${entry.name}` : entry.name;

          if (entry.isDirectory()) {
            await searchDir(entryPath, entryRel, sandbox);
          } else if (entry.isFile()) {
            try {
              const text = await fs.readFile(entryPath, "utf-8");
              const lines = text.split(/\r?\n/);
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes(query)) {
                  matches.push(`${entryRel}:${i + 1}: ${lines[i].trim()}`);
                  if (matches.length >= maxMatches) break;
                }
              }
            } catch {
              // Ignore binary or unreadable files
            }
          }
        }
      }

      await searchDir(fullPath, relPath === "." ? "" : relPath, this.sandbox);

      if (matches.length === 0) {
        return successResult(`No matches found for "${query}" in "${relPath || "."}".`);
      }

      return successResult(
        `Found ${matches.length} match(es) for "${query}":\n${matches.join("\n")}`
      );
    } catch (err: any) {
      return errorResult(err.message);
    }
  }

  /**
   * 7. git_status: Git-lite tool to check working tree state within sandbox
   */
  async gitStatus(): Promise<ToolResult> {
    try {
      const { stdout, stderr } = await execAsync("git status --short", {
        cwd: this.sandbox.rootPath,
      });
      const output = stdout.trim();
      return successResult(output ? `Git Status:\n${output}` : "Git working tree is clean.");
    } catch (err: any) {
      return errorResult(`Git status check failed: ${err.message}`);
    }
  }

  /**
   * 8. git_commit: Git-lite commit tool for checkpoints and version control
   */
  async gitCommit(message: string): Promise<ToolResult> {
    try {
      if (!message || message.trim().length === 0) {
        return errorResult("Commit message cannot be empty.");
      }

      await execAsync("git add -A", { cwd: this.sandbox.rootPath });
      const { stdout } = await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
        cwd: this.sandbox.rootPath,
      });

      return successResult(`Git commit successful:\n${stdout.trim()}`);
    } catch (err: any) {
      return errorResult(`Git commit failed: ${err.message}`);
    }
  }

  /**
   * 9. git_diff: Git-lite diff inspection for reviewing changes before committing
   */
  async gitDiff(): Promise<ToolResult> {
    try {
      const { stdout } = await execAsync("git diff", { cwd: this.sandbox.rootPath });
      return successResult(stdout.trim() ? `Git Diff:\n${stdout.trim()}` : "No unstaged changes.");
    } catch (err: any) {
      return errorResult(`Git diff check failed: ${err.message}`);
    }
  }
}
