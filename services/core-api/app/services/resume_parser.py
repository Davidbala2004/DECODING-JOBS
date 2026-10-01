"""Extracts plain text from an uploaded resume file (PDF or DOCX)."""

import io
import logging
import os

logger = logging.getLogger("decoding_jobs.core_api.resume_parser")

SUPPORTED_CONTENT_TYPES = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
}

# Filename extension -> canonical content type. Used only when the browser
# didn't send a usable type (see resolve_content_type): some OS/browser combos
# report an empty or generic octet-stream MIME type for a perfectly valid
# .docx, which used to surface as a bogus "unsupported format" error.
_EXTENSION_CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


class UnsupportedResumeFormat(Exception):
    """Raised when the uploaded file isn't a PDF or DOCX."""


def resolve_content_type(content_type: str | None, filename: str | None) -> str | None:
    """Returns a supported content type, or None if the file can't be accepted.

    Trusts a real declared type first; only when that's missing or generic
    does it fall back to the filename's extension.
    """
    if content_type in SUPPORTED_CONTENT_TYPES:
        return content_type
    if not content_type or content_type == "application/octet-stream":
        ext = os.path.splitext(filename or "")[1].lower()
        if ext in _EXTENSION_CONTENT_TYPES:
            return _EXTENSION_CONTENT_TYPES[ext]
    return None


def extract_text(file_bytes: bytes, content_type: str) -> str:
    kind = SUPPORTED_CONTENT_TYPES.get(content_type)
    if kind is None:
        raise UnsupportedResumeFormat(f"Unsupported content type: {content_type}")

    if kind == "pdf":
        return _extract_pdf_text(file_bytes)
    return _extract_docx_text(file_bytes)


def _extract_pdf_text(file_bytes: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(file_bytes))
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(pages).strip()


def _extract_docx_text(file_bytes: bytes) -> str:
    from docx import Document

    document = Document(io.BytesIO(file_bytes))
    paragraphs = [p.text for p in document.paragraphs]
    return "\n".join(paragraphs).strip()
