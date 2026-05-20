import { runCommand, type RunCommand } from "./shell";

export async function currentRepo(run: RunCommand = runCommand): Promise<string> {
  return (await run("git", ["remote", "get-url", "origin"])).trim();
}

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
