"""Emergency red-flag coverage of the rules triage engine in Arabic, French, Bengali and Russian.

Lay, colloquial phrasings of the core emergencies (heart attack, can't breathe, unconscious, severe bleeding /
vomiting blood, stroke signs, suicidal thoughts / self-harm, throat swelling / anaphylaxis, ongoing seizure)
must be flagged; negated and benign statements in the same languages must not raise a false alarm. The
voice-intake fallback (``rules_suggestion``) uses the same engine, so a few phrases are also checked there.
Pure Python: nothing here touches the database (the autouse ``engine`` fixture still runs).
"""

from __future__ import annotations

from typing import Any

import pytest

from app.core.enums import Urgency
from app.modules.screening.ai.rules import rules_triage
from app.modules.screening.ai.schema import CatalogProcedure, CatalogSnapshot, CatalogSpecialty
from app.modules.voice.ai import rules_suggestion
from scripts.seed_data import catalog as seed

# Expected red-flag wording per emergency kind (case-insensitive substring of one of ``result.red_flags``).
FLAG = {
    "cardiac": "heart attack",
    "breathing": "breathing difficulty",
    "blue": "blue or grey lips",
    "unconscious": "unconscious",
    "haematemesis": "vomiting blood",
    "haemoptysis": "coughing up blood",
    "bleeding": "severe bleeding",
    "stroke": "stroke",
    "suicidal": "suicidal thoughts",
    "self_harm": "self-harm",
    "airway": "swelling of the lips, tongue or throat",
    "allergy": "severe allergic reaction",
    "seizure": "seizure",
}


@pytest.fixture(scope="module")
def catalog() -> CatalogSnapshot:
    return CatalogSnapshot(
        specialties=tuple(
            CatalogSpecialty(id=f"seed:{s['slug']}", slug=s["slug"], name=s["name"]) for s in seed.SPECIALTIES
        ),
        procedures=tuple(
            CatalogProcedure(
                id=f"seed:{p['slug']}",
                slug=p["slug"],
                name=p["name"],
                specialty_slug=p.get("specialty_slug") or p.get("specialty") or "",
                keywords=tuple(p.get("keywords") or ()),
                body_areas=tuple(p.get("body_areas") or ()),
            )
            for p in seed.PROCEDURES
        ),
    )


def intake(notes: str) -> dict[str, Any]:
    return {
        "specialty_slug": None,
        "body_areas": [],
        "pain_intensity": None,
        "symptoms": [],
        "duration": {"value": 1, "unit": "days"},
        "severity": {},
        "previous_treatments": [],
        "notes": notes,
        "home_country": None,
        "preferences": {"languages": [], "doctor_gender": None},
        "patient": {"age": 45, "gender": None, "medical_history": None, "allergies": None},
    }


# ------------------------------------------------------------------------------------------- must flag
EMERGENCIES: list[tuple[str, str, str]] = [
    # French
    ("fr", "cardiac", "J'ai mal à la poitrine et je transpire beaucoup."),
    ("fr", "cardiac", "Je pense que c'est une attaque cardiaque."),
    ("fr", "cardiac", "J'ai une douleur thoracique au repos."),
    ("fr", "cardiac", "J'ai la poitrine serrée et des sueurs froides."),
    ("fr", "cardiac", "Douleur dans la poitrine qui irradie dans le bras gauche."),
    ("fr", "breathing", "Je n'arrive pas à respirer."),
    ("fr", "breathing", "J'étouffe."),
    ("fr", "breathing", "Mon fils ne respire plus."),
    ("fr", "breathing", "Il est en détresse respiratoire."),
    ("fr", "breathing", "J'ai du mal à respirer, je suffoque."),
    ("fr", "blue", "Il a les lèvres bleues."),
    ("fr", "unconscious", "Il est inconscient."),
    ("fr", "unconscious", "Mon mari ne répond plus et ne se réveille pas."),
    ("fr", "unconscious", "Elle est sans connaissance."),
    ("fr", "unconscious", "Il est tombé dans les pommes et ne se réveille pas."),
    ("fr", "haematemesis", "Je vomis du sang."),
    ("fr", "haemoptysis", "Il crache du sang et il est essoufflé."),
    ("fr", "bleeding", "Le saignement ne s'arrête pas."),
    ("fr", "bleeding", "Il perd beaucoup de sang."),
    ("fr", "stroke", "Je pense que c'est un AVC."),
    ("fr", "stroke", "Mon père a la bouche de travers."),
    ("fr", "stroke", "Il a du mal à parler depuis ce matin."),
    ("fr", "stroke", "Faiblesse soudaine d'un côté du corps."),
    ("fr", "stroke", "Mon bras droit est paralysé depuis une heure."),
    ("fr", "suicidal", "Je veux mourir."),
    ("fr", "suicidal", "Je vais me tuer."),
    ("fr", "suicidal", "Je veux mettre fin à mes jours."),
    ("fr", "suicidal", "Je n'ai plus envie de vivre."),
    ("fr", "self_harm", "Je me fais du mal, je me scarifie."),
    ("fr", "airway", "Ma gorge se ferme."),
    ("fr", "airway", "Ma gorge gonfle après avoir mangé des cacahuètes."),
    ("fr", "allergy", "Il fait un œdème de Quincke."),
    ("fr", "allergy", "Grave réaction allergique après une piqûre de guêpe."),
    ("fr", "seizure", "Il fait une crise d'épilepsie en ce moment."),
    ("fr", "seizure", "Mon enfant convulse."),
    ("fr", "seizure", "C'est sa première crise convulsive."),
    # Russian
    ("ru", "cardiac", "Болит в груди и холодный пот."),
    ("ru", "cardiac", "У меня сердечный приступ."),
    ("ru", "cardiac", "Боль за грудиной отдает в левую руку."),
    ("ru", "cardiac", "Давит в груди в покое."),
    ("ru", "cardiac", "Сердце сжимает и холодный пот."),
    ("ru", "breathing", "Не могу дышать."),
    ("ru", "breathing", "Задыхаюсь."),
    ("ru", "breathing", "Мне очень трудно дышать."),
    ("ru", "breathing", "Ребенок не дышит."),
    ("ru", "blue", "Губы посинели."),
    ("ru", "unconscious", "Он без сознания."),
    ("ru", "unconscious", "Мой муж потерял сознание и не приходит в себя."),
    ("ru", "unconscious", "Она не реагирует."),
    ("ru", "haematemesis", "Меня рвёт кровью."),
    ("ru", "bleeding", "Кровь не останавливается."),
    ("ru", "bleeding", "Сильное кровотечение."),
    ("ru", "stroke", "У папы инсульт."),
    ("ru", "stroke", "Перекосило лицо."),
    ("ru", "stroke", "Заплетается язык."),
    ("ru", "stroke", "Онемела рука и нога с одной стороны."),
    ("ru", "suicidal", "Не хочу жить."),
    ("ru", "suicidal", "Думаю о самоубийстве."),
    ("ru", "suicidal", "Я думаю покончить с собой."),
    ("ru", "self_harm", "Я режу себя."),
    ("ru", "airway", "Отек горла."),
    ("ru", "airway", "Горло сжимается после укуса пчелы."),
    ("ru", "allergy", "Отек Квинке."),
    ("ru", "seizure", "У ребенка судороги, не прекращаются."),
    ("ru", "seizure", "Сейчас у него припадок."),
    ("ru", "seizure", "Бьется в судорогах."),
    # Arabic (Modern Standard and colloquial)
    ("ar", "cardiac", "عندي ألم في صدري وتعرق بارد"),
    ("ar", "cardiac", "صدري يوجعني والألم ينتشر إلى ذراعي اليسرى"),
    ("ar", "cardiac", "أعتقد أنها أزمة قلبية"),
    ("ar", "breathing", "مش قادر أتنفس"),
    ("ar", "breathing", "ما أقدر أتنفس"),
    ("ar", "breathing", "ابني لا يتنفس"),
    ("ar", "breathing", "ضيق شديد في التنفس"),
    ("ar", "blue", "شفايفه زرقاء"),
    ("ar", "unconscious", "أمي فاقدة الوعي ولا تستجيب"),
    ("ar", "unconscious", "أبي في غيبوبة"),
    ("ar", "unconscious", "سقط أبي مغمى عليه ولا يستجيب"),
    ("ar", "haematemesis", "يستفرغ دم"),
    ("ar", "haematemesis", "بيرجع دم"),
    ("ar", "bleeding", "الدم لا يتوقف"),
    ("ar", "bleeding", "ينزف بغزارة"),
    ("ar", "stroke", "وجهه مائل وكلامه غير مفهوم"),
    ("ar", "stroke", "فمها معوج فجأة"),
    ("ar", "stroke", "لسانه ثقيل فجأة"),
    ("ar", "stroke", "مش قادر يتكلم"),
    ("ar", "stroke", "لا يستطيع تحريك يده اليمنى فجأة"),
    ("ar", "suicidal", "أريد أن أموت"),
    ("ar", "suicidal", "عايز أموت"),
    ("ar", "suicidal", "بدي موت"),
    ("ar", "self_harm", "أريد أن أؤذي نفسي"),
    ("ar", "airway", "لساني متورم"),
    ("ar", "airway", "حلقي يقفل"),
    ("ar", "allergy", "حساسية شديدة بعد الأكل"),
    ("ar", "seizure", "ابني يتشنج الآن"),
    ("ar", "seizure", "تشنجات لا تتوقف"),
    ("ar", "seizure", "أول نوبة صرع"),
    # Bengali
    ("bn", "cardiac", "বুকে ব্যাথা আর ঘাম হচ্ছে"),
    ("bn", "cardiac", "বুকে চাপ লাগছে, বাঁ হাতে ব্যথা ছড়াচ্ছে"),
    ("bn", "cardiac", "হার্ট এটাক হয়েছে"),
    ("bn", "breathing", "শ্বাস নিতে খুব কষ্ট হচ্ছে"),
    ("bn", "breathing", "দম বন্ধ হয়ে আসছে"),
    ("bn", "breathing", "তীব্র শ্বাসকষ্ট হচ্ছে"),
    ("bn", "unconscious", "বাবা অজ্ঞান হয়ে পড়ে আছেন, সাড়া দিচ্ছেন না"),
    ("bn", "unconscious", "জ্ঞান ফিরছে না"),
    ("bn", "unconscious", "উনি অচেতন"),
    ("bn", "haematemesis", "বমিতে রক্ত"),
    ("bn", "bleeding", "রক্ত বন্ধ হচ্ছে না"),
    ("bn", "stroke", "কথা বলতে পারছে না"),
    ("bn", "stroke", "হঠাৎ শরীরের এক পাশ অবশ হয়ে গেছে"),
    ("bn", "stroke", "ডান হাত পা অবশ"),
    ("bn", "suicidal", "আমি মরতে চাই"),
    ("bn", "suicidal", "নিজেকে শেষ করে দিতে চাই"),
    ("bn", "self_harm", "নিজের ক্ষতি করতে ইচ্ছে করছে"),
    ("bn", "airway", "গলা বন্ধ হয়ে আসছে"),
    ("bn", "allergy", "তীব্র অ্যালার্জি হয়েছে"),
    ("bn", "seizure", "খিঁচুনি হচ্ছে"),
    ("bn", "seizure", "খিঁচুনি থামছে না"),
    ("bn", "seizure", "প্রথমবার খিঁচুনি হয়েছে"),
]


@pytest.mark.parametrize(
    ("lang", "kind", "text"),
    EMERGENCIES,
    ids=[f"{lang}-{kind}-{i}" for i, (lang, kind, _) in enumerate(EMERGENCIES)],
)
def test_multilingual_emergency_is_flagged(lang: str, kind: str, text: str, catalog: CatalogSnapshot) -> None:
    result = rules_triage(intake(text), catalog)
    assert result.urgency == Urgency.EMERGENCY, f"{lang}: {text!r} -> {result.urgency}"
    flags = " | ".join(result.red_flags).lower()
    assert FLAG[kind] in flags, f"{lang}: {text!r} -> {result.red_flags}"


# --------------------------------------------------------------------------------------- must NOT flag
NOT_EMERGENCIES: list[tuple[str, str]] = [
    # French: negation ("pas", "jamais", "aucune", "n'ai" …) and benign look-alikes
    ("fr", "Je n'ai pas de douleur thoracique."),
    ("fr", "Pas de douleur dans la poitrine, juste mal au genou."),
    ("fr", "Je n'ai jamais fait d'AVC."),
    ("fr", "Il n'est pas inconscient."),
    ("fr", "Je n'ai pas d'idées suicidaires."),
    ("fr", "Pas de sang dans les vomissements."),
    ("fr", "Il n'a pas de difficultés respiratoires."),
    ("fr", "Je n'ai pas envie de mourir."),
    ("fr", "Il ne fait pas de crise d'épilepsie."),
    ("fr", "Il fait étouffant aujourd'hui, j'ai mal au genou."),
    ("fr", "J'ai du mal à respirer en montant les escaliers."),
    ("fr", "Il ne répond pas au traitement de l'arthrose."),
    ("fr", "J'ai une allergie grave aux arachides, je voudrais un bilan."),
    ("fr", "Je saigne beaucoup pendant les règles."),
    ("fr", "J'ai du mal à parler anglais."),
    # Russian: "нет", "не", "без", and postposed "… не было" for heart attack / stroke
    ("ru", "Нет боли в груди."),
    ("ru", "Не теряла сознание, просто устала."),
    ("ru", "Нет мыслей о самоубийстве."),
    ("ru", "Суицидальных мыслей нет."),
    ("ru", "Инсульта никогда не было."),
    ("ru", "Инфаркта не было."),
    ("ru", "Мне не трудно дышать."),
    ("ru", "Я не задыхаюсь."),
    ("ru", "Нет судорог."),
    ("ru", "Не реагирует на лечение, хочу операцию на колене."),
    ("ru", "Сильная аллергия на кошек."),
    ("ru", "Много крови при месячных."),
    # Arabic: "لا", "ليس", "لم", "بدون" (and "ما"/"مش" only inside the colloquial phrases themselves)
    ("ar", "لا يوجد ألم في الصدر"),
    ("ar", "ليس لدي ألم في الصدر"),
    ("ar", "لا أفكر في الانتحار"),
    ("ar", "ليس لدي أفكار انتحارية"),
    ("ar", "لم يفقد الوعي"),
    ("ar", "ليس عندي ضيق في التنفس"),
    ("ar", "بدون نزيف"),
    ("ar", "لا أريد أن أموت"),
    ("ar", "ما بدي موت، بدي علاج للركبة"),
    ("ar", "ابني لا يتشنج"),
    ("ar", "لم يتقيأ دما"),
    ("ar", "عندما يتنفس يشعر بألم في الركبة"),
    ("ar", "عندي حساسية شديدة من القطط"),
    ("ar", "لا يستجيب للعلاج الطبيعي في الركبة"),
    # Bengali: postposed "না" / "নেই"
    ("bn", "বুকে ব্যথা নেই, শুধু হাঁটুতে ব্যথা।"),
    ("bn", "বুকে কোনো ব্যথা নেই"),
    ("bn", "আমার বুকে ব্যথা হয় না"),
    ("bn", "শ্বাসকষ্ট নেই"),
    ("bn", "শ্বাস নিতে কষ্ট হচ্ছে না"),
    ("bn", "আত্মহত্যার চিন্তা নেই"),
    ("bn", "আমি মরতে চাই না"),
    ("bn", "খিঁচুনি হচ্ছে না"),
    ("bn", "রক্তবমি হয়নি"),
    ("bn", "কথা বলতে পারছে"),
    ("bn", "সিঁড়ি দিয়ে উঠলে শ্বাস নিতে কষ্ট হয়"),
    ("bn", "বছর ধরে খিঁচুনি হচ্ছে, ওষুধ খাই"),
]


@pytest.mark.parametrize(
    ("lang", "text"), NOT_EMERGENCIES, ids=[f"{lang}-{i}" for i, (lang, _) in enumerate(NOT_EMERGENCIES)]
)
def test_multilingual_negated_or_benign_is_not_flagged(
    lang: str, text: str, catalog: CatalogSnapshot
) -> None:
    result = rules_triage(intake(text), catalog)
    assert result.urgency != Urgency.EMERGENCY, f"{lang}: {text!r} false alarm {result.red_flags}"
    assert result.red_flags == []


# ---------------------------------------------------------------------------------- voice intake fallback
VOICE: list[tuple[str, str]] = [
    ("fr", "Mon mari ne répond plus et ne se réveille pas."),
    ("ru", "Не могу дышать, губы посинели."),
    ("ar", "مش قادر أتنفس"),
    ("bn", "খিঁচুনি থামছে না"),
]


@pytest.mark.parametrize(("lang", "text"), VOICE, ids=[lang for lang, _ in VOICE])
def test_voice_rules_suggestion_flags_emergency(lang: str, text: str, catalog: CatalogSnapshot) -> None:
    suggestion = rules_suggestion(text, catalog)
    assert suggestion.urgency_hint == Urgency.EMERGENCY, f"{lang}: {text!r}"
    assert suggestion.red_flags
