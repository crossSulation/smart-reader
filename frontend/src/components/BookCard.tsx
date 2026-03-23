import type { Book } from "../types/Book";
function BookCard({ book }: { book: Book }) {
  return (
    <div className="border rounded-lg overflow-hidden hover:shadow-lg transition">
      <div className="h-48 bg-gray-100 flex items-center justify-center">
        {book.cover_path ? (
          <img
            src={book.cover_path}
            alt={book.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-4xl">📚</span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold truncate">{book.title}</h3>
        <p className="text-sm text-gray-500 truncate">
          {book.author || "unknow"}
        </p>
        <div className="mt-2 text-xs text-gray-400">
          第 {book.current_page} 页
        </div>
      </div>
    </div>
  );
}

export default BookCard;
