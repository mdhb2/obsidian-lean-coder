---
name: olc-todoc
description: Write any information, request, or conversation context into a reusable Markdown document — adaptive structure, recommended filename, and user-confirmed storage location.
---

# olc-todoc

Turn what the user wants written — conversation context, decisions, notes,
explanations, research, or any free-form content — into a Markdown document
that stays understandable on its own, without reopening the source conversation.

This skill is standalone: it depends on no framework, repository, or other skill.

## Hard rules

1. **Content-first, never template-first.** Let the content and its purpose
   decide the structure. Never force a handoff/task template onto a general
   document, and never ask the user to pick a document type.
2. **Faithful, no fabrication.** Keep the source meaning and important detail.
   Distinguish fact, decision, proposal, assumption, and unknown when the
   difference matters. Never present discussion as a final decision without
   basis, and never invent sources, verification results, or missing detail.
3. **User-controlled storage.** Never create a file before the filename and
   location are both settled. Never assume the working directory, `docs/`, or
   any other destination — always confirm. If the user already gave a name
   and/or location, use them and ask only for what is still missing.
4. **Check before writing.** When the target file exists and is accessible,
   read it first: preserve what is still relevant, merge or update instead of
   duplicating, and never overwrite silently.
5. **No secrets, no false claims.** Exclude credentials and unneeded sensitive
   data. Never claim a file was read, verified, or saved when it was not.

## Flow

1. Understand the request: what to write, where the material comes from
   (conversation context, user-supplied info, discussion outcome, external
   source), and what the document is for. Do not ask whether the user wants
   "documentation or a handoff" — decide from the content and purpose.
2. Prepare the content: keep substance and important detail, drop needless
   repetition, use terms and formatting that fit the topic, and add only the
   context needed for the document to stand alone. Follow any format the user
   explicitly requested. Do not auto-add work status, blockers, or next steps
   when they are irrelevant.
3. Recommend the filename: descriptive, short, lowercase `kebab-case` with an
   `.md` extension (avoid generic names like `notes.md`). When name and
   location are both unset, propose a name and ask for both together.
4. Confirm the storage location with the user, then create or update the file.
   Validate the resolved path (reject traversal outside the intended root)
   and follow rule 4 for existing files.
5. Validate and report: check the result matches the request, reads cleanly,
   and loses nothing important. Report the file location plus a short summary
   of the content and changes — accurately, based on what actually happened.

## Verifying this skill

- The output structure follows the content (short notes stay short; complex
  docs get the sections they need) with no forced template sections.
- No file is created until filename and location are both known/confirmed.
- Updating an existing file preserves relevant prior content without duplication.
- The final report names the real path and describes only what was actually done.
