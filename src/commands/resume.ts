import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resumeCmd, targetTranscriptPath } from "../agents";
import { checkoutBranch, currentRepo } from "../git";
import { checkoutPr, getRespawnTag } from "../github";
import {
  defaultIndexPath,
  findLatestSession,
  type SavedSession,
} from "../index-file";
import { downloadGist } from "../storage/gist";

export type ResumeDeps = {
  indexPath?: string;
  currentRepo?: typeof currentRepo;
  downloadGist?: typeof downloadGist;
  checkoutBranch?: typeof checkoutBranch;
  targetTranscriptPath?: typeof targetTranscriptPath;
};

export type ResumePrDeps = {
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
  const repo = await (deps.currentRepo ?? currentRepo)();
  const session = await findLatestSession(deps.indexPath ?? defaultIndexPath(), {
    repo,
    branch,
  });
  if (!session) {
    throw new Error(`No saved respawn session found for ${repo}@${branch}`);
  }

  const transcript = await (deps.downloadGist ?? downloadGist)(session.gistUrl);
  const path = (deps.targetTranscriptPath ?? targetTranscriptPath)(session);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, transcript);
  await (deps.checkoutBranch ?? checkoutBranch)(branch);

  return {
    command: resumeCmd(session.agent, session.sessionId),
    path,
    session,
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
  const repo = await (deps.currentRepo ?? currentRepo)();
  const tag = await (deps.getRespawnTag ?? getRespawnTag)(prRef);
  if (!tag || tag.repo !== repo) {
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
  await (deps.checkoutPr ?? checkoutPr)(prRef);

  return {
    command: resumeCmd(session.agent, session.sessionId),
    path,
    session,
  };
}
