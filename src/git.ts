import { runCommand, type RunCommand } from "./shell";

export async function currentRepo(run: RunCommand = runCommand): Promise<string> {
  return (await run("git", ["remote", "get-url", "origin"])).trim();
}

export type GitInfo = {
  repo: string;
  branch: string;
  sha: string;
};

export async function currentBranch(
  run: RunCommand = runCommand,
): Promise<string> {
  return (await run("git", ["branch", "--show-current"])).trim();
}

export async function currentSha(run: RunCommand = runCommand): Promise<string> {
  return (await run("git", ["rev-parse", "HEAD"])).trim();
}

export async function checkoutBranch(
  branch: string,
  run: RunCommand = runCommand,
): Promise<void> {
  await run("git", ["checkout", branch]);
}

export async function gitInfoForCwd(
  cwd: string,
  run: RunCommand = runCommand,
): Promise<GitInfo | null> {
  try {
    const repo = (await run("git", ["-C", cwd, "remote", "get-url", "origin"])).trim();
    const branch = (await run("git", ["-C", cwd, "branch", "--show-current"])).trim();
    const sha = (await run("git", ["-C", cwd, "rev-parse", "HEAD"])).trim();
    if (!repo || !branch || !sha) return null;
    return { repo, branch, sha };
  } catch {
    return null;
  }
}
