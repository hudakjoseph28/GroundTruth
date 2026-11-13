# GroundTruth task prompt

Use this only after the agent has read [AGENTS.md](../../AGENTS.md). The first task in a fresh context includes a one-time skim of every repository Markdown file; later tasks link only the sections that govern the work. A good prompt gives the agent enough authority to finish one outcome without reopening settled product or stack decisions.

Copy the template for **one bounded piece of work**. Name the phase file, exact governing sections, and smallest fixture or error output the agent needs. Point to repo paths; do not paste what is already here.

```text
Outcome
[What can a buyer, reviewer, or teammate do after this task?]

Owner and phase
[Owner from the README roles table] · [docs/phases/<phase file>]

Read first
- AGENTS.md
- docs/architecture/DataContract.md (types and routes this touches)
- [Relevant doc section and what it establishes]
- [Affected code path, fixture, or test]

Scope
- Own [one behavior].
- Change [expected area].
- Preserve [shared interface other owners rely on].
- Coordinate [cross-owner decision, if any].

Non-goals
- Do not build [adjacent behavior].
- Do not change [contract, package, or decision outside the task].

Starting state
- [What works now, with a command that proves it.]
- [What is mocked, missing, or blocked.]

Acceptance checks
1. [Entry point, input or fixture, expected visible result.]
2. [Missing, disputed, or failure case and expected result.]
3. [Test, build command, or manual check to run.]

Proof to return
- [Command and expected result]
- [Screenshot, response payload, balance table, or transaction link]

Stop conditions
- Stop only for [missing credential, destructive migration, contract conflict, or external outage].
- Otherwise use the documented default and finish the bounded task.

Handoff
Changed paths, what you verified, what still depends on another owner,
and assumptions that affect the next task.
```

## Example

**Outcome:** The buyer opens the sample parcel and sees the next step for legal access.

**Owner and phase:** Joey · [Phase 2](../phases/02-parcel-research/ParcelResearch.md)

**Read first:** `AGENTS.md`, `Check` in [DataContract.md](../architecture/DataContract.md), "Opening a parcel" in [Vision.md](../design/Vision.md), and the buyer scenarios in [Problem.md](../context/Problem.md).

**Scope:** Build the parcel report panel against the sample `ParcelReport` fixture. Keep the map visible when a source opens. Report panel only.

**Non-goals:** no provider calls from the browser, no wallet connection, no closing workflow, and no new status values.

**Starting state:** The fixture shows road frontage in GIS and no confirmed access determination.

**Acceptance checks:**

1. On the sample parcel, the access check shows **Needs review** and a concrete next action.
2. Opening the check shows the dated source and what the map does (and doesn't) establish.
3. With no source, the panel shows **Unknown** and names who can resolve it. Run the UI checks and note that the fixture was used.

**Proof to return:** the focused component test, `pnpm --filter web typecheck`, a screenshot of both fixture states, and the exact fixture path.

**Stop conditions:** stop for a `DataContract` conflict. Missing final copy or a visual preference is not a blocker; follow [Vision.md](../design/Vision.md).

**Follow-ups:** give the agent the prior result, changed paths, verification output, and the next acceptance check. Do not paste whole docs into the prompt. Do not ask an agent to “build the backend” or “finish the UI”; split work at a route, screen, program instruction, or integration boundary.
