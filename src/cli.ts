#!/usr/bin/env bun
import { initRespawn } from "./commands/init";
import { autosaveSession } from "./commands/autosave";
import { importSessions } from "./commands/import";
import { linkRepo } from "./commands/link";
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
  | { name: "import"; repo?: string }
  | { name: "link"; repo: string; dryRun: boolean }
  | { name: "tag" }
  | { name: "version" }
  | { name: "update" }
  | { name: "resume"; branch: string; repo?: string }
  | { name: "resume-pr"; prRef: string; repo?: string };

export function route(args: string[]): Route {
  const { repo, rest } = parseGlobalOptions(args);
  const [command] = rest;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    return { name: "help" };
  }
  if (command === "version" || command === "--version" || command === "-v") {
    return { name: "version" };
  }
  if (command === "link") {
    const linkArgs = rest.slice(1).filter((arg) => arg !== "--dry-run");
    return {
      name: "link",
      repo: linkArgs[0] ?? "",
      dryRun: rest.includes("--dry-run"),
    };
  }
  if (
    command === "save" ||
    command === "autosave" ||
    command === "list" ||
    command === "init" ||
    command === "tag" ||
    command === "update"
  ) {
    return { name: command };
  }
  if (command === "import") {
    return {
      name: "import",
      repo: repo ?? rest.slice(1).find((arg) => !arg.startsWith("-")),
    };
  }
  if (isPrRef(command)) {
    return parsePrRoute(command, repo);
  }
  return parseBranchRoute(command, repo);
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
    console.log((await autosaveSession()).message);
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
    console.log((await importSessions({ repo: selected.repo })).message);
    return;
  }
  if (selected.name === "link") {
    if (!selected.repo) throw new Error("Usage: respawn link owner/repo [--dry-run]");
    console.log(
      (await linkRepo(selected.repo, { dryRun: selected.dryRun })).message,
    );
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
      ? await resumePrSession(selected.prRef, { repo: selected.repo })
      : await resumeSession(selected.branch, { repo: selected.repo });
  const [cmd, ...cmdArgs] = result.command;
  const proc = Bun.spawn([cmd, ...cmdArgs], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exit(await proc.exited);
}

export function helpText(): string {
  return [
    "Usage:",
    "  respawn init",
    "  respawn save",
    "  respawn <branch>",
    "  respawn <pr-url|number>",
    "  respawn import [owner/repo]",
    "  respawn update",
    "  respawn list",
    "",
    "Advanced:",
    "  respawn tag",
    "  respawn link owner/repo [--dry-run]",
  ].join("\n");
}

function isPrRef(value: string): boolean {
  return (
    /^\d+$/.test(value) ||
    /^[^/\s]+\/[^#:\s]+#\d+$/.test(value) ||
    /github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(value)
  );
}

function parseGlobalOptions(args: string[]): { repo?: string; rest: string[] } {
  if (args[0] === "--repo") {
    return { repo: args[1], rest: args.slice(2) };
  }
  return { rest: args };
}

function parsePrRoute(value: string, repo?: string): Route {
  const url = value.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)$/);
  if (url) return { name: "resume-pr", repo: url[1], prRef: url[2] };

  const qualified = value.match(/^([^/\s]+\/[^#:\s]+)#(\d+)$/);
  if (qualified) {
    return { name: "resume-pr", repo: qualified[1], prRef: qualified[2] };
  }

  return { name: "resume-pr", prRef: value, repo };
}

function parseBranchRoute(value: string, repo?: string): Route {
  const qualified = value.match(/^([^/\s]+\/[^#:\s]+):(.+)$/);
  if (qualified) {
    return { name: "resume", repo: qualified[1], branch: qualified[2] };
  }
  return { name: "resume", branch: value, repo };
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
