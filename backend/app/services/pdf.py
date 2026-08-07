"""Cashflow report as a PDF.

ReportLab rather than an HTML-to-PDF engine: WeasyPrint needs GTK on Windows and
Cairo/Pango inside the container, which is a lot of system dependency for one endpoint.
This is pure Python and works identically everywhere.
"""

import io
from datetime import UTC, datetime
from decimal import Decimal

from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.shapes import Drawing, Rect
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.repositories.transaction import CategoryTotal, DayTotal, OutstandingRow
from app.services.fonts import report_fonts, supports_unicode
from app.services.periods import DateWindow

# The Glaux daylight palette, matching frontend/src/index.css so a printed report and
# the screen agree. The on-light siblings come from frontend/tools/derive_palette.py;
# ink is nyx itself, shared verbatim with the rest of Glaux.
INK = colors.HexColor("#070B12")
MUTE = colors.HexColor("#5E6F8A")
LINE = colors.HexColor("#E2E4E6")
PAPER = colors.HexColor("#FAF7F2")
INCOME = colors.HexColor("#007E57")
EXPENSE = colors.HexColor("#BD473F")
# Gleam, for the one rule that marks the report as a Glaux document.
GLEAM = colors.HexColor("#E9B45C")

_SYMBOLS = {"LKR": "Rs", "USD": "$", "EUR": "\u20ac", "GBP": "\u00a3", "INR": "\u20b9"}


def _money(amount: Decimal | float, currency: str) -> str:
    symbol = _SYMBOLS.get(currency.upper(), currency.upper())
    return f"{symbol} {Decimal(amount):,.2f}"


def _brand_rule() -> Drawing:
    rule = Drawing(30 * mm, 4 * mm)
    rule.add(Rect(0, 1.6 * mm, 22 * mm, 1.1 * mm, fillColor=GLEAM, strokeColor=None))
    return rule


def build_cashflow_report(
    *,
    business_name: str,
    currency: str,
    window: DateWindow,
    income: Decimal,
    expense: Decimal,
    by_category: list[CategoryTotal],
    daily: list[DayTotal],
    outstanding: list[OutstandingRow] | None = None,
) -> bytes:
    regular, bold = report_fonts()
    buffer = io.BytesIO()

    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=f"{business_name} cashflow {window.start_local} to {window.end_local}",
        author="Glaux Ledger",
    )

    body = ParagraphStyle("body", fontName=regular, fontSize=9.5, textColor=INK, leading=13)
    muted = ParagraphStyle("muted", parent=body, textColor=MUTE, fontSize=8.5)
    heading = ParagraphStyle("heading", fontName=bold, fontSize=11, textColor=INK, spaceAfter=6)
    title = ParagraphStyle("title", fontName=bold, fontSize=20, textColor=INK, leading=24)
    numeric = ParagraphStyle("numeric", parent=body, alignment=TA_RIGHT)

    story: list = [
        Paragraph(business_name, title),
        # A short gleam rule under the masthead. It is the only ornament on the page and
        # the only thing marking the document as Glaux rather than generic accounting
        # output: the report goes to landlords and lenders, so it should be placeable.
        _brand_rule(),
        Paragraph(
            f"Income and expenses · {window.start_local:%d %b %Y} to {window.end_local:%d %b %Y}",
            muted,
        ),
        Spacer(1, 10 * mm),
        _summary_band(income, expense, currency, regular, bold),
        Spacer(1, 8 * mm),
    ]

    if daily:
        story += [
            Paragraph("Daily cashflow", heading),
            _daily_chart(daily, regular),
            Spacer(1, 8 * mm),
        ]

    # One table per direction rather than one mixed table with a Type column to sort out
    # by eye. An accountant reading this wants the cost side as a block, and the heading
    # says what the column used to have to.
    earned = [row for row in by_category if row.entry_type == "income"]
    spent = [row for row in by_category if row.entry_type != "income"]

    if by_category:
        printed = 0
        for label, group in (("Income by category", earned), ("Expenses by category", spent)):
            if not group:
                continue
            if printed:
                story.append(Spacer(1, 7 * mm))
            story.append(
                KeepTogether(
                    [
                        Paragraph(label, heading),
                        _category_table(group, currency, regular, bold, numeric),
                    ]
                )
            )
            printed += 1
    else:
        story.append(
            KeepTogether(
                [
                    Paragraph("By category", heading),
                    _category_table([], currency, regular, bold, numeric),
                ]
            )
        )

    # Deliberately last and deliberately unwindowed: the reader has just seen what the
    # period did, and this is what is still hanging over it. A landlord or lender reading
    # the report cares as much about this as about the net figure.
    if outstanding:
        story += [
            Spacer(1, 8 * mm),
            KeepTogether(
                [
                    Paragraph("Still owed", heading),
                    Paragraph("Unpaid at the time of printing, whenever it was incurred.", muted),
                    Spacer(1, 3 * mm),
                    _outstanding_table(outstanding, currency, regular, bold, numeric),
                ]
            ),
        ]

    if not supports_unicode():
        story += [
            Spacer(1, 6 * mm),
            Paragraph(
                "Note: this report is rendered with a Latin-only font, so Sinhala and "
                "Tamil category names may not appear. See README for how to enable them.",
                muted,
            ),
        ]

    document.build(story, onFirstPage=_footer(regular), onLaterPages=_footer(regular))
    return buffer.getvalue()


def _summary_band(
    income: Decimal, expense: Decimal, currency: str, regular: str, bold: str
) -> Table:
    """Numbers are the content, so they get the largest type on the page."""
    net = income - expense

    table = Table(
        [
            ["Income", "Expenses", "Net"],
            [_money(income, currency), _money(expense, currency), _money(net, currency)],
        ],
        colWidths=[58 * mm, 58 * mm, 58 * mm],
    )
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, 0), regular),
                ("FONTSIZE", (0, 0), (-1, 0), 8),
                ("TEXTCOLOR", (0, 0), (-1, 0), MUTE),
                ("FONTNAME", (0, 1), (-1, 1), bold),
                ("FONTSIZE", (0, 1), (-1, 1), 15),
                ("TEXTCOLOR", (0, 1), (0, 1), INCOME),
                ("TEXTCOLOR", (1, 1), (1, 1), EXPENSE),
                ("TEXTCOLOR", (2, 1), (2, 1), INCOME if net >= 0 else EXPENSE),
                ("BACKGROUND", (0, 0), (-1, -1), PAPER),
                ("BOX", (0, 0), (-1, -1), 0.6, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.6, LINE),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    return table


def _daily_chart(daily: list[DayTotal], regular: str) -> Drawing:
    drawing = Drawing(174 * mm, 55 * mm)
    chart = VerticalBarChart()
    chart.x = 22 * mm
    chart.y = 12 * mm
    chart.width = 148 * mm
    chart.height = 38 * mm

    chart.data = [
        [float(day.income) for day in daily],
        [float(day.expense) for day in daily],
    ]
    chart.bars[0].fillColor = INCOME
    chart.bars[1].fillColor = EXPENSE
    chart.bars.strokeWidth = 0
    chart.groupSpacing = 4
    chart.barSpacing = 1

    chart.valueAxis.valueMin = 0
    chart.valueAxis.labels.fontName = regular
    chart.valueAxis.labels.fontSize = 7
    chart.valueAxis.strokeColor = LINE
    chart.valueAxis.gridStrokeColor = LINE
    chart.valueAxis.visibleGrid = True

    chart.categoryAxis.labels.fontName = regular
    chart.categoryAxis.labels.fontSize = 6.5
    chart.categoryAxis.labels.angle = 45 if len(daily) > 10 else 0
    chart.categoryAxis.labels.boxAnchor = "ne" if len(daily) > 10 else "n"
    chart.categoryAxis.labels.dy = -3
    chart.categoryAxis.strokeColor = LINE
    # A label per day is unreadable past a fortnight; thin them out instead.
    step = max(1, len(daily) // 14)
    chart.categoryAxis.categoryNames = [
        day.day.strftime("%d %b") if index % step == 0 else "" for index, day in enumerate(daily)
    ]

    drawing.add(chart)
    return drawing


def _category_table(
    rows: list[CategoryTotal],
    currency: str,
    regular: str,
    bold: str,
    numeric: ParagraphStyle,
) -> Table:
    if not rows:
        return Table([["No entries in this period."]], colWidths=[174 * mm])

    # The totals carry the direction's colour now that the Type column has gone with the
    # mixed table. It has to be set on the paragraph: a cell TEXTCOLOR does not reach
    # inside a Paragraph, which is what the right-aligned figures are.
    tone = INCOME if rows[0].entry_type == "income" else EXPENSE
    figures = ParagraphStyle("category-total", parent=numeric, textColor=tone)

    data: list[list] = [["Category", "Entries", "Total"]]
    for row in rows:
        data.append(
            [
                row.category_name,
                str(row.count),
                Paragraph(_money(row.total, currency), figures),
            ]
        )

    table = Table(data, colWidths=[106 * mm, 24 * mm, 44 * mm], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, 0), bold),
                ("FONTNAME", (0, 1), (-1, -1), regular),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("TEXTCOLOR", (0, 0), (-1, 0), MUTE),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("LINEBELOW", (0, 0), (-1, 0), 0.8, LINE),
                ("LINEBELOW", (0, 1), (-1, -2), 0.4, LINE),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    return table


def _outstanding_table(
    rows: list[OutstandingRow],
    currency: str,
    regular: str,
    bold: str,
    numeric: ParagraphStyle,
) -> Table:
    today = datetime.now(UTC).date()
    data: list[list] = [["Owed to", "Category", "Due", "Amount"]]
    for row in rows:
        data.append(
            [
                row.counterparty or "-",
                row.category_name,
                row.due_date.strftime("%d %b %Y") if row.due_date else "-",
                Paragraph(_money(row.amount, currency), numeric),
            ]
        )

    total = sum((row.amount for row in rows), Decimal(0))
    data.append(["", "", "Total", Paragraph(_money(total, currency), numeric)])

    table = Table(data, colWidths=[62 * mm, 44 * mm, 30 * mm, 38 * mm], repeatRows=1)
    style = [
        ("FONTNAME", (0, 0), (-1, 0), bold),
        ("FONTNAME", (0, 1), (-1, -1), regular),
        ("FONTNAME", (0, -1), (-1, -1), bold),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (-1, 0), MUTE),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, LINE),
        ("LINEBELOW", (0, 1), (-1, -3), 0.4, LINE),
        ("LINEABOVE", (0, -1), (-1, -1), 0.8, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]
    # Overdue dates in ember, which is the only place the report raises its voice.
    for index, row in enumerate(rows, start=1):
        if row.due_date and row.due_date < today:
            style.append(("TEXTCOLOR", (2, index), (2, index), EXPENSE))
    table.setStyle(TableStyle(style))
    return table


def _footer(regular: str):
    def draw(canvas, document) -> None:
        canvas.saveState()
        canvas.setFont(regular, 7.5)
        canvas.setFillColor(MUTE)
        generated = datetime.now(UTC).strftime("%d %b %Y %H:%M UTC")
        canvas.drawString(18 * mm, 12 * mm, f"Generated by Glaux Ledger · {generated}")
        canvas.drawRightString(A4[0] - 18 * mm, 12 * mm, f"Page {document.page}")
        canvas.restoreState()

    return draw
