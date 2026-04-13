import os
import uuid 
import requests
import json
from tqdm import tqdm
from pathlib import Path
from qdrant_client import QdrantClient, models
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import quote
import logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)
 
from dotenv import load_dotenv
load_dotenv()
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
class QdrantVectorstore:
    def __init__(self, host=None, port=None, url=None, api_key=None, output_dir=None, storage_client=None, mode="prod"):
        if host:
            self.client = QdrantClient(host=host, port=port)
        else:
            self.client = QdrantClient(url=url, api_key=api_key)
                
        self.output_dir = output_dir
        self.mode = mode
        self.dimension_size = 3072  # Kích thước embedding của google/gemini-embedding-001  
        if self.mode == "prod":
            self.storage_client = storage_client
            self.storage_bucket = os.getenv("STORAGE_BUCKET")
    
    def embed_text(self, text):
        response = requests.post(
        url="https://openrouter.ai/api/v1/embeddings",
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        },
        data=json.dumps({
            "model": "google/gemini-embedding-001",
            "input": text,
            "encoding_format": "float"
        })
        )
        return response.json()["data"][0]["embedding"]


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
            print(f"Found {len(data_paths)} JSON files in {folder} for ingestion.")
            for data_path in data_paths:
                logger.info("Processing data path: %s", data_path)
                try:
                    with open(data_path, "r", encoding="utf-8") as f:
                        chunks = json.load(f)
                except Exception as e:
                    logger.error("⚠️ Không thể đọc file %s: %s", data_path, e)
                    continue
                logger.debug("Loaded raw data of type: %s", type(chunks))

                points = []
                for text in tqdm(chunks.values()):
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
            base_storage_folder = getattr(self, "storage_folder", "") or ""
            prefix = f"{base_storage_folder}/{tool_name}/{file_name}" if base_storage_folder else f"{tool_name}/{file_name}"
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
                    chunks = json.loads(raw_bytes.decode("utf-8"))
                except Exception as e:
                    logger.error("⚠️ Không thể đọc object %s: %s", obj['object_name'], e)
                    continue

                filename = os.path.splitext(os.path.basename(obj['object_name']))[0].replace("_posted", "").strip()

                points = []
                for text in tqdm(chunks.values()):
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

    def search(self, collection_name, query, image_description=None):
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

        query_vectors = [embeddings.get(k) for k in ("query", "image") if embeddings.get(k)]
        if not query_vectors:
            return {"text": ""}

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

        unique_results = []
        seen = set()
        for res in results_list:
            rid = getattr(res, "id", None)
            rtext = res.payload.get("text", "")
            key = rid if rid else rtext
            if key not in seen:
                seen.add(key)
                unique_results.append(res)

        text_chunks = []
        doc_map = {}  # filename -> document URL

        if self.mode == "prod" and unique_results:
            try:
                prefix = ""
                all_objs = list(self.storage_client.list_objects(self.storage_bucket, prefix))
                for obj in all_objs:
                    name = obj.get("object_name", "")
                    low = name.lower()
                    if not (low.endswith(".pdf") or low.endswith(".docx")):
                        continue
                    if prefix:
                        rel = name[len(prefix):].lstrip("/")
                    else:
                        rel = name
                    filename_folder = rel.split("/", 1)[0] if rel else ""
                    if filename_folder and filename_folder not in doc_map:
                        scheme = "https" if getattr(self.storage_client, "secure", False) else "http"
                        # URL-encode object_name to handle Unicode characters
                        encoded_name = quote(name, safe="/")
                        url = f"{scheme}://{self.storage_client.endpoint}/{self.storage_bucket}/{encoded_name}"
                        doc_map[filename_folder] = url
            except Exception as e:
                logger.error("⚠️ Storage listing error (bulk): %s", e)

        for res in unique_results:
            payload_text = res.payload.get("text", "")
            if payload_text:
                text_chunks.append(payload_text)

            filename = res.payload.get("filename", "")
            if filename and filename in doc_map:
                url = doc_map[filename]
                text_chunks.append(f"[Document source]({url})")

            text_chunks.append("")  # tách block

        final_text = "\n".join(text_chunks)
        return {"text": final_text}

if __name__ == "__main__":
    dir = r"D:\Projects\KnowledgeClassifier\pipelines"
    input_dir = Path(dir) / "input"
    output_dir = Path(dir) / "output"
    output_dir.mkdir(exist_ok=True)

    vectorstore = QdrantVectorstore(host=os.getenv("QDRANT_HOST", "127.0.0.1"), port=os.getenv("QDRANT_PORT", "6333"), mode="dev", output_dir=str(output_dir))

    collection_name=os.getenv("COLLECTION_NAME")
    vectorstore.delete_collection(collection_name=collection_name)
    # vectorstore.create_collection(collection_name=collection_name)
    # vectorstore.ingest_to_qdrant(collection_name=collection_name, file_name="Gioi_thieu_ve_Ha_Noi")
    # logger.info(vectorstore.search(collection_name=collection_name, query="Van hoa Ha Noi la gi?"))
    # vectorstore.delete_points_by_filename(collection_name="tool_use_agent", filename="scribetest")