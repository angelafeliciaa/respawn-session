import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { importSessions } from "../src/commands/import";
import { recordSession } from "../src/index-file";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "respawn-import-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("importSessions imports Claude and Codex transcripts by cwd git metadata", async () => {
  const indexPath = join(dir, "index.json");
  const claudePath = join(dir, "claude.jsonl");
  const codexPath = join(dir, "codex.jsonl");
  const created: string[] = [];

  await writeFile(claudePath, "claude transcript\n");
  await writeFile(codexPath, "codex transcript\n");

  const result = await importSessions({
    indexPath,
    listTranscripts: () => [
      {
        agent: "claude",
        path: claudePath,
        sessionId: "claude-session",
        cwd: "/repo/a",
        savedAt: "2026-05-20T10:00:00.000Z",
      },
      {
        agent: "codex",
        path: codexPath,
        sessionId: "codex-session",
        cwd: "/repo/b",
        relativePath: "2026/05/20/codex.jsonl",
        savedAt: "2026-05-20T11:00:00.000Z",
      },
    ],
    gitInfoForCwd: async (cwd) => ({
      repo: `repo:${cwd}`,
      branch: cwd.endsWith("/a") ? "branch-a" : "branch-b",
      sha: cwd.endsWith("/a") ? "aaa" : "bbb",
    }),
    createGist: async (path) => {
      created.push(path);
      return `gist:${path}`;
    },
  });

  expect(result).toMatchObject({ imported: 2, duplicates: 0, skipped: 0 });
  expect(created).toEqual([claudePath, codexPath]);
  expect(await readFile(indexPath, "utf8")).toContain("claude-session");
  expect(await readFile(indexPath, "utf8")).toContain("codex-session");
});

test("importSessions skips duplicate transcript hashes and non-git cwd", async () => {
  const indexPath = join(dir, "index.json");
  const duplicatePath = join(dir, "duplicate.jsonl");
  const nonGitPath = join(dir, "non-git.jsonl");
  await writeFile(duplicatePath, "same transcript\n");
  await writeFile(nonGitPath, "new transcript\n");

  await recordSession(indexPath, {
    repo: "repo:/repo/a",
    branch: "branch-a",
    gistUrl: "old-gist",
    sessionId: "old-session",
    sha: "aaa",
    agent: "claude",
    savedAt: "2026-05-20T09:00:00.000Z",
    transcriptHash:
      "89e2f0391747adcfd30585c42c0440b44c7f7c5a3588560839bb552b32e60cc4",
  });

  const result = await importSessions({
    indexPath,
    listTranscripts: () => [
      {
        agent: "claude",
        path: duplicatePath,
        sessionId: "duplicate-session",
        cwd: "/repo/a",
        savedAt: "2026-05-20T10:00:00.000Z",
      },
      {
        agent: "codex",
        path: nonGitPath,
        sessionId: "non-git-session",
        cwd: "/repo/non-git",
        savedAt: "2026-05-20T11:00:00.000Z",
      },
    ],
    gitInfoForCwd: async (cwd) =>
      cwd.includes("non-git")
        ? null
        : { repo: "repo:/repo/a", branch: "branch-a", sha: "aaa" },
    createGist: async () => {
      throw new Error("duplicate or non-git transcript should not upload");
    },
  });

  expect(result).toMatchObject({ imported: 0, duplicates: 1, skipped: 1 });
});

test("importSessions can backfill deleted worktrees for an explicit repo", async () => {
  const indexPath = join(dir, "index.json");
  const transcriptPath = join(dir, "orphan.jsonl");
  await writeFile(transcriptPath, "orphan transcript\n");

  const result = await importSessions({
    indexPath,
    repo: "internetbackyard/gnomos-app",
    listTranscripts: () => [
      {
        agent: "claude",
        path: transcriptPath,
        sessionId: "orphan-session",
        cwd: "/Users/angelafelicia/.superset/worktrees/gnomos-app/alpine-trade",
        branch: "feat/int-1194-tool-actor-context",
        savedAt: "2026-05-20T05:32:04.192Z",
      },
    ],
    gitInfoForCwd: async () => null,
    createGist: async () => "gist:orphan",
  });

  expect(result).toMatchObject({ imported: 1, duplicates: 0, skipped: 0 });
  const index = await readFile(indexPath, "utf8");
  expect(index).toContain("internetbackyard/gnomos-app");
  expect(index).toContain("feat/int-1194-tool-actor-context");
  expect(index).toContain("unknown");
});

test("importSessions reports a human summary", async () => {
  const result = await importSessions({
    indexPath: join(dir, "index.json"),
    listTranscripts: () => [],
  });

  expect(result.message).toBe("Imported 0 sessions, skipped 0 duplicates and 0 unavailable worktrees");
});
