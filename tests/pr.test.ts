import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  decodeRespawnComment,
  encodeRespawnComment,
  listPullRequests,
  parseGitHubRepo,
  upsertRespawnComment,
} from "../src/github";
import { linkRepo } from "../src/commands/link";
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

test("listPullRequests reads all PRs for an explicit repo", async () => {
  const calls: string[] = [];
  const run: RunCommand = async (cmd, args) => {
    calls.push([cmd, ...args].join(" "));
    return JSON.stringify([
      {
        number: 514,
        url: "https://github.com/internetbackyard/gnomos-app/pull/514",
        headRefName: "feat/int-1194-tool-actor-context",
        headRefOid: "headsha",
        state: "MERGED",
        title: "actor context",
      },
    ]);
  };

  await expect(listPullRequests("internetbackyard/gnomos-app", run)).resolves.toEqual([
    {
      number: 514,
      url: "https://github.com/internetbackyard/gnomos-app/pull/514",
      headRefName: "feat/int-1194-tool-actor-context",
      headRefOid: "headsha",
      state: "MERGED",
      title: "actor context",
    },
  ]);
  expect(calls).toEqual([
    "gh pr list --repo internetbackyard/gnomos-app --state all --limit 1000 --json number,url,headRefName,headRefOid,state,title",
  ]);
});

test("linkRepo links sessions to PRs by branch and head sha", async () => {
  const indexPath = join(dir, "index.json");
  await writeFile(
    indexPath,
    JSON.stringify({
      version: 1,
      sessions: [
        {
          repo: "https://github.com/internetbackyard/gnomos-app",
          branch: "feat/int-1194-tool-actor-context",
          gistUrl: "gist-branch",
          sessionId: "branch-session",
          sha: "branchsha",
          agent: "codex",
          savedAt: "2026-05-20T10:00:00.000Z",
        },
        {
          repo: "git@github.com:internetbackyard/gnomos-app.git",
          branch: "staging",
          gistUrl: "gist-head",
          sessionId: "head-session",
          sha: "headsha",
          agent: "codex",
          savedAt: "2026-05-20T11:00:00.000Z",
        },
        {
          repo: "git@github.com:other/repo.git",
          branch: "feat/int-1194-tool-actor-context",
          gistUrl: "other",
          sessionId: "other-session",
          sha: "othersha",
          agent: "codex",
          savedAt: "2026-05-20T12:00:00.000Z",
        },
      ],
    }),
  );
  const linked: number[] = [];

  const result = await linkRepo("internetbackyard/gnomos-app", {
    indexPath,
    listPullRequests: async () => [
      {
        number: 514,
        url: "https://github.com/internetbackyard/gnomos-app/pull/514",
        headRefName: "feat/int-1194-tool-actor-context",
        headRefOid: "headsha",
        state: "MERGED",
        title: "actor context",
      },
    ],
    upsertRespawnComment: async ({ tag }) => {
      linked.push(tag.pr);
      expect(tag.sessions.map((session) => session.sessionId).sort()).toEqual([
        "branch-session",
        "head-session",
      ]);
      return tag;
    },
  });

  expect(result).toMatchObject({ linked: 1, dryRun: false, unmatchedSessions: 0 });
  expect(linked).toEqual([514]);
});

test("linkRepo dry-run reports matches without writing comments", async () => {
  const indexPath = join(dir, "index.json");
  await writeFile(
    indexPath,
    JSON.stringify({
      version: 1,
      sessions: [
        {
          repo: "internetbackyard/gnomos-app",
          branch: "feature",
          gistUrl: "gist",
          sessionId: "session",
          sha: "sha",
          agent: "codex",
          savedAt: "2026-05-20T10:00:00.000Z",
        },
      ],
    }),
  );

  const result = await linkRepo("internetbackyard/gnomos-app", {
    indexPath,
    dryRun: true,
    listPullRequests: async () => [
      {
        number: 1,
        url: "https://github.com/internetbackyard/gnomos-app/pull/1",
        headRefName: "feature",
        state: "OPEN",
        title: "feature",
        commits: [],
      },
    ],
    upsertRespawnComment: async () => {
      throw new Error("dry-run should not write comments");
    },
  });

  expect(result.message).toBe(
    "Would link 1 PRs in internetbackyard/gnomos-app; 0 sessions unmatched",
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
