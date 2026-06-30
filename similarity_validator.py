#!/usr/bin/env python3
"""
Similarity Validator
====================
Renders generated PPTX to images, compares against original slide images
using SSIM, and triggers retry loop for slides below threshold.

Pipeline:
  1) Render PPTX → PNG (LibreOffice headless)
  2) SSIM comparison per slide vs original
  3) Below threshold → diagnose → retry element_extractor
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np
from skimage.metrics import structural_similarity as ssim


def render_pptx_to_images(pptx_path: Path, output_dir: Path) -> list[Path]:
    """Render PPTX to PNG images using LibreOffice headless."""
    if not shutil.which("soffice"):
        print("[ERROR] LibreOffice not found. Install it or add soffice to PATH.")
        return []

    cmd = [
        "soffice",
        "--headless",
        "--convert-to", "png",
        "--outdir", str(output_dir),
        str(pptx_path),
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            print(f"  [WARN] LibreOffice render failed: {result.stderr.strip()}")
            return []
    except subprocess.TimeoutExpired:
        print("  [WARN] LibreOffice render timed out")
        return []
    except FileNotFoundError:
        print("  [WARN] soffice command not found")
        return []

    rendered = sorted(output_dir.glob("*.png"))
    return rendered


def compare_slides(original: Path, rendered: Path) -> dict:
    """Compute SSIM and difference heatmap between two images."""
    img_a = cv2.imread(str(original))
    img_b = cv2.imread(str(rendered))

    if img_a is None or img_b is None:
        return {"ssim": 0.0, "diagnosis": "failed to load images"}

    if img_a.shape != img_b.shape:
        img_b = cv2.resize(img_b, (img_a.shape[1], img_a.shape[0]))

    gray_a = cv2.cvtColor(img_a, cv2.COLOR_BGR2GRAY)
    gray_b = cv2.cvtColor(img_b, cv2.COLOR_BGR2GRAY)

    score, diff = ssim(gray_a, gray_b, full=True, data_range=255)
    diff = (1 - diff) * 255
    diff = diff.astype(np.uint8)

    _, thresh = cv2.threshold(diff, 50, 255, cv2.THRESH_BINARY)
    diff_pixels = int(cv2.countNonZero(thresh))
    total_pixels = thresh.size
    diff_ratio = diff_pixels / total_pixels if total_pixels > 0 else 1.0

    score = float(score)

    diagnosis_parts = []
    if score < 0.6:
        diagnosis_parts.append("severe mismatch")
    elif score < 0.85:
        diagnosis_parts.append("minor mismatch")

    if diff_ratio > 0.3:
        diagnosis_parts.append("large area differs")
    elif diff_ratio > 0.1:
        diagnosis_parts.append("partial area differs")

    if not diagnosis_parts:
        diagnosis_parts.append("acceptable")

    return {
        "ssim": round(score, 4),
        "diff_pixels": diff_pixels,
        "diff_ratio": round(diff_ratio, 4),
        "diagnosis": "; ".join(diagnosis_parts),
        "diff_heatmap_path": None,
    }


def create_heatmap(original: Path, rendered: Path, output_path: Path):
    """Save a difference heatmap image."""
    img_a = cv2.imread(str(original))
    img_b = cv2.imread(str(rendered))
    if img_a is None or img_b is None:
        return None

    if img_a.shape != img_b.shape:
        img_b = cv2.resize(img_b, (img_a.shape[1], img_a.shape[0]))

    gray_a = cv2.cvtColor(img_a, cv2.COLOR_BGR2GRAY)
    gray_b = cv2.cvtColor(img_b, cv2.COLOR_BGR2GRAY)

    _, diff = ssim(gray_a, gray_b, full=True, data_range=255)
    diff = (1 - diff) * 255
    diff = diff.astype(np.uint8)

    heatmap = cv2.applyColorMap(diff, cv2.COLORMAP_JET)
    overlay = cv2.addWeighted(img_a, 0.3, heatmap, 0.7, 0)
    cv2.imwrite(str(output_path), overlay)
    return output_path


def compare_all(
    slides_dir: Path,
    rendered_dir: Path,
    threshold: float,
) -> list[dict]:
    rendered_map = {}
    for r in rendered_dir.glob("*.png"):
        stem = r.stem
        parts = stem.split("_", 1)
        if parts:
            rendered_map[parts[0]] = r
        rendered_map[stem] = r

    results = []
    originals = sorted(slides_dir.glob("*.png"))

    for orig in originals:
        orig_stem = orig.stem
        match_key = orig_stem.split("_", 1)[0]
        rendered = rendered_map.get(orig_stem) or rendered_map.get(match_key)

        if not rendered:
            results.append({
                "slide": orig.name,
                "ssim": 0.0,
                "status": "missing_rendered",
                "diagnosis": "no matching rendered slide",
            })
            continue

        result = compare_slides(orig, rendered)

        result["slide"] = orig.name
        result["status"] = "pass" if result["ssim"] >= threshold else "fail"

        if result["ssim"] < threshold:
            heatmap_dir = rendered_dir / "diff_heatmaps"
            heatmap_dir.mkdir(parents=True, exist_ok=True)
            hm_path = heatmap_dir / f"{orig_stem}_diff.png"
            create_heatmap(orig, rendered, hm_path)
            result["diff_heatmap_path"] = str(hm_path)

        results.append(result)

    return results


def main():
    parser = argparse.ArgumentParser(
        description="Validate PPTX quality vs original slide images")
    parser.add_argument(
        "slides_dir",
        help="Directory with original slide images")
    parser.add_argument(
        "pptx_path",
        help="Path to generated PPTX file")
    parser.add_argument(
        "--threshold", type=float, default=0.85,
        help="SSIM threshold (default: 0.85)")
    parser.add_argument(
        "--retry-command", default=None,
        help="Command to retry extraction (e.g. 'python scripts/element_extractor.py ...')")
    parser.add_argument(
        "--max-retries", type=int, default=3,
        help="Maximum retry attempts per failed slide (default: 3)")
    parser.add_argument(
        "--output", "-o", default=None,
        help="Output directory for validation report")
    args = parser.parse_args()

    slides_dir = Path(args.slides_dir)
    pptx_path = Path(args.pptx_path)

    if not slides_dir.is_dir():
        print(f"[ERROR] Not a directory: {slides_dir}")
        sys.exit(1)
    if not pptx_path.exists():
        print(f"[ERROR] PPTX not found: {pptx_path}")
        sys.exit(1)

    output_dir = Path(args.output) if args.output else pptx_path.parent
    output_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="ssim_") as tmp_dir:
        rendered_dir = Path(tmp_dir)
        print(f"Rendering PPTX to images via LibreOffice...")
        rendered = render_pptx_to_images(pptx_path, rendered_dir)

        if not rendered:
            print("[ERROR] No slides rendered. Cannot validate.")
            sys.exit(1)

        print(f"  Rendered {len(rendered)} slide(s)")
        print(f"Comparing {len(rendered)} rendered slides with originals...")

        results = compare_all(slides_dir, rendered_dir, args.threshold)

    pass_count = sum(1 for r in results if r["status"] == "pass")
    fail_count = sum(1 for r in results if r["status"] == "fail")

    report = {
        "threshold": args.threshold,
        "total_slides": len(results),
        "passed": pass_count,
        "failed": fail_count,
        "pass_rate": round(pass_count / len(results), 4) if results else 0,
        "slides": results,
    }

    report_path = output_dir / "similarity_report.json"
    report_path.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8")

    print(f"\n--- Similarity Report ---")
    print(f"  Threshold:     {args.threshold}")
    print(f"  Total slides:  {len(results)}")
    print(f"  Passed:        {pass_count}")
    print(f"  Failed:        {fail_count}")
    print(f"  Pass rate:     {report['pass_rate']:.1%}")

    for r in results:
        ssim_val = r.get("ssim", 0)
        status_icon = "OK" if r["status"] == "pass" else "FAIL"
        diag = r.get("diagnosis", "")
        print(f"  [{status_icon}] {r['slide']}: SSIM={ssim_val:.4f}  {diag}")
        if r.get("diff_heatmap_path"):
            print(f"         heatmap: {r['diff_heatmap_path']}")

    print(f"\n  Report saved: {report_path}")

    if fail_count > 0 and args.retry_command:
        print(f"\n[RETRY] {fail_count} slides failed threshold. Running retry...")
        failed_slides = [r["slide"] for r in results if r["status"] == "fail"]
        for slide_name in failed_slides:
            print(f"  Retrying extraction for: {slide_name}")
            retry_cmd = f"{args.retry_command} --focus {slide_name}"
            try:
                subprocess.run(retry_cmd, shell=True, timeout=300)
            except Exception as e:
                print(f"  Retry failed: {e}")

    return 0 if fail_count == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
