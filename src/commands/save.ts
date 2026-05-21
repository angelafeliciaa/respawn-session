import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { locateActiveTranscript } from "../agents";
import { currentBranch, currentRepo, currentSha } from "../git";
import {
  defaultIndexPath,
  readIndex,
  recordSession,
  updateSessions,
  type SavedSession,
} from "../index-file";
import { saveTranscript } from "../storage/local";

export type SaveDeps = {
  indexPath?: string;
  mode?: "save" | "autosave";
  locateActiveTranscript?: typeof locateActiveTranscript;
  currentRepo?: typeof currentRepo;
  currentBranch?: typeof currentBranch;
  currentSha?: typeof currentSha;
  saveTranscript?: typeof saveTranscript;
  sessionPatch?: Partial<Pick<SavedSession, "pr" | "prUrl">>;
  now?: () => Date;
};

export type SaveResult = {
  message: string;
  saved: boolean;
  session: SavedSession;
};

export async function saveSession(deps: SaveDeps = {}): Promise<SaveResult> {
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
    const unchanged = [...index.sessions]
      .reverse()
      .find(
        (session) =>
          session.repo === repo &&
          session.branch === branch &&
          session.agent === transcript.agent &&
          session.sessionId === transcript.sessionId &&
          session.transcriptHash === transcriptHash,
      );
    if (unchanged) {
      const session = await applySessionPatch(indexPath, unchanged, deps.sessionPatch);
      return {
        message: `No transcript changes to autosave for ${branch}`,
        saved: false,
        session,
      };
    }
  }

  const transcriptPath = await (deps.saveTranscript ?? saveTranscript)(transcript.path);

  const session: SavedSession = {
    repo,
    branch,
    transcriptPath,
    sessionId: transcript.sessionId,
    sha,
    agent: transcript.agent,
    savedAt: (deps.now ?? (() => new Date()))().toISOString(),
    relativePath: transcript.relativePath,
    transcriptHash,
    ...deps.sessionPatch,
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

async function applySessionPatch(
  indexPath: string,
  session: SavedSession,
  patch?: Partial<Pick<SavedSession, "pr" | "prUrl">>,
): Promise<SavedSession> {
  if (!patch || Object.keys(patch).length === 0) return session;
  const patched = { ...session, ...patch };
  await updateSessions(indexPath, (candidate) =>
    sameSavedSession(candidate, session) ? patched : candidate,
  );
  return patched;
}

function sameSavedSession(a: SavedSession, b: SavedSession): boolean {
  return (
    a.repo === b.repo &&
    a.branch === b.branch &&
    a.agent === b.agent &&
    a.sessionId === b.sessionId &&
    a.savedAt === b.savedAt &&
    a.transcriptHash === b.transcriptHash
  );
}
