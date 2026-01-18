# Findings: Seed功能与缓存机制设计

## 现有代码分析

### 节点数据结构
**NanoBananaNodeData** (`src/types/index.ts`):
- `model`, `resolution`, `aspectRatio`, `useGoogleSearch`
- `inputImages`, `inputPrompt`
- `outputImage`, `status`, `error`
- `imageHistory`, `selectedHistoryIndex` (已有历史记录机制)

**LLMGenerateNodeData**:
- `provider`, `model`, `temperature`, `maxTokens`
- `inputPrompt`, `inputImages`, `outputText`
- `status`, `error`

### API 调用结构 (`/api/generate/route.ts`)
```typescript
const response = await ai.models.generateContent({
  model: modelId,
  contents: [{ role: "user", parts }],
  config: {
    responseModalities: ["IMAGE", "TEXT"],
    imageConfig: { aspectRatio, imageSize, outputMimeType }
  }
});
```

## 设计方案

### 1. Seed 数据结构

**类型定义** (`src/types/index.ts`):
```typescript
// 扩展 NanoBananaNodeData
interface NanoBananaNodeData {
  // ... 现有字段
  seed?: number;           // 随机种子值
  seedFixed?: boolean;     // 是否固定种子
  lastSeed?: number;       // 上次使用的种子（自动生成或手动设置）
}

// 扩展 LLMGenerateNodeData
interface LLMGenerateNodeData {
  // ... 现有字段
  seed?: number;
  seedFixed?: boolean;
  lastSeed?: number;
}
```

### 2. Gemini API Seed 支持

**需要确认**：Google GenAI SDK 是否支持 seed 参数。

根据 Gemini API 文档，可能的选项：
- **选项 A**：使用 `config` 中的 `seed` 参数（如果支持）
- **选项 B**：在 prompt 中嵌入 seed 信息（不可靠）
- **选项 C**：通过请求时序或其他方式（不完全可靠）

**推荐方案**：假设 Gemini 支持 seed，在 config 中传递：
```typescript
const config: any = {
  responseModalities: ["IMAGE", "TEXT"],
  imageConfig: { aspectRatio, imageSize, outputMimeType },
  ...(seed && { seed })  // 如果有 seed 则添加
};
```

### 3. 缓存存储方案

**存储选择**：**IndexedDB** (通过 Dexie.js 或原生 API)

**原因**：
- localStorage 限制 5-10MB，图像数据容易超限
- IndexedDB 支持大容量存储
- 异步操作，不阻塞主线程

**缓存数据结构**：
```typescript
interface GenerationCache {
  id: string;              // 缓存键
  nodeId: string;          // 节点ID
  seed: number;            // 使用的seed
  inputs: {
    model: string;
    resolution?: string;
    aspectRatio?: string;
    prompt: string;
    images: string[];      // 输入图像的hash
  };
  output: {
    image?: string;        // 输出图像 dataURL
    text?: string;         // 输出文本
  };
  timestamp: number;       // 生成时间
  expiresAt: number;       // 过期时间（可选）
}
```

**缓存键生成**：
```typescript
// 图像生成缓存键
const cacheKey = `${nodeId}-${model}-${resolution}-${prompt.length}-${images.map(img => hash(img)).join('-')}-${seed}`;

// LLM 生成缓存键
const cacheKey = `${nodeId}-${provider}-${model}-${temperature}-${prompt.length}-${images.map(img => hash(img)).join('-')}-${seed}`;
```

### 4. UI 改造方案

**NanoBananaNode 添加**：
1. Seed 显示区域（显示当前/上次使用的 seed）
2. "固定 Seed" 复选框
3. Seed 输入框（固定后可编辑）
4. 缓存状态指示器
5. "清除缓存"按钮

**UI 布局**：
```
┌─────────────────────────┐
│   [预览区域]            │
│                         │
├─────────────────────────┤
│ 模型 | 宽高比 | 分辨率   │
├─────────────────────────┤
│ 📱 Seed: 12345678      │
│ ☑ 固定Seed             │
│ 💾 缓存已命中 ✓        │
│ 🗑 清除缓存            │
└─────────────────────────┘
```

### 5. 执行逻辑改造

**工作流程**：
```
1. 用户运行工作流
   ↓
2. 遍历节点（topological sort）
   ↓
3. 对于 nanoBanana/llmGenerate 节点：
   ├─ 检查 seedFixed 是否为 true
   │  └─ true: 生成/使用 seed
   │       ├─ 检查缓存是否存在
   │       │  ├─ 命中: 加载缓存数据，跳过API调用
   │       │  └─ 未命中: 正常执行API
   └─ false: 生成随机seed，正常执行
   ↓
4. API返回后保存结果到缓存
   ↓
5. 更新节点状态（complete + 输出数据）
```

**缓存命中检测**：
```typescript
async function executeNode(nodeId: string) {
  const node = getNode(nodeId);

  // 如果 seed 已固定
  if (node.data.seedFixed && node.data.seed) {
    // 生成缓存键
    const cacheKey = generateCacheKey(node.data);

    // 检查缓存
    const cached = await cacheManager.get(cacheKey);
    if (cached) {
      // 缓存命中 - 直接使用缓存数据
      updateNodeData(nodeId, {
        outputImage: cached.output.image,
        outputText: cached.output.text,
        status: 'complete',
        metadata: { cached: true }
      });
      return;
    }
  }

  // 缓存未命中或seed未固定 - 正常执行
  await executeNodeAPI(nodeId);
}
```

### 6. 缓存管理模块 (`src/lib/cacheManager.ts`)

```typescript
class CacheManager {
  // 初始化 IndexedDB
  async init()

  // 生成缓存键
  generateKey(nodeId: string, data: NodeData, seed: number): string

  // 保存结果到缓存
  save(key: string, data: GenerationCache): Promise<void>

  // 从缓存读取
  get(key: string): Promise<GenerationCache | null>

  // 删除特定缓存
  delete(key: string): Promise<void>

  // 清除节点所有缓存
  clearByNode(nodeId: string): Promise<void>

  // 清除过期缓存
  cleanExpired(): Promise<void>

  // 获取缓存统计
  getStats(): Promise<{ count: number; size: number }>
}
```

### 7. 需要添加/修改的文件

| 文件 | 改动 |
|------|------|
| `src/types/index.ts` | 添加 seed 相关字段到节点数据类型 |
| `src/lib/cacheManager.ts` | 新建缓存管理模块 |
| `src/components/nodes/NanoBananaNode.tsx` | 添加 seed UI 控件 |
| `src/components/nodes/LLMGenerateNode.tsx` | 添加 seed UI 控件 |
| `src/store/workflowStore.ts` | 修改执行逻辑支持缓存 |
| `src/app/api/generate/route.ts` | 支持 seed 参数 |
| `src/app/api/llm/route.ts` | 支持 seed 参数 |

## 关键发现：Gemini API Seed 支持

### ✅ Gemini API 支持 Seed（但有局限）

根据2025年最新调研：

1. **Seed 参数仅在 Vertex AI SDK 中可用**
   - 标准 Gemini Developer API **不支持** seed
   - 项目使用 Cloudflare Worker 代理 Vertex AI API，**理论上可以支持**

2. **Seed 只提供"最佳努力"的确定性**
   - Google 官方文档：seed 使输出"mostly deterministic"
   - **不保证 100% 可重现**
   - 因素：系统更新、负载均衡、硬件差异

3. **2025年报告的问题**
   - gemini-2.5-pro 存在非确定性行为报告
   - 即使固定 seed 和 temperature，仍可能产生不同输出

### 对项目的意义

| 方面 | 影响 |
|------|------|
| 技术可行性 | ✅ 可用（通过 Vertex AI） |
| 结果可预测性 | ⚠️ 部分可靠（best effort） |
| 缓存价值 | ✅ 仍然有用（提高一致性） |
| 用户预期 | 需要告知限制 |

### 实现方案调整

```typescript
// API 调用时传递 seed（Vertex AI 支持）
const config: any = {
  responseModalities: ["IMAGE", "TEXT"],
  imageConfig: { aspectRatio, imageSize, outputMimeType },
  seed: seed || undefined  // 通过 Vertex AI 传递
};
```

**用户界面需要说明**：
- "Seed 可以提高结果一致性，但不保证 100% 可重现"
- 显示"Seed 已固定"时可以添加提示："结果可能因系统更新而略有差异"

**Sources:**
- [Gemini API Content Generation Parameters](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/content-generation-parameters)
- [Vertex AI GenerationConfig Reference](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1beta1/GenerationConfig)
- [KeywordsAI Blog on LLM Consistency 2025](https://www.keywordsai.co/blog/llm_consistency_2025)
- [Gemini Non-Deterministic Behavior Discussion](https://discuss.ai.google.dev/t/the-gemini-api-is-exhibiting-non-deterministic-behavior-for-the-gemini-2-5-pro-model-it-is-producing-different-outputs-for-identical-requests-even-when-a-fixed-seed-is-provided-along-with-a-constant-temperature-this-behavior-has-been-reliably-rep/101331)

2. **缓存数据有效期：**
   - 建议：永久保存，用户手动清除
   - 或：添加过期机制（如30天）

3. **缓存数据同步：**
   - 当前设计：仅本地缓存
   - 未来：可考虑云端同步

4. **图像历史与缓存的关系：**
   - imageHistory 是节点内历史（多张图片）
   - 缓存是跨执行的复用（相同输入=相同输出）
   - 两者可以共存，互不影响

## 下一步

1. 确认 Gemini API seed 支持
2. 创建 cacheManager.ts
3. 扩展类型定义
4. 修改节点 UI
5. 修改执行逻辑
6. 修改 API 层
7. 测试与验证
