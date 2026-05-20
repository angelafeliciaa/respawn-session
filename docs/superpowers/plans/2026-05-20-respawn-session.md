# Respawn Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v0.1 `respawn` CLI that saves Claude Code and Codex transcripts to private GitHub gists and resumes the latest session for a branch.

**Architecture:** The CLI uses small TypeScript modules with direct Bun APIs and shell calls. Agent adapters locate transcripts and produce resume commands; command modules coordinate git metadata, gist storage, and the local `~/.respawn/index.json` file.

**Tech Stack:** Bun, TypeScript, Bun test, `gh` CLI, local filesystem, `git` CLI.

---

### Task 1: Project Scaffolding And Index Storage

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/index-file.ts`
- Test: `tests/index-file.test.ts`

- [ ] Write failing tests for empty index reads, appending multiple sessions to the same branch, and latest-session lookup.
- [ ] Run `bun test tests/index-file.test.ts`; expect failure because `src/index-file.ts` does not exist.
- [ ] Implement `readIndex`, `writeIndex`, `recordSession`, `findSessions`, and `findLatestSession`.
- [ ] Run `bun test tests/index-file.test.ts`; expect all tests to pass.
- [ ] Commit with `feat(index): add session index storage`.

### Task 2: Agent Adapters

**Files:**
- Create: `src/agents/claude.ts`
- Create: `src/agents/codex.ts`
- Create: `src/agents/index.ts`
- Test: `tests/agents.test.ts`

- [ ] Write failing tests for Claude encoded cwd paths, `$CLAUDE_SESSION_ID`, Codex session id extraction, `$CODEX_TUI_SESSION_LOG_PATH`, and resume commands.
- [ ] Run `bun test tests/agents.test.ts`; expect missing-module failure.
- [ ] Implement adapter functions with dependency-injected env, cwd, home, and filesystem checks.
- [ ] Run `bun test tests/agents.test.ts`; expect all tests to pass.
- [ ] Commit with `feat(agents): locate claude and codex sessions`.

### Task 3: Git And Gist Plumbing

**Files:**
- Create: `src/git.ts`
- Create: `src/storage/gist.ts`
- Test: `tests/git-gist.test.ts`

- [ ] Write failing tests for git command parsing and gist id extraction from URLs.
- [ ] Run `bun test tests/git-gist.test.ts`; expect missing-module failure.
- [ ] Implement shell helpers, `currentRepo`, `currentBranch`, `currentSha`, `createGist`, and `downloadGist`.
- [ ] Run `bun test tests/git-gist.test.ts`; expect all tests to pass.
- [ ] Commit with `feat(storage): add git and gist plumbing`.

### Task 4: CLI Commands

**Files:**
- Create: `src/cli.ts`
- Create: `src/commands/save.ts`
- Create: `src/commands/resume.ts`
- Create: `src/commands/list.ts`
- Create: `src/commands/init.ts`
- Test: `tests/commands.test.ts`

- [ ] Write failing tests for `save`, latest-session resume for a branch with multiple sessions, `list`, and unsupported-agent errors.
- [ ] Run `bun test tests/commands.test.ts`; expect missing-module failure.
- [ ] Implement raw `process.argv` routing and command modules with injectable dependencies.
- [ ] Run `bun test tests/commands.test.ts`; expect all tests to pass.
- [ ] Commit with `feat(cli): add save resume and list commands`.

### Task 5: Docs And Verification

**Files:**
- Create: `README.md`
- Create: `LICENSE`
- Create: `git.md`
- Create: `CLAUDE.md`
- Modify: `package.json`

- [ ] Document install, save, resume, list, init, storage, multi-session behavior, and known v0 limits.
- [ ] Add MIT license and commit rules.
- [ ] Run `bun test` and `bun run typecheck`.
- [ ] Run a no-op CLI smoke test with `bun src/cli.ts list`.
- [ ] Commit with `docs(readme): document respawn usage`.
