import unicodedata
import os
import re
from urllib.parse import urlparse
def remove_accents(input_str: str) -> str:
    nfkd_form = unicodedata.normalize('NFKD', input_str)
    return ''.join([c for c in nfkd_form if not unicodedata.combining(c)])
def _folder_name_from_filename(filename: str) -> str:
    raw_name = os.path.splitext(os.path.basename(filename))[0].strip()
    raw_name = remove_accents(raw_name)
    clean_name = re.sub(r'[^A-Za-z0-9\s_]', '', raw_name)
    return "_".join(clean_name.split())
def parse_image_path(image_path):
    parsed = urlparse(image_path)
    # path ví dụ: /test-bucket/tool_use_agent/... => lstrip('/') => 'test-bucket/...'
    path = parsed.path.lstrip('/')
    parts = path.split('/', 1)
    return parts