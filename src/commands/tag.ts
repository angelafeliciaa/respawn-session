import { currentPr } from "../github";
import type { SavedSession } from "../index-file";
import { saveSession } from "./save";

export type TagDeps = {
  saveSession?: typeof saveSession;
  currentPr?: typeof currentPr;
};

export type LocalPrLink = {
  repo: string;
  pr: number;
  branch: string;
  session: SavedSession;
};

export async function tagCurrentPr(deps: TagDeps = {}): Promise<{
  message: string;
  tag: LocalPrLink;
}> {
  const pr = await (deps.currentPr ?? currentPr)();
  const saved = await (deps.saveSession ?? saveSession)({
    sessionPatch: { pr: pr.number, prUrl: pr.url },
  });
  const tag: LocalPrLink = {
    repo: saved.session.repo,
    pr: pr.number,
    branch: saved.session.branch,
    session: saved.session,
  };

  return {
    message: `Linked local PR #${pr.number} with ${saved.session.agent} session ${saved.session.sessionId}`,
    tag,
  };
}
