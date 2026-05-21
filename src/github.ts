import { runCommand, type RunCommand } from "./shell";

export type GitHubRepo = {
  owner: string;
  name: string;
};

export type PrInfo = {
  number: number;
  url: string;
  headRefName: string;
  headRefOid?: string;
  state?: string;
  title?: string;
  commits?: Array<{ oid: string }>;
};

export function parseGitHubRepo(remote: string): GitHubRepo {
  const trimmed = remote.trim();
  const prUrl = trimmed.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/\d+$/,
  );
  if (prUrl) return { owner: prUrl[1], name: prUrl[2].replace(/\.git$/, "") };

  const ssh = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (ssh) return { owner: ssh[1], name: ssh[2] };

  const https = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (https) return { owner: https[1], name: https[2] };

  const short = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (short) return { owner: short[1], name: short[2].replace(/\.git$/, "") };

  throw new Error(`Unsupported GitHub remote: ${remote}`);
}

export function repoKey(remote: string): string {
  const repo = parseGitHubRepo(remote);
  return `${repo.owner}/${repo.name}`;
}

export function prNumberFromRef(prRef: string): string {
  return prRef.match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/)?.[1] ?? prRef;
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

export async function listPullRequests(
  repo: string,
  run: RunCommand = runCommand,
): Promise<PrInfo[]> {
  const raw = await run("gh", [
    "pr",
    "list",
    "--repo",
    repo,
    "--state",
    "all",
    "--limit",
    "1000",
    "--json",
    "number,url,headRefName,headRefOid,state,title",
  ]);
  return JSON.parse(raw) as PrInfo[];
}

export async function checkoutPr(
  prRef: string,
  repo?: string,
  run: RunCommand = runCommand,
): Promise<void> {
  const args = ["pr", "checkout", prNumberFromRef(prRef)];
  if (repo) args.push("--repo", repo);
  await run("gh", args);
}
