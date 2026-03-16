import React, { useState } from 'react';
import { MessageSquare, Plus, Settings, LayoutDashboard, FileText, X, MoreHorizontal, Trash2, Pencil, Check, LogOut, Users, User, BarChart3 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useLanguage } from '../contexts/LanguageContext';

const Sidebar = ({ 
  chatHistory, 
  activeConversationId, 
  onSelectChat, 
  onNewChat,
  onDeleteConversation,
  onRenameConversation,
  isAdmin,
  onOpenAdmin,
  onOpenUsers,
  onOpenFeedback,
  onOpenProfile,
  isOpen,
  onClose,
  user,
  onLogout
}) => {
  const { t } = useLanguage();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [menuOpenId, setMenuOpenId] = useState(null);

  const groupedChats = {
    'Today': chatHistory.filter(c => c.group === 'Today'),
    'Yesterday': chatHistory.filter(c => c.group === 'Yesterday'),
    'Previous 7 Days': chatHistory.filter(c => c.group === 'Previous 7 Days'),
  };

  const groupLabel = (key) => {
    if (key === 'Today') return t('today');
    if (key === 'Yesterday') return t('yesterday');
    return t('last7Days');
  };

  const handleStartEdit = (chat, e) => {
    e.stopPropagation();
    setEditingId(chat.conversation_id);
    setEditingTitle(chat.title);
    setMenuOpenId(null);
  };

  const handleSaveEdit = (conversationId) => {
    if (editingTitle.trim()) {
      onRenameConversation(conversationId, editingTitle.trim());
    }
    setEditingId(null);
    setEditingTitle('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingTitle('');
  };

  const handleDelete = (conversationId, e) => {
    e.stopPropagation();
    setMenuOpenId(null);
    onDeleteConversation(conversationId);
  };

  const handleKeyDown = (e, conversationId) => {
    if (e.key === 'Enter') {
      handleSaveEdit(conversationId);
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
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
        "fixed inset-y-0 left-0",
        isOpen ? "translate-x-0" : "-translate-x-full",
        "md:relative md:translate-x-0",
        isOpen ? "md:w-64" : "md:w-0 md:border-none"
      )}>
        <div className="w-64 h-full flex flex-col">
          
          {/* Header */}
          <div className="p-4 border-b border-slate-200 flex-shrink-0">
             <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-[#0E3B8C]">
                  <div className="bg-[#0E3B8C] p-1.5 rounded-md">
                    <FileText className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h1 className="font-bold text-lg leading-tight">ChatBot</h1>
                  </div>
                </div>
                <button onClick={onClose} className="md:hidden p-1 text-slate-400 hover:text-slate-600">
                  <X className="w-6 h-6" />
                </button>
             </div>

            <button 
              onClick={onNewChat}
              className="w-full flex items-center justify-center gap-2 bg-white border border-slate-300 text-slate-700 px-3 py-2.5 rounded-md hover:border-[#0E3B8C] hover:text-[#0E3B8C] hover:shadow-sm transition-all text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              <span>{t('newChat')}</span>
            </button>
          </div>

          {/* Chat History List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
            {Object.entries(groupedChats).map(([groupName, chats]) => (
              chats.length > 0 && (
                <div key={groupName}>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-2">
                    {groupLabel(groupName)}
                  </h3>
                  <div className="space-y-1">
                    {chats.map((chat) => (
                      <div
                        key={chat.conversation_id}
                        className={cn(
                          "group relative w-full flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200",
                          activeConversationId === chat.conversation_id 
                            ? "bg-[#0E3B8C] text-white shadow-md" 
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        )}
                      >
                        {editingId === chat.conversation_id ? (
                          <div className="flex items-center gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, chat.conversation_id)}
                              className="flex-1 px-2 py-1 text-sm rounded border border-slate-300 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0E3B8C]"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSaveEdit(chat.conversation_id)}
                              className="p-1 text-green-600 hover:bg-green-100 rounded"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="p-1 text-slate-400 hover:bg-slate-200 rounded"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => onSelectChat(chat.conversation_id)}
                              className="flex items-center gap-3 flex-1 min-w-0"
                            >
                              <MessageSquare className={cn(
                                "w-4 h-4 flex-shrink-0",
                                activeConversationId === chat.conversation_id ? "text-white" : "text-slate-400 group-hover:text-slate-600"
                              )} />
                              <span className="truncate text-left">
                                {chat.title}
                              </span>
                            </button>
                            
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenuOpenId(menuOpenId === chat.conversation_id ? null : chat.conversation_id);
                                }}
                                className={cn(
                                  "p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity",
                                  activeConversationId === chat.conversation_id 
                                    ? "hover:bg-white/20 text-white" 
                                    : "hover:bg-slate-200 text-slate-400"
                                )}
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                              
                              {menuOpenId === chat.conversation_id && (
                                <div 
                                  className="absolute right-0 top-full mt-1 w-36 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    onClick={(e) => handleStartEdit(chat, e)}
                                    className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                    {t('rename')}
                                  </button>
                                  <button
                                    onClick={(e) => handleDelete(chat.conversation_id, e)}
                                    className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    {t('delete')}
                                  </button>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            ))}
            
            {chatHistory.length === 0 && (
              <div className="text-center py-8 text-slate-400 text-sm">
                {t('noChatYet')}
                <br />
                {t('startNewChat')}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-slate-200 bg-white flex-shrink-0">
            {isAdmin && (
              <>
                <button 
                  onClick={onOpenAdmin}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-slate-100 text-sm text-slate-700 font-medium transition-colors mb-1 border border-transparent hover:border-slate-200"
                >
                  <LayoutDashboard className="w-4 h-4 text-[#0E3B8C]" />
                  <span>{t('knowledgeBase')}</span>
                </button>
                <button 
                  onClick={onOpenUsers}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-slate-100 text-sm text-slate-700 font-medium transition-colors mb-1 border border-transparent hover:border-slate-200"
                >
                  <Users className="w-4 h-4 text-[#0E3B8C]" />
                  <span>{t('userManagement')}</span>
                </button>
                <button 
                  onClick={onOpenFeedback}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-slate-100 text-sm text-slate-700 font-medium transition-colors mb-2 border border-transparent hover:border-slate-200"
                >
                  <BarChart3 className="w-4 h-4 text-[#0E3B8C]" />
                  <span>{t('feedbackMgmt')}</span>
                </button>
              </>
            )}
            
            {/* User Info */}
            <div className="relative">
              <div 
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-50 cursor-pointer transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                  {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="text-sm font-medium text-slate-900 truncate">{user?.name || t('user')}</p>
                  <p className="text-xs text-slate-500 truncate">{user?.email || ''}</p>
                </div>
                <Settings className="w-4 h-4 text-slate-400 hover:text-slate-600" />
              </div>

              {/* User Menu Dropdown */}
              {showUserMenu && (
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="text-xs text-slate-400">{t('loggedInAs')}</p>
                    <p className="text-sm text-slate-700 truncate">{user?.email}</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      onOpenProfile && onOpenProfile();
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <User className="w-4 h-4" />
                    {t('profile')}
                  </button>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      onLogout && onLogout();
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    {t('logout')}
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Click outside to close menus */}
      {(menuOpenId || showUserMenu) && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => {
            setMenuOpenId(null);
            setShowUserMenu(false);
          }}
        />
      )}
    </>
  );
};

export default Sidebar;
