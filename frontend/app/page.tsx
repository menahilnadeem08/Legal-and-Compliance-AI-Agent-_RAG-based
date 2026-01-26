import ChatInterface from './components/ChatInterface';
import FileUpload from './components/FileUpload';
import DocumentList from './components/DocumentList';
export default function Home() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 h-screen">
      <div className="md:col-span-1">
        <FileUpload />
        <DocumentList />

      </div>
      <div className="md:col-span-2">
        <ChatInterface />
      </div>
    </div>
  );
}