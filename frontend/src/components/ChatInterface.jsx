import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, RefreshCw, ThumbsUp, ThumbsDown, Copy, FileText, MoreVertical, Search, PanelLeft } from 'lucide-react';
import { cn } from '../lib/utils';

const ChatInterface = ({ project, onToggleSidebar, isSidebarOpen }) => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'ai',
      content: `Hello! I'm ready to answer questions based on the knowledge base. You can ask me about:`,
      suggestions: ['Project timeline', 'Technical specifications', 'Budget details'],
      timestamp: new Date().toISOString()
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

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
           <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-colors">
            <Search className="w-5 h-5" />
          </button>
          <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-colors">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
        <div className="max-w-3xl mx-auto space-y-6 sm:space-y-8">
          {messages.map((msg) => (
            <div key={msg.id} className={cn("flex gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300", msg.role === 'user' ? "flex-row-reverse" : "")}>
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
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  
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

                {/* Actions */}
                {msg.role === 'ai' && (
                  <div className="mt-2 flex items-center gap-3 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
                     <button className="text-slate-400 hover:text-slate-600" title="Copy"><Copy className="w-3.5 h-3.5" /></button>
                     <button className="text-slate-400 hover:text-slate-600" title="Regenerate"><RefreshCw className="w-3.5 h-3.5" /></button>
                     <div className="w-px h-3 bg-slate-300 mx-1"></div>
                     <button className="text-slate-400 hover:text-green-600" title="Helpful"><ThumbsUp className="w-3.5 h-3.5" /></button>
                     <button className="text-slate-400 hover:text-red-500" title="Not Helpful"><ThumbsDown className="w-3.5 h-3.5" /></button>
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
