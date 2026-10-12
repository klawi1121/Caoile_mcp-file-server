import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { Sandbox } from "../security/sandbox.js";
import { FileOpsService } from "./fileOps.js";

describe("FileOpsService Unit Tests", () => {
  const testRoot = path.resolve(process.cwd(), "test_fileops_workspace");
  let sandbox: Sandbox;
  let fileOps: FileOpsService;

  beforeEach(async () => {
    sandbox = new Sandbox(testRoot);
    fileOps = new FileOpsService(sandbox);
  });

  afterEach(async () => {
    try {
      await fs.rm(testRoot, { recursive: true, force: true });
    } catch {}
  });

  it("write_file and read_file should work properly", async () => {
    const writeRes = await fileOps.writeFile("docs/hello.txt", "Line 1\nLine 2\nLine 3");
    expect(writeRes.isError).toBeFalsy();

    const readRes = await fileOps.readFile("docs/hello.txt", 1, 2);
    expect(readRes.isError).toBeFalsy();
    expect(readRes.content[0].text).toContain("1: Line 1");
    expect(readRes.content[0].text).toContain("2: Line 2");
    expect(readRes.content[0].text).toContain("Truncated");
  });

  it("str_replace should replace target string safely", async () => {
    await fileOps.writeFile("config.json", '{"version": "1.0.0"}');
    const replaceRes = await fileOps.strReplace("config.json", '"1.0.0"', '"2.0.0"');
    expect(replaceRes.isError).toBeFalsy();

    const readRes = await fileOps.readFile("config.json");
    expect(readRes.content[0].text).toContain('"version": "2.0.0"');
  });

  it("delete_file should reject without explicit confirmation", async () => {
    await fileOps.writeFile("temp.txt", "deleteme");
    const unconfirmed = await fileOps.deleteFile("temp.txt", false);
    expect(unconfirmed.isError).toBe(true);

    const confirmed = await fileOps.deleteFile("temp.txt", true);
    expect(confirmed.isError).toBeFalsy();
    const exists = await sandbox.exists("temp.txt");
    expect(exists).toBe(false);
  });

  it("search_files should find target text across nested files", async () => {
    await fileOps.writeFile("src/app.ts", "const secretKey = 'my-token';");
    await fileOps.writeFile("src/utils.ts", "function helper() { return true; }");

    const searchRes = await fileOps.searchFiles("secretKey");
    expect(searchRes.isError).toBeFalsy();
    expect(searchRes.content[0].text).toContain("src/app.ts:1: const secretKey");
  });

  it("should enforce sandbox security on all file operations", async () => {
    const outsideWrite = await fileOps.writeFile("../outside.txt", "hack");
    expect(outsideWrite.isError).toBe(true);
    expect(outsideWrite.content[0].text).toContain("Path traversal blocked");
  });
});
