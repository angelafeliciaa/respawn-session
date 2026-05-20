import packageJson from "../../package.json" with { type: "json" };
import { runCommand, type RunCommand } from "../shell";

export const currentVersion = packageJson.version;

export function versionText(version = currentVersion): string {
  return `respawn-session ${version}`;
}

export type UpdateDeps = {
  currentVersion?: string;
  run?: RunCommand;
};

export async function updateRespawn(deps: UpdateDeps = {}): Promise<string> {
  const version = deps.currentVersion ?? currentVersion;
  const run = deps.run ?? runCommand;
  const latest = (await run("npm", ["view", "respawn-session", "version"])).trim();

  if (latest === version) {
    return `respawn-session is already up to date at ${version}`;
  }

  await run("npm", ["install", "-g", "respawn-session@latest"]);
  return `Updated respawn-session ${version} -> ${latest}`;
}
