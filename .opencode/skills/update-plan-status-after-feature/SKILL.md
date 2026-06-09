---
name: update-plan-status-after-feature
description: 'Update PLAN.md status after implementing new features so roadmap and current state stay accurate.'
argument-hint: 'What feature(s) were added, changed, or completed?'
user-invocable: true
disable-model-invocation: false
---

# Update PLAN Status After Feature

## What This Skill Produces
A consistent `PLAN.md` update that reflects newly shipped work without introducing stale or duplicate status lines.

## When To Use
- After implementing any backend or frontend feature.
- After adding new endpoints, schemas, pages, or UX flows.
- After a milestone/task moves from planned to completed.
- Before handoff, release notes, or checkpoint summaries.

## Inputs
- Feature summary (what changed and why).
- Files touched (backend/frontend/scripts/docs).
- Validation outcome (build, lint, tests, smoke checks).

## Update Targets In PLAN.md
Always check and update these sections if relevant:
1. `## Overall Progress Summary`
2. `### Additional Features Completed (Not in Original Plan)`
3. `### Current Status Snapshot (...)`
4. `## API Contracts ...` section
5. `## Data Model ...` section
6. `## Immediate Next Steps (This Week)`

## Procedure
1. Identify deltas from current code:
- Added endpoints/routes
- New response/request fields
- New UI capabilities
- New scripts or release checks

2. Edit status lines only where needed:
- Prefer updating existing bullets instead of adding duplicates.
- Keep wording short and concrete.
- Use past tense for completed work.

3. Keep roadmap truthful:
- Mark completed work as `[x]`.
- Do not mark items done without code evidence.
- If partially complete, state scope explicitly.

4. Update dates/phase when meaningful:
- Refresh `Current Status Snapshot` date.
- Adjust `Current Phase` only if phase changed.

5. Sync contract/model sections:
- If API changed, update route list and payload summary.
- If schema/model changed, update model snapshot lines.

6. Refresh near-term next steps:
- Remove already-completed next steps.
- Add highest-value follow-ups (max 4 concise items).

## Writing Rules
- No speculative claims.
- No repeated bullets with different wording.
- Keep section structure intact unless user asks to reorganize.
- Prefer concise, scan-friendly bullets.

## Completion Checklist
- `PLAN.md` reflects newly shipped feature(s).
- No outdated unchecked draft items that are already implemented.
- Dates/phase are current.
- API/model/status sections are mutually consistent.
- Changes are minimal and focused (no unrelated rewrites).

## Example Prompts
- "Update PLAN.md based on the weekly summary trend graph feature."
- "Sync plan status after adding note edit/delete APIs."
- "Refresh roadmap status from current codebase state."
