#!/usr/bin/env python3
"""
Test script for extractSlides operation.

Examples:
    # Extract slides metadata from YouTube presentation
    python scripts/test/test_extract_slides.py "https://www.youtube.com/watch?v=VIDEO_ID"

    # Extract slides from local file
    python scripts/test/test_extract_slides.py /path/to/presentation.mp4

    # Custom output file
    python scripts/test/test_extract_slides.py "https://youtu.be/VIDEO_ID" -f docs/test/my_slides.json

    # Quiet mode (JSON only)
    python scripts/test/test_extract_slides.py "https://youtu.be/VIDEO_ID" -q
"""

import argparse
import json
import requests
import os
import base64
import time
from pathlib import Path
from urllib.parse import urlparse
from datetime import datetime

# Configuration
DEFAULT_WEBHOOK_URL = 'http://localhost:5678/webhook/video-transcription'
DEFAULT_OUTPUT_DIR = 'docs/test'


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


def get_video_id(url: str) -> str:
    """Extract video ID from YouTube URL or return filename."""
    if is_local_file(url):
        return Path(url).stem

    parsed = urlparse(url)
    if 'youtube.com' in parsed.netloc:
        from urllib.parse import parse_qs
        params = parse_qs(parsed.query)
        return params.get('v', ['unknown'])[0]
    elif 'youtu.be' in parsed.netloc:
        return parsed.path.strip('/')
    return 'video'


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


def call_extract_slides(video_source: str, webhook_url: str, quiet: bool = False) -> dict:
    """Call the extractSlides operation via n8n webhook."""

    if is_local_file(video_source):
        if not quiet:
            print(f"Loading local file: {video_source}")
        video_base64, mime_type = load_video_as_base64(video_source)
        payload = {
            'operation': 'extractSlides',
            'videoBase64': video_base64,
            'videoMimeType': mime_type,
        }
        if not quiet:
            print(f"File size: {len(video_base64) / 1024 / 1024:.2f} MB (base64)")
    else:
        payload = {
            'operation': 'extractSlides',
            'videoUrl': video_source,
        }

    if not quiet:
        print(f"Calling n8n webhook: {webhook_url}")
        print(f"Operation: extractSlides")
        print("-" * 50)

    response = requests.post(
        webhook_url,
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
        slide_types = metadata.get('slide_types_found', [])
        if slide_types:
            print(f"Types found: {', '.join(slide_types)}")

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
                print(f"    - {point}")
            if len(key_points) > 5:
                print(f"    ... and {len(key_points) - 5} more")

        if slide.get('description'):
            desc = slide.get('description')
            if len(desc) > 100:
                desc = desc[:100] + "..."
            print(f"  Description: {desc}")

        if slide.get('bounding_box'):
            print(f"  Bounding box: {slide.get('bounding_box')}")

    print("\n" + "=" * 60)


def main():
    parser = argparse.ArgumentParser(
        description='Test extractSlides operation via n8n webhook',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )

    parser.add_argument(
        'video_source',
        help='Video URL (YouTube, direct URL) or local file path'
    )

    parser.add_argument(
        '-f', '--file',
        dest='output_file',
        help=f'Output file path (default: {DEFAULT_OUTPUT_DIR}/slides_<video_id>_<timestamp>.json)'
    )

    parser.add_argument(
        '-w', '--webhook',
        default=os.getenv('N8N_WEBHOOK_URL', DEFAULT_WEBHOOK_URL),
        help=f'n8n webhook URL (default: {DEFAULT_WEBHOOK_URL})'
    )

    parser.add_argument(
        '-q', '--quiet',
        action='store_true',
        help='Quiet mode - only output JSON result'
    )

    args = parser.parse_args()

    # Validate video source
    if not is_valid_video_source(args.video_source):
        print(f"Error: Invalid video source: {args.video_source}")
        print("Provide a valid URL (http/https) or local file path")
        return 1

    if not args.quiet:
        print(f"Video source: {args.video_source}")

    try:
        # Track execution time
        start_time = time.time()

        result = call_extract_slides(args.video_source, args.webhook, args.quiet)

        # Calculate elapsed time
        elapsed_time = time.time() - start_time

        # Add execution metadata to result
        result['_execution'] = {
            'elapsed_seconds': round(elapsed_time, 2),
            'elapsed_formatted': f"{int(elapsed_time // 60)}m {int(elapsed_time % 60)}s",
            'timestamp': datetime.now().isoformat(),
            'video_source': args.video_source
        }

        # Generate output filename if not provided
        if not args.output_file:
            os.makedirs(DEFAULT_OUTPUT_DIR, exist_ok=True)
            video_id = get_video_id(args.video_source)
            timestamp_str = datetime.now().strftime('%Y%m%d_%H%M%S')
            args.output_file = f'{DEFAULT_OUTPUT_DIR}/slides_{video_id}_{timestamp_str}.json'

        # Save full result to file
        with open(args.output_file, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)

        if args.quiet:
            # Just print JSON
            print(json.dumps(result, indent=2, ensure_ascii=False))
        else:
            print(f"\nFull result saved to: {args.output_file}")

            # Print summary
            print_slides_summary(result)

            # Print processing metadata
            if 'metadata' in result:
                meta = result.get('metadata', {})
                print(f"\nProcessing metadata:")
                print(f"  Operation: {meta.get('operation', 'N/A')}")
                print(f"  Model: {meta.get('model', 'N/A')}")
                print(f"  Processed at: {meta.get('processedAt', 'N/A')}")

            # Print execution time
            print(f"\nExecution time: {result['_execution']['elapsed_formatted']} ({elapsed_time:.2f}s)")

        return 0

    except requests.exceptions.ConnectionError:
        print(f"Error: Cannot connect to {args.webhook}")
        print("Make sure n8n is running and the workflow is active")
        return 1
    except requests.exceptions.Timeout:
        print("Error: Request timed out (video processing took too long)")
        return 1
    except requests.exceptions.HTTPError as e:
        print(f"Error: HTTP {e.response.status_code}")
        print(e.response.text)
        return 1
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    exit(main())
