from django.contrib import admin
from .models import User, Conversation, KnowledgeBase, KnowledgeDocument


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('email', 'name', 'role', 'is_active', 'created_at')
    list_filter = ('role', 'is_active')
    list_editable = ('role',)
    search_fields = ('email', 'name', 'user_id')


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ('title', 'user', 'conversation_id', 'updated_at')


@admin.register(KnowledgeBase)
class KnowledgeBaseAdmin(admin.ModelAdmin):
    list_display = ('name', 'dataset_id', 'document_count', 'is_active')


@admin.register(KnowledgeDocument)
class KnowledgeDocumentAdmin(admin.ModelAdmin):
    list_display = ('name', 'knowledge_base', 'status', 'file_type', 'uploaded_by')
