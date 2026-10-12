import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { Sandbox, SecurityError } from "./sandbox.js";

describe("Sandbox Path Security", () => {
  const testRoot = path.resolve(process.cwd(), "test_sandbox_workspace");
  const sandbox = new Sandbox(testRoot);

  it("should resolve valid paths within workspace", () => {
    const p1 = sandbox.resolvePath("index.js");
    expect(p1).toBe(path.join(testRoot, "index.js"));

    const p2 = sandbox.resolvePath("src/utils/helper.ts");
    expect(p2).toBe(path.join(testRoot, "src", "utils", "helper.ts"));
  });

  it("should strip leading slashes and keep inside workspace", () => {
    const p = sandbox.resolvePath("/nested/file.txt");
    expect(p).toBe(path.join(testRoot, "nested", "file.txt"));
  });

  it("should block parent directory traversal (../)", () => {
    expect(() => sandbox.resolvePath("../outside.txt")).toThrow(SecurityError);
    expect(() => sandbox.resolvePath("../../etc/passwd")).toThrow(SecurityError);
    expect(() => sandbox.resolvePath("dir/../../outside.txt")).toThrow(SecurityError);
  });

  it("should block Windows backslash traversal (..\\)", () => {
    expect(() => sandbox.resolvePath("..\\outside.txt")).toThrow(SecurityError);
    expect(() => sandbox.resolvePath("..\\..\\Windows\\System32")).toThrow(SecurityError);
  });

  it("should block absolute Windows drive paths", () => {
    expect(() => sandbox.resolvePath("C:\\Windows\\System32\\cmd.exe")).toThrow(SecurityError);
    expect(() => sandbox.resolvePath("D:\\Secret\\data.csv")).toThrow(SecurityError);
  });

  it("should block null byte injection", () => {
    expect(() => sandbox.resolvePath("file.txt\0.jpg")).toThrow(SecurityError);
  });
});
