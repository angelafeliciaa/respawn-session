# respawn-session

Save your Claude Code or Codex session to a git branch or PR and resume it later from another worktree.

The session is the transcript. `respawn` copies that transcript into `~/.respawn/transcripts/`, records metadata in `~/.respawn/index.json`, restores the transcript later, checks out the branch or PR, and starts the same agent with its resume command.

`respawn` is local-only. It does not upload transcripts, write PR comments, use gists, or run telemetry.

## Install

```sh
npm install -g respawn-session
```

The package ships a Bun TypeScript CLI with no build step. Bun 1.0 or newer is required. The GitHub CLI is only needed for PR-aware commands such as `respawn 517`, `respawn tag`, and `respawn link`.

## Quick Start

Initialize once on each machine:

```sh
respawn init
```

This creates `~/.respawn/index.json` and installs autosave Stop hooks for Claude Code and Codex. After that, sessions save automatically when the agent stops.

Save immediately from inside an active agent session:

```sh
respawn save
```

Resume the latest saved session for a branch:

```sh
respawn angela/fix-bugs
```

Resume the latest saved session for a PR:

```sh
respawn 517
respawn internetbackyard/gnomos-app#517
respawn https://github.com/org/repo/pull/517
```

## Common Workflows

### Autosave

Run once per machine:

```sh
respawn init
```

Claude Code and Codex Stop hooks will run:

```sh
respawn autosave
```

Autosave hashes the transcript and skips unchanged sessions. If the current branch has a GitHub PR, autosave stores the PR number in the local index so `respawn 517` can find the session later.

### Manual Save

Inside an active Claude Code or Codex session:

```sh
respawn save
```

Later, from a clone or worktree for the same repo:

```sh
respawn <branch>
```

### Manual PR Tag

Use this when you want to force-save and link the current session to the current PR:

```sh
respawn tag
```

This writes only local metadata. It does not comment on the PR.

### Link Existing Sessions To PRs

This is for sessions imported from before PR metadata existed:

```sh
respawn import internetbackyard/gnomos-app
respawn link internetbackyard/gnomos-app --dry-run
respawn link internetbackyard/gnomos-app
```

`respawn link` reads PRs with `gh pr list`, matches sessions by branch name or PR head SHA, and writes the PR number into `~/.respawn/index.json`. It does not upload transcripts or write to GitHub.

Always run the dry-run first:

```sh
Would link 1 PRs in internetbackyard/gnomos-app; 0 sessions unmatched
  #514 feat/int-1194-tool-actor-context (1 session)
```

### Import Existing Sessions

Backfill sessions that already exist on this machine:

```sh
respawn import
```

Import scans Claude Code and Codex transcripts, groups them by their recorded cwd, and copies available sessions into `~/.respawn/transcripts/`.

If the worktree was deleted, give `respawn` the repo explicitly:

```sh
respawn import internetbackyard/gnomos-app
```

For deleted worktrees, `respawn` can still import Claude Code project transcripts when the original cwd contains the repo name and the transcript has embedded branch metadata. Those rows may use `sha: "unknown"`, which means PR resume cannot fall back to a saved commit if the PR branch is gone.

### List Sessions

```sh
respawn list
```

Branches and PRs can have multiple saved sessions. `respawn` resumes the newest `savedAt` entry.

## Commands

| Command | What it does |
| --- | --- |
| `respawn init` | Creates the local index and installs autosave hooks |
| `respawn save` | Copies the active Claude Code or Codex transcript locally |
| `respawn autosave` | Saves only if the transcript changed and links the current PR locally when one exists |
| `respawn tag` | Saves and links the current session to the current PR locally |
| `respawn import` | Backfills existing local Claude Code and Codex sessions |
| `respawn import owner/repo` | Backfills deleted-worktree transcripts for a repo when branch metadata exists |
| `respawn link owner/repo` | Links imported sessions to matching PRs in the local index |
| `respawn link owner/repo --dry-run` | Previews PR links without writing local metadata |
| `respawn <branch>` | Restores the newest session for a branch |
| `respawn owner/repo:branch` | Restores a branch session without being in that repo |
| `respawn --repo owner/repo <branch>` | Restores a branch session for an explicit repo |
| `respawn <pr-number>` | Restores the newest local session linked to that PR |
| `respawn owner/repo#123` | Restores a PR session without being in that repo |
| `respawn <pr-url>` | Restores the newest local session linked to that PR URL |
| `respawn --repo owner/repo 123` | Restores a PR session for an explicit repo |
| `respawn list` | Lists locally indexed sessions |
| `respawn version` | Prints the installed CLI version |
| `respawn update` | Updates the global npm install to the latest release |

If your installed version does not recognize `respawn update`, bootstrap once with:

```sh
npm install -g respawn-session@latest
```

## How It Works

`respawn save` detects the active agent in this order:

1. Claude Code via `CLAUDE_SESSION_ID`, then `~/.claude/sessions/*.json` and `~/.claude/projects/**/*.jsonl`
2. Codex via `CODEX_TUI_SESSION_LOG_PATH`, `CODEX_SESSION_ID`, or the newest `~/.codex/sessions/**.jsonl` transcript for the current cwd

It copies the transcript to:

```sh
~/.respawn/transcripts/
```

and writes metadata to:

```sh
~/.respawn/index.json
```

`respawn <branch>` restores the newest matching local transcript and runs:

```sh
git checkout <branch>
claude --resume <session-id>
# or
codex resume <session-id>
```

`respawn <pr-number>` finds the newest local session linked to that PR, restores the transcript, and tries:

```sh
gh pr checkout <pr-number>
```

If the PR branch was deleted and the saved session has a commit SHA, it falls back to:

```sh
git checkout -B respawn/pr-<number> <saved-sha>
```

## Agent Paths

Claude Code transcripts are restored to:

```sh
~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
```

Codex transcripts are restored under their saved relative path in:

```sh
~/.codex/sessions/
```

## Local-Only Limits

Local-only means another machine will not automatically have your sessions. To move sessions between machines, copy or sync:

```sh
~/.respawn/index.json
~/.respawn/transcripts/
```

There is no hosted service and no telemetry. Transcripts can contain credentials and proprietary code, so remote storage should only be added later behind explicit opt-in, encryption, and clear warnings.
