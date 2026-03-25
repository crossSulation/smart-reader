import React from 'react';

interface NoBooksProps {
  onUploadClick?: () => void;
}

const NoBooks: React.FC<NoBooksProps> = ({ onUploadClick }) => {
  const handleClick = () => {
    if (onUploadClick) {
      onUploadClick();
    } else {
      // 触发父组件中的上传功能
      const uploadBtn = document.querySelector('button[aria-label="upload-book"]');
      if (uploadBtn) {
        uploadBtn.click();
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
          📚 暂无书籍
        </h2>
        <h3 style={{ fontSize: '18px', color: '#333', marginBottom: '16px' }}>
          还没有上传任何书籍
        </h3>
        <p style={{ color: '#666', maxWidth: '600px' }}>
          您可以上传PDF、EPUB或其他支持的电子书格式文件，开始您的智能阅读体验
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
        上传第一本书
      </button>
      
      <div style={{ marginTop: '32px', textAlign: 'left', maxWidth: '600px' }}>
        <p style={{ fontWeight: 'bold', color: '#666', marginBottom: '8px' }}>
          支持的文件格式:
        </p>
        <p style={{ color: '#666', marginBottom: '4px' }}>
          • PDF (.pdf) - 便携式文档格式
        </p>
        <p style={{ color: '#666', marginBottom: '4px' }}>
          • EPUB (.epub) - 电子出版物格式
        </p>
        <p style={{ color: '#666' }}>
          • 文档 (.doc, .docx) - Microsoft Word文档
        </p>
      </div>
    </div>
  );
};

export default NoBooks;