#!/usr/bin/env python3
"""
检查 Python SDK 实际使用的 Vertex AI 端点
"""
import os
from google import genai
import logging

# 启用详细日志
logging.basicConfig(level=logging.DEBUG)
httpx_logger = logging.getLogger('httpx')
httpx_logger.setLevel(logging.DEBUG)

def test_with_logging():
    api_key = os.environ.get("GOOGLE_CLOUD_API_KEY")

    if not api_key:
        print("❌ 错误: GOOGLE_CLOUD_API_KEY 环境变量未设置")
        return

    print("="*60)
    print("测试 gemini-3-pro-image-preview 并显示 HTTP 请求详情")
    print("="*60 + "\n")

    try:
        client = genai.Client(
            vertexai=True,
            api_key=api_key
        )

        print("发送请求...\n")

        response = client.models.generate_content(
            model="gemini-3-pro-image-preview",
            contents="Say 'OK'",
        )

        print(f"\n✅ 成功! 响应: {response.text}")

    except Exception as e:
        print(f"\n❌ 错误: {e}")

if __name__ == "__main__":
    test_with_logging()
