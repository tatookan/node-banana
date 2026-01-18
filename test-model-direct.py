#!/usr/bin/env python3
"""
直接测试 Vertex AI 模型是否可用
"""
import os
from google import genai
from google.genai import types

def test_model():
    api_key = os.environ.get("GOOGLE_CLOUD_API_KEY")

    if not api_key:
        print("❌ 错误: GOOGLE_CLOUD_API_KEY 环境变量未设置")
        return

    print(f"✅ API Key 已加载 (长度: {len(api_key)})")
    print("\n" + "="*60)
    print("测试 Vertex AI 模型访问")
    print("="*60 + "\n")

    # 测试的模型列表
    models_to_test = [
        "gemini-3-pro-image-preview",
        "gemini-2.0-flash-exp",
        "gemini-2.5-flash",
    ]

    for model_name in models_to_test:
        print(f"\n🔍 测试模型: {model_name}")
        print("-" * 40)

        try:
            client = genai.Client(
                vertexai=True,
                api_key=api_key
            )

            # 简单的文本生成测试
            response = client.models.generate_content(
                model=model_name,
                contents="Hello, just say 'OK' if you can understand this.",
            )

            if response and hasattr(response, 'text'):
                print(f"✅ 模型 {model_name} 可用!")
                print(f"   响应: {response.text[:100]}")
            else:
                print(f"⚠️  模型 {model_name} 返回了空响应")

        except Exception as e:
            error_str = str(e)
            if "404" in error_str or "not found" in error_str.lower():
                print(f"❌ 模型 {model_name} 未找到 (404)")
            elif "403" in error_str or "permission" in error_str.lower():
                print(f"❌ 模型 {model_name} 无权限访问 (403)")
            elif "401" in error_str:
                print(f"❌ 认证失败 (401)")
            else:
                print(f"❌ 错误: {error_str[:100]}")

    print("\n" + "="*60)
    print("测试完成")
    print("="*60)

if __name__ == "__main__":
    test_model()
