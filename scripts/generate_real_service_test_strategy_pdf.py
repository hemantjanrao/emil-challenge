from pathlib import Path
import re

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parent.parent
SOURCE_MD = ROOT / "docs" / "REAL_SERVICE_TEST_STRATEGY.md"
OUTPUT_PDF = ROOT / "output" / "pdf" / "real-emil-claims-test-strategy.pdf"


def fmt_inline(text: str) -> str:
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"`([^`]+)`", r"<font name='Courier'>\1</font>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    return text


def build_story(markdown: str):
    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "Title",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        spaceAfter=8,
    )
    h2 = ParagraphStyle(
        "H2",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12.5,
        leading=16,
        spaceBefore=7,
        spaceAfter=4,
    )
    body = ParagraphStyle(
        "Body",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10,
        leading=13,
        spaceAfter=3,
    )

    story = []
    lines = markdown.splitlines()
    for i, line in enumerate(lines):
        t = line.strip()
        if not t:
            story.append(Spacer(1, 2))
            continue
        if i == 0 and t.startswith("# "):
            story.append(Paragraph(fmt_inline(t[2:]), title))
            continue
        if t.startswith("## "):
            story.append(Paragraph(fmt_inline(t[3:]), h2))
            continue
        if t.startswith("- "):
            story.append(Paragraph(fmt_inline(f"• {t[2:]}"), body))
            continue
        story.append(Paragraph(fmt_inline(t), body))

    return story


def main() -> None:
    if not SOURCE_MD.exists():
        raise FileNotFoundError(f"Missing source markdown: {SOURCE_MD}")

    OUTPUT_PDF.parent.mkdir(parents=True, exist_ok=True)
    content = SOURCE_MD.read_text(encoding="utf-8")

    doc = SimpleDocTemplate(
        str(OUTPUT_PDF),
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=14 * mm,
        title="Real EMIL Claims Service Test Strategy",
        author="Codex",
    )
    doc.build(build_story(content))
    print(f"Generated: {OUTPUT_PDF}")


if __name__ == "__main__":
    main()
