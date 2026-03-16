# ...existing code...
import re
from pathlib import Path

PATTERNS = {
    "roman": re.compile(r'^(?P<sym>[IVXLCDM]+)\.$'),
    "upper": re.compile(r'^(?P<sym>[A-Z])[.)]$'),
    "lower": re.compile(r'^(?P<sym>[a-z])[.)]$'),
    "decimal": re.compile(r'^(?P<sym>\d+(?:\.\d+)*)(?:[.)])?$')
}

def detect_heading_type(token: str):
    for name, regex in PATTERNS.items():
        if regex.match(token):
            return name
    return None

def read_lines(md_path):
    md_path = Path(md_path)
    with md_path.open('r', encoding='utf-8') as f:
        return md_path, f.readlines()

def is_small_number_line(line: str) -> bool:
    return (len(line) <= 3) and re.match(r'^\s*\d+\s*$', line) and line != "\n"

def starts_with_lowercase_vietnamese(line: str) -> bool:
    return re.match(r'^[a-zâăđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗợớờởỡợúùủũụứừửữựýỳỷỹỵ]', line) is not None

def merge_lowercase_line(line: str, new_lines: list) -> bool:
    stripped = line.lstrip()
    token = stripped.split()[0] if stripped.strip() else ''
    if detect_heading_type(token) == "lower":
        return False  # leave for normal processing
    content = stripped
    if not content.endswith('\n'):
        content += '\n'
    prev_idx = len(new_lines) - 1
    while prev_idx >= 0 and new_lines[prev_idx] == '\n':
        prev_idx -= 1
    if prev_idx >= 0:
        prev = new_lines[prev_idx].rstrip('\n')
        if not prev.endswith(' '):
            prev += ' '
        new_lines[prev_idx] = prev + content.rstrip('\n') + '\n'
    else:
        new_lines.append(content)
    return True

def collapse_blank_lines(text: str) -> str:
    return re.sub(r'(\s*\n\s*){2,}', '\n\n', text)

def write_output(md_path: Path, text: str) -> str:
    out_path = md_path.with_name(md_path.stem + "_posted" + md_path.suffix)
    with out_path.open('w', encoding='utf-8') as f:
        f.write(text)
    return str(out_path)

def process_lines(lines: list) -> str:
    new_lines = []
    i = 0
    while i < len(lines):
        line = lines[i]

        # Bỏ dòng chỉ chứa số
        if is_small_number_line(line):
            i += 1
            continue

        # Ghép dòng chữ thường
        if starts_with_lowercase_vietnamese(line):
            if not merge_lowercase_line(line, new_lines):
                # token đầu dòng là kiểu "lower" -> xử lý bình thường
                pass
            else:
                i += 1
                continue

        # Bỏ dòng trống thừa
        if line == '\n' and new_lines and new_lines[-1] == '\n':
            i += 1
            continue

        new_lines.append(line)
        i += 1

    text = ''.join(new_lines)
    text = collapse_blank_lines(text)
    return text

def post_process(md_path):
    md_path, lines = read_lines(md_path)
    text = process_lines(lines)
    return write_output(md_path, text)

if __name__ == "__main__":
    md_path = r"D:\Document\Code\Projects\Tool-use_Agent\DocumentExtraction\output\scribe_test\scribe_test.md"
    post_process(md_path)
# ...existing code...