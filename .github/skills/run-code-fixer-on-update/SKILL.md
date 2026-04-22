---
name: run-code-fixer-on-update
description: 'Run an automatic code fixer after every code change. Use this after editing files to apply lint fixes (for example ESLint), then verify no new lint or syntax issues remain.'
argument-hint: 'What files or folders were updated?'
user-invocable: true
disable-model-invocation: false
---

# Run Code Fixer On Update

## What This Skill Produces
A repeatable post-edit workflow that:
1. Detects the changed scope (file, folder, or whole project).
2. Runs the most appropriate code fixer command (for example ESLint with `--fix`).
3. Re-checks for remaining issues.
4. Reports what was fixed, what is still failing, and next actions.

## When To Use
- After any code edit that can affect linting or formatting.
- Before running tests, opening a PR, or committing.
- During iterative refactors to keep diffs clean.

## Procedure
1. Identify what changed.
- Prefer targeted fixing when only a few files changed.
- Use project-wide fixing for broad refactors.

2. Detect available fixer tooling.
- Check `package.json` scripts first (for example `lint:fix`, `lint`, `format`, `format:fix`).
- Always prefer `npm run lint:fix` first when it exists.
- If `lint:fix` is missing, use direct commands from installed tools (for example `eslint . --fix`).

3. Choose command by scope.
- Single/few files: run file-scoped fixer command to reduce runtime and noise.
- Many files or unknown scope: run project-wide fixer.

4. Run fixer.
- Execute the fixer command.
- Capture changed files and unresolved errors.

5. Re-validate quality.
- Run a non-fixing lint check (or equivalent) to confirm no new lint issues.
- If a fixer changed behavior-sensitive code, run relevant tests.

6. Report outcome.
- Summarize files changed by fixer.
- List unresolved issues with actionable next steps.

## Decision Points
- First choice: run `npm run lint:fix` when available.
- Else if `eslint` is installed, use `eslint --fix`.
- If fix command fails due to config/dependency problems, stop and report exact blocker.
- If unresolved errors remain after auto-fix, continue with a warning summary and provide manual fix guidance.

## Completion Checks
- Fixer command completed without crashing.
- Follow-up lint check executed.
- Remaining issues (if any) are explicitly listed.
- Workflow does not hard-fail on unresolved lint; it reports warnings and clear manual next steps.
- User receives a concise summary of applied fixes and residual work.

## Example Prompts
- Run post-edit fixer for files I just changed.
- I updated frontend code; apply ESLint auto-fixes and re-check lint.
- Run lint fix in this workspace and tell me what still needs manual fixes.
