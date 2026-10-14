---
name: olc-task
description: Manage multiple tasks across sessions — find the next task, report project status with unfinished work, add sub-tasks, and finalize tasks into project knowledge on explicit user request.
---

# olc-task

Multiple tasks live side by side in one project vault. Open work stays in
`tasks/active/<id>/`, finished work moves to `tasks/done/<id>/`, and finished
knowledge is kept per task in `knowledge/<id>.md`.

## Hard rules

1. **Only the user finalizes.** Never call `olc_task_finalize` unless the user
   explicitly said the task is done (e.g. "task T-1 selesai"). No auto-close
   after checkpoints, green tests, or commits.
2. **Done is immutable.** A finalized task never reopens. Follow-up work goes
   in a new task.
3. **Switching needs a checkpoint.** Before leaving an unfinished task for
   another one, record a checkpoint (`task-final` flow when verified,
   otherwise `pre-switch`) so the next resume has a recovery point.
4. **One level of sub-tasks.** A sub-task lives at
   `tasks/active/<parent>/sub/<sub>/` with its own status. A parent with
   still-open sub-tasks cannot be finalized.
5. **Identity first.** Wrong project or unavailable vault → fail with zero
   files touched.

## Flow

The modules below are exposed as agent-callable tools under the `olc`
namespace. Call the tools, not the library functions directly.

1. Next task ("tugas selanjutnya apa?"): `olc_next_task` with `{ branch? }`
   — pass the current git branch when known. Report the recommendation and
   ask the user to confirm before continuing anything.
2. Project status ("status project apa?"): `olc_project_status` — lists every
   open task (newest first), recent events, and the last checkpoint. Tell the
   user which tasks are unfinished and ask which one to continue.
3. New sub-task (only when the user asks): register it under the parent
   (`registerSubtask`, one level, inherits the parent branch), then draft its
   `intent.md`/`plan.md` like a normal task.
4. Pause / resume: move the task between `active` and `pending` with
   `setTaskStatus`. `pending` means paused but resumable at any time.
5. Finalize (only on explicit user request): `olc_task_finalize` with
   `{ taskId, highlights? }` → writes `knowledge/<task>.md` (create-only),
   moves the folder to `tasks/done/`, marks the registry `done`, and logs a
   `task-status` event. Show the user the knowledge summary.

## Verifying this skill

- `olc_next_task` on an empty project says no tasks are registered; with
  several open tasks it recommends the most recently active one.
- Finalizing without the user asking is never done — the agent proposes,
  the user confirms with the task id.
- A finalized task folder is under `tasks/done/` and its registry status is
  `done`; re-finalizing fails loudly.
