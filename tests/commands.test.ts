import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { recordSession } from "../src/index-file";
import { saveSession } from "../src/commands/save";
import { resumeSession } from "../src/commands/resume";
import { listSessions } from "../src/commands/list";
import { route } from "../src/cli";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "respawn-commands-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("saveSession stores the active transcript gist for the current branch", async () => {
  const indexPath = join(dir, "index.json");

  const result = await saveSession({
    indexPath,
    locateActiveTranscript: () => ({
      agent: "codex",
      path: "/tmp/session.jsonl",
      sessionId: "session-1",
      relativePath: "2026/05/20/session.jsonl",
    }),
    currentRepo: async () => "repo",
    currentBranch: async () => "angela/fix-bugs",
    currentSha: async () => "abc123",
    createGist: async () => "https://gist.github.com/a/111",
    now: () => new Date("2026-05-20T10:00:00.000Z"),
  });

  expect(result.session).toMatchObject({
    agent: "codex",
    branch: "angela/fix-bugs",
    gistUrl: "https://gist.github.com/a/111",
    relativePath: "2026/05/20/session.jsonl",
    repo: "repo",
    sessionId: "session-1",
  });
});

test("saveSession fails clearly when no agent transcript is active", async () => {
  await expect(
    saveSession({
      indexPath: join(dir, "index.json"),
      locateActiveTranscript: () => null,
    }),
  ).rejects.toThrow("No active Claude Code or Codex session transcript found");
});

test("resumeSession downloads the latest branch session and returns its resume command", async () => {
  const indexPath = join(dir, "index.json");
  const restoredPath = join(dir, "home/.codex/sessions/2026/05/20/new.jsonl");
  const checkouts: string[] = [];

  await recordSession(indexPath, {
    repo: "repo",
    branch: "angela/fix-bugs",
    gistUrl: "old",
    sessionId: "old-session",
    sha: "oldsha",
    agent: "codex",
    savedAt: "2026-05-20T09:00:00.000Z",
    relativePath: "2026/05/20/old.jsonl",
  });
  await recordSession(indexPath, {
    repo: "repo",
    branch: "angela/fix-bugs",
    gistUrl: "new",
    sessionId: "new-session",
    sha: "newsha",
    agent: "codex",
    savedAt: "2026-05-20T11:00:00.000Z",
    relativePath: "2026/05/20/new.jsonl",
  });

  const result = await resumeSession("angela/fix-bugs", {
    indexPath,
    currentRepo: async () => "repo",
    downloadGist: async (gistUrl) => `downloaded:${gistUrl}\n`,
    checkoutBranch: async (branch) => {
      checkouts.push(branch);
    },
    targetTranscriptPath: () => restoredPath,
  });

  expect(await readFile(restoredPath, "utf8")).toBe("downloaded:new\n");
  expect(checkouts).toEqual(["angela/fix-bugs"]);
  expect(result.command).toEqual(["codex", "resume", "new-session"]);
});

test("listSessions prints every saved session, including repeated branches", async () => {
  const indexPath = join(dir, "index.json");
  await recordSession(indexPath, {
    repo: "repo",
    branch: "angela/fix-bugs",
    gistUrl: "url-1",
    sessionId: "session-1",
    sha: "abc123",
    agent: "claude",
    savedAt: "2026-05-20T10:00:00.000Z",
  });
  await recordSession(indexPath, {
    repo: "repo",
    branch: "angela/fix-bugs",
    gistUrl: "url-2",
    sessionId: "session-2",
    sha: "def456",
    agent: "codex",
    savedAt: "2026-05-20T11:00:00.000Z",
    relativePath: "2026/05/20/session-2.jsonl",
  });

  await expect(listSessions({ indexPath })).resolves.toBe(
    [
      "2026-05-20T10:00:00.000Z claude repo@angela/fix-bugs session-1 abc123 url-1",
      "2026-05-20T11:00:00.000Z codex repo@angela/fix-bugs session-2 def456 url-2",
    ].join("\n"),
  );
});

test("route maps raw argv to commands", () => {
  expect(route(["save"]).name).toBe("save");
  expect(route(["list"]).name).toBe("list");
  expect(route(["init"]).name).toBe("init");
  expect(route(["angela/fix-bugs"])).toEqual({
    name: "resume",
    branch: "angela/fix-bugs",
  });
});
