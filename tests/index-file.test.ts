import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  findLatestSession,
  findSessions,
  readIndex,
  recordSession,
} from "../src/index-file";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "respawn-index-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("readIndex returns an empty index when the file is absent", async () => {
  await expect(readIndex(join(dir, "index.json"))).resolves.toEqual({
    version: 1,
    sessions: [],
  });
});

test("recordSession appends multiple sessions for the same repo and branch", async () => {
  const path = join(dir, "index.json");

  await recordSession(path, {
    repo: "git@github.com:angelafeliciaa/respawn-session.git",
    branch: "angela/fix-bugs",
    transcriptPath: "/home/.respawn/transcripts/111.jsonl",
    sessionId: "session-1",
    sha: "abc123",
    agent: "claude",
    savedAt: "2026-05-20T10:00:00.000Z",
  });
  await recordSession(path, {
    repo: "git@github.com:angelafeliciaa/respawn-session.git",
    branch: "angela/fix-bugs",
    transcriptPath: "/home/.respawn/transcripts/222.jsonl",
    sessionId: "session-2",
    sha: "def456",
    agent: "codex",
    savedAt: "2026-05-20T11:00:00.000Z",
  });

  const sessions = await findSessions(path, {
    repo: "git@github.com:angelafeliciaa/respawn-session.git",
    branch: "angela/fix-bugs",
  });

  expect(sessions.map((session) => session.sessionId)).toEqual([
    "session-1",
    "session-2",
  ]);
});

test("findLatestSession returns the newest saved session for a branch", async () => {
  const path = join(dir, "index.json");

  await recordSession(path, {
    repo: "repo",
    branch: "main",
    transcriptPath: "old",
    sessionId: "old-session",
    sha: "abc123",
    agent: "claude",
    savedAt: "2026-05-20T10:00:00.000Z",
  });
  await recordSession(path, {
    repo: "repo",
    branch: "main",
    transcriptPath: "new",
    sessionId: "new-session",
    sha: "def456",
    agent: "claude",
    savedAt: "2026-05-20T12:00:00.000Z",
  });

  await expect(
    findLatestSession(path, { repo: "repo", branch: "main" }),
  ).resolves.toMatchObject({ sessionId: "new-session" });
});
