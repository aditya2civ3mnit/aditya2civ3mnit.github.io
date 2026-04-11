# Setup Checklist Skill

Use this document as a conversion guide for turning freeform user input into the app's setup JSON format.

## Goal

Convert a user's natural-language description of a trading setup into a valid setup object that matches the app schema used by the backend and frontend.

The output should be ready to save as a setup, with stable ids, clear titles, and nested checklist items where needed.

## Core Rules

- Produce one setup object per request unless the user explicitly asks for multiple setups.
- Keep ids stable, lowercase, and slug-like.
- Use descriptive titles that read naturally in the UI.
- Preserve the user's intent, but normalize wording into concise checklist language.
- Include both `preTradeSegments` and `postTradeSegments` when the user gives post-trade/journal ideas.
- If the user does not mention a post-trade section, return an empty `postTradeSegments` array.
- If a segment has no valid items, do not include it.
- If an item is a condition with branches, use `nodeType: "condition"` and fill `branches.then` and `branches.else`.
- For normal checklist items, use `nodeType: "check"`.
- Default `required` to `true` unless the user explicitly indicates it is optional.
- Default `allowMedia` to `true` unless the user explicitly says media should not be attached.

## Setup JSON Shape

```json
{
  "name": "Setup Name",
  "isDefault": false,
  "preTradeSegments": [
    {
      "id": "segment-id",
      "title": "Segment Title",
      "items": [
        {
          "id": "item-id",
          "nodeType": "check",
          "title": "Checklist item title",
          "description": "Short supporting description",
          "required": true,
          "allowMedia": true,
          "children": [],
          "branches": {
            "then": [],
            "else": []
          }
        }
      ]
    }
  ],
  "postTradeSegments": []
}
```

## Important Field Rules

### `name`
- Human-readable setup name.
- Example: `SMC Liquidity Setup`.

### `id`
- Use slug case.
- Segment ids should be based on the segment title.
- Item ids should be based on the item title.
- If duplicate ids could occur, add a short suffix.

### `nodeType`
- Use `check` for regular checklist nodes.
- Use `condition` when the item is a branch point with `If / Else` logic.

### `children`
- Use for nested sub-checks under a node.
- Keep as an array, even when empty.

### `branches`
- Use only for condition nodes.
- Must always contain both `then` and `else` arrays.

### `required`
- `true` means the item is mandatory for the setup.
- `false` means optional.

### `allowMedia`
- `true` if screenshots or chart media should be attachable.
- `false` if the item should be checklist-only.

## Normalization Rules

When converting user text:

- Merge duplicate ideas into one item.
- Split long instructions into smaller items if they represent separate decisions.
- Keep segment names broad and item names specific.
- Avoid vague item titles like "Check market".
- Prefer action-oriented titles like "Liquidity sweep has formed".
- If the user gives a sequence, preserve that order.
- If the user says "then" / "else" / "if this happens", convert it into a condition node with branches.

## Suggested Segment Pattern

A good setup usually follows this structure:

- Pre-trade:
  - Higher timeframe context
  - Liquidity / structure / bias
  - Entry trigger
  - Risk / target confirmation
  - Final filters
- Post-trade:
  - Execution review
  - Mistakes / lessons
  - Notes / improvement actions

## Example Conversion

### User input

"I want a liquidity setup. First check HTF reaction, then sweep of buy-side liquidity, then wait for CHoCH, then enter on FVG. After trade, I want to note whether I followed the plan and what I can improve."

### Output

```json
{
  "name": "SMC Liquidity Setup",
  "isDefault": false,
  "preTradeSegments": [
    {
      "id": "higher-timeframe-setup",
      "title": "Higher Timeframe Setup",
      "items": [
        {
          "id": "htf-reaction",
          "nodeType": "check",
          "title": "Price is reacting to the HTF POI",
          "description": "Look for rejection or displacement from the higher-timeframe area.",
          "required": true,
          "allowMedia": true,
          "children": [],
          "branches": { "then": [], "else": [] }
        }
      ]
    },
    {
      "id": "liquidity-sweep",
      "title": "Liquidity Sweep",
      "items": [
        {
          "id": "buy-side-sweep",
          "nodeType": "check",
          "title": "Buy-side liquidity has been swept",
          "description": "Wait for the sweep before looking for confirmation.",
          "required": true,
          "allowMedia": true,
          "children": [],
          "branches": { "then": [], "else": [] }
        },
        {
          "id": "choch-confirmed",
          "nodeType": "check",
          "title": "CHoCH confirmed in the trade direction",
          "description": "Use structure shift to confirm bias.",
          "required": true,
          "allowMedia": true,
          "children": [],
          "branches": { "then": [], "else": [] }
        }
      ]
    },
    {
      "id": "entry-trigger",
      "title": "Entry Trigger",
      "items": [
        {
          "id": "fvg-entry",
          "nodeType": "check",
          "title": "Entry is taken on the FVG",
          "description": "Enter only when the planned fair value gap is retested.",
          "required": true,
          "allowMedia": true,
          "children": [],
          "branches": { "then": [], "else": [] }
        }
      ]
    }
  ],
  "postTradeSegments": [
    {
      "id": "execution-review",
      "title": "Execution Review",
      "items": [
        {
          "id": "followed-plan",
          "nodeType": "check",
          "title": "Trade followed the original plan",
          "description": "Compare what happened against the setup rules.",
          "required": true,
          "allowMedia": false,
          "children": [],
          "branches": { "then": [], "else": [] }
        },
        {
          "id": "improvement-noted",
          "nodeType": "check",
          "title": "One improvement action was recorded",
          "description": "Write the next change to apply in future trades.",
          "required": true,
          "allowMedia": false,
          "children": [],
          "branches": { "then": [], "else": [] }
        }
      ]
    }
  ]
}
```

## Output Expectations

When asked to convert user input, return:

- A single JSON object
- Valid ids
- Clear segment titles
- Checklist items that can be rendered directly
- No extra explanation unless the user asks for it

## Quality Checklist

Before finalizing, verify:

- Every segment has a non-empty title.
- Every item has a unique id.
- Every item title is specific and readable.
- Condition nodes have both `then` and `else` branches.
- Empty segments are removed.
- The result reflects the user's actual trading logic.

## Short Prompt Template

You can use this prompt with a model:

> Convert the user's setup description into a valid setup JSON object that matches the app schema. Use stable slug ids, split the logic into clean segments and checklist items, preserve nested conditions using `nodeType: "condition"` with `branches.then` and `branches.else`, and return JSON only.

## Notes for LLMs

- Do not invent extra trading rules unless the user implies them.
- Prefer conservative interpretation over over-expansion.
- If the user input is ambiguous, pick the simplest valid structure.
- If a segment is clearly post-trade analysis, place it in `postTradeSegments`.
- If the user wants a default setup, set `isDefault: true`.
