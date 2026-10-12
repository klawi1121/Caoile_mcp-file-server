import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FileOpsService } from "./services/fileOps.js";

export function registerMcpTools(server: McpServer, fileOps: FileOpsService): void {
  // 1. list_files: Sandbox-aware directory listing
  server.tool(
    "list_files",
    "List files and directories within the sandboxed workspace. Path traversal is strictly prevented.",
    {
      path: z
        .string()
        .default("")
        .describe("Relative workspace directory path to list (e.g. '', 'src', 'docs'). Defaults to root."),
      recursive: z
        .boolean()
        .default(false)
        .describe("Set true to traverse subdirectories up to depth 5."),
    },
    async ({ path: relPath, recursive }) => {
      return await fileOps.listFiles(relPath, recursive);
    }
  );

  // 2. read_file: Chunked line reading to protect model token budgets
  server.tool(
    "read_file",
    "Read text from a sandboxed file. Supports 1-indexed start line and maxLines chunking to avoid token overflow.",
    {
      path: z.string().describe("Relative path of the target file to read."),
      startLine: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("1-indexed starting line number (default is 1)."),
      maxLines: z
        .number()
        .int()
        .positive()
        .max(500)
        .optional()
        .describe("Maximum lines to return (capped at 500 lines per call)."),
    },
    async ({ path: relPath, startLine, maxLines }) => {
      return await fileOps.readFile(relPath, startLine, maxLines);
    }
  );

  // 3. write_file: Safe full file creation with automatic directory generation
  server.tool(
    "write_file",
    "Create or overwrite a file in the workspace sandbox. Automatically creates parent directories if missing.",
    {
      path: z.string().describe("Relative path of the target file to write."),
      content: z.string().describe("Full text content of the file."),
    },
    async ({ path: relPath, content }) => {
      return await fileOps.writeFile(relPath, content);
    }
  );

  // 4. str_replace: Exact substring replacement for minimal token waste
  server.tool(
    "str_replace",
    "Surgically replace a unique target string inside an existing file without rewriting the whole file.",
    {
      path: z.string().describe("Relative path of the target file."),
      old_str: z.string().describe("Exact string to replace (must be unique within the file)."),
      new_str: z.string().describe("Replacement string."),
    },
    async ({ path: relPath, old_str, new_str }) => {
      return await fileOps.strReplace(relPath, old_str, new_str);
    }
  );

  // 5. delete_file: Destructive operation requiring explicit confirmation
  server.tool(
    "delete_file",
    "Delete a file or directory in the sandbox workspace. Requires explicit confirm=true flag for safety.",
    {
      path: z.string().describe("Relative path of the target file or directory to delete."),
      confirm: z.boolean().describe("Safety flag: must be explicitly true to authorize deletion."),
    },
    async ({ path: relPath, confirm }) => {
      return await fileOps.deleteFile(relPath, confirm);
    }
  );

  // 6. search_files: Fast search ignoring VCS and dependencies
  server.tool(
    "search_files",
    "Search for text queries or patterns across workspace files. Skips .git and node_modules.",
    {
      query: z.string().describe("Keyword or substring to search for."),
      path: z.string().default("").describe("Relative subdirectory to restrict the search in."),
      maxMatches: z
        .number()
        .int()
        .positive()
        .max(50)
        .default(20)
        .describe("Maximum matches to return (default 20, max 50)."),
    },
    async ({ query, path: relPath, maxMatches }) => {
      return await fileOps.searchFiles(query, relPath, maxMatches);
    }
  );

  // 7. git_status: Git-lite status check
  server.tool(
    "git_status",
    "Git-lite: View status of modified, staged, or untracked files in the sandboxed workspace git repository.",
    {},
    async () => {
      return await fileOps.gitStatus();
    }
  );

  // 8. git_commit: Git-lite commit tool for checkpoints
  server.tool(
    "git_commit",
    "Git-lite: Stage all changes and record a git commit within the sandboxed workspace repository.",
    {
      message: z.string().describe("Clear commit message describing changes made."),
    },
    async ({ message }) => {
      return await fileOps.gitCommit(message);
    }
  );

  // 9. git_diff: Git-lite diff tool
  server.tool(
    "git_diff",
    "Git-lite: Inspect unstaged changes before committing in the sandboxed repository.",
    {},
    async () => {
      return await fileOps.gitDiff();
    }
  );
}
