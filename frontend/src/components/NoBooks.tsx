import React from 'react';
import { useTranslation } from 'react-i18next';
import { CloudUploadOutlined, PictureAsPdfOutlined, MenuBookOutlined, DescriptionOutlined } from '@mui/icons-material';

interface NoBooksProps {
  onUploadClick?: () => void;
}

const NoBooks: React.FC<NoBooksProps> = ({ onUploadClick }) => {
  const { t } = useTranslation();

  const handleClick = () => {
    if (onUploadClick) {
      onUploadClick();
    } else {
      const uploadBtn = document.querySelector('button[aria-label="upload-book"]');
      if (uploadBtn) {
        (uploadBtn as HTMLButtonElement).click();
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center min-h-[420px] w-full">
      <div className="relative mb-8">
        <div className="w-28 h-28 rounded-full bg-blue-50 flex items-center justify-center dark:bg-blue-900/20">
          <CloudUploadOutlined sx={{ fontSize: 52 }} className="text-blue-500 dark:text-blue-400" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-10 h-10 rounded-full bg-green-50 border-2 border-white flex items-center justify-center dark:bg-green-900/20 dark:border-gray-900">
          <MenuBookOutlined sx={{ fontSize: 20 }} className="text-green-500 dark:text-green-400" />
        </div>
      </div>

      <h2 className="text-2xl font-bold text-gray-800 mb-2 dark:text-gray-100">
        {t('noBooks.title')}
      </h2>
      <p className="text-gray-500 mb-1 max-w-md dark:text-gray-400">
        {t('noBooks.subtitle')}
      </p>
      <p className="text-sm text-gray-400 mb-8 max-w-md leading-relaxed dark:text-gray-500">
        {t('noBooks.description')}
      </p>

      <button
        onClick={handleClick}
        className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-lg shadow-blue-200 dark:shadow-blue-900/30"
      >
        <CloudUploadOutlined sx={{ fontSize: 20 }} />
        {t('noBooks.uploadButton')}
      </button>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <span className="text-xs text-gray-400 dark:text-gray-500 mr-1">
          {t('noBooks.supportedFormatsTitle')}
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-xs text-red-600 border border-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/30">
          <PictureAsPdfOutlined sx={{ fontSize: 14 }} />
          PDF
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-xs text-amber-600 border border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/30">
          <MenuBookOutlined sx={{ fontSize: 14 }} />
          EPUB
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 text-xs text-indigo-600 border border-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-900/30">
          <DescriptionOutlined sx={{ fontSize: 14 }} />
          DOC / DOCX
        </span>
      </div>
    </div>
  );
};

export default NoBooks;
