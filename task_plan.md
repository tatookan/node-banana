# Task Plan: Seed功能与缓存机制
<!--
  WHAT: 为图片生成和LLM节点添加seed功能，支持固定随机种子实现结果复用
  WHY: 用户发现满意结果后可以固定seed，避免重复执行，使用缓存数据
-->

## Goal
为 nanoBanana 和 llmGenerate 节点添加 seed 功能，用户可以：
1. 查看每次生成使用的 seed 值
2. 固定 seed 值来复现相同结果
3. 节点执行时检测到固定seed则跳过API调用，直接使用缓存数据

## Current Phase
Phase 4

## Phases

### Phase 1: 需求分析与数据结构设计
- [x] 分析 seed 功能需求
- [x] 设计 seed 相关数据结构（节点数据、缓存记录）
- [x] 设计缓存存储方案（IndexedDB）
- [x] 定义 TypeScript 类型
- [x] 确定缓存键生成规则
- [x] 确认 Gemini API seed 支持（Vertex AI，best effort）
- **Status:** complete

### Phase 2: 缓存存储实现
- [x] 创建缓存管理模块 (`cacheManager.ts`)
- [x] 实现 IndexedDB 存储层
- [x] 实现缓存读写接口
- [x] 实现缓存过期/清理机制
- **Status:** complete

### Phase 3: 节点UI改造
- [x] 修改 NanoBananaNode 添加 seed 显示/输入
- [x] 修改 LLMGenerateNode 添加 seed 显示/输入
- [x] 添加"固定seed"交互（按钮/开关）
- [x] 显示缓存状态（已缓存/未缓存）
- **Status:** complete

### Phase 4: 执行逻辑改造
- [x] 修改 workflowStore.ts 的 executeWorkflow 逻辑
- [x] 添加 seed 检测：固定seed则跳过执行
- [x] 实现缓存数据加载逻辑
- [x] 保持节点状态同步（loading/complete）
- **Status:** complete

### Phase 5: API层适配
- [x] ~~修改 /api/generate 传递 seed 参数~~ (不需要传递到API)
- [x] ~~修改 /api/llm 传递 seed 参数~~ (不需要传递到API)
- [x] ~~确认 Gemini API 支持 seed 的方式~~ (使用本地缓存替代)
- [x] 记录 seed 到缓存数据
- **Status:** complete (设计变更：使用本地缓存而非API seed)

### Phase 6: 测试与验证
- [ ] 测试 seed 固定后结果复现
- [ ] 测试缓存命中时跳过执行
- [ ] 测试缓存数据正确显示
- [ ] 测试 seed 修改后重新执行
- **Status:** in_progress

## Key Questions
1. Gemini API 是否支持 seed 参数？如果不支持如何实现？
2. 缓存数据存储在哪里（localStorage大小限制）？
3. 缓存key如何生成（seed+model+resolution+prompt+images）？
4. 缓存数据是否需要过期机制？
5. SplitGrid 子节点的 seed 如何处理？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 使用 IndexedDB 存储缓存 | 图像数据较大，localStorage 有 5-10MB 限制 |
| 缓存键包含完整输入hash | 确保相同输入产生相同缓存键 |
| 支持 seed 但不保证100%确定性 | Gemini API seed 只提供 "best effort" 确定性 |
| 缓存永久保存用户手动清除 | 简化实现，用户可以主动管理 |
| 创建独立 cacheManager 模块 | 解耦缓存逻辑，便于维护 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| | 1 | |

## Notes
- 更新阶段状态: pending → in_progress → complete
- 在重大决策前重新阅读此计划
- 记录所有错误，避免重复
