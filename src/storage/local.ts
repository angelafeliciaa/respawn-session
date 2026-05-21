import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";

export function defaultTranscriptStore(home = homedir()): string {
  return join(home, ".respawn", "transcripts");
}

export async function saveTranscript(
  transcriptPath: string,
  storeDir = defaultTranscriptStore(),
): Promise<string> {
  const content = await readFile(transcriptPath);
  const hash = createHash("sha256").update(content).digest("hex");
  const target = join(storeDir, `${hash}-${basename(transcriptPath)}`);
  await mkdir(storeDir, { recursive: true });
  await copyFile(transcriptPath, target);
  return target;
}

export async function readTranscript(transcriptPath: string): Promise<string> {
  if (/^https:\/\/gist\.github\.com\//.test(transcriptPath)) {
    throw new Error(
      "This session points to a GitHub gist. respawn is local-only now; re-import the session from a local transcript.",
    );
  }
  return readFile(transcriptPath, "utf8");
}
