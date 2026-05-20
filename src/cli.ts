#!/usr/bin/env bun
import { initRespawn } from "./commands/init";
import { listSessions } from "./commands/list";
import { resumeSession } from "./commands/resume";
import { saveSession } from "./commands/save";

export type Route =
  | { name: "help" }
  | { name: "save" }
  | { name: "list" }
  | { name: "init" }
  | { name: "resume"; branch: string };

export function route(args: string[]): Route {
  const [command] = args;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    return { name: "help" };
  }
  if (command === "save" || command === "list" || command === "init") {
    return { name: command };
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
  if (selected.name === "list") {
    console.log((await listSessions()) || "No saved sessions");
    return;
  }
  if (selected.name === "init") {
    console.log(await initRespawn());
    return;
  }

  const result = await resumeSession(selected.branch);
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
    "  respawn <branch>",
    "  respawn list",
    "  respawn init",
  ].join("\n");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
