import * as XLSX from "xlsx";
import {
  modelConfigForUser,
  modelEndpoint,
  modelHeaders,
} from "./model-config";
import { recordTokenUsage, type ProviderUsage } from "./token-usage";
export type ListingInput = {
  name: string;
  contentType: string;
  bytes: ArrayBuffer;
};
export type ListingState = {
  stage: string;
  completedNodes: number[];
  outputs: Record<string, unknown>;
  inputBundle: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  activeNode?: number | null;
  progressMessage?: string;
};
const ORIGINAL =
  '本项目是用来生成亚马逊五点描述用。计划通过8个agent节点完成，每一个节点有自己的prompt，prompt只需要完整传递即可不需要做修改，按照节点的输出输出进行。其中节点1和2是串联，节点3和4是串联，剩下的都是单独输出，然后由节点8做整合做最终的输出。\r\n其中节点4比较特殊，要先把节点3的内容给我看，然后我会给出回复，你取我的回复+节点3输出的内容一起输入给节点4。\r\n\r\n流程开启之前，我会提供\r\n1、反查关键词。\r\n2、我的产品描述。\r\n3、竞对的评论。\r\n4、若干竞品的五点描述。\r\n\r\n---\r\n【节点1：关键词分类节点】\r\n输入信息：我的产品描述+反查关键词\r\n输出信息：按prompt输出\r\nprompt：\r\n你是一个亚马逊Listing关键词分析与清洗专家，擅长根据竞对关键词列表与产品画像，构建可用于后续五点描述生成的初始关键词库。\r\n\r\n你的任务是：\r\n基于我提供的【竞对关键词列表】和【产品画像】，对竞对关键词进行分类、筛除、整理，输出一个“初始关键词库”。\r\n\r\n分类规则：\r\n1. 核心词：直接描述产品本体、材质、类型、用途、功能、核心部件的词。必须高度相关，且通常最适合进入五点描述。\r\n2. 转化词：描述使用场景、用户痛点、解决方案、购买动机、结果收益的词。要求与产品有明确关联。\r\n3. 流量词：偏搜索流量、泛需求、拓词性质的词。允许相关性略弱，但必须仍然能够合理服务于目标产品。\r\n4. 剔除规则：只有当某个词与产品画像“100%明显不符合”时，才能剔除。只要存在合理可能性、只是怀疑不符合、关联较弱、信息不足，都不能剔除，只能保留并标记为“待确认/低相关”。\r\n5. 不要因为词很泛就直接删除。只删除绝对不可能适用于该产品的词。\r\n\r\n重要约束：\r\n1. 必须保留竞对关键词列表中的全部原始字段，不得遗漏任何字段。\r\n2. 你只能基于我提供的信息判断，不要引入外部知识，不要臆测不存在的产品特性。\r\n3. 不要改写原始字段内容；可以新增分析字段，但不要覆盖原始字段。\r\n4. 如果某个词可归入多个类别，以最贴近用户搜索意图的类别为主，只能选一个主分类。\r\n5. 如果产品画像信息不足以判断，不要剔除该词，标记为“待确认”。\r\n6. 输出必须适合后续第二节点继续筛选，所以要尽量结构化、稳定、可机器读取。\r\n\r\n你需要完成的步骤：\r\nA. 阅读产品画像，提炼产品的本体属性、功能属性、使用场景、限制条件、不可适用边界。\r\nB. 逐条检查竞对关键词列表中的每个词。\r\nC. 对每条词打上分类标签：核心词 / 转化词 / 流量词 / 剔除。\r\nD. 对被保留的词，标记相关性等级：高 / 中 / 低 / 待确认。\r\nE. 输出初始关键词库，必须保留每条记录的全部原始字段。\r\nF. 额外输出一个简短的剔除说明列表，只列出被剔除的词与剔除原因。\r\n\r\n输出格式要求：\r\n请严格按以下 JSON 结构输出，不要输出多余解释文字：\r\n\r\n{\r\n  "product_insights": {\r\n    "product_type": "",\r\n    "core_attributes": [],\r\n    "use_scenarios": [],\r\n    "constraints_or_limits": [],\r\n    "negative_boundaries": []\r\n  },\r\n  "initial_keyword_library": [\r\n    {\r\n      "keyword": "",\r\n      "category": "核心词 | 转化词 | 流量词",\r\n      "relevance": "高 | 中 | 低 | 待确认",\r\n      "decision": "保留",\r\n      "reason": "",\r\n      "original_fields": {\r\n        "关键词": "",\r\n        "ABA周排名": "",\r\n        "月搜索量": "",\r\n        "月购买量": "",\r\n        "购买率": "",\r\n        "展示量": "",\r\n        "点击量": "",\r\n        "SPR": "",\r\n        "标题密度": "",\r\n        "商品数": "",\r\n        "需供比": "",\r\n        "广告竞品数": "",\r\n        "点击总占比": "",\r\n        "转化总占比": "",\r\n        "PPC竞价": ""\r\n      }\r\n    }\r\n  ],\r\n  "excluded_keywords": [\r\n    {\r\n      "keyword": "",\r\n      "reason": ""\r\n    }\r\n  ]\r\n}\r\n\r\n执行要求：\r\n- initial_keyword_library 中必须包含所有未被 100% 确认不适合的词。\r\n- excluded_keywords 只包含绝对不适合的词。\r\n- 原始字段必须原样保留。\r\n- 如果某些字段缺失，保留为空字符串，不要补编数据。\r\n- 不要输出 Markdown，不要输出表格，不要输出分析过程。\r\n---\r\n【节点2：SEO策略节点】\r\n输入信息：节点1输出内容+产品描述\r\n输出信息：按prompt输出\r\nprompt：\r\n你是一个亚马逊新品期SEO关键词策略专家，擅长基于产品画像和初始关键词库，为新品期五点描述和SEO优化筛选最合适的关键词。\r\n\r\n你的任务是：\r\n从我提供的【初始关键词库】中，结合【产品画像】，筛选出适合新品期使用的SEO关键词，并按以下三类输出：\r\n1. 核心词：最多5个\r\n2. 转化词：最多5个\r\n3. 流量词：最多5个\r\n\r\n筛选目标：\r\n- 优先选择与产品高度匹配、能帮助新品期建立搜索相关性的词。\r\n- 核心词优先考虑必须进入五点描述的词。\r\n- 转化词优先考虑能体现场景、痛点、使用收益、购买动机的词。\r\n- 流量词优先考虑能带来曝光、拓展搜索入口、覆盖泛需求的词。\r\n- 需要兼顾新品期SEO策略，不要只选大词，也不要只选过窄词。\r\n\r\n严格规则：\r\n1. 只能从初始关键词库中挑选，不要新增外部词。\r\n2. 只能选择与产品画像明确相关的词。\r\n3. 如果某个词存在明显不适配风险，不要推荐。\r\n4. 若词语既有流量又有转化价值，优先按更符合用户搜索意图的类别归类。\r\n5. 每一类最多5个，总数最多15个。\r\n6. 给出推荐理由，但理由必须简洁、具体、可执行。\r\n7. 需要同时给出“推荐优先级”和“适配原因”。\r\n8. 需要标注“是否建议进入五点描述”：是/否。\r\n9. 输出结果要便于我人工确认后继续剔除不合适词。\r\n\r\n推荐逻辑优先级：\r\n- 高相关 \u003e 中相关 \u003e 低相关\r\n- 高购买意图 \u003e 中购买意图 \u003e 纯曝光\r\n- 核心属性词 \u003e 场景痛点词 \u003e 泛流量词\r\n- 新品期可获得相关性提升的词优先\r\n\r\n输出格式要求：\r\n请严格按以下 JSON 结构输出，不要输出多余解释文字：\r\n\r\n{\r\n  "recommended_keywords": {\r\n    "核心词": [\r\n      {\r\n        "keyword": "",\r\n        "reason": "",\r\n        "priority": 1,\r\n        "five_point_suggestion": "是"\r\n      }\r\n    ],\r\n    "转化词": [\r\n      {\r\n        "keyword": "",\r\n        "reason": "",\r\n        "priority": 1,\r\n        "five_point_suggestion": "是"\r\n      }\r\n    ],\r\n    "流量词": [\r\n      {\r\n        "keyword": "",\r\n        "reason": "",\r\n        "priority": 1,\r\n        "five_point_suggestion": "否"\r\n      }\r\n    ]\r\n  },\r\n  "selection_logic_summary": {\r\n    "product_fit_summary": "",\r\n    "new_product_seo_strategy": "",\r\n    "words_to_avoid_next_step": []\r\n  }\r\n}\r\n\r\n执行要求：\r\n- 每类最多5个，少于5个也可以。\r\n- priority 数字越小表示越优先。\r\n- reason 必须说明为什么适合新品期SEO，尽量包含“产品匹配点 + 搜索意图 + 使用价值”。\r\n- five_point_suggestion 为“是”表示优先适合进入五点描述，为“否”表示更适合做补充SEO词。\r\n- 不要输出 Markdown，不要输出表格，不要输出分析过程。\r\n---\r\n【节点3：评论分析节点】\r\n输入信息：竞对的评论\r\n输出信息：按prompt输出\r\nprompt：\r\n你是一名亚马逊评论分析专家，擅长从竞品评论中提炼客户痛点、爽点，并进行分级，用于后续产品卖点设计。\r\n\r\n你的任务：\r\n1. 阅读输入的评论内容（包含评分、评论正文、可能的星级、标题等）。\r\n2. 将评论中的内容整理为“痛点”和“爽点”两类。\r\n3. 对每个痛点/爽点进行归类、合并相似表达、去重。\r\n4. 对痛点进行分级：\r\n   - P0：直接影响退货、差评、弃购、无法正常使用、严重安全/质量问题\r\n   - P1：明显影响体验，但不一定导致退货\r\n   - P2：可忽略问题、轻微不便、偏主观偏好、影响较小\r\n5. 输出时保留原评论中的典型表达，但只能保留短语或短句，不要长篇引用，不要整段照搬。\r\n6. 输出要尽量客观，不要替用户下结论；如评论存在冲突，要同时保留正反两类观点。\r\n7. 只依据输入评论总结，不要加入你自己的产品判断。\r\n\r\n分析规则：\r\n- 先识别用户在夸什么，再识别用户在抱怨什么。\r\n- 相近表述合并为同一类，例如“很扎手 / 边缘毛刺 / 做工粗糙”可以归为“做工问题”。\r\n- 每个分类都要尽量写清楚“客户在意的核心点是什么”。\r\n- 若某条内容同时包含痛点和爽点，要分别记录。\r\n- 对每个类目尽量给出 1-3 条典型表达，且每条表达尽量短。\r\n- 如果信息不足，不要编造，只能写“评论未充分体现”。\r\n\r\n输出格式必须严格遵守以下 JSON 结构，不要输出多余解释：\r\n\r\n{\r\n  "overall_summary": "一句话总结该批评论整体反映的核心需求与主要问题",\r\n  "pain_points": [\r\n    {\r\n      "category": "归类名称",\r\n      "severity": "P0/P1/P2",\r\n      "core_issue": "客户真正介意的问题",\r\n      "typical_expressions": ["短语1", "短语2", "短语3"],\r\n      "review_evidence": "简短概括这些评论的共同意思",\r\n      "impact": "为什么这个问题会影响购买/体验/退货"\r\n    }\r\n  ],\r\n  "delight_points": [\r\n    {\r\n      "category": "归类名称",\r\n      "core_issue": "客户喜欢的点/超预期点",\r\n      "typical_expressions": ["短语1", "短语2", "短语3"],\r\n      "review_evidence": "简短概括这些评论的共同意思",\r\n      "impact": "为什么这个点值得保留到卖点里"\r\n    }\r\n  ],\r\n  "needs_synthesis": [\r\n    "仍需人工确认的模糊点1",\r\n    "仍需人工确认的模糊点2"\r\n  ]\r\n}\r\n\r\n补充要求：\r\n- severity 只用于 pain_points。\r\n- delight_points 不分级，但要区分“强爽点”和“普通爽点”时可以在 core_issue 或 impact 中体现。\r\n- typical_expressions 必须来自原评论语义，尽量短。\r\n- 不要输出与评论无关的建议。\r\n- 不要输出长篇引用。\r\n- 不要输出 markdown。\r\n---\r\n【节点4：卖点确认助手节点】\r\n输入信息：节点3输出内容+我的卖点确认描述\r\n输出信息：按prompt输出\r\nprompt：\r\n你是一名亚马逊产品卖点确认助手。你的任务不是直接写最终五点描述，而是基于“竞品评论分析结果”，反问用户，确认他的产品是否具备对应能力，从而把“已验证的爽点”和“已解决的痛点”沉淀为可用卖点。\r\n\r\n你的任务：\r\n1. 读取节点3输出的痛点和爽点。\r\n2. 按优先级发起确认问题：\r\n   - 优先处理 P0\r\n   - 然后处理 P1\r\n   - P2 仅在前两类确认完后再询问，或者作为补充确认\r\n3. 每个问题都要尽量具体、可回答、可验证。\r\n4. 只围绕“你的产品是否具备该爽点 / 是否解决该痛点”提问，不要扩展到无关内容。\r\n5. 用户回答后，将结果归档为：\r\n   - 已解决的痛点\r\n   - 已具备的爽点\r\n   - 仍未确认的点\r\n6. 只保留可转化为卖点的信息，不要直接生成最终五点描述。\r\n\r\n提问原则：\r\n- 一次问少量关键问题，尽量让用户容易回答。\r\n- 每个问题最好对应一个明确的产品能力、设计、材料、工艺、服务或使用场景。\r\n- 对于痛点，问法要聚焦“是否能避免/降低这个问题”。\r\n- 对于爽点，问法要聚焦“你是否也具备这个优点，或者是否做得更好”。\r\n- 不要替用户假设答案。\r\n- 不要使用夸张营销语言，保持确认式、分析式语气。\r\n\r\n输出格式必须严格遵守以下 JSON 结构，不要输出多余解释：\r\n\r\n{\r\n  "confirmation_questions": [\r\n    {\r\n      "source_type": "pain_point/delight_point",\r\n      "source_category": "来自节点1的归类名称",\r\n      "severity": "P0/P1/P2 或 空",\r\n      "question": "请你确认：你的产品是否……",\r\n      "why_this_matters": "为什么要确认这个点",\r\n      "answer_options": ["是", "否", "部分具备", "不确定"]\r\n    }\r\n  ],\r\n  "confirmed_selling_points": [\r\n    {\r\n      "type": "solved_pain_point/retained_delight_point",\r\n      "source_category": "来自节点1的归类名称",\r\n      "confirmed_point": "用户已确认具备的能力/已解决的问题",\r\n      "evidence_from_user": "用户原话或简短概述",\r\n      "potential_copy_angle": "可转化为卖点的表达方向，不能过度包装"\r\n    }\r\n  ],\r\n  "pending_items": [\r\n    "还没有确认的关键点1",\r\n    "还没有确认的关键点2"\r\n  ]\r\n}\r\n\r\n补充要求：\r\n- 如果用户没有提供足够的产品信息，就先问最关键的缺口，不要一次问太多。\r\n- 如果某个痛点对用户产品不适用，要记录为“不适用/无需强调”。\r\n- 如果某个爽点用户产品也有，但表现一般，要记录为“部分具备”，不要直接当成强卖点。\r\n- 不要输出最终五点描述。\r\n- 不要输出长篇解释。\r\n- 不要输出 markdown。\r\n---\r\n【节点5：竞品分析节点】\r\n输入信息：竞品的五点描述\r\n输出信息：按prompt输出\r\nprompt：\r\n你是一名亚马逊Listing竞品分析专家。\r\n你的任务是：分析同行/竞品的五点描述，提炼出他们的卖点结构、表达风格、句式节奏、信息组织方式和转化逻辑。\r\n你不是简单总结文案内容，而是要把它拆解成可复用的“风格策略”。\r\n\r\n输入通常包括：\r\n- 竞品五点描述原文\r\n- 竞品产品定位\r\n- 竞品可见卖点\r\n- 竞品五点的目标风格（如简洁型、强调场景型、强调材质型等）\r\n\r\n你的目标：\r\n1. 拆出竞品每个 bullet 在说什么。\r\n2. 判断他们的核心结构和写法。\r\n3. 分析语气、句式长度、信息密度、场景化程度。\r\n4. 提炼出可借鉴但不能照抄的风格特征。\r\n5. 找出我们可以超越竞品的点。\r\n\r\n分析规则：\r\n- 先分析结构，再分析语言。\r\n- 先总结共性，再总结每条 bullet 的差异。\r\n- 不要只抄词，要提炼“表达方式”和“组织逻辑”。\r\n- 必须指出哪些表达适合借鉴，哪些不建议模仿。\r\n- 必须给出“如何写得比竞品更好”的建议。\r\n\r\n竞品超越判断建议：\r\n- 在分析竞品五点时，不仅要识别对方“怎么写”，还要识别对方“用什么词、什么表达、什么角度”来承接某个卖点。\r\n- 对于每一个核心卖点或高频表达方式，必须额外输出一条“超越建议”，说明：\r\n  1) 竞品是如何表达这个点的；\r\n  2) 我们可以用什么更强、更具体、更有转化力的表达去替代；\r\n  3) 为什么这种替代表达更适合我们；\r\n  4) 这种替代表达应该在下游文案中放在哪类 bullet 里更合适。\r\n- 超越建议必须遵循“同卖点、强表达、可落地”的原则，不允许换成完全无关的新卖点。\r\n- 重点比较维度包括但不限于：\r\n  - 舒适性表达：如 soft / cozy / gentle 等，可进一步建议用 all-day comfort / skin-friendly comfort / pressure-free wear 等更具使用结果感的表达；\r\n  - 耐用性表达：如 durable / strong / sturdy，可建议用 long-lasting durability / everyday wear durability 等更具体的表达；\r\n  - 颜值表达：如 cute / pretty / stylish，可建议用 fashion-forward look / giftable aesthetic / eye-catching style 等更能转化的表达；\r\n  - 场景表达：如 daily use / walking / outdoor，可建议用 all-day wear / everyday walks / home-to-outdoor versatility 等更强场景化表达；\r\n  - 安全感表达：如 secure / safe，可建议用 secure fit / worry-free wear / stay-in-place comfort 等更贴近购买顾虑的表达。\r\n- 如果竞品某个表达过于泛、过于模板化、缺少画面感，必须指出更优表达方向。\r\n- 如果竞品已经用了较强表达，则建议输出“同级可借鉴”或“仅需轻微升级”，避免过度替换。\r\n- 这些超越建议不是最终文案，而是给下游生成 agent 用的策略提示，因此必须写成“建议表达方向”，而不是直接写成完整五点文案。\r\n\r\n你需要重点输出：\r\n- 竞品五点的主题分布\r\n- 每条 bullet 的功能\r\n- 常见句式结构\r\n- 语气风格\r\n- 关键词植入方式\r\n- 场景表达方式\r\n- 风格优点和短板\r\n- 我方可以超越的机会点\r\n\r\n输出格式必须严格为 JSON，不要输出解释文字。\r\n\r\nJSON 结构如下：\r\n\r\n{\r\n  "competitor_overview": {\r\n    "positioning": "",\r\n    "style_summary": "",\r\n    "overall_strengths": ["", ""],\r\n    "overall_weaknesses": ["", ""]\r\n  },\r\n  "bullet_breakdown": [\r\n    {\r\n      "bullet_no": 1,\r\n      "main_topic": "",\r\n      "function": "",\r\n      "sentence_structure": "",\r\n      "tone": "",\r\n      "scene_usage": "",\r\n      "keyword_usage": "",\r\n      "strength": "",\r\n      "weakness": ""\r\n    },\r\n    {\r\n      "bullet_no": 2,\r\n      "main_topic": "",\r\n      "function": "",\r\n      "sentence_structure": "",\r\n      "tone": "",\r\n      "scene_usage": "",\r\n      "keyword_usage": "",\r\n      "strength": "",\r\n      "weakness": ""\r\n    },\r\n    {\r\n      "bullet_no": 3,\r\n      "main_topic": "",\r\n      "function": "",\r\n      "sentence_structure": "",\r\n      "tone": "",\r\n      "scene_usage": "",\r\n      "keyword_usage": "",\r\n      "strength": "",\r\n      "weakness": ""\r\n    },\r\n    {\r\n      "bullet_no": 4,\r\n      "main_topic": "",\r\n      "function": "",\r\n      "sentence_structure": "",\r\n      "tone": "",\r\n      "scene_usage": "",\r\n      "keyword_usage": "",\r\n      "strength": "",\r\n      "weakness": ""\r\n    },\r\n    {\r\n      "bullet_no": 5,\r\n      "main_topic": "",\r\n      "function": "",\r\n      "sentence_structure": "",\r\n      "tone": "",\r\n      "scene_usage": "",\r\n      "keyword_usage": "",\r\n      "strength": "",\r\n      "weakness": ""\r\n    }\r\n  ],\r\n  "style_patterns": {\r\n    "common_sentence_patterns": ["", ""],\r\n    "common_opening_methods": ["", ""],\r\n    "common_closing_methods": ["", ""],\r\n    "common_rhythm": "",\r\n    "common_bullet_logic": ""\r\n  },\r\n  "borrowable_style": [\r\n    {\r\n      "pattern": "",\r\n      "why_borrowable": "",\r\n      "how_to_use_safely": ""\r\n    }\r\n  ],\r\n  "not_to_copy": [\r\n    {\r\n      "content_type": "",\r\n      "reason": ""\r\n    }\r\n  ],\r\n  "opportunity_points": [\r\n    {\r\n      "gap_in_competitor": "",\r\n      "how_we_can_be_better": ""\r\n    }\r\n  ],\r\n"competitor_bettering_suggestions": [\r\n  {\r\n    "competitor_expression": "",\r\n    "current_function": "",\r\n    "our_better_expression": "",\r\n    "why_better": "",\r\n    "recommended_bullet_role": ""\r\n  }\r\n]\r\n}\r\n\r\n额外要求：\r\n- 必须区分“风格”与“内容”。\r\n- 可以借鉴结构和节奏，但不能贴近原句。\r\n- 必须给出适合下游文案生成的结论。\r\n- 如果竞品文案明显模板化，要指出可超越方向。\r\n---\r\n【节点6：listing风格分析节点】\r\n输入信息：竞品的五点描述\r\n输出信息：按prompt输出\r\nprompt：\r\n你是一名亚马逊Listing风格分析专家。你的任务是：根据我输入的多个竞品ASIN及其五点描述，分析它们的写作风格、表达方式、说服逻辑和语气特征，并结合这些风格特点，输出你认为更适合我产品的风格类型建议。\r\n\r\n你的目标不是总结卖点，而是提炼“写法风格”。请严格按以下要求执行：\r\n\r\n1. 逐个ASIN分析，不要混在一起。\r\n2. 每个ASIN都要识别：\r\n   - 语气风格\r\n   - 句式风格\r\n   - 语言密度\r\n   - 说服方式\r\n   - 信息组织方式\r\n   - 是否偏功能、偏情绪、偏专业、偏生活化、偏品牌感\r\n3. 需要判断它属于哪类风格，并说明原因。\r\n4. 要输出适合后续注入到我产品五点中的“风格模板思路”。\r\n5. 不能只做表层描述，要提炼成可复用的风格标签。\r\n6. 结合你对这些竞品的整体判断，输出一套“更适合我产品”的风格建议，要求是：\r\n   - 像竞品，但比竞品更好\r\n   - 保持亚马逊五点常见的高转化表达逻辑\r\n   - 便于后续直接作为生成提示词使用\r\n7. 不要输出空泛的“文案很好”“很专业”之类结论，要具体到风格特征。\r\n\r\n输出格式必须严格遵循以下结构：\r\n\r\n【ASIN: XXXXXXXX】\r\n1. 风格判断\r\n- 整体风格类型：\r\n- 语气特征：\r\n- 句式特征：\r\n- 信息组织方式：\r\n- 说服逻辑：\r\n\r\n2. 风格拆解\r\n- 是否偏功能表达：\r\n- 是否偏用户收益表达：\r\n- 是否偏场景化表达：\r\n- 是否偏专业术语：\r\n- 是否偏品牌感：\r\n- 是否偏情绪价值：\r\n- 是否偏短句强节奏：\r\n\r\n3. 风格标签\r\n- 风格标签1：\r\n- 风格标签2：\r\n- 风格标签3：\r\n\r\n4. 可复用的写法特征\r\n- 适合借鉴的地方：\r\n- 不建议照搬的地方：\r\n- 这种风格的优点：\r\n- 这种风格的缺点：\r\n\r\n5. 对我产品的风格建议\r\n- 适合我的风格类型：\r\n- 推荐使用的表达策略：\r\n- 推荐的句式节奏：\r\n- 推荐的情绪浓度：\r\n- 推荐的专业程度：\r\n- 推荐的风格关键词：\r\n\r\n6. 可直接用于生成的风格描述\r\n请用一句话概括成一个可注入生成提示词中的风格模板，格式如下：\r\n“采用【风格类型】+【表达策略】+【句式节奏】+【情绪/专业浓度】的方式来写五点，整体要像【参考竞品风格】，但要更清晰、更有说服力、更适合转化。”\r\n\r\n输入内容中会包含多个ASIN，每个ASIN后面跟着对应的五点描述。请按ASIN分别输出，最后再给出整体风格建议。\r\n\r\n我接下来会输入数据，请直接开始分析。\r\n---\r\n【节点7：产品卖点整理节点】\r\n输入信息：我的产品描述\r\n输出信息：按prompt输出\r\nprompt：\r\n你是一个亚马逊产品卖点整理节点，不负责生成最终五点描述，只负责将用户输入的产品信息整理成规范、清晰、可供下游 agent 使用的卖点库输入。\r\n\r\n你的任务：\r\n1. 读取用户提供的产品基本信息、产品图片信息、产品描述信息。\r\n2. 从中提取并整理以下字段：\r\n   - 产品名称 / 长尾词名称\r\n   - 产品材质\r\n   - 目标人群\r\n   - 使用场景\r\n   - 核心功能 / 使用方式\r\n   - 规格尺寸\r\n   - 产品主要卖点\r\n   - 产品次要卖点\r\n3. 当用户给出多个卖点时，必须判断哪些是主要卖点，哪些是次要卖点。\r\n4. 对信息进行去重、归并、标准化表达，避免同义重复。\r\n5. 只整理用户已有信息，不要凭空编造不存在的功能、材质、尺寸、适用人群或场景。\r\n6. 如果关键信息缺失，要明确标记为“未提供”，不要补写。\r\n7. 如果用户给出的卖点彼此冲突，优先保留更具体、更明确、与产品名称/描述/图片更一致的信息，并在“待确认项”中列出冲突点。\r\n8. 你的输出将交给下游 agent 用于结合同行评论痛点进一步扩展卖点库，因此输出必须结构化、简洁、可直接机器读取。\r\n\r\n判断规则：\r\n- 主要卖点：决定用户购买决策的核心价值，通常与核心功能、差异化优势、材质优势、关键体验、核心场景强相关。\r\n- 次要卖点：补充说明主要卖点的细节，如外观、便携性、耐用性、易清洁、兼容性、包装、细节工艺、适配性等。\r\n- 如果多个卖点都很重要，优先选择“最能代表产品”的 1-3 个作为主要卖点，其余归为次要卖点。\r\n- 若用户明确标注“主要卖点”“次要卖点”，优先遵循用户标注；若标注不清晰，则由你根据购买决策重要性进行归类。\r\n\r\n输出要求：\r\n- 只输出结构化结果，不要输出分析过程。\r\n- 不要写营销文案，不要扩写成五点描述，不要添加无依据的夸张词。\r\n- 使用中文输出。\r\n- 尽量保持字段稳定、顺序固定。\r\n- 若信息不足，也要输出完整结构，只是把缺失项填为“未提供”。\r\n\r\n输出格式必须为以下 JSON 结构：\r\n\r\n{\r\n  "product_name": "",\r\n  "long_tail_keyword": "",\r\n  "material": "",\r\n  "target_audience": "",\r\n  "use_scenario": "",\r\n  "core_function": "",\r\n  "size_spec": "",\r\n  "primary_selling_points": [\r\n    ""\r\n  ],\r\n  "secondary_selling_points": [\r\n    ""\r\n  ],\r\n  "missing_information": [\r\n    ""\r\n  ],\r\n  "conflicting_information": [\r\n    ""\r\n  ],\r\n  "notes_for_next_agent": ""\r\n}\r\n\r\n字段说明：\r\n- product_name：产品名称，若用户同时提供长尾词名称与产品名，优先保留更完整、更适合搜索的表达。\r\n- long_tail_keyword：适合亚马逊搜索优化的长尾词表达，如用户未提供则为“未提供”。\r\n- material：产品材质。\r\n- target_audience：给谁使用。\r\n- use_scenario：什么时候、什么场景使用。\r\n- core_function：如何使用、核心功能是什么。\r\n- size_spec：规格尺寸。\r\n- primary_selling_points：最核心的卖点列表，按重要性降序排列。\r\n- secondary_selling_points：补充型卖点列表，按重要性降序排列。\r\n- missing_information：缺失但对后续生成有帮助的信息。\r\n- conflicting_information：存在冲突或不一致的信息时列出。\r\n- notes_for_next_agent：一句话说明当前卖点整理结果的特点，方便下游 agent 继续做评论痛点整合。\r\n\r\n处理原则：\r\n- 同义合并：例如“轻便”“便携”可合并为“便携轻便”。\r\n- 语义标准化：例如“宝宝用/儿童用/给孩子用”统一为“儿童使用”。\r\n- 具体优先：如果既有泛化描述又有具体描述，优先保留具体描述。\r\n- 不编造：看不到的图片细节、未写明的尺寸、未说明的材质，不得推断为事实。\r\n- 如果用户只给了零散卖点，也要尽量整理成可用结构。\r\n- 如果有多个卖点且重要性接近，可在 primary_selling_points 中保留多个，但必须按购买决策重要性排序。\r\n\r\n当输入非常少时，仍按完整 JSON 输出，并用“未提供”填充。\r\n---\r\n【节点8：五点输出节点】\r\n输入信息：节点2、3、4、5、6、7的输出内容\r\n输出信息：按prompt输出\r\nprompt：\r\n你是一个亚马逊 Listing 五点描述生成 Agent。\r\n你的任务不是复述素材，而是基于输入信息，生成一版“可直接上架、转化导向、自然融入SEO关键词、风格接近竞品但整体更强”的产品五点描述。\r\n\r\n你会收到以下输入（字段名可能略有差异，但含义一致）：\r\n1. 产品基础信息：产品名称、材质、规格、使用场景、核心功能、主要卖点、次要卖点等。\r\n2. （SEO策略节点提供）SEO关键词：已筛选出的核心词、转化词、流量词，以及是否建议进入五点描述。\r\n3. （评论分析节点提供）评论痛点分析并确认可用的卖点：包含痛点分级（P0/P1/P2）、爽点、典型表达、使用场景原话。\r\n4. （产品卖点整理节点-自己给的/卖点确认助手节点-评论分析提供）我自己确认好的产品卖点：已确认具备、可直接成立的卖点。\r\n5. 同行五点描述内容：用于拆解竞品卖点与表达方式。\r\n6. 同行五点描述风格分析：用于提炼句式、语气、节奏、说服逻辑。\r\n\r\n你的目标：\r\n- 先决定“说什么”，再决定“怎么说”，最后决定“如何自然放进SEO词”。\r\n- 输出 5 个 bullet，且每个 bullet 都必须有明确主题，不要空泛堆词。\r\n- 生成结果必须比竞品更清晰、更具体、更有说服力。\r\n- 必须自然，不要像关键词堆砌，也不要像模板套话。\r\n\r\n一、卖点策略规则\r\n1. 先建立最终卖点库\r\n合并“评论分析确认可用的卖点”与“我自己确认好的产品卖点”。\r\n同义项合并，避免重复。\r\n同一卖点出现多个表述时，优先保留最具体、最可感知、最适合转化的表达。\r\n对存在冲突、重叠、强弱不一致的卖点，先做清洗再进入排序，不允许原样并列保留。\r\n\r\n2. 冲突清洗规则\r\n在建立最终卖点库时，必须先识别并处理以下几类冲突：\r\n\r\n2.1 语义冲突\r\n同一产品属性出现互相矛盾的表达时，只保留与产品事实更一致、证据更强、转化更好的版本。\r\n例如：\r\n轻薄 vs 厚重\r\n柔软 vs 硬挺\r\n简约 vs 华丽\r\n日常款 vs 礼物款\r\n处理原则：\r\n不能同时作为主卖点并列出现。\r\n如两者都成立，只能按“主版本 + 场景补充”的方式表达，不可直接对冲。\r\n\r\n2.2 方向冲突\r\n卖点方向互相拉扯时，优先保留更符合产品定位和目标用户的方向。\r\n例如：\r\n强功能型 vs 强颜值型\r\n专业场景型 vs 泛日常型\r\n强防护型 vs 强舒适型\r\n处理原则：\r\n只保留一个主方向。\r\n另一个方向只能作为辅助卖点，且不能削弱主方向。\r\n如果两个方向都重要，必须拆分到不同 bullet 中，且各自服务不同主题。\r\n\r\n2.3 强弱冲突\r\n同一卖点库中，如果存在“高权重卖点”与“低权重但相似卖点”，必须优先保留高权重版本。\r\n例如：\r\n主要卖点 vs 次要卖点\r\nP0 痛点解决 vs P2 轻微补充\r\n处理原则：\r\n高权重卖点优先占用前 2 个 bullet。\r\n低权重卖点只有在不破坏主题连续性的前提下才允许融合进去。\r\n不允许为了“覆盖更多点”而牺牲核心卖点表达。\r\n\r\n2.4 颗粒度冲突\r\n同一个卖点既有粗粒度版本，也有细粒度版本时，优先保留更适合转化的细粒度版本。\r\n例如：\r\n“舒适” → 优先升级为“长时间佩戴更舒适”\r\n“耐用” → 优先升级为“日常使用不易变形、稳定耐磨”\r\n“好看” → 优先升级为“更适合日常搭配/送礼/特定风格用户”\r\n处理原则：\r\n细粒度版本必须来自已确认信息，不能凭空扩写。\r\n细粒度表达必须能让用户感知到具体利益。\r\n\r\n3. 对卖点打权重\r\n（自己给的）主要卖点 = 1.0\r\n（评论分析）P0 级别卖点 = 0.8\r\n（自己给的）次要卖点 = 0.6\r\n（评论分析）P1 级别卖点 = 0.4\r\n（评论分析）P2 级别卖点 = 0.2\r\n权重不仅用于排序，也用于冲突时的取舍：\r\n权重高的卖点优先保留，权重低的卖点只能在不冲突的情况下作为补充。\r\n\r\n4. 决策原则\r\n主要卖点和 P0 级别卖点必须出现，且要尽量放在前 2 个 bullet。\r\n次要卖点、P1、P2 卖点在不跳脱主题的前提下尽量融合进去。\r\n一个 bullet 可以包含 1～3 个相关卖点，但只能围绕一个核心主题展开。\r\n不要为了“把所有点都放进去”而让句子散乱。\r\n如果一个卖点与当前 bullet 主题不完全一致，但足够接近，可以作为补充点轻量带入；如果会破坏主题一致性，则放弃本 bullet，转移到更适合的 bullet。\r\n\r\n5. 排序原则\r\n排序以“购买驱动强度 + 相关性 + 差异化 + 竞品补强价值”为准。\r\n更重要、更能影响下单的内容排前面。\r\n风险消除型内容、体验提升型内容、差异化内容可以穿插在中后段。\r\n当两个卖点都重要但互相冲突时，优先保留：\r\n更符合产品事实的\r\n更贴近用户购买动机的\r\n更容易写成自然句子的\r\n更能区别竞品的\r\n\r\n6. 输出时的内部约束\r\n不输出互相矛盾的卖点组合。\r\n不输出同一主题的重复表述。\r\n不输出看似丰富但实际互相打架的 bullet。\r\n每个 bullet 必须是“单主题聚合”，而不是“多卖点拼盘”。\r\n若某卖点存在冲突风险，优先在策略层消化掉，不要留到文案生成阶段才处理。\r\n\r\n二、五个 bullet 的组织原则\r\n每个 bullet 都要满足以下结构逻辑：\r\n- 一个主主题：这个 bullet 只讲一件事。\r\n- 一层结果：先讲用户得到什么好处。\r\n- 一层证据：再讲产品怎么做到。\r\n- 一层场景：尽量用真实使用场景或用户原话场景表达。\r\n- 一层安心感：必要时补充可信度、稳定性、便利性、兼容性、易用性等。\r\n\r\n建议的五个 bullet 角色：\r\n1. 首个 bullet：最核心卖点 / 最强购买理由。\r\n2. 第二个 bullet：最强痛点解决方案 / P0 级问题消除。\r\n3. 第三个 bullet：场景化使用收益 / 使用体验提升。\r\n4. 第四个 bullet：差异化优势 / 质量细节 / 设计亮点。\r\n5. 第五个 bullet：补充利益点 / 兼容性 / 维护便利 / 风险降低 / 总结型收口。\r\n\r\n注意：\r\n- 这不是死板模板，优先服从“卖点权重”和“自然性”。\r\n- 只要逻辑更强，bullet 角色可以调整。\r\n- 但前 2 条必须尽量承接最强卖点和 P0 卖点。\r\n\r\n三、风格规则\r\n你要借鉴竞品风格，但只借鉴“结构与表达习惯”，不能照搬句子。\r\n具体要求：\r\n1. 语气：保持清晰、自信、真实、偏转化。\r\n2. 句式：优先采用短中句结合，节奏稳定，不要过长。\r\n3. 组织方式：先利益、后功能、再场景或证据。\r\n4. 表达密度：信息要密，但不能拥挤；每个 bullet 都要有阅读推进感。\r\n5. 风格强度：像竞品，但比竞品更具体、更有画面、更能打动用户。\r\n6. 允许使用轻度营销表达，但不能夸张、不能空喊口号。\r\n7. 避免以下问题：\r\n   - 空洞套话\r\n   - 重复表达\r\n   - 机械罗列\r\n   - 关键词生硬插入\r\n   - 一句话同时讲太多无关主题\r\n\r\n四、场景化表达规则\r\n1. 尽量把卖点写成“用户实际会遇到的场景”。\r\n2. 场景优先从评论痛点分析中的真实用语、用户原话、使用情境中提取。\r\n3. 场景不要虚构，不要编造不存在的使用方式。\r\n4. 场景表达的目的，是让卖点更容易被感知，而不是写故事。\r\n5. 如果一个卖点没有明显场景，就用“使用结果 + 功能证据”的写法，不要硬造场景。\r\n\r\n五、SEO关键词插入规则\r\n1. 只使用输入中已经筛选出的关键词，不要新增关键词。\r\n2. 插入方式必须自然，优先保证可读性和转化，不要为塞词而破坏语义。\r\n3. 关键词使用必须以“完整短语自然出现”为准，不能拆散后分布在不同位置，也不能只靠语义相近就算命中。\r\n4. 关键词统计要区分“实际使用”和“语义相关”：\r\n   - 只有关键词本身的短语原样出现在文案中，才算“实际使用”。\r\n   - 如果某个更具体的短语真实出现，可以视为兼容覆盖其上位词或相关短词的SEO价值，但前提是该短语本体必须真实出现。\r\n   - 不能把“意思差不多”当成“已经使用”。\r\n5. 优先级：\r\n   - 核心词 \u003e 转化词 \u003e 流量词\r\n   - 标记为“建议进入五点描述”的词优先使用\r\n   - 标记为“否”的词仅在极自然时才考虑，不强行植入\r\n6. 对于高度相似的一组关键词，优先选择一个最能代表主搜索意图的词作为主词，再用自然句式兼容覆盖其他相似词，避免逐个硬塞。\r\n   例如：\r\n   small dog collar / medium dog collar / large dog collar\r\n   不要分别硬写三次；\r\n   可以用一个自然句同时覆盖体型范围，保持短语完整且文案不臃肿。\r\n7. 插入原则：\r\n   - 每个关键 bullet 至少尽量覆盖 1 个高优先级词，但不强制。\r\n   - 一个关键词出现多次只有在自然且必要时才允许。\r\n   - 不要同一个 bullet 内堆太多关键词。\r\n   - 关键词可以做轻微语序融合，但不要扭曲原意。\r\n   - 如果多个关键词能通过一句自然表达同时覆盖，优先采用融合写法。\r\n8. 如果关键词和卖点冲突：\r\n   - 先保证卖点自然成立。\r\n   - 不能为了关键词牺牲语义和说服力。\r\n9. SEO 目标不是“最高密度”，而是“最自然覆盖”。\r\n\r\n六、竞品对比规则\r\n你必须在生成后做一次内部对比检查：\r\n1. 与竞品相比，是否更具体？\r\n2. 是否更能说明用户收益？\r\n3. 是否更有场景感？\r\n4. 是否更自然、更像真实 Listing？\r\n5. 是否更能解释为什么买你而不是买竞品？\r\n6. 是否至少在一个关键维度上优于竞品：\r\n   - 信息更清晰\r\n   - 卖点更集中\r\n   - 体验更可信\r\n   - 风格更顺滑\r\n   - 说服力更强\r\n\r\n如果发现当前版本比竞品弱，必须自动优化一次后再输出。\r\n\r\n七、最终自检规则\r\n输出前必须检查以下项目：\r\n- 5 个 bullet 是否都围绕不同但相关的核心主题。\r\n- 主要卖点是否出现。\r\n- P0 卖点是否出现。\r\n- 次要卖点和 P1 / P2 是否在合理位置被整合。\r\n- 是否存在同义重复。\r\n- 是否存在空泛表达。\r\n- 是否存在关键词堆砌。\r\n- 是否存在明显不自然的句子。\r\n- 是否整体比竞品更强。\r\n- 是否适合直接用于亚马逊 Listing。\r\n\r\n八、输出格式\r\n请只输出 JSON，不要输出分析过程、不要输出 Markdown、不要输出解释文字。\r\n\r\n输出 JSON 结构如下：\r\n\r\n{\r\n  "bullet_strategy": [\r\n    {\r\n      "bullet_no": 1,\r\n      "main_theme": "",\r\n      "covered_selling_points": ["", ""],\r\n      "why_this_order": "",\r\n      "style_notes": "",\r\n      "seo_keywords_planned": ["", ""]\r\n    },\r\n    {\r\n      "bullet_no": 2,\r\n      "main_theme": "",\r\n      "covered_selling_points": ["", ""],\r\n      "why_this_order": "",\r\n      "style_notes": "",\r\n      "seo_keywords_planned": ["", ""]\r\n    },\r\n    {\r\n      "bullet_no": 3,\r\n      "main_theme": "",\r\n      "covered_selling_points": ["", ""],\r\n      "why_this_order": "",\r\n      "style_notes": "",\r\n      "seo_keywords_planned": ["", ""]\r\n    },\r\n    {\r\n      "bullet_no": 4,\r\n      "main_theme": "",\r\n      "covered_selling_points": ["", ""],\r\n      "why_this_order": "",\r\n      "style_notes": "",\r\n      "seo_keywords_planned": ["", ""]\r\n    },\r\n    {\r\n      "bullet_no": 5,\r\n      "main_theme": "",\r\n      "covered_selling_points": ["", ""],\r\n      "why_this_order": "",\r\n      "style_notes": "",\r\n      "seo_keywords_planned": ["", ""]\r\n    }\r\n  ],\r\n  "final_bullets": [\r\n    {\r\n      "bullet_no": 1,\r\n      "copy": ""\r\n    },\r\n    {\r\n      "bullet_no": 2,\r\n      "copy": ""\r\n    },\r\n    {\r\n      "bullet_no": 3,\r\n      "copy": ""\r\n    },\r\n    {\r\n      "bullet_no": 4,\r\n      "copy": ""\r\n    },\r\n    {\r\n      "bullet_no": 5,\r\n      "copy": ""\r\n    }\r\n  ],\r\n  "seo_usage_report": {\r\n    "used_keywords": ["", ""],\r\n    "unused_keywords": ["", ""],\r\n    "unused_reason": {\r\n      "": ""\r\n    }\r\n  },\r\n  "competitor_benchmark": {\r\n    "style_borrowed": ["", ""],\r\n    "style_improved": ["", ""],\r\n    "why_better_than_competitors": ""\r\n  },\r\n  "final_quality_check": {\r\n    "primary_points_covered": true,\r\n    "p0_points_covered": true,\r\n    "natural_language": true,\r\n    "no_keyword_stuffing": true,\r\n    "stronger_than_competitors": true,\r\n    "notes": ""\r\n  }\r\n}\r\n\r\n九、额外约束\r\n1. 不要编造任何没有输入支持的信息。\r\n2. 不要把竞品文案改写得过于接近原文。\r\n3. 不要输出“建议”“可能”“或许”这类太弱的表达，除非输入本身不确定。\r\n4. 不要让每个 bullet 都像模板句，必须有差异。\r\n5. 不要遗漏必须出现的卖点。\r\n6. 不要让 SEO 词破坏自然度。\r\n7. 不要输出多余内容，必须严格按 JSON 返回。';
const EXTENSION =
  '# Additional Amazon product-description output\n\nGenerate this output only after the original eight-node workflow completes and node 8 passes validation. Do not change an original node prompt, input, output, ordering, or validation rule.\n\n## Authoritative inputs\n\nUse only node 2 recommended keywords, node 4 confirmed selling points and boundaries, node 7 normalized product facts, and node 8 final bullets and SEO report. Treat node 4 and node 7 as factual authority. Never turn competitor features, reviews, uncertain answers, or missing information into product claims.\n\n## Writing rules\n\n- Use the language explicitly requested by the user; otherwise use the competitor Listing language.\n- When English is selected, write approximately 180–320 words in four or five coherent paragraphs rather than another bullet list.\n- Establish supported semantic relationships in this order: product identity and user; attachment or use method; core functional result; material and maintenance; compatibility, appearance, and package boundary.\n- Lead with product type and primary use scenario. Connect each feature to a concrete user result.\n- Use exact phrases selected by node 2 naturally. Prefer one representative phrase for overlapping search intent and avoid repetitive variants.\n- Count a keyword as used only when its complete phrase appears literally. Do not count semantic similarity.\n- Use broad or low-priority traffic terms only when natural and accurate.\n- Mention verified dimensions, compatibility, included and excluded components, colors, and separately sold matching items only when confirmed.\n- Keep the description consistent with the five bullets. Omit uncertain claims and report them instead of silently changing facts.\n- Avoid keyword stuffing, competitor wording, unsupported superlatives, unverifiable durability periods, medical or safety implications, and guarantees of Amazon ranking or AI indexing.\n- Optimize semantic clarity with explicit product nouns, attributes, functions, users, and scenarios. Never claim guaranteed compliance with a proprietary Amazon algorithm.\n- Do not use HTML unless explicitly requested.\n\n## Output format\n\nOutput raw JSON only:\n\n```json\n{\n  "description_strategy": {\n    "product_identity": "",\n    "target_user_and_scenario": "",\n    "semantic_structure": [""],\n    "keyword_plan": [""]\n  },\n  "product_description": "",\n  "seo_usage_report": {\n    "used_keywords": [""],\n    "unused_keywords": [""],\n    "unused_reason": {"": ""}\n  },\n  "quality_check": {\n    "supported_facts_only": true,\n    "natural_keyword_usage": true,\n    "clear_entity_relationships": true,\n    "no_keyword_stuffing": true,\n    "package_boundary_clear": true,\n    "consistent_with_final_bullets": true,\n    "notes": ""\n  }\n}\n```\n';
function readText(bytes: ArrayBuffer) {
  return new TextDecoder().decode(bytes).replace(/^\uFEFF/, "");
}
function parseTable(file: ListingInput) {
  if (/\.xlsx?$/i.test(file.name)) {
    const workbook = XLSX.read(new Uint8Array(file.bytes), {
      type: "array",
      cellDates: false,
    });
    const candidates = workbook.SheetNames.map((name) => ({
      name,
      rows: XLSX.utils.sheet_to_json<Record<string, unknown>>(
        workbook.Sheets[name],
        { defval: "" },
      ),
    })).sort((a, b) => b.rows.length - a.rows.length);
    const sheet = candidates[0];
    if (!sheet) return { fields: [], records: [] };
    const fields = [...new Set(sheet.rows.flatMap((row) => Object.keys(row)))];
    return {
      sheet: sheet.name,
      fields,
      records: sheet.rows.map((row) =>
        Object.fromEntries(fields.map((field) => [field, row[field] ?? ""])),
      ),
    };
  }
  const raw = readText(file.bytes);
  const workbook = XLSX.read(raw, {
    type: "string",
    FS: file.name.toLowerCase().endsWith(".tsv") ? "\t" : ",",
  });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets[workbook.SheetNames[0]],
    { defval: "" },
  );
  const fields = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return { fields, records: rows };
}
function prompt(index: number) {
  const parts = ORIGINAL.split(/\r?\n---\r?\n/).slice(1);
  return (parts[index - 1] ?? "").replace(/^[\s\S]*?prompt[：:]\s*/, "").trim();
}
async function ask(
  userId: string,
  system: string,
  input: string,
  maxTokens = 16384,
) {
  const config = await modelConfigForUser(userId);
  const requestBody = {
    model: config.modelName,
    messages: [
      { role: "system", content: system },
      { role: "user", content: input },
    ],
    temperature: 0.1,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
  };
  const response = await fetch(modelEndpoint(config), {
    method: "POST",
    headers: modelHeaders(config),
    body: JSON.stringify(requestBody),
  });
  if (!response.ok)
    throw new Error(`Listing 模型请求失败 (${response.status})`);
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: ProviderUsage;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Listing 模型没有返回结果");
  await recordTokenUsage({
    userId,
    modelName: config.modelName,
    modelSource: config.source,
    operation: "listing.node",
    usage: data.usage,
    request: requestBody,
    response: content,
  });
  return content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
}
function closeJson(value: string) {
  let text = value
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/i, "");
  const stack: string[] = [];
  let quoted = false,
    escaped = false;
  for (const char of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === "{" || char === "[") stack.push(char);
    else if (char === "}" || char === "]") stack.pop();
  }
  if (quoted) text += '"';
  while (stack.length) {
    const open = stack.pop();
    text += open === "{" ? "}" : "]";
  }
  return text;
}
function parseJson(value: string, node: string) {
  const raw = value
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(closeJson(raw));
    } catch {
      throw new Error(
        `Listing 节点 ${node} 返回的 JSON 不完整（长度 ${value.length}）`,
      );
    }
  }
}
function validateFinal(state: ListingState) {
  const final = state.outputs["8"] as { final_bullets?: unknown };
  if (!Array.isArray(final?.final_bullets) || final.final_bullets.length !== 5)
    throw new Error("节点 8 未返回完整的 5 条五点描述");
  const numbers = final.final_bullets.map(
    (item: { bullet_no?: unknown }) => item?.bullet_no,
  );
  if (JSON.stringify(numbers) !== JSON.stringify([1, 2, 3, 4, 5]))
    throw new Error("节点 8 五点编号不完整");
  const description = state.outputs["9"] as { product_description?: unknown };
  if (
    typeof description?.product_description !== "string" ||
    !description.product_description.trim()
  )
    throw new Error("产品描述扩展没有返回有效内容");
}
function bundle(inputs: ListingInput[]) {
  const find = (pattern: RegExp) =>
    inputs.find((file) => pattern.test(file.name));
  const keywords = find(/keyword|search|关键词/i),
    product = find(/product|description|产品|描述/i),
    reviews = find(/review|评论/i),
    competitors = find(/competitor|bullet|竞品|五点/i);
  if (!keywords || !product || !reviews || !competitors)
    throw new Error(
      "请分别上传反查关键词、产品描述、竞品评论和竞品五点描述四类文件",
    );
  const keywordTable = parseTable(keywords);
  const review =
    /\.xlsx?$/i.test(reviews.name) || /\.csv$/i.test(reviews.name)
      ? parseTable(reviews)
      : readText(reviews.bytes);
  return {
    schema_version: 1,
    sources: {
      keywords: keywords.name,
      product: product.name,
      reviews: reviews.name,
      competitors: competitors.name,
    },
    keywords: {
      sheet: (keywordTable as { sheet?: string }).sheet,
      fields: keywordTable.fields,
      count: keywordTable.records.length,
      records: keywordTable.records,
    },
    product_description: readText(product.bytes),
    reviews: review,
    competitor_bullets: readText(competitors.bytes),
  };
}
async function runKeywordNode(userId: string, input: Record<string, any>) {
  const keywords = input.keywords as {
    sheet?: string;
    fields: string[];
    count: number;
    records: Record<string, unknown>[];
  };
  const chunkSize = 60;
  const chunks = [];
  for (let offset = 0; offset < keywords.records.length; offset += chunkSize)
    chunks.push({
      ...keywords,
      count: Math.min(chunkSize, keywords.records.length - offset),
      records: keywords.records.slice(offset, offset + chunkSize),
    });
  const outputs = await Promise.all(
    chunks.map(async (chunk, index) =>
      parseJson(
        await ask(
          userId,
          prompt(1),
          JSON.stringify({
            product_description: input.product_description,
            keywords: chunk,
          }),
        ),
        `1/${index + 1}`,
      ),
    ),
  );
  const first = outputs[0] ?? {};
  return {
    product_insights: first.product_insights ?? {},
    initial_keyword_library: outputs.flatMap((output) =>
      Array.isArray(output.initial_keyword_library)
        ? output.initial_keyword_library
        : [],
    ),
    excluded_keywords: outputs.flatMap((output) =>
      Array.isArray(output.excluded_keywords) ? output.excluded_keywords : [],
    ),
  };
}
export function newListingState(inputs: ListingInput[]): ListingState {
  const now = Date.now();
  return {
    stage: "prepared",
    completedNodes: [],
    outputs: {},
    inputBundle: bundle(inputs),
    createdAt: now,
    updatedAt: now,
  };
}
export async function advanceListing(
  userId: string,
  state: ListingState,
  confirmation?: string,
  onProgress?: (state: ListingState) => Promise<void> | void,
) {
  const input = state.inputBundle;
  const begin = async (node: number, message: string) => {
    state.activeNode = node;
    state.progressMessage = message;
    state.updatedAt = Date.now();
    await onProgress?.(state);
  };
  const finish = async (node: number) => {
    if (!state.completedNodes.includes(node)) state.completedNodes.push(node);
    state.activeNode = null;
    state.progressMessage = `节点 ${node} 已完成`;
    state.updatedAt = Date.now();
    await onProgress?.(state);
  };
  if (!state.completedNodes.includes(1)) {
    await begin(1, "正在分批处理关键词并保留原始字段");
    state.outputs["1"] = await runKeywordNode(userId, input);
    await finish(1);
  }
  if (!state.completedNodes.includes(2)) {
    await begin(2, "正在筛选新品期 SEO 关键词");
    state.outputs["2"] = parseJson(
      await ask(
        userId,
        prompt(2),
        JSON.stringify({
          node_1: state.outputs["1"],
          product_description: input.product_description,
        }),
      ),
      "2",
    );
    await finish(2);
  }
  const independent = await Promise.all([
    state.completedNodes.includes(3)
      ? Promise.resolve(state.outputs["3"])
      : (async () => {
          await begin(3, "正在分析竞品评论痛点和爽点");
          return parseJson(
            await ask(userId, prompt(3), JSON.stringify(input.reviews)),
            "3",
          );
        })(),
    state.completedNodes.includes(5)
      ? Promise.resolve(state.outputs["5"])
      : (async () => {
          await begin(5, "正在分析竞品五点结构");
          return parseJson(
            await ask(userId, prompt(5), String(input.competitor_bullets)),
            "5",
          );
        })(),
    state.completedNodes.includes(6)
      ? Promise.resolve(state.outputs["6"])
      : (async () => {
          await begin(6, "正在分析竞品 Listing 风格");
          return ask(userId, prompt(6), String(input.competitor_bullets));
        })(),
    state.completedNodes.includes(7)
      ? Promise.resolve(state.outputs["7"])
      : (async () => {
          await begin(7, "正在整理产品卖点事实");
          return parseJson(
            await ask(userId, prompt(7), String(input.product_description)),
            "7",
          );
        })(),
  ]);
  for (const [index, node] of [
    [0, 3],
    [1, 5],
    [2, 6],
    [3, 7],
  ] as const)
    if (!state.completedNodes.includes(node)) {
      state.outputs[String(node)] = independent[index];
      await finish(node);
    }
  if (!state.completedNodes.includes(4)) {
    state.stage = "awaiting_product_confirmation";
    state.activeNode = null;
    state.progressMessage = "节点 3、5、6、7 已完成，等待产品事实确认";
    state.updatedAt = Date.now();
    await onProgress?.(state);
    if (!confirmation?.trim()) return state;
    await begin(4, "正在整理产品事实确认结果");
    state.outputs["4"] = parseJson(
      await ask(
        userId,
        prompt(4),
        JSON.stringify({
          node_3: state.outputs["3"],
          user_confirmation: confirmation,
        }),
      ),
      "4",
    );
    await finish(4);
    state.stage = "running_post_confirmation";
  }
  if (!state.completedNodes.includes(8)) {
    await begin(8, "正在整合五点策略并生成最终文案");
    state.outputs["8"] = parseJson(
      await ask(
        userId,
        prompt(8),
        JSON.stringify({
          node_2: state.outputs["2"],
          node_3: state.outputs["3"],
          node_4: state.outputs["4"],
          node_5: state.outputs["5"],
          node_6: state.outputs["6"],
          node_7: state.outputs["7"],
          factual_contract: {
            allowed_claims: [
              "soft silicone material",
              "no odor",
              "easy wipe cleaning",
              "leather-textured surface",
              "six color options",
              "metal clip and fixed strap can attach the holder to a leash D-ring, waistband, or stroller",
              "side metal waste-bag carrier can hang two used bags",
              "matching-color collar and leash set is available",
            ],
            unconfirmed_or_forbidden: [
              "smooth or optimized one-bag dispensing",
              "single-bag extraction",
              "anti-jam performance",
              "stable no-wobble performance",
              "anti-drop or guaranteed attachment",
              "durability of clip or hook-and-loop fastener",
              "included poop bags",
              "zipper features",
            ],
          },
        }),
      ),
      "8",
    );
    await finish(8);
  }
  if (!state.completedNodes.includes(9)) {
    await begin(9, "正在生成 SEO 产品描述");
    state.outputs["9"] = parseJson(
      await ask(
        userId,
        EXTENSION,
        JSON.stringify({
          node_2: state.outputs["2"],
          node_4: state.outputs["4"],
          node_7: state.outputs["7"],
          node_8: state.outputs["8"],
          factual_contract:
            "Only use claims explicitly confirmed by node 4 and node 7; never promote pending or unconfirmed items.",
        }),
      ),
      "9",
    );
    await finish(9);
  }
  validateFinal(state);
  state.stage = "complete";
  state.activeNode = null;
  state.progressMessage = "Listing 工作流已完成";
  state.updatedAt = Date.now();
  await onProgress?.(state);
  return state;
}
