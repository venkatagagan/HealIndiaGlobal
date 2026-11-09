"""Hospital invitation letter PDF (fpdf2, same approach as ``app.modules.payments.invoices``).

Passport numbers reach this module still encrypted (``v1:`` ciphertext read with ``type_coerce``) and are
decrypted only while rendering, so they never sit in request/response models or logs. Core PDF fonts are
Latin-1 only: other characters are replaced with ``?``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from fpdf import FPDF

from app.core.config import settings
from app.core.crypto import CryptoError, decrypt_str, is_encrypted


@dataclass(slots=True)
class LetterAttendant:
    full_name: str
    relationship: str | None = None
    passport: str | None = None
    """Ciphertext (``v1:...``) or a plain value typed by the hospital for this letter."""


@dataclass(slots=True)
class LetterContext:
    issued_on: date
    reference: str
    hospital_name: str
    hospital_legal_name: str | None
    hospital_address_lines: list[str]
    hospital_phone: str | None
    hospital_email: str | None
    hospital_website: str | None
    hospital_registration: str | None
    patient_name: str
    patient_dob: date | None
    nationality: str | None
    passport_cipher: str | None
    passport_expiry: date | None
    procedure: str | None
    specialty: str | None
    doctor_name: str | None
    doctor_registration: str | None
    arrival_on: date | None
    duration_days: int | None
    visa_label: str
    contact_name: str | None
    contact_phone: str | None
    contact_email: str | None
    notes: str | None = None
    attendants: list[LetterAttendant] = field(default_factory=list)


def _latin1(text: object) -> str:
    return str(text if text is not None else "").encode("latin-1", "replace").decode("latin-1")


def _passport(value: str | None) -> str:
    """Decrypt a stored passport number for the letter (plain values pass through)."""
    if not value:
        return "To be provided"
    if not is_encrypted(value):
        return value
    try:
        return decrypt_str(value)
    except CryptoError:
        return "To be provided"


def _date(value: date | None) -> str:
    return value.strftime("%d %B %Y") if value else "To be confirmed"


def _para(pdf: FPDF, w: float, h: float, text: str) -> None:
    """A wrapped paragraph that leaves the cursor at the left margin of the next line."""
    pdf.multi_cell(w, h, text, new_x="LMARGIN", new_y="NEXT")


def render_invitation_letter(ctx: LetterContext) -> bytes:
    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    pdf.set_title(_latin1(f"Invitation letter {ctx.reference}"))
    pdf.set_author(_latin1(ctx.hospital_name))
    pdf.set_creator(_latin1(settings.APP_NAME))

    # Letterhead
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 8, _latin1(ctx.hospital_name), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    for line in ctx.hospital_address_lines:
        pdf.cell(0, 4.5, _latin1(line), new_x="LMARGIN", new_y="NEXT")
    contact = " | ".join(x for x in (ctx.hospital_phone, ctx.hospital_email, ctx.hospital_website) if x)
    if contact:
        pdf.cell(0, 4.5, _latin1(contact), new_x="LMARGIN", new_y="NEXT")
    registration = " | ".join(x for x in (ctx.hospital_legal_name, ctx.hospital_registration) if x)
    if registration:
        pdf.cell(0, 4.5, _latin1(registration), new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(30, 90, 140)
    pdf.set_line_width(0.6)
    y = pdf.get_y() + 2
    pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
    pdf.ln(6)

    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 5, _latin1(f"Date: {_date(ctx.issued_on)}"), new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 5, _latin1(f"Reference: {ctx.reference}"), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)
    _para(
        pdf,
        0,
        5,
        _latin1(
            "To\nThe Visa Officer\n"
            "Embassy / High Commission / Consulate of India, or the Indian e-Visa authority"
        ),
    )
    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 11)
    _para(pdf, 0, 6, _latin1(f"Subject: Medical invitation letter for {ctx.patient_name} ({ctx.visa_label})"))
    pdf.ln(2)

    pdf.set_font("Helvetica", "", 10)
    treatment = ctx.procedure or ctx.specialty or "medical treatment"
    _para(
        pdf,
        0,
        5,
        _latin1(
            f"Dear Sir or Madam,\n\nThis is to confirm that the patient named below has been accepted for "
            f"{treatment} at {ctx.hospital_name}, India. We request you to kindly grant the patient (and the "
            "attendants listed) the appropriate visa to travel to India for this treatment."
        ),
    )
    pdf.ln(3)

    rows = [
        ("Patient name", ctx.patient_name),
        ("Date of birth", _date(ctx.patient_dob) if ctx.patient_dob else "-"),
        ("Nationality", ctx.nationality or "-"),
        ("Passport number", _passport(ctx.passport_cipher)),
        ("Passport valid until", _date(ctx.passport_expiry) if ctx.passport_expiry else "-"),
        ("Treatment", treatment),
        ("Department", ctx.specialty or "-"),
        ("Treating doctor", ctx.doctor_name or "To be assigned"),
        ("Doctor registration", ctx.doctor_registration or "-"),
        ("Expected arrival", _date(ctx.arrival_on)),
        (
            "Expected duration",
            f"About {ctx.duration_days} days of treatment and recovery"
            if ctx.duration_days
            else "To be confirmed",
        ),
    ]
    for label, value in rows:
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(48, 6, _latin1(label))
        pdf.set_font("Helvetica", "", 10)
        _para(pdf, 0, 6, _latin1(value))
    pdf.ln(3)

    if ctx.attendants:
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(0, 6, "Attendants travelling with the patient", new_x="LMARGIN", new_y="NEXT")
        pdf.set_fill_color(240, 244, 248)
        pdf.cell(70, 7, "Name", border=1, fill=True)
        pdf.cell(45, 7, "Relationship", border=1, fill=True)
        pdf.cell(0, 7, "Passport number", border=1, fill=True, new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        for att in ctx.attendants:
            pdf.cell(70, 7, _latin1(att.full_name[:45]), border=1)
            pdf.cell(45, 7, _latin1((att.relationship or "-")[:28]), border=1)
            pdf.cell(0, 7, _latin1(_passport(att.passport)), border=1, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

    if ctx.notes:
        _para(pdf, 0, 5, _latin1(ctx.notes))
        pdf.ln(2)
    _para(
        pdf,
        0,
        5,
        _latin1(
            "The patient will bear the cost of treatment and stay. For any verification please contact our "
            "international patient desk:"
        ),
    )
    contact_line = ", ".join(x for x in (ctx.contact_name, ctx.contact_phone, ctx.contact_email) if x)
    pdf.set_font("Helvetica", "B", 10)
    _para(pdf, 0, 5, _latin1(contact_line or ctx.hospital_name))
    pdf.ln(8)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 5, _latin1(f"For {ctx.hospital_name}"), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(10)
    pdf.cell(0, 5, "Authorised signatory", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)
    pdf.set_font("Helvetica", "", 7.5)
    _para(
        pdf,
        0,
        3.8,
        _latin1(
            f"Issued through {settings.APP_NAME} on behalf of the hospital. This letter does not guarantee "
            "the grant of a visa; the decision rests with the Government of India."
        ),
    )
    return bytes(pdf.output())
