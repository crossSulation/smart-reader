# Agent Improvement Plan

## 当前状态

Smart Reader 的 agent 基于 LangChain `create_tool_calling_agent` + `AgentExecutor`，支持：
- **8 个工具**：`read`、`search`、`write`、`web_search`、`quiz`、`flashcards`、`summary`、`list_notes`
- 多轮会话 + session 持久化
- SSE 流式输出 token + tool step
- 每轮对话的 agentSteps（证据型）在 insight 卡片中可视化，产出型（summary / quiz / flashcards / notes）合入对话流
- `read` vs `search` 明确分工（位置读取 vs 语义检索）
- System prompt 强约束（引用页码、不确定声明、四段式回答结构）
- 工具请求级缓存、历史消息 token 窗口裁剪
- 弱项追踪 + agent 自适应（weak topics 注入 system prompt）

---

## 已完成的改进

| # | 改进项 | 影响 | 状态 |
|---|--------|------|------|
| 1 | System Prompt 增强 | 回答质量、引用可靠性 | ✅ Done |
| 2 | 工具结果缓存 | 减少重复调用、提速 | ✅ Done |
| 3 | 历史消息窗口裁剪 | 避免 context overflow | ✅ Done |
| 4 | 产出型工具合入对话流 | summary/quiz/flashcards/notes 直接显示 | ✅ Done |
| 5 | 弱项追踪 + agent 自适应 | 复习中反复忘记的概念自动强化 | ✅ Done |
| 6 | 知识提取 + 关系推断批量化 | 30 chunks → 3 次调用、50 pairs → 2 次调用 | ✅ Done |

---

## 未来可考虑的改进

### Tier 1 — 短期高价值（1-3 天）

#### T1-01: 工具并行调用

**现状：** agent 串行执行工具——先 `read(page 42)` 等结果 → 再 `search("neural network")`。两轮工具调用，用户等两次。

**改进：** LangChain 的 `tool_choice="auto"` 允许模型返回多个 tool_call，`AgentExecutor` 并行执行：
```
User: "Explain gradient descent"
→ Agent decides: read(page 42) AND search("gradient descent") ← 同时发出
→ 两个结果并行返回 → LLM 综合生成答案
```

**文件：** `backend/app/services/langchain_agent_service.py`

**风险：** 需要处理并行失败（一个成功一个失败时的回退）。

---

#### T1-02: 上下文感知的 Tool Selection

**现状：** 当前 `current_page` 只传给 `read` 工具。但 search 不知道用户在哪一页——搜索"gradient descent"时不会优先当前页附近的内容。

**改进：** 给 `search` 工具也加入 `current_page` 参数，search 结果按 `(语义分数 * 0.7) + (页码 proximity * 0.3)` 重排，user 在 42 页时 40-44 页的 chunk 权重提升。

**文件：** `backend/app/services/langchain_agent_service.py`（`_run_search_tool`）

---

#### T1-03: 用户反馈机制

**现状：** 没有对 agent 回答的反馈。用户对错误答案只能再说一遍。

**改进：** 每条 assistant 消息加 👍/👎 按钮。点踩弹窗问原因（"不准确 / 没引用来源 / 太笼统"）。反馈数据记录到 `ai_interactions` 表新增 `feedback` 字段，用于后续统计和 prompt 微调。

**文件：** `frontend/src/components/BookAgentChat.tsx`、`backend/app/models.py`、`backend/app/routers/ai.py`

---

### Tier 2 — 中期（1-2 周）

#### T2-01: Re-ranking 工具结果

**现状：** `search` 和 `read` 返回的 chunks 在 agent 外已做过 rerank（cross-encoder），但 agent 内部的工具结果没有二次排序。

**改进：** 在 agent 获取 `search` + `read` 的合并结果后，调用轻量 re-ranker（ONNX 本地模型或 LLM 内联排序），确保最相关的 chunks 排在前面传给 LLM。

---

#### T2-02: 工具权限可视化

**现状：** 前端 `allowedTools` toggle 是技术向词汇（read / write / web_search），普通用户不理解。

**改进：** 把 toggle 改为自然语言 checkbox 组：
- □ 搜索本书内容（read + search）
- □ 查外部资料（web_search）
- □ 生成测验（quiz）
- □ 生成记忆卡（flashcards）
- □ 生成摘要（summary）
- □ 保存笔记（write）

后端映射回 `allowed_tools` 数组。

**文件：** `frontend/src/components/BookAgentChat.tsx`

---

#### T2-03: 章节感知阅读

**现状：** `read` 工具接受页码或节名，但 agent 不知道用户当前所在的**章节结构**（有哪些章节、它们的边界在哪里）。

**改进：** 在 agent system prompt 中注入当前书的 TOC（目录）、章节-页码范围映射。agent 回答时可以说"详见 Chapter 3（p.42-58）"而不是"详见 Page 42"。

**文件：** `backend/app/routers/books.py`（TOC 端点已存在）、`langchain_agent_service.py`

---

### Tier 3 — 长期（1 月+）

#### T3-01: FSRS 真算法替换 SM-2

**现状：** 当前是改进版 SM-2（post-lapse + fuzz）。真正的 FSRS 需要用户评分历史数据来拟合参数。

**改进：** 积累足够评分后（~1000 次），用 `fsrs-optimizer` Python 库训练个人记忆曲线参数，替换固定 SM-2 公式。训练结果写入 `user` 表的 `fsrs_params` 字段。

**文件：** `backend/app/routers/learning.py`、`backend/app/services/fsrs_service.py`（新建）

---

#### T3-02: Agent 记忆库

**现状：** agent 无长期记忆。跨 session 重新开始，不记得用户之前问过什么、学过什么。

**改进：** 每个 book 维护一个 **agent 记忆摘要**——每次 session 结束时用 LLM 生成 2-3 句摘要，存储为 `agent_memory`。新 session 启动时注入 system prompt：`"Previously, the user explored: {summaries}"`。

**文件：** `backend/app/models.py`（新增 `AgentMemory` 表）、`langchain_agent_service.py`

---

#### T3-03: Multi-Document Cross-Reference

**现状：** `search` 只在当前书里搜索。面向同一用户的所有书应该是一个统一的 knowledge base。

**改进：** `search` 扩展为跨书搜索。agent 可以回答："这个概念在 Book A 的第 42 页讨论过，同时 Book B 的第 15-18 章也从不同角度覆盖。" 前端 insight 卡片显示书名 + 页码，点击可跨书跳转。

---

## 优先级总览

```
T1-01 并行调用      ██████████ 高  ← 体验提升最明显
T1-02 上下文感知搜索  ██████████ 高
T1-03 用户反馈       ████████░░ 中
T2-01 Re-ranking     ██████░░░░ 中
T2-02 工具权限可视化  ██████░░░░ 中
T2-03 章节感知       ████░░░░░░ 低
T3-01 FSRS 真算法    ████████░░ 中 ← 需要数据积累
T3-02 Agent 记忆库   ██████░░░░ 中
T3-03 跨书搜索       ████░░░░░░ 低
```
