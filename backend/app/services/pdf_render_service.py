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
                for span in line.get("spans", []):
                    sp = span["text"]
                    if not sp.strip():
                        continue
                    bbox = span["bbox"]
                    texts.append({
                        "text": sp,
                        "x": bbox[0] / page.rect.width,
                        "y": bbox[1] / page.rect.height,
                        "w": (bbox[2] - bbox[0]) / page.rect.width,
                        "h": (bbox[3] - bbox[1]) / page.rect.height,
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
