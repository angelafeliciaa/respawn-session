import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import {
  encodeClaudeProjectPath,
  listTranscripts as listClaudeTranscripts,
  locateTranscript as locateClaudeTranscript,
  resumeCmd as claudeResumeCmd,
  transcriptPath as claudeTranscriptPath,
} from "../src/agents/claude";
import {
  locateTranscript as locateCodexTranscript,
  resumeCmd as codexResumeCmd,
  sessionIdFromCodexPath,
} from "../src/agents/codex";

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "respawn-agents-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

test("Claude encodes the current working directory in its project path", () => {
  expect(
    encodeClaudeProjectPath(
      "/Users/angelafelicia/Library/Mobile Documents/project",
    ),
  ).toBe("-Users-angelafelicia-Library-Mobile-Documents-project");
  expect(
    encodeClaudeProjectPath(
      "/Users/angelafelicia/Library/Mobile Documents/com~apple~CloudDocs/VSC/respawn-session",
    ),
  ).toBe(
    "-Users-angelafelicia-Library-Mobile-Documents-com-apple-CloudDocs-VSC-respawn-session",
  );
  expect(
    encodeClaudeProjectPath(
      "/Users/angelafelicia/.superset/worktrees/gnomos-app/alpine-trade",
    ),
  ).toBe("-Users-angelafelicia--superset-worktrees-gnomos-app-alpine-trade");
});

test("Claude locates the active session transcript from CLAUDE_SESSION_ID", async () => {
  const cwd = "/Users/angelafelicia/project";
  const sessionId = "4787a05c-5d85-4b79-a5cd-c76c688e5cf4";
  const path = claudeTranscriptPath(sessionId, { cwd, home });
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, "{}\n");

  expect(
    locateClaudeTranscript({
      cwd,
      home,
      env: { CLAUDE_SESSION_ID: sessionId },
    }),
  ).toEqual({ agent: "claude", path, sessionId });
});

test("Claude falls back to the newest session registry entry for the current cwd", async () => {
  const cwd = "/Users/angelafelicia/Library/Mobile Documents/com~apple~CloudDocs/VSC/respawn-session";
  const oldSession = "11111111-1111-4111-8111-111111111111";
  const newSession = "22222222-2222-4222-8222-222222222222";
  const sessionsDir = join(home, ".claude", "sessions");
  await mkdir(sessionsDir, { recursive: true });

  await writeFile(
    join(sessionsDir, "old.json"),
    JSON.stringify({
      sessionId: oldSession,
      cwd,
      status: "idle",
      updatedAt: 1000,
    }),
  );
  await writeFile(
    join(sessionsDir, "new.json"),
    JSON.stringify({
      sessionId: newSession,
      cwd,
      status: "idle",
      updatedAt: 2000,
    }),
  );

  const path = claudeTranscriptPath(newSession, { cwd, home });
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, "{}\n");

  expect(
    locateClaudeTranscript({
      cwd,
      home,
      env: {},
    }),
  ).toEqual({ agent: "claude", path, sessionId: newSession });
});

test("Claude lists project transcripts with embedded branch metadata", async () => {
  const cwd = "/Users/angelafelicia/.superset/worktrees/gnomos-app/alpine-trade";
  const sessionId = "65b6cc56-2663-491a-ab61-5d3e03166eee";
  const path = claudeTranscriptPath(sessionId, { cwd, home });
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(
    path,
    `${JSON.stringify({
      cwd,
      sessionId,
      gitBranch: "feat/int-1194-tool-actor-context",
      timestamp: "2026-05-20T05:32:04.192Z",
    })}\n`,
  );

  expect(listClaudeTranscripts({ home })).toEqual([
    {
      agent: "claude",
      path,
      sessionId,
      cwd,
      branch: "feat/int-1194-tool-actor-context",
      savedAt: "2026-05-20T05:32:04.192Z",
    },
  ]);
});

test("Claude resume command uses claude --resume", () => {
  expect(claudeResumeCmd("abc")).toEqual(["claude", "--resume", "abc"]);
});

test("Codex extracts session ids from rollout transcript filenames", () => {
  expect(
    sessionIdFromCodexPath(
      "/Users/a/.codex/sessions/2026/05/20/rollout-2026-05-20T14-02-28-019e4732-6ef7-7532-8a7b-c8f50de309f1.jsonl",
    ),
  ).toBe("019e4732-6ef7-7532-8a7b-c8f50de309f1");
});

test("Codex locates the newest transcript for the current cwd", async () => {
  const cwd = "/Users/angelafelicia/project";
  const oldPath = join(
    home,
    ".codex/sessions/2026/05/19/rollout-2026-05-19T14-02-28-019e4200-0000-7000-8000-000000000000.jsonl",
  );
  const newPath = join(
    home,
    ".codex/sessions/2026/05/20/rollout-2026-05-20T14-02-28-019e4732-6ef7-7532-8a7b-c8f50de309f1.jsonl",
  );
  await mkdir(join(oldPath, ".."), { recursive: true });
  await mkdir(join(newPath, ".."), { recursive: true });
  await writeFile(
    oldPath,
    `${JSON.stringify({ type: "session_meta", payload: { id: "old", cwd } })}\n`,
  );
  await writeFile(
    newPath,
    `${JSON.stringify({
      type: "session_meta",
      payload: { id: "019e4732-6ef7-7532-8a7b-c8f50de309f1", cwd },
    })}\n`,
  );

  expect(locateCodexTranscript({ cwd, home })).toEqual({
    agent: "codex",
    path: newPath,
    sessionId: "019e4732-6ef7-7532-8a7b-c8f50de309f1",
    relativePath:
      "2026/05/20/rollout-2026-05-20T14-02-28-019e4732-6ef7-7532-8a7b-c8f50de309f1.jsonl",
  });
});

test("Codex resume command uses codex resume", () => {
  expect(codexResumeCmd("abc")).toEqual(["codex", "resume", "abc"]);
});
