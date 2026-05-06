from pathlib import Path
import re

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parent.parent
SOURCE_MD = ROOT / "INTERVIEW_PREP.md"
OUTPUT_PDF = ROOT / "output" / "pdf" / "interview-qa-prep.pdf"


def inline_format(text: str) -> str:
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"`([^`]+)`", r"<font name='Courier'>\1</font>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    return text


def build_story(md_text: str):
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "Title",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        spaceAfter=8,
    )
    h2_style = ParagraphStyle(
        "H2",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=16,
        spaceBefore=8,
        spaceAfter=5,
    )
    h3_style = ParagraphStyle(
        "H3",
        parent=styles["Heading3"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        spaceBefore=6,
        spaceAfter=4,
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10,
        leading=13,
        spaceAfter=3,
    )
    quote_style = ParagraphStyle(
        "Quote",
        parent=body_style,
        leftIndent=10 * mm,
        borderPadding=2,
        textColor="#1F2937",
    )
    followup_style = ParagraphStyle(
        "FollowUp",
        parent=body_style,
        textColor="#374151",
    )

    story = []
    lines = md_text.splitlines()

    for idx, line in enumerate(lines):
        text = line.strip()
        if not text:
            story.append(Spacer(1, 2))
            continue
        if text == "---":
            story.append(Spacer(1, 6))
            continue
        if idx == 0 and text.startswith("# "):
            story.append(Paragraph(inline_format(text[2:].strip()), title_style))
            continue
        if text.startswith("## "):
            story.append(Paragraph(inline_format(text[3:].strip()), h2_style))
            continue
        if text.startswith("### "):
            story.append(Paragraph(inline_format(text[4:].strip()), h3_style))
            continue
        if text.startswith("> "):
            story.append(Paragraph(inline_format(text[2:].strip()), quote_style))
            continue
        if text.startswith("**Follow-up:**"):
            story.append(Paragraph(inline_format(text), followup_style))
            continue
        if text.startswith("- "):
            story.append(Paragraph(inline_format(f"• {text[2:].strip()}"), body_style))
            continue

        story.append(Paragraph(inline_format(text), body_style))

    return story


def main() -> None:
    if not SOURCE_MD.exists():
        raise FileNotFoundError(f"Missing source markdown: {SOURCE_MD}")

    OUTPUT_PDF.parent.mkdir(parents=True, exist_ok=True)
    md_text = SOURCE_MD.read_text(encoding="utf-8")

    doc = SimpleDocTemplate(
        str(OUTPUT_PDF),
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=14 * mm,
        title="Emil Senior QA Automation Interview Q&A",
        author="Codex",
    )
    doc.build(build_story(md_text))
    print(f"Generated: {OUTPUT_PDF}")


if __name__ == "__main__":
    main()
