import { runCommand, type RunCommand } from "../shell";

export function gistIdFromUrl(value: string): string {
  const trimmed = value.trim();
  const segments = trimmed.split("/").filter(Boolean);
  return segments.at(-1) ?? trimmed;
}

export async function createGist(
  transcriptPath: string,
  description: string,
  run: RunCommand = runCommand,
): Promise<string> {
  return (
    await run("gh", ["gist", "create", transcriptPath, "--desc", description])
  ).trim();
}

export async function downloadGist(
  gistUrl: string,
  run: RunCommand = runCommand,
): Promise<string> {
  return run("gh", ["gist", "view", gistIdFromUrl(gistUrl), "--raw"]);
}
