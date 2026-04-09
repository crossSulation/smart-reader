import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PDFViewer from "../components/PDFViewer";
import EPUBViewer from "../components/EPUBViewer";
import type { Book } from "../types/Book";

function Reader() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("Book ID not found");
      setLoading(false);
      return;
    }

    const fetchBook = async () => {
      try {
        const res = await fetch(`/api/books/${id}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        });
        
        if (!res.ok) {
          throw new Error(`Failed to load book: ${res.status}`);
        }
        
        const data = await res.json();
        setBook(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load book");
      } finally {
        setLoading(false);
      }
    };

    fetchBook();
  }, [id]);

  if (loading) return <div className="p-8 text-center">加载中...</div>;
  
  if (error) {
    return (
      <div className="p-8 text-center">
        <div className="text-red-600 mb-4">{error}</div>
        <button 
          onClick={() => navigate("/")} 
          className="text-blue-600 hover:underline"
        >
          返回书架
        </button>
      </div>
    );
  }

  if (!book) return <div className="p-8 text-center">书籍未找到</div>;

  return (
    <div className="p-8">
      <div className="mb-4">
        <button 
          onClick={() => navigate("/")} 
          className="text-blue-600 hover:underline"
        >
          ← 返回书架
        </button>
      </div>
      <h1 className="text-2xl font-bold mb-4">{book.title}</h1>
      
      {book.file_type === "pdf" ? (
        <PDFViewer bookId={id!} initPage={book.current_page} />
      ) : (
        <EPUBViewer bookId={id!} />
      )}
    </div>
  );
}

export default Reader;