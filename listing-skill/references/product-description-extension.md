# Additional Amazon product-description output

Generate this output only after the original eight-node workflow completes and node 8 passes validation. Do not change an original node prompt, input, output, ordering, or validation rule.

## Authoritative inputs

Use only node 2 recommended keywords, node 4 confirmed selling points and boundaries, node 7 normalized product facts, and node 8 final bullets and SEO report. Treat node 4 and node 7 as factual authority. Never turn competitor features, reviews, uncertain answers, or missing information into product claims.

## Writing rules

- Use the language explicitly requested by the user; otherwise use the competitor Listing language.
- When English is selected, write approximately 180–320 words in four or five coherent paragraphs rather than another bullet list.
- Establish supported semantic relationships in this order: product identity and user; attachment or use method; core functional result; material and maintenance; compatibility, appearance, and package boundary.
- Lead with product type and primary use scenario. Connect each feature to a concrete user result.
- Use exact phrases selected by node 2 naturally. Prefer one representative phrase for overlapping search intent and avoid repetitive variants.
- Count a keyword as used only when its complete phrase appears literally. Do not count semantic similarity.
- Use broad or low-priority traffic terms only when natural and accurate.
- Mention verified dimensions, compatibility, included and excluded components, colors, and separately sold matching items only when confirmed.
- Keep the description consistent with the five bullets. Omit uncertain claims and report them instead of silently changing facts.
- Avoid keyword stuffing, competitor wording, unsupported superlatives, unverifiable durability periods, medical or safety implications, and guarantees of Amazon ranking or AI indexing.
- Optimize semantic clarity with explicit product nouns, attributes, functions, users, and scenarios. Never claim guaranteed compliance with a proprietary Amazon algorithm.
- Do not use HTML unless explicitly requested.

## Output format

Output raw JSON only:

```json
{
  "description_strategy": {
    "product_identity": "",
    "target_user_and_scenario": "",
    "semantic_structure": [""],
    "keyword_plan": [""]
  },
  "product_description": "",
  "seo_usage_report": {
    "used_keywords": [""],
    "unused_keywords": [""],
    "unused_reason": {"": ""}
  },
  "quality_check": {
    "supported_facts_only": true,
    "natural_keyword_usage": true,
    "clear_entity_relationships": true,
    "no_keyword_stuffing": true,
    "package_boundary_clear": true,
    "consistent_with_final_bullets": true,
    "notes": ""
  }
}
```
