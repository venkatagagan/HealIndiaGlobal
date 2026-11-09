"""Demo-only: complete a document analysis that failed because AI is not configured in this local stack.

The real pipeline (service.process_analysis) is run with the AI call replaced by a fixed reading of the demo
echocardiography report, so the analysis lands in `completed / pending_review` exactly as a real AI run would.
The patient then confirms it through the normal API (see setup-hospital-data.mjs).

Usage (from backend/):  .venv/Scripts/python ../docs/demo/scripts/fill-demo-analysis.py <analysis_id>
"""

from __future__ import annotations

import asyncio
import sys
import uuid

from sqlalchemy import update

from app.core import config
from app.core.db import SessionLocal
from app.core.enums import AIRequestStatus
from app.models.docai import DocumentAnalysis, DocumentAnalysisStatus
from app.modules.docai import ai, service

RESULT = ai.DocAIResult(
    doc_type="imaging_report",
    language="en",
    report_date="2026-10-02",
    facility_name="Royal Muscat Cardiac Centre",
    summary_patient=(
        "Your heart scan shows that the aortic valve is severely narrowed and stiff, so the heart has to work "
        "harder. The heart muscle is slightly thickened and pumping a little below normal. Your doctors suggest "
        "assessing you for a valve replacement."
    ),
    summary_clinical=(
        "TTE 02-Oct-2026: severe calcific AS (Vmax 4.6 m/s, MG 48 mmHg, AVA 0.8 cm2), concentric LVH, LVEF 50%, "
        "mild MR, PASP 38 mmHg. NT-proBNP 1240 pg/mL. T2DM (HbA1c 7.2%). Recommend SAVR vs TAVI evaluation."
    ),
    key_findings=[
        {"finding": "Severe calcific aortic stenosis (AVA 0.8 cm2, mean gradient 48 mmHg, Vmax 4.6 m/s)", "significance": "urgent"},
        {"finding": "Concentric LV hypertrophy, LVEF 50% (mildly reduced)", "significance": "attention"},
        {"finding": "Mild mitral regurgitation; no pericardial effusion", "significance": "normal"},
        {"finding": "Estimated PA systolic pressure 38 mmHg", "significance": "attention"},
    ],
    lab_values=[
        {"test": "NT-proBNP", "value": "1240", "unit": "pg/mL", "reference_range": "< 125", "flag": "high"},
        {"test": "HbA1c", "value": "7.2", "unit": "%", "reference_range": "< 5.7", "flag": "high"},
        {"test": "Haemoglobin", "value": "13.4", "unit": "g/dL", "reference_range": "13.0-17.0", "flag": "normal"},
        {"test": "Serum creatinine", "value": "1.1", "unit": "mg/dL", "reference_range": "0.7-1.3", "flag": "normal"},
    ],
    diagnoses_mentioned=["Severe aortic stenosis", "Left ventricular hypertrophy", "Type 2 diabetes mellitus"],
    medications=[
        {"name": "Metformin", "dose": "500 mg", "frequency": "Twice daily"},
        {"name": "Atorvastatin", "dose": "20 mg", "frequency": "At night"},
        {"name": "Aspirin", "dose": "75 mg", "frequency": "Once daily"},
    ],
    procedures_mentioned=["Transthoracic echocardiogram"],
    recommendations=["Evaluation for aortic valve replacement (surgical AVR or TAVI)"],
    red_flags=["Severe symptomatic aortic stenosis"],
    suggested_specialties=["cardiology", "cardiac-surgery"],
    legible=True,
    confidence=0.92,
)


async def main(analysis_id: uuid.UUID) -> None:
    type(config.settings).ai_available = property(lambda self: True)  # type: ignore[method-assign]

    async def fake_analyze(pages, slugs):  # noqa: ANN001
        return ai.AIOutcome(True, AIRequestStatus.OK, config.settings.AI_MODEL, result=RESULT, latency_ms=4200)

    service.ai.analyze_pages = fake_analyze  # type: ignore[assignment]
    async with SessionLocal() as db:
        await db.execute(
            update(DocumentAnalysis)
            .where(DocumentAnalysis.id == analysis_id, DocumentAnalysis.status == DocumentAnalysisStatus.FAILED)
            .values(status=DocumentAnalysisStatus.QUEUED, error=None)
        )
        await db.commit()
        ok = await service.process_analysis(db, analysis_id)
    print("processed" if ok else "nothing to do")


if __name__ == "__main__":
    asyncio.run(main(uuid.UUID(sys.argv[1])))
