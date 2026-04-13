from langchain_text_splitters import CharacterTextSplitter
import os
import json
from pathlib import Path
import logging
from langdetect import detect, DetectorFactory

# Đảm bảo kết quả nhất quán
DetectorFactory.seed = 0

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger(__name__)

def get_chunk_config(text):
    """
    Phát hiện ngôn ngữ và trả về cấu hình chunk phù hợp
    - Tiếng Trung/Nhật: chunk_size=300, chunk_overlap=50
    - Tiếng Anh/Việt: chunk_size=1200, chunk_overlap=200
    """
    try:
        lang = detect(text)
        # Tiếng Trung (zh-cn, zh-tw), Tiếng Nhật (ja), Tiếng Hàn (ko)
        if lang in ['zh-cn', 'zh-tw', 'ja', 'ko']:
            return {"chunk_size": 300, "chunk_overlap": 50}
        # Tiếng Anh (en), Tiếng Việt (vi)
        else:
            return {"chunk_size": 1200, "chunk_overlap": 200}
    except Exception as e:
        logger.warning(f"⚠️ Không thể phát hiện ngôn ngữ, sử dụng config mặc định: {e}")
        # Mặc định cho Tiếng Anh/Việt
        return {"chunk_size": 1200, "chunk_overlap": 200}

def recursive_split(md_content, file_name):
    config = get_chunk_config(md_content)
    text_splitter = CharacterTextSplitter(
        separator="\n",
        chunk_size=config["chunk_size"],
        chunk_overlap=config["chunk_overlap"],
        length_function=len,
        is_separator_regex=False,
    )
    chunks = text_splitter.split_text(md_content)
    lang_info = "Trung/Nhật" if config["chunk_size"] == 300 else "Anh/Việt"
    logger.info(f"📊 Ngôn ngữ: {lang_info} | Chunk size: {config['chunk_size']} | Overlap: {config['chunk_overlap']}")
    return {str(i): f"{file_name}\n{chunk}" for i, chunk in enumerate(chunks)}

class ChunkModule:
    def __init__(self, output_dir=None, storage_client=None, mode="prod"):
        self.mode=mode
        self.output_dir = output_dir
        if self.mode == "prod":
            self.storage_client = storage_client
            self.storage_bucket = os.getenv("STORAGE_BUCKET")
    
    def process(self, file_name, tool_name):
        if self.mode == "dev":
            md_path = Path(self.output_dir) / tool_name / file_name / f"{file_name}_posted.md"
            with open(md_path, 'r', encoding='utf-8') as f:
                text = f.read()
            chunks_dict = recursive_split(text, file_name)
            json_path = str(md_path).replace('.md', '.json').replace('_posted', '')
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(chunks_dict, f, ensure_ascii=False, indent=2)
            logger.info(f"📄 Đã lưu nội dung chunks vào: {json_path}")

        elif self.mode == "prod":   
            from io import BytesIO
            object_name = f"{tool_name}/{file_name}/{file_name}_posted.md"
            try:
                response = self.storage_client.get_object(self.storage_bucket, object_name)
                md_content = response.read().decode("utf-8")
                chunks_dict = recursive_split(md_content, file_name)
                json_bytes = BytesIO(json.dumps(chunks_dict, ensure_ascii=False, indent=2).encode('utf-8'))
                save_path = f"{tool_name}/{file_name}/{file_name}.json"
                try:
                    self.storage_client.upload_fileobj(
                        fileobj=json_bytes,
                        bucket_type=self.storage_bucket,
                        folder_name=f"{tool_name}/{file_name}",
                        file_name=f"{file_name}.json",
                        content_type="application/json"
                    )
                    logger.info(f"📄 Đã upload file chunks JSON lên storage: {save_path}")
                except Exception as e:
                    logger.error(f"❌ Lỗi khi upload file chunks JSON lên storage: {e}")
                response.close()
            except Exception as e:
                logger.error(f"❌ Lỗi khi đọc file markdown từ storage: {e}")
                return

def main():
    output_dir = Path("/home/admin123/Documents/DATN/pipelines/output")
    chunker = ChunkModule(output_dir=output_dir, mode="dev")
    chunker.process("Gioi_thieu_ve_Ha_Noi")
if __name__ == "__main__":
    main()