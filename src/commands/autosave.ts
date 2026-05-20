import {
  currentPr,
  getRespawnTag,
  parseGitHubRepo,
  upsertRespawnComment,
} from "../github";
import type { RespawnPrTag } from "../github";
import { saveSession, type SaveDeps, type SaveResult } from "./save";

export type AutosaveDeps = SaveDeps & {
  saveSession?: typeof saveSession;
  currentPr?: typeof currentPr;
  getRespawnTag?: typeof getRespawnTag;
  upsertRespawnComment?: typeof upsertRespawnComment;
};

export type AutosaveResult = SaveResult & {
  tag?: RespawnPrTag;
};

export async function autosaveSession(
  deps: AutosaveDeps = {},
): Promise<AutosaveResult> {
  const {
    saveSession: save,
    currentPr: current,
    getRespawnTag: getTag,
    upsertRespawnComment: upsert,
    ...saveDeps
  } = deps;

  const saved = await (save ?? saveSession)({
    ...saveDeps,
    mode: "autosave",
  });

  const pr = await maybeCurrentPr(current ?? currentPr);
  if (!pr) return saved;

  try {
    const repo = parseGitHubRepo(saved.session.repo);
    const repoName = `${repo.owner}/${repo.name}`;
    const existing = await (getTag ?? getRespawnTag)(String(pr.number), repoName);
    const sessions = appendSession(existing?.sessions ?? [], saved.session);
    const tag: RespawnPrTag = {
      version: 1,
      repo: repoName,
      pr: pr.number,
      branch: pr.headRefName,
      sessions,
    };

    await (upsert ?? upsertRespawnComment)({
      owner: repo.owner,
      name: repo.name,
      pr: pr.number,
      tag,
    });

    return {
      ...saved,
      message: `${saved.message}; tagged PR #${pr.number} with session ${saved.session.sessionId}`,
      tag,
    };
  } catch (error) {
    return {
      ...saved,
      message: `${saved.message}; PR tag failed: ${errorMessage(error)}`,
    };
  }
}

async function maybeCurrentPr(
  detect: typeof currentPr,
): Promise<Awaited<ReturnType<typeof currentPr>> | null> {
  try {
    return await detect();
  } catch {
    return null;
  }
}

function appendSession(
  sessions: RespawnPrTag["sessions"],
  session: RespawnPrTag["sessions"][number],
): RespawnPrTag["sessions"] {
  const key = sessionKey(session);
  if (sessions.some((existing) => sessionKey(existing) === key)) {
    return sessions;
  }
  return [...sessions, session];
}

function sessionKey(session: RespawnPrTag["sessions"][number]): string {
  return `${session.agent}:${session.sessionId}:${session.gistUrl}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
