import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ImportableTranscript, LocatedTranscript, LocateOptions } from "./types";

export function encodeClaudeProjectPath(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9._-]/g, "-");
}

export function transcriptPath(
  sessionId: string,
  options: LocateOptions = {},
): string {
  const cwd = options.cwd ?? process.cwd();
  const home = options.home ?? homedir();
  return join(
    home,
    ".claude",
    "projects",
    encodeClaudeProjectPath(cwd),
    `${sessionId}.jsonl`,
  );
}

export function locateTranscript(
  options: LocateOptions = {},
): LocatedTranscript | null {
  const env = options.env ?? process.env;
  const sessionId = env.CLAUDE_SESSION_ID;
  if (sessionId) {
    const path = transcriptPath(sessionId, options);
    if (existsSync(path)) return { agent: "claude", path, sessionId };
  }

  return locateFromSessionRegistry(options);
}

export function resumeCmd(sessionId: string): string[] {
  return ["claude", "--resume", sessionId];
}

export function listTranscripts(options: LocateOptions = {}): ImportableTranscript[] {
  const home = options.home ?? homedir();
  const sessionsDir = join(home, ".claude", "sessions");
  if (!existsSync(sessionsDir)) return [];

  return readdirSync(sessionsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => readSessionRecord(join(sessionsDir, entry.name)))
    .filter(
      (record): record is Required<Pick<ClaudeSessionRecord, "sessionId" | "cwd">> &
        ClaudeSessionRecord => Boolean(record?.sessionId && record.cwd),
    )
    .map((record): ImportableTranscript | null => {
      const path = transcriptPath(record.sessionId, {
        ...options,
        cwd: record.cwd,
      });
      if (!existsSync(path)) return null;
      return {
        agent: "claude" as const,
        path,
        sessionId: record.sessionId,
        cwd: record.cwd,
        savedAt: record.updatedAt
          ? new Date(record.updatedAt).toISOString()
          : undefined,
      };
    })
    .filter((transcript): transcript is ImportableTranscript => transcript !== null);
}

type ClaudeSessionRecord = {
  sessionId?: string;
  cwd?: string;
  updatedAt?: number;
};

function locateFromSessionRegistry(
  options: LocateOptions = {},
): LocatedTranscript | null {
  const cwd = options.cwd ?? process.cwd();
  const home = options.home ?? homedir();
  const sessionsDir = join(home, ".claude", "sessions");
  if (!existsSync(sessionsDir)) return null;

  const records = readdirSync(sessionsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => readSessionRecord(join(sessionsDir, entry.name)))
    .filter(
      (record): record is Required<Pick<ClaudeSessionRecord, "sessionId" | "cwd">> &
        ClaudeSessionRecord => Boolean(record?.sessionId && record.cwd === cwd),
    )
    .sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0));

  for (const record of records.reverse()) {
    const path = transcriptPath(record.sessionId, options);
    if (existsSync(path)) {
      return { agent: "claude", path, sessionId: record.sessionId };
    }
  }

  return null;
}

function readSessionRecord(path: string): ClaudeSessionRecord | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ClaudeSessionRecord;
  } catch {
    return null;
  }
}
