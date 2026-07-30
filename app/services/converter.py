from __future__ import annotations

import hashlib
import re
from pathlib import Path


_CJK_PDF_FIXES = [
    ("摘 要", "摘要"),
    ("关 键 词", "关键词"),
    ("中 图 分 类 号", "中图分类号"),
]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _fix_cjk_pdf_text(text: str) -> str:
    for bad, good in _CJK_PDF_FIXES:
        text = text.replace(bad, good)
    return text


def _via_pymupdf(source_path: Path) -> tuple[str, int]:
    import fitz

    pages: list[str] = []
    with fitz.open(source_path) as document:
        for number, page in enumerate(document, start=1):
            text = page.get_text("text").strip()
            pages.append(f"<!-- page: {number} -->\n{text}" if text else f"<!-- page: {number} -->")
        return "\n\n".join(pages).strip(), len(document)


def _via_pypdfium2(source_path: Path) -> tuple[str, int]:
    import pypdfium2 as pdfium

    document = pdfium.PdfDocument(str(source_path))
    pages = []
    for number in range(len(document)):
        text = document[number].get_textpage().get_text_bounded() or ""
        pages.append(f"<!-- page: {number + 1} -->\n{text.strip()}")
    return "\n\n".join(pages).strip(), len(document)


def _via_markitdown(source_path: Path) -> tuple[str, int]:
    from markitdown import MarkItDown

    result = MarkItDown().convert(str(source_path))
    return (result.text_content or "").strip(), 0


def _text_quality_score(text: str) -> float:
    if len(text.strip()) < 40:
        return -1.0
    total = len(text)
    cjk = sum(1 for char in text if "\u4e00" <= char <= "\u9fff")
    pipe_lines = sum(1 for line in text.splitlines() if line.strip().startswith("|"))
    table_ratio = pipe_lines / max(1, text.count("\n") + 1)
    score = cjk * 2.0 + min(total, 20_000) * 0.01
    score -= table_ratio * 5_000
    if "[摘" in text and "要]" in text and "[摘 要]" not in text:
        score -= 800
    return score


def extract_pdf(source_path: Path) -> tuple[str, int, str, list[str]]:
    """Try reference-compatible PDF engines and retain failures as evidence."""
    candidates: list[tuple[float, str, str, int]] = []
    errors: list[str] = []
    for name, extractor in (
        ("PyMuPDF", _via_pymupdf),
        ("pypdfium2", _via_pypdfium2),
        ("MarkItDown", _via_markitdown),
    ):
        try:
            text, pages = extractor(source_path)
            if text:
                candidates.append((_text_quality_score(text), name, text, pages))
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{name}: {exc}")
    if not candidates:
        detail = "；".join(errors) or "无文本"
        raise RuntimeError(f"PDF 文本提取失败：{detail}")
    _, engine, text, page_count = max(candidates, key=lambda item: item[0])
    return _fix_cjk_pdf_text(text), page_count, engine, errors


def extract_abstract_and_keywords(text: str) -> tuple[str, list[str]]:
    normalized = text.replace("\u3000", " ").replace("\r\n", "\n")
    abstract = ""
    abstract_patterns = [
        r"(?:^|\n)\s*摘要\s*[:：]?\s*(.+?)(?=\n\s*关键词|\n\s*Abstract|\n\s*一[、.．]|\n\s*1[.．]|$)",
        r"(?:^|\n)\s*Abstract\s*[:：]?\s*(.+?)(?=\n\s*Key\s*words?|\n\s*关键词|\n\s*1[.．]|\n\s*Introduction|$)",
    ]
    for pattern in abstract_patterns:
        match = re.search(pattern, normalized, flags=re.IGNORECASE | re.DOTALL)
        if match:
            value = re.sub(r"\s+", " ", match.group(1)).strip()
            if len(value) >= 40:
                abstract = value.rstrip("。.;； ") + "。"
                break

    keywords: list[str] = []
    keyword_patterns = [
        r"(?:^|\n)\s*关键词\s*[:：]?\s*(.+?)(?=\n\s*(?:中图分类|文献标识码|Abstract|一[、.．]|1[.．])|$)",
        r"(?:^|\n)\s*Key\s*words?\s*[:：]?\s*(.+?)(?=\n\s*(?:Introduction|1[.．]|摘要)|$)",
    ]
    for pattern in keyword_patterns:
        match = re.search(pattern, normalized, flags=re.IGNORECASE | re.DOTALL)
        if not match:
            continue
        raw = re.split(r"(?:中图分类号|文献标识码|作者简介)", re.sub(r"\s+", " ", match.group(1)))[0]
        for item in re.split(r"[;；,，、|/]+", raw):
            value = item.strip(" .。;；[]【】")
            if value and len(value) <= 40 and re.search(r"[\u4e00-\u9fffA-Za-z0-9]", value):
                if value not in keywords:
                    keywords.append(value)
        if keywords:
            break
    return abstract, keywords


def convert_pdf(source_path: Path, output_path: Path, preferred_title: str) -> dict:
    text, page_count, engine, errors = extract_pdf(source_path)
    if not text.lstrip().startswith("#"):
        text = f"# {preferred_title}\n\n{text}"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(text, encoding="utf-8")
    abstract, keywords = extract_abstract_and_keywords(text)
    return {
        "text": text,
        "page_count": page_count,
        "engine": engine,
        "errors": errors,
        "abstract": abstract,
        "keywords": keywords,
    }
