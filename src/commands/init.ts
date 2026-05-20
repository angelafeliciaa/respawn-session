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

  const command = "respawn autosave || true";
  const claudePath = join(home, ".claude", "settings.json");
  const codexPath = join(home, ".codex", "hooks.json");
  await installStopHook(claudePath, command);
  await installStopHook(codexPath, command);

  return `Initialized respawn index at ${indexPath} and autosave Stop hooks at ${claudePath} and ${codexPath}`;
}

async function readSettings(path: string): Promise<ClaudeSettings> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as ClaudeSettings;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function installStopHook(path: string, command: string): Promise<void> {
  const settings = await readSettings(path);
  const stopHooks = settings.hooks?.Stop ?? [];
  const alreadyInstalled = stopHooks.some((group) =>
    group.hooks?.some((hook) => hook.command === command),
  );

  if (!alreadyInstalled) {
    stopHooks.push({
      matcher: "",
      hooks: [{ type: "command", command }],
    });
  }

  settings.hooks = { ...settings.hooks, Stop: stopHooks };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(settings, null, 2)}\n`);
}
