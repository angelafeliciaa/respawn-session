import type { SavedSession } from "./index-file";
import { runCommand, type RunCommand } from "./shell";

const markerStart = "<!-- respawn-session";
const markerEnd = "-->";

export type GitHubRepo = {
  owner: string;
  name: string;
};

export type PrInfo = {
  number: number;
  url: string;
  headRefName: string;
};

export type RespawnPrTag = {
  version: 1;
  repo: string;
  pr: number;
  branch: string;
  sessions: SavedSession[];
};

type GhComment = {
  id?: string;
  body?: string;
};

export function parseGitHubRepo(remote: string): GitHubRepo {
  const trimmed = remote.trim();
  const ssh = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (ssh) return { owner: ssh[1], name: ssh[2] };

  const https = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (https) return { owner: https[1], name: https[2] };

  throw new Error(`Unsupported GitHub remote: ${remote}`);
}

export function encodeRespawnComment(tag: RespawnPrTag): string {
  return `${markerStart}\n${JSON.stringify(tag, null, 2)}\n${markerEnd}`;
}

export function decodeRespawnComment(body: string): RespawnPrTag | null {
  const start = body.indexOf(markerStart);
  if (start === -1) return null;
  const jsonStart = start + markerStart.length;
  const end = body.indexOf(markerEnd, jsonStart);
  if (end === -1) return null;

  try {
    const parsed = JSON.parse(body.slice(jsonStart, end).trim()) as RespawnPrTag;
    return parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export async function currentPr(run: RunCommand = runCommand): Promise<PrInfo> {
  const raw = await run("gh", [
    "pr",
    "view",
    "--json",
    "number,url,headRefName",
  ]);
  const parsed = JSON.parse(raw) as PrInfo;
  return parsed;
}

export async function getRespawnTag(
  prRef: string,
  run: RunCommand = runCommand,
): Promise<RespawnPrTag | null> {
  const raw = await run("gh", ["pr", "view", prRef, "--json", "comments"]);
  const parsed = JSON.parse(raw) as { comments?: GhComment[] };
  return findRespawnComment(parsed.comments ?? [])?.tag ?? null;
}

export async function upsertRespawnComment(
  input: {
    owner: string;
    name: string;
    pr: number;
    tag: RespawnPrTag;
  },
  run: RunCommand = runCommand,
): Promise<RespawnPrTag> {
  const raw = await run("gh", [
    "pr",
    "view",
    String(input.pr),
    "--json",
    "comments",
  ]);
  const parsed = JSON.parse(raw) as { comments?: GhComment[] };
  const existing = findRespawnComment(parsed.comments ?? []);
  const body = encodeRespawnComment(input.tag);

  if (existing?.id) {
    await run("gh", [
      "api",
      `repos/${input.owner}/${input.name}/issues/comments/${existing.id}`,
      "-X",
      "PATCH",
      "-f",
      `body=${body}`,
    ]);
  } else {
    await run("gh", ["pr", "comment", String(input.pr), "--body", body]);
  }

  return input.tag;
}

export async function checkoutPr(
  prRef: string,
  run: RunCommand = runCommand,
): Promise<void> {
  await run("gh", ["pr", "checkout", prRef]);
}

function findRespawnComment(
  comments: GhComment[],
): { id?: string; tag: RespawnPrTag } | null {
  for (const comment of comments) {
    if (!comment.body) continue;
    const tag = decodeRespawnComment(comment.body);
    if (tag) return { id: comment.id, tag };
  }
  return null;
}
