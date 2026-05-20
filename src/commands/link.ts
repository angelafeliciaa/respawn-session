import {
  listPullRequests,
  parseGitHubRepo,
  repoKey,
  upsertRespawnComment,
  type PrInfo,
  type RespawnPrTag,
} from "../github";
import {
  defaultIndexPath,
  readIndex,
  type SavedSession,
} from "../index-file";

export type LinkResult = {
  linked: number;
  dryRun: boolean;
  unmatchedSessions: number;
  message: string;
};

export type LinkDeps = {
  indexPath?: string;
  dryRun?: boolean;
  listPullRequests?: typeof listPullRequests;
  upsertRespawnComment?: typeof upsertRespawnComment;
};

export async function linkRepo(
  repo: string,
  deps: LinkDeps = {},
): Promise<LinkResult> {
  const index = await readIndex(deps.indexPath ?? defaultIndexPath());
  const key = repoKey(repo);
  const sessions = index.sessions.filter((session) => safeRepoKey(session.repo) === key);
  const prs = await (deps.listPullRequests ?? listPullRequests)(key);
  const used = new Set<SavedSession>();
  const details: string[] = [];
  let linked = 0;

  for (const pr of prs) {
    const matches = uniqueSessions(
      sessions.filter((session) => sessionMatchesPr(session, pr)),
    );
    if (matches.length === 0) continue;

    for (const session of matches) used.add(session);
    linked += 1;
    details.push(
      `  #${pr.number} ${pr.headRefName} (${matches.length} ${plural(matches.length, "session")})`,
    );

    if (!deps.dryRun) {
      const parsed = parseGitHubRepo(key);
      await (deps.upsertRespawnComment ?? upsertRespawnComment)({
        owner: parsed.owner,
        name: parsed.name,
        pr: pr.number,
        tag: {
          version: 1,
          repo: key,
          pr: pr.number,
          branch: pr.headRefName,
          sessions: matches.sort((a, b) => a.savedAt.localeCompare(b.savedAt)),
        },
      });
    }
  }

  const unmatchedSessions = sessions.filter((session) => !used.has(session)).length;
  const prefix = deps.dryRun ? "Would link" : "Linked";
  return {
    linked,
    dryRun: Boolean(deps.dryRun),
    unmatchedSessions,
    message: [
      `${prefix} ${linked} PRs in ${key}; ${unmatchedSessions} ${plural(unmatchedSessions, "session")} unmatched`,
      ...details,
    ].join("\n"),
  };
}

function sessionMatchesPr(session: SavedSession, pr: PrInfo): boolean {
  if (session.branch === pr.headRefName) return true;
  if (pr.headRefOid && session.sha === pr.headRefOid) return true;
  return Boolean(pr.commits?.some((commit) => commit.oid === session.sha));
}

function uniqueSessions(sessions: SavedSession[]): SavedSession[] {
  const seen = new Set<string>();
  return sessions.filter((session) => {
    const key = `${session.agent}:${session.sessionId}:${session.gistUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function safeRepoKey(repo: string): string | null {
  try {
    return repoKey(repo);
  } catch {
    return null;
  }
}

function plural(count: number, noun: string): string {
  return `${noun}${count === 1 ? "" : "s"}`;
}
