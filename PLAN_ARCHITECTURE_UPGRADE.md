# Smart Reader Architecture Upgrade Plan (v2)

> 基于 `ARCHITECTURE.md` 对比当前代码库实际状态，制定分层改造计划。
>
> **进度：** Phase 0 ✅ | Phase 1 ✅ | Phase 2 ✅ | Phase 3 ⚠️ | Phase 4 ⚠️ | Phase 5 ⬜ | Phase 6 ⬜
> **最后更新：** 2026-07-29

## Current Status Snapshot (2026-07-29)

| 维度 | 状态 |
|------|------|
| **核心架构** | Provider 抽象层完成，Router/Scheduler/ConfidenceGate 中间件就位 |
| **本地能力** | Ollama LLM ✅ / Transformers.js Embedding ✅ / FSRS ✅ / TTS ✅ |
| **移动端** | Android (Tauri) 可用，Native PDF Viewer + 底部导航 + 安全区 + 状态栏隐藏 |
| **协作** | 书本分享 + 评论 + 用户搜索下拉 |
| **待补** | ONNX Reranker / OCR / Privacy Guard / 文档防泄漏 / E2E 测试 |

### Phase 3 完成项
- [x] P3-01 Ollama Provider（真实探测 `is_available()`）
- [x] P3-02 本地 Embedding（Transformers.js Worker + IndexedDB chunk cache + localSearch 集成）
- [x] P3-04 FSRS 独立模块（`fsrs_service.py`）
- [x] P3-06 TTS（Web Speech API `useTTS.ts`）

### Phase 3 未完成项
- [ ] P3-03 前端 ONNX Reranker
- [ ] P3-05 Tesseract WASM OCR

### Phase 4 完成项
- [x] 隐私模式路由（`privacy_mode` 参数贯穿 Agent/QA/Summary 端点）
- [x] Provider 层抽象隔离（CloudProvider / LocalProvider / MockProvider）

### Phase 4 未完成项
- [ ] Privacy Guard 中间件
- [ ] 文档防泄漏策略

### Phase 5-6（H2 规划）
| Task | Notes |
|------|-------|
| Hybrid Provider（本地优先 + 云端兜底） | Embed/LLM/Rerank 三路混合路由 |
| CapabilityScanner 前端上报 | `POST /api/capabilities/report` |
| 前端适配（离线指示器、模型下载进度） | Desktop/Web/Mobile 差异检测 |
| E2E 测试 | Provider 单元测试 + 中间件集成测试 |

---

## 一、现状精准分析（2025-07-24 代码库审计）

### 1.1 已实现（符合架构预期）

| 模块 | 文件 | 状态 |
|------|------|------|
| **Reranker** | `backend/app/services/reranker_service.py` | 云端 CrossEncoder 可用，懒加载缓存 |
| **Knowledge Graph** | `knowledge_extraction_service.py`, `knowledge_graph_service.py` | 提取 + 关系推断全链路，支持 mock/cloud/ollama |
| **Embedding** | `backend/app/services/embedding_service.py` | sentence-transformers 本地加载，向量搜索 |
| **Tauri Desktop** | `frontend/src-tauri/` | Tauri v2 + SQLite + 自定义窗口，可用 |
| **File Cache** | `frontend/src/utils/fileCache.ts` | 双路径：Tauri SQLite / IndexedDB LRU |
| **Monorepo 结构** | 整体 | FastAPI + React + Tauri，分层清晰 |
| **i18n** | `frontend/src/i18n/` | en/zh 双语言 |
| **✅ Provider 抽象层** | `backend/app/providers/` | AIProvider 基类 + Cloud/Mock/Local Provider + Registry |
| **✅ ProviderResult** | `backend/app/schemas.py` | 统一 AI 结果数据类 |
| **✅ AI 来源徽章** | `frontend/src/components/BookAgentChat.tsx` | Mock/Local/Cloud 标签 |

### 1.2 部分实现（有基础但不完整）

| 模块 | 现状 | 缺失 |
|------|------|------|
| **~~LLM Service~~** | ✅ 已通过 Provider 抽象层解决 | `providers/cloud_provider.py` 封装现有服务 |
| **Confidence** | `ai.py:331-337` — QA 内联计算 confidence | 无独立 ConfidenceGate；低分不回退到 cloud |
| **Offline Queue** | `init_data.sql:248-259` — 只有表结构 | 无 ORM model、无 service、无 flush 逻辑 |
| **FSRS Review** | `learning` router + `review_items` 表 | 复习逻辑分散，无独立 FSRS 模块 |

### 1.3 完全缺失（架构规划但未实现）

| 模块 | ARCHITECTURE.md 定位 |
|------|---------------------|
| **~~AIProvider Interface~~** | ✅ Phase 1 已完成 |
| **CapabilityScanner** | 启动时探测 desktop/web/local-LLM/GPU/ONNX/IndexedDB |
| **Scheduler** | task-aware 路由矩阵（本地优先 / 隐私强制本地 / 大上下文强制云端） |
| **ConfidenceGate** | 独立的置信度门控 + cloud 升级路径 |
| **OfflineQueue Processor** | 离线任务持久化 + 联网后自动 flush |
| **Local Provider (Ollama 真实)** | 虽然 llm_service 有 ollama 分支，但无本地优先路由 |
| **前端能力上报** | POST /api/capabilities/report |
| **AI 来源徽章** | 回答旁显示 Local / Cloud |
| **隐私模式路由** | Privacy Mode → LOCAL ONLY |
| **Transformers.js / ONNX 前端** | package.json 无相关依赖 |
| **Tesseract WASM OCR** | 未集成 |

---

## 二、Phase 0：即刻可做的提升 ✅ 已完成

### P0-01: 统一 ProviderResult 数据类 ✅
**文件：** `backend/app/schemas.py`
- 新增 `ProviderResult` (content, confidence, provider, model, metadata, fallback_used)

### P0-02: AI 端点统一注入 provider/confidence 字段 ✅
- `QAResponse` / `SummaryResponse` / `AgentResponse` 已有 `provider: str`
- SSE streaming "final" 事件新增 `provider` 字段注入

### P0-03: 前端显示 AI 来源 ✅
**文件：** `frontend/src/components/BookAgentChat.tsx`
- 每条 AI 回复下方显示来源徽章：Mock（灰）/ Local（绿）/ Cloud（蓝）
- `ChatMessage` 和 `AgentStreamEvent` 类型新增 `provider?: string`

---

## 三、Phase 1：Provider 抽象层 ✅ 已完成

- [x] `backend/app/providers/base.py` — AIProvider 抽象基类 + ProviderResult/EmbedResult/RerankResult
- [x] `backend/app/providers/cloud_provider.py` — 封装 llm_service/embedding_service/reranker_service
- [x] `backend/app/providers/mock_provider.py` — 开发/测试用，含确定性 embedding
- [x] `backend/app/providers/local_provider.py` — 桩（is_available→False，Phase 3 接入 Ollama）
- [x] `backend/app/providers/registry.py` — ProviderRegistry 单例 + init_providers()
- [x] `backend/app/providers/__init__.py` — 统一导出
- [x] `backend/app/main.py` — startup 事件中调用 init_providers()
- [x] `backend/app/config.py` — 新增 ENABLE_AI_ROUTER, PROVIDER_PREFER
- [x] `backend/.env` / `.env.dev` — 补全新配置项

在不引入新抽象层的前提下，对现有代码做增量改进：

### P0-01: 统一 ProviderResult 数据类
**文件：** `backend/app/schemas.py`（修改）
- 新增 `ProviderResult` schema（含 `content`, `confidence`, `provider`, `model`），所有 AI 端点返回该格式
- 现在：`ai.py` 的 QA/summary/quiz 端点各自返回不同格式

### P0-02: AI 端点统一注入 provider/confidence 字段
**文件：** `backend/app/routers/ai.py`（修改）
- `question_answer` 已返回 `confidence`，追加 `provider` 和 `model`
- `generate_summary` 追加 `provider`
- `generate_quiz` 追加 `provider`
- Agent 流式响应中注入 `provider` metadata

### P0-03: 前端显示 AI 来源
**文件：** `frontend/src/components/BookAgentChat.tsx`（修改）
- 在每条 AI 回复下显示 `Local` / `Cloud` 小标签
- 样式：Local 绿色、Cloud 蓝色、Mock 灰色

### P0-04: 补全 env 文件
已通过 `.env` + `.env.dev` 完成。

---

## 三、Phase 1：Provider 抽象层（3-5d）

### P1-01: 定义 AIProvider 抽象基类
**文件：** `backend/app/providers/base.py`（新建）

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import AsyncIterator

@dataclass
class ProviderResult:
    content: str
    confidence: float = 1.0        # 0..1
    provider: str = "unknown"      # "mock" | "openai" | "ollama"
    model: str = ""
    metadata: dict = field(default_factory=dict)  # latency_ms, tokens, etc.

@dataclass
class EmbedResult:
    vector: list[float]
    provider: str
    dimension: int
    model: str = ""

@dataclass
class RerankResult:
    scored_docs: list[dict]
    provider: str
    model: str = ""

class AIProvider(ABC):
    provider_name: str = "base"

    @abstractmethod
    async def generate(self, prompt: str, system: str = "", **kwargs) -> ProviderResult:
        ...

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[EmbedResult]:
        ...

    @abstractmethod
    async def rerank(self, query: str, documents: list[dict], top_k: int = 10) -> RerankResult:
        ...

    @abstractmethod
    async def is_available(self) -> bool:
        ...
```

### P1-02: CloudProvider — 封装现有服务
**文件：** `backend/app/providers/cloud_provider.py`（新建）

不改动 `llm_service.py` / `embedding_service.py` / `reranker_service.py`，仅新增适配层：

```python
class CloudProvider(AIProvider):
    provider_name = "cloud"

    def __init__(self, settings):
        self.settings = settings
        self._embedder = None  # lazy load

    async def generate(self, prompt, system="", **kwargs) -> ProviderResult:
        result = complete(prompt, system, self.settings)
        return ProviderResult(
            content=result.text,
            provider=self.settings.LLM_PROVIDER,
            model=result.model,
            metadata={"prompt_tokens": result.prompt_tokens, "completion_tokens": result.completion_tokens},
        )

    async def embed(self, texts):
        from app.services.embedding_service import get_embedder
        if not self._embedder:
            self._embedder = get_embedder()
        return [EmbedResult(vector=v, provider="cloud", dimension=len(v)) for v in self._embedder.embed_texts(texts)]

    async def rerank(self, query, documents, top_k=10):
        from app.services.reranker_service import rerank_candidates
        results = rerank_candidates(query, documents, top_k=top_k)
        return RerankResult(scored_docs=results, provider="cloud")

    async def is_available(self):
        return bool(self.settings.LLM_API_KEY)
```

### P1-03: MockProvider — 开发/测试用
**文件：** `backend/app/providers/mock_provider.py`（新建）

封装 `llm_service.py` 中的 `_mock_complete` 逻辑，包含知识提取 mock（已添加 `_knowledge_extraction_mock`）。

### P1-04: LocalProvider 桩代码
**文件：** `backend/app/providers/local_provider.py`（新建）

Phase 1 仅实现 `is_available()` 返回 `False`（占位），Phase 3 接入 Ollama。

### P1-05: ProviderRegistry
**文件：** `backend/app/providers/registry.py`（新建）

```python
class ProviderRegistry:
    def __init__(self):
        self._providers: dict[str, AIProvider] = {}

    def register(self, name: str, provider: AIProvider):
        self._providers[name] = provider

    def get(self, name: str) -> AIProvider | None:
        return self._providers.get(name)

    def get_available(self, capability: str) -> list[AIProvider]:
        """返回支持该能力且 is_available() 的 provider 列表"""
        ...

    def resolve(self, capability: str, prefer: str = "cloud") -> AIProvider:
        """选择最佳可用 provider：prefer 优先，不可用时 fallback"""
        ...

# 全局单例
_registry: ProviderRegistry | None = None

def get_registry() -> ProviderRegistry:
    global _registry
    if _registry is None:
        _registry = ProviderRegistry()
        # 注册所有 provider
    return _registry
```

### P1-06: FastAPI startup 注册
**文件：** `backend/app/main.py`（修改）

在 `startup` 事件中初始化 ProviderRegistry 并注册 MockProvider / CloudProvider / LocalProvider（桩）。

### P1-07: Provider 配置
**文件：** `backend/app/config.py`（修改）
- 新增：`PROVIDER_PREFER`（默认 `cloud`）、`ENABLE_AI_ROUTER`（默认 `false`）

---

## 四、Phase 2：统一 AI 中间件（5-7d）

### P2-01: CapabilityScanner
**文件：** `backend/app/middleware/capability_scanner.py`（新建）

后端探测：
- Ollama → `GET http://localhost:11434/api/tags`（超时 3s）
- Tauri Desktop → 通过请求头 `X-App-Mode` 判断
- 输出 `RuntimeCapabilities` 数据类并缓存

前端探测（`frontend/src/utils/capabilities.ts`）：
- `navigator.gpu` → WebGPU
- `window.__TAURI__` → Desktop mode
- `navigator.onLine` → 网络状态
- 启动时 POST `/api/capabilities/report` 上报

### P2-02: Scheduler
**文件：** `backend/app/middleware/scheduler.py`（新建）

路由矩阵：

| Task Type | Priority | Fallback | Privacy Mode |
|-----------|----------|----------|-------------|
| `rag_qa` | local | cloud | local only |
| `summary` | local | cloud | local only |
| `complex_agent` | cloud | — | reject |
| `quiz` | cloud | local | local only |
| `knowledge_graph` | cloud | queue | queue |
| `embedding` | local | cloud | local only |
| `rerank` | local | cloud | local only |

### P2-03: ConfidenceGate
**文件：** `backend/app/middleware/confidence_gate.py`（新建）
- 阈值 `CONFIDENCE_THRESHOLD=0.6`
- 低于阈值 + 非隐私模式 → 自动回退到 cloud provider 重试
- 包装 `ProviderResult`，附加 `fallback_used: bool`

### P2-04: OfflineQueue
**文件：** `backend/app/middleware/offline_queue.py`（新建）
- ORM Model: `OfflineQueue`（添加到 `models.py`）
- Alembic migration
- Service: `enqueue(task_type, payload)` / `process_pending()` / `flush_to_cloud()`

### P2-05: AI Router 中间件
**文件：** `backend/app/middleware/ai_router.py`（新建）
- FastAPI 依赖注入：`Depends(get_ai_router)` → 返回 `(provider, capabilities)`
- 全链路：Scanner → Scheduler → Provider → ConfidenceGate
- Feature flag：`ENABLE_AI_ROUTER=true` 启用，否则走旧路径

---

## 五、Phase 3：Local Provider 实现（7-10d）

### P3-01: Ollama Provider
**文件：** `backend/app/providers/local_provider.py`（增强）
- 用 `local_provider.py` 中的 `_ollama_complete` 逻辑，使其成为 LocalProvider 的真实实现
- 支持流式输出 (`stream: true`)
- `is_available()` → 真实探测 Ollama 健康状态

### P3-02: 本地 Embedding（前端 Transformers.js）✅
- 安装 `@xenova/transformers`
- Web Worker: `src/workers/embedding.worker.ts` — 加载 `Xenova/all-MiniLM-L6-v2`
- 服务层: `src/services/localEmbedding.ts` — 桌面/浏览器本地 Worker 优先，移动端走服务端
- chunk 缓存: `src/services/chunkCache.ts` — IndexedDB 存储服务端 chunk embeddings
- 本地搜索: `src/services/localSearch.ts` — query→本地 embed→cosine→分组→结果
- 集成: Library 搜索先走本地（`localSearch`），失败或不可用时降级服务端 API
- 后端: `GET /api/books/chunks/embeddings` 批量下载 + `POST /api/embed` 降级备用

### P3-03: 本地 Reranker（前端 ONNX Runtime Web）
- 安装 `onnxruntime-web`
- 加载轻量 cross-encoder 模型
- 也提供后端本地 reranker 服务

### P3-04: FSRS 独立模块
**文件：** `backend/app/services/fsrs_service.py`（新建）
- 将 `ai.py:416` 附近的 `fsrs_review_schedule` 内联逻辑抽取
- 纯数学计算，零网络依赖

### P3-05: OCR（Tesseract WASM）
- 前端集成 tesseract.js WASM
- 扫描 PDF 图片文字

### P3-06: TTS
- 前端已通过 `useTTS.ts` 使用 Web Speech API

---

## 六、Phase 4-7 概览

| Phase | 内容 | 优先级 | 依赖 |
|-------|------|--------|------|
| **4: 隐私 & 安全** | 隐私模式全链路、Privacy Guard、文档防泄漏 | P1 | Phase 2 |
| **5: Hybrid Provider** | 本地优先+云端兜底、Embed/LLM/Rerank 三路混合 | P2 | Phase 3 |
| **6: 前端适配** | 来源徽章、离线指示器、模型下载进度、Desktop/Web 差异 | P2 | Phase 3-5 |
| **7: 测试** | Provider 单元测试、中间件集成测试、端到端回归 | P1 | 各 Phase |

---

## 七、非破坏性迁移原则

1. **不中断现有功能** — 新 Provider 层封装旧 service，不改动内部实现
2. **Feature Flag 渐进启用** — `ENABLE_AI_ROUTER=false` 默认走旧路径
3. **CloudProvider 是适配器不是重写** — 直接调用现有 `llm_service.complete()` 等
4. **DB migration 增量** — 只新增 `offline_queue` 表，不动现表
5. **Provider 选择透明** — 配置化 `PROVIDER_PREFER`，可随时切回原行为

---

## 八、关键文件变更

### Phase 0 修改
```
backend/app/schemas.py              # 新增 ProviderResult
backend/app/routers/ai.py           # 注入 provider/confidence 字段
frontend/src/components/BookAgentChat.tsx  # AI 来源徽章
```

### Phase 1 新增
```
backend/app/providers/
├── __init__.py
├── base.py           # AIProvider + ProviderResult/EmbedResult/RerankResult
├── registry.py       # ProviderRegistry 单例
├── cloud_provider.py # 封装 llm/embed/reranker service
├── mock_provider.py  # 封装 mock complete
└── local_provider.py # 桩（is_available→False）
```

### Phase 2 新增
```
backend/app/middleware/
├── __init__.py
├── capability_scanner.py
├── scheduler.py
├── confidence_gate.py
├── offline_queue.py
└── ai_router.py

frontend/src/utils/capabilities.ts
```

### Phase 3 已完成 新增
```
frontend/src/workers/embedding.worker.ts   # Transformers.js embedding worker
frontend/src/services/localEmbedding.ts    # 本地/服务端 embedding 路由
frontend/src/services/chunkCache.ts        # IndexedDB chunk 缓存
frontend/src/services/localSearch.ts       # 本地余弦搜索 + 分组
backend/app/routers/ai.py                  # POST /api/embed 降级备用
backend/app/routers/books.py               # GET /api/books/chunks/embeddings
```

### 增量功能 关键文件
```
frontend/src/components/NativePDFViewer.tsx
frontend/src/components/MobileNav.tsx
frontend/src/components/TTSControlBar.tsx
frontend/src/components/BookListRow.tsx
frontend/src/hooks/useTTS.ts
backend/app/services/pdf_render_service.py
backend/app/routers/books.py               # share/comment/users search
backend/app/models.py                      # BookShare + BookComment
```

---

## 九、验收标准

### Phase 0
- [x] 所有 AI 端点返回 `provider` 字段
- [x] 前端聊天界面显示 Local/Cloud/Mock 标签

### Phase 1
- [x] `AIProvider` 接口定义完整
- [x] `CloudProvider` 封装后，现有 API 行为无变化
- [x] `ProviderRegistry` 正确注册所有 provider
- [x] `is_available()` 能正确判断 provider 可用性

### Phase 2
- [x] `CapabilityScanner` 正确探测环境
- [x] `Scheduler` 对每种任务返回正确路由
- [x] `ConfidenceGate` 低分时升级到 cloud
- [x] `OfflineQueue` 持久化 + 恢复流程完整


## 十、增量功能记录（Plan 外新增）

| 功能 | 关键文件 | 状态 |
|------|----------|------|
| **Android 移动端** | `src-tauri/` + Android gen | ✅ |
| **Native PDF Viewer** | `pdf_render_service.py`, `NativePDFViewer.tsx` | ✅ |
| **TTS 朗读** | `useTTS.ts`, `TTSControlBar.tsx` | ✅ |
| **书本分享 + 评论** | `books.py` share/comments, `Library.tsx` | ✅ |
| **移动端底部 TabBar** | `MobileNav.tsx` | ✅ |
| **PDF 阅读主题** | Reader + NativePDFViewer | ✅ |
| **删除确认弹窗** | `Library.tsx` | ✅ |
| **BookCard 分享按钮** | `BookCard.tsx` | ✅ |
| **BookListRow 组件提取** | `BookListRow.tsx` | ✅ |
| **uv 包管理迁移** | `pyproject.toml` + `uv.lock` | ✅ |
| **安全区适配** | `index.html` + CSS + Layout | ✅ |
| **Android 状态栏隐藏** | `MainActivity.kt` | ✅ |
| **知识图谱移动端适配** | `KnowledgeGraph.tsx` | ✅ |
| **Promise/URL polyfill** | `main.tsx` | ✅ |
| **本地 Embedding + 全局搜索** | `localSearch.ts`, `chunkCache.ts`, Worker | ✅ |
| **搜索下拉列表选择用户** | `books.py` users/search, `Library.tsx` | ✅ |

---

## 十一、Immediate Next Steps

1. **补完 Phase 4 安全项** — Privacy Guard 中间件 + 文档防泄漏策略（低复杂度，架构影响大）
2. **AI Agent 搜索不收口本地** — Agent tool calls 保持服务端 embedding，不改动（用户确认）
3. **Review / Knowledge Graph 搜索走本地** — 复用 `localSearch.ts`，减少服务端 embedding 调用
4. **P3-03 ONNX Reranker** — 低优先级，需评估前端模型大小和加载延迟
