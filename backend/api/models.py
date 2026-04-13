from django.db import models
from django.contrib.auth.hashers import make_password, check_password
import uuid
import secrets


class User(models.Model):
    """User model with authentication"""
    ROLE_CHOICES = [
        ('user', 'User'),
        ('admin', 'Admin'),
    ]
    
    user_id = models.CharField(max_length=100, unique=True, db_index=True)
    email = models.EmailField(unique=True, null=True, blank=True)
    password = models.CharField(max_length=255, null=True, blank=True)
    name = models.CharField(max_length=255, blank=True, default='')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='user')
    auth_token = models.CharField(max_length=255, null=True, blank=True, db_index=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name or self.email or 'User'} ({self.user_id})"

    @property
    def is_admin(self):
        return self.role == 'admin'

    def set_password(self, raw_password):
        """Hash and set password"""
        self.password = make_password(raw_password)
    
    def check_password(self, raw_password):
        """Check if password matches"""
        return check_password(raw_password, self.password)
    
    def generate_token(self):
        """Generate new auth token"""
        self.auth_token = secrets.token_urlsafe(32)
        self.save()
        return self.auth_token
    
    def clear_token(self):
        """Clear auth token (logout)"""
        self.auth_token = None
        self.save()

    @classmethod
    def get_or_create_user(cls, user_id, name=''):
        """Get existing user or create new one"""
        user, created = cls.objects.get_or_create(
            user_id=user_id,
            defaults={'name': name}
        )
        return user, created
    
    @classmethod
    def get_user_by_token(cls, token):
        """Get user by auth token"""
        if not token:
            return None
        try:
            return cls.objects.get(auth_token=token, is_active=True)
        except cls.DoesNotExist:
            return None


class Conversation(models.Model):
    """Conversation model linked to user_id and conversation_id from Dify"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='conversations')
    conversation_id = models.CharField(max_length=100, db_index=True)  # Dify conversation_id
    title = models.CharField(max_length=255, default='New Conversation')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['user', 'conversation_id']
        ordering = ['-updated_at']

    def __str__(self):
        return f"{self.title} - {self.user.user_id}"


def upload_to_path(instance, filename):
    """Generate upload path: uploads/user_id/filename"""
    import uuid
    ext = filename.split('.')[-1] if '.' in filename else ''
    new_filename = f"{uuid.uuid4().hex[:12]}.{ext}" if ext else uuid.uuid4().hex[:12]
    user_folder = instance.user.user_id if instance.user else 'anonymous'
    return f'uploads/{user_folder}/{new_filename}'


class UploadedFile(models.Model):
    """Uploaded files linked to user"""
    FILE_TYPE_CHOICES = [
        ('image', 'Image'),
        ('document', 'Document'),
        ('other', 'Other'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='files', null=True, blank=True)
    file = models.FileField(upload_to=upload_to_path)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    original_name = models.CharField(max_length=255)
    file_type = models.CharField(max_length=20, choices=FILE_TYPE_CHOICES, default='other')
    file_size = models.PositiveIntegerField(default=0)  # Size in bytes
    mime_type = models.CharField(max_length=100, blank=True, default='')
    dify_file_id = models.CharField(max_length=255, blank=True, null=True)  # File ID from Dify

    def __str__(self):
        return self.original_name
    
    @property
    def file_size_display(self):
        """Return human-readable file size"""
        size = self.file_size
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size < 1024:
                return f"{size:.1f} {unit}"
            size /= 1024
        return f"{size:.1f} TB"


class ChatMessage(models.Model):
    """Store chat messages locally for persistence"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='chat_messages')
    conversation_id = models.CharField(max_length=100, db_index=True)
    message_id = models.CharField(max_length=100, unique=True, db_index=True)
    query = models.TextField()  # User's question
    answer = models.TextField()  # AI's response
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"{self.conversation_id} - {self.message_id[:20]}"


class MessageFile(models.Model):
    """Association between messages and uploaded files"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='message_files')
    conversation_id = models.CharField(max_length=100, db_index=True)
    message_id = models.CharField(max_length=100, db_index=True)
    uploaded_file = models.ForeignKey(UploadedFile, on_delete=models.CASCADE, related_name='messages')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"{self.message_id} - {self.uploaded_file.original_name}"


class MessageFeedback(models.Model):
    """User feedback for AI messages (like/dislike)"""
    FEEDBACK_CHOICES = [
        ('like', 'Like'),
        ('dislike', 'Dislike'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='feedbacks')
    conversation_id = models.CharField(max_length=100, db_index=True)
    message_id = models.CharField(max_length=100, db_index=True)  # Dify message ID
    rating = models.CharField(max_length=10, choices=FEEDBACK_CHOICES)
    comment = models.TextField(blank=True, null=True)  # Optional user comment
    query = models.TextField(blank=True, default='')   # User's question at time of feedback
    answer = models.TextField(blank=True, default='')  # AI's answer at time of feedback
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['user', 'message_id']  # One feedback per message per user
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.user_id} - {self.message_id} - {self.rating}"


def knowledge_upload_path(instance, filename):
    """Generate upload path for knowledge documents: knowledge/{dataset_id}/filename"""
    import uuid
    ext = filename.split('.')[-1] if '.' in filename else ''
    new_filename = f"{uuid.uuid4().hex[:12]}.{ext}" if ext else uuid.uuid4().hex[:12]
    dataset_id = instance.knowledge_base.dataset_id if instance.knowledge_base else 'default'
    return f'knowledge/{dataset_id}/{new_filename}'


class KnowledgeBase(models.Model):
    """Knowledge Base (Dataset) for document storage"""
    dataset_id = models.CharField(max_length=100, unique=True, db_index=True)  # Local or Dify dataset ID
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='knowledge_bases')
    document_count = models.PositiveIntegerField(default=0)
    word_count = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return f"{self.name} ({self.dataset_id})"
    
    def update_counts(self):
        """Update document and word counts"""
        docs = self.documents.filter(status='ready')
        self.document_count = docs.count()
        self.word_count = sum(doc.word_count for doc in docs)
        self.save(update_fields=['document_count', 'word_count', 'updated_at'])


class KnowledgeDocument(models.Model):
    """Document in a Knowledge Base"""
    STATUS_CHOICES = [
        ('uploading', 'Uploading'),
        ('processing', 'Processing'),
        ('ready', 'Ready'),
        ('failed', 'Failed'),
    ]
    
    FILE_TYPE_CHOICES = [
        ('pdf', 'PDF'),
        ('docx', 'Word Document'),
        ('doc', 'Word Document (Legacy)'),
        ('txt', 'Text File'),
        ('md', 'Markdown'),
        ('html', 'HTML'),
        ('csv', 'CSV'),
        ('xlsx', 'Excel'),
        ('xls', 'Excel (Legacy)'),
        ('other', 'Other'),
    ]
    
    knowledge_base = models.ForeignKey(KnowledgeBase, on_delete=models.CASCADE, related_name='documents')
    document_id = models.CharField(max_length=100, unique=True, db_index=True)  # Local or Dify document ID
    name = models.CharField(max_length=255)
    file = models.FileField(upload_to=knowledge_upload_path)
    file_type = models.CharField(max_length=20, choices=FILE_TYPE_CHOICES, default='other')
    file_size = models.PositiveIntegerField(default=0)  # Size in bytes
    mime_type = models.CharField(max_length=100, blank=True, default='')
    word_count = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='uploading')
    error_message = models.TextField(blank=True, default='')
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='knowledge_documents')
    dify_document_id = models.CharField(max_length=255, blank=True, null=True)  # Dify document ID (if synced)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} - {self.knowledge_base.name}"
    
    @property
    def file_size_display(self):
        """Return human-readable file size"""
        size = self.file_size
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size < 1024:
                return f"{size:.1f} {unit}"
            size /= 1024
        return f"{size:.1f} TB"
    
    def delete(self, *args, **kwargs):
        """Delete file from storage when document is deleted"""
        if self.file:
            self.file.delete(save=False)
        super().delete(*args, **kwargs)
