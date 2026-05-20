import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type AgentName = "claude" | "codex";

export type SavedSession = {
  repo: string;
  branch: string;
  gistUrl: string;
  sessionId: string;
  sha: string;
  agent: AgentName;
  savedAt: string;
  relativePath?: string;
};

export type RespawnIndex = {
  version: 1;
  sessions: SavedSession[];
};

export type SessionQuery = {
  repo: string;
  branch: string;
};

export function defaultIndexPath(home = homedir()): string {
  return join(home, ".respawn", "index.json");
}

export async function readIndex(path = defaultIndexPath()): Promise<RespawnIndex> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as RespawnIndex;
    return {
      version: 1,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, sessions: [] };
    }
    throw error;
  }
}

export async function writeIndex(
  path: string,
  index: RespawnIndex,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(index, null, 2)}\n`);
}

export async function recordSession(
  path: string,
  session: SavedSession,
): Promise<SavedSession> {
  const index = await readIndex(path);
  index.sessions.push(session);
  await writeIndex(path, index);
  return session;
}

export async function findSessions(
  path: string,
  query: SessionQuery,
): Promise<SavedSession[]> {
  const index = await readIndex(path);
  return index.sessions.filter(
    (session) => session.repo === query.repo && session.branch === query.branch,
  );
}

export async function findLatestSession(
  path: string,
  query: SessionQuery,
): Promise<SavedSession | null> {
  const sessions = await findSessions(path, query);
  return sessions
    .toSorted((a, b) => a.savedAt.localeCompare(b.savedAt))
    .at(-1) ?? null;
}
