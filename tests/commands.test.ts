import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { recordSession } from "../src/index-file";
import { saveSession } from "../src/commands/save";
import { resumeSession } from "../src/commands/resume";
import { listSessions } from "../src/commands/list";
import { initRespawn } from "../src/commands/init";
import { updateRespawn, versionText } from "../src/commands/update";
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
  const transcriptPath = join(dir, "session.jsonl");
  await writeFile(transcriptPath, "transcript\n");

  const result = await saveSession({
    indexPath,
    locateActiveTranscript: () => ({
      agent: "codex",
      path: transcriptPath,
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

test("saveSession autosave skips unchanged transcript hashes", async () => {
  const indexPath = join(dir, "index.json");
  const transcriptPath = join(dir, "session.jsonl");
  let gists = 0;
  await writeFile(transcriptPath, "same transcript\n");

  const first = await saveSession({
    indexPath,
    mode: "autosave",
    locateActiveTranscript: () => ({
      agent: "codex",
      path: transcriptPath,
      sessionId: "session-1",
      relativePath: "2026/05/20/session.jsonl",
    }),
    currentRepo: async () => "repo",
    currentBranch: async () => "main",
    currentSha: async () => "abc123",
    createGist: async () => {
      gists += 1;
      return "https://gist.github.com/a/111";
    },
    now: () => new Date("2026-05-20T10:00:00.000Z"),
  });
  const second = await saveSession({
    indexPath,
    mode: "autosave",
    locateActiveTranscript: () => ({
      agent: "codex",
      path: transcriptPath,
      sessionId: "session-1",
      relativePath: "2026/05/20/session.jsonl",
    }),
    currentRepo: async () => "repo",
    currentBranch: async () => "main",
    currentSha: async () => "abc123",
    createGist: async () => {
      gists += 1;
      return "https://gist.github.com/a/222";
    },
    now: () => new Date("2026-05-20T10:01:00.000Z"),
  });

  expect(gists).toBe(1);
  expect(first.saved).toBe(true);
  expect(second.saved).toBe(false);
  expect(second.message).toBe("No transcript changes to autosave for main");
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

test("initRespawn installs Claude and Codex autosave Stop hooks", async () => {
  const message = await initRespawn({
    home: dir,
    indexPath: join(dir, ".respawn/index.json"),
  });

  const claudeSettings = JSON.parse(
    await readFile(join(dir, ".claude/settings.json"), "utf8"),
  ) as { hooks: { Stop: Array<{ hooks: Array<{ command: string }> }> } };
  const codexHooks = JSON.parse(
    await readFile(join(dir, ".codex/hooks.json"), "utf8"),
  ) as { hooks: { Stop: Array<{ hooks: Array<{ command: string }> }> } };

  expect(message).toContain("Initialized respawn index");
  expect(claudeSettings.hooks.Stop[0].hooks[0].command).toBe(
    "respawn autosave || true",
  );
  expect(codexHooks.hooks.Stop[0].hooks[0].command).toBe(
    "respawn autosave || true",
  );
});

test("initRespawn preserves existing hooks and does not duplicate autosave", async () => {
  const claudePath = join(dir, ".claude/settings.json");
  const codexPath = join(dir, ".codex/hooks.json");
  await mkdir(join(dir, ".claude"), { recursive: true });
  await mkdir(join(dir, ".codex"), { recursive: true });
  await writeFile(
    claudePath,
    JSON.stringify({
      hooks: {
        Stop: [
          { hooks: [{ type: "command", command: "notify" }] },
          { hooks: [{ type: "command", command: "respawn autosave || true" }] },
        ],
      },
    }),
  );
  await writeFile(
    codexPath,
    JSON.stringify({
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: "notify" }] }],
      },
    }),
  );

  await initRespawn({ home: dir, indexPath: join(dir, ".respawn/index.json") });
  await initRespawn({ home: dir, indexPath: join(dir, ".respawn/index.json") });

  const claudeSettings = JSON.parse(await readFile(claudePath, "utf8")) as {
    hooks: { Stop: Array<{ hooks: Array<{ command: string }> }> };
  };
  const codexHooks = JSON.parse(await readFile(codexPath, "utf8")) as {
    hooks: { Stop: Array<{ hooks: Array<{ command: string }> }> };
  };

  const claudeAutosaves = claudeSettings.hooks.Stop.flatMap((group) =>
    group.hooks.map((hook) => hook.command),
  ).filter((command) => command === "respawn autosave || true");
  const codexAutosaves = codexHooks.hooks.Stop.flatMap((group) =>
    group.hooks.map((hook) => hook.command),
  ).filter((command) => command === "respawn autosave || true");

  expect(claudeAutosaves).toHaveLength(1);
  expect(codexAutosaves).toHaveLength(1);
});

test("versionText prints the current package version", () => {
  expect(versionText("1.2.3")).toBe("respawn-session 1.2.3");
});

test("updateRespawn skips install when already latest", async () => {
  const calls: string[] = [];
  const message = await updateRespawn({
    currentVersion: "0.0.3",
    run: async (cmd, args) => {
      calls.push([cmd, ...args].join(" "));
      return "0.0.3\n";
    },
  });

  expect(message).toBe("respawn-session is already up to date at 0.0.3");
  expect(calls).toEqual(["npm view respawn-session version"]);
});

test("updateRespawn installs latest when npm has a newer version", async () => {
  const calls: string[] = [];
  const message = await updateRespawn({
    currentVersion: "0.0.3",
    run: async (cmd, args) => {
      calls.push([cmd, ...args].join(" "));
      return args.includes("view") ? "0.0.4\n" : "";
    },
  });

  expect(message).toBe("Updated respawn-session 0.0.3 -> 0.0.4");
  expect(calls).toEqual([
    "npm view respawn-session version",
    "npm install -g respawn-session@latest",
  ]);
});

test("route maps raw argv to commands", () => {
  expect(route(["save"]).name).toBe("save");
  expect(route(["autosave"]).name).toBe("autosave");
  expect(route(["list"]).name).toBe("list");
  expect(route(["init"]).name).toBe("init");
  expect(route(["tag"]).name).toBe("tag");
  expect(route(["version"]).name).toBe("version");
  expect(route(["--version"]).name).toBe("version");
  expect(route(["update"]).name).toBe("update");
  expect(route(["123"])).toEqual({ name: "resume-pr", prRef: "123" });
  expect(route(["https://github.com/org/repo/pull/123"])).toEqual({
    name: "resume-pr",
    prRef: "https://github.com/org/repo/pull/123",
  });
  expect(route(["angela/fix-bugs"])).toEqual({
    name: "resume",
    branch: "angela/fix-bugs",
  });
});
