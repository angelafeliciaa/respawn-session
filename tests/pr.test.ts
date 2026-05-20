import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  decodeRespawnComment,
  encodeRespawnComment,
  parseGitHubRepo,
  upsertRespawnComment,
} from "../src/github";
import { tagCurrentPr } from "../src/commands/tag";
import { resumePrSession } from "../src/commands/resume";
import type { RunCommand } from "../src/shell";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "respawn-pr-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("parseGitHubRepo supports ssh and https remotes", () => {
  expect(parseGitHubRepo("git@github.com:angelafeliciaa/respawn-session.git")).toEqual({
    owner: "angelafeliciaa",
    name: "respawn-session",
  });
  expect(parseGitHubRepo("https://github.com/org/repo.git")).toEqual({
    owner: "org",
    name: "repo",
  });
});

test("respawn PR comments round-trip hidden metadata", () => {
  const body = encodeRespawnComment({
    version: 1,
    repo: "repo",
    pr: 123,
    branch: "angela/fix-bugs",
    sessions: [
      {
        repo: "repo",
        branch: "angela/fix-bugs",
        gistUrl: "gist",
        sessionId: "session-1",
        sha: "abc123",
        agent: "codex",
        savedAt: "2026-05-20T10:00:00.000Z",
      },
    ],
  });

  expect(decodeRespawnComment(body)?.sessions[0].sessionId).toBe("session-1");
});

test("upsertRespawnComment patches an existing hidden comment", async () => {
  const calls: string[] = [];
  const run: RunCommand = async (cmd, args) => {
    calls.push([cmd, ...args].join(" "));
    if (args.includes("view")) {
      return JSON.stringify({
        comments: [
          {
            id: "IC_kw",
            body: encodeRespawnComment({
              version: 1,
              repo: "repo",
              pr: 123,
              branch: "old",
              sessions: [],
            }),
          },
        ],
      });
    }
    return "";
  };

  await upsertRespawnComment(
    {
      owner: "angelafeliciaa",
      name: "respawn-session",
      pr: 123,
      tag: {
        version: 1,
        repo: "repo",
        pr: 123,
        branch: "angela/fix-bugs",
        sessions: [],
      },
    },
    run,
  );

  expect(calls.at(-1)).toStartWith(
    "gh api repos/angelafeliciaa/respawn-session/issues/comments/IC_kw -X PATCH -f body=",
  );
});

test("tagCurrentPr saves the session and upserts PR metadata", async () => {
  const transcriptPath = join(dir, "session.jsonl");
  await writeFile(transcriptPath, "transcript\n");

  const result = await tagCurrentPr({
    saveSession: async () => ({
      saved: true,
      message: "Saved codex session",
      session: {
        repo: "git@github.com:angelafeliciaa/respawn-session.git",
        branch: "angela/fix-bugs",
        gistUrl: "gist",
        sessionId: "session-1",
        sha: "abc123",
        agent: "codex",
        savedAt: "2026-05-20T10:00:00.000Z",
        relativePath: "2026/05/20/session.jsonl",
      },
    }),
    currentPr: async () => ({
      number: 123,
      url: "https://github.com/angelafeliciaa/respawn-session/pull/123",
      headRefName: "angela/fix-bugs",
    }),
    getRespawnTag: async () => null,
    upsertRespawnComment: async ({ tag }) => tag,
  });

  expect(result.tag.pr).toBe(123);
  expect(result.tag.sessions[0].sessionId).toBe("session-1");
});

test("tagCurrentPr appends to an existing PR tag", async () => {
  const result = await tagCurrentPr({
    saveSession: async () => ({
      saved: true,
      message: "Saved codex session",
      session: {
        repo: "git@github.com:angelafeliciaa/respawn-session.git",
        branch: "angela/fix-bugs",
        gistUrl: "new",
        sessionId: "new-session",
        sha: "newsha",
        agent: "codex",
        savedAt: "2026-05-20T11:00:00.000Z",
      },
    }),
    currentPr: async () => ({
      number: 123,
      url: "https://github.com/angelafeliciaa/respawn-session/pull/123",
      headRefName: "angela/fix-bugs",
    }),
    getRespawnTag: async () => ({
      version: 1,
      repo: "git@github.com:angelafeliciaa/respawn-session.git",
      pr: 123,
      branch: "angela/fix-bugs",
      sessions: [
        {
          repo: "git@github.com:angelafeliciaa/respawn-session.git",
          branch: "angela/fix-bugs",
          gistUrl: "old",
          sessionId: "old-session",
          sha: "oldsha",
          agent: "claude",
          savedAt: "2026-05-20T10:00:00.000Z",
        },
      ],
    }),
    upsertRespawnComment: async ({ tag }) => tag,
  });

  expect(result.tag.sessions.map((session) => session.sessionId)).toEqual([
    "old-session",
    "new-session",
  ]);
});

test("resumePrSession restores the newest session from PR metadata", async () => {
  const restoredPath = join(dir, "home/.codex/sessions/2026/05/20/session.jsonl");
  const checkouts: string[] = [];
  const result = await resumePrSession("123", {
    currentRepo: async () => "repo",
    getRespawnTag: async () => ({
      version: 1,
      repo: "repo",
      pr: 123,
      branch: "angela/fix-bugs",
      sessions: [
        {
          repo: "repo",
          branch: "angela/fix-bugs",
          gistUrl: "old",
          sessionId: "old-session",
          sha: "oldsha",
          agent: "codex",
          savedAt: "2026-05-20T09:00:00.000Z",
          relativePath: "2026/05/20/old.jsonl",
        },
        {
          repo: "repo",
          branch: "angela/fix-bugs",
          gistUrl: "new",
          sessionId: "new-session",
          sha: "newsha",
          agent: "codex",
          savedAt: "2026-05-20T11:00:00.000Z",
          relativePath: "2026/05/20/session.jsonl",
        },
      ],
    }),
    downloadGist: async (gistUrl) => `downloaded:${gistUrl}\n`,
    checkoutPr: async (prRef) => {
      checkouts.push(prRef);
    },
    targetTranscriptPath: () => restoredPath,
  });

  expect(await readFile(restoredPath, "utf8")).toBe("downloaded:new\n");
  expect(checkouts).toEqual(["123"]);
  expect(result.command).toEqual(["codex", "resume", "new-session"]);
});

test("resumePrSession supports an explicit repo", async () => {
  const restoredPath = join(dir, "home/.codex/sessions/2026/05/20/session.jsonl");
  const result = await resumePrSession("514", {
    repo: "internetbackyard/gnomos-app",
    getRespawnTag: async (prRef, repo) => {
      expect(prRef).toBe("514");
      expect(repo).toBe("internetbackyard/gnomos-app");
      return {
        version: 1,
        repo: "https://github.com/internetbackyard/gnomos-app",
        pr: 514,
        branch: "staging",
        sessions: [
          {
            repo: "https://github.com/internetbackyard/gnomos-app",
            branch: "staging",
            gistUrl: "gist",
            sessionId: "session-514",
            sha: "abc123",
            agent: "codex",
            savedAt: "2026-05-20T11:00:00.000Z",
            relativePath: "2026/05/20/session.jsonl",
          },
        ],
      };
    },
    downloadGist: async () => "downloaded\n",
    checkoutPr: async () => {},
    targetTranscriptPath: () => restoredPath,
  });

  expect(result.command).toEqual(["codex", "resume", "session-514"]);
});
