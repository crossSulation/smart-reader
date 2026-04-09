import React from 'react';
import { useTranslation } from 'react-i18next';

interface NoBooksProps {
  onUploadClick?: () => void;
}

const NoBooks: React.FC<NoBooksProps> = ({ onUploadClick }) => {
  const { t } = useTranslation();

  const handleClick = () => {
    if (onUploadClick) {
      onUploadClick();
    } else {
      // 触发父组件中的上传功能
      const uploadBtn = document.querySelector('button[aria-label="upload-book"]');
      if (uploadBtn) {
        (uploadBtn as HTMLButtonElement).click();
      } else {
        console.log("请在父组件中添加上传按钮");
      }
    }
  };

  return (
    <div 
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px',
        textAlign: 'center',
        minHeight: '400px',
        backgroundColor: '#fafafa',
        borderRadius: '8px',
        border: '2px dashed #e0e0e0',
        margin: '16px',
        width: '100%',
      }}
    >
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#666', marginBottom: '8px' }}>
          {t('noBooks.title')}
        </h2>
        <h3 style={{ fontSize: '18px', color: '#333', marginBottom: '16px' }}>
          {t('noBooks.subtitle')}
        </h3>
        <p style={{ color: '#666', maxWidth: '600px' }}>
          {t('noBooks.description')}
        </p>
      </div>
      
      <button
        onClick={handleClick}
        style={{
          marginTop: '16px',
          padding: '12px 24px',
          backgroundColor: '#1976d2',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          fontSize: '16px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <span>📤</span>
        {t('noBooks.uploadButton')}
      </button>
      
      <div style={{ marginTop: '32px', textAlign: 'left', maxWidth: '600px' }}>
        <p style={{ fontWeight: 'bold', color: '#666', marginBottom: '8px' }}>
          {t('noBooks.supportedFormatsTitle')}
        </p>
        <p style={{ color: '#666', marginBottom: '4px' }}>
          {t('noBooks.supportedFormats.pdf')}
        </p>
        <p style={{ color: '#666', marginBottom: '4px' }}>
          {t('noBooks.supportedFormats.epub')}
        </p>
        <p style={{ color: '#666' }}>
          {t('noBooks.supportedFormats.doc')}
        </p>
      </div>
    </div>
  );
};

export default NoBooks;