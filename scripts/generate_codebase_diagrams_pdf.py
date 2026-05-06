from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas


PAGE_W, PAGE_H = A4


def title(c: canvas.Canvas, text: str, y: float) -> float:
    c.setFillColor(colors.HexColor("#111827"))
    c.setFont("Helvetica-Bold", 18)
    c.drawString(20 * mm, y, text)
    return y - 10 * mm


def subtitle(c: canvas.Canvas, text: str, y: float) -> float:
    c.setFillColor(colors.HexColor("#374151"))
    c.setFont("Helvetica", 10)
    c.drawString(20 * mm, y, text)
    return y - 8 * mm


def node(c: canvas.Canvas, x: float, y: float, w: float, h: float, text: str, fill="#F9FAFB") -> None:
    c.setFillColor(colors.HexColor(fill))
    c.setStrokeColor(colors.HexColor("#6B7280"))
    c.roundRect(x, y, w, h, 4, fill=1, stroke=1)
    c.setFillColor(colors.HexColor("#111827"))
    c.setFont("Helvetica", 8)
    text_lines = text.split("\n")
    line_y = y + h - 10
    for line in text_lines:
        c.drawCentredString(x + w / 2, line_y, line)
        line_y -= 9


def arrow(c: canvas.Canvas, x1: float, y1: float, x2: float, y2: float, label: str = "") -> None:
    c.setStrokeColor(colors.HexColor("#4B5563"))
    c.setLineWidth(1)
    c.line(x1, y1, x2, y2)
    # Arrow head
    dx = x2 - x1
    dy = y2 - y1
    mag = (dx**2 + dy**2) ** 0.5 or 1
    ux, uy = dx / mag, dy / mag
    px, py = -uy, ux
    size = 5
    c.line(x2, y2, x2 - ux * size + px * 2.5, y2 - uy * size + py * 2.5)
    c.line(x2, y2, x2 - ux * size - px * 2.5, y2 - uy * size - py * 2.5)
    if label:
        c.setFillColor(colors.HexColor("#374151"))
        c.setFont("Helvetica", 7)
        c.drawString((x1 + x2) / 2 + 2, (y1 + y2) / 2 + 2, label)


def page_architecture(c: canvas.Canvas) -> None:
    y = PAGE_H - 20 * mm
    y = title(c, "EMIL Claims API - Codebase Architecture", y)
    y = subtitle(c, "Contract-first design: OpenAPI spec drives both mock behavior and test assertions.", y)

    node(c, 20 * mm, 225 * mm, 48 * mm, 18 * mm, "claims-api.yaml\nOpenAPI contract", fill="#EFF6FF")
    node(c, 82 * mm, 225 * mm, 50 * mm, 18 * mm, "lib/openapi.ts\nYAML + AJV validators", fill="#EEF2FF")
    node(c, 146 * mm, 225 * mm, 44 * mm, 18 * mm, "lib/types.ts\ndomain types", fill="#F5F3FF")

    node(c, 20 * mm, 190 * mm, 62 * mm, 18 * mm, "src/claims-mock-app.ts\nExpress mock API", fill="#ECFDF5")
    node(c, 92 * mm, 190 * mm, 52 * mm, 18 * mm, "src/mock-server.ts\napp.listen()", fill="#ECFEFF")
    node(c, 154 * mm, 190 * mm, 36 * mm, 18 * mm, "GET/POST/\nPATCH routes", fill="#ECFEFF")

    node(c, 20 * mm, 155 * mm, 58 * mm, 18 * mm, "playwright.config.ts\nwebServer + baseURL", fill="#FEFCE8")
    node(c, 88 * mm, 155 * mm, 54 * mm, 18 * mm, "tests/support/*\nfixtures/client/builder", fill="#FFF7ED")
    node(c, 152 * mm, 155 * mm, 38 * mm, 18 * mm, "tests/specs/*\nAPI tests", fill="#FFF7ED")

    node(c, 20 * mm, 120 * mm, 50 * mm, 16 * mm, "CI workflow\nnpm test", fill="#F3F4F6")
    node(c, 82 * mm, 120 * mm, 50 * mm, 16 * mm, "README.md\nCODEBASE_GUIDE.md", fill="#F3F4F6")
    node(c, 144 * mm, 120 * mm, 46 * mm, 16 * mm, "test-cases.md\nTC catalog", fill="#F3F4F6")

    arrow(c, 68 * mm, 234 * mm, 82 * mm, 234 * mm, "load")
    arrow(c, 132 * mm, 234 * mm, 146 * mm, 234 * mm, "types")
    arrow(c, 107 * mm, 225 * mm, 51 * mm, 208 * mm, "validate")
    arrow(c, 107 * mm, 225 * mm, 115 * mm, 173 * mm, "validators")
    arrow(c, 51 * mm, 190 * mm, 118 * mm, 190 * mm, "import app")
    arrow(c, 144 * mm, 199 * mm, 154 * mm, 199 * mm, "serve")
    arrow(c, 49 * mm, 173 * mm, 118 * mm, 173 * mm, "run with")
    arrow(c, 142 * mm, 164 * mm, 152 * mm, 164 * mm, "used by")
    arrow(c, 51 * mm, 155 * mm, 45 * mm, 136 * mm, "in CI")
    arrow(c, 171 * mm, 136 * mm, 171 * mm, 155 * mm, "maps tests")


def page_sequence(c: canvas.Canvas) -> None:
    y = PAGE_H - 20 * mm
    y = title(c, "Request Lifecycle - Sequence (Create Claim)", y)
    y = subtitle(c, "How one POST /claims test request moves through fixtures, client, mock, validation, and assertions.", y)

    lanes = [
        ("Spec", 20 * mm),
        ("Fixtures", 54 * mm),
        ("ClaimsClient", 88 * mm),
        ("Playwright\nRequest", 124 * mm),
        ("Express Mock", 160 * mm),
    ]
    for name, x in lanes:
        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(colors.HexColor("#111827"))
        c.drawCentredString(x + 12 * mm, 245 * mm, name)
        c.setStrokeColor(colors.HexColor("#D1D5DB"))
        c.line(x + 12 * mm, 240 * mm, x + 12 * mm, 60 * mm)

    steps = [
        (0, 1, 225 * mm, "inject claims fixture"),
        (0, 2, 210 * mm, "claims.create(payload)"),
        (2, 3, 195 * mm, "POST /claims"),
        (3, 4, 180 * mm, "HTTP request"),
        (4, 4, 165 * mm, "AJV schema validation"),
        (4, 4, 150 * mm, "business rules"),
        (4, 3, 135 * mm, "201 Claim + Location"),
        (3, 2, 120 * mm, "APIResponse"),
        (2, 0, 105 * mm, "response to test"),
        (0, 1, 90 * mm, "expectSchema(...)"),
    ]
    for src, dst, yv, text in steps:
        x1 = lanes[src][1] + 12 * mm
        x2 = lanes[dst][1] + 12 * mm
        arrow(c, x1, yv, x2, yv, text)

    c.setFont("Helvetica", 8)
    c.setFillColor(colors.HexColor("#374151"))
    c.drawString(20 * mm, 68 * mm, "Error branches:")
    c.drawString(48 * mm, 68 * mm, "- 400 for schema/syntax failures")
    c.drawString(48 * mm, 62 * mm, "- 422 for business-rule violations")


def page_pipeline(c: canvas.Canvas) -> None:
    y = PAGE_H - 20 * mm
    y = title(c, "Validation and Response Pipeline", y)
    y = subtitle(c, "Compact flow of request handling logic for any endpoint in the mock.", y)

    node(c, 25 * mm, 215 * mm, 40 * mm, 14 * mm, "Test case", fill="#FFF7ED")
    node(c, 72 * mm, 215 * mm, 45 * mm, 14 * mm, "ClaimsClient", fill="#FFF7ED")
    node(c, 124 * mm, 215 * mm, 45 * mm, 14 * mm, "Express route", fill="#ECFDF5")

    node(c, 48 * mm, 182 * mm, 52 * mm, 14 * mm, "Schema validation\nAJV/OpenAPI", fill="#EEF2FF")
    node(c, 114 * mm, 182 * mm, 56 * mm, 14 * mm, "Business rules\nstate machine", fill="#EEF2FF")

    node(c, 48 * mm, 149 * mm, 52 * mm, 14 * mm, "Error envelope\n400/404/422", fill="#FEE2E2")
    node(c, 114 * mm, 149 * mm, 56 * mm, 14 * mm, "Store/read claim\nMap<string, Claim>", fill="#DCFCE7")

    node(c, 80 * mm, 116 * mm, 58 * mm, 14 * mm, "JSON response + schema assert", fill="#FEF9C3")
    node(c, 80 * mm, 83 * mm, 58 * mm, 14 * mm, "Playwright expect + report", fill="#FEF3C7")

    arrow(c, 65 * mm, 222 * mm, 72 * mm, 222 * mm)
    arrow(c, 117 * mm, 222 * mm, 124 * mm, 222 * mm)
    arrow(c, 146 * mm, 215 * mm, 74 * mm, 196 * mm, "validate")
    arrow(c, 146 * mm, 215 * mm, 142 * mm, 196 * mm, "rules")
    arrow(c, 74 * mm, 182 * mm, 74 * mm, 163 * mm, "invalid")
    arrow(c, 142 * mm, 182 * mm, 142 * mm, 163 * mm, "valid")
    arrow(c, 74 * mm, 149 * mm, 109 * mm, 130 * mm)
    arrow(c, 142 * mm, 149 * mm, 109 * mm, 130 * mm)
    arrow(c, 109 * mm, 116 * mm, 109 * mm, 97 * mm)


def build(path: str) -> None:
    c = canvas.Canvas(path, pagesize=A4)
    c.setTitle("EMIL Claims API - Codebase Diagrams")
    c.setAuthor("Codex")

    page_architecture(c)
    c.showPage()
    page_sequence(c)
    c.showPage()
    page_pipeline(c)
    c.showPage()
    c.save()


if __name__ == "__main__":
    build("output/pdf/codebase-diagrams.pdf")
