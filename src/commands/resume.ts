import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resumeCmd, targetTranscriptPath } from "../agents";
import { checkoutBranch, checkoutSavedCommit, currentRepo } from "../git";
import { checkoutPr, prNumberFromRef, repoKey } from "../github";
import {
  defaultIndexPath,
  findLatestSession,
  findLatestPrSession,
  type SavedSession,
} from "../index-file";
import { readTranscript } from "../storage/local";

export type ResumeDeps = {
  indexPath?: string;
  repo?: string;
  currentRepo?: typeof currentRepo;
  readTranscript?: typeof readTranscript;
  checkoutBranch?: typeof checkoutBranch;
  targetTranscriptPath?: typeof targetTranscriptPath;
};

export type ResumePrDeps = {
  indexPath?: string;
  repo?: string;
  currentRepo?: typeof currentRepo;
  readTranscript?: typeof readTranscript;
  checkoutPr?: typeof checkoutPr;
  checkoutSavedCommit?: typeof checkoutSavedCommit;
  targetTranscriptPath?: typeof targetTranscriptPath;
};

export async function resumeSession(
  branch: string,
  deps: ResumeDeps = {},
): Promise<{
  command: string[];
  path: string;
  session: SavedSession;
}> {
  const repo = deps.repo ?? (await (deps.currentRepo ?? currentRepo)());
  const session = await findLatestSession(deps.indexPath ?? defaultIndexPath(), {
    repo: repo,
    branch,
  });
  const matchedSession =
    session ??
    (await findLatestByRepoKey(deps.indexPath ?? defaultIndexPath(), repo, branch));
  if (!matchedSession) {
    throw new Error(`No saved respawn session found for ${repo}@${branch}`);
  }

  const transcript = await (deps.readTranscript ?? readTranscript)(
    sessionPath(matchedSession),
  );
  const path = (deps.targetTranscriptPath ?? targetTranscriptPath)(matchedSession);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, transcript);
  await (deps.checkoutBranch ?? checkoutBranch)(branch);

  return {
    command: resumeCmd(matchedSession.agent, matchedSession.sessionId),
    path,
    session: matchedSession,
  };
}

export async function resumePrSession(
  prRef: string,
  deps: ResumePrDeps = {},
): Promise<{
  command: string[];
  path: string;
  session: SavedSession;
}> {
  const repo = deps.repo ?? (await (deps.currentRepo ?? currentRepo)());
  const pr = Number(prNumberFromRef(prRef));
  const indexPath = deps.indexPath ?? defaultIndexPath();
  const session = Number.isFinite(pr)
    ? (await findLatestPrSession(indexPath, { repo, pr })) ??
      (await findLatestPrByRepoKey(indexPath, repo, pr))
    : null;
  if (!session) {
    throw new Error(`No local respawn session found for ${repo}#${prRef}`);
  }

  const transcript = await (deps.readTranscript ?? readTranscript)(sessionPath(session));
  const path = (deps.targetTranscriptPath ?? targetTranscriptPath)(session);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, transcript);
  await checkoutPrOrSavedCommit(prRef, session, deps);

  return {
    command: resumeCmd(session.agent, session.sessionId),
    path,
    session,
  };
}

async function findLatestByRepoKey(
  indexPath: string,
  repo: string,
  branch: string,
): Promise<SavedSession | null> {
  const { readIndex } = await import("../index-file");
  const key = repoKey(repo);
  const index = await readIndex(indexPath);
  return (
    index.sessions
      .filter(
        (session) =>
          session.branch === branch && safeRepoKey(session.repo) === key,
      )
      .sort((a, b) => a.savedAt.localeCompare(b.savedAt))
      .at(-1) ?? null
  );
}

async function findLatestPrByRepoKey(
  indexPath: string,
  repo: string,
  pr: number,
): Promise<SavedSession | null> {
  const { readIndex } = await import("../index-file");
  const key = repoKey(repo);
  const index = await readIndex(indexPath);
  return (
    index.sessions
      .filter(
        (session) =>
          session.pr === pr && safeRepoKey(session.repo) === key,
      )
      .sort((a, b) => a.savedAt.localeCompare(b.savedAt))
      .at(-1) ?? null
  );
}

function safeRepoKey(repo: string): string | null {
  try {
    return repoKey(repo);
  } catch {
    return null;
  }
}

async function checkoutPrOrSavedCommit(
  prRef: string,
  session: SavedSession,
  deps: ResumePrDeps,
): Promise<void> {
  try {
    await (deps.checkoutPr ?? checkoutPr)(prRef, deps.repo);
  } catch (error) {
    const branch = `respawn/pr-${prNumberFromRef(prRef)}`;
    try {
      await (deps.checkoutSavedCommit ?? checkoutSavedCommit)(branch, session.sha);
    } catch (fallbackError) {
      throw new Error(
        `Could not checkout PR ${prRef}, and could not restore saved commit ${session.sha}: ${String((fallbackError as Error).message ?? fallbackError)}. Original checkout error: ${String((error as Error).message ?? error)}`,
      );
    }
  }
}

function sessionPath(session: SavedSession): string {
  if (session.transcriptPath) return session.transcriptPath;
  if (session.gistUrl) {
    throw new Error(
      "This saved session points to a GitHub gist. respawn is local-only now; re-import the session from a local transcript.",
    );
  }
  throw new Error("Saved session is missing a local transcript path");
}
