import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { defaultIndexPath, readIndex, writeIndex } from "../index-file";

type ClaudeSettings = {
  hooks?: Record<string, Array<{ matcher?: string; hooks?: HookCommand[] }>>;
};

type HookCommand = {
  type: "command";
  command: string;
};

export type InitDeps = {
  home?: string;
  indexPath?: string;
};

export async function initRespawn(deps: InitDeps = {}): Promise<string> {
  const home = deps.home ?? homedir();
  const indexPath = deps.indexPath ?? defaultIndexPath(home);
  await writeIndex(indexPath, await readIndex(indexPath));

  const settingsPath = join(home, ".claude", "settings.json");
  const settings = await readSettings(settingsPath);
  const stopHooks = settings.hooks?.Stop ?? [];
  const command = "respawn save || true";
  const alreadyInstalled = stopHooks.some((group) =>
    group.hooks?.some((hook) => hook.command === command),
  );

  if (!alreadyInstalled) {
    stopHooks.push({
      matcher: "",
      hooks: [{ type: "command", command }],
    });
    settings.hooks = { ...settings.hooks, Stop: stopHooks };
    await mkdir(dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  }

  return `Initialized respawn index at ${indexPath} and Claude Stop hook at ${settingsPath}`;
}

async function readSettings(path: string): Promise<ClaudeSettings> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as ClaudeSettings;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}
