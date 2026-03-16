import React, { useState, useEffect, useRef } from 'react';
import { 
  CloudUpload, FileText, Trash2, CheckCircle2, AlertCircle, Loader2, 
  ArrowLeft, Database, HardDrive, Plus, FolderOpen, X, Edit2, 
  RefreshCw, File, FileSpreadsheet, FileImage
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  getKnowledgeBases,
  getKnowledgeStats,
  createKnowledgeBase,
  deleteKnowledgeBase,
  getKnowledgeDocuments,
  getMinioDocuments,
  uploadKnowledgeDocument,
  deleteKnowledgeDocument,
  deleteMinioDocument
} from '../services/api';

const AdminDashboard = ({ onBack }) => {
  // State for knowledge bases
  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [selectedKB, setSelectedKB] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [stats, setStats] = useState({
    total_documents: 0,
    total_storage_display: '0 B',
    indexing_percentage: 100
  });
  
  // UI State
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showExistModal, setShowExistModal] = useState(false);
  const [existingFileInfo, setExistingFileInfo] = useState(null);
  const [newKBName, setNewKBName] = useState('');
  const [newKBDescription, setNewKBDescription] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  
  const fileInputRef = useRef(null);

  // Load knowledge bases on mount
  useEffect(() => {
    loadData();
  }, []);

  // Load documents when selecting a knowledge base
  useEffect(() => {
    if (selectedKB) {
      loadDocuments(selectedKB.dataset_id, selectedKB.name);
    } else {
      setDocuments([]);
    }
  }, [selectedKB]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [kbs, statsData] = await Promise.all([
        getKnowledgeBases(),
        getKnowledgeStats()
      ]);
      setKnowledgeBases(kbs);
      setStats(statsData);
      
      // Auto-select first KB if available
      if (kbs.length > 0 && !selectedKB) {
        setSelectedKB(kbs[0]);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDocuments = async (datasetId, kbName) => {
    try {
      const [djangoDocs, minioDocs] = await Promise.all([
        getKnowledgeDocuments(datasetId),
        getMinioDocuments(kbName)
      ]);
      
      const sanitizeFilename = (nameToSanitize) => {
        if (!nameToSanitize) return '';
        // Same logic as Python's _folder_name_from_filename
        const filename = nameToSanitize.split('/').pop();
        const lastDotIndex = filename.lastIndexOf('.');
        const ext = lastDotIndex !== -1 ? filename.substring(lastDotIndex) : '';
        const base = lastDotIndex !== -1 ? filename.substring(0, lastDotIndex) : filename;
        
        const noAccents = base.normalize('NFKD').replace(/[\u0300-\u036f]/g, "");
        const cleanName = noAccents.replace(/[^A-Za-z0-9\s_]/g, '');
        const sanitizedBase = cleanName.trim().split(/\s+/).join('_');
        
        return (sanitizedBase + ext).toLowerCase();
      };

      // Map unique documents (prefer Django for metadata)
      const uniqueDocsMap = new Map();

      // 1. First Pass: Add Django documents. Lowercase name is key.
      djangoDocs.forEach(d => {
        const uploaderName = typeof d.uploaded_by === 'object' 
          ? d.uploaded_by?.name || d.uploaded_by?.email || 'User' 
          : d.uploaded_by || 'System';
        
        uniqueDocsMap.set(d.name.toLowerCase(), {
          ...d,
          file_size_display: d.file_size_display || formatFileSize(d.file_size),
          uploader_name: uploaderName,
          sanitizedName: sanitizeFilename(d.name),
          isDjango: true
        });
      });

      // 2. Second Pass: Add MinIO documents only if name NOT already present
      // and also check against sanitized name to avoid different-naming conventions of same file
      minioDocs.forEach(m => {
        const mFilename = m.object_name.split('/').pop();
        const mKey = mFilename.toLowerCase();
        const mSanitized = sanitizeFilename(mFilename);
        
        // Find if this MinIO file is already covered by ANY Django file
        const alreadyInDjango = Array.from(uniqueDocsMap.values()).some(d => 
          d.name.toLowerCase() === mKey || 
          d.sanitizedName.toLowerCase() === mSanitized
        );
        
        if (!alreadyInDjango && !uniqueDocsMap.has(mKey)) {
          uniqueDocsMap.set(mKey, {
            id: m.object_name,
            document_id: m.object_name,
            name: mFilename,
            file_type: mFilename.split('.').pop().toLowerCase(),
            file_size: m.size,
            file_size_display: formatFileSize(m.size),
            status: 'ready',
            uploaded_by: 'MinIO',
            uploader_name: 'MinIO',
            created_at: m.last_modified,
            isMinio: true,
            isDjango: false,
            sanitizedName: mSanitized
          });
        }
      });

      // Convert back to array
      setDocuments(Array.from(uniqueDocsMap.values()));
    } catch (error) {
      console.error('Error loading documents:', error);
      // Fallback
      try {
        const docs = await getKnowledgeDocuments(datasetId);
        setDocuments(docs);
      } catch (err) {
        setDocuments([]);
      }
    }
  };

  const handleCreateKB = async () => {
    if (!newKBName.trim()) return;
    
    try {
      const newKB = await createKnowledgeBase(newKBName, newKBDescription);
      setKnowledgeBases([newKB, ...knowledgeBases]);
      setSelectedKB(newKB);
      setShowCreateModal(false);
      setNewKBName('');
      setNewKBDescription('');
      loadData(); // Refresh stats
    } catch (error) {
      alert('Không thể tạo Knowledge Base: ' + error.message);
    }
  };

  const handleDeleteKB = async (kb) => {
    if (!window.confirm(`Xóa "${kb.name}" và tất cả tài liệu bên trong?`)) return;
    
    try {
      await deleteKnowledgeBase(kb.dataset_id);
      setKnowledgeBases(knowledgeBases.filter(k => k.dataset_id !== kb.dataset_id));
      if (selectedKB?.dataset_id === kb.dataset_id) {
        setSelectedKB(knowledgeBases.find(k => k.dataset_id !== kb.dataset_id) || null);
      }
      loadData(); // Refresh stats
    } catch (error) {
      alert('Không thể xóa: ' + error.message);
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      uploadFiles(files);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      uploadFiles(files);
    }
  };

  const uploadFiles = async (files) => {
    if (!selectedKB) {
      alert('Vui lòng chọn một Knowledge Base trước');
      return;
    }
    
    setIsUploading(true);
    
    for (const file of files) {
      const tempId = `temp-${Date.now()}-${file.name}`;
      
      // Add temporary document to list
      setDocuments(prev => [{
        id: tempId,
        document_id: tempId,
        name: file.name,
        file_type: file.name.split('.').pop() || 'other',
        file_size: file.size,
        file_size_display: formatFileSize(file.size),
        status: 'uploading',
        uploaded_by: 'You',
        created_at: new Date().toISOString()
      }, ...prev]);
      
      try {
        const result = await uploadKnowledgeDocument(selectedKB.dataset_id, file, null, selectedKB.name);
        
        if (result && result.status === 'exists') {
          // If already exists, show modal and let user decide
          // For now, remove the temp doc from view and show modal
          setDocuments(prev => prev.filter(d => d.document_id !== tempId));
          setExistingFileInfo({ file, datasetId: selectedKB.dataset_id, kbName: selectedKB.name });
          setShowExistModal(true);
          // Wait for decision (simplified for now: just stop this file processing)
          continue; 
        }

        // Replace temp document with real one
        setDocuments(prev => prev.map(doc => 
          doc.document_id === tempId ? result : doc
        ));
      } catch (error) {
        // Mark as failed
        setDocuments(prev => prev.map(doc => 
          doc.document_id === tempId 
            ? { ...doc, status: 'failed', error_message: error.message }
            : doc
        ));
      }
    }
    
    setIsUploading(false);
    loadData(); // Refresh stats
  };

  const handleConfirmOverwrite = async (overwrite) => {
    if (!existingFileInfo) return;
    const { file, datasetId, kbName } = existingFileInfo;
    
    setShowExistModal(false);
    
    if (overwrite) {
      setIsUploading(true);
      const tempId = `temp-${Date.now()}-${file.name}`;
      
      setDocuments(prev => [{
        id: tempId,
        document_id: tempId,
        name: file.name,
        file_type: file.name.split('.').pop() || 'other',
        file_size: file.size,
        file_size_display: formatFileSize(file.size),
        status: 'uploading',
        uploaded_by: 'You',
        created_at: new Date().toISOString()
      }, ...prev]);
      
      try {
        const result = await uploadKnowledgeDocument(datasetId, file, null, kbName, true);
        setDocuments(prev => prev.map(doc => 
          doc.document_id === tempId ? result : doc
        ));
      } catch (error) {
        setDocuments(prev => prev.map(doc => 
          doc.document_id === tempId 
            ? { ...doc, status: 'failed', error_message: error.message }
            : doc
        ));
      } finally {
        setIsUploading(false);
        setExistingFileInfo(null);
        loadData();
      }
    } else {
      setExistingFileInfo(null);
    }
  };

  const handleDeleteDocument = async (doc) => {
    if (!window.confirm(`Xóa tài liệu "${doc.name}"?`)) return;
    
    try {
      // If it's a MinIO doc, call FastAPI
      if (doc.isMinio) {
        await deleteMinioDocument(doc.name, selectedKB.name);
      } else {
        // Otherwise it's a Django doc, call Django API
        await deleteKnowledgeDocument(selectedKB.dataset_id, doc.document_id);
        // Also attempt to delete from MinIO/Qdrant if it exists there
        try {
          await deleteMinioDocument(doc.name, selectedKB.name);
        } catch (minioErr) {
          console.warn('Failed to delete from MinIO (might not exist):', minioErr);
        }
      }
      
      setDocuments(documents.filter(d => d.document_id !== doc.document_id));
      loadData(); // Refresh stats
    } catch (error) {
      alert('Không thể xóa: ' + error.message);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (fileType) => {
    const iconMap = {
      pdf: <FileText className="w-5 h-5 text-red-500" />,
      docx: <FileText className="w-5 h-5 text-blue-500" />,
      doc: <FileText className="w-5 h-5 text-blue-500" />,
      xlsx: <FileSpreadsheet className="w-5 h-5 text-green-600" />,
      xls: <FileSpreadsheet className="w-5 h-5 text-green-600" />,
      csv: <FileSpreadsheet className="w-5 h-5 text-green-500" />,
      txt: <File className="w-5 h-5 text-slate-500" />,
      md: <File className="w-5 h-5 text-slate-600" />,
      html: <File className="w-5 h-5 text-orange-500" />
    };
    return iconMap[fileType] || <File className="w-5 h-5 text-slate-400" />;
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
            <p className="text-xs text-slate-500">Quản lý tài liệu và kiến thức cho AI</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={loadData}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-600 rounded text-xs font-medium hover:bg-slate-200 transition-colors"
          >
            <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} /> Làm mới
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded text-xs font-medium border border-green-100">
            <HardDrive className="w-3 h-3" /> Local Storage
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Knowledge Base List */}
        <div className="w-72 bg-white border-r border-slate-200 flex flex-col">
          <div className="p-4 border-b border-slate-200">
            <button
              onClick={() => setShowCreateModal(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0E3B8C] text-white rounded-lg font-medium hover:bg-blue-800 transition-colors"
            >
              <Plus className="w-4 h-4" /> Tạo Knowledge Base
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : knowledgeBases.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                <FolderOpen className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                <p>Chưa có Knowledge Base nào</p>
                <p className="text-xs mt-1">Tạo mới để bắt đầu</p>
              </div>
            ) : (
              knowledgeBases.map(kb => (
                <div
                  key={kb.dataset_id}
                  onClick={() => setSelectedKB(kb)}
                  className={cn(
                    "p-3 rounded-lg cursor-pointer mb-2 border transition-all",
                    selectedKB?.dataset_id === kb.dataset_id
                      ? "bg-blue-50 border-blue-200"
                      : "bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-slate-800 truncate">{kb.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {kb.document_count} tài liệu • {kb.word_count.toLocaleString()} từ
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteKB(kb); }}
                      className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
              <p className="text-sm text-slate-500 font-medium">Tổng tài liệu</p>
              <p className="text-2xl font-bold text-slate-800">{stats.total_documents}</p>
            </div>
            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
              <p className="text-sm text-slate-500 font-medium">Dung lượng</p>
              <p className="text-2xl font-bold text-slate-800">{stats.total_storage_display}</p>
            </div>
            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
              <p className="text-sm text-slate-500 font-medium">Trạng thái</p>
              <p className="text-2xl font-bold text-green-600">{stats.indexing_percentage}% Sẵn sàng</p>
            </div>
          </div>

          {selectedKB ? (
            <>
              {/* Upload Area */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  "bg-white p-10 rounded-xl border-2 border-dashed text-center transition-all cursor-pointer group mb-6",
                  isDragging 
                    ? "border-[#0E3B8C] bg-blue-50" 
                    : "border-slate-300 hover:border-[#0E3B8C] hover:bg-blue-50/30"
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.txt,.md,.html,.csv,.xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <CloudUpload className="w-8 h-8 text-[#0E3B8C]" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800">
                  Tải lên tài liệu vào "{selectedKB.name}"
                </h3>
                <p className="text-slate-500 text-sm mt-1 mb-4 max-w-md mx-auto">
                  Kéo thả file hoặc click để chọn. Hỗ trợ: PDF, Word, Excel, TXT, MD, HTML, CSV
                </p>
                <button className="px-6 py-2.5 bg-[#0E3B8C] text-white rounded-lg font-medium shadow-sm hover:bg-blue-800 transition-colors">
                  Chọn file
                </button>
              </div>

              {/* Documents Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
                  <h3 className="font-semibold text-slate-800">
                    Tài liệu ({documents.length})
                  </h3>
                </div>

                {documents.length === 0 ? (
                  <div className="py-12 text-center text-slate-500">
                    <FileText className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                    <p>Chưa có tài liệu nào</p>
                    <p className="text-xs mt-1">Tải lên tài liệu để bắt đầu</p>
                  </div>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3 w-[40%]">Tên file</th>
                        <th className="px-6 py-3">Loại</th>
                        <th className="px-6 py-3">Trạng thái</th>
                        <th className="px-6 py-3">Ngày tải</th>
                        <th className="px-6 py-3 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {documents.map((doc) => (
                        <tr key={doc.document_id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-slate-100 rounded">
                                {getFileIcon(doc.file_type)}
                              </div>
                              <div>
                                <span className="font-medium text-slate-700 block">{doc.name}</span>
                                <span className="text-xs text-slate-400">{doc.file_size_display}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="uppercase text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">
                              {doc.file_type}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {doc.status === 'ready' && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-100">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Sẵn sàng
                              </span>
                            )}
                            {doc.status === 'uploading' && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                <CloudUpload className="w-3.5 h-3.5 animate-bounce" /> Đang tải...
                              </span>
                            )}
                            {doc.status === 'processing' && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang xử lý
                              </span>
                            )}
                            {doc.status === 'failed' && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-100" title={doc.error_message}>
                                <AlertCircle className="w-3.5 h-3.5" /> Lỗi
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-slate-500">
                            <div className="flex flex-col">
                              <span>{new Date(doc.created_at || doc.uploaded_at).toLocaleDateString('vi-VN')}</span>
                              <span className="text-[10px] text-slate-400">bởi {doc.uploader_name || doc.uploaded_by}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={() => handleDeleteDocument(doc)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                              title="Xóa tài liệu"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500">
              <div className="text-center">
                <Database className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                <h3 className="text-lg font-medium text-slate-600">Chọn một Knowledge Base</h3>
                <p className="text-sm mt-1">Hoặc tạo mới để bắt đầu quản lý tài liệu</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create KB Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-800">Tạo Knowledge Base mới</h3>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="p-1 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Tên <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newKBName}
                  onChange={(e) => setNewKBName(e.target.value)}
                  placeholder="VD: Tài liệu sản phẩm"
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0E3B8C] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Mô tả
                </label>
                <textarea
                  value={newKBDescription}
                  onChange={(e) => setNewKBDescription(e.target.value)}
                  placeholder="Mô tả ngắn về knowledge base này..."
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0E3B8C] focus:border-transparent resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleCreateKB}
                disabled={!newKBName.trim()}
                className="px-4 py-2 bg-[#0E3B8C] text-white rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Tạo mới
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Exists Warning Modal */}
      {showExistModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-slate-200 scale-in duration-300">
            <div className="p-1.5 bg-yellow-500/10"></div>
            <div className="p-8 text-center">
              <div className="mx-auto w-16 h-16 bg-yellow-50 text-yellow-500 rounded-full flex items-center justify-center mb-6 ring-8 ring-yellow-500/5">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">File already exists</h3>
              <p className="text-slate-600 mb-8 leading-relaxed">
                Tài liệu <span className="font-semibold text-slate-800">"{existingFileInfo?.file?.name}"</span> đã có trong hệ thống. Bạn có muốn sử dụng lại file cũ hay ghi đè bằng file mới?
              </p>
              
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleConfirmOverwrite(false)}
                  className="flex items-center justify-center gap-2 px-5 py-3 bg-white border-2 border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-[0.98]"
                >
                  <FolderOpen className="w-4 h-4" /> Sử dụng cũ
                </button>
                <button
                  onClick={() => handleConfirmOverwrite(true)}
                  className="flex items-center justify-center gap-2 px-5 py-3 bg-[#0E3B8C] text-white font-bold rounded-xl hover:bg-blue-800 shadow-lg shadow-blue-900/10 transition-all active:scale-[0.98]"
                >
                  <RefreshCw className="w-4 h-4" /> Ghi đè mới
                </button>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-center">
              <button 
                onClick={() => setShowExistModal(false)}
                className="text-slate-400 text-sm hover:text-slate-600 transition-colors py-1 px-4"
              >
                Đóng lại
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
