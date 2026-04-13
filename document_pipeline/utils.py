import unicodedata
import os
from urllib.parse import urlparse
import re
def remove_accents(input_str: str) -> str:
    VIETNAMESE_COMBINING_MARKS = {
        '\u0300',  # Grave: à
        '\u0301',  # Acute: á
        '\u0302',  # Circumflex: â
        '\u0303',  # Tilde: ã
        '\u0304',  # Macron: ā
        '\u0306',  # Breve: ă
        '\u0308',  # Diaeresis: ä
        '\u0309',  # Hook above: ả
        '\u030A',  # Ring above: å
        '\u030C',  # Caron: ǎ
        '\u0323',  # Dot below: ạ
        '\u031B',  # Horn: ơ, ư
    }
    
    # Use NFD to decompose Vietnamese characters into base + combining marks
    nfd_form = unicodedata.normalize('NFD', input_str)
    result = []
    for c in nfd_form:
        # Only remove Vietnamese combining marks, keep everything else
        if c not in VIETNAMESE_COMBINING_MARKS:
            result.append(c)
    return ''.join(result)
def _folder_name_from_filename(filename: str) -> str:
    raw_name = filename.strip()
    raw_name = remove_accents(raw_name)
    return "_".join(raw_name.split())
def parse_image_path(image_path):
    parsed = urlparse(image_path)
    # path ví dụ: /test-bucket/tool_use_agent/... => lstrip('/') => 'test-bucket/...'
    path = parsed.path.lstrip('/')
    parts = path.split('/', 1)
    return parts

if __name__ == "__main__":
    # Test the function with a sample filename
    file_path = "01. [ToRAI Manual] Generating HTML Code from Weekly Reports.docx"
    raw_name = os.path.splitext(os.path.basename(file_path))[0]
    print(raw_name)
    clean_name = _folder_name_from_filename(raw_name)
    print(clean_name)
    file_name = "_".join(clean_name.split())
    print(file_name)
