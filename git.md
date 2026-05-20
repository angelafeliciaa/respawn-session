# Git Rules

Conventional Commits: `type(scope): subject`

```text
feat(api): add gap-filling question endpoint

INT-688
```

- Subject line: one line, present tense, imperative mood.
- Lowercase after the colon.
- No period at the end.
- Subject text after `type(scope): ` is 50 chars max.
- Body is optional: one additional line max. Two lines total, never more.
- INT ticket trailer is encouraged for the first commit on a branch, optional after that.
- No `Co-Authored-By` trailers and no AI attribution lines.

## Commit Types

| Type | When to use |
| --- | --- |
| `feat` | New functionality, new behavior |
| `fix` | Bug fix |
| `refactor` | Code change that does not fix a bug or add a feature |
| `docs` | Documentation only |
| `test` | Adding or updating tests |
| `chore` | Maintenance, deps, config, no production code change |
| `style` | Formatting, whitespace, linting, no logic change |
| `ci` | CI/CD changes |
| `perf` | Performance improvement |
| `build` | Build system or external dependency changes |
