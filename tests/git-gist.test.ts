import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  checkoutBranch,
  currentBranch,
  currentRepo,
  currentSha,
} from "../src/git";
import {
  createGist,
  downloadGist,
  gistIdFromUrl,
} from "../src/storage/gist";
import type { RunCommand } from "../src/shell";
import { redactSecrets } from "../src/secrets";

test("git helpers shell out for repo branch sha and checkout", async () => {
  const calls: string[] = [];
  const run: RunCommand = async (cmd, args) => {
    calls.push([cmd, ...args].join(" "));
    if (args.includes("get-url")) return "git@github.com:angelafeliciaa/respawn-session.git\n";
    if (args.includes("--show-current")) return "angela/fix-bugs\n";
    if (args.includes("HEAD")) return "abc123\n";
    return "";
  };

  await expect(currentRepo(run)).resolves.toBe(
    "git@github.com:angelafeliciaa/respawn-session.git",
  );
  await expect(currentBranch(run)).resolves.toBe("angela/fix-bugs");
  await expect(currentSha(run)).resolves.toBe("abc123");
  await checkoutBranch("angela/fix-bugs", run);

  expect(calls).toEqual([
    "git remote get-url origin",
    "git branch --show-current",
    "git rev-parse HEAD",
    "git checkout angela/fix-bugs",
  ]);
});

test("gistIdFromUrl extracts ids from gist urls and raw ids", () => {
  expect(gistIdFromUrl("https://gist.github.com/angelafeliciaa/abcdef123456")).toBe(
    "abcdef123456",
  );
  expect(gistIdFromUrl("abcdef123456")).toBe("abcdef123456");
});

test("gist helpers create private gists and download raw content", async () => {
  const dir = await mkdtemp(join(tmpdir(), "respawn-gist-test-"));
  const transcriptPath = join(dir, "session.jsonl");
  const calls: string[] = [];
  await writeFile(transcriptPath, "transcript\n");

  const run: RunCommand = async (cmd, args) => {
    calls.push([cmd, ...args].join(" "));
    if (args.includes("create")) {
      return "https://gist.github.com/angelafeliciaa/abcdef123456\n";
    }
    return "transcript\n";
  };

  await expect(
    createGist(transcriptPath, "respawn: repo@branch", run),
  ).resolves.toBe("https://gist.github.com/angelafeliciaa/abcdef123456");
  await expect(downloadGist("https://gist.github.com/angelafeliciaa/abcdef123456", run)).resolves.toBe(
    "transcript\n",
  );

  expect(calls).toEqual([
    `gh gist create ${transcriptPath} --desc respawn: repo@branch`,
    "gh gist view abcdef123456 --raw",
  ]);
  await rm(dir, { recursive: true, force: true });
});

test("redactSecrets removes env-style and provider-looking secrets", () => {
  const providerToken = "sk-" + "test".repeat(12);
  const result = redactSecrets(
    [
      `OPENAI_API_KEY=${providerToken}`,
      `Authorization: Bearer ${"token".repeat(8)}`,
      "normal text stays",
    ].join("\n"),
  );

  expect(result.redactions).toBe(2);
  expect(result.content).not.toContain(providerToken);
  expect(result.content).not.toContain("tokentoken");
  expect(result.content).toContain("normal text stays");
});

test("createGist uploads a redacted temp copy when transcript has secrets", async () => {
  const dir = await mkdtemp(join(tmpdir(), "respawn-gist-test-"));
  const transcriptPath = join(dir, "session.jsonl");
  const providerToken = "sk-" + "test".repeat(12);
  const uploads: string[] = [];

  await writeFile(transcriptPath, `OPENAI_API_KEY=${providerToken}\n`);

  const run: RunCommand = async (_cmd, args) => {
    const uploadPath = args[2];
    uploads.push(uploadPath);
    const uploaded = await readFile(uploadPath, "utf8");
    expect(uploadPath).not.toBe(transcriptPath);
    expect(uploaded).not.toContain(providerToken);
    expect(uploaded).toContain("[REDACTED_SECRET]");
    return "https://gist.github.com/angelafeliciaa/redacted\n";
  };

  await expect(
    createGist(transcriptPath, "respawn: repo@branch", run),
  ).resolves.toBe("https://gist.github.com/angelafeliciaa/redacted");
  expect(uploads).toHaveLength(1);
  await rm(dir, { recursive: true, force: true });
});
