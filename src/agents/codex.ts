import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative } from "node:path";
import type { ImportableTranscript, LocatedTranscript, LocateOptions } from "./types";

const uuidPattern =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

type CodexMeta = {
  id: string;
  cwd?: string;
};

export function codexSessionsDir(home = homedir()): string {
  return join(home, ".codex", "sessions");
}

export function sessionIdFromCodexPath(path: string): string | null {
  return basename(path).match(uuidPattern)?.[0] ?? null;
}

export function transcriptPath(relativePath: string, home = homedir()): string {
  return join(codexSessionsDir(home), relativePath);
}

export function locateTranscript(
  options: LocateOptions = {},
): LocatedTranscript | null {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const home = options.home ?? homedir();
  const sessionsDir = codexSessionsDir(home);

  const envPath = env.CODEX_TUI_SESSION_LOG_PATH;
  if (envPath && existsSync(envPath)) {
    const located = locatedFromPath(envPath, cwd, sessionsDir, true);
    if (located) return located;
  }

  if (!existsSync(sessionsDir)) return null;

  const desiredId = env.CODEX_SESSION_ID;
  const candidates = walkJsonl(sessionsDir)
    .map((path) => locatedFromPath(path, cwd, sessionsDir, false))
    .filter((session): session is LocatedTranscript => Boolean(session))
    .filter((session) => !desiredId || session.sessionId === desiredId);

  return [...candidates]
    .sort((a, b) => statSync(a.path).mtimeMs - statSync(b.path).mtimeMs)
    .at(-1) ?? null;
}

export function resumeCmd(sessionId: string): string[] {
  return ["codex", "resume", sessionId];
}

export function listTranscripts(options: LocateOptions = {}): ImportableTranscript[] {
  const home = options.home ?? homedir();
  const sessionsDir = codexSessionsDir(home);
  if (!existsSync(sessionsDir)) return [];

  return walkJsonl(sessionsDir)
    .map((path): ImportableTranscript | null => {
      const meta = readCodexMeta(path);
      const sessionId = meta?.id ?? sessionIdFromCodexPath(path);
      if (!sessionId || !meta?.cwd) return null;

      const rel = relative(sessionsDir, path);
      return {
        agent: "codex" as const,
        path,
        sessionId,
        cwd: meta.cwd,
        relativePath: rel.startsWith("..") ? undefined : rel,
        savedAt: statSync(path).mtime.toISOString(),
      };
    })
    .filter((transcript): transcript is ImportableTranscript => transcript !== null);
}

function locatedFromPath(
  path: string,
  cwd: string,
  sessionsDir: string,
  requireMatchingCwd: boolean,
): LocatedTranscript | null {
  const meta = readCodexMeta(path);
  const sessionId = meta?.id ?? sessionIdFromCodexPath(path);
  if (!sessionId) return null;
  if (requireMatchingCwd && meta?.cwd && meta.cwd !== cwd) return null;
  if (!requireMatchingCwd && meta?.cwd !== cwd) return null;

  const rel = relative(sessionsDir, path);
  return {
    agent: "codex",
    path,
    sessionId,
    relativePath: rel.startsWith("..") ? undefined : rel,
  };
}

function readCodexMeta(path: string): CodexMeta | null {
  try {
    const lines = readFileSync(path, "utf8").split("\n").slice(0, 20);
    for (const line of lines) {
      if (!line.trim()) continue;
      const parsed = JSON.parse(line) as {
        type?: string;
        payload?: { id?: string; cwd?: string };
      };
      if (parsed.type === "session_meta" && parsed.payload?.id) {
        return { id: parsed.payload.id, cwd: parsed.payload.cwd };
      }
    }
  } catch {
    return null;
  }
  return null;
}

function walkJsonl(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walkJsonl(path);
    return entry.isFile() && entry.name.endsWith(".jsonl") ? [path] : [];
  });
}
