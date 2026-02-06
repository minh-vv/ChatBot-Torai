from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework import status
from django.http import StreamingHttpResponse
import json
import uuid
import re

from .models import UploadedFile, User, Conversation, MessageFeedback, MessageFile, ChatMessage, KnowledgeBase, KnowledgeDocument
from .dify import (
    upload_image as dify_upload_image,
    send_chat_message as dify_send_chat_message,
    get_chat_history as dify_get_chat_history,
    delete_conversation as dify_delete_conversation,
    rename_conversation as dify_rename_conversation,
    submit_message_feedback as dify_submit_feedback,
    process_document_content,
    sync_document_to_dify,
    delete_document_from_dify,
    create_dataset_in_dify,
    delete_dataset_from_dify,
)


def get_user_from_request(request):
    """Helper to get authenticated user from request"""
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header[7:]
        return User.get_user_by_token(token)
    return None


class RegisterView(APIView):
    """User registration"""
    
    def post(self, request):
        email = request.data.get('email', '').strip().lower()
        password = request.data.get('password', '')
        name = request.data.get('name', '').strip()
        
        # Validation
        if not email:
            return Response({'error': 'Email là bắt buộc'}, status=status.HTTP_400_BAD_REQUEST)
        
        if not re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', email):
            return Response({'error': 'Email không hợp lệ'}, status=status.HTTP_400_BAD_REQUEST)
        
        if not password or len(password) < 6:
            return Response({'error': 'Mật khẩu phải có ít nhất 6 ký tự'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if email already exists
        if User.objects.filter(email=email).exists():
            return Response({'error': 'Email đã được sử dụng'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Create user
        user_id = f"user-{uuid.uuid4().hex[:12]}"
        user = User.objects.create(
            user_id=user_id,
            email=email,
            name=name or email.split('@')[0]
        )
        user.set_password(password)
        token = user.generate_token()
        
        return Response({
            'user_id': user.user_id,
            'email': user.email,
            'name': user.name,
            'token': token
        }, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    """User login"""
    
    def post(self, request):
        email = request.data.get('email', '').strip().lower()
        password = request.data.get('password', '')
        
        if not email or not password:
            return Response({'error': 'Email và mật khẩu là bắt buộc'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response({'error': 'Email hoặc mật khẩu không đúng'}, status=status.HTTP_401_UNAUTHORIZED)
        
        if not user.is_active:
            return Response({'error': 'Tài khoản đã bị khóa'}, status=status.HTTP_401_UNAUTHORIZED)
        
        if not user.check_password(password):
            return Response({'error': 'Email hoặc mật khẩu không đúng'}, status=status.HTTP_401_UNAUTHORIZED)
        
        # Generate new token
        token = user.generate_token()
        
        return Response({
            'user_id': user.user_id,
            'email': user.email,
            'name': user.name,
            'token': token
        })


class LogoutView(APIView):
    """User logout"""
    
    def post(self, request):
        user = get_user_from_request(request)
        if user:
            user.clear_token()
            return Response({'message': 'Đăng xuất thành công'})
        return Response({'error': 'Không tìm thấy phiên đăng nhập'}, status=status.HTTP_401_UNAUTHORIZED)


class MeView(APIView):
    """Get current user info"""
    
    def get(self, request):
        user = get_user_from_request(request)
        if not user:
            return Response({'error': 'Chưa đăng nhập'}, status=status.HTTP_401_UNAUTHORIZED)
        
        return Response({
            'user_id': user.user_id,
            'email': user.email,
            'name': user.name,
            'created_at': user.created_at
        })
    
    def put(self, request):
        """Update user profile"""
        user = get_user_from_request(request)
        if not user:
            return Response({'error': 'Chưa đăng nhập'}, status=status.HTTP_401_UNAUTHORIZED)
        
        name = request.data.get('name')
        if name is not None:
            user.name = name.strip()
            user.save()
        
        return Response({
            'user_id': user.user_id,
            'email': user.email,
            'name': user.name
        })


class ChangePasswordView(APIView):
    """Change user password"""
    
    def post(self, request):
        user = get_user_from_request(request)
        if not user:
            return Response({'error': 'Chưa đăng nhập'}, status=status.HTTP_401_UNAUTHORIZED)
        
        current_password = request.data.get('current_password', '')
        new_password = request.data.get('new_password', '')
        
        if not user.check_password(current_password):
            return Response({'error': 'Mật khẩu hiện tại không đúng'}, status=status.HTTP_400_BAD_REQUEST)
        
        if len(new_password) < 6:
            return Response({'error': 'Mật khẩu mới phải có ít nhất 6 ký tự'}, status=status.HTTP_400_BAD_REQUEST)
        
        user.set_password(new_password)
        user.save()
        
        return Response({'message': 'Đổi mật khẩu thành công'})


class UserView(APIView):
    """Create or get user with unique user_id"""
    
    def post(self, request):
        """Create new user or get existing one"""
        user_id = request.data.get('user_id')
        name = request.data.get('name', '')
        
        if not user_id:
            # Generate new unique user_id
            user_id = f"user-{uuid.uuid4().hex[:12]}"
        
        user, created = User.get_or_create_user(user_id, name)
        
        return Response({
            'user_id': user.user_id,
            'name': user.name,
            'created': created
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
    
    def get(self, request):
        """Get user by user_id"""
        user_id = request.query_params.get('user_id')
        if not user_id:
            return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = User.objects.get(user_id=user_id)
            return Response({
                'user_id': user.user_id,
                'name': user.name,
                'created_at': user.created_at
            })
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)


class ConversationListView(APIView):
    """List all conversations for a user"""
    
    def get(self, request):
        user_id = request.query_params.get('user_id')
        if not user_id:
            return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = User.objects.get(user_id=user_id)
            conversations = user.conversations.all().order_by('-updated_at')
            
            return Response({
                'conversations': [
                    {
                        'id': conv.id,
                        'conversation_id': conv.conversation_id,
                        'title': conv.title,
                        'created_at': conv.created_at,
                        'updated_at': conv.updated_at
                    }
                    for conv in conversations
                ]
            })
        except User.DoesNotExist:
            return Response({'conversations': []})


class FileUploadView(APIView):
    """Upload image/file and save locally, then send to Dify"""
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request, *args, **kwargs):
        file_obj = request.FILES.get('file')
        user_id = request.data.get('user_id')
        
        if not file_obj:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)
        if not user_id:
            return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Get or create user
        user, _ = User.get_or_create_user(user_id)
        
        # Determine file type from content_type
        content_type = file_obj.content_type or ''
        if content_type.startswith('image/'):
            file_type = 'image'
        elif content_type in ['application/pdf', 'application/msword', 
                              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                              'text/plain', 'text/csv']:
            file_type = 'document'
        else:
            file_type = 'other'
        
        # Save file locally with metadata
        uploaded_file = UploadedFile.objects.create(
            user=user,
            file=file_obj,
            original_name=file_obj.name,
            file_type=file_type,
            file_size=file_obj.size,
            mime_type=content_type
        )
        
        # Build full URL for file access
        file_url = request.build_absolute_uri(uploaded_file.file.url)
        
        # Upload to Dify and get file_id (only for images in Dify)
        dify_file_id = None
        if file_type == 'image':
            file_path = uploaded_file.file.path
            dify_file_id = dify_upload_image(file_path, user_id)
            
            if dify_file_id:
                uploaded_file.dify_file_id = dify_file_id
                uploaded_file.save()
        
        return Response({
            'id': uploaded_file.id,
            'file_url': file_url,
            'original_name': uploaded_file.original_name,
            'file_type': file_type,
            'file_size': uploaded_file.file_size,
            'file_size_display': uploaded_file.file_size_display,
            'mime_type': content_type,
            'dify_file_id': dify_file_id,
            'uploaded_at': uploaded_file.uploaded_at
        }, status=status.HTTP_201_CREATED)


class ChatMessageView(APIView):
    """Send chat message and stream response"""
    
    def post(self, request):
        user_id = request.data.get('user_id')
        conversation_id = request.data.get('conversation_id', '')
        query = request.data.get('query')
        files = request.data.get('files', [])
        
        if not user_id:
            return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        if not query:
            return Response({'error': 'query is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Get or create user
        user, _ = User.get_or_create_user(user_id)
        
        # Get uploaded files from dify_file_id
        uploaded_files = []
        if files:
            dify_file_ids = [f.get('upload_file_id') for f in files if f.get('upload_file_id')]
            uploaded_files = list(UploadedFile.objects.filter(dify_file_id__in=dify_file_ids))
        
        def event_stream():
            new_conversation_id = None
            new_message_id = None
            full_answer = ""
            
            for chunk in dify_send_chat_message(user_id, conversation_id, query, files):
                if isinstance(chunk, dict):
                    # First chunk with conversation_id and message_id
                    new_conversation_id = chunk.get('conversation_id')
                    new_message_id = chunk.get('message_id')
                    answer = chunk.get('answer', '')
                    full_answer += answer
                    yield f"data: {json.dumps({'answer': answer, 'conversation_id': new_conversation_id, 'message_id': new_message_id})}\n\n"
                else:
                    full_answer += chunk
                    yield f"data: {json.dumps({'answer': chunk})}\n\n"
            
            # Save or update conversation in database
            final_conv_id = new_conversation_id or conversation_id
            if final_conv_id:
                conv, created = Conversation.objects.get_or_create(
                    user=user,
                    conversation_id=final_conv_id,
                    defaults={'title': query[:50] + '...' if len(query) > 50 else query}
                )
                if not created:
                    conv.save()  # Update updated_at
            
            # Save chat message to database for persistence
            if new_message_id and final_conv_id:
                ChatMessage.objects.update_or_create(
                    message_id=new_message_id,
                    defaults={
                        'user': user,
                        'conversation_id': final_conv_id,
                        'query': query,
                        'answer': full_answer
                    }
                )
            
            # Save file associations if we have message_id
            if new_message_id and uploaded_files:
                for uploaded_file in uploaded_files:
                    MessageFile.objects.get_or_create(
                        user=user,
                        conversation_id=final_conv_id,
                        message_id=new_message_id,
                        uploaded_file=uploaded_file
                    )
            
            yield f"data: {json.dumps({'done': True, 'conversation_id': final_conv_id, 'message_id': new_message_id})}\n\n"
        
        response = StreamingHttpResponse(
            event_stream(),
            content_type='text/event-stream'
        )
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'
        return response


class ChatHistoryView(APIView):
    """Get chat history for a conversation"""
    
    def get(self, request):
        user_id = request.query_params.get('user_id')
        conversation_id = request.query_params.get('conversation_id')
        first_id = request.query_params.get('first_id')
        limit = request.query_params.get('limit', 100)
        
        if not user_id:
            return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        if not conversation_id:
            return Response({'error': 'conversation_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            limit = int(limit)
        except ValueError:
            limit = 100
        
        # First, try to get messages from local database (persisted)
        local_messages = ChatMessage.objects.filter(
            conversation_id=conversation_id
        ).order_by('-created_at')[:limit]
        
        # Get all message files for this conversation from local DB
        message_files = MessageFile.objects.filter(
            conversation_id=conversation_id
        ).select_related('uploaded_file')
        
        # Build a map of message_id -> list of files
        files_by_message = {}
        for mf in message_files:
            if mf.message_id not in files_by_message:
                files_by_message[mf.message_id] = []
            files_by_message[mf.message_id].append({
                'id': mf.uploaded_file.id,
                'file_url': request.build_absolute_uri(mf.uploaded_file.file.url),
                'original_name': mf.uploaded_file.original_name,
                'file_type': mf.uploaded_file.file_type,
                'mime_type': mf.uploaded_file.mime_type
            })
        
        # If we have local messages, use them (for mock mode persistence)
        if local_messages.exists():
            result = {
                "data": [
                    {
                        "id": msg.message_id,
                        "query": msg.query,
                        "answer": msg.answer,
                        "files": files_by_message.get(msg.message_id, []),
                        "created_at": msg.created_at.isoformat()
                    }
                    for msg in local_messages
                ],
                "has_more": local_messages.count() >= limit
            }
            return Response(result)
        
        # Fallback to Dify API (for real mode or if local DB is empty)
        result = dify_get_chat_history(user_id, conversation_id, first_id, limit)
        
        if result and result.get('data'):
            # Enrich each message with local file URLs
            for msg in result['data']:
                msg_id = msg.get('id')
                if msg_id and msg_id in files_by_message:
                    msg['files'] = files_by_message[msg_id]
                else:
                    msg['files'] = []
            
            return Response(result)
        elif result:
            return Response(result)
        else:
            # Return empty data instead of error
            return Response({'data': [], 'has_more': False})


class DeleteConversationView(APIView):
    """Delete a conversation"""
    
    def delete(self, request, conversation_id):
        user_id = request.query_params.get('user_id')
        
        if not user_id:
            return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Delete from Dify
        success = dify_delete_conversation(user_id, conversation_id)
        
        if success:
            # Delete from local database
            try:
                user = User.objects.get(user_id=user_id)
                Conversation.objects.filter(user=user, conversation_id=conversation_id).delete()
            except User.DoesNotExist:
                pass
            
            return Response({'success': True}, status=status.HTTP_204_NO_CONTENT)
        else:
            return Response({'error': 'Failed to delete conversation'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class RenameConversationView(APIView):
    """Rename a conversation"""
    
    def post(self, request, conversation_id):
        user_id = request.data.get('user_id')
        name = request.data.get('name')
        auto_generate = request.data.get('auto_generate', False)
        
        if not user_id:
            return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        result = dify_rename_conversation(user_id, conversation_id, name, auto_generate)
        
        if result:
            # Update local database
            try:
                user = User.objects.get(user_id=user_id)
                conv = Conversation.objects.filter(user=user, conversation_id=conversation_id).first()
                if conv:
                    conv.title = result.get('name', name or conv.title)
                    conv.save()
            except User.DoesNotExist:
                pass
            
            return Response(result)
        else:
            return Response({'error': 'Failed to rename conversation'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class MessageFeedbackView(APIView):
    """Submit feedback for AI message (like/dislike)"""
    
    def post(self, request):
        user_id = request.data.get('user_id')
        message_id = request.data.get('message_id')
        conversation_id = request.data.get('conversation_id', '')
        rating = request.data.get('rating')  # 'like', 'dislike', or null to remove
        comment = request.data.get('comment', '')
        
        if not user_id:
            return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        if not message_id:
            return Response({'error': 'message_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Get or create user
        user, _ = User.get_or_create_user(user_id)
        
        # If rating is null/empty, remove the feedback
        if not rating:
            # Remove feedback from local DB
            MessageFeedback.objects.filter(user=user, message_id=message_id).delete()
            # Send null to Dify to cancel feedback
            dify_submit_feedback(user_id, message_id, None)
            return Response({'success': True, 'message': 'Feedback removed'})
        
        # Validate rating
        if rating not in ['like', 'dislike']:
            return Response({'error': 'rating must be "like" or "dislike"'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Submit to Dify
        dify_result = dify_submit_feedback(user_id, message_id, rating)
        
        # Save/update in local database
        feedback, created = MessageFeedback.objects.update_or_create(
            user=user,
            message_id=message_id,
            defaults={
                'conversation_id': conversation_id,
                'rating': rating,
                'comment': comment
            }
        )
        
        return Response({
            'success': True,
            'message_id': message_id,
            'rating': rating,
            'dify_synced': dify_result is not None
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
    
    def get(self, request):
        """Get all feedbacks for a conversation or user"""
        user_id = request.query_params.get('user_id')
        conversation_id = request.query_params.get('conversation_id')
        
        if not user_id:
            return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = User.objects.get(user_id=user_id)
        except User.DoesNotExist:
            return Response({'feedbacks': {}})
        
        # Build query
        queryset = MessageFeedback.objects.filter(user=user)
        if conversation_id:
            queryset = queryset.filter(conversation_id=conversation_id)
        
        # Return as dict for easy lookup by message_id
        feedbacks = {
            fb.message_id: {
                'rating': fb.rating,
                'comment': fb.comment,
                'created_at': fb.created_at
            }
            for fb in queryset
        }
        
        return Response({'feedbacks': feedbacks})


class FileListView(APIView):
    """List uploaded files for a user"""
    
    def get(self, request):
        user_id = request.query_params.get('user_id')
        file_type = request.query_params.get('type')  # Optional filter: image, document, other
        
        if not user_id:
            return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = User.objects.get(user_id=user_id)
        except User.DoesNotExist:
            return Response({'files': []})
        
        # Build query
        queryset = UploadedFile.objects.filter(user=user).order_by('-uploaded_at')
        if file_type:
            queryset = queryset.filter(file_type=file_type)
        
        files = [
            {
                'id': f.id,
                'file_url': request.build_absolute_uri(f.file.url),
                'original_name': f.original_name,
                'file_type': f.file_type,
                'file_size': f.file_size,
                'file_size_display': f.file_size_display,
                'mime_type': f.mime_type,
                'dify_file_id': f.dify_file_id,
                'uploaded_at': f.uploaded_at
            }
            for f in queryset[:50]  # Limit to 50 files
        ]
        
        return Response({'files': files})


class FileDeleteView(APIView):
    """Delete an uploaded file"""
    
    def delete(self, request, file_id):
        user_id = request.query_params.get('user_id')
        
        if not user_id:
            return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = User.objects.get(user_id=user_id)
            uploaded_file = UploadedFile.objects.get(id=file_id, user=user)
            
            # Delete the actual file from storage
            if uploaded_file.file:
                uploaded_file.file.delete(save=False)
            
            # Delete the database record
            uploaded_file.delete()
            
            return Response({'success': True}, status=status.HTTP_204_NO_CONTENT)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        except UploadedFile.DoesNotExist:
            return Response({'error': 'File not found'}, status=status.HTTP_404_NOT_FOUND)


# =====================================================
# Knowledge Base Management Views
# =====================================================

class KnowledgeBaseListView(APIView):
    """List and create knowledge bases"""
    
    def get(self, request):
        """Get list of all knowledge bases"""
        user = get_user_from_request(request)
        
        knowledge_bases = KnowledgeBase.objects.filter(is_active=True)
        
        return Response({
            'data': [
                {
                    'id': kb.id,
                    'dataset_id': kb.dataset_id,
                    'name': kb.name,
                    'description': kb.description,
                    'document_count': kb.document_count,
                    'word_count': kb.word_count,
                    'created_by': kb.created_by.name if kb.created_by else 'System',
                    'created_at': kb.created_at.isoformat(),
                    'updated_at': kb.updated_at.isoformat()
                }
                for kb in knowledge_bases
            ]
        })
    
    def post(self, request):
        """Create a new knowledge base"""
        user = get_user_from_request(request)
        if not user:
            return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
        
        name = request.data.get('name')
        description = request.data.get('description', '')
        
        if not name:
            return Response({'error': 'name is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Generate unique dataset_id
        dataset_id = f"kb-{uuid.uuid4().hex[:12]}"
        
        # Try to create in Dify (if configured)
        dify_result = create_dataset_in_dify(name, description)
        if dify_result:
            dataset_id = dify_result.get('id', dataset_id)
        
        # Create local knowledge base
        kb = KnowledgeBase.objects.create(
            dataset_id=dataset_id,
            name=name,
            description=description,
            created_by=user
        )
        
        return Response({
            'id': kb.id,
            'dataset_id': kb.dataset_id,
            'name': kb.name,
            'description': kb.description,
            'document_count': 0,
            'word_count': 0,
            'created_at': kb.created_at.isoformat()
        }, status=status.HTTP_201_CREATED)


class KnowledgeBaseDetailView(APIView):
    """Get, update, delete a specific knowledge base"""
    
    def get(self, request, dataset_id):
        """Get knowledge base details"""
        try:
            kb = KnowledgeBase.objects.get(dataset_id=dataset_id, is_active=True)
            return Response({
                'id': kb.id,
                'dataset_id': kb.dataset_id,
                'name': kb.name,
                'description': kb.description,
                'document_count': kb.document_count,
                'word_count': kb.word_count,
                'created_by': kb.created_by.name if kb.created_by else 'System',
                'created_at': kb.created_at.isoformat(),
                'updated_at': kb.updated_at.isoformat()
            })
        except KnowledgeBase.DoesNotExist:
            return Response({'error': 'Knowledge base not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def put(self, request, dataset_id):
        """Update knowledge base"""
        user = get_user_from_request(request)
        if not user:
            return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
        
        try:
            kb = KnowledgeBase.objects.get(dataset_id=dataset_id, is_active=True)
            
            name = request.data.get('name')
            description = request.data.get('description')
            
            if name:
                kb.name = name
            if description is not None:
                kb.description = description
            kb.save()
            
            return Response({
                'id': kb.id,
                'dataset_id': kb.dataset_id,
                'name': kb.name,
                'description': kb.description,
                'updated_at': kb.updated_at.isoformat()
            })
        except KnowledgeBase.DoesNotExist:
            return Response({'error': 'Knowledge base not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def delete(self, request, dataset_id):
        """Delete knowledge base"""
        user = get_user_from_request(request)
        if not user:
            return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
        
        try:
            kb = KnowledgeBase.objects.get(dataset_id=dataset_id, is_active=True)
            
            # Delete from Dify if synced
            delete_dataset_from_dify(dataset_id)
            
            # Delete all documents
            for doc in kb.documents.all():
                if doc.file:
                    doc.file.delete(save=False)
                doc.delete()
            
            # Soft delete the knowledge base
            kb.is_active = False
            kb.save()
            
            return Response({'success': True}, status=status.HTTP_204_NO_CONTENT)
        except KnowledgeBase.DoesNotExist:
            return Response({'error': 'Knowledge base not found'}, status=status.HTTP_404_NOT_FOUND)


class KnowledgeDocumentListView(APIView):
    """List and upload documents to a knowledge base"""
    parser_classes = (MultiPartParser, FormParser)
    
    def get(self, request, dataset_id):
        """Get list of documents in a knowledge base"""
        try:
            kb = KnowledgeBase.objects.get(dataset_id=dataset_id, is_active=True)
            documents = kb.documents.all()
            
            return Response({
                'data': [
                    {
                        'id': doc.id,
                        'document_id': doc.document_id,
                        'name': doc.name,
                        'file_type': doc.file_type,
                        'file_size': doc.file_size,
                        'file_size_display': doc.file_size_display,
                        'word_count': doc.word_count,
                        'status': doc.status,
                        'error_message': doc.error_message,
                        'uploaded_by': doc.uploaded_by.name if doc.uploaded_by else 'System',
                        'created_at': doc.created_at.isoformat()
                    }
                    for doc in documents
                ],
                'total': documents.count()
            })
        except KnowledgeBase.DoesNotExist:
            return Response({'error': 'Knowledge base not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def post(self, request, dataset_id):
        """Upload a document to knowledge base"""
        user = get_user_from_request(request)
        if not user:
            return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
        
        try:
            kb = KnowledgeBase.objects.get(dataset_id=dataset_id, is_active=True)
        except KnowledgeBase.DoesNotExist:
            return Response({'error': 'Knowledge base not found'}, status=status.HTTP_404_NOT_FOUND)
        
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file uploaded'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Determine file type
        original_name = file.name
        extension = original_name.split('.')[-1].lower() if '.' in original_name else 'other'
        file_type_map = {
            'pdf': 'pdf',
            'docx': 'docx',
            'doc': 'doc',
            'txt': 'txt',
            'md': 'md',
            'html': 'html',
            'htm': 'html',
            'csv': 'csv',
            'xlsx': 'xlsx',
            'xls': 'xls'
        }
        file_type = file_type_map.get(extension, 'other')
        
        # Generate unique document_id
        document_id = f"doc-{uuid.uuid4().hex[:12]}"
        
        # Create document record with 'uploading' status
        doc = KnowledgeDocument.objects.create(
            knowledge_base=kb,
            document_id=document_id,
            name=original_name,
            file=file,
            file_type=file_type,
            file_size=file.size,
            mime_type=file.content_type or '',
            status='processing',
            uploaded_by=user
        )
        
        # Process document content (word count, etc.)
        try:
            result = process_document_content(doc.file.path, file_type)
            doc.word_count = result.get('word_count', 0)
            doc.status = 'ready'
            doc.save()
            
            # Try to sync to Dify
            dify_result = sync_document_to_dify(dataset_id, doc.file.path, original_name)
            if dify_result:
                doc.dify_document_id = dify_result.get('document', {}).get('id')
                doc.save()
            
            # Update knowledge base counts
            kb.update_counts()
            
        except Exception as e:
            doc.status = 'failed'
            doc.error_message = str(e)
            doc.save()
        
        return Response({
            'id': doc.id,
            'document_id': doc.document_id,
            'name': doc.name,
            'file_type': doc.file_type,
            'file_size': doc.file_size,
            'file_size_display': doc.file_size_display,
            'status': doc.status,
            'created_at': doc.created_at.isoformat()
        }, status=status.HTTP_201_CREATED)


class KnowledgeDocumentDetailView(APIView):
    """Get, update, delete a specific document"""
    
    def get(self, request, dataset_id, document_id):
        """Get document details"""
        try:
            kb = KnowledgeBase.objects.get(dataset_id=dataset_id, is_active=True)
            doc = kb.documents.get(document_id=document_id)
            
            return Response({
                'id': doc.id,
                'document_id': doc.document_id,
                'name': doc.name,
                'file_type': doc.file_type,
                'file_size': doc.file_size,
                'file_size_display': doc.file_size_display,
                'word_count': doc.word_count,
                'status': doc.status,
                'error_message': doc.error_message,
                'file_url': request.build_absolute_uri(doc.file.url) if doc.file else None,
                'uploaded_by': doc.uploaded_by.name if doc.uploaded_by else 'System',
                'created_at': doc.created_at.isoformat()
            })
        except KnowledgeBase.DoesNotExist:
            return Response({'error': 'Knowledge base not found'}, status=status.HTTP_404_NOT_FOUND)
        except KnowledgeDocument.DoesNotExist:
            return Response({'error': 'Document not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def delete(self, request, dataset_id, document_id):
        """Delete a document"""
        user = get_user_from_request(request)
        if not user:
            return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
        
        try:
            kb = KnowledgeBase.objects.get(dataset_id=dataset_id, is_active=True)
            doc = kb.documents.get(document_id=document_id)
            
            # Delete from Dify if synced
            if doc.dify_document_id:
                delete_document_from_dify(dataset_id, doc.dify_document_id)
            
            # Delete file and record
            if doc.file:
                doc.file.delete(save=False)
            doc.delete()
            
            # Update knowledge base counts
            kb.update_counts()
            
            return Response({'success': True}, status=status.HTTP_204_NO_CONTENT)
        except KnowledgeBase.DoesNotExist:
            return Response({'error': 'Knowledge base not found'}, status=status.HTTP_404_NOT_FOUND)
        except KnowledgeDocument.DoesNotExist:
            return Response({'error': 'Document not found'}, status=status.HTTP_404_NOT_FOUND)


class KnowledgeStatsView(APIView):
    """Get overall knowledge base statistics"""
    
    def get(self, request):
        """Get statistics for all knowledge bases"""
        knowledge_bases = KnowledgeBase.objects.filter(is_active=True)
        
        total_documents = sum(kb.document_count for kb in knowledge_bases)
        total_words = sum(kb.word_count for kb in knowledge_bases)
        
        # Calculate total storage used
        total_storage = 0
        for kb in knowledge_bases:
            for doc in kb.documents.filter(status='ready'):
                total_storage += doc.file_size
        
        # Calculate indexing status
        all_docs = KnowledgeDocument.objects.filter(knowledge_base__is_active=True)
        ready_docs = all_docs.filter(status='ready').count()
        total_docs = all_docs.count()
        indexing_percentage = (ready_docs / total_docs * 100) if total_docs > 0 else 100
        
        return Response({
            'total_knowledge_bases': knowledge_bases.count(),
            'total_documents': total_documents,
            'total_words': total_words,
            'total_storage': total_storage,
            'total_storage_display': format_file_size(total_storage),
            'indexing_percentage': round(indexing_percentage, 1),
            'ready_documents': ready_docs,
            'processing_documents': all_docs.filter(status='processing').count(),
            'failed_documents': all_docs.filter(status='failed').count()
        })


def format_file_size(size_bytes):
    """Format bytes to human readable string"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} TB"
