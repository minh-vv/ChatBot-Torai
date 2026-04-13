import os
import re
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, Form
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from document_pipeline.extract_document import DocumentExtraction
from document_pipeline.chunker import ChunkModule
from document_pipeline.minio_client import MinioClientWrapper
from document_pipeline.s3 import S3ClientWrapper
from document_pipeline.vector_db import QdrantVectorstore
from document_pipeline.utils import _folder_name_from_filename, parse_image_path
import shutil
import logging
import tempfile
import requests
import json
from typing import List
import uuid
import asyncio
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from cache.redis_local import RedisCacheMemory
import dify

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
if not logger.hasHandlers():
    logger.addHandler(handler)
from dotenv import load_dotenv
load_dotenv()

mode = os.getenv("MODE")
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount output directory to serve images
output_dir = os.path.join(os.getcwd(), "DocumentExtraction", "output")
if not os.path.exists(output_dir):
    os.makedirs(output_dir, exist_ok=True)
app.mount("/output", StaticFiles(directory=output_dir), name="output")

@app.get("/health")
def health_check():
    return {"status": "ok", "version": "1.1"}

storage_client = MinioClientWrapper(
    endpoint=f"{os.getenv('MINIO_HOST', '127.0.0.1')}:{os.getenv('MINIO_PORT', '9000')}",
    access_key=os.getenv("MINIO_ACCESS_KEY"),
    secret_key=os.getenv("MINIO_SECRET_KEY"),
    secure=False,
)
stopwords_path = os.getenv("STOPWORD_PATH")
cache_memory = RedisCacheMemory(stopwords_path=stopwords_path)

# storage_client = S3ClientWrapper(
#     endpoint="s3.amazonaws.com",
#     access_key=os.getenv("S3_ACESS_KEY"),
#     secret_key=os.getenv("S3_SECRET_KEY"),
#     secure=True,
#     region_name=os.getenv("S3_REGION_NAME")
# )

extractor = DocumentExtraction(storage_client=storage_client)
chunk_module = ChunkModule(storage_client=storage_client)
vectorstore = QdrantVectorstore(host=os.getenv("QDRANT_HOST", "127.0.0.1"), port=os.getenv("QDRANT_PORT", "6333"), storage_client=storage_client)

def process_document(file_path, tool_name):    # Lấy tên file đã chuẩn hóa (giống cách lưu trong Qdrant)
    file_name_raw = os.path.basename(file_path)
    file_name_clean = _folder_name_from_filename(file_name_raw)
    
    # Xóa các vector cũ của file này trong Qdrant để tránh trùng lặp dữ liệu
    logger.info(f"Cleaning old vectors for file: {file_name_clean}")
    vectorstore.delete_points_by_filename(collection_name=os.getenv("COLLECTION_NAME"), filename=file_name_clean)
    file_name = extractor.extract_all_infor(file_path, tool_name)
    chunk_module.process(file_name, tool_name)
    vectorstore.ingest_to_qdrant(collection_name=os.getenv("COLLECTION_NAME"), file_name=file_name, tool_name=tool_name)

def process_bytes_upload_and_process(file_bytes: bytes, filename: str, tool_name:str):
    """
    Write uploaded bytes to a temp file (using the original filename inside a temp dir),
    upload to MinIO, run processing, then remove temp file and temp dir.
    This keeps the temp file named as the original file.
    """
    tmp_dir = None
    tmp_path = None
    try:
        # ensure we only use the base filename (no path components)
        base_name = os.path.basename(filename)
        # create a temporary directory and write the file with the original filename inside it
        tmp_dir = tempfile.mkdtemp()
        tmp_path = os.path.join(tmp_dir, base_name)
        with open(tmp_path, "wb") as f:
            f.write(file_bytes)

        # determine bucket and folder
        bucket = os.getenv("STORAGE_BUCKET")
        folder = f"{tool_name}/{_folder_name_from_filename(filename)}"

        # use _folder_name_from_filename as base and append original extension
        ext = Path(filename).suffix or ""
        safe_name = f"{_folder_name_from_filename(filename)}{ext}"

        # upload (public upload used here to match existing helper; change to upload_file if you prefer private)
        storage_client.upload_file(
            file_path=tmp_path,
            bucket_type=bucket,
            folder_name=folder,
            file_name=safe_name
        )

        # process the local temp file
        process_document(tmp_path, tool_name)

    except Exception as e:
        logger.error("Failed upload/process for %s: %s", filename, e)
    finally:
        try:
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)
            if tmp_dir and os.path.exists(tmp_dir):
                shutil.rmtree(tmp_dir)
        except Exception:
            pass

@app.post("/upload-file")
@app.post("/dify/upload-file")
async def create_upload_file(file: UploadFile = File(...), tool_name: str = Form("default"), overwrite: bool = Form(False), background_tasks: BackgroundTasks = None):
    """
    Receive uploaded file, upload it to MinIO immediately (no persistent save to D:),
    and trigger processing (background if available). Returns file name and processing status.
    If file exists and overwrite is False, return exist status for user selection.
    """
    # Check if file already exists in storage
    bucket = os.getenv("STORAGE_BUCKET")
    folder = f"{tool_name}/{_folder_name_from_filename(file.filename)}"
    ext = Path(file.filename).suffix or ""
    safe_name = f"{_folder_name_from_filename(file.filename)}{ext}"
    object_name = f"{folder}/{safe_name}"

    if not overwrite and storage_client.object_exists(bucket, object_name):
        return {
            "filename": file.filename,
            "status": "exists",
            "message": "File already exists. Use the existing one or upload a new one?"
        }

    # xóa cache
    cache_memory.delete_all()
    # read bytes into memory right away so BackgroundTasks can use them after request ends
    content = await file.read()
    if background_tasks is not None:
        background_tasks.add_task(process_bytes_upload_and_process, content, file.filename, tool_name)
        return {"filename": file.filename, "status": "processing"}
    else:
        process_bytes_upload_and_process(content, file.filename, tool_name)
        return {"filename": file.filename, "status": "done"}
    
def get_presigned_url(text):
    image_urls = re.findall(r'http[s]?://\S+\.(?:png|jpg|jpeg|gif|pdf|docx)', text)
    for path in set(image_urls):
        parts = parse_image_path(path)
        bucket = parts[0]
        object_name = parts[1]
        presigned = storage_client.get_presigned_url(
            bucket, object_name
        )
        text = text.replace(path, presigned)
    return text

class Request(BaseModel):
    query: str
    image_description: str

@app.post("/search")
def search(request: Request):
    query = request.query
    image_description = request.image_description
    result = vectorstore.search(collection_name=os.getenv("COLLECTION_NAME"), query=query, image_description=image_description)
    text = result["text"]
    if not isinstance(storage_client, S3ClientWrapper):
        return {
            "text": text
        }
    return {
        "text": get_presigned_url(text)
    }

@app.post("/delete-file-object")
@app.post("/dify/delete-file-object")
def delete_file(file_name: str, tool_name: str):
    file_name = _folder_name_from_filename(file_name)
    # xóa cache
    cache_memory.delete_all()
    vectorstore.delete_points_by_filename(collection_name=os.getenv("COLLECTION_NAME"), filename=file_name)
    storage_client.delete_folder(bucket_type=os.getenv("STORAGE_BUCKET"), folder=f"{tool_name}/{file_name}")

@app.get("/list-files")
@app.get("/dify/list-files")
def list_files(tool_name: str = "default"):
    bucket = os.getenv("STORAGE_BUCKET")
    objects = storage_client.list_objects(bucket, prefix=tool_name)
    # Show only original user-uploaded file types (not pipeline-generated .md files)
    supported_exts = ('.pdf', '.docx', '.doc')
    filtered_objects = [
        obj for obj in objects
        if obj["object_name"].lower().endswith(supported_exts)
    ]
    return filtered_objects

@app.get("/list-folders")
def list_folders():
    """Return all top-level tool_name folders that actually exist in MinIO."""
    bucket = os.getenv("STORAGE_BUCKET")
    try:
        all_objects = storage_client.list_objects(bucket, prefix="")
        # Extract unique top-level folder names (first path component)
        folders = set()
        for obj in all_objects:
            parts = obj["object_name"].split("/")
            if len(parts) > 1 and parts[0]:
                folders.add(parts[0])
        return sorted(list(folders))
    except Exception as e:
        logger.error("Error listing folders: %s", e)
        return []

# ================ CACHE =========
class CacheRequest(BaseModel):
    query: str
    answer: str
class DifyChatRequest(BaseModel):
    user_id: str
    conversation_id: str = ""
    query: str
    files: List = None

class DifyStopRequest(BaseModel):
    task_id: str
    user_id: str

class DifyRenameRequest(BaseModel):
    user_id: str
    name: str = None
    auto_generate: bool = True
    
@app.post("/cache/check")
def check_cache(request: CacheRequest):
    return cache_memory.get_cache(request.query)

@app.post("/cache/set")
def set_cache(request: CacheRequest):
    cache_memory.set_cache(request.query, request.answer)

@app.post("/cache/delete")
def delete_cache(request: CacheRequest):
    cache_memory.delete_cache(request.query)

@app.post("/cache/delete-all")
def delete_all():
    cache_memory.delete_all()

@app.get("/cache/count")
def count_cache():
    return cache_memory.count_cache()

@app.get("/cache/get-all")
def get_all_cache():
    return cache_memory.get_all_cache()

# ================ DIFY API ENDPOINTS ================

@app.post("/dify/upload-image")
async def dify_upload_image_endpoint(user_id: str, file: UploadFile = File(...)):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name
    try:
        file_id = dify.upload_image(tmp_path, user_id)
        if file_id:
            return {"file_id": file_id, "dify_file_id": file_id}
        else:
            return {"error": "Upload failed"}
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

def fix_image_paths(text, base_url="http://localhost:8888"):
    if not text:
        return text
    # Pattern to match: ([Image]: D:\...\filename.png) or ([Image]: /app/...)
    def replace_path(match):
        full_match = match.group(0)
        path = match.group(1)
        # Handle Windows style paths
        if 'DocumentExtraction\\output' in path:
            relative = path.split('DocumentExtraction\\output')[-1].replace('\\', '/')
            if not relative.startswith('/'):
                relative = '/' + relative
            return f"![image]({base_url}/output{relative})"
        
        # Handle container style paths
        if '/app/DocumentExtraction/output' in path:
            relative = path.split('/app/DocumentExtraction/output')[-1]
            if not relative.startswith('/'):
                relative = '/' + relative
            return f"![image]({base_url}/output{relative})"
            
        return full_match

    return re.sub(r'\(\[Image\]:\s*(.*?)\)', replace_path, text)

async def rename_conversation_with_llm_parallel(user_id: str, query: str, conversation_id_container: dict):
    """
    Song song: Gọi OpenRouter ngay lập tức để lấy title, 
    trong khi đó chờ Dify trả về conversation_id.
    """
    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    openrouter_url = os.getenv("OPENROUTER_URL", "https://openrouter.ai/api/v1/chat/completions")
    openrouter_model = os.getenv("OPENROUTER_MODEL", "google/gemini-2.5-flash")

    if not openrouter_key:
        logger.error("❌ OPENROUTER_API_KEY không được cấu hình, bỏ qua việc đổi tên.")
        return

    async def get_title():
        prompt = (
            f"Đặt tên ngắn gọn (dưới 10 từ) cho cuộc hội thoại dựa trên câu hỏi đầu tiên sau. "
            f"Tên phải cùng ngôn ngữ với câu hỏi. Chỉ trả về tên, không kèm giải thích hay dấu ngoặc kép.\n\n"
            f"Câu hỏi: {query}"
        )
        payload = {
            "model": openrouter_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.7,
        }
        headers = {
            "Authorization": f"Bearer {openrouter_key}",
            "Content-Type": "application/json"
        }
        try:
            # Chạy request blocking trong thread pool
            logger.info(f"ℹ️ Đang gọi OpenRouter ({openrouter_model}) để lấy title song song...")
            resp = await asyncio.to_thread(requests.post, openrouter_url, headers=headers, json=payload, timeout=15)
            if resp.status_code == 200:
                result = resp.json()
                title = result['choices'][0]['message']['content'].strip(' "')
                logger.info(f"✅ Đã có title từ LLM: {title}")
                return title
            else:
                logger.error(f"❌ OpenRouter failed: {resp.status_code}")
        except Exception as e:
            logger.error(f"❌ Lỗi khi lấy title từ LLM: {e}")
        return None

    # Chạy lấy title
    title_task = asyncio.create_task(get_title())
    
    # Chờ cho đến khi có conversation_id từ stream (hoặc timeout)
    timeout = 30
    elapsed = 0
    while not conversation_id_container.get("id") and elapsed < timeout:
        await asyncio.sleep(0.5)
        elapsed += 0.5
    
    conv_id = conversation_id_container.get("id")
    if not conv_id:
        logger.error("❌ Không nhận được conversation_id sau timeout, hủy đổi tên.")
        return

    title = await title_task
    if title:
        # Gọi Dify rename (chạy trong thread)
        await asyncio.to_thread(dify.rename_conversation, user_id, conv_id, title, False)
        # Refresh danh sách (chạy trong thread)
        await asyncio.to_thread(dify.get_conversations, user_id)
        # Lưu title lại cho stream có thể lấy
        conversation_id_container["title"] = title
        logger.info(f"✅ Hoàn tất đổi tên convo {conv_id} song song: {title}")

from fastapi import Request as FastAPIRequest
@app.post("/dify/chat")
@app.post("/dify/chat/")
async def dify_chat_endpoint(request: DifyChatRequest, raw_request: FastAPIRequest, background_tasks: BackgroundTasks):
    logger.info("Chat request from user=%s conversation_id=%s query='%s' files=%s", 
                request.user_id, request.conversation_id, request.query, request.files)
    base_url = str(raw_request.base_url).rstrip('/')
    
    # Container để hứng conversation_id từ stream dể task song song sử dụng
    conv_id_container = {
        "id": request.conversation_id if request.conversation_id else None,
        "title": None
    }
    
    # Nếu là chat lần đầu (chưa có conv_id), kích hoạt task đặt tên song song ngay lập tức
    if not request.conversation_id:
        asyncio.create_task(rename_conversation_with_llm_parallel(request.user_id, request.query, conv_id_container))

    async def event_generator():
        # Lặp qua generator đồng bộ của dify bằng cách chạy từng phần trong thread pool nếu cần,
        # hoặc đơn giản là lặp trực tiếp nếu chấp nhận blocking (FastAPI handle được sync gen).
        # Nhưng ở đây ta cần async gen để có thể await sleep ở cuối.
        
        # Helper để chạy generator đồng bộ trong thread
        def get_chunks():
            return dify.send_chat_message(request.user_id, request.conversation_id, request.query, request.files)

        # Chạy iteration trong thread pool để không block event loop chính
        from starlette.concurrency import iterate_in_threadpool
        async for chunk in iterate_in_threadpool(get_chunks()):
            if isinstance(chunk, dict):
                # Cập nhật ID mới vào container nếu có (lần đầu chat)
                if not conv_id_container["id"] and "conversation_id" in chunk:
                    conv_id_container["id"] = chunk["conversation_id"]
                
                if "answer" in chunk:
                    chunk["answer"] = fix_image_paths(chunk["answer"], base_url)
                yield f"data: {json.dumps(chunk)}\n\n"
            else:
                yield f"data: {json.dumps({'answer': fix_image_paths(chunk, base_url)})}\n\n"
        
        # Trước khi kết thúc, nếu đang đổi tên, cố gắng chờ thêm 1 chút để lấy title mới
        if not request.conversation_id:
            wait_count = 0
            while not conv_id_container.get("title") and wait_count < 15: # Chờ tối đa 3s nữa
                await asyncio.sleep(0.2)
                wait_count += 1
        
        done_info = {"done": True}
        if conv_id_container.get("title"):
            done_info["title"] = conv_id_container["title"]
            
        yield f"data: {json.dumps(done_info)}\n\n"
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post("/dify/stop")
async def dify_stop_endpoint(request: DifyStopRequest):
    success = dify.stop_generate(request.task_id, request.user_id)
    return {"success": success}

@app.get("/dify/history")
async def dify_history_endpoint(user_id: str, conversation_id: str, raw_request: FastAPIRequest, first_id: str = None, limit: int = 100):
    history = dify.get_chat_history(user_id, conversation_id, first_id, limit)
    if history and "data" in history:
        base_url = str(raw_request.base_url).rstrip('/')
        for item in history["data"]:
            if "answer" in item:
                item["answer"] = fix_image_paths(item["answer"], base_url)
        return history
    return {"error": "Could not fetch history"}

@app.delete("/dify/conversation/{conversation_id}")
async def dify_delete_conversation_endpoint(conversation_id: str, user_id: str):
    success = dify.delete_conversation(user_id, conversation_id)
    return {"success": success}

@app.post("/dify/rename/{conversation_id}")
async def dify_rename_conversation_endpoint(conversation_id: str, request: DifyRenameRequest):
    result = dify.rename_conversation(request.user_id, conversation_id, request.name, request.auto_generate)
    if result:
        return result
    return {"error": "Rename failed"}

@app.get("/dify/conversations")
async def dify_conversations_endpoint(user_id: str, last_id: str = None, limit: int = 50, sort_by: str = "-updated_at"):
    result = dify.get_conversations(user_id, last_id, limit, sort_by)
    if result:
        return result
    return {"error": "Could not fetch conversations"}

if __name__ == "__main__":
    file_path = r"D:\Document\Code\Projects\Tool-use_Agent\DocumentExtraction\input\[ToRAI Manual] Gantt Chart + Weekly report + Hanger\[ToRAI Manual] Creating Gantt chart from text.docx"
    process_document(file_path)
    # remove_object(r"D:\Document\Code\Projects\Tool-use_Agent\DocumentExtraction\input\scribe_test.pdf")

