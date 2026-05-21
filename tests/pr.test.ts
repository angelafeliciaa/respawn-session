import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  listPullRequests,
  parseGitHubRepo,
} from "../src/github";
import { linkRepo } from "../src/commands/link";
import { autosaveSession } from "../src/commands/autosave";
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
          transcriptPath: "local-branch",
          sessionId: "branch-session",
          sha: "branchsha",
          agent: "codex",
          savedAt: "2026-05-20T10:00:00.000Z",
        },
        {
          repo: "git@github.com:internetbackyard/gnomos-app.git",
          branch: "staging",
          transcriptPath: "local-head",
          sessionId: "head-session",
          sha: "headsha",
          agent: "codex",
          savedAt: "2026-05-20T11:00:00.000Z",
        },
        {
          repo: "git@github.com:other/repo.git",
          branch: "feat/int-1194-tool-actor-context",
          transcriptPath: "other",
          sessionId: "other-session",
          sha: "othersha",
          agent: "codex",
          savedAt: "2026-05-20T12:00:00.000Z",
        },
      ],
    }),
  );
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
  });

  expect(result).toMatchObject({ linked: 1, dryRun: false, unmatchedSessions: 0 });
  const updated = JSON.parse(await readFile(indexPath, "utf8")) as {
    sessions: Array<{ sessionId: string; pr?: number }>;
  };
  expect(
    updated.sessions
      .filter((session) => ["branch-session", "head-session"].includes(session.sessionId))
      .map((session) => session.pr),
  ).toEqual([514, 514]);
});

test("linkRepo dry-run reports matches without writing local metadata", async () => {
  const indexPath = join(dir, "index.json");
  await writeFile(
    indexPath,
    JSON.stringify({
      version: 1,
      sessions: [
        {
          repo: "internetbackyard/gnomos-app",
          branch: "feature",
          transcriptPath: "local",
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
  });

  expect(result.message).toBe(
    [
      "Would link 1 PRs in internetbackyard/gnomos-app; 0 sessions unmatched",
      "  #1 feature (1 session)",
    ].join("\n"),
  );
});

test("tagCurrentPr saves the session with local PR metadata", async () => {
  const transcriptPath = join(dir, "session.jsonl");
  await writeFile(transcriptPath, "transcript\n");

  const result = await tagCurrentPr({
    saveSession: async (deps = {}) => {
      expect(deps.sessionPatch).toEqual({
        pr: 123,
        prUrl: "https://github.com/angelafeliciaa/respawn-session/pull/123",
      });
      return {
      saved: true,
      message: "Saved codex session",
      session: {
        repo: "git@github.com:angelafeliciaa/respawn-session.git",
        branch: "angela/fix-bugs",
        transcriptPath: "local",
        sessionId: "session-1",
        sha: "abc123",
        agent: "codex",
        savedAt: "2026-05-20T10:00:00.000Z",
        relativePath: "2026/05/20/session.jsonl",
        pr: 123,
        prUrl: "https://github.com/angelafeliciaa/respawn-session/pull/123",
      },
    }},
    currentPr: async () => ({
      number: 123,
      url: "https://github.com/angelafeliciaa/respawn-session/pull/123",
      headRefName: "angela/fix-bugs",
    }),
  });

  expect(result.tag.pr).toBe(123);
  expect(result.tag.session.sessionId).toBe("session-1");
});

test("tagCurrentPr stores PR metadata locally on the saved session", async () => {
  const result = await tagCurrentPr({
    saveSession: async (deps = {}) => {
      expect(deps.sessionPatch).toEqual({
        pr: 123,
        prUrl: "https://github.com/angelafeliciaa/respawn-session/pull/123",
      });
      return {
      saved: true,
      message: "Saved codex session",
      session: {
        repo: "git@github.com:angelafeliciaa/respawn-session.git",
        branch: "angela/fix-bugs",
        transcriptPath: "new",
        sessionId: "new-session",
        sha: "newsha",
        agent: "codex",
        savedAt: "2026-05-20T11:00:00.000Z",
        pr: 123,
        prUrl: "https://github.com/angelafeliciaa/respawn-session/pull/123",
      },
    }},
    currentPr: async () => ({
      number: 123,
      url: "https://github.com/angelafeliciaa/respawn-session/pull/123",
      headRefName: "angela/fix-bugs",
    }),
  });

  expect(result.tag.session.sessionId).toBe("new-session");
});

test("autosaveSession links the current PR with the saved session locally", async () => {
  const result = await autosaveSession({
    saveSession: async () => ({
      saved: true,
      message: "Autosaved claude session",
      session: {
        repo: "git@github.com:internetbackyard/gnomos-app.git",
        branch: "feat/int-1194-tool-actor-context",
        transcriptPath: "local",
        sessionId: "session-517",
        sha: "abc123",
        agent: "claude",
        savedAt: "2026-05-20T10:00:00.000Z",
      },
    }),
    currentPr: async () => ({
      number: 517,
      url: "https://github.com/internetbackyard/gnomos-app/pull/517",
      headRefName: "feat/int-1194-tool-actor-context",
    }),
  });

  expect(result.message).toBe(
    "Autosaved claude session; linked local PR #517",
  );
  expect(result.pr).toBe(517);
});

test("autosaveSession does not fail when the branch has no PR", async () => {
  const result = await autosaveSession({
    saveSession: async () => ({
      saved: true,
      message: "Autosaved claude session",
      session: {
        repo: "git@github.com:internetbackyard/gnomos-app.git",
        branch: "scratch",
        transcriptPath: "local",
        sessionId: "session-no-pr",
        sha: "abc123",
        agent: "claude",
        savedAt: "2026-05-20T10:00:00.000Z",
      },
    }),
    currentPr: async () => {
      throw new Error("no pull requests found");
    },
  });

  expect(result.message).toBe("Autosaved claude session");
  expect(result.pr).toBeUndefined();
});

test("autosaveSession passes PR metadata into the local save", async () => {
  const session = {
    repo: "git@github.com:internetbackyard/gnomos-app.git",
    branch: "feat/int-1194-tool-actor-context",
    transcriptPath: "local",
    sessionId: "session-517",
    sha: "abc123",
    agent: "claude" as const,
    savedAt: "2026-05-20T10:00:00.000Z",
  };

  const result = await autosaveSession({
    saveSession: async (deps = {}) => {
      expect(deps.sessionPatch).toEqual({
        pr: 517,
        prUrl: "https://github.com/internetbackyard/gnomos-app/pull/517",
      });
      return {
      saved: false,
      message: "No transcript changes to autosave for feat/int-1194-tool-actor-context",
      session,
    }},
    currentPr: async () => ({
      number: 517,
      url: "https://github.com/internetbackyard/gnomos-app/pull/517",
      headRefName: "feat/int-1194-tool-actor-context",
    }),
  });

  expect(result.pr).toBe(517);
});

test("autosaveSession keeps saving when PR detection fails", async () => {
  const result = await autosaveSession({
    saveSession: async () => ({
      saved: true,
      message: "Autosaved claude session",
      session: {
        repo: "git@github.com:internetbackyard/gnomos-app.git",
        branch: "feat/int-1194-tool-actor-context",
        transcriptPath: "local",
        sessionId: "session-517",
        sha: "abc123",
        agent: "claude",
        savedAt: "2026-05-20T10:00:00.000Z",
      },
    }),
    currentPr: async () => {
      throw new Error("no PR");
    },
  });

  expect(result.saved).toBe(true);
  expect(result.message).toBe("Autosaved claude session");
  expect(result.pr).toBeUndefined();
});

test("resumePrSession restores the newest session from PR metadata", async () => {
  const indexPath = join(dir, "index.json");
  const restoredPath = join(dir, "home/.codex/sessions/2026/05/20/session.jsonl");
  const checkouts: string[] = [];
  await writeFile(
    indexPath,
    JSON.stringify({
      version: 1,
      sessions: [
        {
          repo: "repo",
          branch: "angela/fix-bugs",
          transcriptPath: "old",
          sessionId: "old-session",
          sha: "oldsha",
          agent: "codex",
          savedAt: "2026-05-20T09:00:00.000Z",
          relativePath: "2026/05/20/old.jsonl",
          pr: 123,
        },
        {
          repo: "repo",
          branch: "angela/fix-bugs",
          transcriptPath: "new",
          sessionId: "new-session",
          sha: "newsha",
          agent: "codex",
          savedAt: "2026-05-20T11:00:00.000Z",
          relativePath: "2026/05/20/session.jsonl",
          pr: 123,
        },
      ],
    }),
  );
  const result = await resumePrSession("123", {
    indexPath,
    currentRepo: async () => "repo",
    readTranscript: async (path) => `downloaded:${path}\n`,
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
  const indexPath = join(dir, "index.json");
  const restoredPath = join(dir, "home/.codex/sessions/2026/05/20/session.jsonl");
  await writeFile(
    indexPath,
    JSON.stringify({
      version: 1,
      sessions: [
        {
          repo: "https://github.com/internetbackyard/gnomos-app",
          branch: "staging",
          transcriptPath: "local",
          sessionId: "session-514",
          sha: "abc123",
          agent: "codex",
          savedAt: "2026-05-20T11:00:00.000Z",
          relativePath: "2026/05/20/session.jsonl",
          pr: 514,
        },
      ],
    }),
  );
  const result = await resumePrSession("514", {
    indexPath,
    repo: "internetbackyard/gnomos-app",
    readTranscript: async () => "downloaded\n",
    checkoutPr: async () => {},
    targetTranscriptPath: () => restoredPath,
  });

  expect(result.command).toEqual(["codex", "resume", "session-514"]);
});

test("resumePrSession falls back to a local branch at the saved commit", async () => {
  const indexPath = join(dir, "index.json");
  const restoredPath = join(dir, "home/.codex/sessions/2026/05/20/session.jsonl");
  const fallbacks: Array<{ branch: string; sha: string }> = [];
  await writeFile(
    indexPath,
    JSON.stringify({
      version: 1,
      sessions: [
        {
          repo: "repo",
          branch: "deleted-branch",
          transcriptPath: "local",
          sessionId: "session-517",
          sha: "savedsha",
          agent: "codex",
          savedAt: "2026-05-20T11:00:00.000Z",
          relativePath: "2026/05/20/session.jsonl",
          pr: 517,
        },
      ],
    }),
  );

  const result = await resumePrSession("517", {
    indexPath,
    currentRepo: async () => "repo",
    readTranscript: async () => "downloaded\n",
    checkoutPr: async () => {
      throw new Error("branch was deleted");
    },
    checkoutSavedCommit: async (branch, sha) => {
      fallbacks.push({ branch, sha });
    },
    targetTranscriptPath: () => restoredPath,
  });

  expect(await readFile(restoredPath, "utf8")).toBe("downloaded\n");
  expect(fallbacks).toEqual([{ branch: "respawn/pr-517", sha: "savedsha" }]);
  expect(result.command).toEqual(["codex", "resume", "session-517"]);
});
