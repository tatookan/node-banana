/**
 * 提示词增强工具
 * 通过重复提示词2-3次来提升AI模型效果
 * 这个技术被证明可以显著改善模型的输出质量
 */

export interface PromptEnhancementResult {
  enhanced: string;
  original: string;
  repeatCount: number;
  wasEnhanced: boolean;
}

/**
 * 增强提示词 - 将提示词重复3次（用逗号分隔）
 * 这是AI工程中的最佳实践，可以显著提升模型效果
 *
 * @param prompt - 原始提示词
 * @param repeatCount - 重复次数，默认3
 * @returns 增强后的提示词
 */
export function enhancePrompt(
  prompt: string,
  repeatCount: number = 3
): PromptEnhancementResult {
  // 去除首尾空白
  const trimmed = prompt.trim();

  // 如果提示词为空或很短，直接返回
  if (!trimmed || trimmed.length < 2) {
    return {
      enhanced: trimmed,
      original: trimmed,
      repeatCount: 1,
      wasEnhanced: false,
    };
  }

  // 重复提示词指定次数
  const repeated = Array(repeatCount).fill(trimmed).join("，");

  return {
    enhanced: repeated,
    original: trimmed,
    repeatCount,
    wasEnhanced: true,
  };
}

/**
 * 获取增强后的提示词（简化版）
 * 直接返回增强后的字符串，方便使用
 */
export function getEnhancedPrompt(prompt: string, repeatCount: number = 3): string {
  const result = enhancePrompt(prompt, repeatCount);
  return result.enhanced;
}

/**
 * 打印提示词增强日志
 * 在应用增强后调用此函数记录日志
 */
export function logPromptEnhancement(
  result: PromptEnhancementResult,
  context: string = ""
): void {
  if (result.wasEnhanced) {
    const prefix = context ? `[${context}] ` : "";
    console.log(
      `${prefix}3prompt√ | 提示词已重复 ${result.repeatCount} 次\n` +
      `${prefix}原始: ${result.original.substring(0, 100)}${result.original.length > 100 ? "..." : ""}\n` +
      `${prefix}增强后长度: ${result.enhanced.length} 字符`
    );
  }
}

/**
 * 智能增强 - 只对符合条件的提示词进行增强
 * 例如：短提示词更适合重复增强
 */
export function smartEnhance(
  prompt: string,
  options: {
    minLength?: number;      // 最小长度才增强，默认10
    maxLength?: number;      // 最大长度才增强，默认500（太长不增强）
    repeatCount?: number;    // 重复次数，默认3
  } = {}
): PromptEnhancementResult {
  const {
    minLength = 10,
    maxLength = 500,
    repeatCount = 3,
  } = options;

  const trimmed = prompt.trim();

  // 检查是否应该增强
  const shouldEnhance =
    trimmed.length >= minLength &&
    trimmed.length <= maxLength;

  if (!shouldEnhance) {
    return {
      enhanced: trimmed,
      original: trimmed,
      repeatCount: 1,
      wasEnhanced: false,
    };
  }

  return enhancePrompt(trimmed, repeatCount);
}
