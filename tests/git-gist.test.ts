import { expect, test } from "bun:test";
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
  const calls: string[] = [];
  const run: RunCommand = async (cmd, args) => {
    calls.push([cmd, ...args].join(" "));
    if (args.includes("create")) {
      return "https://gist.github.com/angelafeliciaa/abcdef123456\n";
    }
    return "transcript\n";
  };

  await expect(
    createGist("/tmp/session.jsonl", "respawn: repo@branch", run),
  ).resolves.toBe("https://gist.github.com/angelafeliciaa/abcdef123456");
  await expect(downloadGist("https://gist.github.com/angelafeliciaa/abcdef123456", run)).resolves.toBe(
    "transcript\n",
  );

  expect(calls).toEqual([
    "gh gist create /tmp/session.jsonl --desc respawn: repo@branch",
    "gh gist view abcdef123456 --raw",
  ]);
});
