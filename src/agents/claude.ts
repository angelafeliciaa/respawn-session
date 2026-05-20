import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { ImportableTranscript, LocatedTranscript, LocateOptions } from "./types";

export function encodeClaudeProjectPath(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9_-]/g, "-");
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
  const projectTranscripts = listProjectTranscripts(home);
  const sessionsDir = join(home, ".claude", "sessions");
  if (!existsSync(sessionsDir)) return projectTranscripts;

  const registryTranscripts = readdirSync(sessionsDir, { withFileTypes: true })
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

  return uniqueByPath([
    ...projectTranscripts,
    ...registryTranscripts,
  ]);
}

type ClaudeSessionRecord = {
  sessionId?: string;
  cwd?: string;
  updatedAt?: number;
};

type ClaudeProjectMeta = {
  sessionId?: string;
  cwd?: string;
  gitBranch?: string;
  timestamp?: string;
};

function listProjectTranscripts(home: string): ImportableTranscript[] {
  const projectsDir = join(home, ".claude", "projects");
  if (!existsSync(projectsDir)) return [];

  return readdirSync(projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((project) =>
      readdirSync(join(projectsDir, project.name), { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
        .map((entry) => join(projectsDir, project.name, entry.name)),
    )
    .map((path): ImportableTranscript | null => {
      const meta = readProjectTranscriptMeta(path);
      const sessionId = meta?.sessionId ?? basename(path, ".jsonl");
      if (!sessionId || !meta?.cwd) return null;
      return {
        agent: "claude" as const,
        path,
        sessionId,
        cwd: meta.cwd,
        branch:
          meta.gitBranch && meta.gitBranch !== "HEAD"
            ? meta.gitBranch
            : undefined,
        savedAt: meta.timestamp
          ? new Date(meta.timestamp).toISOString()
          : statSync(path).mtime.toISOString(),
      };
    })
    .filter((transcript): transcript is ImportableTranscript => transcript !== null);
}

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

function readProjectTranscriptMeta(path: string): ClaudeProjectMeta | null {
  try {
    const lines = readFileSync(path, "utf8").split("\n").slice(0, 100);
    const meta: ClaudeProjectMeta = {};
    for (const line of lines) {
      if (!line.trim()) continue;
      const parsed = JSON.parse(line) as ClaudeProjectMeta;
      meta.sessionId ??= parsed.sessionId;
      meta.cwd ??= parsed.cwd;
      meta.gitBranch ??= parsed.gitBranch;
      meta.timestamp ??= parsed.timestamp;
      if (meta.cwd && meta.sessionId && meta.gitBranch) return meta;
    }
    return meta.cwd ? meta : null;
  } catch {
    return null;
  }
}

function uniqueByPath(transcripts: ImportableTranscript[]): ImportableTranscript[] {
  const seen = new Set<string>();
  return transcripts.filter((transcript) => {
    if (seen.has(transcript.path)) return false;
    seen.add(transcript.path);
    return true;
  });
}
