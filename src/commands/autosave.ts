import { currentPr } from "../github";
import { saveSession, type SaveDeps, type SaveResult } from "./save";

export type AutosaveDeps = SaveDeps & {
  saveSession?: typeof saveSession;
  currentPr?: typeof currentPr;
};

export type AutosaveResult = SaveResult & {
  pr?: number;
};

export async function autosaveSession(
  deps: AutosaveDeps = {},
): Promise<AutosaveResult> {
  const {
    saveSession: save,
    currentPr: current,
    ...saveDeps
  } = deps;

  const pr = await maybeCurrentPr(current ?? currentPr);
  const saved = await (save ?? saveSession)({
    ...saveDeps,
    mode: "autosave",
    sessionPatch: pr
      ? { pr: pr.number, prUrl: pr.url }
      : saveDeps.sessionPatch,
  });

  if (!pr) return saved;
  return {
    ...saved,
    message: `${saved.message}; linked local PR #${pr.number}`,
    pr: pr.number,
  };
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
