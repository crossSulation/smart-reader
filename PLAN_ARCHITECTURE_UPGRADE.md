# Smart Reader Architecture Upgrade Plan

> 基于 `ARCHITECTURE.md` 对比当前实现，制定分层改造计划，将现有单体服务逐步演进为 AI Provider 抽象架构。

---

## 一、现状 vs 目标差距分析

### 1.1 当前架构（实际）

```
frontend/                          backend/
├── components/                    ├── main.py (FastAPI monolith)
│   ├── AIPanel.tsx               ├── routers/ (按领域拆分)
│   ├── BookAgentChat.tsx         │   ├── ai.py
│   ├── PDFViewer.tsx             │   ├── books.py
│   └── ...                        │   ├── knowledge.py
├── pages/                         │   └── ...
│   ├── Reader.tsx                ├── services/ (功能服务，无抽象层)
│   ├── Library.tsx               │   ├── llm_service.py
│   └── ...                        │   ├── embedding_service.py
├── hooks/                         │   ├── retrieval_service.py
└── utils/                         │   ├── reranker_service.py
                                   │   ├── langchain_agent_service.py
                                   │   ├── knowledge_extraction_service.py
                                   │   └── ...
                                   └── schemas.py / models.py / database.py
```

**特征：**
- 后端为 FastAPI 单体，服务按功能而非按能力分层
- 无 AIProvider 抽象层，各服务直接调用具体实现
- 无 CapabilityScanner、Scheduler、ConfidenceGate、OfflineQueue
- 无隐私模式路由机制（ARCHITECTURE.md 中描述的 Privacy Mode → LOCAL ONLY 未实现）
- 无 Local Provider（Ollama/Transformers.js/ONNX）集成
- 前端直接调用后端 API，无 provider 来源感知

### 1.2 目标架构（ARCHITECTURE.md）

```
┌─ UI ─────────────────────────────────────────────────────────────────────┐
│  Reader / AI Panel / Settings (privacy mode toggle)                      │
└──────┬───────────────────────┬──────────────────────┬────────────────────┘
       │                       │                      │
       ▼                       ▼                      ▼
┌─ Unified AI Middleware ───────────────────────────────────────────────────┐
│  CapabilityScanner │ Scheduler (task-aware) │ ConfidenceGate │ OfflineQueue│
└──────┬──────────────────────┬──────────────────┬─────────────────┬────────┘
       │                      │                  │                 │
       ▼                      ▼                  ▼                 ▼
┌─ AI Backend Abstraction ──────────────────────────────────────────────────┐
│  interface AIProvider { generate() | embed() | rerank() | isAvailable() } │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                    │
│  │Local Provider│  │Cloud Provider│  │Hybrid Provider│                    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                    │
└─────────┼──────────────────┼──────────────────┼──────────────────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─ Local Runtime ──┐  ┌─────────────────────────────────────────────────────┐
│ Ollama/Llama     │  │  Cloud API: Embedding / LLM / Reranker / KG Builder │
│ Transformers.js  │  └─────────────────────────────────────────────────────┘
│ FSRS Scheduler   │
│ Tesseract WASM   │
│ Web Speech API   │
│ ONNX Runtime Web │
│ SQLite/IndexedDB │
└──────────────────┘
```

---

## 二、改造阶段划分

### Phase 1: Provider 抽象层 (Backend Foundation)

**目标：** 建立 AIProvider 接口和 Provider 注册机制，不改变现有 API 行为。

#### P1-01: 定义 AIProvider 抽象基类
- **文件：** `backend/app/providers/base.py` (新建)
- **内容：**
  ```python
  from abc import ABC, abstractmethod
  from typing import AsyncIterator, Optional
  from dataclasses import dataclass

  @dataclass
  class ProviderResult:
      content: str
      confidence: float       # 0..1
      provider: str           # "local" | "cloud"
      metadata: dict          # model name, latency, tokens used

  @dataclass
  class EmbedResult:
      vector: list[float]
      provider: str
      dimension: int

  @dataclass
  class RerankResult:
      scored_docs: list[dict]  # [{id, text, score}, ...]
      provider: str

  class AIProvider(ABC):
      """统一 AI 能力接口"""
      provider_type: str = "base"

      @abstractmethod
      async def generate(self, prompt: str, context: dict = None) -> AsyncIterator[ProviderResult]:
          """流式生成文本"""
          ...

      @abstractmethod
      async def embed(self, text: str | list[str]) -> list[EmbedResult]:
          """文本向量化"""
          ...

      @abstractmethod
      async def rerank(self, query: str, documents: list[dict]) -> RerankResult:
          """重排序文档"""
          ...

      @abstractmethod
      async def is_available(self) -> bool:
          """探测该 provider 是否可用"""
          ...
  ```

#### P1-02: 实现 ProviderRegistry（服务发现 + 选择）
- **文件：** `backend/app/providers/registry.py` (新建)
- **职责：**
  - 注册所有可用的 Provider 实现
  - 按 capability（generate/embed/rerank）返回可用 provider 列表
  - 提供 `resolve(capability, prefer="local")` 选择方法

#### P1-03: 实现 CloudProvider（封装现有云 API）
- **文件：** `backend/app/providers/cloud_provider.py` (新建)
- **职责：**
  - 将现有 `llm_service.py`、`embedding_service.py`、`reranker_service.py` 的云 API 调用封装为 `AIProvider` 实现
  - `is_available()` → 检查 API key 是否配置、网络连通性
  - **不改动原有 service，仅新增适配层**

#### P1-04: 实现 LocalProvider 桩代码
- **文件：** `backend/app/providers/local_provider.py` (新建)
- **内容：**
  - 实现 `AIProvider` 接口
  - Phase 1 中 `is_available()` 始终返回 `False`（桩）
  - Phase 3 接入真实本地运行时替换

#### P1-05: Provider 配置化
- **文件：** `backend/app/providers/config.py` (新建)
- **职责：**
  - 环境变量：`LOCAL_LLM_URL`、`LOCAL_EMBED_MODEL`、`OLLAMA_HOST` 等
  - Provider 优先级策略配置

---

### Phase 2: 统一 AI 中间件

**目标：** 实现 CapabilityScanner、Scheduler、ConfidenceGate、OfflineQueue，连接 Provider 层。

#### P2-01: CapabilityScanner（启动时能力探测）
- **文件：** `backend/app/middleware/capability_scanner.py` (新建)
- **职责：**
  - 检测运行环境：Desktop (Tauri) vs Browser vs Pure Web
  - 探测：Ollama 可用性 (`GET localhost:11434/api/tags`)
  - 探测：本地模型状态（Transformers.js / ONNX）
  - 探测：WebGPU 可用性标志
  - 输出 `RuntimeCapabilities` 数据类
- **集成：** 在 FastAPI `startup` 事件中触发扫描，结果缓存供 Scheduler 使用

#### P2-02: Scheduler（任务感知路由）
- **文件：** `backend/app/middleware/scheduler.py` (新建)
- **职责：**
  - 实现 `classify(task: TaskRequest) → RouteDecision` 方法
  - 路由矩阵（来自 ARCHITECTURE.md）：

    | Capability               | Priority       | Fallback    | Offline OK |
    |--------------------------|----------------|-------------|------------|
    | Embedding / Retrieval    | Local          | Cloud       | Yes        |
    | Text Search (keyword)    | Local (SQLite) | —           | Yes        |
    | Simple QA / Explain      | Local (Ollama) | Cloud LLM   | Yes        |
    | Complex Agent Reasoning  | Cloud LLM      | —           | No         |
    | Summary Generation       | Local          | Cloud LLM   | Partial    |
    | Reranking                | Local (ONNX)   | Cloud       | Yes        |
    | Quiz Generation          | Cloud LLM      | Local LLM   | Partial    |
    | Knowledge Graph Building | Cloud LLM      | Queue       | No         |
    | Spaced Repetition (FSRS) | Local          | —           | Yes        |
    | OCR                      | Local          | —           | Yes        |
    | TTS                      | Local          | —           | Yes        |

  - 隐私模式强制 `→ LOCAL ONLY`
  - 大上下文任务强制 `→ CLOUD`

#### P2-03: ConfidenceGate（置信度门控）
- **文件：** `backend/app/middleware/confidence_gate.py` (新建)
- **职责：**
  - 包装本地 Provider 的结果，附加 `confidence` 评分
  - 当 `confidence < 0.6` 且非隐私模式 → 透明升级到 Cloud Provider
  - 保证用户永远看不到低质量本地结果
- **阈值配置化**：环境变量 `CONFIDENCE_THRESHOLD`（默认 0.6）

#### P2-04: OfflineQueue（离线任务队列）
- **文件：** `backend/app/middleware/offline_queue.py` (新建)
- **职责：**
  - 当 Cloud Provider 不可用时，将任务（Knowledge Graph 构建等）持久化到队列
  - 存储表 `offline_queue(id, task_type, payload_json, created_at, status, attempts)`
  - `navigator.onLine` 恢复时自动 flush（WebSocket / 轮询）
  - 顺序处理，完成后通知前端
- **新增 DB 表：**
  ```sql
  CREATE TABLE offline_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      task_type TEXT NOT NULL,      -- "knowledge_graph" | "quiz_generation"
      payload_json TEXT NOT NULL,
      status TEXT DEFAULT 'pending', -- pending | processing | done | failed
      attempts INTEGER DEFAULT 0,
      result_json TEXT,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  ```

#### P2-05: AI 路由中间件（FastAPI Integration）
- **文件：** `backend/app/middleware/ai_router.py` (新建)
- **职责：**
  - FastAPI 依赖注入：`Depends(get_ai_provider)` 根据请求自动选择 provider
  - 读取请求中的 `privacy_mode: bool` 标志
  - 组合 Scanner → Scheduler → Provider → ConfidenceGate 全链路

---

### Phase 3: Local Provider 真实实现

**目标：** 接入本地运行时（Ollama、Transformers.js、ONNX），使离线可用。

#### P3-01: Ollama LLM Provider（桌面端）
- **文件：** `backend/app/providers/local_provider.py` (增强)
- **实现：**
  - 通过 Ollama REST API (`localhost:11434`) 调用本地大模型
  - 支持流式输出 (`/api/generate` with `stream: true`)
  - 模型列表缓存、health check

#### P3-02: 本地 Embedding Provider（Transformers.js）
- **实现：**
  - 前端：加载 Transformers.js (`Xenova/all-MiniLM-L6-v2`) 在 Web Worker 中运行
  - 后端：通过本地 embedding 服务端口（如 `localhost:8005`）调用
  - 模型首次下载后缓存（详细缓存策略待定）

#### P3-03: 本地 Reranker Provider（ONNX Runtime Web）
- **实现：**
  - 前端：加载 ONNX 轻量 cross-encoder 模型在 Web Worker 中
  - 后端：提供本地 reranker 服务

#### P3-04: FSRS 调度器（纯数学，无网络依赖）
- **文件：** `backend/app/services/fsrs_service.py` (新建，或扩展现有 review 逻辑)
- **实现：** 将现有的复习调度逻辑抽取为独立的 FSRS 算法模块
- **状态：** 复习功能已存在（`review_items` 表），需确保纯本地计算

#### P3-05: OCR（Tesseract WASM）
- **实现位置：** 前端/桌面端
- **集成方式：** 桌面端通过 Tauri sidecar 调用 Tesseract；浏览器端加载 WASM

#### P3-06: TTS（Web Speech API）
- **实现位置：** 前端
- **集成：** 使用浏览器原生 `SpeechSynthesis` API，在 AI 面板添加"朗读"按钮

---

### Phase 4: 隐私模式 & 安全加固

**目标：** 实现 ARCHITECTURE.md 中的隐私保护路线。

#### P4-01: 隐私模式全链路强制
- **前端：** Settings 页面的 Privacy Mode toggle 已存在，需确认：
  - 开关状态通过 `localStorage` 或后端 User profile 持久化
  - 所有 AI 请求 Header 携带 `X-Privacy-Mode: true`
- **后端：**
  - Scheduler 读取 `privacy_mode` → 强制路由到 Local Provider
  - Cloud Provider 在隐私模式下拒绝调用，返回错误
  - **Never send document text to cloud in privacy mode**（黄金规则）

#### P4-02: 文档文本防泄漏检查
- **文件：** `backend/app/middleware/privacy_guard.py` (新建)
- **职责：**
  - 拦截所有外发请求 payload，确保不含原始文档文本
  - 日志审计：记录所有 AI 请求的目标 Provider 和数据摘要

#### P4-03: 用户来源感知 UI
- **前端：** AI 回答旁显示 `Local` / `Cloud` 来源徽章
- **实现：** Provider 在响应中包含 `provider` 字段，前端渲染为小型标签
- **文件修改：** `frontend/src/components/BookAgentChat.tsx` / `AIPanel.tsx`

---

### Phase 5: Hybrid Provider 实现

**目标：** 实现本地优先、云端兜底的混合 Provider 模式。

#### P5-01: HybridEmbedProvider
- **文件：** `backend/app/providers/hybrid_embed_provider.py` (新建)
- **策略：**
  ```
  HybridEmbedProvider implements AIProvider
    ├── local: Transformers.js (all-MiniLM-L6-v2)
    │     ✓ Desktop browser → runs in WebWorker
    │     ✓ Fallback to CPU via WASM if no WebGPU
    │     ✓ Model cached in SQLite (desktop) / IndexedDB (browser)
    │       after first download
    └── remote: Cloud embedding API
          └── used when: local model not yet loaded, or privacy mode off
  ```

#### P5-02: HybridLLMProvider
- **策略：**
  - 简易 QA / 摘要 → 优先本地 Ollama
  - 复杂推理 / 多工具调用 → 云端 LLM
  - 本地不可用时 → 降级到云端

#### P5-03: HybridRerankProvider
- **策略：**
  - 首选本地 ONNX 轻量模型
  - 降级到云端 cross-encoder

---

### Phase 6: 前端适配

**目标：** 前端感知后端架构升级，支持本地/云端标识和离线状态。

#### P6-01: AI 来源徽章
- **文件：** `frontend/src/components/BookAgentChat.tsx`
- **改动：** 在每个 AI 回复块下方显示 `provider` 标签（`Local` 绿色 / `Cloud` 蓝色）

#### P6-02: 隐私模式开关增强
- **文件：** `frontend/src/pages/Settings.tsx`
- **改动：**
  - 开关状态与 AI 请求联动（请求头注入 `X-Privacy-Mode`）
  - 关闭云功能时灰度化不可用的 AI 能力

#### P6-03: 离线状态指示
- **新增组件：** `frontend/src/components/OfflineIndicator.tsx`
- **功能：** 显示当前网络状态、待处理离线队列数量

#### P6-04: 本地模型下载进度
- **新增组件：** `frontend/src/components/ModelDownloadProgress.tsx`
- **功能：** 显示 Transformers.js / ONNX 模型下载进度条（Web Worker 通信）

#### P6-05: Desktop vs Web 差异化 UI
- **检测：** `window.__TAURI__` 存在 → Desktop 模式
- **差异：**
  - Desktop：可启用 Ollama 本地 LLM
  - Web：无本地 LLM（除非将来扩展 WebLLM）

---

### Phase 7: 测试 & 验证

#### P7-01: Provider 层单元测试
- 文件：`backend/tests/providers/`
- 覆盖：每个 Provider 的 `generate`、`embed`、`rerank`、`is_available`

#### P7-02: 中间件集成测试
- 文件：`backend/tests/middleware/`
- 覆盖：Scanner → Scheduler → Provider 全链路，隐私模式强制路由

#### P7-03: 端到端回归测试
- 扩展现有 `release_check.py`，增加架构升级后的新检查项：
  - 隐私模式下请求不到达云 API
  - 离线队列持久化和恢复
  - AI 响应携带 provider 标签

---

## 三、改造优先级 & 时间线

| Phase | 内容 | 优先级 | 预估工作量 | 依赖 |
|-------|------|--------|-----------|------|
| Phase 1 | Provider 抽象层 | 🔴 P0 | 3-5d | 无 |
| Phase 2 | 统一 AI 中间件 | 🔴 P0 | 5-7d | Phase 1 |
| Phase 3 | Local Provider 实现 | 🟡 P1 | 7-10d | Phase 2 |
| Phase 4 | 隐私模式 & 安全 | 🟡 P1 | 3-4d | Phase 2 |
| Phase 5 | Hybrid Provider | 🟢 P2 | 4-6d | Phase 3 |
| Phase 6 | 前端适配 | 🟢 P2 | 3-5d | Phase 3-5 |
| Phase 7 | 测试 & 验证 | 🟡 P1 | 3-4d | 各 Phase 结束后 |

**总预估：** 4-6 周（随 Phase 并行度调整）

---

## 四、非破坏性迁移原则

1. **不中断现有功能** — 每个 Phase 的改造保持现有 API 合约不变
2. **渐进式替换** — CloudProvider 先封装现有 service 调用，不重写
3. **Feature Flag** — 新中间件通过环境变量 `ENABLE_AI_ROUTER=true` 渐进启用
4. **向后兼容** — 未通过中间件路由的请求继续走原有直接调用路径
5. **DB 迁移** — 新增表（如 `offline_queue`）通过 Alembic migration 添加，不影响现有表

---

## 五、关键文件变更清单

### 新增文件
```
backend/app/
├── providers/
│   ├── __init__.py
│   ├── base.py                  # AIProvider 抽象基类 + 数据类
│   ├── registry.py              # ProviderRegistry 服务发现
│   ├── cloud_provider.py        # 云 API 封装
│   ├── local_provider.py        # 本地运行时（Ollama 等）
│   ├── hybrid_embed_provider.py # Hybrid Embedding
│   ├── hybrid_llm_provider.py   # Hybrid LLM
│   ├── hybrid_rerank_provider.py# Hybrid Rerank
│   └── config.py                # Provider 配置
├── middleware/
│   ├── __init__.py
│   ├── capability_scanner.py    # 启动时能力探测
│   ├── scheduler.py             # 任务感知路由
│   ├── confidence_gate.py       # 置信度门控
│   ├── offline_queue.py         # 离线任务队列
│   ├── privacy_guard.py         # 隐私保护拦截
│   └── ai_router.py             # FastAPI 依赖注入入口
└── services/
    └── fsrs_service.py          # FSRS 纯数学调度器

frontend/src/
└── components/
    ├── OfflineIndicator.tsx      # 离线状态指示
    └── ModelDownloadProgress.tsx # 模型下载进度
```

### 修改文件
```
backend/
├── app/main.py                  # startup 事件注入 CapabilityScanner
├── app/routers/ai.py            # 路由通过 AI 中间件（可选，feature flag）
├── app/models.py                # 新增 offline_queue 表
└── alembic/versions/            # 新增 migration

frontend/src/
├── components/BookAgentChat.tsx # AI 来源徽章渲染
├── components/AIPanel.tsx       # 隐私模式请求头注入
└── pages/Settings.tsx           # 隐私模式开关与 AI 联动
```

---

## 六、风险 & 缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 本地模型下载慢 / 占用大 | 首次使用体验差 | 显示进度条，允许跳过使用云端 |
| Ollama 版本兼容性 | 桌面端本地 LLM 不稳定 | 版本检测 + 优雅降级到 Cloud |
| 离线队列堆积 | 云端恢复后瞬时压力大 | 限流（rate limit）+ 分批处理 |
| Provider 路由错误 | AI 回答质量下降 | ConfidenceGate 兜底 + 用户可感知来源 |
| 隐私模式误泄漏 | 合规风险 | 多层拦截 + 审计日志 |

---

## 七、验收标准

### Phase 1 验收
- [ ] `AIProvider` 接口定义完整，所有方法有文档
- [ ] `CloudProvider` 封装后，现有 AI 功能无回归
- [ ] `ProviderRegistry` 能正确列出所有注册的 provider

### Phase 2 验收
- [ ] `CapabilityScanner` 在启动时正确探测桌面/浏览器/本地服务
- [ ] `Scheduler.classify()` 对每种 task type 返回正确路由决策
- [ ] `ConfidenceGate` 在低置信度时正确升级到 Cloud
- [ ] `OfflineQueue` 持久化失败任务并在恢复后自动 flush

### Phase 3 验收
- [ ] Desktop 环境下 Ollama 可用时，简单 QA 走本地
- [ ] 本地 Embedding 模型下载后可离线使用
- [ ] FSRS 复习调度纯本地计算、零网络依赖
- [ ] TTS 朗读功能可通过浏览器原生 API 工作

### Phase 4 验收
- [ ] 隐私模式下，所有请求强制路由到 Local（或拒绝）
- [ ] 隐私模式下，文档原始文本不会发送到云端
- [ ] AI 来源徽章在每个回答上正确显示

### Phase 5 验收
- [ ] Hybrid Provider 在本地可用时优先本地
- [ ] 本地不可用时自动降级到云端
- [ ] 降级过程对用户透明（无报错或中断）

### Phase 6 验收
- [ ] 前端 AI 回答正确渲染 provider 来源标签
- [ ] Settings 隐私开关与请求联动
- [ ] 离线状态下 UI 正确指示

### Phase 7 验收
- [ ] Provider 层单元测试覆盖率 ≥ 80%
- [ ] 中间件集成测试通过
- [ ] `release_check.py` 回归通过
