#!/usr/bin/env python3
"""
Test OCR workflows for RFC-014
Usage: python scripts/test_ocr.py <file_path> [--action translate|summarize] [--target-lang fr]
"""

import argparse
import base64
import json
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv(".env.local")

N8N_WEBHOOK_BASE_URL = os.getenv("N8N_WEBHOOK_BASE_URL", "http://pi6.local:5678/webhook-test")
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")


def get_file_type(file_path: Path) -> str:
    """Detect file type from extension."""
    ext = file_path.suffix.lower()
    if ext in [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff"]:
        return "image"
    elif ext == ".pdf":
        return "pdf"
    else:
        return "unknown"


def file_to_base64(file_path: Path) -> str:
    """Convert file to base64 string."""
    with open(file_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def test_estimate(file_path: Path, action: str = "translate", source_lang: str = "hebrew") -> dict:
    """Test /documents/estimate endpoint."""
    print(f"\n{'='*60}")
    print(f"Testing /documents/estimate")
    print(f"{'='*60}")

    file_type = get_file_type(file_path)

    payload = {
        "file_base64": file_to_base64(file_path),
        "file_type": file_path.suffix.lower().replace(".", ""),
        "action": action,
        "params": {"source_language": source_lang},
        "plugin_context": {
            "ocr_thresholds": {
                "min_confidence": 0.7,
                "hebrew_min_confidence": 0.6,
                "aramaic_min_confidence": 0.5
            },
            "detected_language": source_lang
        }
    }

    url = f"{N8N_WEBHOOK_BASE_URL}/documents/estimate"
    print(f"URL: {url}")
    print(f"File: {file_path.name} ({file_type})")

    try:
        start = time.time()
        response = requests.post(url, json=payload, timeout=60)
        elapsed = time.time() - start

        print(f"Status: {response.status_code}")
        print(f"Time: {elapsed:.2f}s")

        if response.status_code == 200:
            result = response.json()
            print(f"\nResult:")
            print(json.dumps(result, indent=2, ensure_ascii=False))
            return result
        else:
            print(f"Error: {response.text}")
            return {"error": response.text}
    except Exception as e:
        print(f"Exception: {e}")
        return {"error": str(e)}


def test_ocr_direct(file_path: Path) -> dict:
    """Test direct OCR endpoint (image-ocr or pdf-layout-translator)."""
    print(f"\n{'='*60}")
    print(f"Testing direct OCR endpoint")
    print(f"{'='*60}")

    file_type = get_file_type(file_path)

    if file_type == "image":
        url = f"{N8N_WEBHOOK_BASE_URL}/image-ocr"
        payload = {
            "image_base64": file_to_base64(file_path),
            "mistral_api_key": MISTRAL_API_KEY
        }
    elif file_type == "pdf":
        url = f"{N8N_WEBHOOK_BASE_URL}/pdf-layout-translator"
        payload = {
            "file_base64": file_to_base64(file_path),
            "target_language": "french",
            "mistral_api_key": MISTRAL_API_KEY
        }
    else:
        print(f"Unsupported file type: {file_type}")
        return {"error": "Unsupported file type"}

    print(f"URL: {url}")
    print(f"File: {file_path.name} ({file_type})")
    print(f"API Key: {MISTRAL_API_KEY[:8]}...")

    try:
        start = time.time()
        response = requests.post(url, json=payload, timeout=300)
        elapsed = time.time() - start

        print(f"Status: {response.status_code}")
        print(f"Time: {elapsed:.2f}s")

        if response.status_code == 200:
            result = response.json()

            # Extract text for display
            text = None
            if isinstance(result, dict):
                text = result.get("text") or result.get("data", {}).get("text") or result.get("data", {}).get("translated_text")

            print(f"\n--- Response Structure ---")
            print(f"Keys: {list(result.keys()) if isinstance(result, dict) else type(result)}")

            if text:
                print(f"\n--- Extracted Text (first 500 chars) ---")
                print(text[:500])
                print(f"\n[Total: {len(text)} chars, ~{len(text.split())} words]")

            # Show metrics if available
            if isinstance(result, dict):
                if "meta" in result:
                    print(f"\n--- Metrics ---")
                    print(json.dumps(result["meta"], indent=2, ensure_ascii=False))
                if "usage" in result:
                    print(f"\n--- Usage ---")
                    print(json.dumps(result["usage"], indent=2, ensure_ascii=False))

            return result
        else:
            print(f"Error: {response.text[:500]}")
            return {"error": response.text}
    except requests.exceptions.Timeout:
        print("Timeout after 300s")
        return {"error": "Timeout"}
    except Exception as e:
        print(f"Exception: {e}")
        return {"error": str(e)}


def test_process(file_path: Path, action: str = "translate", target_lang: str = "french") -> dict:
    """Test /documents/process endpoint."""
    print(f"\n{'='*60}")
    print(f"Testing /documents/process")
    print(f"{'='*60}")

    job_id = f"test-{int(time.time())}"

    payload = {
        "job_id": job_id,
        "file_base64": file_to_base64(file_path),
        "file_type": file_path.suffix.lower().replace(".", ""),
        "action": action,
        "params": {
            "target_language": target_lang,
            "source_language": "hebrew"
        },
        "plugin_context": {
            "api_keys": {
                "mistral": MISTRAL_API_KEY
            },
            "ocr_thresholds": {
                "hebrew_min_confidence": 0.6,
                "aramaic_min_confidence": 0.5
            }
        }
        # No callback_url - will just process and return
    }

    url = f"{N8N_WEBHOOK_BASE_URL}/documents/process"
    print(f"URL: {url}")
    print(f"File: {file_path.name}")
    print(f"Job ID: {job_id}")
    print(f"Action: {action} -> {target_lang}")

    try:
        start = time.time()
        response = requests.post(url, json=payload, timeout=30)
        elapsed = time.time() - start

        print(f"Status: {response.status_code}")
        print(f"Time: {elapsed:.2f}s")

        result = response.json()
        print(f"\nACK Response:")
        print(json.dumps(result, indent=2, ensure_ascii=False))

        return result
    except Exception as e:
        print(f"Exception: {e}")
        return {"error": str(e)}


def main():
    parser = argparse.ArgumentParser(description="Test OCR workflows for RFC-014")
    parser.add_argument("file", help="Path to file to process")
    parser.add_argument("--action", default="translate", choices=["translate", "summarize"],
                        help="Action to perform (default: translate)")
    parser.add_argument("--target-lang", default="french", help="Target language (default: french)")
    parser.add_argument("--test", default="ocr", choices=["ocr", "estimate", "process", "all"],
                        help="Which endpoint to test (default: ocr)")

    args = parser.parse_args()

    file_path = Path(args.file)
    if not file_path.exists():
        print(f"Error: File not found: {file_path}")
        sys.exit(1)

    print(f"\n{'#'*60}")
    print(f"# RFC-014 OCR Test")
    print(f"# File: {file_path}")
    print(f"# Size: {file_path.stat().st_size / 1024:.1f} KB")
    print(f"# Webhook: {N8N_WEBHOOK_BASE_URL}")
    print(f"{'#'*60}")

    results = {}

    if args.test in ["estimate", "all"]:
        results["estimate"] = test_estimate(file_path, args.action)

    if args.test in ["ocr", "all"]:
        results["ocr"] = test_ocr_direct(file_path)

    if args.test in ["process", "all"]:
        results["process"] = test_process(file_path, args.action, args.target_lang)

    print(f"\n{'='*60}")
    print("Done!")
    print(f"{'='*60}")

    return results


if __name__ == "__main__":
    main()
