"""Discharge summary PDF (fpdf2) on the hospital's letterhead - same layout approach as the visa invitation
letter (``app.modules.travel.invitation_letter``), but with embedded Unicode fonts so patient names in Arabic,
Bengali, Cyrillic or accented Latin render: Roboto (Latin, Cyrillic, Greek; Apache 2.0) with Noto Sans
Arabic / Noto Sans Bengali (SIL OFL) as fallbacks, all under ``app/assets/fonts``. Arabic is joined and laid
out right-to-left only when ``uharfbuzz`` is installed (fpdf2 text shaping); otherwise letters are shown
unjoined but the name stays legible to the reader.

Labels come from the server catalog (``discharge.pdf.*``); the document is rendered in English by default
because it is a clinical handover read by doctors.
"""

from __future__ import annotations

import importlib.util
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

from fpdf import FPDF

from app.core.config import settings
from app.i18n import t

FONTS_DIR = Path(__file__).resolve().parents[2] / "assets" / "fonts"
FONT = "Roboto"


@dataclass(slots=True)
class PdfMedication:
    name: str
    dose: str | None = None
    frequency: str | None = None
    duration_days: int | None = None
    route: str | None = None
    instructions: str | None = None


@dataclass(slots=True)
class DischargePdfContext:
    reference: str
    version: int
    issued_on: date
    finalized_at: datetime | None
    hospital_name: str
    hospital_legal_name: str | None
    hospital_address_lines: list[str]
    hospital_phone: str | None
    hospital_email: str | None
    hospital_website: str | None
    patient_name: str
    patient_dob: date | None
    patient_sex: str | None
    nationality: str | None
    case_number: str
    booking_number: str | None
    doctor_name: str | None
    doctor_registration: str | None
    admission_date: date | None
    discharge_date: date | None
    diagnosis: str | None
    diagnosis_code: str | None
    procedure_name: str | None
    procedure_code: str | None
    procedure_date: date | None
    hospital_course: str | None
    follow_up_instructions: str | None
    red_flag_symptoms: str | None
    allergies: str | None
    investigations_summary: str | None
    medications: list[PdfMedication] = field(default_factory=list)
    attachments: list[str] = field(default_factory=list)
    locale: str = "en"


def _fmt_date(value: date | None, empty: str) -> str:
    return value.strftime("%d %b %Y") if value else empty


def _setup_fonts(pdf: FPDF) -> None:
    pdf.add_font(FONT, "", str(FONTS_DIR / "Roboto-Regular.ttf"))
    pdf.add_font(FONT, "B", str(FONTS_DIR / "Roboto-Bold.ttf"))
    pdf.add_font("NotoArabic", "", str(FONTS_DIR / "NotoSansArabic-Regular.ttf"))
    pdf.add_font("NotoBengali", "", str(FONTS_DIR / "NotoSansBengali-Regular.ttf"))
    pdf.set_fallback_fonts(["NotoArabic", "NotoBengali"], exact_match=False)
    if importlib.util.find_spec("uharfbuzz") is not None:  # pragma: no cover - optional dependency
        pdf.set_text_shaping(True)


def render_discharge_summary(ctx: DischargePdfContext) -> bytes:
    loc = ctx.locale

    def L(key: str, **params: object) -> str:  # noqa: N802 - short label helper
        return t(f"discharge.pdf.{key}", loc, **params)

    empty = L("not_recorded")
    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    _setup_fonts(pdf)
    pdf.add_page()
    pdf.set_title(f"{L('title')} {ctx.reference}")
    pdf.set_author(ctx.hospital_name)
    pdf.set_creator(settings.APP_NAME)
    width = pdf.w - pdf.l_margin - pdf.r_margin

    def para(text: str, h: float = 5) -> None:
        pdf.multi_cell(width, h, text, new_x="LMARGIN", new_y="NEXT")

    def section(title: str, body: str | None) -> None:
        pdf.ln(2)
        pdf.set_font(FONT, "B", 10.5)
        pdf.set_text_color(30, 90, 140)
        para(title, 6)
        pdf.set_text_color(0, 0, 0)
        pdf.set_font(FONT, "", 10)
        para(body.strip() if body and body.strip() else empty)

    # Letterhead
    pdf.set_font(FONT, "B", 16)
    para(ctx.hospital_name, 8)
    pdf.set_font(FONT, "", 9)
    for line in ctx.hospital_address_lines:
        para(line, 4.5)
    contact = " | ".join(x for x in (ctx.hospital_phone, ctx.hospital_email, ctx.hospital_website) if x)
    if contact:
        para(contact, 4.5)
    if ctx.hospital_legal_name:
        para(ctx.hospital_legal_name, 4.5)
    pdf.set_draw_color(30, 90, 140)
    pdf.set_line_width(0.6)
    y = pdf.get_y() + 2
    pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
    pdf.ln(5)

    pdf.set_font(FONT, "B", 14)
    para(L("title"), 7)
    pdf.set_font(FONT, "", 9)
    para(
        L("reference", reference=ctx.reference, version=ctx.version)
        + "  |  "
        + L("issued", date=_fmt_date(ctx.issued_on, empty)),
        4.5,
    )
    pdf.ln(2)

    rows = [
        (L("patient"), ctx.patient_name),
        (L("date_of_birth"), _fmt_date(ctx.patient_dob, empty)),
        (L("sex"), ctx.patient_sex or empty),
        (L("nationality"), ctx.nationality or empty),
        (L("case"), ctx.case_number + (f" / {ctx.booking_number}" if ctx.booking_number else "")),
        (L("admission"), _fmt_date(ctx.admission_date, empty)),
        (L("discharge"), _fmt_date(ctx.discharge_date, empty)),
        (
            L("treating_doctor"),
            (ctx.doctor_name or empty)
            + (f" ({L('registration', number=ctx.doctor_registration)})" if ctx.doctor_registration else ""),
        ),
    ]
    for label, value in rows:
        pdf.set_font(FONT, "B", 9.5)
        pdf.cell(45, 5.5, label)
        pdf.set_font(FONT, "", 9.5)
        pdf.multi_cell(width - 45, 5.5, value, new_x="LMARGIN", new_y="NEXT")

    diagnosis = (ctx.diagnosis or "").strip()
    if ctx.diagnosis_code:
        diagnosis = f"{diagnosis} (ICD-10: {ctx.diagnosis_code})" if diagnosis else f"ICD-10: {ctx.diagnosis_code}"
    section(L("diagnosis"), diagnosis)
    procedure = (ctx.procedure_name or "").strip()
    if procedure or ctx.procedure_date:
        procedure = procedure or empty
        if ctx.procedure_code:
            procedure += f" ({ctx.procedure_code})"
        if ctx.procedure_date:
            procedure += " - " + L("performed_on", date=_fmt_date(ctx.procedure_date, empty))
    section(L("procedure"), procedure)
    section(L("hospital_course"), ctx.hospital_course)
    section(L("investigations"), ctx.investigations_summary)
    section(L("allergies"), ctx.allergies or L("no_known_allergies"))

    # Medications table
    pdf.ln(2)
    pdf.set_font(FONT, "B", 10.5)
    pdf.set_text_color(30, 90, 140)
    para(L("medications"), 6)
    pdf.set_text_color(0, 0, 0)
    if ctx.medications:
        cols = [
            (L("med_name"), 0.32),
            (L("med_dose"), 0.16),
            (L("med_frequency"), 0.2),
            (L("med_duration"), 0.14),
            (L("med_instructions"), 0.18),
        ]
        pdf.set_fill_color(240, 244, 248)
        pdf.set_font(FONT, "B", 8.5)
        for title, share in cols:
            pdf.cell(width * share, 6, title, border=1, fill=True)
        pdf.ln(6)
        pdf.set_font(FONT, "", 8.5)
        for med in ctx.medications:
            duration = L("days", count=med.duration_days) if med.duration_days else L("ongoing")
            instructions = " ".join(x for x in (med.route, med.instructions) if x)
            values = [med.name, med.dose or "-", med.frequency or "-", duration, instructions or "-"]
            # one row: as tall as its tallest cell
            heights = [
                len(pdf.multi_cell(width * share - 1, 5, value, dry_run=True, output="LINES"))
                for value, (_, share) in zip(values, cols, strict=True)
            ]
            row_h = 5 * max(heights + [1])
            if pdf.get_y() + row_h > pdf.page_break_trigger:
                pdf.add_page()
            x0, y0 = pdf.get_x(), pdf.get_y()
            for value, (_, share) in zip(values, cols, strict=True):
                x = pdf.get_x()
                pdf.rect(x, y0, width * share, row_h)
                pdf.multi_cell(width * share, 5, value, new_x="RIGHT", new_y="TOP")
                pdf.set_xy(x + width * share, y0)
            pdf.set_xy(x0, y0 + row_h)
    else:
        pdf.set_font(FONT, "", 10)
        para(L("no_medications"))

    section(L("follow_up"), ctx.follow_up_instructions)
    section(L("red_flags"), ctx.red_flag_symptoms)
    if ctx.attachments:
        section(L("attachments"), "\n".join(f"- {name}" for name in ctx.attachments))

    pdf.ln(8)
    pdf.set_font(FONT, "", 10)
    para(L("signed_for", hospital=ctx.hospital_name))
    if ctx.doctor_name:
        pdf.set_font(FONT, "B", 10)
        para(ctx.doctor_name)
    if ctx.finalized_at:
        pdf.set_font(FONT, "", 9)
        para(L("finalized_at", when=ctx.finalized_at.strftime("%d %b %Y, %H:%M UTC")))
    pdf.ln(5)
    pdf.set_font(FONT, "", 7.5)
    para(L("footer", app=settings.APP_NAME), 3.8)
    return bytes(pdf.output())
