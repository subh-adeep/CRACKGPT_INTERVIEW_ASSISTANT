import io
import zipfile
import re

def _safe_decode(b: bytes) -> str:
    try:
        return b.decode("utf-8", errors="ignore")
    except Exception:
        return ""

def extract_docx_text(data: bytes) -> str:
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
        xml = zf.read("word/document.xml")
        from xml.etree import ElementTree as ET
        root = ET.fromstring(xml)
        out = []
        for e in root.iter():
            tag = e.tag.split('}')[-1]
            if tag == "t":
                out.append(e.text or "")
            elif tag in ("br", "p"):
                out.append("\n")
        s = "".join(out)
        s = re.sub(r"\n{3,}", "\n\n", s)
        return s.strip()
    except Exception:
        return _safe_decode(data)

def extract_pdf_text(data: bytes) -> str:
    try:
        import PyPDF2
        reader = PyPDF2.PdfReader(io.BytesIO(data))
        out = []
        for p in reader.pages:
            t = p.extract_text() or ""
            out.append(t)
        return "\n".join(out).strip()
    except Exception:
        return _safe_decode(data)

def extract_text(data: bytes, filename: str) -> str:
    name = (filename or "").lower()
    if name.endswith(".docx"):
        txt = extract_docx_text(data)
    elif name.endswith(".pdf"):
        txt = extract_pdf_text(data)
    else:
        txt = _safe_decode(data)
    if not txt or len(txt.strip()) < 15:
        fallback = _safe_decode(data)
        if len(fallback.strip()) > len(txt.strip()):
            txt = fallback
    return txt.strip()