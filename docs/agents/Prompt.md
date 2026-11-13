# GroundTruth task prompt

Copy the template for one bounded piece of work. Name the files and the specific architecture section the agent needs. Add the smallest relevant fixture, error output, or acceptance example. Use paths for context already in the repo. For weekend build tasks, name the phase file in `docs/phases` and, when the task touches escrow, maps, or the phone, the relevant section of `docs/context/ReferenceBuilds.md`.

```text
Outcome
[What should a buyer, reviewer, or teammate be able to do after this task?]

Read first
- AGENTS.md
- [Relevant file or section and what it establishes]
- [Affected code path, shared type, fixture, or existing test]

Scope
- Own [one behavior or workstream slice].
- Change [expected area].
- Preserve [shared interface or behavior other owners rely on].
- Coordinate [specific cross-workstream decision, if any].

Starting state
- [What works now, with evidence or a reproducible command.]
- [What is mocked, missing, or blocked.]
- [Current agreed assumptions, only where relevant.]

Acceptance checks
1. [Entry point, input or fixture, and expected visible outcome.]
2. [Important missing, disputed, or failure case and expected outcome.]
3. [Existing test, build command, or manual verification to run.]

Handoff
List changed paths, what you verified, what still depends on another owner,
and any assumptions that affect the next task.
```

## Example

**Outcome:** The buyer can open the sample parcel and identify the next step for legal access.

**Read first:** `AGENTS.md`, the Parcel discovery and report coverage section of `docs/architecture/Architecture.md`, and the buyer scenarios in `docs/context/Problem.md`.

**Scope:** Build the parcel report panel against the agreed inputs or sample records. Keep the map visible when the source opens. This task covers the report panel.

**Starting state:** The fixture shows road frontage in GIS and has no confirmed access determination.

**Acceptance checks:**

1. On the sample parcel, the access finding shows **Needs review** and a concrete next action.
2. Opening the finding shows the dated source and explains what the map establishes.
3. With no source available, the panel shows **Unknown** and names who can resolve it. Run the relevant UI checks and record whether the fixture was used.

For a follow-up, give the agent the prior result, changed paths, and the next acceptance check. Include a longer brief or transcript only when the task depends on its contents.
