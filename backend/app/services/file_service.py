from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime

from app.models import FileMetadata, Book
from app.schemas import BookCreate


class FileService:
    def __init__(self, db: Session):
        self.db = db

    def get_user_files(self, user_id: int) -> List[FileMetadata]:
        """
        获取用户的所有文件
        """
        return self.db.query(FileMetadata).filter(FileMetadata.uploaded_by == user_id).all()

    def get_file(self, file_id: int, user_id: int) -> Optional[FileMetadata]:
        """
        根据ID获取用户的特定文件
        """
        return self.db.query(FileMetadata).filter(
            FileMetadata.id == file_id,
            FileMetadata.uploaded_by == user_id
        ).first()

    def delete_file(self, file_id: int, user_id: int) -> bool:
        """
        删除用户的特定文件
        """
        file = self.get_file(file_id, user_id)
        if file:
            self.db.delete(file)
            self.db.commit()
            return True
        return False

    def create_file_metadata(self, file_data: dict) -> FileMetadata:
        """
        创建文件元数据记录
        """
        file_metadata = FileMetadata(**file_data)
        self.db.add(file_metadata)
        self.db.commit()
        self.db.refresh(file_metadata)
        return file_metadata

    def get_user_books(self, user_id: int) -> List[Book]:
        """
        获取用户的所有书籍
        """
        return self.db.query(Book).filter(Book.owner_id == user_id).all()

    def get_book(self, book_id: int, user_id: int) -> Optional[Book]:
        """
        根据ID获取用户的特定书籍
        """
        return self.db.query(Book).filter(
            Book.id == book_id,
            Book.owner_id == user_id
        ).first()

    def create_book(self, user_id: int, book_data: BookCreate) -> Book:
        """
        为用户创建新书籍
        """
        book = Book(
            title=book_data.title,
            owner_id=user_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        self.db.add(book)
        self.db.commit()
        self.db.refresh(book)
        return book

    def delete_book(self, book_id: int, user_id: int) -> bool:
        """
        删除用户的特定书籍
        """
        book = self.get_book(book_id, user_id)
        if book:
            self.db.delete(book)
            self.db.commit()
            return True
        return False

    def update_book(self, book_id: int, user_id: int, book_data: BookCreate) -> Optional[Book]:
        """
        更新用户的特定书籍
        """
        book = self.get_book(book_id, user_id)
        if book:
            book.title = book_data.title
            book.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(book)
            return book
        return None

    def get_file_by_original_name(self, original_name: str, user_id: int) -> Optional[FileMetadata]:
        """
        根据原始文件名获取文件
        """
        return self.db.query(FileMetadata).filter(
            FileMetadata.original_name == original_name,
            FileMetadata.uploaded_by == user_id
        ).first()

    def get_files_by_type(self, file_type: str, user_id: int) -> List[FileMetadata]:
        """
        根据文件类型获取用户文件
        """
        return self.db.query(FileMetadata).filter(
            FileMetadata.file_type == file_type,
            FileMetadata.uploaded_by == user_id
        ).all()

    def get_total_storage_used(self, user_id: int) -> int:
        """
        计算用户使用的总存储空间
        """
        result = self.db.query(func.sum(FileMetadata.file_size)).filter(
            FileMetadata.uploaded_by == user_id
        ).scalar()
        return result or 0

    def get_file_count_by_user(self, user_id: int) -> int:
        """
        获取用户上传的文件总数
        """
        return self.db.query(FileMetadata).filter(FileMetadata.uploaded_by == user_id).count()

    # 新增：进度相关的方法
    def update_book_progress(self, book_id: int, user_id: int, current_page: int, total_pages: int = None) -> Optional[Book]:
        """
        更新书籍阅读进度
        """
        book = self.get_book(book_id, user_id)
        if book:
            book.current_page = current_page
            if total_pages is not None:
                book.total_pages = total_pages
            
            # 计算进度百分比
            if total_pages and total_pages > 0:
                book.progress_percentage = min(int((current_page / total_pages) * 100), 100)
            
            book.last_read_time = datetime.utcnow()
            self.db.commit()
            self.db.refresh(book)
            return book
        return None

    def get_user_reading_stats(self, user_id: int):
        """
        获取用户的阅读统计数据
        """
        books = self.get_user_books(user_id)
        total_books = len(books)
        total_pages_read = sum([book.current_page for book in books if book.current_page])
        completed_books = sum([1 for book in books if book.progress_percentage == 100])
        
        return {
            "total_books": total_books,
            "total_pages_read": total_pages_read,
            "completed_books": completed_books,
            "average_progress": sum([book.progress_percentage for book in books]) / total_books if total_books > 0 else 0
        }

    def add_book_notes(self, book_id: int, user_id: int, notes: str) -> Optional[Book]:
        """
        为书籍添加笔记
        """
        book = self.get_book(book_id, user_id)
        if book:
            book.notes = notes
            book.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(book)
            return book
        return None