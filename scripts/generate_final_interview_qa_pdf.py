from pathlib import Path
import re

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parent.parent
SOURCE_MD = ROOT / "docs" / "FINAL_INTERVIEW_QA_EMIL.md"
OUTPUT_PDF = ROOT / "output" / "pdf" / "final-emil-interview-qa.pdf"


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
    answer_style = ParagraphStyle(
        "Answer",
        parent=body_style,
        leftIndent=8 * mm,
        textColor="#1F2937",
    )

    story = []
    lines = md_text.splitlines()

    for idx, line in enumerate(lines):
        t = line.strip()
        if not t:
            story.append(Spacer(1, 2))
            continue
        if t == "---":
            story.append(Spacer(1, 6))
            continue
        if idx == 0 and t.startswith("# "):
            story.append(Paragraph(inline_format(t[2:]), title_style))
            continue
        if t.startswith("## "):
            story.append(Paragraph(inline_format(t[3:]), h2_style))
            continue
        if t.startswith("### "):
            story.append(Paragraph(inline_format(t[4:]), h3_style))
            continue
        if t.startswith("**Answer:**"):
            story.append(Paragraph(inline_format("Answer:"), answer_style))
            continue
        if t.startswith("- "):
            story.append(Paragraph(inline_format(f"• {t[2:]}"), body_style))
            continue

        style = answer_style if lines[max(0, idx - 1)].strip().startswith("**Answer:**") else body_style
        story.append(Paragraph(inline_format(t), style))

    return story


def main() -> None:
    if not SOURCE_MD.exists():
        raise FileNotFoundError(f"Missing source markdown: {SOURCE_MD}")

    OUTPUT_PDF.parent.mkdir(parents=True, exist_ok=True)
    text = SOURCE_MD.read_text(encoding="utf-8")

    doc = SimpleDocTemplate(
        str(OUTPUT_PDF),
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=14 * mm,
        title="EMIL Final Interview Q&A",
        author="Codex",
    )
    doc.build(build_story(text))
    print(f"Generated: {OUTPUT_PDF}")


if __name__ == "__main__":
    main()
