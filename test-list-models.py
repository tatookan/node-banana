#!/usr/bin/env python3
"""
列出 Vertex AI 中可用的 Gemini 模型
"""
import os
from google import genai

def list_models():
    # 获取 API Key
    api_key = os.environ.get("GOOGLE_CLOUD_API_KEY")

    if not api_key:
        print("❌ 错误: GOOGLE_CLOUD_API_KEY 环境变量未设置")
        return

    print(f"✅ API Key 已加载 (长度: {len(api_key)})")
    print("\n" + "="*60)
    print("正在初始化 Vertex AI 客户端...")
    print("="*60 + "\n")

    try:
        # 初始化客户端
        client = genai.Client(
            vertexai=True,
            api_key=api_key
        )

        print("✅ 客户端初始化成功\n")
        print("正在列出可用模型...\n")

        # 列出所有模型
        models = client.models.list()

        # 过滤出 Gemini 相关模型
        gemini_models = []
        image_models = []

        for model in models:
            model_name = model.name if hasattr(model, 'name') else str(model)
            model_lower = model_name.lower()

            if 'gemini' in model_lower:
                gemini_models.append(model_name)
            if 'image' in model_lower:
                image_models.append(model_name)

        print("="*60)
        print(f"📊 找到 {len(gemini_models)} 个 Gemini 模型:")
        print("="*60)
        for m in sorted(gemini_models):
            print(f"  - {m}")

        print("\n" + "="*60)
        print(f"🖼️  找到 {len(image_models)} 个图像相关模型:")
        print("="*60)
        for m in sorted(image_models):
            print(f"  - {m}")

        print("\n" + "="*60)
        print("🎯 特别关注的模型:")
        print("="*60)

        target_models = [
            "gemini-3-pro-image-preview",
            "gemini-3-pro-preview",
            "gemini-2.0-flash-exp",
            "gemini-2.5-flash",
            "imagen-3.0-generate"
        ]

        for target in target_models:
            found = any(target in m.lower() for m in gemini_models)
            status = "✅ 可用" if found else "❌ 未找到"
            print(f"  {status} - {target}")

    except Exception as e:
        print(f"\n❌ 错误: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    list_models()
