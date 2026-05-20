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

## Usage

Initialize local storage and install autosave Stop hooks for Claude Code and Codex:

```sh
respawn init
```

Save the current active agent session from inside a git worktree:

```sh
respawn save
```

Autosave is what the installed hooks run. It skips unchanged transcripts so repeated Stop events do not create duplicate gists:

```sh
respawn autosave
```

Resume the latest saved session for a branch:

```sh
respawn angela/fix-bugs
```

Attach the latest saved session to the current GitHub PR:

```sh
respawn tag
```

Resume from a tagged PR, even if the branch was deleted:

```sh
respawn 123
respawn https://github.com/org/repo/pull/123
```

List saved sessions:

```sh
respawn list
```

## How It Works

`respawn save` detects the active agent in this order:

1. Claude Code via `CLAUDE_SESSION_ID`
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
