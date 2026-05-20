# respawn-session

Save your Claude Code or Codex session to a git branch and resume it later from another worktree or machine.

The session is the transcript. `respawn` uploads that transcript to a private GitHub gist, records it in `~/.respawn/index.json`, restores it later, checks out the branch, and starts the same agent with its resume command.

## Install

```sh
npm install -g respawn-session
```

The package ships a Bun TypeScript CLI with no build step. Bun 1.0 or newer and the GitHub CLI are required:

```sh
bun --version
gh auth status
```

## Quick Start

Initialize once on each machine. This creates `~/.respawn/index.json` and installs autosave Stop hooks for Claude Code and Codex:

```sh
respawn init
```

Work normally in Claude Code or Codex. `respawn init` makes sessions autosave when the agent stops. To save immediately from inside an active agent session, run:

```sh
respawn save
```

Resume the latest saved session for a branch:

```sh
respawn angela/fix-bugs
```

Resume from a PR that was tagged with `respawn tag`:

```sh
respawn 123
respawn https://github.com/org/repo/pull/123
```

## Common Workflows

### Manual Branch Save

Inside an active Claude Code or Codex session:

```sh
respawn save
```

Later, from a clone or worktree for the same repo:

```sh
respawn <branch>
```

Example:

```sh
respawn angela/fix-bugs
```

### Autosave

Run this once per machine:

```sh
respawn init
```

After that, Claude Code and Codex Stop hooks run:

```sh
respawn autosave
```

Autosave hashes the transcript and skips unchanged sessions, so repeated Stop events do not create duplicate gists.

### PR Tagging

Use this when you want a session to survive branch deletion after merge:

```sh
respawn tag
```

That writes or updates a hidden metadata comment on the current GitHub PR. The comment stores session pointers, not the transcript body. Transcripts still live in your private gists.

Later, resume from the PR:

```sh
respawn 123
respawn https://github.com/org/repo/pull/123
```

### List Saved Sessions

Show every saved session in your local index:

```sh
respawn list
```

## Commands

| Command | What it does |
| --- | --- |
| `respawn init` | Creates the local index and installs autosave hooks |
| `respawn save` | Saves the active Claude Code or Codex transcript |
| `respawn autosave` | Saves only if the transcript changed |
| `respawn tag` | Saves and attaches session metadata to the current PR |
| `respawn <branch>` | Restores the newest session for a branch |
| `respawn <pr-number>` | Restores the newest session from a tagged PR |
| `respawn <pr-url>` | Restores the newest session from a tagged PR URL |
| `respawn list` | Lists locally indexed sessions |
| `respawn version` | Prints the installed CLI version |
| `respawn update` | Updates the global npm install to the latest release |

If your installed version does not recognize `respawn update`, bootstrap once with:

```sh
npm install -g respawn-session@latest
```

## How It Works

`respawn save` detects the active agent in this order:

1. Claude Code via `CLAUDE_SESSION_ID`, then `~/.claude/sessions/*.json`
2. Codex via `CODEX_TUI_SESSION_LOG_PATH`, `CODEX_SESSION_ID`, or the newest `~/.codex/sessions/**.jsonl` transcript for the current cwd

It then runs:

```sh
gh gist create <transcript>.jsonl --desc "respawn: <repo>@<branch>"
```

GitHub CLI gists are secret by default unless `--public` is passed. `respawn` does not pass `--public`.

The local index lives at:

```sh
~/.respawn/index.json
```

Branches can have multiple saved sessions. `respawn <branch>` restores the newest `savedAt` entry for the current repo and branch. `respawn list` shows every saved entry so older sessions remain discoverable.

`respawn tag` writes a hidden metadata comment to the current PR. The comment stores session pointers, not the transcript body. Transcripts still live in your private gists. This lets `respawn <pr-url|number>` recover the newest tagged session after a branch is merged or deleted.

## Agent Paths

Claude Code transcripts are restored to:

```sh
~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
```

Codex transcripts are restored under their saved relative path in:

```sh
~/.codex/sessions/
```

Resume commands:

```sh
claude --resume <session-id>
codex resume <session-id>
```

## v0 Limits

There is no hosted service, no telemetry, and no secret redaction. Transcripts can contain proprietary code or credentials, so use storage you control and treat gists as sensitive even when secret.
