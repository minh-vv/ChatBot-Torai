import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import AdminDashboard from './components/AdminDashboard';

// Mock Data for Chat History (ChatGPT style)
const MOCK_HISTORY = [
  { id: 1, title: 'HR Policy Questions', group: 'Today', timestamp: new Date().toISOString() },
  { id: 2, title: 'React Component Help', group: 'Today', timestamp: new Date().toISOString() },
  { id: 3, title: 'Q1 Budget Analysis', group: 'Yesterday', timestamp: new Date().toISOString() },
  { id: 4, title: 'Server Config Error', group: 'Previous 7 Days', timestamp: new Date().toISOString() },
  { id: 5, title: 'Marketing Strategy Brainstorm', group: 'Previous 7 Days', timestamp: new Date().toISOString() },
];

function App() {
  const [currentView, setCurrentView] = useState('chat');
  const [chatHistory, setChatHistory] = useState(MOCK_HISTORY);
  const [activeChatId, setActiveChatId] = useState(1);
  
  // Responsive Sidebar State
  // Default: Open on Desktop (>768px), Closed on Mobile
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };
    
    // Set initial state based on screen size
    handleResize();

    // Optional: Add resize listener if you want auto-collapse on resize
    // window.addEventListener('resize', handleResize);
    // return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isAdmin = true; 

  const handleNewChat = () => {
    const newChatId = Date.now();
    const newChat = {
      id: newChatId,
      title: 'New Conversation',
      group: 'Today',
      timestamp: new Date().toISOString()
    };
    setChatHistory([newChat, ...chatHistory]);
    setActiveChatId(newChatId);
    setCurrentView('chat');
    
    // On mobile, auto-close sidebar after creating new chat
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const activeChatTitle = chatHistory.find(c => c.id === activeChatId)?.title || "New Conversation";

  const virtualProjectContext = {
    name: activeChatTitle,
    files: 152, 
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white text-slate-900 font-sans">
      {/* Sidebar */}
      {currentView === 'chat' && (
        <Sidebar 
          chatHistory={chatHistory}
          activeChatId={activeChatId}
          onSelectChat={(id) => {
            setActiveChatId(id);
            // On mobile, auto-close sidebar after selection
            if (window.innerWidth < 768) setIsSidebarOpen(false);
          }}
          onNewChat={handleNewChat}
          isAdmin={isAdmin}
          onOpenAdmin={() => setCurrentView('admin')}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 relative h-full overflow-hidden flex flex-col w-full">
        {currentView === 'admin' ? (
          <AdminDashboard 
            onBack={() => setCurrentView('chat')}
          />
        ) : (
          <ChatInterface 
            project={virtualProjectContext}
            isSidebarOpen={isSidebarOpen}
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          />
        )}
      </main>
    </div>
  );
}

export default App;
