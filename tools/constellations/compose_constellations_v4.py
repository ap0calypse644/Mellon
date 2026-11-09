#!/usr/bin/env python3
"""Compose collision-free astronomical constellations from existing Mellon v3 matches.

Offline only: reads precomputed candidate JSON, never touches GNOME/VM.
Matching and star detection are deliberately NOT repeated. All vertices are
identical to detected source-image stars. No brightness preference is applied.
"""
from __future__ import annotations

import argparse
import json
import math
import random
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


@dataclass(frozen=True)
class Candidate:
    key: str
    index: int
    data: dict
    box: tuple[float, float, float, float]
    center: tuple[float, float]
    weight: float
    node_ids: frozenset[str]

    @property
    def uid(self) -> str:
        return f'{self.key}:{self.index}'


def validate_match(key: str, idx: int, match: dict) -> None:
    """Fail fast on corrupt matches; never silently accept invented vertices."""
    points = match['vertices']
    ids = match['star_ids']
    if len(points) != len(ids) or len(set(ids)) != len(ids):
        raise ValueError(f'{key}[{idx}]: duplicate or missing source-star IDs')
    if not points or any(len(p) != 2 or any(not math.isfinite(v) or v < 0 or v > 1
                                           for v in p) for p in points):
        raise ValueError(f'{key}[{idx}]: invalid normalized source coordinates')
    for edge in match['edges']:
        if (len(edge) != 2 or any(not isinstance(v, int) or v < 0 or v >= len(points)
                                  for v in edge) or edge[0] == edge[1]):
            raise ValueError(f'{key}[{idx}]: invalid graph edge')
    if not all(math.isfinite(float(match[field])) and float(match[field]) >= 0
               for field in ['rms_error_px', 'max_error_px']):
        raise ValueError(f'{key}[{idx}]: invalid fit error')


def match_score(m: dict, width: int, height: int) -> float:
    """Prioritize template geometry and an upright presentation; not brightness."""
    rms = float(m['rms_error_px'])
    maximum = float(m['max_error_px'])
    angle = abs((float(m['transform']['rotation_deg']) + 180) % 360 - 180)
    scale = float(m['transform']['scale_px'])
    size = max(0.0, min(1.0, scale / (min(width, height) * .57)))
    shape = math.exp(-rms / 5.0) * .78 + math.exp(-maximum / 10.0) * .22
    orientation = math.exp(-(angle / 75.0) ** 2)
    complexity = min(1.0, math.sqrt(len(m['vertices']) / 20.0))
    return 3.0 * shape + 1.5 * orientation + .30 * size + .25 * complexity


def box_of(points: list, width: int, height: int) -> tuple[float, float, float, float]:
    x = [p[0] * width for p in points]
    y = [p[1] * height for p in points]
    return min(x), min(y), max(x), max(y)


def boxes_collide(a, b, spacing: float) -> bool:
    """Conservative geometry exclusion; prevents overlapping shapes/edges."""
    return not (a[2] + spacing <= b[0] or b[2] + spacing <= a[0] or
                a[3] + spacing <= b[1] or b[3] + spacing <= a[1])


def build_pool(image: dict, width: int, height: int, args) -> tuple[list[Candidate], dict]:
    pool = []
    stats = Counter()
    protection = None
    if args.protect_center:
        protection = (width * .34, height * .28, width * .66, height * .74)
    for key, matches in sorted(image['template_matches'].items()):
        for index, match in enumerate(matches):
            stats['input'] += 1
            validate_match(key, index, match)
            if len(match['vertices']) < args.min_stars:
                stats['small_template'] += 1
                continue
            if match['rms_error_px'] > args.max_rms or match['max_error_px'] > args.max_vertex:
                stats['poor_geometry'] += 1
                continue
            box = box_of(match['vertices'], width, height)
            if protection is not None and boxes_collide(box, protection, args.spacing):
                stats['protected_center'] += 1
                continue
            center = ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)
            pool.append(Candidate(key, index, match, box, center,
                                  match_score(match, width, height),
                                  frozenset(match['star_ids'])))
            stats['eligible'] += 1
    # Keep high-quality but geometrically diverse variants per template.
    by_type = {}
    for item in sorted(pool, key=lambda c: (-c.weight, c.uid)):
        group = by_type.setdefault(item.key, [])
        if len(group) >= args.pool_per_template:
            continue
        # Avoid spending budget on near-duplicate instances of the same shape.
        if any(math.dist(item.center, prev.center) < 45 and
               boxes_collide(item.box, prev.box, 0) for prev in group):
            continue
        group.append(item)
    return [c for group in by_type.values() for c in group], dict(stats)


def compatible(candidate: Candidate, selected: list[Candidate], spacing: float) -> bool:
    for other in selected:
        if candidate.key == other.key or candidate.node_ids & other.node_ids:
            return False
        if boxes_collide(candidate.box, other.box, spacing):
            return False
    return True


def scene_score(group: list[Candidate], width: int, height: int,
                prior: Counter, prior_types: Counter, args) -> float:
    if not group:
        return -1.e12
    base = sum(c.weight - args.reuse_penalty * prior[c.uid]
               - args.template_reuse_penalty * prior_types[c.key]
               for c in group)
    # Encourage distinct, well-distributed astronomical figures.
    if len(group) > 1:
        separation = sum(math.dist(a.center, b.center) / math.hypot(width, height)
                         for j, a in enumerate(group) for b in group[j+1:])
        base += .60 * separation
    base += args.count_reward * len(group)
    if len(group) < args.target:
        base -= args.shortfall_penalty * (args.target - len(group))
    return base


def pick_scenes(pool: list[Candidate], width: int, height: int, args,
                *, seed: int) -> list[list[Candidate]]:
    """Multi-start randomized greedy global packing, with scene novelty."""
    if not pool:
        return []
    rng = random.Random(seed)
    prior = Counter()
    prior_types = Counter()
    seen_scenes = set()
    scenes: list[list[Candidate]] = []
    for scene_id in range(args.scenes):
        best, best_score = None, -1.e12
        for trial in range(args.trials):
            selected = []
            remaining = pool[:]
            # Randomized restarts explore alternatives to the highest-fit anchor.
            # Late trials use high-score anchors, early trials are more diverse.
            if trial % 4 != 0:
                rng.shuffle(remaining)
            remaining.sort(key=lambda c: -(c.weight - args.reuse_penalty * prior[c.uid]
                                            - args.template_reuse_penalty * prior_types[c.key]
                                            + (rng.random() - .5) * args.jitter))
            for item in remaining:
                if not compatible(item, selected, args.spacing):
                    continue
                selected.append(item)
                if len(selected) == args.target:
                    break
            signature = tuple(sorted(c.uid for c in selected))
            if signature in seen_scenes:
                continue
            value = scene_score(selected, width, height, prior, prior_types, args)
            if value > best_score:
                best, best_score = selected, value
        if not best:
            break
        scenes.append(best)
        seen_scenes.add(tuple(sorted(c.uid for c in best)))
        for chosen in best:
            prior[chosen.uid] += 1
            prior_types[chosen.key] += 1
    return scenes


def font(size: int):
    for path in ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
                 '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf']:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default()


def render_scene(bg: Path, scene: list[Candidate], out: Path, labels: bool) -> None:
    image = Image.open(bg).convert('RGB')
    canvas = Image.new('RGBA', image.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas, 'RGBA')
    colors = [(111, 212, 250), (202, 164, 255), (145, 242, 206),
              (255, 204, 136), (245, 143, 198), (182, 192, 255)]
    for i, candidate in enumerate(scene):
        c = colors[i % len(colors)]
        xy = [(round(v[0] * image.width), round(v[1] * image.height))
              for v in candidate.data['vertices']]
        for a, b in candidate.data['edges']:
            d.line((xy[a], xy[b]), fill=(*c, 202), width=2)
        for x, y in xy:
            d.ellipse((x-7, y-7, x+7, y+7), fill=(*c, 40))
            d.ellipse((x-3, y-3, x+3, y+3), fill=(235, 246, 255, 235))
        if labels:
            label = f'{candidate.key}  #{candidate.index + 1}  {candidate.data["rms_error_px"]:.1f}px'
            tx, ty = candidate.box[:2]
            d.rounded_rectangle((tx, max(0, ty-26), tx+250, max(0, ty-26)+25),
                                radius=4, fill=(6, 12, 26, 205))
            d.text((tx+7, max(0, ty-26)+4), label, fill=(*c, 255), font=font(13))
    result = Image.alpha_composite(image.convert('RGBA'), canvas).convert('RGB')
    out.parent.mkdir(parents=True, exist_ok=True)
    result.save(out, quality=91, optimize=True)


def contact_sheet(paths: list[Path], output: Path) -> None:
    thumbs = []
    for p in paths:
        with Image.open(p) as im:
            thumbs.append(im.convert('RGB').resize((640, 360), Image.Resampling.LANCZOS))
    if not thumbs:
        return
    cols = min(3, len(thumbs))
    rows = math.ceil(len(thumbs) / cols)
    board = Image.new('RGB', (cols*640, rows*360), (8, 11, 24))
    for i, im in enumerate(thumbs):
        board.paste(im, ((i % cols) * 640, (i // cols) * 360))
    board.save(output, quality=91)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--matches', type=Path, required=True, help='Full v3 matches-v3.json')
    ap.add_argument('--corpus', type=Path, default=Path('assets/starfield/corpus-v1/catalogs'))
    ap.add_argument('--output', type=Path, default=Path('constellation-benchmark-v4'))
    ap.add_argument('--scenes', type=int, default=6, help='Distinct scenes per image')
    ap.add_argument('--target', type=int, default=3, help='Maximum constellations per scene')
    ap.add_argument('--trials', type=int, default=600, help='Packing restarts per scene')
    ap.add_argument('--pool-per-template', type=int, default=15)
    ap.add_argument('--min-stars', type=int, default=9)
    ap.add_argument('--max-rms', type=float, default=7.0)
    ap.add_argument('--max-vertex', type=float, default=18.0)
    ap.add_argument('--spacing', type=float, default=48.0, help='Empty pixels between constellation bounding boxes')
    ap.add_argument('--jitter', type=float, default=2.7, help='Randomization for alternative scene selection')
    ap.add_argument('--reuse-penalty', type=float, default=1.8)
    ap.add_argument('--template-reuse-penalty', type=float, default=.85,
                    help='Favor different constellation names across scenes')
    ap.add_argument('--count-reward', type=float, default=2.5)
    ap.add_argument('--shortfall-penalty', type=float, default=2.0)
    ap.add_argument('--seed', type=int, default=20261109)
    ap.add_argument('--protect-center', action='store_true', help='Avoid central GNOME auth corridor (for the VM only)')
    ap.add_argument('--no-labels', action='store_true', help='Render clean previews without template labels')
    args = ap.parse_args()
    for key in ['scenes', 'target', 'trials', 'pool_per_template']:
        if getattr(args, key) <= 0:
            ap.error(f'--{key.replace("_", "-")} must be positive')
    if args.min_stars < 0 or args.spacing < 0 or args.max_rms <= 0:
        ap.error('Invalid geometric constraints')
    data = json.loads(args.matches.read_text())
    if data.get('schema') != 'mellon-constellation-matches-v3':
        ap.error('Expected an unmodified v3 matches file (schema mismatch)')
    args.output.mkdir(parents=True, exist_ok=True)
    images = {}
    overview = []
    for index, (name, image) in enumerate(sorted(data['images'].items())):
        bg = args.corpus / name / 'background-dim-16x9.jpg'
        if not bg.is_file():
            raise FileNotFoundError(f'Missing matching background: {bg}')
        with Image.open(bg) as im:
            width, height = im.size
        pool, counts = build_pool(image, width, height, args)
        scenes = pick_scenes(pool, width, height, args, seed=args.seed + index * 1009)
        out_scenes = []
        for n, group in enumerate(scenes):
            fn = f'scene-{n+1:02d}.jpg'
            render_scene(bg, group, args.output/name/fn, labels=not args.no_labels)
            if n == 0:
                overview.append(args.output/name/fn)
            out_scenes.append({
                'scene_id': n + 1,
                'constellation_count': len(group),
                'candidates': [{
                    'template': c.key,
                    'v3_instance_index': c.index,
                    'fit_score': round(c.weight, 4),
                    'star_ids': c.data['star_ids'],
                    'vertices': c.data['vertices'],
                    'edges': c.data['edges'],
                    'rms_error_px': c.data['rms_error_px'],
                    'rotation_deg': c.data['transform']['rotation_deg'],
                } for c in group],
            })
        images[name] = {'eligible_candidates': counts,
                        'pool_size': len(pool), 'scenes': out_scenes}
        print(f'{name:<22} {len(pool):>3} shortlisted / {len(scenes)} scenes; '
              f'constellations per scene: {[len(x) for x in scenes]}', flush=True)
    contact_sheet(overview, args.output/'overview-first-scenes.jpg')
    result = {'schema': 'mellon-constellation-compositions-v4',
              'source_v3_matches': str(args.matches),
              'note': 'QA proposals only; geometrically separate, visually unreviewed. Stars retain original IDs.',
              'parameters': {k: str(v) if isinstance(v, Path) else v for k,v in vars(args).items()},
              'images': images}
    (args.output/'compositions-v4.json').write_text(json.dumps(result, indent=2) + '\n')
    print('Wrote:', args.output/'compositions-v4.json')


if __name__ == '__main__':
    main()
