---
name: generate-amazon-five-bullets
description: Run a fixed eight-node workflow to generate Amazon Listing five-bullet descriptions plus an additional SEO-aware product description from reverse-search keyword spreadsheets, product descriptions, competitor review files, and competitor bullet descriptions. Use when Codex must classify and select SEO keywords, analyze review pain and delight points, pause for the user's product confirmation, analyze competitor content and writing style, consolidate verified selling points, and produce validated bullets and a semantically clear long-form description without inventing claims. Supports .xlsx/.csv keyword and review inputs plus .md/.txt competitor and product inputs.
---

# Generate Amazon Five Bullets

Execute the supplied eight-node workflow exactly, persist every node result, pause after node 3 for human confirmation, resume without repeating work, and then add a separate product-description deliverable.

## Load the workflow

Read [references/workflow-original.md](references/workflow-original.md) completely before the first run. Treat every node prompt between `prompt：` and the next `---` as immutable: pass it intact without rewriting, shortening, translating, or silently correcting it. Read [references/workflow-map.md](references/workflow-map.md) for orchestration and compatibility. Read [references/product-description-extension.md](references/product-description-extension.md) before generating the additional description.

## Collect inputs

Require four inputs: reverse-search keywords, the user's product description, competitor reviews, and one or more competitors' five-bullet descriptions. Accept attached files, local paths, or pasted content. Request only missing inputs. Do not browse for replacements or infer product facts.

For file inputs, run:

```powershell
python scripts/prepare_inputs.py --keywords <keywords.xlsx> --product <product.md> --reviews <reviews.csv> --competitors <competitors.md> --output-dir <run-directory>
```

Use a run directory inside the workspace. Use `input_bundle.json` as the normalized source. If Python is unavailable, use another spreadsheet/document tool while preserving the same bundle fields.

## Preserve source data

- Keep every source keyword column and value. Under node 1 `original_fields`, use actual source headers rather than forcing the example headers.
- Preserve blank values as empty strings.
- Ensure node 1 retained plus excluded records account for every source row.
- Exclude only certainly incompatible keywords.
- Never add a node 2 keyword absent from node 1.
- Treat competitor claims as analysis material, not facts about the user's product.

## Execute the original graph

Create `run-state.json` with source paths, outputs, completed nodes, and `stage`.

1. Run node 1 from product plus keywords, then node 2 from node 1 plus product.
2. Run node 3 from reviews.
3. Independently run nodes 5 and 6 from competitor bullets and node 7 from product. Do not expose their conclusions as confirmation hints.
4. Save every completed output before pausing.

Do not merge nodes or give a node inputs its original prompt does not specify.

## Pause after node 3

Save `node-3.json`, show its complete JSON, ask whether the product solves each pain point and has each delight point, set `stage` to `awaiting_product_confirmation`, and stop. Accept free-form replies or `是/否/部分具备/不确定 + 说明`. Do not guess and do not run node 4.

On the next reply, pass node 3 plus the user's reply verbatim to node 4. Do not rerun nodes 1–3.

## Complete nodes 4 and 8

- Run node 4 with its unmodified prompt and faithfully preserve confirmed, partial, inapplicable, and pending points.
- Run node 8 only after nodes 2–7 exist, using clearly labeled input blocks.
- Infer listing language from an explicit request first, otherwise from competitor bullets.
- Save node 8 as `final.json` and extract its five copies to `final-bullets.txt`.

## Add the product-description output

After node 8 passes validation, follow `references/product-description-extension.md`. Do not alter, replace, or rerun node 8. Use node 2 keywords, node 4 confirmations, node 7 facts, and node 8 final bullets as the only authoritative inputs.

Save the structured result as `product-description.json` and its `product_description` value as `product-description.txt`. This is an additional deliverable, not a change to the original eight nodes.

## Validate outputs

Save JSON nodes without Markdown fences. Node 6 uses its original text format.

```powershell
python scripts/validate_workflow_output.py --node <1-9> --file <output> --bundle <run-directory>/input_bundle.json
```

Use `--node 9` only for the separate product description. Fix failures before delivery. Validate exact keyword occurrence, five-bullet count, supported facts, natural wording, package boundaries, and consistency between bullets and description.

## Deliver

Return node 8 JSON, the five bullets, and the additional product description. Link `final.json`, `final-bullets.txt`, `product-description.json`, and `product-description.txt`. State unconfirmed facts and intentionally unused keywords.
