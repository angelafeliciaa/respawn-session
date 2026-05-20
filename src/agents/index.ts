import type { LocatedTranscript, LocateOptions } from "./types";
import * as claude from "./claude";
import * as codex from "./codex";

export function locateActiveTranscript(
  options: LocateOptions = {},
): LocatedTranscript | null {
  return (
    claude.locateTranscript(options) ??
    codex.locateTranscript(options)
  );
}

export function resumeCmd(agent: LocatedTranscript["agent"], sessionId: string): string[] {
  if (agent === "claude") return claude.resumeCmd(sessionId);
  return codex.resumeCmd(sessionId);
}

export function targetTranscriptPath(
  transcript: Pick<LocatedTranscript, "agent" | "sessionId" | "relativePath">,
  options: LocateOptions = {},
): string {
  if (transcript.agent === "claude") {
    return claude.transcriptPath(transcript.sessionId, options);
  }
  if (!transcript.relativePath) {
    throw new Error("Codex session is missing its transcript relative path");
  }
  return codex.transcriptPath(transcript.relativePath, options.home);
}
