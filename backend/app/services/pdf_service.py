import pdfplumber
from typing import List, Dict, Any
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

def extract_pdf_info(file_path: str) -> Dict[str, Any]:
    """
    使用pdfplumber提取PDF信息
    """
    try:
        with pdfplumber.open(file_path) as pdf:
            total_pages = len(pdf.pages)
            
            # 获取文档元数据
            metadata = pdf.metadata or {}
            
            # 提取前几页的文本内容作为预览
            text_preview = ""
            for i in range(min(3, total_pages)):  # 提取前3页或全部页数（以较少者为准）
                page = pdf.pages[i]
                text_preview += page.extract_text() or ""
                
                # 限制预览文本长度
                if len(text_preview) > 1000:
                    text_preview = text_preview[:1000] + "..."
                    break
            
            return {
                "total_pages": total_pages,
                "metadata": metadata,
                "text_preview": text_preview
            }
    except Exception as e:
        logger.error(f"Error extracting PDF info: {str(e)}")
        raise ValueError(f"无法处理PDF文件: {str(e)}")

def extract_page_content(file_path: str, page_number: int) -> str:
    """
    提取指定页面的内容
    """
    try:
        with pdfplumber.open(file_path) as pdf:
            if page_number < 1 or page_number > len(pdf.pages):
                raise ValueError(f"Page number {page_number} is out of range")
            
            page = pdf.pages[page_number - 1]  # pdfplumber从0开始索引
            return page.extract_text() or ""
    except Exception as e:
        logger.error(f"Error extracting page {page_number} from {file_path}: {str(e)}")
        raise ValueError(f"无法提取页面内容: {str(e)}")

def get_pdf_page_count(file_path: str) -> int:
    """
    获取PDF总页数
    """
    try:
        with pdfplumber.open(file_path) as pdf:
            return len(pdf.pages)
    except Exception as e:
        logger.error(f"Error getting page count for {file_path}: {str(e)}")
        raise ValueError(f"无法获取PDF页数: {str(e)}")