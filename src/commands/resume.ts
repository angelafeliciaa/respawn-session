import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resumeCmd, targetTranscriptPath } from "../agents";
import { checkoutBranch, currentRepo } from "../git";
import { checkoutPr, getRespawnTag, repoKey } from "../github";
import {
  defaultIndexPath,
  findLatestSession,
  type SavedSession,
} from "../index-file";
import { downloadGist } from "../storage/gist";

export type ResumeDeps = {
  indexPath?: string;
  repo?: string;
  currentRepo?: typeof currentRepo;
  downloadGist?: typeof downloadGist;
  checkoutBranch?: typeof checkoutBranch;
  targetTranscriptPath?: typeof targetTranscriptPath;
};

export type ResumePrDeps = {
  repo?: string;
  currentRepo?: typeof currentRepo;
  getRespawnTag?: typeof getRespawnTag;
  downloadGist?: typeof downloadGist;
  checkoutPr?: typeof checkoutPr;
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

  const transcript = await (deps.downloadGist ?? downloadGist)(matchedSession.gistUrl);
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
  const tag = await (deps.getRespawnTag ?? getRespawnTag)(prRef, deps.repo);
  if (!tag || !reposMatch(tag.repo, repo)) {
    throw new Error(`No respawn PR tag found for ${repo}#${prRef}`);
  }

  const session = [...tag.sessions]
    .sort((a, b) => a.savedAt.localeCompare(b.savedAt))
    .at(-1);
  if (!session) {
    throw new Error(`Respawn PR tag for ${repo}#${prRef} has no sessions`);
  }

  const transcript = await (deps.downloadGist ?? downloadGist)(session.gistUrl);
  const path = (deps.targetTranscriptPath ?? targetTranscriptPath)(session);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, transcript);
  await (deps.checkoutPr ?? checkoutPr)(prRef, deps.repo);

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

function safeRepoKey(repo: string): string | null {
  try {
    return repoKey(repo);
  } catch {
    return null;
  }
}

function reposMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const aKey = safeRepoKey(a);
  const bKey = safeRepoKey(b);
  return Boolean(aKey && bKey && aKey === bKey);
}
