'use client';

import { useState } from 'react';
import ChatInterface from './components/ChatInterface';
import FileUpload from './components/FileUpload';
import DocumentList from './components/DocumentList';

export default function Home() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleUploadSuccess = () => {
    // Increment to trigger DocumentList refresh
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 h-screen">
      <div className="md:col-span-1">
        <FileUpload onUploadSuccess={handleUploadSuccess} />
        <DocumentList key={refreshTrigger} />
      </div>
      <div className="md:col-span-2">
        <ChatInterface />
      </div>
    </div>
  );
}