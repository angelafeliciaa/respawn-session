import { defaultIndexPath, readIndex } from "../index-file";

export type ListDeps = {
  indexPath?: string;
};

export async function listSessions(deps: ListDeps = {}): Promise<string> {
  const index = await readIndex(deps.indexPath ?? defaultIndexPath());
  return index.sessions
    .map((session) =>
      [
        session.savedAt,
        session.agent,
        `${session.repo}@${session.branch}`,
        session.sessionId,
        session.sha,
        session.pr ? `#${session.pr}` : "-",
        session.transcriptPath ?? "(missing local transcript)",
      ].join(" "),
    )
    .join("\n");
}
