from django.urls import path
from .views import (
    FileUploadView,
    FileListView,
    FileDeleteView,
    UserView,
    ConversationListView,
    ChatMessageView,
    ChatHistoryView,
    DeleteConversationView,
    RenameConversationView,
    RegisterView,
    LoginView,
    LogoutView,
    MeView,
    ChangePasswordView,
    MessageFeedbackView,
    AdminUserListView,
    AdminUserDetailView,
    AdminFeedbackListView,
    KnowledgeBaseListView,
    KnowledgeBaseDetailView,
    KnowledgeDocumentListView,
    KnowledgeDocumentDetailView,
    KnowledgeStatsView,
)

urlpatterns = [
    # Authentication
    path('auth/register/', RegisterView.as_view(), name='register'),
    path('auth/login/', LoginView.as_view(), name='login'),
    path('auth/logout/', LogoutView.as_view(), name='logout'),
    path('auth/me/', MeView.as_view(), name='me'),
    path('auth/change-password/', ChangePasswordView.as_view(), name='change-password'),
    
    # User management
    path('user/', UserView.as_view(), name='user'),
    
    # Conversations
    path('conversations/', ConversationListView.as_view(), name='conversation-list'),
    path('conversations/<str:conversation_id>/delete/', DeleteConversationView.as_view(), name='delete-conversation'),
    path('conversations/<str:conversation_id>/rename/', RenameConversationView.as_view(), name='rename-conversation'),
    
    # Chat
    path('chat/', ChatMessageView.as_view(), name='chat-message'),
    path('chat/history/', ChatHistoryView.as_view(), name='chat-history'),
    
    # Feedback
    path('feedback/', MessageFeedbackView.as_view(), name='message-feedback'),
    
    # File management
    path('upload/', FileUploadView.as_view(), name='file-upload'),
    path('files/', FileListView.as_view(), name='file-list'),
    path('files/<int:file_id>/delete/', FileDeleteView.as_view(), name='file-delete'),
    

    # Admin User Management
    path('admin/users/', AdminUserListView.as_view(), name='admin-user-list'),
    path('admin/users/<str:user_id>/', AdminUserDetailView.as_view(), name='admin-user-detail'),
    
    # Admin Feedback Management
    path('admin/feedbacks/', AdminFeedbackListView.as_view(), name='admin-feedback-list'),

    # Knowledge Base Management
    path('knowledge/', KnowledgeBaseListView.as_view(), name='knowledge-list'),
    path('knowledge/stats/', KnowledgeStatsView.as_view(), name='knowledge-stats'),
    path('knowledge/<str:dataset_id>/', KnowledgeBaseDetailView.as_view(), name='knowledge-detail'),
    path('knowledge/<str:dataset_id>/documents/', KnowledgeDocumentListView.as_view(), name='knowledge-documents'),
    path('knowledge/<str:dataset_id>/documents/<str:document_id>/', KnowledgeDocumentDetailView.as_view(), name='knowledge-document-detail'),
]
