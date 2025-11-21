import React from 'react';
import { MessageSquare, Plus, Settings, LayoutDashboard, FileText, X } from 'lucide-react';
import { cn } from '../lib/utils';

const Sidebar = ({ 
  chatHistory, 
  activeChatId, 
  onSelectChat, 
  onNewChat,
  isAdmin,
  onOpenAdmin,
  isOpen,
  onClose
}) => {
  const groupedChats = {
    'Today': chatHistory.filter(c => c.group === 'Today'),
    'Yesterday': chatHistory.filter(c => c.group === 'Yesterday'),
    'Previous 7 Days': chatHistory.filter(c => c.group === 'Previous 7 Days'),
  };

  return (
    <>
      {/* Mobile Overlay: Only shows when open on mobile */}
      <div 
        className={cn(
          "fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity duration-300",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Sidebar Container */}
      <div className={cn(
        "bg-slate-50 border-r border-slate-200 h-full flex flex-col shadow-xl md:shadow-none transition-all duration-300 ease-in-out overflow-hidden z-50",
        // Mobile Logic (Fixed position, slide in/out)
        "fixed inset-y-0 left-0",
        isOpen ? "translate-x-0" : "-translate-x-full",
        
        // Desktop Logic (Relative position, width collapse)
        // When open: relative, translate-0, width-64
        // When closed: relative, translate-0, width-0
        "md:relative md:translate-x-0",
        isOpen ? "md:w-64" : "md:w-0 md:border-none"
      )}>
        {/* Inner Content Container - width fixed to 64 (16rem) so content doesn't squash during transition */}
        <div className="w-64 h-full flex flex-col">
          
          {/* Header */}
          <div className="p-4 border-b border-slate-200 flex-shrink-0">
             <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-[#0E3B8C]">
                  <div className="bg-[#0E3B8C] p-1.5 rounded-md">
                    <FileText className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h1 className="font-bold text-lg leading-tight">ProjectDoc</h1>
                  </div>
                </div>
                {/* Mobile Close Button */}
                <button onClick={onClose} className="md:hidden p-1 text-slate-400 hover:text-slate-600">
                  <X className="w-6 h-6" />
                </button>
             </div>

            <button 
              onClick={onNewChat}
              className="w-full flex items-center justify-center gap-2 bg-white border border-slate-300 text-slate-700 px-3 py-2.5 rounded-md hover:border-[#0E3B8C] hover:text-[#0E3B8C] hover:shadow-sm transition-all text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              <span>New Conversation</span>
            </button>
          </div>

          {/* Chat History List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
            {Object.entries(groupedChats).map(([groupName, chats]) => (
              chats.length > 0 && (
                <div key={groupName}>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-2">{groupName}</h3>
                  <div className="space-y-1">
                    {chats.map((chat) => (
                      <button
                        key={chat.id}
                        onClick={() => onSelectChat(chat.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 group",
                          activeChatId === chat.id 
                            ? "bg-[#0E3B8C] text-white shadow-md" 
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        )}
                      >
                        <MessageSquare className={cn(
                          "w-4 h-4",
                          activeChatId === chat.id ? "text-white" : "text-slate-400 group-hover:text-slate-600"
                        )} />
                        <span className="truncate flex-1 text-left">
                          {chat.title}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            ))}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-slate-200 bg-white flex-shrink-0">
            {isAdmin && (
              <button 
                onClick={onOpenAdmin}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-slate-100 text-sm text-slate-700 font-medium transition-colors mb-2 border border-transparent hover:border-slate-200"
              >
                <LayoutDashboard className="w-4 h-4 text-[#0E3B8C]" />
                <span>Knowledge Base</span>
              </button>
            )}
            
            <div className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-50 cursor-pointer transition-colors">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                JD
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-medium text-slate-900 truncate">John Doe</p>
                <p className="text-xs text-slate-500 truncate">Admin</p>
              </div>
              <Settings className="w-4 h-4 text-slate-400 hover:text-slate-600" />
            </div>
          </div>

        </div>
      </div>
    </>
  );
};

export default Sidebar;
