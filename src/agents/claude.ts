import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { LocatedTranscript, LocateOptions } from "./types";

export function encodeClaudeProjectPath(cwd: string): string {
  return cwd.replaceAll("/", "-");
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
  if (!sessionId) return null;

  const path = transcriptPath(sessionId, options);
  if (!existsSync(path)) return null;

  return { agent: "claude", path, sessionId };
}

export function resumeCmd(sessionId: string): string[] {
  return ["claude", "--resume", sessionId];
}
