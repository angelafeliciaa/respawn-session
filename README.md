<h1 align="center">
  <img src="docs/respawn-icon.svg" alt="respawn-session logo" width="100" height="100" /><br/>
  respawn-session
</h1>

<p align="center">
  <strong>Pick up where your agent left off &mdash; on any branch, any PR.</strong><br/>
  Resume Claude Code and Codex sessions long after the worktree is gone.
</p>

<p align="center">
  <a href="https://github.com/angelafeliciaa/respawn-session/actions/workflows/ci.yml"><img src="https://github.com/angelafeliciaa/respawn-session/actions/workflows/ci.yml/badge.svg" alt="ci" /></a>
  <a href="https://www.npmjs.com/package/respawn-session"><img src="https://img.shields.io/npm/v/respawn-session?color=D97757" alt="npm" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/respawn-session?color=D97757" alt="license" /></a>
  <a href="#local-only"><img src="https://img.shields.io/badge/storage-local--only-D97757" alt="local-first" /></a>
</p>

---

`respawn` saves your agent transcripts locally, indexes them by branch or PR, and restores your conversation when you run `respawn <branch>` or `respawn <pr-number>`. 

## Install

```sh
npm install -g respawn-session
respawn init
```

Or try it without installing:

```sh
npx respawn-session init
```

Requires Bun 1.0+. GitHub CLI is only needed for PR resume, such as `respawn 517`.

## Usage

Work normally in Claude Code or Codex. `respawn init` installs autosave hooks, so sessions are saved locally when the agent stops.

Resume by branch:

```sh
respawn angela/fix-bugs
```

Resume by PR:

```sh
respawn 517
respawn https://github.com/org/repo/pull/517
```

Save manually from inside an active agent session:

```sh
respawn save
```

Import sessions that already exist on your laptop:

```sh
respawn import
respawn list
```

## Commands

| Command | What it does |
| --- | --- |
| `respawn init` | Turn on autosave |
| `respawn save` | Save the current agent session now |
| `respawn <branch>` | Resume the newest session for a branch |
| `respawn <pr-number>` | Resume the newest session for a PR |
| `respawn <pr-url>` | Resume the newest session for a PR URL |
| `respawn import [owner/repo]` | Import existing local transcripts |
| `respawn list` | Show saved sessions |
| `respawn update` | Update the global install |

Maintenance commands:

```sh
respawn tag                         # manually save and link the current PR locally
respawn link owner/repo --dry-run   # preview PR links for imported sessions
respawn link owner/repo             # write those links into the local index
```

## Local Only

`respawn` stores data here:

```sh
~/.respawn/index.json
~/.respawn/transcripts/
```

It does not upload transcripts, write PR comments, use gists, or phone home. To move sessions to another machine, copy or sync those two paths.

## How It Works

`respawn save` finds the active Claude Code or Codex transcript, copies it locally, and records repo, branch, commit SHA, agent, session id, and PR number when available.

When you run `respawn <branch>` or `respawn <pr-number>`, it restores the transcript to the agent's expected path, checks out the branch or PR, and runs:

```sh
claude --resume <session-id>
# or
codex resume <session-id>
```

If a PR branch is gone and the saved session has a SHA, `respawn` creates `respawn/pr-<number>` at that commit.

## Development

```sh
bun test
bun run typecheck
```

MIT License.
