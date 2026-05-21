# respawn-session

Resume an old Claude Code or Codex conversation from a branch or PR.

`respawn` is local-only. It copies transcripts into `~/.respawn/transcripts/`, keeps metadata in `~/.respawn/index.json`, and never uploads transcripts, writes PR comments, uses gists, or runs telemetry.

## Install

```sh
npm install -g respawn-session
```

Requires Bun 1.0 or newer. The GitHub CLI is only needed when resuming by PR number or PR URL.

## Start Here

Set up autosave once on each machine:

```sh
respawn init
```

Then work normally in Claude Code or Codex. When the agent stops, `respawn` saves the transcript locally.

Resume later:

```sh
respawn angela/fix-bugs
respawn 517
respawn https://github.com/org/repo/pull/517
```

Save right now from inside an active agent session:

```sh
respawn save
```

## Commands

| Command | Use it for |
| --- | --- |
| `respawn init` | Turn on autosave |
| `respawn save` | Save the current agent session now |
| `respawn <branch>` | Resume the newest session for a branch |
| `respawn <pr-number>` | Resume the newest session for a PR |
| `respawn <pr-url>` | Resume the newest session for a PR URL |
| `respawn import [owner/repo]` | Bring existing local transcripts into respawn |
| `respawn list` | Show saved sessions |
| `respawn update` | Update the global install |

That is the normal surface area. The extra commands are for maintenance:

```sh
respawn tag                         # manually save and link the current PR locally
respawn link owner/repo --dry-run   # preview PR links for imported sessions
respawn link owner/repo             # write those links into the local index
```

## Import Old Sessions

If you already have Claude Code or Codex transcripts on this machine:

```sh
respawn import
```

If the worktree was deleted, pass the repo:

```sh
respawn import internetbackyard/gnomos-app
respawn link internetbackyard/gnomos-app --dry-run
respawn link internetbackyard/gnomos-app
```

`import` copies matching transcripts into `~/.respawn/transcripts/`. `link` only updates local PR metadata in `~/.respawn/index.json`.

## How It Works

`respawn save` finds the active Claude Code or Codex transcript, copies it locally, and records repo, branch, commit SHA, agent, session id, and PR number when available.

`respawn <branch>` restores the transcript to the agent's expected path, checks out the branch, and runs:

```sh
claude --resume <session-id>
# or
codex resume <session-id>
```

`respawn <pr-number>` restores the newest local session linked to that PR and runs `gh pr checkout <number>`. If the PR branch is gone and the saved session has a SHA, it creates `respawn/pr-<number>` at that commit.

## Moving Machines

Local-only means another machine will not automatically have your sessions. Copy or sync:

```sh
~/.respawn/index.json
~/.respawn/transcripts/
```
