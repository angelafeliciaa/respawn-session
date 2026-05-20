import { locateActiveTranscript } from "../agents";
import { currentBranch, currentRepo, currentSha } from "../git";
import {
  defaultIndexPath,
  recordSession,
  type SavedSession,
} from "../index-file";
import { createGist } from "../storage/gist";

export type SaveDeps = {
  indexPath?: string;
  locateActiveTranscript?: typeof locateActiveTranscript;
  currentRepo?: typeof currentRepo;
  currentBranch?: typeof currentBranch;
  currentSha?: typeof currentSha;
  createGist?: typeof createGist;
  now?: () => Date;
};

export async function saveSession(deps: SaveDeps = {}): Promise<{
  message: string;
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
  };

  await recordSession(deps.indexPath ?? defaultIndexPath(), session);
  return {
    message: `Saved ${session.agent} session ${session.sessionId} for ${branch}`,
    session,
  };
}
