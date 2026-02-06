from docling.datamodel.accelerator_options import AcceleratorDevice, AcceleratorOptions
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling_core.types.doc import PictureItem
from DocumentExtraction.post_process import process_lines
from DocumentExtraction.utils import _folder_name_from_filename, parse_image_path
import mimetypes
import google.generativeai as genai
from tqdm import tqdm
from pathlib import Path
import os 
import re
import logging
import base64
import requests
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S"
)

logger = logging.getLogger(__name__)
from dotenv import load_dotenv
load_dotenv()
gemini_api_key = os.getenv("LLM_API")
if gemini_api_key:
    genai.configure(api_key=gemini_api_key)

# Gemini model name (configurable)
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-pro")

from huggingface_hub import login
hf_token = os.getenv("HF_TOKEN")
login(hf_token)

# OpenRouter config (optional). If USE_OPENROUTER is set to true (1/yes/true),
# the extractor will call OpenRouter instead of Gemini for image descriptions.
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "google/gemini-2.0-flash-exp:free")
OPENROUTER_URL = os.getenv("OPENROUTER_URL", "https://openrouter.ai/api/v1/chat/completions")
USE_OPENROUTER = os.getenv("USE_OPENROUTER", "false").lower() in ("1", "true", "yes")

IMAGE_RESOLUTION_SCALE = 2.0
IMAGE_WIDTH = 200
IMAGE_HEIGHT = 200

class DocumentExtraction:
    def __init__(self, output_dir=None, storage_client=None, mode="prod"):
        self.pipeline_options = PdfPipelineOptions()
        self.pipeline_options.do_ocr = False
        self.pipeline_options.images_scale = IMAGE_RESOLUTION_SCALE
        self.pipeline_options.generate_picture_images = True
        self.pipeline_options.do_table_structure = True
        self.pipeline_options.table_structure_options.do_cell_matching = True
        self.pipeline_options.accelerator_options = AcceleratorOptions(
            num_threads=4, device=AcceleratorDevice.AUTO
        )

        # Initialize Gemini model with configured name
        self.gemini_model_name = GEMINI_MODEL
        try:
            self.model = genai.GenerativeModel(self.gemini_model_name)
        except Exception:
            # fallback in case model init fails
            self.model = genai.GenerativeModel("gemini-2.5-pro")
            self.gemini_model_name = "gemini-2.5-pro"
        self.output_dir = output_dir
        self.mode = mode
        # Log which provider/model will be used
        if USE_OPENROUTER:
            logger.info(f"ℹ️  Image descriptions will use OpenRouter model: {OPENROUTER_MODEL}")
        else:
            logger.info(f"ℹ️  Image descriptions will use Gemini model: {self.gemini_model_name}")
        if self.mode == "prod":
            self.storage_client = storage_client
            self.storage_bucket = os.getenv("STORAGE_BUCKET")

    def convert_pdf_to_md(self, file_path, tool_name):
        logger.info(f"🔄 Đang chuyển đổi file: {file_path}")
        if file_path.endswith(".pdf"):
            self.doc_converter = DocumentConverter(
                format_options = {
                    InputFormat.PDF: PdfFormatOption(
                        pipeline_options=self.pipeline_options
                    )
                }
            )
        else:
            self.doc_converter = DocumentConverter() 
        result = self.doc_converter.convert(file_path)

        raw_name = result.input.file.stem
        clean_name = _folder_name_from_filename(raw_name)
        file_name = "_".join(clean_name.split())
        md_text = result.document.export_to_markdown()
        if self.mode == "dev":
            md_path = Path(self.output_dir) / file_name / f"{file_name}.md"
            md_path.parent.mkdir(parents=True, exist_ok=True)
            with (md_path).open("w", encoding="utf-8") as f_md:
                f_md.write(md_text)
            logger.info(f"✅ Đã tạo file JSON: {md_path}")
            return result, file_name
        elif self.mode == "prod":
            # Upload trực tiếp nội dung Markdown lên MinIO, không ghi ra file local
            from io import BytesIO
            folder_name = f"{tool_name}/{file_name}"
            md_bytes = BytesIO(md_text.encode("utf-8"))
            self.storage_client.upload_fileobj(
                fileobj=md_bytes,
                bucket_type=self.storage_bucket,
                folder_name=folder_name,
                file_name=f"{file_name}.md",
                content_type="text/markdown"
            )
            logger.info(f"✅ Đã upload file markdown lên MinIO (không ghi file local)")
            return result, file_name
        
    def extract_image(self, result, file_name, tool_name):
        logger.info("🖼️  Đang trích xuất hình ảnh...")
        picture_cnt = 0
        image_links = []

        if self.mode == "dev":
            images_dir = Path(self.output_dir) / file_name / "images"
            images_dir.mkdir(parents=True, exist_ok=True)
        else:
            images_dir = None  # Không dùng trong prod

        for element, _level in result.document.iterate_items():
            if isinstance(element, PictureItem):
                img = element.get_image(result.document)
                width, height = img.size

                picture_cnt += 1
                # Bỏ qua ảnh nhỏ hơn ngưỡng
                if width < IMAGE_WIDTH or height < IMAGE_HEIGHT:
                    logger.debug(
                        f"⚠️  Bỏ qua ảnh nhỏ {width}x{height} (logo hoặc nền)."
                    )
                    continue

                image_filename = f"picture-{picture_cnt}.png"

                if self.mode == "dev":
                    element_image_filename = images_dir / image_filename
                    try:
                        img.save(element_image_filename, format="PNG")
                        image_links.append(f"([Image]: {element_image_filename})")
                        logger.debug(f"➡️  Lưu ảnh: {element_image_filename}")
                    except Exception as e:
                        logger.warning(f"⚠️  Không lưu được ảnh {element_image_filename}: {e}")
                elif self.mode == "prod":
                    from io import BytesIO
                    img_bytes = BytesIO()
                    img.save(img_bytes, format="PNG")
                    img_bytes.seek(0)
                    folder_name = f"{tool_name}/{file_name}/images" if tool_name else f"{file_name}/images"
                    try:
                        storage_url = self.storage_client.upload_fileobj(
                            fileobj=img_bytes,
                            bucket_type=self.storage_bucket,
                            folder_name=folder_name,
                            file_name=image_filename,
                            content_type="image/png"
                        )
                        image_links.append(f"([Image]: {storage_url})")
                        logger.debug(f"➡️  Đã upload ảnh lên storage: {storage_url}")
                    except Exception as e:
                        logger.warning(f"⚠️  Không upload được ảnh {image_filename}: {e}")

        logger.info(f"✅ Đã trích xuất {picture_cnt} hình ảnh hợp lệ.")
        return image_links

    def _generate_description(self, image_path, context_text=""):
        image_path = image_path.replace("minio", "localhost")
        if USE_OPENROUTER:
            logger.info(f"ℹ️  Generating image description via OpenRouter model: {OPENROUTER_MODEL}")
        else:
            logger.info(f"ℹ️  Generating image description via Gemini model: {self.gemini_model_name}")
        if USE_OPENROUTER:
            if not OPENROUTER_API_KEY:
                logger.debug("ℹ️  OPENROUTER_API_KEY không được cấu hình, bỏ qua OpenRouter và không sinh mô tả ảnh.")
                return ""
        else:
            if not gemini_api_key:
                logger.debug("ℹ️  GEMINI_API_KEY không được cấu hình, bỏ qua sinh mô tả ảnh.")
                return ""
        try:
            # Đọc file ảnh local hoặc từ MinIO (prod)
            if image_path.startswith("http://") or image_path.startswith("https://"):
                # Nếu đường dẫn là HTTP(S) nhưng file không public, sinh presigned URL từ MinIO trước
                try:
                    import requests
                    parts = parse_image_path(image_path)
                    if len(parts) >= 2 and hasattr(self, "storage_client") and self.storage_client:
                        bucket = parts[0]
                        object_name = parts[1]
                        try:
                            presigned = self.storage_client.get_presigned_url(
                                bucket, object_name, expires_seconds=300
                            )
                            resp = requests.get(presigned)
                        except Exception:
                            # fallback: thử fetch trực tiếp nếu presigned không thành công
                            resp = requests.get(image_path)
                    else:
                        # Không thể tách bucket/object hoặc không có storage_client -> thử fetch trực tiếp
                        resp = requests.get(image_path)

                    resp.raise_for_status()
                    img_bytes = resp.content
                    mime_type = resp.headers.get("Content-Type", "image/png")

                except Exception as e:
                    logger.warning(f"⚠️  Không thể lấy ảnh qua HTTP(s): {e}")
                    return ""

            else:
                # Đọc file local
                with open(image_path, "rb") as f:
                    img_bytes = f.read()
                mime_type = mimetypes.guess_type(image_path)[0] or "image/jpeg"
            # Lấy tối đa 200 ký tự context (nếu có)
            context_preview = (context_text[-200:]).strip() if context_text else ""
            prompt = "Hãy mô tả nội dung của bức ảnh một cách ngắn gọn, rõ ràng và đầy đủ thông tin. Đầu ra chỉ chứa thông tin mô tả ảnh"
            if context_preview:
                prompt = (
                    f"Ngữ cảnh văn bản trước đó:\n{context_preview}\n\n"
                    + prompt
                )

            if USE_OPENROUTER:
                # Call OpenRouter chat completions endpoint with image as base64 data URI
                try:
                    # Try to create a presigned URL for the image first (smaller payloads,
                    # less chance of being rejected). If not available, fall back to
                    # embedding the image as a base64 data URI.
                    headers = {
                        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                        "Content-Type": "application/json",
                    }
                    image_b64 = base64.b64encode(img_bytes).decode("utf-8")
                    data_uri = f"data:{mime_type};base64,{image_b64}"
                    image_part = {"type": "image_url", "image_url": {"url": data_uri}}

                    data = {
                        "model": OPENROUTER_MODEL,
                        "messages": [
                            {
                                "role": "user",
                                "content": [
                                    {"type": "text", "text": prompt},
                                    image_part,
                                ],
                            }
                        ],
                    }

                    resp = requests.post(OPENROUTER_URL, headers=headers, json=data, timeout=30)
                    # Always log status and body when not OK to aid debugging (billing/permission issues)
                    if resp.status_code != 200:
                        logger.warning(f"⚠️  OpenRouter response status: {resp.status_code} - {resp.text}")
                        if resp.status_code == 402:
                            logger.error("❌ OpenRouter returned 402 Payment Required. Check OpenRouter account, API key and billing/credits or use a different model.")
                        return ""
                    try:
                        j = resp.json()
                    except Exception:
                        logger.warning(f"⚠️  OpenRouter trả về JSON không hợp lệ: {resp.text}")
                        return ""

                    # Best-effort extraction of text from various response shapes
                    desc = ""
                    try:
                        choices = j.get("choices") or j.get("outputs") or []
                        if choices and isinstance(choices, list):
                            first = choices[0]
                            # common: {'message': {'content': '...'}} or {'message': {'content': [...]}}
                            msg = first.get("message") if isinstance(first, dict) else None
                            if msg:
                                content = msg.get("content")
                                if isinstance(content, str):
                                    desc = content
                                elif isinstance(content, list):
                                    # find text fields
                                    parts = []
                                    for c in content:
                                        if isinstance(c, dict):
                                            t = c.get("text") or c.get("value")
                                            if isinstance(t, str):
                                                parts.append(t)
                                        elif isinstance(c, str):
                                            parts.append(c)
                                    desc = "\n".join(parts)
                            # fallback: some responses have 'text' or 'output'
                            if not desc:
                                desc = first.get("text") or first.get("output") or ""
                        # Some variants: top-level 'text'
                        if not desc:
                            desc = j.get("text") or j.get("response") or ""
                    except Exception as e:
                        logger.warning(f"⚠️  Lỗi khi phân tích phản hồi OpenRouter: {e}")
                        desc = ""
                    return (desc or "").strip()
                except Exception as e:
                    logger.warning(f"⚠️  Lỗi khi gọi OpenRouter để sinh mô tả ảnh: {e}")
                    return ""

            else:
                # Gemini (original) flow
                genai.configure(api_key=gemini_api_key)
                resp = self.model.generate_content(
                    [
                        {"mime_type": mime_type, "data": img_bytes},
                        prompt,
                    ]
                )
                desc = resp.text or ""
                return desc.strip()
            
        except Exception as e:
            logger.warning(f"⚠️  Lỗi khi gọi Gemini để sinh mô tả ảnh: {e}")
            return ""

    def _replace_image_placeholders(self, file_name, image_links, tool_name):
        import io

        if self.mode == "dev":
            md_path = Path(self.output_dir) / file_name / f"{file_name}.md"
            try:
                md_content = md_path.read_text(encoding="utf-8")
            except Exception as e:
                logger.error(f"❌ Lỗi khi đọc file markdown: {e}")
                return
        elif self.mode == "prod":
            # Đọc file md từ MinIO về memory
            folder_name = f"{tool_name}/{file_name}" if tool_name else file_name
            object_name = f"{folder_name}/{file_name}.md"
            try:
                response = self.storage_client.get_object(self.storage_bucket, object_name)
                md_content = response.read().decode("utf-8")
                response.close()
                # response.release_conn()
            except Exception as e:
                logger.error(f"❌ Lỗi khi đọc file markdown từ MinIO: {e}")
                return

        placeholder = "<!-- image -->"

        # Map index -> original stored link string
        link_map = {}
        for link in image_links:
            m = re.search(r"picture-(\d+)\.png", link, flags=re.IGNORECASE)
            if m:
                idx = int(m.group(1))
                if idx not in link_map:
                    link_map[idx] = link

        if not link_map and placeholder not in md_content:
            logger.info("ℹ️  Không tìm thấy link ảnh hoặc placeholder trong image_links/md.")
            return
        # Số lượng placeholder hiện có trong markdown
        placeholder_count = md_content.count(placeholder)
        if placeholder_count == 0:
            logger.info("ℹ️  Không tìm thấy placeholder trong markdown.")
            return

        used_indices = set()
        desc_map = {}

        # Duyệt từng placeholder theo thứ tự xuất hiện: placeholder thứ N sẽ được gắn picture-N (n bắt đầu từ 1)
        for n in tqdm(range(1, placeholder_count + 1)):
            pos = md_content.find(placeholder)
            if pos == -1:
                logger.info("ℹ️  Không còn placeholder để thay thế.")
                break

            # Nếu có picture-N trong link_map thì thay bằng link và mô tả, ngược lại thay bằng rỗng
            if n in link_map:
                used_indices.add(n)
                original_path = link_map[n]
                # original_path có dạng "([Image]: ...)", lấy đường dẫn thực tế
                try:
                    image_path = original_path.split("([Image]: ")[1].rstrip(")")
                except Exception:
                    image_path = ""
                context_before = md_content[max(0, pos - 200):pos]

                try:
                    # Nếu muốn bật sinh mô tả, bỏ comment dòng dưới
                    # desc = self._generate_description(image_path, context_before) or ""
                    desc = ""
                except Exception as e:
                    logger.warning(f"⚠️ Lỗi sinh mô tả cho ảnh picture-{n}.png: {e}")
                    desc = ""
                desc_map[n] = desc

                # Lấy lại link ảnh đúng cho dev/prod (ở đây giữ nguyên original_path)
                replacement_path = original_path

                if desc:
                    replacement = replacement_path + "\n(Mô tả của bức ảnh trên: " + desc + ")\n"
                else:
                    replacement = replacement_path
            else:
                # Nếu picture-N không tồn tại, thay placeholder bằng chuỗi rỗng
                replacement = ""

            # Thay thế lần lượt từng placeholder (chỉ 1 occurrence mỗi lần)
            md_content = md_content.replace(placeholder, replacement, 1)

        # Những link ảnh không được dùng (picture-M mà không có placeholder thứ M)
        unused = [v for k, v in link_map.items() if k not in used_indices]
        if unused:
            logger.info(f"ℹ️  Có {len(unused)} link ảnh không khớp placeholder và đã bị bỏ qua.")

        if self.mode == "dev":
            try:
                md_path.write_text(md_content, encoding="utf-8")
                logger.info(f"📄 Đã lưu nội dung trích xuất vào: {md_path}")
            except Exception as e:
                logger.error(f"❌ Lỗi khi ghi file markdown: {e}")
        elif self.mode == "prod":
            # Upload lại file md đã thay thế lên MinIO
            from io import BytesIO
            folder_name = f"{tool_name}/{file_name}" if tool_name else file_name
            md_bytes = BytesIO(md_content.encode("utf-8"))
            try:
                self.storage_client.upload_fileobj(
                    fileobj=md_bytes,
                    bucket_type=self.storage_bucket,
                    folder_name=folder_name,
                    file_name=f"{file_name}.md",
                    content_type="text/markdown"
                )
                logger.info(f"📄 Đã upload lại file markdown đã thay thế lên MinIO: {folder_name}/{file_name}.md")
            except Exception as e:
                logger.error(f"❌ Lỗi khi upload lại file markdown lên MinIO: {e}")

    def post_process(self, file_name, tool_name):
        if self.mode == "dev":
            md_path = Path(self.output_dir) / file_name / f"{file_name}.md"
            try:
                with md_path.open('r', encoding='utf-8') as f:
                    lines = f.readlines()
            except Exception as e:
                logger.error(f"❌ Lỗi khi đọc file markdown: {e}")
                return
            text = process_lines(lines)
            out_path = md_path.with_name(md_path.stem + "_posted" + md_path.suffix)
            with out_path.open('w', encoding='utf-8') as f:
                f.write(text)
            return str(out_path)
        elif self.mode == "prod":
            folder_name = f"{tool_name}/{file_name}" if tool_name else file_name
            object_name = f"{folder_name}/{file_name}.md"
            try:
                response = self.storage_client.get_object(self.storage_bucket, object_name)
                lines = response.read().decode("utf-8").splitlines(keepends=True)
                response.close()
                # response.release_conn()
            except Exception as e:
                logger.error(f"❌ Lỗi khi đọc file markdown từ MinIO: {e}")
                return None
            text = process_lines(lines)
            # Upload lại với hậu tố _posted
            from io import BytesIO
            posted_file_name = f"{file_name}_posted.md"
            md_bytes = BytesIO(text.encode("utf-8"))
            try:
                self.storage_client.upload_fileobj(
                    fileobj=md_bytes,
                    bucket_type=self.storage_bucket,
                    folder_name=folder_name,
                    file_name=posted_file_name,
                    content_type="text/markdown"
                )
                logger.info(f"📄 Đã upload file markdown đã post-process lên MinIO: {folder_name}/{posted_file_name}")
                return f"{folder_name}/{posted_file_name}"
            except Exception as e:
                logger.error(f"❌ Lỗi khi upload file markdown đã post-process lên MinIO: {e}")
                return None
    
    def extract_all_infor(self, file_path, tool_name):
        logger.info(f"🚀 Bắt đầu xử lý file: {file_path}")
        # Bước 1: Convert và extract image
        result, file_name = self.convert_pdf_to_md(file_path, tool_name)
        image_links = self.extract_image(result, file_name, tool_name)
        # Bước 3: Thu thập link ảnh và thay placeholder
        self._replace_image_placeholders(file_name, image_links, tool_name)
        self.post_process(file_name, tool_name)
        logger.info(f"✅ Hoàn tất xử lý file: {file_path}")
        return file_name

if __name__ == "__main__":
    dir = os.getenv("DOCUMENT_FOLDER")
    input_dir = Path(dir) / "input"
    output_dir = Path(dir) / "output"
    output_dir.mkdir(exist_ok=True)
    extractor = DocumentExtraction(output_dir=output_dir, mode="dev")
    # extractor = DocumentExtraction(mode="prod")
    extractor.extract_all_infor(r"D:\Document\Code\Projects\Tool-use_Agent\DocumentExtraction\input\scribe_test.pdf")
    # print(extractor._generate_description(r"D:\Document\Code\Projects\Tool-use_Agent\DocumentExtraction\output\scribetest\images\picture-2.png"))