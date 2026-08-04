# Workflow map and compatibility rules

## Contents

- Input mapping
- Node graph
- Prompt locations
- Persistence contract
- Tested compatibility rules

## Input mapping

| Input | Preferred formats | Nodes |
|---|---|---|
| Reverse-search keywords | XLSX, CSV | 1, then 2 |
| Product description | Markdown, text | 1, 2, 7 |
| Competitor reviews | CSV, XLSX, Markdown, text | 3, then 4 |
| Competitor bullets | Markdown, text, CSV | 5, 6 |

## Node graph

```text
product + keywords -> node 1 -> node 2 --------+
reviews -----------> node 3 -> PAUSE -> node 4 +
competitor bullets -> node 5 ------------------+--> node 8
competitor bullets -> node 6 ------------------+
product -----------> node 7 -------------------+
```

Node 8 receives nodes 2, 3, 4, 5, 6, and 7. Node 3 remains review evidence; node 4 distinguishes which review-derived points the user confirmed.

## Prompt locations

All prompts are stored verbatim in `workflow-original.md`:

- Node 1: `【节点1：关键词分类节点】`
- Node 2: `【节点2：SEO策略节点】`
- Node 3: `【节点3：评论分析节点】`
- Node 4: `【节点4：卖点确认助手节点】`
- Node 5: `【节点5：竞品分析节点】`
- Node 6: `【节点6：listing风格分析节点】`
- Node 7: `【节点7：产品卖点整理节点】`
- Node 8: `【节点8：五点输出节点】`

Search by these exact headings. Never paraphrase prompt bodies.

## Persistence contract

Use stable names in the run directory:

```text
input_bundle.json
run-state.json
node-1.json
node-2.json
node-3.json
user-confirmation.txt
node-4.json
node-5.json
node-6.md
node-7.json
final.json
final-bullets.txt
```

`run-state.json` records `stage`, `completed_nodes`, `created_at`, `updated_at`, and absolute source/output paths. Valid stages: `prepared`, `running_pre_confirmation`, `awaiting_product_confirmation`, `running_post_confirmation`, `complete`, and `failed`.

## Tested compatibility rules

The tested keyword workbook contained 467 records and 19 fields. Real headers differed from the node 1 example, including `购买量` instead of `月购买量`, plus `近7天广告竞品数`, `PPC价格`, and `建议竞价范围`. Preserve real headers exactly under `original_fields`.

Do not select metadata sheets such as `Unique Words` or `Notes`. The preparation script selects the largest tabular worksheet unless `--keyword-sheet` is supplied.

Review files may contain quoted commas, multiline reviews, emoji, bullets, and curly punctuation. Use CSV parsing rather than splitting lines or commas.

One competitor ASIN is valid for nodes 5 and 6. For multiple ASINs, retain each ASIN-to-bullets association.

The user confirmation pause is mandatory even when the initial product description appears to answer some questions. The user's post-analysis confirmation is the evidence used by node 4.

Package inclusions are factual boundaries. If the product does not include waste-bag rolls, do not inherit competitor included-bag claims or reviews as product selling points.
