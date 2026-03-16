// API Service for ChatBot
const API_BASE_URL = 'http://127.0.0.1:8000/api';
const DIFY_API_URL = 'http://127.0.0.1:8888/dify';

// Check backend health
export const checkHealth = async () => {
  try {
    const response = await fetch(`${DIFY_API_URL}/health`);
    return await response.json();
  } catch (error) {
    console.error('Health check failed:', error);
    return null;
  }
};

// Get stored auth token
export const getAuthToken = () => {
  return localStorage.getItem('auth_token');
};

// Get stored user data
export const getStoredUser = () => {
  const userData = localStorage.getItem('user_data');
  return userData ? JSON.parse(userData) : null;
};

// Save auth data
const saveAuthData = (data) => {
  localStorage.setItem('auth_token', data.token);
  localStorage.setItem('user_data', JSON.stringify({
    user_id: data.user_id,
    email: data.email,
    name: data.name
  }));
};

// Clear auth data
export const clearAuthData = () => {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('user_data');
};

// Check if user is authenticated
export const isAuthenticated = () => {
  return !!getAuthToken() && !!getStoredUser();
};

// Get auth headers
const getAuthHeaders = () => {
  const token = getAuthToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

// Register new user
export const register = async (email, password, name = '') => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/register/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Đăng ký thất bại');
    }
    
    saveAuthData(data);
    return data;
  } catch (error) {
    console.error('Error registering:', error);
    throw error;
  }
};

// Login user
export const login = async (email, password) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Đăng nhập thất bại');
    }
    
    saveAuthData(data);
    return data;
  } catch (error) {
    console.error('Error logging in:', error);
    throw error;
  }
};

// Logout user
export const logout = async () => {
  try {
    await fetch(`${API_BASE_URL}/auth/logout/`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      }
    });
  } catch (error) {
    console.error('Error logging out:', error);
  } finally {
    clearAuthData();
  }
};

// Get current user info
export const getCurrentUser = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/me/`, {
      headers: getAuthHeaders()
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        clearAuthData();
      }
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
};

// Update user profile
export const updateProfile = async (name) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/me/`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ name })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Cập nhật thất bại');
    }
    
    // Update stored user data
    const storedUser = getStoredUser();
    if (storedUser) {
      localStorage.setItem('user_data', JSON.stringify({
        ...storedUser,
        name: data.name
      }));
    }
    
    return data;
  } catch (error) {
    console.error('Error updating profile:', error);
    throw error;
  }
};

// Change password
export const changePassword = async (currentPassword, newPassword) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/change-password/`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ 
        current_password: currentPassword, 
        new_password: newPassword 
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Đổi mật khẩu thất bại');
    }
    
    return data;
  } catch (error) {
    console.error('Error changing password:', error);
    throw error;
  }
};

// ==================== USER MANAGEMENT ====================

// User Management - Get user_id from stored user
export const getUserId = () => {
  const user = getStoredUser();
  return user?.user_id || null;
};

// Create or get user from backend (legacy support)
export const initUser = async () => {
  const user = getStoredUser();
  if (user) {
    return user;
  }
  return null;
};

// Get all conversations for current user from Dify
export const getConversations = async () => {
  const userId = getUserId();
  if (!userId) return [];
  try {
    const response = await fetch(`${DIFY_API_URL}/conversations?user_id=${userId}`);
    const data = await response.json();
    // Dify returns { data: [...], has_more: ..., limit: ... }
    return data.data || [];
  } catch (error) {
    console.error('Error fetching conversations from Dify:', error);
    return [];
  }
};

// Upload file (image or document) and save locally
export const uploadFile = async (file) => {
  const userId = getUserId();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('user_id', userId);

  try {
    const response = await fetch(`${API_BASE_URL}/upload/`, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
};

// Upload image specifically for Dify Chat
export const uploadImage = async (file) => {
  const userId = getUserId();
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(`${DIFY_API_URL}/upload-image?user_id=${userId}`, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }
    
    const data = await response.json();
    return { ...data, id: data.file_id || data.dify_file_id }; // Return whole response object
  } catch (error) {
    console.error('Error uploading image to Dify:', error);
    throw error;
  }
};

// Get list of uploaded files
export const getUploadedFiles = async (fileType = null) => {
  const userId = getUserId();
  try {
    let url = `${API_BASE_URL}/files/?user_id=${userId}`;
    if (fileType) {
      url += `&type=${fileType}`;
    }
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to get files: ${response.status}`);
    }
    
    const data = await response.json();
    return data.files || [];
  } catch (error) {
    console.error('Error getting files:', error);
    return [];
  }
};

// Delete an uploaded file
export const deleteUploadedFile = async (fileId) => {
  const userId = getUserId();
  try {
    const response = await fetch(
      `${API_BASE_URL}/files/${fileId}/delete/?user_id=${userId}`,
      { method: 'DELETE' }
    );
    return response.status === 204;
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
};

// Send chat message with streaming response
export const sendChatMessage = async (query, conversationId = '', files = [], onChunk, onComplete, onMessageId) => {
  const userId = getUserId();

  try {
    const response = await fetch(`${DIFY_API_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        conversation_id: conversationId,
        query: query,
        files: files
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let newConversationId = conversationId;
    let newMessageId = null;
    let fullAnswer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.conversation_id) {
              newConversationId = data.conversation_id;
            }
            
            // Capture message_id from first chunk
            if (data.message_id && !newMessageId) {
              newMessageId = data.message_id;
              onMessageId && onMessageId(newMessageId);
            }
            
            if (data.answer) {
              fullAnswer += data.answer;
              onChunk && onChunk(data.answer, fullAnswer);
            }
            
            if (data.done) {
              onComplete && onComplete(fullAnswer, newConversationId, newMessageId, data.title);
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }

    return { answer: fullAnswer, conversationId: newConversationId, messageId: newMessageId };
  } catch (error) {
    console.error('Error sending chat message:', error);
    throw error;
  }
};

// Get chat history for a conversation
export const getChatHistory = async (conversationId) => {
  const userId = getUserId();
  try {
    const response = await fetch(
      `${DIFY_API_URL}/history?user_id=${userId}&conversation_id=${conversationId}`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching chat history:', error);
    throw error;
  }
};

// Delete a conversation
export const deleteConversation = async (conversationId) => {
  const userId = getUserId();
  try {
    const response = await fetch(
      `${DIFY_API_URL}/conversation/${conversationId}?user_id=${userId}`,
      { method: 'DELETE' }
    );
    return response.ok;
  } catch (error) {
    console.error('Error deleting conversation:', error);
    throw error;
  }
};

// Rename a conversation
export const renameConversation = async (conversationId, newName, autoGenerate = false) => {
  const userId = getUserId();
  try {
    const response = await fetch(
      `${DIFY_API_URL}/rename/${conversationId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          name: newName,
          auto_generate: autoGenerate
        })
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error renaming conversation:', error);
    throw error;
  }
};

// ==================== MESSAGE FEEDBACK ====================

// Submit feedback for an AI message (like/dislike)
export const submitFeedback = async (messageId, rating, conversationId = '', comment = '') => {
  const userId = getUserId();
  try {
    const response = await fetch(`${API_BASE_URL}/feedback/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        message_id: messageId,
        conversation_id: conversationId,
        rating: rating,  // 'like', 'dislike', or null to remove
        comment: comment
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error submitting feedback:', error);
    throw error;
  }
};

// Get feedbacks for a conversation
export const getFeedbacks = async (conversationId = '') => {
  const userId = getUserId();
  try {
    let url = `${API_BASE_URL}/feedback/?user_id=${userId}`;
    if (conversationId) {
      url += `&conversation_id=${conversationId}`;
    }
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.feedbacks || {};
  } catch (error) {
    console.error('Error getting feedbacks:', error);
    return {};
  }
};

// ==================== KNOWLEDGE BASE MANAGEMENT ====================

// Get list of all knowledge bases
export const getKnowledgeBases = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/knowledge/`, {
      headers: getAuthHeaders()
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('Error fetching knowledge bases:', error);
    return [];
  }
};

// Get knowledge base statistics
export const getKnowledgeStats = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/knowledge/stats/`, {
      headers: getAuthHeaders()
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching knowledge stats:', error);
    return {
      total_knowledge_bases: 0,
      total_documents: 0,
      total_storage: 0,
      total_storage_display: '0 B',
      indexing_percentage: 100
    };
  }
};

// Create a new knowledge base
export const createKnowledgeBase = async (name, description = '') => {
  try {
    const response = await fetch(`${API_BASE_URL}/knowledge/`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ name, description })
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to create knowledge base');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating knowledge base:', error);
    throw error;
  }
};

// Get knowledge base details
export const getKnowledgeBase = async (datasetId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/knowledge/${datasetId}/`, {
      headers: getAuthHeaders()
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching knowledge base:', error);
    throw error;
  }
};

// Update knowledge base
export const updateKnowledgeBase = async (datasetId, name, description) => {
  try {
    const response = await fetch(`${API_BASE_URL}/knowledge/${datasetId}/`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ name, description })
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to update knowledge base');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error updating knowledge base:', error);
    throw error;
  }
};

// Delete knowledge base
export const deleteKnowledgeBase = async (datasetId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/knowledge/${datasetId}/`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    
    return response.status === 204;
  } catch (error) {
    console.error('Error deleting knowledge base:', error);
    throw error;
  }
};

// Get documents in a knowledge base
export const getKnowledgeDocuments = async (datasetId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/knowledge/${datasetId}/documents/`, {
      headers: getAuthHeaders()
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('Error fetching knowledge documents:', error);
    return [];
  }
};

// Get documents from MinIO via FastAPI
export const getMinioDocuments = async (toolName = 'default') => {
  try {
    const fastApiUrl = DIFY_API_URL.replace('/dify', '');
    const response = await fetch(`${fastApiUrl}/list-files?tool_name=${encodeURIComponent(toolName)}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching MinIO documents:', error);
    return [];
  }
};

// Upload document to knowledge base
export const uploadKnowledgeDocument = async (datasetId, file, onProgress, toolName = 'default', overwrite = false) => {
  const formData = new FormData();
  formData.append('file', file);
  
  // Call FastAPI endpoint for MinIO and Qdrant ingestion
  try {
    const fastApiFormData = new FormData();
    fastApiFormData.append('file', file);
    fastApiFormData.append('tool_name', toolName);
    fastApiFormData.append('overwrite', overwrite);
    
    const fastApiUrl = DIFY_API_URL.replace('/dify', '');
    const fastApiResponse = await fetch(`${fastApiUrl}/upload-file`, {
      method: 'POST',
      body: fastApiFormData
    });
    
    const fastApiData = await fastApiResponse.json();
    
    // If file exists and we're not overwriting, return this status to the UI
    if (fastApiData.status === 'exists') {
      return fastApiData;
    }
  } catch (err) {
    console.error('Error initiating FastAPI upload:', err);
    // Continue anyway as Django might still work
  }

  try {
    const response = await fetch(`${API_BASE_URL}/knowledge/${datasetId}/documents/`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to upload document');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error uploading document:', error);
    throw error;
  }
};

// Get document details
export const getKnowledgeDocument = async (datasetId, documentId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/knowledge/${datasetId}/documents/${documentId}/`, {
      headers: getAuthHeaders()
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching document:', error);
    throw error;
  }
};

// Delete document from knowledge base
export const deleteKnowledgeDocument = async (datasetId, documentId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/knowledge/${datasetId}/documents/${documentId}/`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    
    return response.status === 204;
  } catch (error) {
    console.error('Error deleting document:', error);
    throw error;
  }
};

// Delete document from MinIO/Qdrant via FastAPI
export const deleteMinioDocument = async (fileName, toolName = 'default') => {
  try {
    const fastApiUrl = DIFY_API_URL.replace('/dify', '');
    const response = await fetch(`${fastApiUrl}/delete-file-object?file_name=${encodeURIComponent(fileName)}&tool_name=${encodeURIComponent(toolName)}`, {
      method: 'POST'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error deleting MinIO document:', error);
    throw error;
  }
};
