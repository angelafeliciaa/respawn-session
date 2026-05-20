#!/usr/bin/env bun
import { initRespawn } from "./commands/init";
import { importSessions } from "./commands/import";
import { listSessions } from "./commands/list";
import { resumePrSession, resumeSession } from "./commands/resume";
import { saveSession } from "./commands/save";
import { tagCurrentPr } from "./commands/tag";
import { updateRespawn, versionText } from "./commands/update";

export type Route =
  | { name: "help" }
  | { name: "save" }
  | { name: "autosave" }
  | { name: "list" }
  | { name: "init" }
  | { name: "import" }
  | { name: "tag" }
  | { name: "version" }
  | { name: "update" }
  | { name: "resume"; branch: string }
  | { name: "resume-pr"; prRef: string };

export function route(args: string[]): Route {
  const [command] = args;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    return { name: "help" };
  }
  if (command === "version" || command === "--version" || command === "-v") {
    return { name: "version" };
  }
  if (
    command === "save" ||
    command === "autosave" ||
    command === "list" ||
    command === "init" ||
    command === "import" ||
    command === "tag" ||
    command === "update"
  ) {
    return { name: command };
  }
  if (isPrRef(command)) {
    return { name: "resume-pr", prRef: command };
  }
  return { name: "resume", branch: command };
}

export async function main(args = Bun.argv.slice(2)): Promise<void> {
  const selected = route(args);
  if (selected.name === "help") {
    console.log(helpText());
    return;
  }
  if (selected.name === "save") {
    console.log((await saveSession()).message);
    return;
  }
  if (selected.name === "autosave") {
    console.log((await saveSession({ mode: "autosave" })).message);
    return;
  }
  if (selected.name === "list") {
    console.log((await listSessions()) || "No saved sessions");
    return;
  }
  if (selected.name === "init") {
    console.log(await initRespawn());
    return;
  }
  if (selected.name === "import") {
    console.log((await importSessions()).message);
    return;
  }
  if (selected.name === "tag") {
    console.log((await tagCurrentPr()).message);
    return;
  }
  if (selected.name === "version") {
    console.log(versionText());
    return;
  }
  if (selected.name === "update") {
    console.log(await updateRespawn());
    return;
  }

  const result =
    selected.name === "resume-pr"
      ? await resumePrSession(selected.prRef)
      : await resumeSession(selected.branch);
  const [cmd, ...cmdArgs] = result.command;
  const proc = Bun.spawn([cmd, ...cmdArgs], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exit(await proc.exited);
}

function helpText(): string {
  return [
    "Usage:",
    "  respawn save",
    "  respawn autosave",
    "  respawn tag",
    "  respawn <branch>",
    "  respawn <pr-url|number>",
    "  respawn list",
    "  respawn init",
    "  respawn import",
    "  respawn version",
    "  respawn update",
  ].join("\n");
}

function isPrRef(value: string): boolean {
  return /^\d+$/.test(value) || /github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(value);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
