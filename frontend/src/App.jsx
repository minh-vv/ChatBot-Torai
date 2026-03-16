import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import AdminDashboard from './components/AdminDashboard';
import UserManagement from './components/UserManagement';
import FeedbackManagement from './components/FeedbackManagement';
import ProfilePage from './components/ProfilePage';
import AuthPage from './components/AuthPage';
import { useLanguage } from './contexts/LanguageContext';
import { 
  getUserId, 
  getConversations, 
  deleteConversation, 
  renameConversation,
  isAuthenticated,
  getStoredUser,
  logout,
  getCurrentUser
} from './services/api';

// Helper function to categorize conversations by date
const categorizeByDate = (conversations) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  return conversations.map(conv => {
    // Dify timestamps are in seconds, JS Date expects milliseconds
    const updatedAt = (conv.updated_at || conv.created_at) * 1000;
    const convDate = new Date(updatedAt);
    let group = 'Previous 7 Days';
    
    if (convDate >= today) {
      group = 'Today';
    } else if (convDate >= yesterday) {
      group = 'Yesterday';
    }
    
    return {
      ...conv,
      id: conv.id,
      conversation_id: conv.id,
      title: conv.name || 'Cuộc trò chuyện mới',
      group,
      timestamp: updatedAt
    };
  });
};

function App() {
  const { t } = useLanguage();
  const [currentView, setCurrentView] = useState('chat');
  const [chatHistory, setChatHistory] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [userId, setUserId] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  // Responsive Sidebar State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [chatKey, setChatKey] = useState(Date.now()); // Key to force re-render ChatInterface

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      if (isAuthenticated()) {
        const storedUser = getStoredUser();
        if (storedUser) {
          setUser(storedUser);
          setUserId(storedUser.user_id);
          setIsLoggedIn(true);
          
          // Verify token is still valid and sync role
          const currentUser = await getCurrentUser();
          if (!currentUser) {
            // Token expired, logout
            handleLogout();
            return;
          }
          if (currentUser.role) {
            setUser(prev => ({ ...prev, role: currentUser.role }));
          }
          
          // Load conversations
          try {
            const conversations = await getConversations();
            const categorized = categorizeByDate(conversations);
            setChatHistory(categorized);
          } catch (error) {
            console.error('Error loading conversations:', error);
          }
        }
      }
      setIsLoading(false);
    };
    
    checkAuth();
  }, []);

  // Handle successful authentication
  const handleAuthSuccess = async (userData) => {
    setUser(userData);
    setUserId(userData.user_id);
    setIsLoggedIn(true);
    
    // Load conversations
    try {
      const conversations = await getConversations();
      const categorized = categorizeByDate(conversations);
      setChatHistory(categorized);
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    await logout();
    setUser(null);
    setUserId(null);
    setIsLoggedIn(false);
    setChatHistory([]);
    setActiveConversationId(null);
  };

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };
    
    handleResize();
  }, []);

  const isAdmin = user?.role === 'admin';

  // Refresh conversations from server
  const refreshConversations = useCallback(async () => {
    try {
      const conversations = await getConversations();
      const categorized = categorizeByDate(conversations);
      setChatHistory(categorized);
    } catch (error) {
      console.error('Error refreshing conversations:', error);
    }
  }, []);

  // Handle new chat - reset to empty conversation
  const handleNewChat = () => {
    setActiveConversationId(null);
    setChatKey(Date.now()); // Force ChatInterface to re-render
    setCurrentView('chat');
    
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  // Handle selecting a chat from sidebar
  const handleSelectChat = (conversationId) => {
    setActiveConversationId(conversationId);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  // Handle deleting a conversation
  const handleDeleteConversation = async (conversationId) => {
    if (!window.confirm(t('deleteConversationConfirm'))) {
      return;
    }
    
    try {
      await deleteConversation(conversationId);
      setChatHistory(prev => prev.filter(c => c.conversation_id !== conversationId));
      
      // If deleted the active conversation, reset
      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
      alert(t('deleteConversationError'));
    }
  };

  // Handle renaming a conversation
  const handleRenameConversation = async (conversationId, newName) => {
    try {
      await renameConversation(conversationId, newName, false);
      setChatHistory(prev => prev.map(c => 
        c.conversation_id === conversationId 
          ? { ...c, title: newName }
          : c
      ));
    } catch (error) {
      console.error('Error renaming conversation:', error);
      alert(t('renameConversationError'));
    }
  };

  // Callback when a new conversation is created from ChatInterface
  const handleConversationCreated = useCallback((newConversationId, title) => {
    const nowTs = Date.now();
    const newConv = {
      id: newConversationId,
      conversation_id: newConversationId,
      title: title || 'Cuộc trò chuyện mới',
      group: 'Today',
      timestamp: nowTs
    };
    
    setChatHistory(prev => [newConv, ...prev]);
    setActiveConversationId(newConversationId);
  }, []);

  const activeChat = chatHistory.find(c => c.conversation_id === activeConversationId);
  const activeChatTitle = activeChat?.title || "New Conversation";

  const virtualProjectContext = {
    name: activeChatTitle,
    conversationId: activeConversationId,
    userId: userId
  };

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-[#0E3B8C] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-600">{t('loading')}</p>
        </div>
      </div>
    );
  }

  // Show auth page if not logged in
  if (!isLoggedIn) {
    return <AuthPage onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white text-slate-900 font-sans">
      {/* Sidebar */}
      {currentView === 'chat' && (
        <Sidebar 
          chatHistory={chatHistory}
          activeConversationId={activeConversationId}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onDeleteConversation={handleDeleteConversation}
          onRenameConversation={handleRenameConversation}
          isAdmin={isAdmin}
          onOpenAdmin={() => setCurrentView('admin')}
          onOpenUsers={() => setCurrentView('users')}
          onOpenFeedback={() => setCurrentView('feedback')}
          onOpenProfile={() => setCurrentView('profile')}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          user={user}
          onLogout={handleLogout}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 relative h-full overflow-hidden flex flex-col w-full">
        {currentView === 'admin' && isAdmin ? (
          <AdminDashboard 
            onBack={() => setCurrentView('chat')}
          />
        ) : currentView === 'users' && isAdmin ? (
          <UserManagement 
            onBack={() => setCurrentView('chat')}
          />
        ) : currentView === 'feedback' && isAdmin ? (
          <FeedbackManagement 
            onBack={() => setCurrentView('chat')}
          />
        ) : currentView === 'profile' ? (
          <ProfilePage
            user={user}
            onBack={() => setCurrentView('chat')}
            onUserUpdate={(updatedUser) => setUser(updatedUser)}
          />
        ) : (
          <ChatInterface 
            key={activeConversationId || `new-chat-${chatKey}`}
            project={virtualProjectContext}
            conversationId={activeConversationId}
            userId={userId}
            onConversationCreated={handleConversationCreated}
            isSidebarOpen={isSidebarOpen}
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          />
        )}
      </main>
    </div>
  );
}

export default App;
