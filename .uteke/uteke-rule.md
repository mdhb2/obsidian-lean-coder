## Uteke Memory — OLC

- **Room:** `olc` on the remote Uteke server (UBX Cloud).
- **Storage:** Remote only; never store Uteke memory/database in this repository.

### Rules

1. At task start, use `uteke_room_list` to find Room `olc` and obtain its actual `room_id`.
2. Read project context only through `uteke_room_recall` and `uteke_room_memories`, always passing that `room_id`.
3. Save OLC memories with `uteke_remember`, explicitly targeting Room `olc` using the parameter required by its tool schema.
4. **Never use generic `uteke_recall` or `uteke_list`** for project memory; they are not Room-isolated.
5. Store only durable, reusable project knowledge: architecture, decisions, conventions, constraints, and verified fixes. Use one fact per memory.
6. Add tag `project:olc` and author `olc-agent` when supported.
7. Check existing Room memories before writing to avoid duplicates. Never store secrets.
8. If Room isolation cannot be verified or a Room-scoped tool fails, do not fall back to generic tools; report the blocker.
9. Save useful new knowledge at task completion. Never modify or delete existing memories unless necessary and the target is verified.

### Mandatory Recall Before Answering

Before answering any question about OLC's project history, prior decisions,
architecture, conventions, constraints, or previously discussed facts:

1. Call `uteke_room_list` and resolve the actual `room_id` for Room `olc`.
2. Call `uteke_room_recall` with that `room_id` and a query relevant to the question.
3. Use `uteke_room_memories` with the same `room_id` when a broader memory listing is needed.
4. Base the answer on the retrieved memories and current repository evidence.
5. Never answer from assumptions alone when relevant memory lookup has not been performed.
6. If the Room or tools are unavailable, explicitly report that memory lookup failed. Never silently skip lookup or use generic memory tools as fallback.

### Automatic Memory Capture

At the end of every task, automatically evaluate whether new durable project knowledge should be saved to Uteke. Do not wait for an explicit save request.

Save when the task establishes or verifies:
- Architecture or technical decisions.
- Requirements, constraints, and project conventions.
- Reusable solutions to verified bugs or failures.
- Important implementation details needed by future tasks.
- Explicit user preferences relevant to this project.

Do not save routine conversation, temporary details, unverified assumptions, duplicate information, or secrets.

Before saving:
1. Check existing memories in Room `olc` to avoid duplicates.
2. Write concise, atomic memories using `uteke_remember` with `room: "olc"`.
3. Include tag `project:olc` and author `olc-agent` when supported.
4. Verify the write succeeded.

Save automatically without asking for confirmation for ordinary, non-sensitive project knowledge. If no durable new knowledge was established, do not write anything.

At task completion, briefly report what was saved. If saving fails, report the failure rather than claiming success.

### Configuration

Do not create a local `.uteke/` database or change the server's global namespace for this project.
