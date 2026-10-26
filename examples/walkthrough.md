# From a Canvas Action to the Correct Edit Target

[简体中文](walkthrough.zh-CN.md) · [Project overview](../README.md) · [Engineering design](../docs/architecture.md)

The first four cases share [page.tsx](page.tsx) and [products.json](products.json).
Section 5 connects the operations into a continuing editing sequence.
They contain static source and expected outcomes for reasoning about edit semantics.
This repository does not render, analyze, or mutate the examples.
A hypothetical host supplies product data to `Page`, which selects a product through `featuredProductId`.

## 1. Edit Direct Copy

The user selects the page heading and changes it to “Everyday objects, thoughtfully made”.

Original source:

```tsx
<h1>Objects for small spaces</h1>
```

Expected change:

```tsx
<h1>Everyday objects, thoughtfully made</h1>
```

The edit index can locate the text field at this JSX text node.
The host checks the selection's revision and current file contents before committing the replacement.
The `h1` tag, surrounding layout, product data, and other copy remain unchanged.

This value has a direct and unique author-owned origin, so planning the mutation is straightforward.
The next case shows why matching visible text is not enough to locate a target.

## 2. Edit Only the Second Note

There is one `Note` definition:

```tsx
function Note({ title }: { title: string }) {
  return (
    <aside className="note">
      <h2>{title}</h2>
    </aside>
  );
}
```

The page invokes it twice with identical copy:

```tsx
<Note title="Made for small spaces" />
<Note title="Made for small spaces" />
```

The user edits only the second note. The expected result is:

```tsx
<Note title="Made for small spaces" />
<Note title="Designed for daily use" />
```

Resolving this selection requires the following chain:

```text
The second note's h2
  → The title field in the Note definition
  → The second call site observed for this rendering
  → The title literal at that call site
```

Static analysis establishes how `title` is forwarded; runtime observations distinguish the active call site.
The host validates this relationship and edits the second prop.
Replacing matching text globally would change both notes.
Replacing `{title}` with a fixed string in the definition would change the result for every caller.

An illustrative command follows. The host resolves the selection identifier;
an implementation generates identifiers from its current index and selection session.

```json
{
  "expectedRevision": "r1",
  "selectionId": "second-note-heading",
  "field": "text",
  "operation": "set-text",
  "scope": "instance",
  "value": "Designed for daily use"
}
```

These instances have distinct literal props, so the edit can change a call-site argument directly.
When instances share an origin, the editor needs an explicit shared edit or a supported instance override;
it cannot silently broaden the scope.

## 3. Replace a Product or Change Its Price

The page currently references:

```tsx
const featuredProductId = "cup-blue";
```

`ProductCard` reads the product title and formats `priceInCents` for display.
The synthetic cup has a price of `2400` cents, displayed as `$24.00`.

### Display Another Product

After the user selects the sand-colored tray, the expected project change is:

```tsx
const featuredProductId = "tray-sand";
```

The same card code reads the tray's title and price, displaying `$32.00`.
The product records and card layout remain unchanged, and related fields continue to come from the same product.
This fixture stores its reference in a literal; a real system can also use an explicit page setting or query argument.

### Change the Price Color

This is a presentation edit. Update a style or record an instance override according to the selected definition or instance scope.
Keep `priceInCents`, the formatting expression, and the product reference unchanged.

### Change the Selling Price

This is a business operation. Use the product service's authorized write path with its own version and business rules.
Replacing `{formattedPrice}` with `"$20.00"` would create page copy disconnected from the actual selling price.
It would not perform the requested business change.

### Change the Price Format

This changes presentation logic, such as an `Intl.NumberFormat` option.
Use an explicit format setting or code edit; the displayed string is not a raw numeric value to write back.

| Intent | Change | Preserve |
| --- | --- | --- |
| Show another product | Page product reference | Product records, card code |
| Change the price color | Style in the selected scope | Price data, reference, calculation |
| Change the selling price | Product service field | Page binding |
| Change the price format | Formatting rule | Raw price value |

## 4. Submit an Old Selection After an Agent Changes the Code

Suppose the canvas shows project revision `r1`.
The user has selected the second note but has not submitted the edit.
An agent then adds an introductory paragraph and saves revision `r2`.

```text
r1: select the second note and record the base revision
    ↓
r2: the agent adds source; the host commits a new revision
    ↓
The old canvas sends expectedRevision = r1
    ↓
The host sees r2 and rejects the stale mutation
    ↓
Load r2's preview and index, resolve the target, and form a new command
```

Even if the copy is unchanged, the old source offsets may be invalid.
Revision checks prevent old commands from overwriting new source.
Identity reconciliation helps locate the previous target in the new revision when correspondence can be established.

If the agent duplicates or reorders indistinguishable nodes, require a new selection.
Automatically treating “the same text in the second region” as the previous target turns uncertainty into a write.

## 5. Putting It Together: Agent, Merchant, and Backend Changes

This sequence uses the synthetic fixtures to illustrate state transitions and expected outcomes in the reference design.
Assume product data refreshes through a business read service, while the project stores references and presentation settings.
`p1`, `p2`, and subsequent labels identify project revisions; `b1` and `b2` identify illustrative business data versions.
They belong to separate mutation boundaries.

| Step | Operation | Project | Business view |
| --- | --- | --- | --- |
| Initial state | Show the cup and two notes with identical copy | `p1` | `b1`: cup $24, tray $32 |
| Merchant edits copy | Change the second note to Designed for daily use | `p2` | `b1` |
| Merchant edits appearance | Make this product card's price purple | `p3` | `b1` |
| Agent changes layout | Wrap the notes and move the product card | `p4` | `b1` |
| Backend updates price | Change the cup price; refresh the business read | Still `p4` | `b2`: cup $26, tray $32 |
| Merchant replaces product | Display the tray in the current card | `p5` | `b2` |
| Merchant undoes replacement | Restore the project state from `p4` as a new revision | `p6` | Still `b2` |

### The Merchant's Two Edits Use Different Storage Paths

The second note has a distinct literal prop, so edit that call site without storing a separate copy override.
The price color should affect only the current product card.
For this example, store a sparse style override addressing the verified instance, field, and property.
Keep the business price and `formattedPrice` expression unchanged.

**The existing origin and requested scope determine whether an edit changes source.**
Persisting an override for every canvas edit increases composition and migration costs.
Changing a shared definition for every edit can affect more instances than intended.
Both mutation paths should participate in the project's revision transaction.

### After the Agent Changes Layout, Recheck the Relationships

Here the agent starts from `p3` and changes wrappers and positions while preserving note props and the product reference.
Compilation produces new source locations and checks whether the product instance path and price field can still be established.
If those relationships hold, retain the price color and the second note's edited copy.

If the agent also duplicates indistinguishable cards, the style override may need a new target.
If it explicitly changes a base value covered by a content override, check whether that override is now invalid.
An unchanged node ID alone cannot resolve all these cases.

### A Backend Update Does Not Create a New Page-Owned Price

When the cup changes from $24 to $26, the refreshed business view passes through the existing expression to display `$26.00`.
The project remains at `p4`, and the card's instance color still applies.
Preserve the price field's business origin instead of saving the previous `$24.00` rendering
as local copy that continues masking the real price.

### What Replacement and Undo Restore

Selecting the tray changes the page reference. The card keeps its appearance,
while its title and price come from the tray record.
Undo restores the cup reference and previous project state.
The business view is already `b2`, so the restored card should display **$26**.

This undo must not change the cup's actual selling price back to $24.
Project history restores project state; business history governs business data.
Rendering combines them according to the read contract.

### What Publication Verifies

Publishing `p5` must preserve the tray reference, local appearance, and edited note copy.
Preview and publication should interpret them consistently under the same business view.
Saving the undo as `p6` creates a new draft, which follows the publication workflow to update the live project version.
Business data continues updating according to its read policy.

The sequence exposes five concrete correctness checks: mutation scope, override applicability,
identity correspondence after code changes, business data freshness, and separation of project undo from business writes.
Each can be evaluated through explicit before-and-after states.

## Reviewing an Implementation with These Cases

For each case, check whether the editor identifies the right origin, respects the selected scope,
preserves unrelated code and business data, and produces consistent results after save, reload, and publication.

Additional cases can introduce `.map()`, prop forwarding, conditional branches, or shared content.
Continue specifying the intended mutation target.
A visually correct result alone does not establish that source, data, and subsequent edits remain consistent.

