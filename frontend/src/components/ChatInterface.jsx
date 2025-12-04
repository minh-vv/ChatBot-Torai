import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, RefreshCw, ThumbsUp, ThumbsDown, Copy, FileText, MoreVertical, Search, PanelLeft, X, ChevronUp, ChevronDown, CheckCircle, Trash2, Download, Settings, HelpCircle } from 'lucide-react';
import { cn } from '../lib/utils';

const ChatInterface = ({ project, onToggleSidebar, isSidebarOpen }) => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'ai',
      content: `Hello! I'm ready to answer questions based on the knowledge base. You can ask me about:`,
      suggestions: ['Project timeline', 'Technical specifications', 'Budget details'],
      timestamp: new Date().toISOString()
    },
    {
      id: 2,
      role: 'user',
      content: 'Tell me about payment gateway process',
      timestamp: new Date().toISOString()
    },
    {
      id: 3,
      role: 'ai',
      content: "Here is the information you requested based on the manual. The payment gateway process involves three main steps: Authentication, Authorization, and Settlement. Please refer to the API documentation for specific error codes.",
      sources: [
        { name: 'API_v2.pdf', page: 12 },
        { name: 'Payment_Flow.docx', page: 4 }
      ],
      timestamp: new Date().toISOString()
    },
    {
      id: 4,
      role: 'user',
      content: 'What are the authentication requirements?',
      timestamp: new Date().toISOString()
    },
    {
      id: 5,
      role: 'ai',
      content: "For authentication, you need to provide API key, merchant ID, and timestamp. The system uses HMAC-SHA256 for request signing to ensure security. All requests must include proper headers for authentication.",
      timestamp: new Date().toISOString()
    },
    {
      id: 6,
      role: 'user',
      content: 'How do I handle error responses?',
      timestamp: new Date().toISOString()
    },
    {
      id: 7,
      role: 'ai',
      content: "Error responses follow standard HTTP status codes. For payment failures, you'll receive 4xx or 5xx status codes with detailed error messages in the response body. Common errors include insufficient funds (402), card declined (403), or system errors (500).",
      timestamp: new Date().toISOString()
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [currentResultIndex, setCurrentResultIndex] = useState(-1);
  const [messageFeedback, setMessageFeedback] = useState({}); // { messageId: 'like' | 'dislike' | null }
  const [copiedMessages, setCopiedMessages] = useState(new Set()); // Track copied messages
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const messagesEndRef = useRef(null);

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
      if (message.content.toLowerCase().includes(query.toLowerCase())) {
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

    // Scroll to the message
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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isMoreMenuOpen && !event.target.closest('.more-menu-container')) {
        setIsMoreMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMoreMenuOpen]);

  // Handle feedback (like/dislike)
  const handleFeedback = (messageId, feedbackType) => {
    setMessageFeedback(prev => {
      const currentFeedback = prev[messageId];
      if (currentFeedback === feedbackType) {
        // If clicking the same feedback type, remove it
        const newFeedback = { ...prev };
        delete newFeedback[messageId];
        return newFeedback;
      } else {
        // Set new feedback
        return { ...prev, [messageId]: feedbackType };
      }
    });
  };

  // Handle copy message content
  const handleCopyMessage = async (messageId) => {
    const message = messages.find(msg => msg.id === messageId);
    if (message) {
      try {
        await navigator.clipboard.writeText(message.content);
        // Show check icon for 2 seconds
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

  // Handle more menu actions
  const handleClearChat = () => {
    if (window.confirm('Bạn có chắc muốn xóa toàn bộ lịch sử trò chuyện?')) {
      setMessages([messages[0]]); // Keep only the initial welcome message
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
    alert('Hướng dẫn sử dụng:\n• Gửi tin nhắn để hỏi AI\n• Sử dụng nút tìm kiếm để tìm trong lịch sử\n• Thả tim cho câu trả lời hữu ích\n• Sao chép nội dung tin nhắn');
    setIsMoreMenuOpen(false);
  };

  // Highlight search text in content
  const highlightSearchText = (text, query) => {
    if (!query.trim()) return text;

    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) => {
      if (part.toLowerCase() === query.toLowerCase()) {
        return <mark key={index} className="bg-yellow-200 text-slate-800 px-0.5 rounded">{part}</mark>;
      }
      return part;
    });
  };

  // Simulate AI Response
  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg = {
      id: Date.now(),
      role: 'user',
      content: input,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // Simulate network delay
    setTimeout(() => {
      const aiMsg = {
        id: Date.now() + 1,
        role: 'ai',
        content: "Here is the information you requested based on the manual. The payment gateway process involves three main steps: Authentication, Authorization, and Settlement. Please refer to the API documentation for specific error codes.",
        sources: [
          { name: 'API_v2.pdf', page: 12 },
          { name: 'Payment_Flow.docx', page: 4 }
        ],
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, aiMsg]);
      setIsTyping(false);
    }, 1500);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white relative font-sans">
      {/* Chat Header */}
      <div className="h-14 border-b border-slate-100 flex items-center justify-between px-4 bg-white z-10 shrink-0">
        <div className="flex items-center gap-3">
          {/* Sidebar Toggle Button (Visible on all screens) */}
          <button 
            onClick={onToggleSidebar}
            className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 rounded-md transition-colors"
            title={isSidebarOpen ? "Close Sidebar" : "Open Sidebar"}
          >
            <PanelLeft className="w-5 h-5" />
          </button>

          <div className="font-semibold text-slate-700 text-base truncate max-w-[200px] sm:max-w-md">{project.name}</div>
          <span className="bg-slate-100 text-slate-500 text-xs px-2 py-0.5 rounded-full whitespace-nowrap hidden sm:inline-block">GPT-4o</span>
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

            {/* Dropdown Menu */}
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
                {msg.role === 'ai' ? "AI" : "U"}
              </div>

              {/* Bubble */}
              <div className={cn("flex flex-col max-w-[85%] sm:max-w-[80%]", msg.role === 'user' ? "items-end" : "items-start")}>
                <div className={cn(
                  "px-5 py-3.5 shadow-sm text-[15px] leading-relaxed",
                  msg.role === 'user' 
                    ? "bg-[#0E3B8C] text-white rounded-2xl rounded-tr-none" 
                    : "bg-slate-50 border border-slate-100 text-slate-800 rounded-2xl rounded-tl-none"
                )}>
                  <p className="whitespace-pre-wrap break-words">
                    {searchQuery ? highlightSearchText(msg.content, searchQuery) : msg.content}
                  </p>
                  
                  {/* Suggestions for initial message */}
                  {msg.suggestions && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {msg.suggestions.map((s, i) => (
                        <button key={i} 
                          onClick={() => setInput(s)}
                          className="text-xs bg-white border border-slate-200 px-3 py-1.5 rounded-full text-slate-600 hover:border-[#0E3B8C] hover:text-[#0E3B8C] transition-all"
                        >
                          {s} →
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

                        {/* Tooltip / Preview Mock */}
                        <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-48 bg-slate-900 text-white text-xs p-2 rounded shadow-xl z-50">
                          Preview of page {source.page}...
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Feedback Actions */}
                {msg.role === 'ai' && (
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

                    {/* Other Actions */}
                    <div className="w-px h-4 bg-slate-300 mx-2"></div>
                    <button className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors opacity-0 group-hover:opacity-100" title="Regenerate">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-4 animate-in fade-in slide-in-from-bottom-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#0E3B8C] to-blue-600 text-white flex items-center justify-center mt-1">AI</div>
              <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-none px-5 py-4 flex items-center gap-1">
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="p-4 sm:p-6 bg-white border-t border-slate-100 shrink-0">
        <div className="max-w-3xl mx-auto relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything regarding this project..."
            className="w-full min-h-[50px] max-h-[150px] bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 pr-24 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0E3B8C]/20 focus:border-[#0E3B8C] resize-none transition-all"
            rows={1}
          />
          
          <div className="absolute bottom-2 right-2 flex items-center gap-1">
             <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors" title="Attach file">
              <Paperclip className="w-4 h-4" />
            </button>
            <button 
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              className={cn(
                "p-2 rounded-lg transition-all duration-200",
                input.trim() && !isTyping
                  ? "bg-[#0E3B8C] text-white shadow-md hover:bg-blue-800 hover:shadow-lg transform hover:-translate-y-0.5" 
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
        <p className="text-center text-[10px] text-slate-400 mt-2 hidden sm:block">
          ProjectDoc Bot can make mistakes. Please verify important information from the sources provided.
        </p>
      </div>
    </div>
  );
};

export default ChatInterface;
