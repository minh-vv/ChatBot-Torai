
import requests
import json
import os
from typing import List
import uuid
from dotenv import load_dotenv
import logging
load_dotenv()

# Module-level constants loaded from environment
DIFY_API_KEY = os.getenv("DIFY_API_KEY")
DIFY_BASE_URL = os.getenv("DIFY_BASE_URL", "http://localhost:5001/v1")

# Check and fix Dify URL if running in Docker
if DIFY_BASE_URL and "localhost" in DIFY_BASE_URL:
    # In Docker, localhost refers to the container itself. 
    # Use host.docker.internal to reach services running on the host machine.
    DIFY_BASE_URL = DIFY_BASE_URL.replace("localhost", "host.docker.internal")
    print(f"Adjusted DIFY_BASE_URL for Docker in dify.py: {DIFY_BASE_URL}")

# Logger setup: do not reconfigure logging if handlers already exist
logger = logging.getLogger(__name__)
if not logging.getLogger().handlers:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
def upload_image(file_path: str, user_id: str):
    """
    Upload an image file to the DIFY service and return the uploaded file id.

    Parameters:
    - file_path (str): Path to the local image file to upload.
    - user_id (str): Identifier for the user; used to name the uploaded file.

    Returns:
    - str | None: Uploaded file id on success, or None on failure.
    """
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
                            message_id = event.get("id")
                            # Nếu conversional_id là rỗng, lấy conversation_id từ event (nếu có)
                            if conversional_id == "" and not first_conversation_id:
                                first_conversation_id = event.get("conversation_id")
                                logger.info("New conversation id: %s", first_conversation_id)
                                yield {"answer": answer, "conversation_id": first_conversation_id, "message_id": message_id}
                            else:
                                yield {"answer": answer, "message_id": message_id}
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

def get_conversations(user_id: str, last_id: str = None, limit: int = 20, sort_by: str = "-updated_at"):
    """
    Lấy danh sách các cuộc hội thoại của người dùng hiện tại.
    :param user_id: User identifier
    :param last_id: (Optional) ID của bản ghi cuối cùng trên trang hiện tại, mặc định là null.
    :param limit: (Optional) Số lượng bản ghi trả về trong một yêu cầu, mặc định là 20. Tối đa 100, tối thiểu 1.
    :param sort_by: (Optional) Trường sắp xếp, mặc định: -updated_at (sắp xếp giảm dần theo thời gian cập nhật)
    :return: dict chứa danh sách conversations hoặc None nếu lỗi
    """
    url = f"{DIFY_BASE_URL}/conversations"
    params = {
        "user": user_id,
        "limit": limit,
        "sort_by": sort_by
    }
    if last_id:
        params["last_id"] = last_id
        
    headers = {
        "Authorization": f"Bearer {DIFY_API_KEY}"
    }
    
    try:
        logger.debug("Fetching conversations for user=%s", user_id)
        response = requests.get(url, headers=headers, params=params)
        if response.status_code == 200:
            resp_json = response.json()
            logger.info("Fetched %d conversations for user=%s", len(resp_json.get("data", [])), user_id)
            return resp_json
        else:
            logger.error("Lỗi lấy danh sách conversation: %s %s", response.status_code, response.text)
            return None
    except Exception as e:
        logger.exception("Lỗi khi gọi get_conversations: %s", e)
        return None

def delete_conversation(user_id: str, conversation_id: str):
    """
    Xóa một conversation theo conversation_id và user_id.
    :param conversation_id: Conversation ID
    :param user_id: User identifier
    :return: True nếu thành công, False nếu lỗi
    """
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
    url = f"{DIFY_BASE_URL}/messages/{message_id}/feedbacks"
    headers = {
        "Authorization": f"Bearer {DIFY_API_KEY}",
        "Content-Type": "application/json"
    }
    data = {
        "user": user_id,
        "rating": rating
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


if __name__ == "__main__":
    user_id = "user-e6c202bf4c64"
    print(get_conversations(user_id))
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




