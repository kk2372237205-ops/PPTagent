"""Local image-to-PPT component extractor.

The service deliberately has no cloud credential.  It receives semantic boxes from
the application, creates transparent foreground candidates with GrabCut, and
returns a background plus alternative component variants for employee review.
When SAM3 is installed by the optional setup command, this file is the stable
local HTTP boundary where the higher-quality mask adapter is loaded.
"""

import base64
import json
import os
import math
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2
import numpy as np

HOST = os.getenv("COMPONENT_EXTRACTOR_HOST", "127.0.0.1")
PORT = int(os.getenv("COMPONENT_EXTRACTOR_PORT", "8765"))
_PADDLE_OCR = None
_PADDLE_ERROR = ""
_SAM3_IMPORT_ERROR = ""
_SAM3_PROCESSOR = None
_GSAM2_IMPORT_ERROR = ""
_GSAM2_PREDICTOR = None


def gpu_runtime_status():
    """Report the real runtime state without calling a CPU path "GPU".

    The production adapter is intentionally separate from this probe: a CUDA
    capable PyTorch installation alone does not improve GrabCut.  It becomes
    useful only when a validated segmentation model uses it.
    """
    requested = os.getenv("COMPONENT_EXTRACTOR_DEVICE", "auto").lower()
    try:
        import torch  # type: ignore
        available = bool(torch.cuda.is_available())
        device_name = torch.cuda.get_device_name(0) if available else ""
        return {
            "requested": requested,
            "available": available,
            "active": "cuda:0" if available and requested != "cpu" else "cpu",
            "name": device_name,
            "torch": str(torch.__version__),
            "cuda": str(torch.version.cuda or ""),
            "reason": "CUDA runtime is ready for a segmentation adapter." if available else "CUDA PyTorch is not ready; using CPU-safe fallback."
        }
    except Exception as error:
        return {
            "requested": requested,
            "available": False,
            "active": "cpu",
            "name": "",
            "torch": "",
            "cuda": "",
            "reason": f"CUDA PyTorch is unavailable: {str(error)[:160]}"
        }

def segmentation_backend_status():
    """Expose the segmentation adapter decision without pretending SAM3 works.

    The product calls this service through a stable HTTP contract.  SAM3 is a
    future plug-in behind that contract and may only become active after its
    official license, checkpoint and CUDA runtime have been verified.
    """
    requested = os.getenv("COMPONENT_EXTRACTOR_BACKEND", "auto").lower()
    gpu = gpu_runtime_status()
    checkpoint = os.getenv("SAM3_CHECKPOINT", "").strip()
    hf_requested = os.getenv("SAM3_LOAD_FROM_HF", "0").lower() in {"1", "true", "yes"}
    sam3_status = {
        "installed": False,
        "builderImport": False,
        "checkpoint": checkpoint,
        "checkpointReady": bool(checkpoint and os.path.exists(checkpoint)),
        "hfRequested": hf_requested,
        "error": "",
    }
    sam2_checkpoint = os.getenv("SAM2_CHECKPOINT", "").strip()
    sam2_cfg = os.getenv("SAM2_MODEL_CFG", "").strip()
    gsam2_status = {
        "installed": False,
        "builderImport": False,
        "checkpoint": sam2_checkpoint,
        "checkpointReady": bool(sam2_checkpoint and os.path.exists(sam2_checkpoint)),
        "modelCfg": sam2_cfg,
        "modelCfgReady": bool(sam2_cfg and (os.path.exists(sam2_cfg) or sam2_cfg.startswith("configs/"))),
        "grounder": os.getenv("GROUNDED_SAM2_GROUNDER", "vision-boxes"),
        "error": "",
    }
    if requested in {"sam3", "auto"}:
        try:
            import sam3  # type: ignore  # installed only by the approved GPU setup
            from sam3.model_builder import build_sam3_image_model  # type: ignore
            sam3_status["installed"] = True
            sam3_status["builderImport"] = callable(build_sam3_image_model)
            if gpu["available"] and (sam3_status["checkpointReady"] or hf_requested):
                return {
                    "requested": requested,
                    "active": "sam3-configured",
                    "device": gpu,
                    "sam3": sam3_status,
                    "reason": "SAM3 package, CUDA and weight access are configured; the extractor will try SAM3 first and fall back to OpenCV if inference fails."
                }
            return {
                "requested": requested,
                "active": "opencv",
                "device": gpu,
                "sam3": sam3_status,
                "reason": "SAM3 package is installed, but weights are not configured yet; using OpenCV until SAM3_CHECKPOINT or approved Hugging Face loading is available."
            }
        except Exception as error:
            sam3_status["error"] = str(error)[:220]
            if requested == "sam3":
                return {
                    "requested": requested,
                    "active": "opencv",
                    "device": gpu,
                    "sam3": sam3_status,
                    "groundedSam2": gsam2_status,
                    "reason": "SAM3 was requested but its package or weights are not ready; using OpenCV fallback."
                }
    if requested in {"grounded-sam2", "gsam2", "sam2", "auto"}:
        try:
            from sam2.build_sam import build_sam2  # type: ignore
            from sam2.sam2_image_predictor import SAM2ImagePredictor  # type: ignore
            gsam2_status["installed"] = True
            gsam2_status["builderImport"] = callable(build_sam2) and callable(SAM2ImagePredictor)
            if gpu["available"] and gsam2_status["checkpointReady"] and gsam2_status["modelCfgReady"]:
                return {
                    "requested": requested,
                    "active": "grounded-sam2-configured",
                    "device": gpu,
                    "sam3": sam3_status,
                    "groundedSam2": gsam2_status,
                    "reason": "Grounded-SAM2/SAM2 package, CUDA and checkpoint are configured; the extractor will use semantic boxes as grounding and SAM2 for masks."
                }
            if requested in {"grounded-sam2", "gsam2", "sam2"}:
                return {
                    "requested": requested,
                    "active": "opencv",
                    "device": gpu,
                    "sam3": sam3_status,
                    "groundedSam2": gsam2_status,
                    "reason": "Grounded-SAM2 was requested, but SAM2 checkpoint/config or CUDA is not ready; using OpenCV fallback."
                }
        except Exception as error:
            gsam2_status["error"] = str(error)[:220]
            if requested in {"grounded-sam2", "gsam2", "sam2"}:
                return {
                    "requested": requested,
                    "active": "opencv",
                    "device": gpu,
                    "sam3": sam3_status,
                    "groundedSam2": gsam2_status,
                    "reason": "Grounded-SAM2 was requested, but its Python package is not importable; using OpenCV fallback."
                }
    return {
        "requested": requested,
        "active": "opencv",
        "device": gpu,
        "sam3": sam3_status,
        "groundedSam2": gsam2_status,
        "reason": "Using the dependable OpenCV baseline until a licensed GPU segmentation adapter is validated. GrabCut itself is CPU-only."
    }


def png_data(image):
    ok, encoded = cv2.imencode(".png", image)
    if not ok:
        raise ValueError("PNG 编码失败")
    return base64.b64encode(encoded.tobytes()).decode("ascii")


def clamp(value, low, high):
    return max(low, min(high, value))


def rect_from_box(box, width, height, pad=0.02):
    x, y, w, h = [float(value) for value in (box or [0, 0, 1000, 1000])]
    x0 = clamp(int((x / 1000.0 - pad) * width), 0, width - 1)
    y0 = clamp(int((y / 1000.0 - pad) * height), 0, height - 1)
    x1 = clamp(int(((x + w) / 1000.0 + pad) * width), x0 + 1, width)
    y1 = clamp(int(((y + h) / 1000.0 + pad) * height), y0 + 1, height)
    return x0, y0, x1, y1


def component_kind(component):
    return str((component or {}).get("kind") or "object").lower()


def component_pad(component, purpose="mask"):
    """Use tighter boxes for SAM prompts and slightly looser crops for glow.

    The previous fixed 2% padding made SAM see too much background, especially
    on blue tech pages where objects, glow, code and gradients share colors.
    """
    kind = component_kind(component)
    if purpose == "mask":
        if kind in {"title-art", "wordart", "logo", "icon", "line", "decoration"}:
            return 0.004
        if kind in {"card", "panel", "frame"}:
            return 0.008
        if kind in {"subject", "vehicle", "product", "person", "robot"}:
            return 0.012
        return 0.01
    if kind in {"title-art", "wordart"}:
        return 0.012
    if kind in {"subject", "vehicle", "product", "person", "robot"}:
        return 0.018
    if kind in {"card", "panel", "frame"}:
        return 0.01
    return 0.008


def mask_bounds(alpha, threshold=16):
    if alpha is None or alpha.size == 0:
        return None
    ys, xs = np.where(alpha > threshold)
    if len(xs) == 0 or len(ys) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def cleanup_alpha(alpha, kind):
    if alpha is None or alpha.size == 0:
        return alpha
    alpha = np.asarray(alpha).astype(np.uint8)
    _, binary = cv2.threshold(alpha, 18, 255, cv2.THRESH_BINARY)
    if kind in {"card", "panel", "frame", "title-art", "wordart"}:
        binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8), iterations=1)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
    if count <= 1:
        return cv2.GaussianBlur(binary, (3, 3), 0)
    image_area = max(1, alpha.shape[0] * alpha.shape[1])
    # SAM-family masks for PPT assets are often made of many separated glowing
    # pieces: Chinese title strokes, robot joints, train lines, UI card borders.
    # The old cleaner kept only a handful of connected components, which made
    # good masks look "broken" after cleanup.  Keep more real fragments and use
    # smaller minimum areas for complex visual assets.
    min_ratio = {
        "title-art": 0.00018,
        "wordart": 0.00018,
        "subject": 0.00025,
        "vehicle": 0.00025,
        "product": 0.00025,
        "person": 0.00025,
        "robot": 0.00025,
        "line": 0.00012,
        "decoration": 0.00012,
        "card": 0.00035,
        "panel": 0.00035,
        "frame": 0.00025,
    }.get(kind, 0.0005)
    min_area = max(4, int(image_area * min_ratio))
    areas = [(label, int(stats[label, cv2.CC_STAT_AREA])) for label in range(1, count)]
    areas.sort(key=lambda item: item[1], reverse=True)
    if kind in {"subject", "vehicle", "product", "person", "robot"}:
        keep = {label for label, area in areas[:40] if area >= min_area}
    elif kind in {"title-art", "wordart"}:
        keep = {label for label, area in areas[:64] if area >= min_area}
    elif kind in {"card", "panel", "frame"}:
        keep = {label for label, area in areas[:36] if area >= min_area}
    else:
        keep = {label for label, area in areas[:18] if area >= min_area}
    if not keep and areas:
        keep = {areas[0][0]}
    cleaned = np.where(np.isin(labels, list(keep)), 255, 0).astype(np.uint8)
    return cv2.GaussianBlur(cleaned, (3, 3), 0)


def trim_rgba_to_alpha(rgba, x0, y0, full_width, full_height, kind):
    if rgba is None or rgba.ndim != 3 or rgba.shape[2] < 4:
        return rgba, x0, y0
    bounds = mask_bounds(rgba[:, :, 3])
    if bounds is None:
        return rgba, x0, y0
    bx0, by0, bx1, by1 = bounds
    margin = 4 if kind in {"title-art", "wordart", "subject", "vehicle", "product", "person", "robot"} else 2
    bx0 = max(0, bx0 - margin)
    by0 = max(0, by0 - margin)
    bx1 = min(rgba.shape[1], bx1 + margin)
    by1 = min(rgba.shape[0], by1 + margin)
    nx0 = clamp(x0 + bx0, 0, full_width - 1)
    ny0 = clamp(y0 + by0, 0, full_height - 1)
    return rgba[by0:by1, bx0:bx1], nx0, ny0


def alpha_quality(alpha, kind):
    bounds = mask_bounds(alpha)
    if bounds is None:
        return 0.0, True
    area_ratio = float(np.count_nonzero(alpha > 18) / max(1, alpha.shape[0] * alpha.shape[1]))
    bx0, by0, bx1, by1 = bounds
    bbox_ratio = ((bx1 - bx0) * (by1 - by0)) / max(1, alpha.shape[0] * alpha.shape[1])
    too_tiny = area_ratio < (0.002 if kind in {"line", "decoration"} else 0.006)
    too_huge = bbox_ratio > 0.96 and kind not in {"background", "card", "panel"}
    return area_ratio, bool(too_tiny or too_huge)


def grabcut_rgba(crop):
    height, width = crop.shape[:2]
    if min(width, height) < 12:
        alpha = np.full((height, width), 255, dtype=np.uint8)
    else:
        mask = np.zeros((height, width), np.uint8)
        background = np.zeros((1, 65), np.float64)
        foreground = np.zeros((1, 65), np.float64)
        try:
            cv2.grabCut(crop, mask, (2, 2, max(1, width - 4), max(1, height - 4)), background, foreground, 3, cv2.GC_INIT_WITH_RECT)
            alpha = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
            alpha = cv2.GaussianBlur(alpha, (3, 3), 0)
        except cv2.error:
            alpha = np.full((height, width), 255, dtype=np.uint8)
    return np.dstack((crop, alpha))


def _sam3_prompt_for_component(component):
    """Return a conservative prompt for SAM3's text path.

    The box prompt is the primary signal for PPT assets because many labels are
    Chinese and Open vocabulary text grounding can be brittle.  Text prompts are
    used only when the component already supplies an ASCII maskHint.
    """
    hint = str(component.get("maskHint") or "").strip()
    if hint and len(hint) <= 80 and all(ord(ch) < 128 for ch in hint):
        return hint
    kind = str(component.get("kind") or "").lower()
    fallback = {
        "subject": "main object",
        "title-art": "decorative title text",
        "wordart": "decorative title text",
        "frame": "decorative frame",
        "card": "information card",
        "panel": "information panel",
        "icon": "icon",
        "decoration": "decorative element",
    }.get(kind, "")
    return fallback if os.getenv("COMPONENT_EXTRACTOR_SAM3_USE_KIND_PROMPT", "0").lower() in {"1", "true", "yes"} else ""


def load_sam3_processor():
    """Load SAM3 lazily after weights have been explicitly configured."""
    global _SAM3_PROCESSOR, _SAM3_IMPORT_ERROR
    if _SAM3_PROCESSOR is not None:
        return _SAM3_PROCESSOR
    checkpoint = os.getenv("SAM3_CHECKPOINT", "").strip()
    hf_requested = os.getenv("SAM3_LOAD_FROM_HF", "0").lower() in {"1", "true", "yes"}
    if not checkpoint and not hf_requested:
        return None
    if checkpoint and not os.path.exists(checkpoint):
        _SAM3_IMPORT_ERROR = f"SAM3_CHECKPOINT does not exist: {checkpoint}"
        return None
    try:
        import torch  # type: ignore
        if not torch.cuda.is_available() and os.getenv("COMPONENT_EXTRACTOR_DEVICE", "auto").lower() != "cpu":
            _SAM3_IMPORT_ERROR = "SAM3 requires CUDA for this workflow; CUDA is not available."
            return None
        from sam3.model.sam3_image_processor import Sam3Processor  # type: ignore
        from sam3.model_builder import build_sam3_image_model  # type: ignore
        device = "cuda" if torch.cuda.is_available() and os.getenv("COMPONENT_EXTRACTOR_DEVICE", "auto").lower() != "cpu" else "cpu"
        model = build_sam3_image_model(
            checkpoint_path=checkpoint or None,
            load_from_HF=bool(hf_requested and not checkpoint),
            device=device,
            eval_mode=True,
            compile=False,
        )
        threshold = float(os.getenv("COMPONENT_EXTRACTOR_SAM3_CONFIDENCE", "0.35"))
        _SAM3_PROCESSOR = Sam3Processor(model, device=device, confidence_threshold=threshold)
        _SAM3_IMPORT_ERROR = ""
        return _SAM3_PROCESSOR
    except Exception as error:
        _SAM3_IMPORT_ERROR = str(error)[:300]
        _SAM3_PROCESSOR = None
        return None


def _mask_overlap_score(mask, x0, y0, x1, y1):
    if mask is None or mask.size == 0:
        return 0.0
    height, width = mask.shape[:2]
    x0, y0, x1, y1 = clamp(x0, 0, width - 1), clamp(y0, 0, height - 1), clamp(x1, 1, width), clamp(y1, 1, height)
    rect_area = max(1, (x1 - x0) * (y1 - y0))
    inside = float(np.count_nonzero(mask[y0:y1, x0:x1]))
    total = float(np.count_nonzero(mask))
    if total <= 0:
        return 0.0
    return 0.72 * (inside / total) + 0.28 * min(1.0, inside / rect_area)


def sam3_component_masks(source, components, width, height):
    """Try SAM3 once per image and return full-image alpha masks by component index."""
    processor = load_sam3_processor()
    if processor is None:
        return {}
    try:
        from PIL import Image  # type: ignore
        import torch  # type: ignore
        rgb = cv2.cvtColor(source, cv2.COLOR_BGR2RGB)
        pil_image = Image.fromarray(rgb)
        device_type = "cuda" if torch.cuda.is_available() and os.getenv("COMPONENT_EXTRACTOR_DEVICE", "auto").lower() != "cpu" else "cpu"
        autocast_enabled = device_type == "cuda"
        with torch.inference_mode(), torch.autocast(device_type="cuda", dtype=torch.bfloat16, enabled=autocast_enabled):
            base_state = processor.set_image(pil_image)
        masks = {}
        use_text = os.getenv("COMPONENT_EXTRACTOR_SAM3_USE_TEXT", "0").lower() in {"1", "true", "yes"}
        for index, component in enumerate(components[:18]):
            kind = str(component.get("kind") or "").lower()
            if kind in {"group", "panel-group"}:
                continue
            x0, y0, x1, y1 = rect_from_box(component.get("box"), width, height, component_pad(component, "mask"))
            state = dict(base_state)
            prompt = _sam3_prompt_for_component(component) if use_text else ""
            with torch.inference_mode(), torch.autocast(device_type="cuda", dtype=torch.bfloat16, enabled=autocast_enabled):
                if prompt:
                    state = processor.set_text_prompt(prompt=prompt, state=state)
                cx = ((x0 + x1) / 2) / width
                cy = ((y0 + y1) / 2) / height
                bw = (x1 - x0) / width
                bh = (y1 - y0) / height
                state = processor.add_geometric_prompt([cx, cy, bw, bh], True, state)
            raw_masks = state.get("masks")
            if raw_masks is None or len(raw_masks) == 0:
                continue
            raw_scores = state.get("scores")
            best_mask, best_score = None, -1.0
            for mask_index in range(int(raw_masks.shape[0])):
                mask = raw_masks[mask_index].squeeze()
                if hasattr(mask, "detach"):
                    mask = mask.detach().to("cpu").numpy()
                mask = np.asarray(mask).astype(bool)
                score = _mask_overlap_score(mask, x0, y0, x1, y1)
                area_ratio, low_quality = alpha_quality(mask.astype(np.uint8) * 255, kind)
                score += 0.08 if 0.015 <= area_ratio <= 0.72 else -0.08
                if low_quality:
                    score -= 0.18
                if raw_scores is not None:
                    score += 0.08 * float(raw_scores[mask_index].detach().to("cpu").item() if hasattr(raw_scores[mask_index], "detach") else raw_scores[mask_index])
                if score > best_score:
                    best_mask, best_score = mask, score
            if best_mask is None:
                continue
            alpha = cleanup_alpha(best_mask.astype(np.uint8) * 255, kind)
            masks[index] = alpha
        return masks
    except Exception as error:
        global _SAM3_IMPORT_ERROR
        _SAM3_IMPORT_ERROR = str(error)[:300]
        try:
            import torch  # type: ignore
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass
        return {}


def load_grounded_sam2_predictor():
    """Load the legal Grounded-SAM2 fallback lazily.

    In this product, grounding is already supplied by the visual layer planner
    as semantic boxes.  When GroundingDINO/Florence-2 are installed later, they
    can improve those boxes before this point; SAM2 is the mask executor here.
    """
    global _GSAM2_PREDICTOR, _GSAM2_IMPORT_ERROR
    if _GSAM2_PREDICTOR is not None:
        return _GSAM2_PREDICTOR
    checkpoint = os.getenv("SAM2_CHECKPOINT", "").strip()
    model_cfg = os.getenv("SAM2_MODEL_CFG", "").strip()
    if not checkpoint or not model_cfg:
        return None
    if checkpoint and not os.path.exists(checkpoint):
        _GSAM2_IMPORT_ERROR = f"SAM2_CHECKPOINT does not exist: {checkpoint}"
        return None
    if model_cfg and not os.path.exists(model_cfg) and not model_cfg.startswith("configs/"):
        _GSAM2_IMPORT_ERROR = f"SAM2_MODEL_CFG does not exist: {model_cfg}"
        return None
    try:
        import torch  # type: ignore
        if not torch.cuda.is_available() and os.getenv("COMPONENT_EXTRACTOR_DEVICE", "auto").lower() != "cpu":
            _GSAM2_IMPORT_ERROR = "Grounded-SAM2/SAM2 requires CUDA for this workflow; CUDA is not available."
            return None
        from sam2.build_sam import build_sam2  # type: ignore
        from sam2.sam2_image_predictor import SAM2ImagePredictor  # type: ignore
        device = "cuda" if torch.cuda.is_available() and os.getenv("COMPONENT_EXTRACTOR_DEVICE", "auto").lower() != "cpu" else "cpu"
        model = build_sam2(model_cfg, checkpoint, device=device)
        _GSAM2_PREDICTOR = SAM2ImagePredictor(model)
        _GSAM2_IMPORT_ERROR = ""
        return _GSAM2_PREDICTOR
    except Exception as error:
        _GSAM2_IMPORT_ERROR = str(error)[:300]
        _GSAM2_PREDICTOR = None
        return None


def grounded_sam2_component_masks(source, components, width, height):
    predictor = load_grounded_sam2_predictor()
    if predictor is None:
        return {}
    try:
        rgb = cv2.cvtColor(source, cv2.COLOR_BGR2RGB)
        predictor.set_image(rgb)
        masks = {}
        min_score = float(os.getenv("GROUNDED_SAM2_MIN_SCORE", "0.0"))
        for index, component in enumerate(components[:18]):
            kind = str(component.get("kind") or "").lower()
            if kind in {"group", "panel-group"}:
                continue
            x0, y0, x1, y1 = rect_from_box(component.get("box"), width, height, component_pad(component, "mask"))
            box = np.array([x0, y0, x1, y1], dtype=np.float32)
            raw_masks, raw_scores, _ = predictor.predict(box=box, multimask_output=True)
            if raw_masks is None or len(raw_masks) == 0:
                continue
            best_mask, best_score = None, -1.0
            for mask, score in zip(raw_masks, raw_scores if raw_scores is not None else [0] * len(raw_masks)):
                mask = np.asarray(mask).astype(bool)
                overlap = _mask_overlap_score(mask, x0, y0, x1, y1)
                area_ratio, low_quality = alpha_quality(mask.astype(np.uint8) * 255, kind)
                area_bonus = 0.08 if 0.015 <= area_ratio <= 0.72 else -0.08
                combined = overlap + area_bonus + 0.12 * float(score)
                if low_quality:
                    combined -= 0.18
                if combined > best_score:
                    best_mask, best_score = mask, combined
            if best_mask is None or best_score < min_score:
                continue
            alpha = (best_mask.astype(np.uint8) * 255)
            alpha = cleanup_alpha(alpha, kind)
            masks[index] = alpha
        return masks
    except Exception as error:
        global _GSAM2_IMPORT_ERROR
        _GSAM2_IMPORT_ERROR = str(error)[:300]
        try:
            import torch  # type: ignore
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass
        return {}
def normalize_rect(x0, y0, x1, y1, width, height):
    return {"x": x0 / width, "y": y0 / height, "width": (x1 - x0) / width, "height": (y1 - y0) / height}


def clamp_float(value, low, high):
    return max(low, min(high, float(value)))


def normalized_box_from_polygon(points, width, height):
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return normalize_rect(int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys)), width, height)


def rotation_from_polygon(points):
    if len(points) < 2:
        return 0.0
    first, second = points[0], points[1]
    angle = math.degrees(math.atan2(second[1] - first[1], second[0] - first[0]))
    while angle > 90:
        angle -= 180
    while angle < -90:
        angle += 180
    return round(angle, 2)


def text_style(item, rect):
    raw = item.get("style") if isinstance(item, dict) else {}
    raw = raw if isinstance(raw, dict) else {}
    effect = str(raw.get("effect") or item.get("effect") or "plain").lower()
    complex_effects = {"gradient", "outline", "perspective", "curved", "texture", "art", "artistic"}
    return {
        "color": str(raw.get("color") or item.get("color") or "#FFFFFF"),
        "fontSize": max(9, min(80, int(raw.get("fontSize") or max(12, rect["height"] * 100)))),
        "bold": bool(raw.get("bold") or False),
        "italic": bool(raw.get("italic") or False),
        "align": str(raw.get("align") or "left").lower(),
        "effect": effect,
        "complex": effect in complex_effects or bool(raw.get("complex")),
    }


def vision_texts(text_parts, width, height):
    items = []
    for item in text_parts[:30]:
        text = str(item.get("text") or "").strip()
        if not text:
            continue
        x0, y0, x1, y1 = rect_from_box(item.get("box"), width, height, 0)
        rect = normalize_rect(x0, y0, x1, y1, width, height)
        points = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
        items.append({
            "content": text[:500], "box": rect, "polygon": points,
            "rotation": float(item.get("rotation") or 0),
            "confidence": float(item.get("confidence") or 0.62), "source": "vision",
            "semanticRole": str(item.get("semanticRole") or item.get("role") or "unknown"),
            "editable": bool(item.get("editable", True)),
            "style": text_style(item, rect),
        })
    return items


def paddle_texts(source):
    """Return recognised text and four-point geometry when PaddleOCR is installed.

    The extractor deliberately degrades to the vision-model text plan when the
    optional local package is unavailable, so a missing OCR wheel never blocks
    the image-explode workflow.
    """
    global _PADDLE_OCR, _PADDLE_ERROR
    try:
        if _PADDLE_OCR is None:
            from paddleocr import PaddleOCR
            _PADDLE_OCR = PaddleOCR(use_angle_cls=True, lang=os.getenv("PADDLEOCR_LANG", "ch"), show_log=False)
        result = _PADDLE_OCR.ocr(source, cls=True)
        rows = result[0] if result and isinstance(result[0], list) else []
        height, width = source.shape[:2]
        items = []
        for row in rows:
            if not isinstance(row, (list, tuple)) or len(row) < 2:
                continue
            polygon, recognition = row[0], row[1]
            if not isinstance(recognition, (list, tuple)) or not recognition:
                continue
            content = str(recognition[0]).strip()
            confidence = float(recognition[1]) if len(recognition) > 1 else 0.7
            if not content or len(polygon) < 4:
                continue
            points = [[float(point[0]), float(point[1])] for point in polygon]
            rect = normalized_box_from_polygon(points, width, height)
            items.append({
                "content": content[:500], "box": rect, "polygon": points,
                "rotation": rotation_from_polygon(points), "confidence": confidence,
                "source": "paddleocr", "style": text_style({}, rect),
                "semanticRole": "unknown", "editable": True,
            })
        _PADDLE_ERROR = ""
        return items
    except Exception as error:
        _PADDLE_ERROR = str(error)
        return []


def box_iou(left, right):
    x0 = max(left["x"], right["x"])
    y0 = max(left["y"], right["y"])
    x1 = min(left["x"] + left["width"], right["x"] + right["width"])
    y1 = min(left["y"] + left["height"], right["y"] + right["height"])
    overlap = max(0, x1 - x0) * max(0, y1 - y0)
    union = left["width"] * left["height"] + right["width"] * right["height"] - overlap
    return overlap / union if union else 0


def text_is_artwork(item):
    role = str(item.get("semanticRole") or "").lower()
    style = item.get("style") or {}
    return (role in {"title", "title-art", "wordart", "logo", "slogan-art"}
            or bool(style.get("complex"))
            or str(style.get("effect") or "plain").lower() != "plain")


def reconcile_texts(source, vision_parts):
    """Fuse OCR geometry with visual semantics instead of trusting either alone.

    OCR is better at exact coordinates, while vision is better at knowing that a
    large gold 3D title is artwork rather than a normal editable text box. A
    low-confidence or mismatched OCR result is deliberately hidden by default.
    """
    local = paddle_texts(source)
    vision = vision_texts(vision_parts, source.shape[1], source.shape[0])
    if not local:
        for item in vision:
            item["ocrConfidence"] = 0.0
            item["visionConfidence"] = item["confidence"]
            if text_is_artwork(item) or not item.get("editable", True):
                item["mode"] = "artwork"
            elif item["confidence"] < 0.78:
                item["mode"] = "skip"
            else:
                item["mode"] = "native"
        return vision, "vision-fallback"

    fused = []
    for item in local:
        match = max(vision, key=lambda candidate: box_iou(item["box"], candidate["box"]), default=None)
        overlap = box_iou(item["box"], match["box"]) if match else 0
        style = match["style"] if match and overlap >= 0.28 else item["style"]
        role = match.get("semanticRole", "unknown") if match and overlap >= 0.28 else "unknown"
        vision_confidence = match["confidence"] if match and overlap >= 0.28 else 0.0
        item["style"] = style
        item["semanticRole"] = role
        item["visionConfidence"] = vision_confidence
        item["ocrConfidence"] = item["confidence"]
        visual_artwork = text_is_artwork({**item, "style": style, "semanticRole": role})
        large_unverified = item["box"]["height"] >= 0.075 or item["box"]["width"] >= 0.24
        if visual_artwork or large_unverified:
            item["mode"] = "artwork"
        elif item["ocrConfidence"] < 0.82 or vision_confidence < 0.58:
            item["mode"] = "skip"
        else:
            item["mode"] = "native"
        fused.append(item)
    return fused, "paddleocr+vision"


def intersects(rect, candidate):
    center_x = rect["x"] + rect["width"] / 2
    center_y = rect["y"] + rect["height"] / 2
    pad_x = candidate["width"] * 0.08
    pad_y = candidate["height"] * 0.08
    return (candidate["x"] - pad_x <= center_x <= candidate["x"] + candidate["width"] + pad_x and
            candidate["y"] - pad_y <= center_y <= candidate["y"] + candidate["height"] + pad_y)


def text_component_owners(components, texts, width, height):
    """Assign each text to the smallest containing visual component.

    Vision models often return both a large group and its individual cards. A
    single ownership decision prevents the same OCR line from being exported
    multiple times when those boxes overlap.
    """
    boxes = []
    for index, component in enumerate(components[:18]):
        if str(component.get("kind") or "").lower() not in {"card", "frame", "panel", "decoration", "title-art", "wordart"}:
            continue
        x0, y0, x1, y1 = rect_from_box(component.get("box"), width, height)
        boxes.append((index, normalize_rect(x0, y0, x1, y1, width, height)))
    owners = {}
    for text_index, text in enumerate(texts):
        candidates = [(candidate["width"] * candidate["height"], index) for index, candidate in boxes if intersects(text["box"], candidate)]
        if candidates:
            owners[text_index] = min(candidates)[1]
    return owners


def clean_crop_text(crop, related, crop_x, crop_y):
    if not related:
        return crop.copy()
    mask = np.zeros(crop.shape[:2], dtype=np.uint8)
    for item in related:
        points = np.array([[int(point[0] - crop_x), int(point[1] - crop_y)] for point in item["polygon"]], dtype=np.int32)
        if len(points) >= 3:
            cv2.fillPoly(mask, [points], 255)
    if not np.any(mask):
        return crop.copy()
    mask = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=1)
    return cv2.inpaint(crop, mask, 3, cv2.INPAINT_TELEA)


def blend_over(base, rgba, x0, y0):
    height, width = rgba.shape[:2]
    x1 = min(base.shape[1], x0 + width)
    y1 = min(base.shape[0], y0 + height)
    if x1 <= x0 or y1 <= y0:
        return
    foreground = rgba[:y1-y0, :x1-x0, :3].astype(np.float32)
    alpha = rgba[:y1-y0, :x1-x0, 3:4].astype(np.float32) / 255.0
    background = base[y0:y1, x0:x1].astype(np.float32)
    base[y0:y1, x0:x1] = (foreground * alpha + background * (1.0 - alpha)).astype(np.uint8)


def region_error(source, reconstruction, x0, y0, x1, y1):
    if x1 <= x0 or y1 <= y0:
        return 1.0
    return float(np.mean(cv2.absdiff(source[y0:y1, x0:x1], reconstruction[y0:y1, x0:x1])) / 255.0)


def explode(payload):
    raw = base64.b64decode(payload["image"])
    source = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if source is None:
        raise ValueError("无法读取图片")
    height, width = source.shape[:2]
    components = list(payload.get("components") or [])
    recovered_texts, text_backend = reconcile_texts(source, payload.get("texts") or [])
    for text_index, item in enumerate(recovered_texts):
        if item.get("mode") != "artwork":
            continue
        if any(intersects(item["box"], normalize_rect(*rect_from_box(component.get("box"), width, height), width, height)) for component in components):
            continue
        box = item["box"]
        components.append({"semanticId": f"artwork-text-{text_index + 1}", "label": "艺术字效果", "kind": "title-art", "box": [box["x"] * 1000, box["y"] * 1000, box["width"] * 1000, box["height"] * 1000], "confidence": item.get("confidence", 0.6), "zIndex": 80 + text_index, "removeFromBackground": True, "containsText": True, "recommended": True})

    parts, text_layers, assigned_text_indexes = [], [], set()
    text_owners = text_component_owners(components, recovered_texts, width, height)
    union_mask = np.zeros((height, width), dtype=np.uint8)
    reconstruction_parts = []
    segmentation = segmentation_backend_status()
    sam3_full_masks = sam3_component_masks(source, components, width, height) if segmentation["active"] == "sam3-configured" else {}
    sam3_used = bool(sam3_full_masks)
    gsam2_full_masks = grounded_sam2_component_masks(source, components, width, height) if segmentation["active"] == "grounded-sam2-configured" and not sam3_used else {}
    gsam2_used = bool(gsam2_full_masks)

    for index, component in enumerate(components[:18]):
        kind = str(component.get("kind") or "object")[:24]
        kind_key = kind.lower()
        x0, y0, x1, y1 = rect_from_box(component.get("box"), width, height, component_pad(component, "crop"))
        crop = source[y0:y1, x0:x1]
        crop_rect = normalize_rect(x0, y0, x1, y1, width, height)
        rect = crop_rect
        label = str(component.get("label") or f"部件 {index + 1}")[:48]
        confidence = float(component.get("confidence") or 0.55)
        semantic_id = str(component.get("semanticId") or f"component-{index + 1}")[:80]
        parent_semantic_id = str(component.get("parentId") or component.get("parentSemanticId") or "")[:80] or None
        # groupKey denotes alternative renderings of one component. Parentage is
        # stored separately so selecting several children of a group stays valid.
        group_key = str(component.get("groupKey") or semantic_id)[:80]
        related = [(text_index, item) for text_index, item in enumerate(recovered_texts) if text_owners.get(text_index) == index]
        related_artwork = any(item.get("mode") == "artwork" for _, item in related)
        related_native = [] if kind_key in {"title-art", "wordart"} else [item for _, item in related if item.get("mode") == "native"]
        is_group = kind_key in {"group", "panel-group"}
        recommended = bool(component.get("recommended", not is_group))
        primary_crop = crop if related_artwork or kind_key in {"title-art", "wordart"} else clean_crop_text(crop, related_native, x0, y0)
        full_alpha = sam3_full_masks.get(index)
        if full_alpha is None:
            full_alpha = gsam2_full_masks.get(index)
        if full_alpha is not None:
            alpha = full_alpha[y0:y1, x0:x1]
            if alpha.shape[:2] != primary_crop.shape[:2]:
                alpha = cv2.resize(alpha, (primary_crop.shape[1], primary_crop.shape[0]), interpolation=cv2.INTER_LINEAR)
            alpha = cleanup_alpha(alpha, kind_key)
            rgba = np.dstack((primary_crop, alpha))
            extract_mode = "sam3-mask" if index in sam3_full_masks else "grounded-sam2-mask"
        else:
            rgba = grabcut_rgba(primary_crop)
            alpha = rgba[:, :, 3]
            alpha = cleanup_alpha(alpha, kind_key)
            rgba[:, :, 3] = alpha
            extract_mode = "local-mask"
            if segmentation["active"] == "sam3-configured":
                extract_mode = "sam3-fallback-local-mask-needs-review"
        rgba, x0, y0 = trim_rgba_to_alpha(rgba, x0, y0, width, height, kind_key)
        alpha = rgba[:, :, 3]
        rect = normalize_rect(x0, y0, x0 + rgba.shape[1], y0 + rgba.shape[0], width, height)
        alpha_ratio, low_quality_mask = alpha_quality(alpha, kind_key)
        if low_quality_mask and kind_key not in {"line", "decoration"}:
            # SAM3 trial mode: do not hide candidates just because the local
            # heuristic dislikes the mask. Show it to the employee and mark it
            # for review; otherwise a strict filter can make SAM3 look like it
            # produced nothing at all.
            extract_mode = f"{extract_mode}-needs-review"
        if component.get("removeFromBackground", not is_group):
            ux1 = min(width, x0 + alpha.shape[1])
            uy1 = min(height, y0 + alpha.shape[0])
            if ux1 > x0 and uy1 > y0:
                union_mask[y0:uy1, x0:ux1] = np.maximum(union_mask[y0:uy1, x0:ux1], alpha[:uy1-y0, :ux1-x0])
        mask_quality = alpha_ratio
        parts.append({"label": label, "kind": kind, "variant": "artwork" if related_artwork or kind_key in {"title-art", "wordart"} else ("clean-text" if related_native else "transparent"), "semanticId": semantic_id, "parentSemanticId": parent_semantic_id, "groupKey": group_key, "image": png_data(rgba), "confidence": confidence, "maskQuality": mask_quality, "extractMode": extract_mode, "zIndex": int(component.get("zIndex") or (10 + index)), "recommended": recommended, "selected": recommended, **rect})
        reconstruction_parts.append((rgba, x0, y0, recommended and not is_group, label))
        if (not is_group) and kind_key in {"subject", "vehicle", "product", "person", "robot", "title-art", "wordart", "card", "panel", "frame"}:
            fallback_reason = "needs-review" if low_quality_mask else "lossless-crop"
            parts.append({"label": f"{label}（整块保真备选）", "kind": kind, "variant": "source-crop", "semanticId": f"{semantic_id}-source-crop", "parentSemanticId": semantic_id, "groupKey": group_key, "image": png_data(crop), "confidence": max(0.2, confidence - 0.08), "maskQuality": 1.0, "extractMode": fallback_reason, "zIndex": int(component.get("zIndex") or (10 + index)), "recommended": False, "selected": False, **crop_rect})
        if related_native:
            parts.append({"label": f"{label}（完整）", "kind": kind, "variant": "original-text", "semanticId": f"{semantic_id}-original", "parentSemanticId": semantic_id, "groupKey": group_key, "image": png_data(crop), "confidence": confidence - 0.05, "maskQuality": 1.0, "extractMode": "source-crop", "zIndex": int(component.get("zIndex") or (10 + index)), "recommended": False, "selected": False, **crop_rect})
        for text_index, item in related:
            assigned_text_indexes.add(text_index)
            style = item["style"]
            text_layers.append({"label": f"{label} / text {len(text_layers) + 1}", "content": item["content"], "groupKey": group_key, "rotation": item["rotation"], "style": style, "complexity": "complex" if item.get("mode") == "artwork" or style.get("complex") else "simple", "mode": item.get("mode", "skip"), "selected": item.get("mode") == "native", "confidence": item["confidence"], "ocrConfidence": item.get("ocrConfidence", 0.0), "visionConfidence": item.get("visionConfidence", 0.0), "semanticRole": item.get("semanticRole", "unknown"), **item["box"]})

    inpaint_mask = cv2.dilate(union_mask, np.ones((5, 5), np.uint8), iterations=1)
    repaired = cv2.inpaint(source, inpaint_mask, 5, cv2.INPAINT_TELEA) if components else source.copy()
    reconstruction = repaired.copy()
    qa_regions = []
    for rgba, x0, y0, selected, label in reconstruction_parts:
        if not selected:
            continue
        blend_over(reconstruction, rgba, x0, y0)
        qa_regions.append({"label": label, "error": round(region_error(source, reconstruction, x0, y0, x0 + rgba.shape[1], y0 + rgba.shape[0]), 4)})
    score = 1.0 - (sum(item["error"] for item in qa_regions) / len(qa_regions) if qa_regions else 0.0)
    worst = max((item["error"] for item in qa_regions), default=0.0)
    needs_cloud_cleanup = bool(qa_regions and (score < 0.93 or worst > 0.18))
    qa = {"status": "needs-cloud-cleanup" if needs_cloud_cleanup else "local-pass", "reconstructionScore": round(score, 4), "worstRegionError": round(worst, 4), "regions": qa_regions, "message": "本地背景仍可能留有主体残影，建议执行一次受预算限制的 AI 清图。" if needs_cloud_cleanup else "本地蒙版重建通过基础重复与错位检查。"}
    parts.insert(0, {"label": "背景（修复）", "kind": "background", "variant": "inpainted", "semanticId": "background-clean", "image": png_data(repaired), "confidence": 0.58, "maskQuality": float(np.mean(union_mask) / 255.0), "extractMode": "local-mask-inpaint", "zIndex": 0, "recommended": True, "selected": True, "x": 0, "y": 0, "width": 1, "height": 1})
    parts.insert(1, {"label": "原始整图背景（兼容备选）", "kind": "background", "variant": "original", "semanticId": "background-original", "image": png_data(source), "confidence": 0.2, "maskQuality": 0.0, "extractMode": "source", "zIndex": 0, "recommended": False, "selected": False, "x": 0, "y": 0, "width": 1, "height": 1})
    for text_index, item in enumerate(recovered_texts):
        if text_index in assigned_text_indexes:
            continue
        style = item["style"]
        text_layers.append({"label": f"Text {text_index + 1}", "content": item["content"], "groupKey": None, "rotation": item["rotation"], "style": style, "complexity": "complex" if item.get("mode") == "artwork" or style.get("complex") else "simple", "mode": item.get("mode", "skip"), "selected": item.get("mode") == "native", "confidence": item["confidence"], "ocrConfidence": item.get("ocrConfidence", 0.0), "visionConfidence": item.get("visionConfidence", 0.0), "semanticRole": item.get("semanticRole", "unknown"), **item["box"]})
    if sam3_used:
        segmentation = {**segmentation, "active": "sam3", "reason": f"SAM3 generated masks for {len(sam3_full_masks)} component(s); OpenCV remains the fallback for unmatched parts."}
    elif segmentation["active"] == "sam3-configured":
        sam3_meta = dict(segmentation.get("sam3") or {})
        if _SAM3_IMPORT_ERROR:
            sam3_meta["error"] = _SAM3_IMPORT_ERROR
        segmentation = {**segmentation, "active": "opencv", "sam3": sam3_meta, "reason": f"SAM3 was configured but did not return usable masks; using OpenCV fallback. {_SAM3_IMPORT_ERROR}".strip()}
    elif gsam2_used:
        segmentation = {**segmentation, "active": "grounded-sam2", "reason": f"Grounded-SAM2/SAM2 generated masks for {len(gsam2_full_masks)} component(s); OpenCV remains the fallback for unmatched parts."}
    elif segmentation["active"] == "grounded-sam2-configured":
        gsam2_meta = dict(segmentation.get("groundedSam2") or {})
        if _GSAM2_IMPORT_ERROR:
            gsam2_meta["error"] = _GSAM2_IMPORT_ERROR
        segmentation = {**segmentation, "active": "opencv", "groundedSam2": gsam2_meta, "reason": f"Grounded-SAM2 was configured but did not return usable masks; using OpenCV fallback. {_GSAM2_IMPORT_ERROR}".strip()}
    return {"width": width, "height": height, "backend": f"{segmentation['active']}+{text_backend}", "segmentation": segmentation, "ocrWarning": _PADDLE_ERROR if text_backend != "paddleocr+vision" else "", "parts": parts, "textLayers": text_layers, "qa": qa, "reconstruction": png_data(reconstruction), "layerPlan": {"components": components, "textBackend": text_backend, "sam3Masks": len(sam3_full_masks), "groundedSam2Masks": len(gsam2_full_masks)}}


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, value):
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            segmentation = segmentation_backend_status()
            return self.send_json(200, {
                "ok": True,
                "backend": segmentation["active"],
                "segmentation": segmentation,
                "gpu": segmentation["device"],
                "sam3Installed": bool((segmentation.get("sam3") or {}).get("installed")),
                "sam3Ready": segmentation["active"] in {"sam3", "sam3-configured"},
                "groundedSam2Installed": bool((segmentation.get("groundedSam2") or {}).get("installed")),
                "groundedSam2Ready": segmentation["active"] == "grounded-sam2",
            })
        self.send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/explode":
            return self.send_json(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            self.send_json(200, explode(payload))
        except Exception as error:
            self.send_json(400, {"error": str(error)})

    def log_message(self, *_args):
        return


if __name__ == "__main__":
    runtime = segmentation_backend_status()
    print(f"Component extractor listening on http://{HOST}:{PORT} · backend={runtime['active']} · device={runtime['device']['active']}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
