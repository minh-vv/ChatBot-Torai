import React, { useState } from 'react';
import { CloudUpload, FileText, Trash2, CheckCircle2, AlertCircle, Loader2, ArrowLeft, Database, HardDrive } from 'lucide-react';
import { cn } from '../lib/utils';

const AdminDashboard = ({ onBack }) => {
  const [files, setFiles] = useState([
    { id: 1, name: 'Company_Handbook_2024.pdf', s3Key: 'docs/handbook_v2.pdf', size: '2.4 MB', uploadedBy: 'Admin', date: '2024-03-10', status: 'ready' },
    { id: 2, name: 'Product_Specs_v1.docx', s3Key: 'docs/specs_final.docx', size: '1.1 MB', uploadedBy: 'John Doe', date: '2024-03-11', status: 'processing' },
    { id: 3, name: 'Legacy_Data_Export.txt', s3Key: 'docs/err_log.txt', size: '12 KB', uploadedBy: 'Admin', date: '2024-03-12', status: 'failed' },
  ]);

  // Mock S3 Upload function
  const handleUpload = () => {
    const fileName = prompt("Simulate File Select (Enter name):", "New_Policy.pdf");
    if (fileName) {
      // Add file with 'uploading' status
      const newFile = {
        id: Date.now(),
        name: fileName,
        s3Key: `uploads/${Date.now()}_${fileName}`,
        size: 'Pending...',
        uploadedBy: 'Admin',
        date: new Date().toISOString().split('T')[0],
        status: 'uploading'
      };
      setFiles([newFile, ...files]);

      // Simulate Async Upload to S3 & Processing
      setTimeout(() => {
        setFiles(prev => prev.map(f => f.id === newFile.id ? { ...f, status: 'processing', size: '1.5 MB' } : f));
        
        // Simulate Backend Indexing finished
        setTimeout(() => {
           setFiles(prev => prev.map(f => f.id === newFile.id ? { ...f, status: 'ready' } : f));
        }, 3000);
      }, 2000);
    }
  };

  const handleDelete = (id) => {
    if (window.confirm('Delete this file from Knowledge Base & S3?')) {
      setFiles(files.filter(f => f.id !== id));
    }
  };

  return (
    <div className="h-screen bg-slate-50 flex flex-col overflow-hidden font-sans">
      {/* Admin Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
             <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Database className="w-5 h-5 text-[#0E3B8C]" />
              Knowledge Base Management
            </h1>
            <p className="text-xs text-slate-500">Centralized Document Store (S3 Linked)</p>
          </div>
        </div>
        <div className="flex gap-3">
           <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded text-xs font-medium border border-green-100">
             <HardDrive className="w-3 h-3" /> S3 Connection: Active
           </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                <p className="text-sm text-slate-500 font-medium">Total Documents</p>
                <p className="text-2xl font-bold text-slate-800">{files.length}</p>
             </div>
             <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                <p className="text-sm text-slate-500 font-medium">Storage Used</p>
                <p className="text-2xl font-bold text-slate-800">45.2 MB</p>
             </div>
             <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                <p className="text-sm text-slate-500 font-medium">Indexing Status</p>
                <p className="text-2xl font-bold text-green-600">98% Ready</p>
             </div>
          </div>

          {/* Upload Area */}
          <div 
            onClick={handleUpload}
            className="bg-white p-10 rounded-xl border-2 border-dashed border-slate-300 text-center hover:border-[#0E3B8C] hover:bg-blue-50/30 transition-all cursor-pointer group"
          >
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <CloudUpload className="w-8 h-8 text-[#0E3B8C]" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800">Upload to Knowledge Base</h3>
            <p className="text-slate-500 text-sm mt-1 mb-4 max-w-md mx-auto">
              Drag and drop files here. Files will be uploaded to S3 bucket `company-knowledge-base` and automatically indexed.
            </p>
            <button className="px-6 py-2.5 bg-[#0E3B8C] text-white rounded-lg font-medium shadow-sm hover:bg-blue-800 transition-colors">
              Browse Files
            </button>
          </div>

          {/* Files Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
              <h3 className="font-semibold text-slate-800">System Documents</h3>
            </div>

            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 w-[35%]">File Name</th>
                  <th className="px-6 py-3 w-[25%]">S3 Key / Path</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Uploaded</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {files.map((file) => (
                  <tr key={file.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 rounded text-slate-500">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="font-medium text-slate-700 block">{file.name}</span>
                          <span className="text-xs text-slate-400">{file.size}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 font-mono text-xs truncate max-w-[150px]" title={file.s3Key}>
                      {file.s3Key}
                    </td>
                    <td className="px-6 py-4">
                      {file.status === 'ready' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-100">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                        </span>
                      )}
                      {file.status === 'uploading' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                          <CloudUpload className="w-3.5 h-3.5 animate-bounce" /> Uploading...
                        </span>
                      )}
                      {file.status === 'processing' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Indexing
                        </span>
                      )}
                      {file.status === 'failed' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-100">
                          <AlertCircle className="w-3.5 h-3.5" /> Failed
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      <div className="flex flex-col">
                        <span>{file.date}</span>
                        <span className="text-[10px] text-slate-400">by {file.uploadedBy}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleDelete(file.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        title="Delete from S3 & DB"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
