
import requests
import json
import os
from typing import List
import uuid
from dotenv import load_dotenv
import logging
import time

load_dotenv()

# Module-level constants loaded from environment
DIFY_API_KEY = os.getenv("DIFY_API_KEY")
DIFY_BASE_URL = os.getenv("DIFY_BASE_URL")

# Check if we should use mock mode (when API key is not configured)
MOCK_MODE = not DIFY_API_KEY or DIFY_API_KEY == 'your-dify-api-key-here'

# Logger setup: do not reconfigure logging if handlers already exist
logger = logging.getLogger(__name__)
if not logging.getLogger().handlers:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

if MOCK_MODE:
    logger.warning("DIFY_API_KEY not configured - Running in MOCK MODE")

# In-memory storage for mock mode
_mock_conversations = {}  # {conversation_id: [{"id": str, "query": str, "answer": str, "files": list, "created_at": str}]}


def _generate_mock_response(query: str) -> str:
    """Generate a mock AI response based on query"""
    query_lower = query.lower()
    
    if any(word in query_lower for word in ['xin chào', 'hello', 'hi', 'chào']):
        return "Xin chào! Tôi là trợ lý AI. Tôi có thể giúp gì cho bạn hôm nay?"
    elif any(word in query_lower for word in ['cảm ơn', 'thank', 'thanks']):
        return "Không có gì! Nếu bạn cần hỗ trợ thêm, đừng ngại hỏi nhé."
    elif any(word in query_lower for word in ['giúp', 'help', 'hỗ trợ']):
        return "Tôi có thể giúp bạn với nhiều việc như:\n- Trả lời câu hỏi\n- Giải thích khái niệm\n- Hỗ trợ viết nội dung\n- Và nhiều hơn nữa!\n\nBạn muốn hỏi về vấn đề gì?"
    elif '?' in query:
        return f"Đây là câu trả lời mẫu cho câu hỏi của bạn: \"{query}\"\n\nTrong chế độ mock, tôi không thể trả lời chính xác. Khi bạn cấu hình DIFY_API_KEY, tôi sẽ có thể trả lời chi tiết hơn dựa trên cơ sở kiến thức."
    else:
        return f"Tôi đã nhận được tin nhắn của bạn: \"{query}\"\n\n[Đây là phản hồi mẫu trong chế độ MOCK. Hãy cấu hình DIFY_API_KEY trong file .env để sử dụng AI thực sự.]"


def upload_image(file_path: str, user_id: str):
    """
    Upload an image file to the DIFY service and return the uploaded file id.

    Parameters:
    - file_path (str): Path to the local image file to upload.
    - user_id (str): Identifier for the user; used to name the uploaded file.

    Returns:
    - str | None: Uploaded file id on success, or None on failure.
    """
    # Mock mode - return a fake file ID
    if MOCK_MODE:
        fake_id = f"mock-file-{uuid.uuid4().hex[:12]}"
        logger.info("[MOCK] Uploaded image; received id=%s", fake_id)
        return fake_id
    
    upload_url = f"{DIFY_BASE_URL}/files/upload"
    rand = uuid.uuid4()
    logger.debug("Uploading image '%s' for user '%s' to '%s'", file_path, user_id, upload_url)
    with open(file_path, "rb") as f:
        files = {
            "file": (f"{user_id}_{rand}.png", f, "image/png"),
        }
        data = {"user": user_id}
        headers = {"Authorization": f"Bearer {DIFY_API_KEY}"}
        response = requests.post(upload_url, headers=headers, files=files, data=data)
        logger.debug("Upload response status: %s", response.status_code)
        try:
            resp_json = response.json()
            file_id = resp_json.get("id")
            logger.info("Uploaded image; received id=%s", file_id)
            return file_id
        except Exception as e:
            logger.exception("Error parsing upload response: %s", e)
            logger.debug("Upload response text: %s", response.text)
            return None

def send_chat_message(user_id: str, conversional_id: str, query: str, files: List = None):
    """
    Send a chat message to the DIFY service and stream the response.

    This generator yields incremental answer chunks (strings). If a new
    conversation id is created by the server and `conversional_id` was an
    empty string, the first yielded value will be a dict with keys
    `answer` and `conversation_id`.

    Parameters:
    - user_id (str): User identifier.
    - conversional_id (str): Conversation ID to continue; pass empty string
      to allow the server to create/return a new conversation id.
    - query (str): Message text to send.
    - files (List, optional): Uploaded file descriptors to attach.

    Yields:
    - str | dict: Answer chunks or a dict with initial answer and conversation id.
    """
    # Mock mode - generate fake response
    if MOCK_MODE:
        logger.info("[MOCK] Sending chat message for user=%s conversation_id=%s", user_id, conversional_id)
        
        # Generate or use existing conversation ID
        conv_id = conversional_id if conversional_id else f"mock-conv-{uuid.uuid4().hex[:12]}"
        
        # Initialize conversation in mock storage if new
        if conv_id not in _mock_conversations:
            _mock_conversations[conv_id] = []
        
        # Generate mock response
        mock_answer = _generate_mock_response(query)
        
        # Generate unique stable message ID
        message_id = f"msg-{uuid.uuid4().hex[:12]}"
        
        # Store in mock history with stable ID and files
        _mock_conversations[conv_id].append({
            "id": message_id,
            "query": query,
            "answer": mock_answer,
            "files": files or [],  # Store files with the message
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S")
        })
        
        # Simulate streaming by yielding chunks
        if not conversional_id:
            # New conversation - yield dict with conversation_id and message_id
            logger.info("[MOCK] New conversation id: %s, message_id: %s", conv_id, message_id)
            yield {"answer": mock_answer[:20], "conversation_id": conv_id, "message_id": message_id}
            # Yield rest of the answer
            if len(mock_answer) > 20:
                for i in range(20, len(mock_answer), 10):
                    yield mock_answer[i:i+10]
        else:
            # Existing conversation - yield first chunk with message_id
            yield {"answer": mock_answer[:10], "message_id": message_id}
            # Yield rest of the answer in chunks
            for i in range(10, len(mock_answer), 10):
                yield mock_answer[i:i+10]
        return
    
    # Real Dify API mode
    chat_url = f"{DIFY_BASE_URL}/chat-messages"

    payload = {
        "inputs": {},
        "query": query,
        "response_mode": "streaming",
        "conversation_id": str(conversional_id),
        "user": user_id,
        "files": files,
    }

    headers = {
        "Authorization": f"Bearer {DIFY_API_KEY}",
        "Content-Type": "application/json",
    }

    logger.info("Sending chat message for user=%s conversation_id=%s", user_id, conversional_id)
    with requests.post(chat_url, json=payload, headers=headers, stream=True) as response:
        if response.status_code != 200:
            logger.error("Chat message request failed: %s %s", response.status_code, response.text)
            yield f"Lỗi {response.status_code}: {response.text}"
        else:
            first_conversation_id = None
            first_message_id = None
            for line in response.iter_lines():
                if not line:
                    continue
                decoded = line.decode("utf-8")
                if decoded.startswith("data: "):
                    data = decoded[6:]
                    if data.strip() == "[DONE]":
                        logger.debug("Stream finished ([DONE])")
                        break
                    try:
                        event = json.loads(data)
                        if "answer" in event:
                            answer = event["answer"].replace("🤖", "")
                            message_id = event.get("message_id")
                            
                            # First chunk - include conversation_id and message_id
                            if not first_message_id:
                                first_message_id = message_id
                                first_conversation_id = event.get("conversation_id") or conversional_id
                                logger.info("Message id: %s, conversation id: %s", first_message_id, first_conversation_id)
                                yield {"answer": answer, "conversation_id": first_conversation_id, "message_id": first_message_id}
                            else:
                                yield answer
                    except json.JSONDecodeError:
                        logger.debug("Non-JSON chunk in stream: %s", data)
                        continue
                        
def stop_generate(task_id: str, user_id: str):
    """
    Gửi yêu cầu dừng sinh response cho một task đang streaming.
    :param task_id: Task ID lấy từ chunk trả về khi streaming
    :param user_id: User ID, phải giống với user gửi message
    :return: True nếu thành công, False nếu lỗi
    """
    url = f"{DIFY_BASE_URL}/chat-messages/{task_id}/stop"
    headers = {
        "Authorization": f"Bearer {DIFY_API_KEY}",
        "Content-Type": "application/json"
    }
    data = {"user": user_id}
    try:
        logger.debug("Requesting stop for task_id=%s user=%s", task_id, user_id)
        response = requests.post(url, headers=headers, json=data)
        if response.status_code == 200:
            resp_json = response.json()
            success = resp_json.get("result") == "success"
            logger.info("Stop request result for task %s: %s", task_id, success)
            return success
        else:
            logger.error("Failed to stop generate: %s %s", response.status_code, response.text)
            return False
    except Exception as e:
        logger.exception("Lỗi khi gọi stop_generate: %s", e)
        return False
    
def get_chat_history(user_id: str, conversation_id: str, first_id: str = None, limit: int = 100):
    """
    Lấy lịch sử chat của một conversation.
    :param user_id: User identifier
    :param conversation_id: Conversation ID
    :param first_id: ID của message đầu trang hiện tại (nếu phân trang), mặc định None
    :param limit: Số lượng message trả về, mặc định 20
    :return: dict chứa dữ liệu lịch sử chat hoặc None nếu lỗi
    """
    # Mock mode - return from in-memory storage
    if MOCK_MODE:
        logger.info("[MOCK] Fetching chat history for conversation=%s", conversation_id)
        messages = _mock_conversations.get(conversation_id, [])
        # Return in reverse order (newest first) like real Dify API
        recent_messages = messages[-limit:] if limit else messages
        return {
            "data": [
                {
                    "id": msg.get("id", f"msg-{i}"),  # Use stable ID if available
                    "query": msg["query"],
                    "answer": msg["answer"],
                    "message_files": msg.get("files", []),  # Include files
                    "created_at": msg["created_at"]
                }
                for i, msg in enumerate(reversed(recent_messages))
            ],
            "has_more": len(messages) > limit
        }
    
    import urllib.parse
    base_url = f"{DIFY_BASE_URL}/messages"
    params = {
        "user": user_id,
        "conversation_id": conversation_id,
        "limit": limit
    }
    if first_id:
        params["first_id"] = first_id
    url = base_url + "?" + urllib.parse.urlencode(params)
    headers = {
        "Authorization": f"Bearer {DIFY_API_KEY}"
    }
    try:
        logger.debug("Fetching chat history for conversation=%s user=%s", conversation_id, user_id)
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            logger.info("Fetched chat history for conversation=%s size=%d", conversation_id, len(response.content))
            return response.json()
        else:
            logger.error("Lỗi lấy lịch sử chat: %s %s", response.status_code, response.text)
            return None
    except Exception as e:
        logger.exception("Lỗi khi gọi get_chat_history: %s", e)
        return None
def delete_conversation(user_id: str, conversation_id: str):
    """
    Xóa một conversation theo conversation_id và user_id.
    :param conversation_id: Conversation ID
    :param user_id: User identifier
    :return: True nếu thành công, False nếu lỗi
    """
    # Mock mode - delete from in-memory storage
    if MOCK_MODE:
        logger.info("[MOCK] Deleting conversation=%s", conversation_id)
        if conversation_id in _mock_conversations:
            del _mock_conversations[conversation_id]
        return True
    
    url = f"{DIFY_BASE_URL}/conversations/{conversation_id}"
    headers = {
        "Authorization": f"Bearer {DIFY_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    data = {"user": user_id}
    try:
        logger.debug("Deleting conversation=%s for user=%s", conversation_id, user_id)
        response = requests.delete(url, headers=headers, json=data)
        if response.status_code == 204:
            logger.info("Deleted conversation %s", conversation_id)
            return True
        else:
            logger.error("Lỗi xóa conversation: %s %s", response.status_code, response.text)
            return False
    except Exception as e:
        logger.exception("Lỗi khi gọi delete_conversation: %s", e)
        return False
def rename_conversation(user_id: str, conversation_id: str, name: str = None, auto_generate: bool = True):
    """
    Đổi tên hoặc tự động đặt tên cho một conversation.
    :param user_id: User identifier
    :param conversation_id: Conversation ID
    :param name: Tên mới cho conversation (nếu muốn đặt thủ công)
    :param auto_generate: True nếu muốn hệ thống tự đặt tên
    :return: dict chứa thông tin conversation mới hoặc None nếu lỗi
    """
    # Mock mode - just return success with the new name
    if MOCK_MODE:
        logger.info("[MOCK] Renaming conversation=%s to name=%s", conversation_id, name)
        return {
            "id": conversation_id,
            "name": name or "Cuộc trò chuyện",
            "inputs": {},
            "status": "normal",
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S")
        }
    
    url = f"{DIFY_BASE_URL}/conversations/{conversation_id}/name"
    headers = {
        "Authorization": f"Bearer {DIFY_API_KEY}",
        "Content-Type": "application/json"
    }
    data = {
        "user": user_id,
        "auto_generate": auto_generate
    }
    if name is not None:
        data["name"] = name
    try:
        logger.debug("Renaming conversation=%s user=%s name=%s auto_generate=%s", conversation_id, user_id, name, auto_generate)
        response = requests.post(url, headers=headers, json=data)
        if response.status_code == 200:
            resp = response.json()
            logger.info("Renamed conversation %s; response keys=%s", conversation_id, list(resp.keys()))
            return resp
        else:
            logger.error("Lỗi đổi tên conversation: %s %s", response.status_code, response.text)
            return None
    except Exception as e:
        logger.exception("Lỗi khi gọi rename_conversation: %s", e)
        return None


def submit_message_feedback(user_id: str, message_id: str, rating: str, comment: str = None):
    """
    Gửi đánh giá cho một message của AI.
    :param user_id: User identifier
    :param message_id: Message ID từ Dify
    :param rating: 'like' hoặc 'dislike'
    :param comment: Nhận xét bổ sung (tùy chọn)
    :return: dict chứa kết quả hoặc None nếu lỗi
    """
    # Mock mode - just return success
    if MOCK_MODE:
        logger.info("[MOCK] Submitting feedback for message=%s rating=%s", message_id, rating)
        return {
            "result": "success",
            "message_id": message_id,
            "rating": rating
        }
    
    url = f"{DIFY_BASE_URL}/messages/{message_id}/feedbacks"
    headers = {
        "Authorization": f"Bearer {DIFY_API_KEY}",
        "Content-Type": "application/json"
    }
    data = {
        "user": user_id,
        "rating": rating  # Dify expects 'like', 'dislike', or null to cancel
    }
    
    try:
        logger.debug("Submitting feedback for message=%s user=%s rating=%s", message_id, user_id, rating)
        response = requests.post(url, headers=headers, json=data)
        if response.status_code == 200:
            resp = response.json()
            logger.info("Feedback submitted for message %s: %s", message_id, rating)
            return resp
        else:
            logger.error("Lỗi gửi feedback: %s %s", response.status_code, response.text)
            return None
    except Exception as e:
        logger.exception("Lỗi khi gọi submit_message_feedback: %s", e)
        return None


# =====================================================
# Knowledge Base API Functions
# Note: In production, these would sync with Dify Dataset API
# Currently using local storage mode
# =====================================================

# Dify Dataset API key (separate from chat API key)
DIFY_DATASET_API_KEY = os.getenv("DIFY_DATASET_API_KEY")
DIFY_DATASET_BASE_URL = os.getenv("DIFY_DATASET_BASE_URL", "https://api.dify.ai/v1")

# Use local mode for knowledge base if dataset API key not configured
KB_LOCAL_MODE = not DIFY_DATASET_API_KEY or DIFY_DATASET_API_KEY == 'your-dify-dataset-api-key-here'

if KB_LOCAL_MODE:
    logger.info("Knowledge Base running in LOCAL MODE (no Dify Dataset API)")


def process_document_content(file_path: str, file_type: str) -> dict:
    """
    Process document and extract content/word count.
    In production, this would use document parsing libraries.
    """
    word_count = 0
    try:
        # Simple word count for text-based files
        if file_type in ['txt', 'md', 'html', 'csv']:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                word_count = len(content.split())
        elif file_type in ['pdf', 'docx', 'doc', 'xlsx', 'xls']:
            # In production, use libraries like PyPDF2, python-docx, openpyxl
            # For now, estimate based on file size
            import os
            file_size = os.path.getsize(file_path)
            word_count = file_size // 10  # Rough estimate
        else:
            word_count = 0
    except Exception as e:
        logger.warning("Could not process document %s: %s", file_path, e)
        word_count = 0
    
    return {
        "word_count": word_count,
        "status": "ready"
    }


def sync_document_to_dify(dataset_id: str, document_path: str, document_name: str) -> dict:
    """
    Sync a document to Dify Knowledge Base.
    Only called when DIFY_DATASET_API_KEY is configured.
    Returns Dify document info or None.
    """
    if KB_LOCAL_MODE:
        return None
    
    url = f"{DIFY_DATASET_BASE_URL}/datasets/{dataset_id}/document/create_by_file"
    headers = {
        "Authorization": f"Bearer {DIFY_DATASET_API_KEY}"
    }
    
    try:
        with open(document_path, 'rb') as f:
            files = {
                'file': (document_name, f)
            }
            data = {
                'data': json.dumps({
                    'indexing_technique': 'high_quality',
                    'process_rule': {
                        'mode': 'automatic'
                    }
                })
            }
            response = requests.post(url, headers=headers, files=files, data=data)
            if response.status_code == 200:
                return response.json()
            else:
                logger.error("Failed to sync document to Dify: %s %s", response.status_code, response.text)
                return None
    except Exception as e:
        logger.exception("Error syncing document to Dify: %s", e)
        return None


def delete_document_from_dify(dataset_id: str, document_id: str) -> bool:
    """
    Delete a document from Dify Knowledge Base.
    """
    if KB_LOCAL_MODE:
        return True
    
    url = f"{DIFY_DATASET_BASE_URL}/datasets/{dataset_id}/documents/{document_id}"
    headers = {
        "Authorization": f"Bearer {DIFY_DATASET_API_KEY}"
    }
    
    try:
        response = requests.delete(url, headers=headers)
        if response.status_code in [200, 204]:
            logger.info("Deleted document %s from Dify dataset %s", document_id, dataset_id)
            return True
        else:
            logger.error("Failed to delete document from Dify: %s %s", response.status_code, response.text)
            return False
    except Exception as e:
        logger.exception("Error deleting document from Dify: %s", e)
        return False


def create_dataset_in_dify(name: str, description: str = "") -> dict:
    """
    Create a new dataset in Dify.
    """
    if KB_LOCAL_MODE:
        return None
    
    url = f"{DIFY_DATASET_BASE_URL}/datasets"
    headers = {
        "Authorization": f"Bearer {DIFY_DATASET_API_KEY}",
        "Content-Type": "application/json"
    }
    data = {
        "name": name,
        "description": description or f"Knowledge base: {name}"
    }
    
    try:
        response = requests.post(url, headers=headers, json=data)
        if response.status_code == 200:
            return response.json()
        else:
            logger.error("Failed to create dataset in Dify: %s %s", response.status_code, response.text)
            return None
    except Exception as e:
        logger.exception("Error creating dataset in Dify: %s", e)
        return None


def delete_dataset_from_dify(dataset_id: str) -> bool:
    """
    Delete a dataset from Dify.
    """
    if KB_LOCAL_MODE:
        return True
    
    url = f"{DIFY_DATASET_BASE_URL}/datasets/{dataset_id}"
    headers = {
        "Authorization": f"Bearer {DIFY_DATASET_API_KEY}"
    }
    
    try:
        response = requests.delete(url, headers=headers)
        if response.status_code in [200, 204]:
            logger.info("Deleted dataset %s from Dify", dataset_id)
            return True
        else:
            logger.error("Failed to delete dataset from Dify: %s %s", response.status_code, response.text)
            return False
    except Exception as e:
        logger.exception("Error deleting dataset from Dify: %s", e)
        return False

        
if __name__ == "__main__":
    user_id = "user-1"
    # for answer in send_chat_message(user_id=user_id, conversional_id="", query="hello"):
    #     if isinstance(answer, dict):
    #         print(answer["answer"], end="", flush=True)
    #         conv_id = answer['conversation_id']
    #     else:
    #         print(answer, end="", flush=True)
    # print(f"\nconversation_id: {conv_id}")

    # image_path = r"D:\Dowloads\Ảnh chụp màn hình 2025-12-09 110033.png"
    # image_id = upload_image(image_path, user_id)
    # files = [
    #     {
    #         "type": "image",
    #         "transfer_method": "local_file",
    #         "upload_file_id": image_id
    #     }
    # ]
    # for answer in send_chat_message(user_id=user_id, conversional_id="", query="Ảnh này chứa thông tin gì", files=files):
    #     if isinstance(answer, dict):
    #         print(answer["answer"], end="", flush=True)
    #         conv_id = answer['conversation_id']
    #     else:
    #         print(answer, end="", flush=True)
    # print(f"conversation_id: {conv_id}")

    # print(get_chat_history(user_id=user_id, conversation_id="fc125a88-6af4-42ec-9d98-3acad8d6e94a"))

    # delete_conversation(user_id=user_id, conversation_id="fc125a88-6af4-42ec-9d98-3acad8d6e94a")

    # print(rename_conversation(user_id=user_id, conversation_id="ccb10856-ec9f-4571-b277-e1d9ec234fe6"))




