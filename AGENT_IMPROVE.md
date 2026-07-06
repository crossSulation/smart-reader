# Agent Improvement Plan

## 当前状态

Smart Reader 的 agent 基于 LangChain `create_tool_calling_agent` + `AgentExecutor`，支持：
- 6 个工具：`read`、`search`、`write`、`web_search`、`quiz`、`list_notes`
- 多轮会话 + session 持久化
- SSE 流式输出 token + tool step
- 每轮对话的 agentSteps + insights 可视化
- `read` vs `search` 明确分工（位置读取 vs 语义检索）

---

## 改进项

### 1. System Prompt 增强

**问题：** 当前 agent 拿到 tools 就自由发挥，没有明确的回答规范。模型可能给出无来源的回答，或不确定时编造。

**改进：** 在 `_build_agent_executor` 中添加强约束 system prompt：

```python
SYSTEM_PROMPT = """You are a precise reading assistant powered by a book's content.

Rules:
1. Always cite source page numbers when quoting or referencing book content.
2. Use the "read" tool first to get the user's current page context, then "search" to find related concepts across the book.
3. If the book does NOT contain enough evidence to answer, say so clearly. Never fabricate.
4. When answering, structure your response: (1) direct answer, (2) supporting evidence with page citations, (3) follow-up suggestions if relevant.
5. Keep answers concise unless the user asks for more detail.

Available tools:
- read: read content near a page number or section name
- search: semantic search across the entire book
- write: save a note or highlight
- web_search: look up external references (names, terms, concepts)
- quiz: generate review questions from book content
- list_notes: show the user's existing notes"""
```

**文件：** `backend/app/services/langchain_agent_service.py`

**改动位置：** `ChatPromptTemplate` 构造处（约第 132-136 行），将 system 消息从当前的简单 prompt 替换为上述内容。

**工作量：** 30 分钟

---

### 2. 工具结果缓存

**问题：** 同一多轮会话中，`search("gradient descent")` 可能被重复调用，每次都走 embedding + rerank pipeline，浪费 token 和时间。

**改进：** 在 `_build_agent_executor` 中添加请求级缓存：

```python
_cache: dict[str, Any] = {}

def cached_search(query: str) -> str:
    key = f"search:{query}"
    if key not in _cache:
        _cache[key] = _run_search_tool(book_id, query, payload.top_k, db)
    return _cache[key]
```

同样对 `read` 和 `web_search` 做缓存。

**缓存生命周期：** 每次 `sendMessage` 时清空缓存（新请求 = 新缓存）。

**文件：** `backend/app/services/langchain_agent_service.py`

**改动位置：** `_build_agent_executor` 函数内部，在定义 tool 之前创建 `_cache = {}` dict，在 `search_tool` / `read_tool` / `web_search_tool` 内部使用。

**工作量：** 20 分钟

---

### 3. 历史消息窗口管理

**问题：** 当前加载最近 30 轮作为历史（`_load_chat_history`），但 30 轮 × 多工具调用 + 长文本可能超出模型的上下文窗口。例如 gpt-3.5-turbo 只有 4K/16K context。

**改进：** 使用滑动窗口 + token 估算：

```python
MAX_HISTORY_TOKENS = 6000  # 留足够空间给当前轮的工具调用和响应

def _trim_history(messages: list, max_tokens: int) -> list:
    total = 0
    result = []
    for msg in reversed(messages):
        estimated = len(msg.content) // 4  # rough estimate
        if total + estimated > max_tokens:
            break
        total += estimated
        result.append(msg)
    result.reverse()
    return result
```

或者直接使用 LangChain 内置的 `trim_messages`:

```python
from langchain_core.messages import trim_messages

trimmed = trim_messages(
    history,
    max_tokens=6000,
    token_counter=len,  # 或使用 tiktoken
    strategy="last",
    include_system=True,
)
```

**文件：** `backend/app/services/langchain_agent_service.py`

**改动位置：** `_build_agent_executor` 函数中，`chat_history` 传入 `executor` 之前调用 `_trim_history`。

**工作量：** 15 分钟

---

## 执行计划

| 顺序 | 改进项 | 影响 | 时间 |
|------|--------|------|------|
| 1 | System Prompt 增强 | 回答质量、引用可靠性 | ✅ Done |
| 2 | 工具结果缓存 | 减少重复 LLM 调用、提速 | ✅ Done |
| 3 | 历史消息窗口 | 避免 context overflow | ✅ Done |

**总计：** ~1 小时

---

## 未来可考虑的改进

- **工具并行调用** — LangChain 支持 `tool_choice="auto"` 时模型可返回多个 tool_call，允许 `search` + `read` 同时执行而非串行
- **Re-ranking 工具结果** — 工具返回的 chunks 已在 agent 外做过 rerank，但 agent 内可以再做一次轻量排序
- **用户反馈机制** — 点赞/点踩 agent 回答，用于后续 fine-tune 或 prompt 优化
- **工具权限可视化** — 前端 allowedTools toggle 目前是技术向的，可以改成自然语言描述（"允许搜索全网"、"允许生成测验"）
