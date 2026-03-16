# ...existing code...
import uuid 
import json
from qdrant_client import QdrantClient, models
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import google.generativeai as genai
from tqdm import tqdm
from dotenv import load_dotenv
load_dotenv()
import os
import logging

# Cấu hình logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)
 
genai.configure(api_key=os.getenv("LLM_API"))

class QdrantVectorstore:
    def __init__(self, host, port, output_dir=None, storage_client=None, mode="prod"):
        self.client = QdrantClient(host=host, port=port)
        self.text_embed_model = 'models/gemini-embedding-001'
        self.dimension_size = 3072
        self.output_dir = output_dir
        self.mode = mode
        if self.mode == "prod":
            self.storage_client = storage_client
            self.storage_bucket = os.getenv("STORAGE_BUCKET")
            self.storage_folder = os.getenv("STORAGE_FOLDER", "").strip("/")

    def embed_text(self, text):
        return genai.embed_content(
            model=self.text_embed_model,
            content=text,
            task_type="retrieval_document",
        )['embedding']
    
    def create_collection(self, collection_name):
        """Tạo collection mới trên Qdrant (nếu chưa có)."""
        try:
            self.client.get_collection(collection_name)
            logger.info("✅ Collection '%s' đã tồn tại.", collection_name)
        except Exception as e:
            if "Not found" in str(e):
                logger.info("🆕 Tạo mới collection '%s'...", collection_name)
                try:
                    self.client.create_collection(
                        collection_name=collection_name,
                        vectors_config=models.VectorParams(
                            size=self.dimension_size,
                            distance=models.Distance.COSINE,
                        ),
                    )
                    # 🟢 Thêm index cho trường "file"
                    self.client.create_payload_index(
                        collection_name=collection_name,
                        field_name="filename",
                        field_schema=models.PayloadSchemaType.KEYWORD,
                    )
                    logger.info("✅ Collection '%s' đã tạo thành công.", collection_name)
                except Exception as ce:
                    logger.error("⚠️ Lỗi khi tạo collection '%s': %s", collection_name, ce)
            else:
                logger.warning("⚠️ Lỗi khi kiểm tra collection: %s", e)

    def delete_collection(self, collection_name):
        try:
            self.client.delete_collection(collection_name=collection_name)
            logger.info("✅ Deleted collection '%s'.", collection_name)
        except Exception as e:
            logger.error("⚠️ Error deleting collection '%s': %s", collection_name, e)

    def delete_points_by_filename(self, collection_name: str, filename: str) -> bool:
        try:
            flt = models.Filter(
                must=[
                    models.FieldCondition(
                        key="filename",
                        match=models.MatchValue(value=filename)
                    )
                ]
            )

            selector = models.FilterSelector(filter=flt)

            self.client.delete(
                collection_name=collection_name,
                points_selector=selector
            )

            logger.info("✅ Deleted points with filename='%s' from collection '%s'.", filename, collection_name)
            return True

        except Exception as e:
            logger.error("⚠️ Error deleting points with filename '%s': %s", filename, e)
            return False

    def ingest_to_qdrant(self, collection_name, file_name, tool_name):
        """Nạp dữ liệu JSON vào Qdrant. Hỗ trợ mode 'dev' (đọc file local) và 'prod' (đọc từ storage)."""
        self.create_collection(collection_name)
        total_points = 0

        if self.mode == "dev":
            folder = Path(self.output_dir) / file_name
            data_paths = list(folder.glob("*.json"))
            for data_path in data_paths:
                logger.info("Processing data path: %s", data_path)
                try:
                    with open(data_path, "r", encoding="utf-8") as f:
                        raw_data = json.load(f)
                except Exception as e:
                    logger.error("⚠️ Không thể đọc file %s: %s", data_path, e)
                    continue

                logger.debug("Loaded raw data of type: %s", type(raw_data))
                chunks = raw_data.get("chunks") if isinstance(raw_data, dict) else None
                if not chunks:
                    logger.warning("⚠️ Không tìm thấy 'chunks' trong %s, bỏ qua.", data_path)
                    continue

                points = []
                for text in tqdm(["\n".join(f"{k}: {v}" for k, v in item.items()) for item in chunks]):
                    try:
                        embedding = self.embed_text(text)
                        points.append(
                            models.PointStruct(
                                id=str(uuid.uuid4()),
                                vector=embedding,
                                payload={"filename": file_name, "text": text},
                            )
                        )
                    except Exception as e:
                        logger.warning("⚠️ Lỗi khi embed text hoặc tạo point: %s", e)

                if points:
                    try:
                        self.client.upsert(collection_name=collection_name, points=points)
                        total_points += len(points)
                        logger.info("✅ Đã nạp %d điểm vào collection '%s'.", len(points), collection_name)
                    except Exception as e:
                        logger.error("⚠️ Lỗi upsert vào Qdrant cho %s: %s", data_path, e)

        elif self.mode == "prod":
            prefix = f"{tool_name}/{file_name}"
            prefix = prefix.strip("/")

            try:
                objects = list(self.storage_client.list_objects(self.storage_bucket, prefix))
            except Exception as e:
                logger.error("⚠️ Không thể liệt kê objects với prefix '%s': %s", prefix, e)
                return

            for obj in objects:
                if not obj['object_name'].lower().endswith(".json"):
                    continue
                logger.info("Processing object: %s", obj['object_name'])
                try:
                    response = self.storage_client.get_object(self.storage_bucket, obj['object_name'])
                    raw_bytes = response.read()
                    response.close()
                    # response.release_conn()
                    raw_data = json.loads(raw_bytes.decode("utf-8"))
                except Exception as e:
                    logger.error("⚠️ Không thể đọc object %s: %s", obj['object_name'], e)
                    continue

                filename = os.path.splitext(os.path.basename(obj['object_name']))[0].replace("_posted", "").strip()
                chunks = raw_data.get("chunks") if isinstance(raw_data, dict) else None
                if not chunks:
                    logger.warning("⚠️ Không tìm thấy 'chunks' trong %s, bỏ qua.", obj['object_name'])
                    continue

                points = []
                for text in tqdm(["\n".join(f"{k}: {v}" for k, v in item.items()) for item in chunks]):
                    try:
                        embedding = self.embed_text(text)
                        points.append(
                            models.PointStruct(
                                id=str(uuid.uuid4()),
                                vector=embedding,
                                payload={"filename": filename, "text": text},
                            )
                        )
                    except Exception as e:
                        logger.warning("⚠️ Lỗi khi embed text hoặc tạo point: %s", e)

                if points:
                    try:
                        self.client.upsert(collection_name=collection_name, points=points)
                        total_points += len(points)
                        logger.info("✅ Đã nạp %d điểm từ Storage object '%s' vào collection '%s'.", len(points), obj['object_name'], collection_name)
                    except Exception as e:
                        logger.error("⚠️ Lỗi upsert vào Qdrant cho object %s: %s", obj['object_name'], e)

        else:
            logger.error("⚠️ Mode không hợp lệ: %s. Chỉ hỗ trợ 'dev' hoặc 'prod'.", self.mode)

        logger.info("🎯 Tổng số điểm đã nạp: %d", total_points)

    def search(self, collection_name, query, image_description):
        # ---- 1. Lấy embedding song song ----
        tasks = {}
        if query and query.strip():
            tasks["query"] = query
        if image_description and image_description.strip():
            tasks["image"] = image_description

        embeddings = {}
        if not tasks:
            return {"text": ""}

        with ThreadPoolExecutor(max_workers=2) as ex:
            futures = {ex.submit(self.embed_text, txt): name for name, txt in tasks.items()}
            for fut in as_completed(futures):
                name = futures[fut]
                try:
                    embeddings[name] = fut.result()
                except Exception as e:
                    logger.warning("⚠️ Embed error for %s: %s", name, e)
                    embeddings[name] = None

        # chuẩn bị vectors để truy vấn (bỏ các embedding failed)
        query_vectors = [embeddings.get(k) for k in ("query", "image") if embeddings.get(k)]
        if not query_vectors:
            return {"text": ""}

        # ---- 2. Truy vấn Qdrant song song để giảm round-trip ----
        results_list = []
        def _query_vec(vec):
            try:
                return self.client.query_points(collection_name=collection_name, query=vec, limit=10).points
            except Exception as e:
                logger.warning("⚠️ Qdrant query error: %s", e)
                return []

        with ThreadPoolExecutor(max_workers=min(2, len(query_vectors))) as ex:
            futures = [ex.submit(_query_vec, v) for v in query_vectors]
            for fut in as_completed(futures):
                try:
                    pts = fut.result()
                    if pts:
                        results_list.extend(pts)
                except Exception:
                    pass
        if not results_list:
            return {"text": ""}

        # ---- 3. Loại trùng nhanh ----
        unique_results = []
        seen = set()
        for res in results_list:
            rid = getattr(res, "id", None)
            rtext = res.payload.get("text", "")
            key = rid if rid else rtext
            if key not in seen:
                seen.add(key)
                unique_results.append(res)

        # ---- 4. Lập chỉ mục document source với 1 lần gọi list_objects (nhanh hơn) ----
        text_chunks = []
        doc_map = {}  # filename -> document URL

        if self.mode == "prod" and unique_results:
            try:
                prefix = self.storage_folder or ""
                # list một lần toàn bộ folder gốc để build map nhanh
                all_objs = list(self.storage_client.list_objects(self.storage_bucket, prefix))
                for obj in all_objs:
                    name = obj.get("object_name", "")
                    low = name.lower()
                    if not (low.endswith(".pdf") or low.endswith(".docx")):
                        continue
                    # lấy folder/filename tương ứng (rel path sau storage_folder)
                    if prefix:
                        rel = name[len(prefix):].lstrip("/")
                    else:
                        rel = name
                    filename_folder = rel.split("/", 1)[0] if rel else ""
                    if filename_folder and filename_folder not in doc_map:
                        scheme = "https" if getattr(self.storage_client, "secure", False) else "http"
                        url = f"{scheme}://{self.storage_client.endpoint}/{self.storage_bucket}/{name}"
                        doc_map[filename_folder] = url
            except Exception as e:
                logger.error("⚠️ Storage listing error (bulk): %s", e)

        # ---- 5. Build output nhanh bằng join ----
        for res in unique_results:
            payload_text = res.payload.get("text", "")
            if payload_text:
                text_chunks.append(payload_text)

            filename = res.payload.get("filename", "")
            if filename and filename in doc_map:
                text_chunks.append(f"Document source: {doc_map[filename]}")

            text_chunks.append("")  # tách block

        final_text = "\n".join(text_chunks)
        return {"text": final_text}

if __name__ == "__main__":
    dir = os.getenv("DOCUMENT_FOLDER")
    input_dir = Path(dir) / "input"
    output_dir = Path(dir) / "output"
    output_dir.mkdir(exist_ok=True)
    vectorstore = QdrantVectorstore(host="127.0.0.1", port="6333", output_dir=output_dir, mode="dev")
    print(vectorstore.search(collection_name=os.getenv("COLLECTION_NAME"), query="gann chart", image_description=""))
    # vectorstore.delete_collection(collection_name=os.getenv("COLLECTION_NAME"))
    # vectorstore.create_collection(collection_name="keyword_testing")
    # vectorstore.ingest_to_qdrant(collection_name="tool_use_agent", file_name="scribe_test")
    # logger.info(vectorstore.search(collection_name="tool_use_agent", query="Hướng dẫn cách đặt xe."))
    # vectorstore.delete_points_by_filename(collection_name="tool_use_agent", filename="scribetest")