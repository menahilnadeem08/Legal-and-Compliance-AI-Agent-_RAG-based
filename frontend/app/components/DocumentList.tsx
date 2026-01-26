'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';

interface Document {
  id: string;
  name: string;
  type: string;
  version: string;
  upload_date: string;
  is_latest: boolean;
}

export default function DocumentList() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocuments = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/documents');
      setDocuments(response.data);
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this document?')) return;
    try {
      await axios.delete(`http://localhost:5000/api/documents/${id}`);
      fetchDocuments();
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  if (loading) return <p>Loading...</p>;

  return (
    <div className="p-6 bg-white rounded shadow">
      <h2 className="text-xl font-bold mb-4">Documents ({documents.length})</h2>
      <div className="space-y-2">
        {documents.map((doc) => (
          <div key={doc.id} className="p-3 border rounded flex justify-between items-center">
            <div>
              <p className="font-medium">{doc.name}</p>
              <p className="text-sm text-gray-600">
                {doc.type} | v{doc.version} | {new Date(doc.upload_date).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={() => handleDelete(doc.id)}
              className="px-3 py-1 bg-red-500 text-white rounded text-sm"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}