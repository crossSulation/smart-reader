import { useState, useEffect } from "react";
import BookCard from "../components/BookCard";
import FileUpload from "../components/FileUpload";
import type { Book } from "../types/Book";
import NoBooks from "../components/NoBooks";
function Library() {
  const [books, setBooks] = useState<Book[]>([]);
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    fetchBooks();
  }, []);

  const fetchBooks = async () => {
    const res = await fetch("/api/books", {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
      return;
    }
    const data = await res.json();
    setBooks(data);
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">我的书架</h1>
        <button
          onClick={() => setShowUpload(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          📤 上传书籍
        </button>
      </div>

      {showUpload && (
        <FileUpload
          onUploadComplete={() => {
            setShowUpload(false);
            fetchBooks();
          }}
          onClose={() => setShowUpload(false)}
        />
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
        {books.length > 0 ? (
          books.map((book) => <BookCard key={book.id} book={book} />)
        ) : (
          <NoBooks />
        )}
      </div>
    </div>
  );
}

export default Library;
