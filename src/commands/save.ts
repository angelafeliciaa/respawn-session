import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { locateActiveTranscript } from "../agents";
import { currentBranch, currentRepo, currentSha } from "../git";
import {
  defaultIndexPath,
  readIndex,
  recordSession,
  type SavedSession,
} from "../index-file";
import { createGist } from "../storage/gist";

export type SaveDeps = {
  indexPath?: string;
  mode?: "save" | "autosave";
  locateActiveTranscript?: typeof locateActiveTranscript;
  currentRepo?: typeof currentRepo;
  currentBranch?: typeof currentBranch;
  currentSha?: typeof currentSha;
  createGist?: typeof createGist;
  now?: () => Date;
};

export async function saveSession(deps: SaveDeps = {}): Promise<{
  message: string;
  saved: boolean;
  session: SavedSession;
}> {
  const locate = deps.locateActiveTranscript ?? locateActiveTranscript;
  const transcript = locate();
  if (!transcript) {
    throw new Error(
      "No active Claude Code or Codex session transcript found. Run respawn save inside an active agent session.",
    );
  }

  const repo = await (deps.currentRepo ?? currentRepo)();
  const branch = await (deps.currentBranch ?? currentBranch)();
  const sha = await (deps.currentSha ?? currentSha)();
  const indexPath = deps.indexPath ?? defaultIndexPath();
  const transcriptHash = await hashFile(transcript.path);

  if (deps.mode === "autosave") {
    const index = await readIndex(indexPath);
    const unchanged = index.sessions.some(
      (session) =>
        session.repo === repo &&
        session.branch === branch &&
        session.agent === transcript.agent &&
        session.sessionId === transcript.sessionId &&
        session.transcriptHash === transcriptHash,
    );
    if (unchanged) {
      return {
        message: `No transcript changes to autosave for ${branch}`,
        saved: false,
        session: [...index.sessions]
          .reverse()
          .find(
            (session) =>
              session.repo === repo &&
              session.branch === branch &&
              session.agent === transcript.agent &&
              session.sessionId === transcript.sessionId &&
              session.transcriptHash === transcriptHash,
          )!,
      };
    }
  }

  const gistUrl = await (deps.createGist ?? createGist)(
    transcript.path,
    `respawn: ${repo}@${branch}`,
  );

  const session: SavedSession = {
    repo,
    branch,
    gistUrl,
    sessionId: transcript.sessionId,
    sha,
    agent: transcript.agent,
    savedAt: (deps.now ?? (() => new Date()))().toISOString(),
    relativePath: transcript.relativePath,
    transcriptHash,
  };

  await recordSession(indexPath, session);
  return {
    message: `${deps.mode === "autosave" ? "Autosaved" : "Saved"} ${session.agent} session ${session.sessionId} for ${branch}`,
    saved: true,
    session,
  };
}

async function hashFile(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}
