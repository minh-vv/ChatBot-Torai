import hashlib
from underthesea import word_tokenize
import re

def clean_query(text, stopwords):
    # 1. lowercase
    text = text.lower()

    # 2. remove ký tự đặc biệt (giữ lại chữ và số, bỏ dấu câu)
    text = re.sub(r"[^0-9a-zA-ZÀ-ỹ\s]", " ", text)

    # 3. tokenize
    tokens = word_tokenize(text, format="text").split()

    # 4. remove stop words (nếu bật)
    tokens = [t for t in tokens if t not in stopwords]

    # 5. ghép lại thành normalized string
    normalized = " ".join(tokens)
    return normalized.replace("_", " ").strip()

def hash_query(text):
    # encode sang bytes và băm md5
    md5_hash = hashlib.md5(text.encode("utf-8")).hexdigest()
    return md5_hash

