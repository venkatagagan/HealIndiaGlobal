"""Model-layer smoke tests: schema, factories, encryption, ledger guarantees, numbering, job dedupe."""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import ids as ids_module
from app.core.crypto import CryptoError, decrypt_str, encrypt_str, mask
from app.core.enums import (
    BookingStatus,
    CaseStatus,
    EntryDirection,
    JobStatus,
    LedgerAccountType,
    LedgerOwnerType,
    LedgerTxnType,
    PayeeType,
    sa_enum,
)
from app.core.ids import uuid7, uuid7_timestamp_ms
from app.models import (
    BackgroundJob,
    Base,
    Booking,
    Case,
    Hospital,
    HospitalMember,
    LedgerAccount,
    LedgerEntry,
    LedgerTransaction,
    PatientProfile,
    PayoutAccount,
    User,
)
from app.models.sequences import financial_year, format_number, next_number
from tests import factories as f

# --------------------------------------------------------------------------------------------- pure units


def test_uuid7_is_version7_monotonic_and_unique(monkeypatch: pytest.MonkeyPatch) -> None:
    # Earlier time-travel tests leave the generator's last timestamp in the future (by design it never goes
    # backwards), so start from a clean state to check the embedded timestamp against the real clock.
    monkeypatch.setattr(ids_module, "_last_ms", -1)
    monkeypatch.setattr(ids_module, "_last_tail", 0)
    ids = [uuid7() for _ in range(5000)]
    assert ids == sorted(ids)
    assert len(set(ids)) == len(ids)
    assert all(i.version == 7 and i.variant == uuid.RFC_4122 for i in ids)
    now_ms = int(datetime.now(UTC).timestamp() * 1000)
    assert abs(uuid7_timestamp_ms(ids[-1]) - now_ms) < 5000


def test_crypto_roundtrip_and_mask() -> None:
    token = encrypt_str("P1234567")
    assert token.startswith("v1:") and "P1234567" not in token
    assert encrypt_str("P1234567") != token  # random nonce
    assert decrypt_str(token) == "P1234567"
    tampered = token[:-2] + ("A" if token[-2] != "A" else "B") + token[-1]
    with pytest.raises(CryptoError):
        decrypt_str(tampered)
    assert mask("123456789012") == "********9012"
    assert mask("123") == "***"
    assert mask(None) == ""


def test_sa_enum_stores_values() -> None:
    col_type = sa_enum(BookingStatus)
    assert col_type.length == 40
    assert col_type.native_enum is False
    assert col_type.name == "booking_status"
    assert set(col_type.enums) == {m.value for m in BookingStatus}


def test_number_formats_and_financial_year() -> None:
    at = datetime(2026, 10, 21, 12, tzinfo=UTC)
    assert format_number("case", 123, at) == "HIG-C-2026-000123"
    assert format_number("booking", 1, at) == "HIG-B-2026-000001"
    assert format_number("order", 7, at) == "HIG-P-2026-000007"
    assert format_number("batch", 42, at) == "HIG-S-2026-000042"
    assert format_number("invoice", 1, at) == "HIG2627000001"
    assert format_number("credit_note", 1, at) == "HCN2627000001"
    assert financial_year(datetime(2027, 3, 31, 12, tzinfo=UTC)) == "2026-27"
    # 31 Mar 2027 20:00 UTC is already 1 Apr 2027 in IST -> new financial year.
    assert financial_year(datetime(2027, 3, 31, 20, tzinfo=UTC)) == "2027-28"
    with pytest.raises(ValueError):
        format_number("nope", 1, at)


# --------------------------------------------------------------------------------------------- database


async def test_create_all_built_every_table_and_ledger_triggers(db: AsyncSession) -> None:
    tables = set(
        (
            await db.execute(
                text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
            )
        ).scalars()
    )
    assert set(Base.metadata.tables) <= tables
    triggers = set((await db.execute(text("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal"))).scalars())
    assert {
        "ledger_entries_balanced",
        "ledger_entries_immutable",
        "ledger_transactions_immutable",
    } <= triggers
    indexes = set(
        (await db.execute(text("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'"))).scalars()
    )
    assert {
        "ix_hospitals_name_trgm",
        "ix_doctors_full_name_trgm",
        "ix_procedures_name_trgm",
        "uq_background_jobs_dedupe_key_active",
        "uq_bookings_case_id_active",
    } <= indexes


async def test_next_number_draws_from_sequences(db: AsyncSession) -> None:
    first = await next_number(db, "case")
    second = await next_number(db, "case")
    assert re.fullmatch(r"HIG-C-\d{4}-\d{6}", first)
    assert int(second[-6:]) == int(first[-6:]) + 1
    assert re.fullmatch(r"HIG\d{4}\d{6}", await next_number(db, "invoice"))
    assert re.fullmatch(r"HCN\d{4}\d{6}", await next_number(db, "credit_note"))
    for kind, prefix in (("booking", "HIG-B-"), ("order", "HIG-P-"), ("batch", "HIG-S-")):
        assert (await next_number(db, kind)).startswith(prefix)


async def test_factories_build_a_full_journey(db: AsyncSession) -> None:
    owner = await f.create_user(db, role="hospital")
    hospital = await f.create_hospital(db, owner=owner)
    specialty = await f.create_specialty(db)
    procedure = await f.create_procedure(db, specialty=specialty)
    doctor = await f.create_doctor(db, hospital, specialty)
    hp = await f.create_hospital_procedure(db, hospital, procedure, doctor_ids=[doctor.id])
    package = await f.create_package(db, hp, tier="all_inclusive")
    agent = await f.create_agent(db)
    patient = await f.create_patient(db, managed_by_agent_id=agent.id)
    case = await f.create_case(
        db, patient, hospital, agent_id=agent.id, doctor_id=doctor.id, procedure_id=procedure.id
    )
    quote = await f.create_quote(db, case)
    booking = await f.create_booking(db, case, quote_id=quote.id, package_id=package.id)
    order = await f.create_payment_order(db, booking)
    rates = await f.create_fx_rates(db)

    assert isinstance(owner.id, uuid.UUID) and owner.id.version == 7
    assert owner.created_at is not None and owner.updated_at is not None
    assert case.status == CaseStatus.ENQUIRY and re.fullmatch(r"HIG-C-\d{4}-\d{6}", case.case_number)
    assert booking.status == BookingStatus.PENDING_PAYMENT
    assert booking.deposit_minor == booking.total_minor // 5
    assert booking.balance_due_minor == booking.total_minor
    assert booking.meta == {}
    assert quote.total_minor == sum(li["amount_minor"] for li in quote.line_items)
    assert order.booking_id == booking.id and order.order_number.startswith("HIG-P-")
    assert {r.quote_currency for r in rates} >= {"USD", "EUR", "GBP"}
    assert agent.agent_code.startswith("AGT") and len(agent.agent_code) == 8

    member = (
        await db.execute(select(HospitalMember).where(HospitalMember.hospital_id == hospital.id))
    ).scalar_one()
    assert member.user_id == owner.id and member.member_role == "owner"

    # Relationships load explicitly (lazy="raise" elsewhere).
    loaded = (
        await db.execute(
            select(Case)
            .where(Case.id == case.id)
            .options(selectinload(Case.quotes), selectinload(Case.booking), selectinload(Case.bookings))
        )
    ).scalar_one()
    assert [q.id for q in loaded.quotes] == [quote.id]
    assert loaded.booking is not None and loaded.booking.id == booking.id
    hosp = (
        await db.execute(
            select(Hospital).where(Hospital.id == hospital.id).options(selectinload(Hospital.doctors))
        )
    ).scalar_one()
    assert [d.id for d in hosp.doctors] == [doctor.id]

    # A second active booking for the same case violates the partial unique index.
    case_id = case.id  # rollback expires ORM instances; keep plain values
    with pytest.raises(IntegrityError):
        await f.create_booking(db, case)
    await db.rollback()
    booking_count = (await db.execute(select(Booking).where(Booking.case_id == case_id))).scalars().all()
    assert len(booking_count) == 1


async def test_user_patient_profile_relationship(db: AsyncSession) -> None:
    patient = await f.create_patient(db)
    user = (
        await db.execute(
            select(User).where(User.id == patient.user_id).options(selectinload(User.patient_profile))
        )
    ).scalar_one()
    assert user.patient_profile is not None and user.patient_profile.id == patient.id


async def test_encrypted_string_roundtrip_stores_ciphertext(db: AsyncSession) -> None:
    patient = await f.create_patient(db, passport_number="Z9876543", passport_last4="6543")
    raw = (
        await db.execute(
            text("SELECT passport_number FROM patient_profiles WHERE id = :id"), {"id": patient.id}
        )
    ).scalar_one()
    assert raw.startswith("v1:") and "Z9876543" not in raw
    db.expunge_all()
    reloaded = (await db.execute(select(PatientProfile).where(PatientProfile.id == patient.id))).scalar_one()
    assert reloaded.passport_number == "Z9876543"

    acct = PayoutAccount(
        owner_type=PayeeType.HOSPITAL,
        owner_id=uuid7(),
        account_holder_name="Apex Healthcare",
        account_number="001234567890",
        account_number_last4="7890",
        ifsc="HDFC0000001",
    )
    db.add(acct)
    await db.commit()
    raw_acct = (
        await db.execute(text("SELECT account_number FROM payout_accounts WHERE id = :id"), {"id": acct.id})
    ).scalar_one()
    assert raw_acct.startswith("v1:") and "001234567890" not in raw_acct
    assert mask(acct.account_number) == "********7890"


async def _ledger_accounts(db: AsyncSession) -> tuple[LedgerAccount, LedgerAccount]:
    receivable = LedgerAccount(
        code="GATEWAY:mock:RECEIVABLE",
        name="Mock gateway receivable",
        type=LedgerAccountType.ASSET,
        owner_type=LedgerOwnerType.GATEWAY,
    )
    escrow = LedgerAccount(
        code="PLATFORM:PATIENT_ESCROW",
        name="Patient escrow",
        type=LedgerAccountType.LIABILITY,
        owner_type=LedgerOwnerType.PLATFORM,
    )
    db.add_all([receivable, escrow])
    await db.commit()
    return receivable, escrow


def _txn(key: str) -> LedgerTransaction:
    return LedgerTransaction(
        txn_type=LedgerTxnType.PAYMENT_CAPTURED,
        reference_type="payment",
        reference_id=uuid7(),
        idempotency_key=key,
        description="test",
    )


async def test_ledger_balanced_transaction_commits(db: AsyncSession) -> None:
    receivable, escrow = await _ledger_accounts(db)
    txn = _txn("cap:1")
    db.add(txn)
    db.add_all(
        [
            LedgerEntry(
                transaction_id=txn.id,
                account_id=receivable.id,
                direction=EntryDirection.DEBIT,
                amount_minor=500,
            ),
            LedgerEntry(
                transaction_id=txn.id, account_id=escrow.id, direction=EntryDirection.CREDIT, amount_minor=300
            ),
            LedgerEntry(
                transaction_id=txn.id, account_id=escrow.id, direction=EntryDirection.CREDIT, amount_minor=200
            ),
        ]
    )
    await db.commit()
    loaded = (
        await db.execute(
            select(LedgerTransaction)
            .where(LedgerTransaction.id == txn.id)
            .options(selectinload(LedgerTransaction.entries))
        )
    ).scalar_one()
    assert len(loaded.entries) == 3


async def test_ledger_rejects_unbalanced_transaction_at_commit(db: AsyncSession) -> None:
    receivable, escrow = await _ledger_accounts(db)
    txn = _txn("cap:unbalanced")
    db.add(txn)
    db.add_all(
        [
            LedgerEntry(
                transaction_id=txn.id,
                account_id=receivable.id,
                direction=EntryDirection.DEBIT,
                amount_minor=500,
            ),
            LedgerEntry(
                transaction_id=txn.id, account_id=escrow.id, direction=EntryDirection.CREDIT, amount_minor=499
            ),
        ]
    )
    await db.flush()  # deferred: the flush itself succeeds
    with pytest.raises(IntegrityError, match="unbalanced"):
        await db.commit()
    await db.rollback()
    count = (await db.execute(text("SELECT count(*) FROM ledger_transactions"))).scalar_one()
    assert count == 0


async def test_ledger_entries_and_transactions_are_immutable(db: AsyncSession) -> None:
    receivable, escrow = await _ledger_accounts(db)
    txn = _txn("cap:immutable")
    db.add(txn)
    debit = LedgerEntry(
        transaction_id=txn.id, account_id=receivable.id, direction=EntryDirection.DEBIT, amount_minor=100
    )
    credit = LedgerEntry(
        transaction_id=txn.id, account_id=escrow.id, direction=EntryDirection.CREDIT, amount_minor=100
    )
    db.add_all([debit, credit])
    await db.commit()

    txn_id, debit_id, credit_id, escrow_id = txn.id, debit.id, credit.id, escrow.id
    statements = [
        ("UPDATE ledger_entries SET amount_minor = 1 WHERE id = :id", debit_id),
        ("DELETE FROM ledger_entries WHERE id = :id", credit_id),
        ("UPDATE ledger_transactions SET description = 'x' WHERE id = :id", txn_id),
        ("DELETE FROM ledger_transactions WHERE id = :id", txn_id),
    ]
    for sql, ident in statements:
        with pytest.raises(IntegrityError, match="immutable"):
            await db.execute(text(sql), {"id": ident})
        await db.rollback()

    with pytest.raises(IntegrityError):
        db.add(
            LedgerEntry(
                transaction_id=txn_id, account_id=escrow_id, direction=EntryDirection.CREDIT, amount_minor=0
            )
        )
        await db.flush()
    await db.rollback()


async def test_background_job_dedupe_partial_unique_index(db: AsyncSession) -> None:
    db.add(BackgroundJob(task_name="t.one", payload={}, dedupe_key="k1"))
    await db.commit()

    with pytest.raises(IntegrityError):
        db.add(BackgroundJob(task_name="t.one", payload={}, dedupe_key="k1"))
        await db.commit()
    await db.rollback()

    # Jobs without a key never collide.
    db.add_all([BackgroundJob(task_name="t.two", payload={}), BackgroundJob(task_name="t.two", payload={})])
    await db.commit()

    # Once the live job finished, the key can be reused.
    await db.execute(
        text("UPDATE background_jobs SET status = :s WHERE dedupe_key = 'k1'"),
        {"s": JobStatus.SUCCEEDED.value},
    )
    await db.commit()
    db.add(BackgroundJob(task_name="t.one", payload={"again": True}, dedupe_key="k1"))
    await db.commit()
    total = (
        await db.execute(text("SELECT count(*) FROM background_jobs WHERE dedupe_key = 'k1'"))
    ).scalar_one()
    assert total == 2
