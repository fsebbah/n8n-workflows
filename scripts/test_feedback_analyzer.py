#!/usr/bin/env python3
"""
Test script for n8n analyze-feedback webhook.

Tests the feedback analysis tool that extracts user preferences.

Usage:
    python scripts/test_feedback_analyzer.py
    python scripts/test_feedback_analyzer.py --comment "Trop long"
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

# Load environment variables from .env.local
env_path = Path(__file__).parent.parent / ".env.local"
load_dotenv(env_path)

# Configuration
N8N_WEBHOOK_URL = os.getenv("N8N_WEBHOOK_URL", "http://pi6.local:5678")
ANALYZE_ENDPOINT = f"{N8N_WEBHOOK_URL}/webhook/analyze-feedback"

# Test cases
TEST_CASES = [
    {
        "name": "Trop long",
        "comment": "Trop long, je voulais juste une réponse simple",
        "feedback_type": "negative",
        "expected": {
            "category": "length",
            "preference_key": "response_length",
        },
    },
    {
        "name": "Pas compris",
        "comment": "Le message ne correspond pas à ma demande",
        "feedback_type": "negative",
        "expected": {
            "category": "accuracy",
            "preference_key": "comprehension",
        },
    },
    {
        "name": "Trop de questions",
        "comment": "Arrête de me demander confirmation, fais-le directement !",
        "feedback_type": "negative",
        "expected": {
            "category": "confirmation",
            "preference_key": "confirmation_level",
        },
    },
    {
        "name": "Feedback positif",
        "comment": "Parfait, merci beaucoup !",
        "feedback_type": "positive",
        "expected": {
            "category": "other",
        },
    },
]


def analyze_feedback(comment: str, feedback_type: str = "negative", timeout: float = 30.0) -> dict:
    """
    Call the n8n analyze-feedback webhook.

    Args:
        comment: Feedback comment to analyze
        feedback_type: Type of feedback (positive, negative, neutral)
        timeout: Request timeout in seconds

    Returns:
        Analysis result dictionary
    """
    payload = {
        "comment": comment,
        "feedback_type": feedback_type,
        "language": "fr",
    }

    print(f"\n📤 Request to: {ANALYZE_ENDPOINT}")
    print(f"📦 Payload: {json.dumps(payload, ensure_ascii=False)}")

    start_time = time.time()

    with httpx.Client(timeout=timeout) as client:
        response = client.post(
            ANALYZE_ENDPOINT,
            json=payload,
            headers={"Content-Type": "application/json"},
        )

        print(f"📥 Status: {response.status_code}")
        print(f"📥 Headers: {dict(response.headers)}")

        # Don't raise for status, we want to see the error
        elapsed_ms = (time.time() - start_time) * 1000

        try:
            result = response.json()
        except Exception:
            result = {"raw_response": response.text[:500]}

        result["_elapsed_ms"] = round(elapsed_ms, 2)
        result["_status_code"] = response.status_code

    return result


def print_result(name: str, comment: str, result: dict, expected: dict = None):
    """Pretty print analysis result."""
    print(f"\n{'='*60}")
    print(f"📝 Test: {name}")
    print(f"{'='*60}")
    print(f'Comment: "{comment}"')
    print(f"Latence: {result.get('_elapsed_ms', 'N/A')}ms")
    print()

    # Remove internal fields for display
    display_result = {k: v for k, v in result.items() if not k.startswith("_")}
    print("Résultat:")
    print(json.dumps(display_result, indent=2, ensure_ascii=False))

    # Check expectations if provided
    if expected:
        print("\nVérifications:")
        analysis = result.get("analysis", {})

        # Check category
        if "category" in expected:
            actual_cat = analysis.get("category")
            if actual_cat == expected["category"]:
                print(f"  ✅ category: attendu '{expected['category']}' → trouvé '{actual_cat}'")
            else:
                print(f"  ❌ category: attendu '{expected['category']}' → trouvé '{actual_cat}'")

        # Check preference key
        if "preference_key" in expected:
            pref = analysis.get("user_preference", {})
            actual_key = pref.get("key") if pref else None
            if actual_key == expected["preference_key"]:
                print(
                    f"  ✅ preference_key: attendu '{expected['preference_key']}' → trouvé '{actual_key}'"
                )
            else:
                print(
                    f"  ❌ preference_key: attendu '{expected['preference_key']}' → trouvé '{actual_key}'"
                )


def run_tests():
    """Run all test cases."""
    print("\n🧪 Testing n8n analyze-feedback webhook")
    print(f"   Endpoint: {ANALYZE_ENDPOINT}")
    print()

    success_count = 0
    total_count = len(TEST_CASES)

    for test in TEST_CASES:
        try:
            result = analyze_feedback(test["comment"], test["feedback_type"])
            print_result(test["name"], test["comment"], result, test.get("expected"))

            if result.get("success"):
                success_count += 1
        except httpx.ConnectError:
            print(f"\n❌ Test '{test['name']}': Cannot connect to {ANALYZE_ENDPOINT}")
            print("   Is n8n running?")
        except httpx.HTTPStatusError as e:
            print(f"\n❌ Test '{test['name']}': HTTP {e.response.status_code}")
            print(f"   Response: {e.response.text[:200]}")
        except Exception as e:
            print(f"\n❌ Test '{test['name']}': {type(e).__name__}: {e}")

    print(f"\n{'='*60}")
    print(f"📊 Résultat: {success_count}/{total_count} tests réussis")
    print(f"{'='*60}")

    return success_count == total_count


def run_single_test(comment: str, feedback_type: str = "negative"):
    """Run a single test with custom comment."""
    print("\n🧪 Testing n8n analyze-feedback webhook")
    print(f"   Endpoint: {ANALYZE_ENDPOINT}")
    print()

    try:
        result = analyze_feedback(comment, feedback_type)
        print_result("Custom test", comment, result)
        return True
    except httpx.ConnectError:
        print(f"\n❌ Cannot connect to {ANALYZE_ENDPOINT}")
        print("   Is n8n running?")
        return False
    except httpx.HTTPStatusError as e:
        print(f"\n❌ HTTP {e.response.status_code}")
        print(f"   Response: {e.response.text[:500]}")
        return False
    except Exception as e:
        print(f"\n❌ {type(e).__name__}: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Test n8n analyze-feedback webhook")
    parser.add_argument(
        "--comment", "-c", type=str, help="Custom comment to analyze (runs single test)"
    )
    parser.add_argument(
        "--feedback",
        "-f",
        type=str,
        default="negative",
        choices=["positive", "negative", "neutral"],
        help="Feedback type",
    )
    parser.add_argument(
        "--url",
        "-u",
        type=str,
        default=None,
        help="n8n webhook base URL (default: http://pi6.local:5678)",
    )

    args = parser.parse_args()

    # Override URL if provided
    global ANALYZE_ENDPOINT
    if args.url:
        ANALYZE_ENDPOINT = f"{args.url}/webhook/analyze-feedback"

    if args.comment:
        success = run_single_test(args.comment, args.feedback)
    else:
        success = run_tests()

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
