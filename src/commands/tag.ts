import {
  currentPr,
  getRespawnTag,
  parseGitHubRepo,
  upsertRespawnComment,
} from "../github";
import type { RespawnPrTag } from "../github";
import { saveSession } from "./save";

export type TagDeps = {
  saveSession?: typeof saveSession;
  currentPr?: typeof currentPr;
  getRespawnTag?: typeof getRespawnTag;
  upsertRespawnComment?: typeof upsertRespawnComment;
};

export async function tagCurrentPr(deps: TagDeps = {}): Promise<{
  message: string;
  tag: RespawnPrTag;
}> {
  const saved = await (deps.saveSession ?? saveSession)();
  const pr = await (deps.currentPr ?? currentPr)();
  const repo = parseGitHubRepo(saved.session.repo);
  const existing = await (deps.getRespawnTag ?? getRespawnTag)(String(pr.number));
  const tag: RespawnPrTag = {
    version: 1,
    repo: saved.session.repo,
    pr: pr.number,
    branch: saved.session.branch,
    sessions: [...(existing?.sessions ?? []), saved.session],
  };

  await (deps.upsertRespawnComment ?? upsertRespawnComment)({
    owner: repo.owner,
    name: repo.name,
    pr: pr.number,
    tag,
  });

  return {
    message: `Tagged PR #${pr.number} with ${saved.session.agent} session ${saved.session.sessionId}`,
    tag,
  };
}
