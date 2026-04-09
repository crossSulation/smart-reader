export type Book = {
  title: string;
  author: string;
  genre: string;
  isbn: string;
  cover_path: string;
  description: string;
  price: number;
  stock: number;
  current_page: number;
  file_type: string;
  last_read?: string;
  id: string;
};