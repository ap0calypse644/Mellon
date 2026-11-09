#!/usr/bin/env python3
"""Download an explicitly selected NASA starfield image unmodified."""
from __future__ import annotations

import argparse
import hashlib
import io
import os
import tempfile
import time
import urllib.request
from pathlib import Path
from PIL import Image

# Intentionally limited to the selected official NASA photo, not arbitrary URLs.
SOURCE_URLS = (
    'https://assets.science.nasa.gov/dynamicimage/assets/science/missions/'
    'hubble/stars/star-cloud/Hubble_M24_1_flat_FINAL_A_rot90.jpg'
    '?crop=faces%2Cfocalpoint&fit=clip&h=2022&w=3775',
    'https://assets.science.nasa.gov/dynamicimage/assets/science/missions/'
    'hubble/stars/star-cloud/Hubble_M24_1_flat_FINAL_A_rot90.jpg',
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    data = None
    errors = []
    for url in SOURCE_URLS:
        for attempt in range(3):
            try:
                request = urllib.request.Request(url, headers={
                    'User-Agent': 'MellonStarfieldCatalog/1.0 (public image research)',
                    'Accept': 'image/jpeg,image/*;q=0.7',
                })
                with urllib.request.urlopen(request, timeout=40) as response:
                    result = response.read(30_000_001)
                if len(result) > 30_000_000:
                    raise ValueError('image exceeds 30 MB safety limit')
                with Image.open(io.BytesIO(result)) as image:
                    image.verify()
                with Image.open(io.BytesIO(result)) as image:
                    width, height = image.size
                    if min(width, height) < 1200:
                        raise ValueError(f'got thumbnail ({width}x{height}), not full image')
                    if image.format != 'JPEG':
                        raise ValueError('source did not return JPEG')
                data = result
                print(f'Selected NASA image: {url}')
                print(f'Size: {width} x {height}; compressed bytes: {len(data):,}')
                break
            except Exception as e:
                errors.append(f'{url} (try {attempt+1}): {type(e).__name__}: {e}')
                time.sleep(1 + attempt * 2)
        if data is not None:
            break
    if data is None:
        raise RuntimeError('Unable to download original NASA asset:\n' + '\n'.join(errors))
    fd, name = tempfile.mkstemp(prefix='.source-', dir=args.output.parent)
    try:
        with os.fdopen(fd, 'wb') as handle:
            handle.write(data)
        os.replace(name, args.output)
    finally:
        if os.path.exists(name):
            os.unlink(name)
    print(f'SHA256: {hashlib.sha256(data).hexdigest()}')
    print(f'File: {args.output}')


if __name__ == '__main__':
    main()
