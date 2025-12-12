#!/usr/bin/env python3
"""
Extract actual slide images using the GCP Cloud Function.

This script takes the metadata output from test_extract_slides.py and
calls the Cloud Function to extract the actual frames from the video.

Usage:
    python scripts/test/test_extract_slide_images.py <metadata_json> <video_url>

Examples:
    # Extract images from metadata file
    python scripts/test/test_extract_slide_images.py docs/test/slides_VIDEO_ID_20251212.json "https://..."

    # Save images to specific directory
    python scripts/test/test_extract_slide_images.py metadata.json "https://..." -o docs/test/slides/

    # Get base64 output instead of saving files
    python scripts/test/test_extract_slide_images.py metadata.json "https://..." --base64
"""

import argparse
import json
import requests
import os
import base64
import time
from pathlib import Path
from datetime import datetime

# Configuration
CLOUD_FUNCTION_URL = os.getenv(
    'EXTRACT_SLIDES_FUNCTION_URL',
    'https://europe-west1-n8n-genai-480909.cloudfunctions.net/extract-slides'
)


def get_auth_token() -> str:
    """Get GCP identity token for authenticated Cloud Function calls."""
    import subprocess
    try:
        result = subprocess.run(
            ['gcloud', 'auth', 'print-identity-token'],
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"Failed to get auth token: {e.stderr}")
    except FileNotFoundError:
        raise RuntimeError("gcloud CLI not found. Please install Google Cloud SDK.")


def load_metadata(json_path: str) -> dict:
    """Load slides metadata from JSON file."""
    with open(json_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def call_cloud_function(video_url: str, slides: list, output_type: str = 'base64',
                        bucket: str = None, prefix: str = '') -> dict:
    """Call the extract-slides Cloud Function."""

    # Get auth token
    token = get_auth_token()

    # Build payload
    payload = {
        'video_url': video_url,
        'slides': slides,
        'output': {
            'type': output_type
        }
    }

    if output_type == 'gcs' and bucket:
        payload['output']['bucket'] = bucket
        payload['output']['prefix'] = prefix

    print(f"Calling Cloud Function: {CLOUD_FUNCTION_URL}")
    print(f"Slides to extract: {len(slides)}")
    print("-" * 50)

    response = requests.post(
        CLOUD_FUNCTION_URL,
        json=payload,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {token}'
        },
        timeout=300  # 5 minutes
    )

    response.raise_for_status()
    return response.json()


def save_images(images: list, output_dir: str) -> list:
    """Save base64 images to files."""
    os.makedirs(output_dir, exist_ok=True)
    saved_files = []

    for img in images:
        if img.get('status') != 'success' or 'image_base64' not in img:
            continue

        slide_id = img.get('slide_id', 0)
        title = img.get('title', f'slide_{slide_id}')
        # Sanitize filename
        safe_title = "".join(c if c.isalnum() or c in ' -_' else '_' for c in title)[:50]

        filename = f"slide_{slide_id:03d}_{safe_title}.jpg"
        filepath = os.path.join(output_dir, filename)

        # Decode and save
        image_data = base64.b64decode(img['image_base64'])
        with open(filepath, 'wb') as f:
            f.write(image_data)

        saved_files.append({
            'slide_id': slide_id,
            'title': title,
            'file': filepath,
            'size_kb': len(image_data) / 1024
        })
        print(f"  Saved: {filename} ({len(image_data) / 1024:.1f} KB)")

    return saved_files


def main():
    parser = argparse.ArgumentParser(
        description='Extract slide images using GCP Cloud Function',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )

    parser.add_argument(
        'metadata_json',
        help='Path to slides metadata JSON (output from test_extract_slides.py)'
    )

    parser.add_argument(
        'video_url',
        nargs='?',
        help='Video URL (if not in metadata, or to override)'
    )

    parser.add_argument(
        '-o', '--output',
        dest='output_dir',
        default='docs/test/slide_images',
        help='Output directory for images (default: docs/test/slide_images)'
    )

    parser.add_argument(
        '--base64',
        action='store_true',
        help='Return base64 data instead of saving files'
    )

    parser.add_argument(
        '--gcs',
        metavar='BUCKET',
        help='Upload to GCS bucket instead of returning base64'
    )

    parser.add_argument(
        '--prefix',
        default='slides/',
        help='GCS prefix for uploaded files (default: slides/)'
    )

    parser.add_argument(
        '-q', '--quiet',
        action='store_true',
        help='Quiet mode - minimal output'
    )

    args = parser.parse_args()

    # Load metadata
    if not os.path.exists(args.metadata_json):
        print(f"Error: Metadata file not found: {args.metadata_json}")
        return 1

    metadata = load_metadata(args.metadata_json)

    # Get slides
    slides = metadata.get('slides', [])
    if not slides:
        print("Error: No slides found in metadata")
        return 1

    # Get video URL
    video_url = args.video_url
    if not video_url:
        # Try to get from metadata
        video_url = metadata.get('_execution', {}).get('video_source')
        if not video_url:
            video_url = metadata.get('metadata', {}).get('source')

    if not video_url:
        print("Error: No video URL provided and not found in metadata")
        print("Please provide the video URL as second argument")
        return 1

    if not args.quiet:
        print(f"Metadata file: {args.metadata_json}")
        print(f"Video URL: {video_url}")
        print(f"Slides to extract: {len(slides)}")

    # Prepare slides data for Cloud Function
    slides_data = []
    for slide in slides:
        slides_data.append({
            'id': slide.get('id'),
            'timestamp_ms': slide.get('timestamp_ms', 0),
            'title': slide.get('title', ''),
            'bounding_box': slide.get('bounding_box')
        })

    try:
        # Track time
        start_time = time.time()

        # Determine output type
        if args.gcs:
            output_type = 'gcs'
        else:
            output_type = 'base64'

        # Call Cloud Function
        result = call_cloud_function(
            video_url=video_url,
            slides=slides_data,
            output_type=output_type,
            bucket=args.gcs,
            prefix=args.prefix
        )

        elapsed_time = time.time() - start_time

        if not args.quiet:
            print(f"\nCloud Function response:")
            print(f"  Success: {result.get('success')}")
            print(f"  Extracted: {result.get('extracted', 0)}/{result.get('total_slides', 0)}")
            if result.get('failed', 0) > 0:
                print(f"  Failed: {result.get('failed')}")

        # Handle output
        images = result.get('images', [])

        if args.base64:
            # Just output JSON
            print(json.dumps(result, indent=2))
        elif args.gcs:
            # Show GCS URLs
            print("\nUploaded to GCS:")
            for img in images:
                if img.get('status') == 'success':
                    print(f"  Slide {img.get('slide_id')}: {img.get('url')}")
        else:
            # Save images locally
            print(f"\nSaving images to: {args.output_dir}")
            saved = save_images(images, args.output_dir)
            print(f"\nSaved {len(saved)} images")

        # Summary
        if not args.quiet:
            print(f"\nExecution time: {int(elapsed_time // 60)}m {int(elapsed_time % 60)}s ({elapsed_time:.2f}s)")

        return 0

    except requests.exceptions.HTTPError as e:
        print(f"Error: HTTP {e.response.status_code}")
        try:
            error_detail = e.response.json()
            print(json.dumps(error_detail, indent=2))
        except:
            print(e.response.text)
        return 1
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    exit(main())
