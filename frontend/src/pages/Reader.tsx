import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import PDFViewer from "../components/PDFViewer";
import EPUBViewer from "../components/EPUBViewer";
import type { Book } from "../types/Book";
function Reader() {
 const params = useParams();
  const [book, setBook] = useState<Book>(null);

  useEffect(() => {
    fetch(`/api/books/${params.id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    })
      .then((res) => res.json())
      .then(setBook);
  }, [params.id]);

  if (!book) return <div>加载中...</div>;

  return (
    <div className="p-8">
      <div className="mb-4">
        <a href="/" className="text-blue-600 hover:underline">← 返回书架</a>
      </div>
      <h1 className="text-2xl font-bold mb-4">{book.title}</h1>
      
      {book.file_type === "pdf" ? (
        <PDFViewer bookId={params.id!} initPage={book.current_page} />
      ) : (
        <EPUBViewer bookId={params.id!} />
      )}
    </div>
  );
}

export default Reader;