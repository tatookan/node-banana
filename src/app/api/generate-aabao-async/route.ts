import { NextRequest, NextResponse } from "next/server";
import { GenerateRequest, AabaoGenerateAsyncResponse, ModelType, Resolution, AspectRatio, ImageProvider } from "@/types";
import { getUserIdFromToken } from "@/lib/usageTracker";
import { checkQuota, updateQuotaUsage } from "@/lib/quotaManager";
import { calculateGenerationCost } from "@/utils/costCalculator";

export const maxDuration = 300; // 5 minutes for 4K generation
export const dynamic = 'force-dynamic';

// ============================================================================
// AABao 异步生成端点
// ============================================================================
// 此端点立即返回 taskId，后台处理生成任务
// 前端通过 /api/aabao-task/[taskId] 轮询任务状态

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`\n[AABao-ASYNC:${requestId}] ========== NEW ASYNC REQUEST ==========`);
  console.log(`[AABao-ASYNC:${requestId}] Timestamp: ${new Date().toISOString()}`);

  try {
    // ========================================
    // 1. 验证用户身份
    // ========================================
    const token = request.cookies.get('auth_token')?.value;
    const userId = await getUserIdFromToken(token);
    if (!userId) {
      console.error(`[AABao-ASYNC:${requestId}] ❌ Unauthorized: no valid user token`);
      return NextResponse.json<AabaoGenerateAsyncResponse>(
        { success: false, error: "未授权，请先登录" },
        { status: 401 }
      );
    }
    console.log(`[AABao-ASYNC:${requestId}] User ID: ${userId}`);

    // ========================================
    // 2. 解析请求参数
    // ========================================
    console.log(`[AABao-ASYNC:${requestId}] Parsing request body...`);
    let body: GenerateRequest;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error(`[AABao-ASYNC:${requestId}] ❌ JSON parse error:`, parseError);
      return NextResponse.json<AabaoGenerateAsyncResponse>(
        { success: false, error: "请求格式错误" },
        { status: 400 }
      );
    }

    const {
      images = [],
      prompt = "",
      provider,
      model = "nano-banana",
      aspectRatio = "1:1",
      resolution = "1K",
      resonanceMode = true,
      systemPrompt = "",
      topP = 0.95,
    } = body;

    // 验证 provider 必须是 aabao
    if (provider !== "aabao") {
      console.error(`[AABao-ASYNC:${requestId}] ❌ Invalid provider: ${provider}`);
      return NextResponse.json<AabaoGenerateAsyncResponse>(
        { success: false, error: "此端点仅支持 AABao provider" },
        { status: 400 }
      );
    }

    console.log(`[AABao-ASYNC:${requestId}] Request parameters:`);
    console.log(`[AABao-ASYNC:${requestId}]   - Model: ${model}`);
    console.log(`[AABao-ASYNC:${requestId}]   - Images: ${images.length}`);
    console.log(`[AABao-ASYNC:${requestId}]   - Prompt length: ${prompt.length} chars`);
    console.log(`[AABao-ASYNC:${requestId}]   - Aspect Ratio: ${aspectRatio}`);
    console.log(`[AABao-ASYNC:${requestId}]   - Resolution: ${resolution}`);

    // ========================================
    // 3. 配额检查
    // ========================================
    console.log(`[AABao-ASYNC:${requestId}] Checking quota...`);
    const estimatedCost = calculateGenerationCost(model, resolution, provider);
    const quotaCheck = await checkQuota(userId, estimatedCost);

    if (!quotaCheck.allowed) {
      console.error(`[AABao-ASYNC:${requestId}] ❌ Quota exceeded:`, quotaCheck);
      return NextResponse.json<AabaoGenerateAsyncResponse>(
        {
          success: false,
          error: `配额已用尽。已用: ¥${quotaCheck.quotaUsed.toFixed(2)}，上限: ¥${quotaCheck.quotaLimit.toFixed(2)}。`
        },
        { status: 403 }
      );
    }
    console.log(`[AABao-ASYNC:${requestId}] ✓ Quota check passed`);

    // ========================================
    // 4. 生成任务 ID
    // ========================================
    const taskId = `aabao_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    console.log(`[AABao-ASYNC:${requestId}] Generated task ID: ${taskId}`);

    // ========================================
    // 5. 存储初始任务状态
    // ========================================
    const { storeTaskResult, updateTaskState } = await import("../aabao-task/route");
    storeTaskResult(taskId, {
      taskId,
      state: "pending",
      createdAt: Date.now(),
      userId,
      requestParams: {
        model: model as ModelType,
        resolution: resolution as Resolution,
        aspectRatio: aspectRatio as AspectRatio,
      },
    });
    console.log(`[AABao-ASYNC:${requestId}] ✓ Initial task state stored`);

    // ========================================
    // 6. 立即扣除配额
    // ========================================
    await updateQuotaUsage(userId, estimatedCost);
    console.log(`[AABao-ASYNC:${requestId}] ✓ Quota deducted: ¥${estimatedCost.toFixed(4)}`);

    // ========================================
    // 7. 启动后台处理（不阻塞响应）
    // ========================================
    console.log(`[AABao-ASYNC:${requestId}] Starting background processing...`);

    // 将认证 token 传递给后台任务
    const authToken = token;

    processAabaoTask(taskId, body, userId, authToken, requestId).catch(error => {
      console.error(`[AABao-ASYNC:${requestId}] ❌ Background task failed:`, error);
      updateTaskState(taskId, "failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    // ========================================
    // 8. 立即返回 taskId
    // ========================================
    console.log(`[AABao-ASYNC:${requestId}] ✓✓✓ RETURNING taskId immediately ✓✓✓`);
    console.log(`[AABao-ASYNC:${requestId}] ========================================\n`);

    return NextResponse.json<AabaoGenerateAsyncResponse>({
      success: true,
      taskId,
    });

  } catch (error) {
    console.error(`[AABao-ASYNC:${requestId}] ❌❌❌ EXCEPTION CAUGHT ❌❌❌`);
    console.error(`[AABao-ASYNC:${requestId}] Error:`, error);

    return NextResponse.json<AabaoGenerateAsyncResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// 后台处理函数 (Background Processing Function)
// ============================================================================

/**
 * 后台处理 AABao 生成任务
 * 调用现有的 /api/generate 端点（同步）
 * 任务完成后更新内存缓存状态
 */
async function processAabaoTask(
  taskId: string,
  requestBody: GenerateRequest,
  userId: number,
  authToken: string | undefined,
  parentRequestId: string
): Promise<void> {
  const { updateTaskState } = await import("../aabao-task/route");

  console.log(`[AABao-ASYNC:${parentRequestId}] [BG-PROCESS] Task ${taskId} - Starting background processing`);

  // 更新状态为 processing
  updateTaskState(taskId, "processing", {});

  try {
    // 构建内部 API 请求的 URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const apiUrl = new URL('/api/generate', baseUrl);

    console.log(`[AABao-ASYNC:${parentRequestId}] [BG-PROCESS] Calling internal API: ${apiUrl.toString()}`);

    // 调用现有的 /api/generate 端点
    const response = await fetch(apiUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 传递认证信息
        'Cookie': `auth_token=${authToken || ''}`,
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`[AABao-ASYNC:${parentRequestId}] [BG-PROCESS] API response status: ${response.status}`);

    const result = await response.json();

    if (result.success && result.image) {
      // 成功
      console.log(`[AABao-ASYNC:${parentRequestId}] [BG-PROCESS] ✓✓✓ TASK SUCCESS ✓✓✓`);
      console.log(`[AABao-ASYNC:${parentRequestId}] [BG-PROCESS] Image size: ${(result.image.length / 1024).toFixed(2)}KB`);

      updateTaskState(taskId, "success", {
        image: result.image,
      });

      // 记录使用量
      try {
        const { recordImageGeneration } = await import('@/lib/usageTracker');
        await recordImageGeneration(userId, requestBody.model as ModelType, requestBody.resolution as Resolution);
        console.log(`[AABao-ASYNC:${parentRequestId}] [BG-PROCESS] ✓ Usage recorded`);
      } catch (recordError) {
        console.error(`[AABao-ASYNC:${parentRequestId}] [BG-PROCESS] ⚠️ Failed to record usage:`, recordError);
      }

    } else {
      // 失败
      console.error(`[AABao-ASYNC:${parentRequestId}] [BG-PROCESS] ❌ Task failed:`, result.error);
      updateTaskState(taskId, "failed", {
        error: result.error || "Generation failed",
      });

      // TODO: 配额退款（失败时退还已扣除的配额）
      // Currently refundQuotaUsage is not implemented in quotaManager
    }

  } catch (error) {
    // 异常
    console.error(`[AABao-ASYNC:${parentRequestId}] [BG-PROCESS] ❌ Exception:`, error);
    updateTaskState(taskId, "failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    // TODO: 配额退款（异常时退还已扣除的配额）
    // Currently refundQuotaUsage is not implemented in quotaManager
  }

  console.log(`[AABao-ASYNC:${parentRequestId}] [BG-PROCESS] Task ${taskId} - Background processing complete\n`);
}
