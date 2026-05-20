import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { listAllTranscripts } from "../agents";
import type { ImportableTranscript } from "../agents/types";
import { gitInfoForCwd, type GitInfo } from "../git";
import {
  defaultIndexPath,
  readIndex,
  recordSession,
  type SavedSession,
} from "../index-file";
import { createGist } from "../storage/gist";

export type ImportResult = {
  imported: number;
  duplicates: number;
  skipped: number;
  message: string;
};

export type ImportDeps = {
  indexPath?: string;
  listTranscripts?: typeof listAllTranscripts;
  gitInfoForCwd?: typeof gitInfoForCwd;
  createGist?: typeof createGist;
  now?: () => Date;
};

export async function importSessions(
  deps: ImportDeps = {},
): Promise<ImportResult> {
  const indexPath = deps.indexPath ?? defaultIndexPath();
  const transcripts = (deps.listTranscripts ?? listAllTranscripts)();
  const gitInfo = deps.gitInfoForCwd ?? gitInfoForCwd;
  const upload = deps.createGist ?? createGist;
  let imported = 0;
  let duplicates = 0;
  let skipped = 0;

  for (const transcript of transcripts) {
    const info = await gitInfo(transcript.cwd);
    if (!info) {
      skipped += 1;
      continue;
    }

    const transcriptHash = await hashFile(transcript.path);
    if (await isDuplicate(indexPath, info, transcript, transcriptHash)) {
      duplicates += 1;
      continue;
    }

    const gistUrl = await upload(
      transcript.path,
      `respawn: ${info.repo}@${info.branch}`,
    );
    const session: SavedSession = {
      repo: info.repo,
      branch: info.branch,
      gistUrl,
      sessionId: transcript.sessionId,
      sha: info.sha,
      agent: transcript.agent,
      savedAt: transcript.savedAt ?? (deps.now ?? (() => new Date()))().toISOString(),
      relativePath: transcript.relativePath,
      transcriptHash,
    };
    await recordSession(indexPath, session);
    imported += 1;
  }

  return {
    imported,
    duplicates,
    skipped,
    message: `Imported ${imported} sessions, skipped ${duplicates} duplicates and ${skipped} unavailable worktrees`,
  };
}

async function isDuplicate(
  indexPath: string,
  info: GitInfo,
  transcript: ImportableTranscript,
  transcriptHash: string,
): Promise<boolean> {
  const index = await readIndex(indexPath);
  return index.sessions.some(
    (session) =>
      session.repo === info.repo &&
      session.branch === info.branch &&
      session.agent === transcript.agent &&
      session.transcriptHash === transcriptHash,
  );
}

async function hashFile(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}
