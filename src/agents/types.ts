import type { AgentName } from "../index-file";

export type LocatedTranscript = {
  agent: AgentName;
  path: string;
  sessionId: string;
  relativePath?: string;
};

export type LocateOptions = {
  cwd?: string;
  home?: string;
  env?: NodeJS.ProcessEnv;
};
