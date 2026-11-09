#!/usr/bin/env python3
"""Index six user-supplied Unsplash images in original and 16:9 coordinates.

The source images are user-provided files, not downloaded or synthesized stars.
Output is offline data: no GNOME/VM dependencies. Run from the Mellon repo root.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageDraw
from build_catalog import detect, make_graph

SOURCES = {
    "scott-lord-PiqZfESKt3k-unsplash.jpg": "rosy-rosette",
    "beat-schuler-9D2WUVsT9_I-unsplash.jpg": "cosmic-wings",
    "arnaud-girault-zWOgtUIX7OE-unsplash.jpg": "blue-gold-nebula",
    "aldebaran-s-qtRF_RxCAo0-unsplash.jpg": "chromatic-nebula",
    "scott-lord-KLFP4HwaXyk-unsplash.jpg": "veiled-ring",
    "wallace-henry-qW_OmkbDJVQ-unsplash.jpg": "dust-cloud",
}
WIDTH, HEIGHT = 1920, 1080

def prepare(image):
    width, height = image.size
    rotation = 90 if width / height < .96 else 0
    rotated = (image.transpose(Image.Transpose.ROTATE_270)
               if rotation else image)
    rw, rh = rotated.size
    if rw / rh >= WIDTH / HEIGHT:
        ch = rh
        cw = math.floor(ch * WIDTH / HEIGHT)
    else:
        cw = rw
        ch = math.floor(cw * HEIGHT / WIDTH)
    cx, cy = (rw - cw) // 2, (rh - ch) // 2
    crop = [cx, cy, cx + cw, cy + ch]
    result = rotated.crop(crop).resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
    return result, rotation, crop, [rw, rh]

def project(star, source_size, rotation, crop):
    x, y = star["px"], star["py"]
    if rotation:
        x, y = source_size[1] - 1 - y, x
    left, top, right, bottom = crop
    if not (left <= x < right and top <= y < bottom):
        return None
    nx = (x - left) / (right - left)
    ny = (y - top) / (bottom - top)
    return {
        "id": star["id"],
        "x": round(nx, 7), "y": round(ny, 7),
        "px": round(nx * WIDTH, 2), "py": round(ny * HEIGHT, 2),
        "source_px": star["px"], "source_py": star["py"],
        "prominence": star["prominence"],
        "brightness": star["brightness"], "radius_px": star["radius_px"],
        "rgb": star["rgb"], "quality_score": star["quality_score"],
    }

def curate(items, count=750, minimum=15):
    # Pick only real detected coordinates; never synthesize a point.
    buckets = defaultdict(list)
    for star in items:
        if star["quality_score"] < .79 or star["prominence"] < 8.5:
            continue
        strength = (.85 * star["quality_score"]
                    + .65 * min(1., star["prominence"] / 50.)
                    + .1 * min(1., star["brightness"]))
        bucket = (min(11, int(star["x"] * 12)),
                  min(6, int(star["y"] * 7)))
        buckets[bucket].append((strength, star))
    for values in buckets.values():
        values.sort(key=lambda row: -row[0])
    selected = []
    for round_index in range(17):
        options = []
        for key, values in buckets.items():
            if round_index < len(values):
                options.append((values[round_index][0], key,
                                values[round_index][1]))
        options.sort(key=lambda row: -row[0])
        for _, _, star in options:
            if len(selected) >= count:
                break
            if any((star["px"] - s["px"]) ** 2 +
                   (star["py"] - s["py"]) ** 2 < minimum ** 2
                   for s in selected[-320:]):
                continue
            selected.append(star)
        if len(selected) >= count:
            break
    result = []
    for star in selected:
        if all((star["px"] - s["px"]) ** 2 +
               (star["py"] - s["py"]) ** 2 >= minimum ** 2
               for s in result):
            result.append(star)
    return sorted(result, key=lambda star: (star["py"], star["px"]))

def checksum(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def write(path, content):
    path.write_text(json.dumps(content, separators=(",", ":")) + "\n")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=Path, required=True,
                    help="Directory holding exact six source JPEGs")
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--threshold", type=float, default=6.2)
    ap.add_argument("--min-separation", type=float, default=6.)
    ap.add_argument("--curated-count", type=int, default=750)
    ap.add_argument("--dim-factor", type=float, default=.44)
    a = ap.parse_args()
    if not (0 < a.dim_factor <= 1):
        ap.error("dim-factor must be in (0,1]")
    a.output.mkdir(parents=True, exist_ok=True)
    report = []
    for filename, name in SOURCES.items():
        source = a.input / filename
        if not source.is_file():
            raise RuntimeError(f"Missing source JPEG: {source}")
        image = Image.open(source).convert("RGB")
        size = list(image.size)
        raw = detect(np.asarray(image), a.threshold, a.min_separation,
                     30000)
        view, rotation, crop, rotated_size = prepare(image)
        transformed = []
        for item in raw:
            projected = project(item, size, rotation, crop)
            if projected is not None:
                transformed.append(projected)
        chosen = curate(transformed, a.curated_count)
        if len(chosen) < 300:
            raise RuntimeError(f"Insufficient candidates: {name}")
        out = a.output / name
        out.mkdir(parents=True, exist_ok=True)
        view.save(out / "background-16x9.jpg", quality=93,
                  subsampling=0, optimize=True)
        dim = ImageEnhance.Brightness(view).enhance(a.dim_factor)
        dim.save(out / "background-dim-16x9.jpg", quality=93,
                 subsampling=0, optimize=True)
        qa = dim.copy()
        pen = ImageDraw.Draw(qa)
        for star in chosen:
            x, y = star["px"], star["py"]
            pen.ellipse((x-2.5, y-2.5, x+2.5, y+2.5),
                        outline="#52ffb9", width=1)
        qa.save(out / "qa-curated.jpg", quality=90, optimize=True)
        source_sha = checksum(source)
        dim_sha = checksum(out / "background-dim-16x9.jpg")
        graph = make_graph(chosen, 8, 280)
        write(out / "stars-all.json", {
            "schema": "mellon-multifield-v1", "source_sha256": source_sha,
            "source_size": size, "coordinate_space": "original",
            "stars": raw,
        })
        write(out / "stars-curated.json", {
            "schema": "mellon-multifield-v1", "image_sha256": dim_sha,
            "image_size": [WIDTH, HEIGHT],
            "coordinate_space": "16:9 rotation+crop normalized",
            "stars": chosen,
        })
        write(out / "graph-curated.json", graph)
        meta = {
            "schema": "mellon-multifield-v1", "name": name,
            "source_filename": filename, "source_sha256": source_sha,
            "source_width": size[0], "source_height": size[1],
            "transform": {
                "clockwise_degrees": rotation,
                "rotated_size": rotated_size, "crop_box_rotated": crop,
                "output_size": [WIDTH, HEIGHT],
                "resize": "Lanczos", "stretch": False,
            },
            "dim_factor": a.dim_factor,
            "background_sha256": checksum(out / "background-16x9.jpg"),
            "dimmed_background_sha256": dim_sha,
            "original_detected_features": len(raw),
            "features_in_crop": len(transformed),
            "curated_features": len(chosen),
            "graph_edges": len(graph["edges"]),
            "method": "DoG local maxima, morphology, quality filter, stratified selection",
            "limitation": "Luminous image features may include JPEG artifacts/nebula details.",
        }
        (out / "metadata.json").write_text(json.dumps(meta, indent=2) + "\n")
        report.append({"name": name, "source_size": size,
                       "detected": len(raw), "curated": len(chosen),
                       "graph_edges": len(graph["edges"])})
        print(name, len(raw), "candidates;", len(chosen),
              "curated;", len(graph["edges"]), "edges")
    (a.output / "summary.json").write_text(json.dumps({
        "schema": "mellon-multifield-v1", "images": report,
    }, indent=2) + "\n")

if __name__ == "__main__":
    main()
