import io
import base64
import logging
from typing import Dict, Any, Optional

import fitz

logger = logging.getLogger(__name__)

PAGE_CACHE: Dict[str, Dict[int, bytes]] = {}
MAX_CACHE_SIZE = 50


def render_pdf_page(
    file_path: str,
    page_number: int,
    dpi: int = 144,
    max_width: int = 1200,
) -> Optional[Dict[str, Any]]:
    """Render PDF page as image and extract text with bounding boxes."""
    try:
        doc = fitz.open(file_path)
        if page_number < 1 or page_number > len(doc):
            doc.close()
            return None

        page = doc[page_number - 1]

        zoom = dpi / 72
        mat = fitz.Matrix(zoom, zoom)

        pix = page.get_pixmap(matrix=mat)
        if pix.width > max_width:
            scale = max_width / pix.width
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom * scale, zoom * scale))

        img_bytes = pix.tobytes("jpeg", jpg_quality=80)
        img_b64 = base64.b64encode(img_bytes).decode()

        text_blocks = page.get_text("dict")["blocks"]
        texts = []
        for block in text_blocks:
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                line_text = ""
                x0, y0, x1, y1 = float("inf"), float("inf"), 0, 0
                for span in line.get("spans", []):
                    line_text += span["text"]
                    bbox = span["bbox"]
                    x0 = min(x0, bbox[0])
                    y0 = min(y0, bbox[1])
                    x1 = max(x1, bbox[2])
                    y1 = max(y1, bbox[3])
                if line_text.strip():
                    texts.append({
                        "text": line_text,
                        "x": x0 / page.rect.width,
                        "y": y0 / page.rect.height,
                        "w": (x1 - x0) / page.rect.width,
                        "h": (y1 - y0) / page.rect.height,
                    })

        total = len(doc)
        doc.close()

        return {
            "page": page_number,
            "total_pages": total,
            "image": f"data:image/jpeg;base64,{img_b64}",
            "width": pix.width,
            "height": pix.height,
            "text_lines": texts,
        }
    except Exception as e:
        logger.error("render_pdf_page error: %s", e)
        return None


def get_page_count(file_path: str) -> int:
    try:
        doc = fitz.open(file_path)
        count = len(doc)
        doc.close()
        return count
    except Exception:
        return 0
