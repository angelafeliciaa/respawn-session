import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import {
  checkoutBranch,
  checkoutSavedCommit,
  currentBranch,
  currentRepo,
  currentSha,
} from "../src/git";
import { readTranscript, saveTranscript } from "../src/storage/local";
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
  await checkoutSavedCommit("respawn/pr-517", "abc123", run);

  expect(calls).toEqual([
    "git remote get-url origin",
    "git branch --show-current",
    "git rev-parse HEAD",
    "git checkout angela/fix-bugs",
    "git checkout -B respawn/pr-517 abc123",
  ]);
});

test("saveTranscript copies transcripts into a local store", async () => {
  const dir = await mkdtemp(join(tmpdir(), "respawn-local-test-"));
  const transcriptPath = join(dir, "session.jsonl");
  const storePath = join(dir, "store");
  await writeFile(transcriptPath, "transcript\n");

  const savedPath = await saveTranscript(transcriptPath, storePath);

  expect(basename(savedPath)).toEndWith("-session.jsonl");
  expect(await readTranscript(savedPath)).toBe("transcript\n");
  expect(savedPath.startsWith(storePath)).toBe(true);
  await rm(dir, { recursive: true, force: true });
});

test("readTranscript refuses legacy gist pointers", async () => {
  await expect(
    readTranscript("https://gist.github.com/angelafeliciaa/abcdef123456"),
  ).rejects.toThrow("respawn is local-only now");
});
