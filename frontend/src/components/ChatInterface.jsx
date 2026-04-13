import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, RefreshCw, ThumbsUp, ThumbsDown, Copy, FileText, MoreVertical, Search, PanelLeft, X, ChevronUp, ChevronDown, CheckCircle, Trash2, Download, Settings, HelpCircle, Image as ImageIcon, ExternalLink, Maximize2, Bot, Sparkles, Zap, Command } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../lib/utils';
import { sendChatMessage, getChatHistory, uploadImage, submitFeedback, getFeedbacks } from '../services/api';

const CodeBlock = ({ children, className }) => {
  const [copied, setCopied] = useState(false);
  const language = className?.replace('language-', '') || 'text';

  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-4 rounded-xl overflow-hidden bg-slate-900 border border-slate-800 shadow-xl">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/50 border-b border-slate-700">
        <span className="text-xs font-mono text-slate-400">{language}</span>
        <button
          onClick={handleCopy}
          className="p-1 px-2 rounded-md hover:bg-slate-700 text-slate-400 hover:text-white transition-all flex items-center gap-1.5"
        >
          {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span className="text-[10px] font-medium">{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
      <div className="p-4 overflow-x-auto">
        <code className={cn("text-sm font-mono text-slate-100 block", className)}>
          {children}
        </code>
      </div>
    </div>
  );
};

const ImageGallery = ({ files }) => {
  if (!files || files.length === 0) return null;

  const count = files.length;
  
  return (
    <div className={cn(
      "grid gap-2 mb-3",
      count === 1 ? "grid-cols-1" : count === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"
    )}>
      {files.map((file, idx) => (
        <div key={idx} className="relative group cursor-zoom-in overflow-hidden rounded-xl border border-slate-200/50 shadow-sm transition-all hover:shadow-md">
          <img 
            src={file.preview || file.file_url} 
            alt={file.name}
            className={cn(
              "w-full h-full object-cover transition-transform duration-500 group-hover:scale-105",
              count === 1 ? "aspect-auto max-h-[400px]" : "aspect-square"
            )}
            onClick={() => window.open(file.preview || file.file_url, '_blank')}
          />
          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
            <Maximize2 className="w-5 h-5 text-white" />
          </div>
        </div>
      ))}
    </div>
  );
};

export const FEEDBACK_OPTIONS_KEY = 'toray_feedback_options';

export const DEFAULT_FEEDBACK_OPTIONS = {
  like: [
    { category: 'User Experience (UX) & Speed', tags: ['Fast', 'Intuitive', 'Simple'] },
    { category: 'Content & Information',        tags: ['Accurate', 'Helpful', 'Detailed'] },
    { category: 'Design & Visuals',             tags: ['Clean', 'Modern', 'Easy to read'] },
  ],
  dislike: [
    { category: 'User Experience (UX) & Speed', tags: ['Slow', 'Confusing', 'Too many steps'] },
    { category: 'Content & Information',        tags: ['Vague', 'Outdated', 'Irrelevant'] },
    { category: 'Design & Visuals',             tags: ['Cluttered', 'Small font', 'Ugly'] },
  ],
};

const getFeedbackOptions = () => {
  try {
    const stored = localStorage.getItem(FEEDBACK_OPTIONS_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_FEEDBACK_OPTIONS;
  } catch {
    return DEFAULT_FEEDBACK_OPTIONS;
  }
};

const ChatInterface = ({ project, conversationId, userId, onConversationCreated, onToggleSidebar, isSidebarOpen }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [currentResultIndex, setCurrentResultIndex] = useState(-1);
  const [messageFeedback, setMessageFeedback] = useState({});
  const [copiedMessages, setCopiedMessages] = useState(new Set());
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]); // Files waiting to be sent
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState(conversationId);
  const [isDragging, setIsDragging] = useState(false); // Drag and drop state
  const [feedbackModal, setFeedbackModal] = useState({
    open: false, messageId: null, type: null, selectedTags: [], comment: ''
  });
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const currentAiMsgIdRef = useRef(null); // Track current AI message ID for streaming
  const loadRequestIdRef = useRef(0);

  // Load chat history when conversation changes
  useEffect(() => {
    const loadHistory = async () => {
      const requestId = ++loadRequestIdRef.current;
      // Clear previous state first
      setMessageFeedback({});
      setMessages([]);
      
      if (conversationId) {
        setIsLoadingHistory(true);
        try {
          // Load in parallel but do not block history on feedback failure
          const [historyResult, feedbackResult] = await Promise.allSettled([
            getChatHistory(conversationId),
            getFeedbacks(conversationId)
          ]);
          if (requestId !== loadRequestIdRef.current) return;

          const history = historyResult.status === 'fulfilled' ? historyResult.value : { data: [] };
          const feedbacks = feedbackResult.status === 'fulfilled' ? feedbackResult.value : {};
          
          if (history && history.data && history.data.length > 0) {
            // Convert Dify history format to our message format
            // Dify API usually returns newest first, but if the display is inverted, 
            // we should adjust based on the current API behavior.
            const formattedMessages = history.data
              .slice()  // Create a copy to avoid mutating original
              .flatMap((item, index) => {
                const msgId = item.id || `msg-${index}`;
                // Map files from message_files (Dify API uses message_files) or files
                const rawFiles = item.message_files || item.files || [];
                const messageFiles = rawFiles.map(f => ({
                  id: f.id,
                  name: f.original_name,
                  file_url: f.url || f.file_url,
                  file_type: f.file_type || f.type,
                  mime_type: f.mime_type
                }));
                
                return [
                  {
                    id: `${msgId}-user`,
                    role: 'user',
                    content: item.query,
                    timestamp: item.created_at,
                    files: messageFiles.length > 0 ? messageFiles : undefined
                  },
                  {
                    id: `${msgId}-ai`,
                    role: 'ai',
                    content: item.answer,
                    timestamp: item.created_at
                  }
                ];
              });
            
            if (requestId !== loadRequestIdRef.current) return;
            setMessages(formattedMessages);
            
            // Load feedbacks - map by message_id
            if (feedbacks && Object.keys(feedbacks || {}).length > 0) {
              const feedbackMap = {};
              for (const [msgId, fb] of Object.entries(feedbacks)) {
                feedbackMap[msgId] = fb.rating;
              }
              if (requestId !== loadRequestIdRef.current) return;
              setMessageFeedback(feedbackMap);
            }
          } else {
            // No history - show welcome message
            if (requestId !== loadRequestIdRef.current) return;
            setMessages([getWelcomeMessage()]);
          }
        } catch (error) {
          console.error('Error loading chat history:', error);
          if (requestId !== loadRequestIdRef.current) return;
          setMessages([getWelcomeMessage()]);
        } finally {
          if (requestId === loadRequestIdRef.current) {
            setIsLoadingHistory(false);
          }
        }
      } else {
        // New conversation - show welcome message
        if (requestId !== loadRequestIdRef.current) return;
        setMessages([getWelcomeMessage()]);
      }
      if (requestId === loadRequestIdRef.current) {
        setCurrentConversationId(conversationId);
      }
    };

    loadHistory();
  }, [conversationId]);

  const getWelcomeMessage = () => ({
    id: 'welcome',
    role: 'ai',
    content: `Tôi có thể giúp bạn tìm kiếm thông tin, phân tích tài liệu hoặc thực hiện các tác vụ thông qua bộ công cụ tích hợp.`,
    suggestions: [
      { title: 'Hướng dẫn dùng công cụ Xếp xe', icon: <Zap className="w-5 h-5" />, text: 'Hướng dẫn tôi cách dùng công cụ Xếp xe.' },
      { title: 'Cách sử dụng Zero Barrier', icon: <HelpCircle className="w-5 h-5" />, text: 'Hướng dẫn cách sử dụng Zero Barrier.' },
      { title: 'Hướng dẫn vẽ biểu đồ Gannt Chart bằng ToRAI', icon: <FileText className="w-5 h-5" />, text: 'Hướng dẫn tôi vẽ biểu đồ Gannt Chart bằng ToRAI.' },
      { title: 'Sinh HTML Code báo cáo tuần bằng ToRAI', icon: <Bot className="w-5 h-5" />, text: 'Hãy giúp tôi sinh HTML Code báo cáo tuần bằng ToRAI.' },
    ],
    timestamp: new Date().toISOString()
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Search functionality
  const performSearch = (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      setCurrentResultIndex(-1);
      return;
    }

    const results = [];
    messages.forEach((message, index) => {
      if (message.content && message.content.toLowerCase().includes(query.toLowerCase())) {
        results.push({
          messageIndex: index,
          messageId: message.id,
          content: message.content,
          role: message.role
        });
      }
    });

    setSearchResults(results);
    setCurrentResultIndex(results.length > 0 ? 0 : -1);
  };

  const navigateToResult = (direction) => {
    if (searchResults.length === 0) return;

    let newIndex;
    if (direction === 'next') {
      newIndex = currentResultIndex < searchResults.length - 1 ? currentResultIndex + 1 : 0;
    } else {
      newIndex = currentResultIndex > 0 ? currentResultIndex - 1 : searchResults.length - 1;
    }

    setCurrentResultIndex(newIndex);

    const messageElement = document.getElementById(`message-${searchResults[newIndex].messageId}`);
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        navigateToResult('prev');
      } else {
        navigateToResult('next');
      }
    } else if (e.key === 'Escape') {
      setIsSearchOpen(false);
      setSearchQuery('');
      setSearchResults([]);
      setCurrentResultIndex(-1);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    performSearch(searchQuery);
  }, [searchQuery, messages]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isMoreMenuOpen && !event.target.closest('.more-menu-container')) {
        setIsMoreMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMoreMenuOpen]);

  const handleFeedback = (messageId, feedbackType) => {
    const currentFeedback = messageFeedback[messageId];
    if (currentFeedback === feedbackType) {
      // Toggle off — remove feedback without modal
      setMessageFeedback(prev => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
      submitFeedback(messageId, null, currentConversationId || '').catch(console.error);
    } else {
      // Find the AI message content and the preceding user query
      const msgIndex = messages.findIndex(m => m.id === messageId);
      const aiAnswer = msgIndex >= 0 ? (messages[msgIndex].content || '') : '';
      const userQuery = msgIndex > 0 ? (messages[msgIndex - 1].content || '') : '';
      setFeedbackModal({
        open: true, messageId, type: feedbackType,
        selectedTags: [], comment: '',
        query: userQuery, answer: aiAnswer,
      });
    }
  };

  const handleToggleTag = (tag) => {
    setFeedbackModal(prev => {
      const already = prev.selectedTags.includes(tag);
      return {
        ...prev,
        selectedTags: already
          ? prev.selectedTags.filter(t => t !== tag)
          : [...prev.selectedTags, tag],
      };
    });
  };

  const handleSubmitFeedback = async () => {
    const { messageId, type, selectedTags, comment, query, answer } = feedbackModal;
    const tagPart = selectedTags.join(', ');
    const fullComment = [tagPart, comment.trim()].filter(Boolean).join(' | ');

    // Optimistic UI
    setMessageFeedback(prev => ({ ...prev, [messageId]: type }));
    setFeedbackModal({ open: false, messageId: null, type: null, selectedTags: [], comment: '', query: '', answer: '' });

    try {
      await submitFeedback(messageId, type, currentConversationId || '', fullComment, query || '', answer || '');
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      setMessageFeedback(prev => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
    }
  };

  const handleCloseFeedbackModal = () => {
    setFeedbackModal({ open: false, messageId: null, type: null, selectedTags: [], comment: '', query: '', answer: '' });
  };

  const handleCopyMessage = async (messageId) => {
    const message = messages.find(msg => msg.id === messageId);
    if (message) {
      try {
        await navigator.clipboard.writeText(message.content);
        setCopiedMessages(prev => new Set([...prev, messageId]));
        setTimeout(() => {
          setCopiedMessages(prev => {
            const newSet = new Set(prev);
            newSet.delete(messageId);
            return newSet;
          });
        }, 2000);
      } catch (err) {
        console.error('Failed to copy text: ', err);
      }
    }
  };

  const handleClearChat = () => {
    if (window.confirm('Bạn có chắc muốn xóa toàn bộ lịch sử trò chuyện?')) {
      setMessages([getWelcomeMessage()]);
      setMessageFeedback({});
      setCopiedMessages(new Set());
    }
    setIsMoreMenuOpen(false);
  };

  const handleExportChat = () => {
    const chatData = {
      project: project.name,
      timestamp: new Date().toISOString(),
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        sources: msg.sources || []
      }))
    };

    const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-${project.name}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsMoreMenuOpen(false);
  };

  const handleSettings = () => {
    alert('Tính năng cài đặt sẽ được phát triển trong tương lai!');
    setIsMoreMenuOpen(false);
  };

  const handleHelp = () => {
    alert('Hướng dẫn sử dụng:\n• Gửi tin nhắn để hỏi AI\n• Sử dụng nút tìm kiếm để tìm trong lịch sử\n• Thả tim cho câu trả lời hữu ích\n• Sao chép nội dung tin nhắn\n• Đính kèm hình ảnh để hỏi về nội dung');
    setIsMoreMenuOpen(false);
  };

  const highlightSearchText = (text, query) => {
    if (!query.trim() || !text) return text;

    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) => {
      if (part.toLowerCase() === query.toLowerCase()) {
        return <mark key={index} className="bg-yellow-200 text-slate-800 px-0.5 rounded">{part}</mark>;
      }
      return part;
    });
  };

  // Handle sending message with streaming
  const handleSend = async (overrideText) => {
    const textToSend = typeof overrideText === 'string' ? overrideText : input;
    if (!textToSend.trim() && pendingFiles.length === 0) return;

    // Check if any files are still uploading
    if (pendingFiles.some(f => f.uploading)) {
      // Small delay and retry once, or just alert
      alert('Vui lòng đợi hình ảnh tải lên xong trước khi gửi.');
      return;
    }

    const userQuery = textToSend.trim();
    const userMsgId = Date.now();
    
    // Create user message
    const userMsg = {
      id: userMsgId,
      role: 'user',
      content: userQuery,
      timestamp: new Date().toISOString(),
      files: pendingFiles.length > 0 ? [...pendingFiles] : undefined
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // Prepare files for Dify API
    const difyFiles = pendingFiles
      .filter(f => f.dify_file_id || f.id_dify) // Support both naming conventions
      .map(f => ({
        type: 'image',
        transfer_method: 'local_file',
        upload_file_id: f.dify_file_id || f.id_dify
      }));
    
    setPendingFiles([]);

    // Create AI message placeholder
    const aiMsgId = userMsgId + 1;
    currentAiMsgIdRef.current = aiMsgId; // Track the current AI message ID
    
    const aiMsg = {
      id: aiMsgId,
      role: 'ai',
      content: '',
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, aiMsg]);

    try {
      await sendChatMessage(
        userQuery,
        currentConversationId || '',
        difyFiles.length > 0 ? difyFiles : undefined,
        // onChunk callback - update message content incrementally
        (chunk, fullAnswer) => {
          // Use ref to get the current AI message ID (may have been updated)
          const currentId = currentAiMsgIdRef.current;
          setMessages(prev => prev.map(msg => 
            msg.id === currentId 
              ? { ...msg, content: fullAnswer }
              : msg
          ));
        },
        // onComplete callback
        (fullAnswer, newConversationId, messageId, llmTitle) => {
          setIsTyping(false);
          
          // Update AI message with correct ID from backend (for feedback matching)
          if (messageId) {
            const newAiMsgId = `${messageId}-ai`;
            const currentId = currentAiMsgIdRef.current;
            setMessages(prev => prev.map(msg => 
              msg.id === currentId 
                ? { ...msg, id: newAiMsgId, content: fullAnswer }
                : msg
            ));
            currentAiMsgIdRef.current = newAiMsgId; // Update ref
          }
          
          // If this is a new conversation, notify parent
          if (!currentConversationId && newConversationId) {
            setCurrentConversationId(newConversationId);
            // Ưu tiên dùng llmTitle nếu có, nếu không thì cắt query
            const finalTitle = llmTitle || (userQuery.slice(0, 50) + (userQuery.length > 50 ? '...' : ''));
            onConversationCreated && onConversationCreated(
              newConversationId, 
              finalTitle
            );
          }
        },
        // onMessageId callback - update message ID early for feedback
        (messageId) => {
          if (messageId) {
            const newAiMsgId = `${messageId}-ai`;
            const currentId = currentAiMsgIdRef.current;
            setMessages(prev => prev.map(msg => 
              msg.id === currentId 
                ? { ...msg, id: newAiMsgId }
                : msg
            ));
            currentAiMsgIdRef.current = newAiMsgId; // Update ref so onChunk uses new ID
          }
        }
      );
    } catch (error) {
      console.error('Error sending message:', error);
      const currentId = currentAiMsgIdRef.current;
      setMessages(prev => prev.map(msg => 
        msg.id === currentId 
          ? { ...msg, content: 'Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại.' }
          : msg
      ));
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Max file size: 10MB
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const MAX_FILES = 5;

  // Upload a single file
  const uploadSingleFile = async (file) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      throw new Error(`${file.name} không phải là hình ảnh.`);
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`${file.name} vượt quá 10MB.`);
    }

    const tempId = Date.now() + Math.random();
    const tempFile = {
      id: tempId,
      name: file.name,
      type: file.type,
      size: file.size,
      uploading: true,
      preview: URL.createObjectURL(file)
    };
    
    setPendingFiles(prev => [...prev, tempFile]);

    try {
      const result = await uploadImage(file);
      
      setPendingFiles(prev => prev.map(f => 
        f.id === tempId 
          ? { 
              ...f, 
              uploading: false, 
              dify_file_id: result.dify_file_id || result.file_id || result.id,
              file_url: result.file_url || f.preview
            }
          : f
      ));
    } catch (error) {
      console.error('Error uploading file:', error);
      setPendingFiles(prev => prev.filter(f => f.id !== tempId));
      throw error;
    }
  };

  // Handle file selection and upload (supports multiple files)
  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Check max files limit
    if (pendingFiles.length + files.length > MAX_FILES) {
      alert(`Chỉ có thể đính kèm tối đa ${MAX_FILES} ảnh.`);
      return;
    }

    const errors = [];
    
    for (const file of files) {
      try {
        await uploadSingleFile(file);
      } catch (error) {
        errors.push(error.message);
      }
    }

    if (errors.length > 0) {
      alert('Lỗi upload:\n' + errors.join('\n'));
    }
    
    // Reset input
    e.target.value = '';
  };

  // Handle drag and drop
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    
    if (files.length === 0) {
      alert('Chỉ hỗ trợ upload hình ảnh.');
      return;
    }

    if (pendingFiles.length + files.length > MAX_FILES) {
      alert(`Chỉ có thể đính kèm tối đa ${MAX_FILES} ảnh.`);
      return;
    }

    const errors = [];
    
    for (const file of files) {
      try {
        await uploadSingleFile(file);
      } catch (error) {
        errors.push(error.message);
      }
    }

    if (errors.length > 0) {
      alert('Lỗi upload:\n' + errors.join('\n'));
    }
  };

  // Handle paste image from clipboard
  const handlePaste = async (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter(item => item.type.startsWith('image/'));
    
    if (imageItems.length === 0) return;

    e.preventDefault();

    if (pendingFiles.length + imageItems.length > MAX_FILES) {
      alert(`Chỉ có thể đính kèm tối đa ${MAX_FILES} ảnh.`);
      return;
    }

    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file) {
        try {
          await uploadSingleFile(file);
        } catch (error) {
          alert(error.message);
        }
      }
    }
  };

  // Remove pending file
  const removePendingFile = (fileId) => {
    setPendingFiles(prev => {
      const file = prev.find(f => f.id === fileId);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter(f => f.id !== fileId);
    });
  };

  if (isLoadingHistory) {
    return (
      <div className="flex flex-col h-screen bg-white items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-[#0E3B8C] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-600">Đang tải lịch sử chat...</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="flex flex-col h-screen bg-white relative font-sans"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Chat Header */}
      <div className="h-14 border-b border-slate-100 flex items-center justify-between px-4 bg-white z-10 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSidebar}
            className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 rounded-md transition-colors"
            title={isSidebarOpen ? "Close Sidebar" : "Open Sidebar"}
          >
            <PanelLeft className="w-5 h-5" />
          </button>

          <div className="font-semibold text-slate-700 text-base truncate max-w-[200px] sm:max-w-md">{project.name}</div>
          <span className="bg-slate-100 text-slate-500 text-xs px-2 py-0.5 rounded-full whitespace-nowrap hidden sm:inline-block">Dify AI</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => setIsSearchOpen(true)}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-colors"
            title="Search messages"
          >
            <Search className="w-5 h-5" />
          </button>
          <div className="relative more-menu-container">
            <button
              onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-colors"
              title="Thêm tùy chọn"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {isMoreMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50">
                <div className="py-1">
                  <button
                    onClick={handleClearChat}
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                    Xóa lịch sử trò chuyện
                  </button>
                  <button
                    onClick={handleExportChat}
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
                  >
                    <Download className="w-4 h-4 text-blue-500" />
                    Xuất lịch sử trò chuyện
                  </button>
                  <div className="border-t border-slate-100 my-1"></div>
                  <button
                    onClick={handleSettings}
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
                  >
                    <Settings className="w-4 h-4 text-slate-500" />
                    Cài đặt
                  </button>
                  <button
                    onClick={handleHelp}
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
                  >
                    <HelpCircle className="w-4 h-4 text-slate-500" />
                    Trợ giúp
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search Modal */}
      {isSearchOpen && (
        <div className="absolute top-14 left-0 right-0 z-20 bg-white border-b border-slate-200 shadow-lg p-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm kiếm trong đoạn chat..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0E3B8C]/20 focus:border-[#0E3B8C] text-sm"
                  autoFocus
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                {searchResults.length > 0 && (
                  <>
                    <span>{currentResultIndex + 1} / {searchResults.length}</span>
                    <button
                      onClick={() => navigateToResult('prev')}
                      className="p-1 hover:bg-slate-100 rounded"
                      title="Previous result"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => navigateToResult('next')}
                      className="p-1 hover:bg-slate-100 rounded"
                      title="Next result"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
              <button
                onClick={() => {
                  setIsSearchOpen(false);
                  setSearchQuery('');
                  setSearchResults([]);
                  setCurrentResultIndex(-1);
                }}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                title="Close search"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {searchQuery && searchResults.length === 0 && (
              <div className="mt-3 text-sm text-slate-500">
                Không tìm thấy kết quả cho "{searchQuery}"
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
        <div className="max-w-3xl mx-auto space-y-6 sm:space-y-8">
          {messages.length === 1 && messages[0].id === 'welcome' ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-in fade-in zoom-in-95 duration-700">
              <div className="relative mb-8">
                <div className="absolute inset-0 bg-blue-500/10 blur-3xl rounded-full scale-150 animate-pulse"></div>
                <div className="relative w-24 h-24 bg-white rounded-3xl shadow-2xl flex items-center justify-center border border-slate-100 transform -rotate-6">
                  <Bot className="w-12 h-12 text-[#0E3B8C]" />
                </div>
              </div>

              <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4 tracking-tight">
                Tôi có thể hỗ trợ gì cho bạn?
              </h1>
              
              <p className="text-slate-500 max-w-lg mb-10 leading-relaxed">
                Chào mừng bạn đến với <span className="text-[#0E3B8C] font-semibold">Toray AI Assistant</span>. Tôi là trợ lý thông minh hướng dẫn bạn <span className="text-blue-600 font-medium cursor-pointer hover:underline">sử dụng các công cụ</span>.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                {messages[0].suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(s.text)}
                    className="group p-5 bg-white border border-slate-100 rounded-2xl text-left hover:border-blue-400 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300 transform hover:-translate-y-1 active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-slate-50 rounded-xl text-[#0E3B8C] group-hover:bg-blue-50 transition-colors shrink-0">
                        {s.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 group-hover:text-[#0E3B8C] transition-colors line-clamp-2 pr-2">{s.title}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
              <div
                key={msg.id}
                id={`message-${msg.id}`}
                className={cn(
                  "flex gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300",
                  searchResults.some(r => r.messageId === msg.id) && searchQuery ? "bg-yellow-50 -mx-4 px-4 py-2 rounded-lg" : "",
                  msg.role === 'user' ? "flex-row-reverse" : ""
                )}
              >
                {/* Avatar */}
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1 shadow-sm",
                  msg.role === 'ai' ? "bg-gradient-to-br from-[#0E3B8C] to-blue-600 text-white" : "bg-slate-200 text-slate-600"
                )}>
                  {msg.role === 'ai' ? <Bot className="w-5 h-5" /> : "U"}
                </div>

                {/* Bubble */}
                <div className={cn("flex flex-col max-w-[85%] sm:max-w-[80%]", msg.role === 'user' ? "items-end" : "items-start")}>
                  <div className={cn(
                    "px-5 py-3.5 shadow-sm text-[15px] leading-relaxed transition-all duration-300",
                    msg.role === 'user'
                      ? "bg-[#0E3B8C] text-white rounded-2xl rounded-tr-none shadow-blue-100/50"
                      : "bg-white border border-slate-100 text-slate-800 rounded-2xl rounded-tl-none shadow-slate-100"
                  )}>
                    {msg.role === 'ai' && !msg.content && msg.id !== 'welcome' ? (
                      <div className="flex items-center gap-1.5 py-2 px-1">
                        <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                        <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                        <span className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></span>
                      </div>
                    ) : (
                      <>
                        {/* Display attached images for user messages */}
                        {msg.role === 'user' && msg.files && msg.files.length > 0 && (
                          <ImageGallery files={msg.files} />
                        )}
                        
                        <div className={cn(
                          "markdown-content prose prose-sm sm:prose-base max-w-none break-words",
                          msg.role === 'user' ? "prose-invert text-white prose-p:text-white" : "prose-slate text-slate-800",
                          "prose-headings:font-bold prose-h1:text-xl prose-h2:text-lg prose-h3:text-base",
                          "prose-p:leading-relaxed prose-li:my-1",
                          "prose-pre:p-0 prose-pre:bg-transparent",
                          "prose-img:rounded-xl prose-img:shadow-lg prose-img:my-6",
                          "prose-a:text-blue-500 hover:prose-a:text-blue-600 prose-a:font-semibold prose-a:no-underline hover:prose-a:underline"
                        )}>
                          <ReactMarkdown 
                            remarkPlugins={[remarkGfm]}
                            components={{
                              img: ({node, ...props}) => (
                                <div className="relative group my-6 overflow-hidden rounded-xl border border-slate-200/50 shadow-lg bg-white">
                                  <img 
                                    {...props} 
                                    className="max-w-full h-auto transition-transform duration-500 group-hover:scale-[1.02] cursor-zoom-in block mx-auto" 
                                    alt={props.alt || 'AI generated image'} 
                                    loading="lazy"
                                    onError={(e) => {
                                      console.error("Image failed to load:", e.target.src);
                                      e.target.style.display = 'none';
                                    }}
                                    onClick={(e) => window.open(e.target.src, '_blank')}
                                  />
                                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="bg-black/50 backdrop-blur-sm p-1.5 rounded-lg">
                                      <Maximize2 className="w-4 h-4 text-white" />
                                    </div>
                                  </div>
                                  {props.alt && props.alt !== 'AI generated image' && (
                                    <div className="px-4 py-2 bg-slate-50/80 backdrop-blur-sm text-center border-t border-slate-100">
                                      <p className="text-xs text-slate-500 font-medium italic">{props.alt}</p>
                                    </div>
                                  )}
                                </div>
                              ),
                              a: ({node, ...props}) => (
                                <a {...props} className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-600 font-semibold no-underline hover:underline transition-colors" target="_blank" rel="noopener noreferrer">
                                  {props.children}
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              ),
                              table: ({node, ...props}) => (
                                <div className="overflow-x-auto my-6 border border-slate-200 rounded-xl shadow-sm bg-white">
                                  <table {...props} className="min-w-full divide-y divide-slate-200 border-collapse" />
                                </div>
                              ),
                              th: ({node, ...props}) => (
                                <th {...props} className="px-4 py-3 bg-slate-50 text-left text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200" />
                              ),
                              td: ({node, ...props}) => (
                                <td {...props} className="px-4 py-3 text-sm text-slate-600 border-t border-slate-100" />
                              ),
                              code: ({node, inline, className, children, ...props}) => {
                                return !inline ? (
                                  <CodeBlock className={className}>{String(children).replace(/\n$/, '')}</CodeBlock>
                                ) : (
                                  <code {...props} className="px-1.5 py-0.5 rounded-md bg-slate-100 text-blue-600 font-mono text-xs font-semibold">
                                    {children}
                                  </code>
                                )
                              }
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      </>
                    )}

                    {msg.fileUrl && (
                      <div className="mt-2">
                        {msg.fileType === 'image' ? (
                          <img src={msg.fileUrl} alt="Uploaded" className="max-w-full rounded-lg border border-slate-200" />
                        ) : (
                          <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-600 hover:underline">
                            <FileText className="w-4 h-4" />
                            Download File
                          </a>
                        )}
                      </div>
                    )}

                    {/* Suggestions for initial message */}
                    {msg.suggestions && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {msg.suggestions.map((s, i) => (
                          <button key={i}
                            onClick={() => handleSend(s.text || s)}
                            className="text-xs bg-white border border-slate-200 px-3 py-1.5 rounded-full text-slate-600 hover:border-[#0E3B8C] hover:text-[#0E3B8C] transition-all"
                          >
                            {(s.title || s)} →
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                {/* Sources Citation */}
                {msg.role === 'ai' && msg.sources && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {msg.sources.map((source, idx) => (
                      <div key={idx} className="group relative flex items-center gap-2 bg-white border border-slate-200 rounded-md px-2 py-1 cursor-pointer hover:border-blue-400 hover:shadow-sm transition-all">
                        <FileText className="w-3 h-3 text-blue-500" />
                        <span className="text-xs font-medium text-slate-600 group-hover:text-blue-600">
                          {source.name} <span className="text-slate-400 font-normal">pg.{source.page}</span>
                        </span>

                        <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-48 bg-slate-900 text-white text-xs p-2 rounded shadow-xl z-50">
                          Preview of page {source.page}...
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Feedback Actions */}
                {msg.role === 'ai' && msg.id !== 'welcome' && (
                  <div className="mt-3 flex items-center justify-end gap-1">
                    <button
                      onClick={() => handleCopyMessage(msg.id)}
                      className={cn(
                        "p-1.5 rounded-md transition-colors",
                        copiedMessages.has(msg.id)
                          ? "text-green-600 bg-green-50"
                          : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                      )}
                      title={copiedMessages.has(msg.id) ? "Đã sao chép" : "Sao chép"}
                    >
                      {copiedMessages.has(msg.id) ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                    <div className="w-px h-4 bg-slate-300 mx-1"></div>
                    <button
                      onClick={() => handleFeedback(msg.id, 'like')}
                      className={cn(
                        "p-1.5 rounded-md transition-all duration-200",
                        messageFeedback[msg.id] === 'like'
                          ? "bg-green-100 text-green-600 border border-green-200"
                          : "text-slate-400 hover:text-green-600 hover:bg-green-50"
                      )}
                      title="Hữu ích"
                    >
                      <ThumbsUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleFeedback(msg.id, 'dislike')}
                      className={cn(
                        "p-1.5 rounded-md transition-all duration-200",
                        messageFeedback[msg.id] === 'dislike'
                          ? "bg-red-100 text-red-600 border border-red-200"
                          : "text-slate-400 hover:text-red-500 hover:bg-red-50"
                      )}
                      title="Không hữu ích"
                    >
                      <ThumbsDown className="w-4 h-4" />
                    </button>

                    <div className="w-px h-4 bg-slate-300 mx-2"></div>
                    <button className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors opacity-0 group-hover:opacity-100" title="Regenerate">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isTyping && messages[messages.length - 1]?.role !== 'ai' && (
            <div className="flex gap-4 animate-in fade-in slide-in-from-bottom-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#0E3B8C] to-blue-600 text-white flex items-center justify-center mt-1"><Bot className="w-5 h-5" /></div>
              <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-none px-5 py-4 flex items-center gap-1.5 shadow-sm">
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></span>
              </div>
            </div>
          )}
        </>
      )}
      <div ref={messagesEndRef} />
    </div>
  </div>

      {/* Pending Files Preview */}
      {pendingFiles.length > 0 && (
        <div className="px-4 sm:px-6 py-3 bg-white border-t border-slate-100">
          <div className="max-w-3xl mx-auto flex flex-wrap gap-3">
            {pendingFiles.map((file) => (
              <div key={file.id} className="relative group animate-in zoom-in-50 duration-200">
                <div className="w-20 h-20 rounded-xl overflow-hidden border-2 border-slate-100 shadow-sm transition-all group-hover:border-blue-200 group-hover:shadow-md">
                  <img 
                    src={file.preview} 
                    alt={file.name}
                    className={cn(
                      "w-full h-full object-cover",
                      file.uploading && "brightness-50"
                    )}
                  />
                  {file.uploading && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => removePendingFile(file.id)}
                  className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg transform transition-transform hover:scale-110 z-10"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {feedbackModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200 overflow-hidden">
            {/* Modal Header */}
            <div className={cn(
              "px-6 py-4 flex items-center justify-between border-b",
              feedbackModal.type === 'like' ? "border-green-100 bg-green-50" : "border-red-100 bg-red-50"
            )}>
              <div className="flex items-center gap-2.5">
                {feedbackModal.type === 'like'
                  ? <ThumbsUp className="w-5 h-5 text-green-600" />
                  : <ThumbsDown className="w-5 h-5 text-red-500" />
                }
                <div>
                  <p className={cn("font-semibold text-sm", feedbackModal.type === 'like' ? "text-green-800" : "text-red-700")}>
                    {feedbackModal.type === 'like' ? 'What did you like?' : 'What went wrong?'}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">Select all that apply</p>
                </div>
              </div>
              <button
                onClick={handleCloseFeedbackModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white/70 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-5">
              {getFeedbackOptions()[feedbackModal.type].map(({ category, tags }) => (
                <div key={category}>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">{category}</p>
                  <div className="flex flex-wrap gap-2">
                    {tags.map(tag => {
                      const selected = feedbackModal.selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          onClick={() => handleToggleTag(tag)}
                          className={cn(
                            "px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all duration-150",
                            selected
                              ? feedbackModal.type === 'like'
                                ? "bg-green-100 border-green-300 text-green-800 shadow-sm"
                                : "bg-red-100 border-red-300 text-red-800 shadow-sm"
                              : "bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-white"
                          )}
                        >
                          {selected && <span className="mr-1">✓</span>}
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Optional comment */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">Additional comment (optional)</p>
                <textarea
                  value={feedbackModal.comment}
                  onChange={e => setFeedbackModal(prev => ({ ...prev, comment: e.target.value }))}
                  placeholder="Tell us more..."
                  rows={2}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0E3B8C]/20 focus:border-[#0E3B8C]/40 resize-none bg-slate-50 transition-all"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 pb-5 flex items-center justify-end gap-3">
              <button
                onClick={handleCloseFeedbackModal}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitFeedback}
                className={cn(
                  "px-5 py-2 text-sm font-semibold rounded-lg text-white transition-all shadow-sm hover:shadow-md active:scale-[0.98]",
                  feedbackModal.type === 'like'
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-red-500 hover:bg-red-600"
                )}
              >
                Submit Feedback
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drag and Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-[#0E3B8C]/10 border-2 border-dashed border-[#0E3B8C] rounded-lg z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-white p-6 rounded-xl shadow-lg text-center">
            <ImageIcon className="w-12 h-12 mx-auto text-[#0E3B8C] mb-2" />
            <p className="text-[#0E3B8C] font-medium">Thả hình ảnh vào đây</p>
            <p className="text-slate-500 text-sm">Tối đa {MAX_FILES} ảnh, mỗi ảnh tối đa 10MB</p>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div 
        className="p-4 sm:p-6 bg-white border-t border-slate-100 shrink-0"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="max-w-3xl mx-auto relative group">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Nhập câu hỏi của bạn... (Dán ảnh hoặc kéo thả vào đây)"
            className={cn(
              "w-full min-h-[56px] max-h-[200px] bg-slate-50 border-2 rounded-2xl px-4 py-4 pr-24 text-[15px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/50 resize-none transition-all duration-200 shadow-sm",
              isDragging ? "border-blue-500 bg-blue-50/50" : "border-slate-100 group-hover:border-slate-200"
            )}
            rows={1}
          />

          <div className="absolute bottom-3 right-3 flex items-center gap-1.5 p-1 bg-white/50 backdrop-blur-sm rounded-xl">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-white rounded-xl transition-all shadow-sm active:scale-95"
              title="Đính kèm hình ảnh (tối đa 5 ảnh)"
            >
              <ImageIcon className="w-5 h-5" />
            </button>
            <button
              onClick={handleSend}
              disabled={(!input.trim() && pendingFiles.length === 0) || isTyping}
              className={cn(
                "p-2.5 rounded-xl transition-all duration-300 shadow-md transform active:scale-95",
                (input.trim() || pendingFiles.length > 0) && !isTyping
                  ? "bg-gradient-to-r from-[#0E3B8C] to-blue-600 text-white hover:shadow-blue-200/50 hover:-translate-y-0.5"
                  : "bg-slate-100 text-slate-300 cursor-not-allowed shadow-none"
              )}
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
        <p className="text-center text-[11px] text-slate-400 mt-3 font-medium opacity-70 group-hover:opacity-100 transition-opacity px-4">
          Toray AI can make mistakes. Please double-check important information, especially technical data and professional advice.
        </p>
      </div>
    </div>
  );
};

export default ChatInterface;
