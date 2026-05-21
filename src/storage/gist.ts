import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { redactSecrets } from "../secrets";
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
  const uploadPath = await redactedUploadPath(transcriptPath);
  try {
    return (
      await run("gh", ["gist", "create", uploadPath, "--desc", description])
    ).trim();
  } finally {
    if (uploadPath !== transcriptPath) {
      await rm(join(uploadPath, ".."), { recursive: true, force: true });
    }
  }
}

export async function downloadGist(
  gistUrl: string,
  run: RunCommand = runCommand,
): Promise<string> {
  return run("gh", ["gist", "view", gistIdFromUrl(gistUrl), "--raw"]);
}

async function redactedUploadPath(transcriptPath: string): Promise<string> {
  const raw = await readFile(transcriptPath, "utf8");
  const redacted = redactSecrets(raw);
  if (redacted.redactions === 0) return transcriptPath;

  const dir = await mkdtemp(join(tmpdir(), "respawn-redacted-"));
  const path = join(dir, basename(transcriptPath));
  await writeFile(path, redacted.content);
  return path;
}
