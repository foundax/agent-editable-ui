# Engineering Design: Connecting Source, Rendered Instances, and Visual Edits

[简体中文](architecture.zh-CN.md) · [Project overview](../README.md) · [Worked examples](../examples/walkthrough.md)

Visual editing has two distinct steps: determine what the user selected, then determine what the operation should change.
A source location helps with the first step. Value provenance, instance scope, and business ownership determine the second.

This document abstracts Foundax's editor practice into a reference design.
Types and pseudocode explain boundaries; they are not a compiler or runtime shipped with this repository.
The static examples help evaluate whether a design can explain concrete editing behavior.

## 1. System Topology and State Ownership

### 1.1 From Author Code to an Edit

```text
Author input: agent / code editor                 User input: visual canvas
              |                                             |
              v                                             | Selection + intent + scope
Trusted host                                                v
  Versioned project → Compiler analysis → Edit index → Target and capability resolution
          ^                  |                              |
          |                  v                              v
          |          Derived preview code             Edit plan and revision check
          |                  |                              |
          +------------------|------------- Atomic commit <-+
                             v
Isolated preview: rendered elements / caller paths / member observations / selection events

Domain services: own product and other business facts; provide authorized read views
```

The host receives edit intent, resolves its trusted index, and applies changes.
DOM observations, paths, or offsets reported by the browser are inputs, not authorized write addresses.
Builds and previews involving user code should execute in a restricted environment separate from the trusted host.

### 1.2 Four Kinds of State

| State | Contents | Lifecycle and ownership |
| --- | --- | --- |
| Project revision | Author files, page references, instance edit state | Shared commit boundary for agent, code, and canvas edits |
| Compiler-derived data | Nodes, field provenance, edit index, preview artifacts | Rebuildable from a project revision and toolchain |
| Runtime observations | Occurrences, caller paths, active branches, selections | Current preview; not directly a durable identity |
| External business data | Products, prices, inventory | Existing domain services, with their own authorization and versions |

A project revision can include source files and sparse instance overrides.
Overrides have explicit instance, field, and scope addresses.
They do not form a second complete page tree that must be independently synchronized with source.
The compiler index describes the project; it is not another editable source of page state.

### 1.3 Preview and Publication

Preview and publication interpret the same source, effective instance overrides, and business bindings.
Selection overlays, edit events, and diagnostics belong to the editor runtime.
Content and style overrides affect the page and must also apply when published.
Record both project revision and toolchain identity so one build's index cannot be used with another build's preview.

## 2. Compiler Analysis: From Locations to Value Provenance

### 2.1 The Edit Index

The compiler reads authorized source files and module relationships to identify JSX nodes, fields, and references.
An index needs to represent at least the following information:

| Information | Purpose |
| --- | --- |
| Project revision and toolchain identity | Bind the index to its build inputs |
| File identity, content digest, source range | Locate and validate a target within a fixed revision |
| Node and field identities | Distinguish an element from its text, link, image, or other fields |
| Value provenance | Track variables, props, call sites, and data bindings |
| Resolution result and capability conditions | Identify traceable, dynamic, external, or ambiguous origins |

Compilation derives this information; the model does not maintain it field by field.
Source maps connect generated and original code locations.
The edit index adds the semantics needed to connect values with editing operations.

### 2.2 Static Analysis and Runtime Observations

Static analysis can trace literals, references, resolvable parameter forwarding, and supported expressions.
It retains candidate origins and conditions without executing author functions to infer arbitrary expression semantics.

Runtime observations help identify the mounted call site, collection member, and active branch.
These observations narrow candidates; the host still validates them against current source and bindings.
Observing a rendered value does not establish a unique, reversible write path.

Instrumentation should minimize added layout wrappers and expression evaluation.
Validate evaluation counts, component calls, and rendered results so observation does not change program behavior.

### 2.3 Four Distinct Identities

| Identity | Example | Is it sufficient to identify a durable mutation? |
| --- | --- | --- |
| Source node | The `<h2>` inside `Note` | Locates a definition only |
| Component call site | The second `<Note />` in the page | Identifies a source invocation; field provenance still matters |
| Collection member | A record with a stable domain key or local identity | Requires its collection and caller context |
| Runtime occurrence | One appearance in the current DOM | Observation for the current preview only |

React keys support list reconciliation; they do not directly establish host authorization or cross-revision editing identity.
A business ID alone cannot identify a page instance: the same product may appear several times with different presentation settings.

## 3. Edit Semantics: Provenance, Intent, and Scope

### 3.1 Declare the Operation Before Planning the Mutation

A simplified edit command can carry the following fields:

```ts
type EditCommand = {
  expectedRevision: string;
  selectionId: string;
  field: string;
  operation: "set-text" | "set-style" | "replace-binding";
  scope: "definition" | "instance";
  value: unknown;
};
```

`selectionId` is a host-resolvable reference, not an arbitrary client-supplied file path.
`scope` expresses user intent; the host determines whether that scope is supported for the indexed target.
Each operation needs its own value type and validation rules; the type above shows their common fields.

### 3.2 Choose a Mutation Path by Ownership

| Origin | Operation | Mutation path |
| --- | --- | --- |
| Direct JSX copy | Change the page heading | The indexed literal in the current revision |
| Literal prop at a distinct call site | Change the second note | That call site's prop; preserve other calls |
| Shared component definition | Change all matching components | Explicit definition-level source edit |
| Instance-specific presentation | Recolor one card | Sparse override or explicit prop for a verified instance |
| Page product reference | Display another product | Page reference or query argument; preserve presentation code |
| External product field | Change the selling price | Authorized domain-service operation |
| Computed or aggregated value | Change the displayed result | Explicit edit of an input or expression |

When provenance is ambiguous, show candidate locations and scopes for the user to choose.
An expression without a supported mutation path can still render and be located;
its direct value-editing capability should be marked unavailable.

### 3.3 Instance Override State

Source provides the default presentation; overrides express explicitly scoped local differences.
An override records a stable instance path, field, scope, and value, versioned with the source.

This adds responsibilities: define how defaults and overrides combine, handle removed instances,
revalidate targets after agent changes, and preserve effective overrides in exports and publication.
An override cannot depend only on DOM order, which can change when elements move or acquire new wrappers.

**A surviving identity does not prove that an old override still applies.**
An override also depends on its field's provenance and base value.
If an agent explicitly changes the underlying copy, a previous instance override should not keep masking it
merely because the node ID survived. Revalidate provenance, field semantics, and base values;
retain unrelated overrides and retire invalidated overrides with a recorded reason.
Define which source changes invalidate overrides and verify those rules through continued editing cases.

## 4. From Edit Commands to Versioned Commits

### 4.1 Mutation Pipeline

```text
Validate request and authorization
  → Check the base revision
  → Resolve selection and scope using that revision's index
  → Prepare source changes, instance overrides, or binding changes
  → Validate the candidate project
  → Compare-and-swap the project head
  → Build and load the new revision's preview and index
```

Generate source edits against resolved nodes or exact ranges and preserve unrelated code.
Check original contents and revision before committing.
Prepare all affected edits before applying them as one project change.
Source patches and AST transforms are both options; targets must be explicit, changes inspectable, and failed edits non-partial.

```python
def apply_edit(principal, project_id, command):
    authorize_project_edit(principal, project_id)
    validate_command(command)
    current = read_project_head(project_id)
    require_revision(current, command.expectedRevision)

    index = require_edit_index(current.revision, current.toolchain)
    target = resolve_selection(index, command.selectionId)
    plan = prepare_edit(current, target, command)
    candidate = apply_plan(current, plan)
    validate_candidate(candidate)

    return commit_if_head(project_id, current.revision, candidate)
```

`prepare_edit` validates provenance and scope and returns an explicit mutation plan.
`commit_if_head` atomically checks the revision at the persistence boundary.
An earlier version check cannot replace this commit-time compare-and-swap.
While the new index is being prepared, defer operations that depend on it instead of combining a new preview with an old index.

### 4.2 Project Changes and Business Writes Have Separate Transactions

Replacing a page's product reference is a project edit and can be saved with page styles.
Changing a product's price uses the domain service's authorization, validation, and concurrency controls.
These operations do not share a generic source-patch transaction.
The product interaction should distinguish their results and undo semantics.

The rendered page can depend on both a project revision and the current authorized business view.
In a system using live business reads, undoing a page reference restores that reference and reads the product's current data.
It does not restore a historical price or reverse an inventory update.
Preview and publication should share binding semantics; the read policy determines refresh timing.
See Section 5 of the [worked examples](../examples/walkthrough.md) for a concrete sequence.

## 5. Identity After Agent-Written Code Changes

### 5.1 Locations and Durable Identity

A source range accurately addresses a node within a fixed revision.
Inserting JSX can shift every subsequent offset.
Stable identity carries editing meaning forward; the new revision's index must resolve the actual mutation location again.

Reconciliation can use existing identities, module and caller relationships, parent context,
structural correspondence, and explicit member keys.
Matching text or appearance offers candidates but cannot alone prove that two nodes are the same object.

### 5.2 Proven Correspondence and Unresolved State

| Code change | Handling principle |
| --- | --- |
| Edit an unrelated function | Rebuild locations; retain identities with proven correspondence |
| Move a uniquely identifiable subtree | Preserve identity; update position and context |
| Duplicate a card | Allocate a distinct identity; define whether its overrides are copied |
| Reorder indistinguishable nodes | Mark affected mappings unresolved and require a new target selection |
| Remove an instance or replace its data source | Check whether previous overrides and bindings still apply |
| Submit from an old canvas | Reject the stale revision and regenerate the edit from current state |

Identity preservation must follow verifiable correspondence.
For unresolved overrides, retain diagnostics and the original revision reference,
but stop applying them to new targets until the association is confirmed.
This prevents one instance's text or appearance from silently moving to another.

## 6. Engineering Costs and Observability

| Mechanism | Benefit | Cost and trade-off |
| --- | --- | --- |
| Compiler-derived index | Ordinary author code with centrally managed edit metadata | Parsing, analysis, index size, toolchain support |
| Value provenance | Direct edits to the actual source | Coverage, branching, ambiguity handling |
| Runtime observations | Distinguish occurrences of shared definitions | Instrumentation cost and behavior verification |
| Explicit instance overrides | Local differences without copying full components | Composition, migration, undo, publication parity |
| Project revisions and CAS | Prevent agent and canvas changes overwriting each other | Conflict handling and index preparation |

Reuse indexes only for matching project and toolchain inputs.
Partial reanalysis after a change requires dependency tracking:
a one-file change can alter provenance at call sites in other modules.

Measure parsing, provenance analysis, instrumentation, preview updates, and commits separately.
Track resolvable fields, verified instance scopes, ambiguous targets, identity retention, and stale-revision rejections.
Evaluate latency alongside editing correctness; increasing the reported editable coverage by assigning incorrect targets is a regression.

## 7. Acceptance Matrix

These are requirements for evaluating an implementation, not executable tests shipped with this repository.

| Scenario | Expected result |
| --- | --- |
| Edit direct copy | Only the target literal changes; surrounding JSX and expressions remain |
| Two call sites display identical copy | Editing the second preserves the first |
| Edit a shared definition | Affected instances match the user's chosen scope |
| Replace a product reference | Displayed data follows the reference; product records remain unchanged |
| Edit a formatted price | The computed result is not accidentally persisted as page copy |
| Reorder identifiable members | Edit state follows members without swapped identities |
| Submit an old selection after agent insertion | Reject the stale revision instead of writing at old offsets |
| Save and publish an instance override | Reload, undo, and publication interpret state consistently |
| Enable or disable instrumentation | Preserve expected author-program behavior for the same input |

