#!/usr/bin/env python3
"""
Test script for extractSlides operation.

Usage:
    python scripts/test/test_extract_slides.py <video_url>
    python scripts/test/test_extract_slides.py https://www.youtube.com/watch?v=VIDEO_ID
    python scripts/test/test_extract_slides.py /path/to/local/presentation.mp4

Examples:
    # YouTube presentation
    python scripts/test/test_extract_slides.py "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

    # Local file
    python scripts/test/test_extract_slides.py "/home/user/presentation.mp4"
"""

import sys
import json
import requests
import os
import base64
from pathlib import Path
from urllib.parse import urlparse

# Configuration
N8N_WEBHOOK_URL = os.getenv('N8N_WEBHOOK_URL', 'http://localhost:5678/webhook/video-transcription')


def is_local_file(path: str) -> bool:
    """Check if path is a local file."""
    return os.path.isfile(path)


def is_valid_video_source(source: str) -> bool:
    """Check if source is a valid video URL or local file."""
    if is_local_file(source):
        return True
    parsed = urlparse(source)
    if parsed.scheme in ('http', 'https') and parsed.netloc:
        return True
    return False


def load_video_as_base64(file_path: str) -> tuple[str, str]:
    """Load a local video file and return base64 data with mime type."""
    path = Path(file_path)

    mime_types = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.avi': 'video/avi',
        '.mov': 'video/quicktime',
        '.mkv': 'video/x-matroska',
        '.m4v': 'video/x-m4v',
    }

    mime_type = mime_types.get(path.suffix.lower(), 'video/mp4')

    with open(path, 'rb') as f:
        data = base64.b64encode(f.read()).decode('utf-8')

    return data, mime_type


def call_extract_slides(video_source: str) -> dict:
    """Call the extractSlides operation via n8n webhook."""

    if is_local_file(video_source):
        print(f"Loading local file: {video_source}")
        video_base64, mime_type = load_video_as_base64(video_source)
        payload = {
            'operation': 'extractSlides',
            'videoBase64': video_base64,
            'videoMimeType': mime_type,
        }
        print(f"File size: {len(video_base64) / 1024 / 1024:.2f} MB (base64)")
    else:
        payload = {
            'operation': 'extractSlides',
            'videoUrl': video_source,
        }

    print(f"Calling n8n webhook: {N8N_WEBHOOK_URL}")
    print(f"Operation: extractSlides")
    print("-" * 50)

    response = requests.post(
        N8N_WEBHOOK_URL,
        json=payload,
        headers={'Content-Type': 'application/json'},
        timeout=600  # 10 minutes for video processing
    )

    response.raise_for_status()
    return response.json()


def print_slides_summary(result: dict):
    """Print a formatted summary of extracted slides."""

    slides = result.get('slides', [])
    metadata = result.get('metadata', {})

    print("\n" + "=" * 60)
    print("EXTRACTION RESULTS")
    print("=" * 60)

    if metadata:
        print(f"\nPresentation: {metadata.get('presentation_title', 'N/A')}")
        print(f"Presenter: {metadata.get('presenter', 'N/A')}")
        print(f"Duration: {metadata.get('video_duration', 'N/A')}")
        print(f"Total slides: {metadata.get('total_slides', len(slides))}")
        print(f"Types found: {', '.join(metadata.get('slide_types_found', []))}")

    print("\n" + "-" * 60)
    print("SLIDES")
    print("-" * 60)

    for slide in slides:
        print(f"\n[Slide {slide.get('id', '?')}] @ {slide.get('timestamp', 'N/A')} ({slide.get('timestamp_ms', 0)}ms)")
        print(f"  Type: {slide.get('type', 'N/A')}")
        print(f"  Title: {slide.get('title', 'N/A')}")

        key_points = slide.get('key_points', [])
        if key_points:
            print(f"  Key points:")
            for point in key_points[:5]:  # Limit to 5 points
                print(f"    • {point}")
            if len(key_points) > 5:
                print(f"    ... and {len(key_points) - 5} more")

        if slide.get('description'):
            print(f"  Description: {slide.get('description')}")

        if slide.get('bounding_box'):
            print(f"  Bounding box: {slide.get('bounding_box')}")

    print("\n" + "=" * 60)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    video_source = sys.argv[1]

    if not is_valid_video_source(video_source):
        print(f"Error: Invalid video source: {video_source}")
        print("Provide a valid URL (http/https) or local file path")
        sys.exit(1)

    print(f"Video source: {video_source}")

    try:
        result = call_extract_slides(video_source)

        # Save full result to file
        output_file = 'extract_slides_result.json'
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"\nFull result saved to: {output_file}")

        # Print summary
        print_slides_summary(result)

        # Print metadata
        if 'metadata' in result:
            meta = result.get('metadata', {})
            print(f"\nProcessing metadata:")
            print(f"  Operation: {meta.get('operation', 'N/A')}")
            print(f"  Model: {meta.get('model', 'N/A')}")
            print(f"  Processed at: {meta.get('processedAt', 'N/A')}")

    except requests.exceptions.ConnectionError:
        print(f"Error: Cannot connect to {N8N_WEBHOOK_URL}")
        print("Make sure n8n is running and the workflow is active")
        sys.exit(1)
    except requests.exceptions.Timeout:
        print("Error: Request timed out (video processing took too long)")
        sys.exit(1)
    except requests.exceptions.HTTPError as e:
        print(f"Error: HTTP {e.response.status_code}")
        print(e.response.text)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
