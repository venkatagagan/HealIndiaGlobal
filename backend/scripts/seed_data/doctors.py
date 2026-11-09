"""77 fictional doctors (39 female / 38 male) attached to the demo hospitals.

Names are common Indian names chosen for regional plausibility; any resemblance to real practitioners is
unintended. Biographies, statistics and fees are invented demo data. ``photo_url`` is always ``None``.
Medical registration numbers are fictional and deterministic (derived from the slug); the council follows the
hospital's state (Chandigarh doctors use the NMC's Indian Medical Register). Demo doctors are marked
registration-verified (``registration_verified_at``; no verifying user) so the public "verified" badge shows.
Fees are INR minor units (paise). For fertility doctors ``success_rate_pct`` is a clinical pregnancy rate per
transfer, so it is deliberately lower than surgical success rates.
"""

from __future__ import annotations

import re
import zlib
from datetime import UTC, datetime
from typing import Any

from scripts.seed_data.catalog import inr

__all__ = ["DOCTORS", "doctor_slug"]


def doctor_slug(full_name: str) -> str:
    plain = full_name.removeprefix("Dr. ").lower()
    return re.sub(r"[^a-z0-9]+", "-", plain).strip("-")


# hospital slug -> (council code from app.modules.catalog.councils, number prefix)
_HOSPITAL_COUNCIL: dict[str, tuple[str, str]] = {
    "sanjeevani-gurugram": ("haryana", "HMC"),
    "yamuna-valley-noida": ("uttar_pradesh", "UPMC"),
    "lotus-crest-new-delhi": ("delhi", "DMC/R"),
    "ratnakar-bay-mumbai": ("maharashtra", "MMC"),
    "coromandel-chennai": ("tamil_nadu", "TNMC"),
    "pournami-chennai": ("tamil_nadu", "TNMC"),
    "nandi-valley-bengaluru": ("karnataka", "KMC"),
    "vasundhara-hyderabad": ("telangana", "TSMC"),
    "hooghly-valley-kolkata": ("west_bengal", "WBMC"),
    "vembanad-kochi": ("kerala", "TCMC"),
    "shubh-arogya-ahmedabad": ("gujarat", "GMC"),
    "deccan-crest-pune": ("maharashtra", "MMC"),
    "aravali-heights-jaipur": ("rajasthan", "RMC"),
    "shivalik-chandigarh": ("nmc", "IMR"),
}


# Demo only: real doctors are verified by an admin via POST /admin/doctors/{id}/verify-registration.
SEED_REGISTRATION_VERIFIED_AT = datetime(2026, 1, 15, 10, 0, tzinfo=UTC)


def _registration(hospital: str, slug: str, experience_years: int) -> tuple[str, str]:
    """Fictional but plausibly shaped registration number + council code for a seeded doctor."""
    council, prefix = _HOSPITAL_COUNCIL.get(hospital, ("nmc", "IMR"))
    year = 2025 - experience_years
    serial = zlib.crc32(slug.encode()) % 90_000 + 10_000
    return f"{prefix}/{year}/{serial}", council


def _doc(
    hospital: str,
    full_name: str,
    gender: str,
    specialty: str,
    qualifications: list[str],
    experience_years: int,
    languages: list[str],
    success_rate_pct: str,
    rating: tuple[str, int],
    fee_rupees: int,
    sub_specialties: list[str],
    bio: str,
    *,
    teleconsult: bool = True,
) -> dict[str, Any]:
    slug = doctor_slug(full_name)
    registration_number, registration_council = _registration(hospital, slug, experience_years)
    return {
        "hospital": hospital,
        "full_name": full_name,
        "slug": slug,
        "gender": gender,
        "photo_url": None,
        "specialty": specialty,
        "sub_specialties": sub_specialties,
        "qualifications": qualifications,
        "experience_years": experience_years,
        "languages": languages,
        "bio": bio,
        "success_rate_pct": success_rate_pct,
        "rating_avg": rating[0],
        "rating_count": rating[1],
        "consultation_fee_minor": inr(fee_rupees),
        "currency": "INR",
        "teleconsult_available": teleconsult,
        "registration_number": registration_number,
        "registration_council": registration_council,
        "registration_verified_at": SEED_REGISTRATION_VERIFIED_AT,
    }


_M, _F = "male", "female"
_EN_HI = ["English", "Hindi"]

# fmt: off
DOCTORS: list[dict[str, Any]] = [
    # ---------------------------------------------------------------- Sanjeevani, Gurugram (7)
    _doc(
        "sanjeevani-gurugram", "Dr. Arvind Khanna", _M, "cardiology",
        ["MBBS", "MS (General Surgery)", "MCh (Cardiothoracic & Vascular Surgery)", "FRCS (Edinburgh)"],
        26, [*_EN_HI, "Arabic"], "98.60", ("4.9", 412), 2000,
        ["Off-pump CABG", "Minimally invasive valve surgery", "Aortic surgery"],
        "Senior cardiothoracic surgeon who has performed more than 8,000 heart operations and leads the "
        "institute's minimally invasive valve programme.",
    ),
    _doc(
        "sanjeevani-gurugram", "Dr. Neha Bansal", _F, "cardiology",
        ["MBBS", "MD (Medicine)", "DM (Cardiology)", "FACC"],
        15, [*_EN_HI, "Russian"], "98.90", ("4.8", 356), 1800,
        ["Complex coronary angioplasty", "TAVI", "Structural heart interventions"],
        "Interventional cardiologist focused on complex angioplasty and TAVI for older patients; runs a "
        "weekly video clinic for overseas referrals.",
    ),
    _doc(
        "sanjeevani-gurugram", "Dr. Rajiv Sehgal", _M, "orthopedics",
        ["MBBS", "MS (Orthopaedics)", "DNB (Orthopaedics)", "Fellowship in Joint Replacement (Germany)"],
        22, [*_EN_HI, "Punjabi"], "98.20", ("4.8", 520), 1600,
        ["Robotic knee replacement", "Revision hip & knee surgery", "Bilateral knee replacement"],
        "Joint-replacement surgeon with over 6,000 knee and hip replacements, known for same-day "
        "mobilisation protocols.",
    ),
    _doc(
        "sanjeevani-gurugram", "Dr. Shalini Ahuja", _F, "spine",
        ["MBBS", "MS (Orthopaedics)", "Fellowship in Spine Surgery (Switzerland)"],
        16, [*_EN_HI, "French"], "97.40", ("4.7", 210), 1800,
        ["Minimally invasive spine surgery", "Cervical & lumbar disc replacement", "Spinal fusion"],
        "Spine surgeon specialising in keyhole fusion and motion-preserving disc replacement.",
    ),
    _doc(
        "sanjeevani-gurugram", "Dr. Manish Tyagi", _M, "neurology",
        ["MBBS", "MS (General Surgery)", "MCh (Neurosurgery)"],
        19, [*_EN_HI, "Arabic"], "96.80", ("4.7", 198), 2000,
        ["Brain tumour surgery", "Awake craniotomy", "Skull-base surgery"],
        "Neurosurgeon performing awake and image-guided brain tumour surgery with intra-operative "
        "neuro-monitoring.",
    ),
    _doc(
        "sanjeevani-gurugram", "Dr. Kavya Nair", _F, "transplant",
        ["MBBS", "MS (General Surgery)", "MCh (Surgical Gastroenterology)",
         "Fellowship in Liver Transplantation (UK)"],
        17, [*_EN_HI, "Malayalam", "Arabic"], "95.50", ("4.8", 164), 2500,
        ["Living donor liver transplant", "Kidney transplant", "Hepato-biliary surgery"],
        "Transplant surgeon leading the living-donor liver programme, including donor safety and "
        "authorisation-committee preparation for international families.",
    ),
    _doc(
        "sanjeevani-gurugram", "Dr. Pooja Malhotra", _F, "bariatric",
        ["MBBS", "MS (General Surgery)", "FMAS", "Fellowship in Bariatric & Metabolic Surgery"],
        13, [*_EN_HI, "Russian"], "99.10", ("4.8", 276), 1500,
        ["Laparoscopic sleeve gastrectomy", "Roux-en-Y gastric bypass", "Metabolic surgery for diabetes"],
        "Bariatric surgeon who pairs surgery with a 12-month remote nutrition follow-up programme.",
    ),
    # ---------------------------------------------------------------- Yamuna Valley, Noida (6)
    _doc(
        "yamuna-valley-noida", "Dr. Sameer Chaudhary", _M, "orthopedics",
        ["MBBS", "MS (Orthopaedics)", "FRCS (Trauma & Orthopaedics)"],
        20, [*_EN_HI, "Russian"], "98.00", ("4.7", 402), 1500,
        ["Hip & knee arthroplasty", "Sports injuries", "ACL reconstruction"],
        "Orthopaedic surgeon with UK training in hip and knee replacement and arthroscopic sports surgery.",
    ),
    _doc(
        "yamuna-valley-noida", "Dr. Ritu Saxena", _F, "spine",
        ["MBBS", "MS (Orthopaedics)", "DNB (Orthopaedics)", "Fellowship in Spine Surgery (USA)"],
        14, _EN_HI, "97.10", ("4.6", 151), 1600,
        ["Endoscopic spine surgery", "Spinal fusion", "Disc replacement"],
        "Spine surgeon focused on endoscopic and minimally invasive fusion with early discharge.",
    ),
    _doc(
        "yamuna-valley-noida", "Dr. Anil Rastogi", _M, "neurology",
        ["MBBS", "MD (Medicine)", "DM (Neurology)"],
        24, [*_EN_HI, "Urdu"], "96.50", ("4.7", 233), 1800,
        ["Movement disorders", "Deep brain stimulation programming", "Epilepsy"],
        "Neurologist leading the movement-disorder clinic and DBS programming for Parkinson's disease.",
    ),
    _doc(
        "yamuna-valley-noida", "Dr. Swati Agarwal", _F, "cardiology",
        ["MBBS", "MD (Medicine)", "DM (Cardiology)"],
        12, [*_EN_HI, "Bengali"], "98.40", ("4.6", 188), 1400,
        ["Coronary angioplasty", "Women's heart health", "Echocardiography"],
        "Interventional cardiologist with a special interest in heart disease in women.",
    ),
    _doc(
        "yamuna-valley-noida", "Dr. Megha Srivastava", _F, "fertility",
        ["MBBS", "MS (Obstetrics & Gynaecology)", "Fellowship in Reproductive Medicine"],
        15, [*_EN_HI, "Arabic"], "64.00", ("4.8", 305), 1200,
        ["IVF & ICSI", "Recurrent implantation failure", "Fertility preservation"],
        "Fertility specialist who has guided more than 3,000 IVF cycles, with remote monitoring for the "
        "early weeks of stimulation.",
    ),
    _doc(
        "yamuna-valley-noida", "Dr. Vivek Arora", _M, "ophthalmology",
        ["MBBS", "MS (Ophthalmology)", "FICO"],
        18, [*_EN_HI, "Punjabi"], "99.20", ("4.7", 290), 1000,
        ["Bladeless LASIK", "Premium cataract surgery", "Keratoconus"],
        "Cataract and refractive surgeon offering multifocal and toric lens implants.",
    ),
    # ---------------------------------------------------------------- Lotus Crest, New Delhi (8)
    _doc(
        "lotus-crest-new-delhi", "Dr. Sunita Bhardwaj", _F, "oncology",
        ["MBBS", "MD (Internal Medicine)", "DM (Medical Oncology)"],
        21, [*_EN_HI, "Bengali"], "92.50", ("4.8", 340), 2000,
        ["Breast cancer", "Immunotherapy", "Targeted therapy"],
        "Medical oncologist chairing the weekly tumour board; offers pre-travel second opinions on reports.",
    ),
    _doc(
        "lotus-crest-new-delhi", "Dr. Harish Venkataraman", _M, "oncology",
        ["MBBS", "MD (Radiation Oncology)", "Fellowship in Stereotactic Radiosurgery (Canada)"],
        23, [*_EN_HI, "Tamil", "French"], "94.80", ("4.7", 215), 1800,
        ["IMRT/IGRT", "Stereotactic radiosurgery", "Head & neck cancers"],
        "Radiation oncologist heading the radiosurgery service for brain and body tumours.",
    ),
    _doc(
        "lotus-crest-new-delhi", "Dr. Nikhil Bose", _M, "oncology",
        ["MBBS", "MS (General Surgery)", "MCh (Surgical Oncology)"],
        17, [*_EN_HI, "Bengali", "Arabic"], "95.60", ("4.7", 178), 1800,
        ["Breast oncosurgery", "Pancreatic cancer surgery (Whipple)", "Robotic cancer surgery"],
        "Surgical oncologist performing breast, pancreatic and gastrointestinal cancer surgery.",
    ),
    _doc(
        "lotus-crest-new-delhi", "Dr. Farah Siddiqui", _F, "transplant",
        ["MBBS", "MS (General Surgery)", "MCh (GI Surgery)",
         "Fellowship in Multi-organ Transplantation (UK)"],
        19, [*_EN_HI, "Urdu", "Arabic", "Dari"], "96.20", ("4.9", 201), 2500,
        ["Living donor kidney transplant", "Living donor liver transplant", "ABO-incompatible transplants"],
        "Transplant surgeon with more than 1,500 kidney and liver transplants, including ABO-incompatible "
        "pairs.",
    ),
    _doc(
        "lotus-crest-new-delhi", "Dr. Rohit Mathur", _M, "transplant",
        ["MBBS", "MD (Medicine)", "DM (Clinical Haematology)"],
        16, [*_EN_HI, "French"], "89.50", ("4.7", 126), 2200,
        ["Allogeneic & haplo-identical BMT", "Leukaemia & lymphoma", "Thalassaemia BMT"],
        "Haematologist leading the bone marrow transplant unit, including haplo-identical transplants for "
        "children with thalassaemia.",
    ),
    _doc(
        "lotus-crest-new-delhi", "Dr. Deepa Krishnan", _F, "cardiology",
        ["MBBS", "MD (Medicine)", "DM (Cardiology)", "FACC", "FSCAI"],
        20, [*_EN_HI, "Tamil", "Arabic"], "98.70", ("4.8", 265), 1800,
        ["Complex angioplasty", "Pacemakers & ICDs", "Heart failure"],
        "Interventional cardiologist and device specialist for pacemakers and defibrillators.",
    ),
    _doc(
        "lotus-crest-new-delhi", "Dr. Ashok Pandey", _M, "nephrology",
        ["MBBS", "MD (Medicine)", "DM (Nephrology)"],
        25, [*_EN_HI, "Dari", "Pashto"], "97.00", ("4.6", 189), 1500,
        ["Dialysis", "Transplant nephrology", "Glomerular diseases"],
        "Nephrologist who prepares international patients for transplant and manages dialysis during their "
        "stay.",
    ),
    _doc(
        "lotus-crest-new-delhi", "Dr. Kunal Dutta", _M, "gastroenterology",
        ["MBBS", "MS (General Surgery)", "MCh (Surgical Gastroenterology)", "FALS"],
        18, [*_EN_HI, "Bengali", "Dari"], "97.40", ("4.7", 166), 1600,
        ["Laparoscopic gallbladder & hernia surgery", "Colorectal cancer surgery", "Advanced laparoscopy"],
        "GI and laparoscopic surgeon using enhanced-recovery protocols for colorectal and gallbladder "
        "surgery.",
    ),
    # ---------------------------------------------------------------- Ratnakar Bay, Mumbai (6)
    _doc(
        "ratnakar-bay-mumbai", "Dr. Aditya Deshpande", _M, "cardiology",
        ["MBBS", "MD (Medicine)", "DM (Cardiology)", "FESC"],
        18, [*_EN_HI, "Marathi", "Arabic"], "98.50", ("4.8", 301), 2000,
        ["Angioplasty", "Valve interventions", "Preventive cardiology"],
        "Cardiologist known for radial-access angioplasty and structural valve work.",
    ),
    _doc(
        "ratnakar-bay-mumbai", "Dr. Sneha Kulkarni", _F, "orthopedics",
        ["MBBS", "MS (Orthopaedics)", "Fellowship in Shoulder & Sports Surgery (Australia)"],
        14, [*_EN_HI, "Marathi", "Portuguese"], "97.80", ("4.7", 178), 1800,
        ["Shoulder replacement", "Arthroscopy", "ACL reconstruction"],
        "Shoulder and sports surgeon caring for athletes and active older adults.",
    ),
    _doc(
        "ratnakar-bay-mumbai", "Dr. Karan Mehra", _M, "cosmetic",
        ["MBBS", "MS (General Surgery)", "MCh (Plastic & Reconstructive Surgery)",
         "Fellowship in Aesthetic Surgery (Brazil)"],
        16, [*_EN_HI, "Arabic", "Portuguese"], "98.90", ("4.8", 412), 2500,
        ["Rhinoplasty", "Body contouring", "Breast aesthetic surgery"],
        "Plastic surgeon focused on natural-looking rhinoplasty and body contouring after weight loss.",
    ),
    _doc(
        "ratnakar-bay-mumbai", "Dr. Rashmi Joshi", _F, "fertility",
        ["MBBS", "MD (Obstetrics & Gynaecology)", "FRCOG", "Fellowship in Reproductive Medicine (UK)"],
        22, [*_EN_HI, "Marathi", "Gujarati", "Swahili"], "68.00", ("4.9", 358), 1500,
        ["IVF/ICSI", "Egg freezing", "Recurrent pregnancy loss"],
        "Reproductive medicine specialist with two decades of IVF experience and a large East African "
        "patient community.",
    ),
    _doc(
        "ratnakar-bay-mumbai", "Dr. Imran Shaikh", _M, "bariatric",
        ["MBBS", "MS (General Surgery)", "FALS (Bariatric)", "FACS"],
        15, [*_EN_HI, "Urdu", "Arabic"], "99.00", ("4.7", 231), 1800,
        ["Gastric bypass", "Sleeve gastrectomy", "Revision bariatric surgery"],
        "Bariatric and metabolic surgeon with a dedicated revision-surgery clinic.",
    ),
    _doc(
        "ratnakar-bay-mumbai", "Dr. Anjali Rao", _F, "oncology",
        ["MBBS", "MS (General Surgery)", "MCh (Surgical Oncology)", "Fellowship in Breast Oncoplasty (UK)"],
        13, [*_EN_HI, "Marathi", "Kannada"], "96.10", ("4.8", 144), 1800,
        ["Breast-conserving surgery", "Oncoplastic reconstruction", "Sentinel node biopsy"],
        "Breast cancer surgeon combining oncological safety with oncoplastic reconstruction.",
    ),
    # ---------------------------------------------------------------- Coromandel, Chennai (6)
    _doc(
        "coromandel-chennai", "Dr. Senthil Murugan", _M, "cardiology",
        ["MBBS", "MS (General Surgery)", "MCh (Cardiothoracic Surgery)", "FRCS (CTh)"],
        27, ["English", "Tamil", "Hindi", "Arabic"], "98.30", ("4.9", 488), 1800,
        ["Adult & paediatric cardiac surgery", "Congenital heart defects", "Valve repair"],
        "Cardiac surgeon with a large paediatric practice, operating on children from more than 30 "
        "countries.",
    ),
    _doc(
        "coromandel-chennai", "Dr. Lakshmi Narayanan", _F, "transplant",
        ["MBBS", "MS (General Surgery)", "MCh (Surgical Gastroenterology)",
         "Fellowship in Liver Transplantation (Korea)"],
        20, ["English", "Tamil", "Hindi", "Arabic", "French"], "95.80", ("4.8", 233), 2500,
        ["Living donor liver transplant", "Paediatric liver transplant", "Kidney transplant"],
        "Liver transplant surgeon leading adult and paediatric living-donor programmes.",
    ),
    _doc(
        "coromandel-chennai", "Dr. Karthik Subramanian", _M, "nephrology",
        ["MBBS", "MD (Medicine)", "DM (Nephrology)"],
        18, ["English", "Tamil", "Hindi", "Swahili"], "96.90", ("4.7", 204), 1200,
        ["Haemodialysis", "Transplant work-up", "Vascular access"],
        "Nephrologist coordinating transplant work-up and holiday dialysis for visiting patients.",
    ),
    _doc(
        "coromandel-chennai", "Dr. Priya Ramachandran", _F, "urology",
        ["MBBS", "MS (General Surgery)", "MCh (Urology)", "Fellowship in Robotic Urology (USA)"],
        15, ["English", "Tamil", "Hindi", "French"], "97.60", ("4.8", 167), 1500,
        ["Robotic prostatectomy", "HoLEP", "Endourology"],
        "Robotic urologist performing prostate cancer surgery and laser prostate enucleation.",
    ),
    _doc(
        "coromandel-chennai", "Dr. Ganesh Iyer", _M, "orthopedics",
        ["MBBS", "MS (Orthopaedics)", "MCh (Orthopaedics)"],
        24, ["English", "Tamil", "Hindi", "Arabic"], "98.10", ("4.7", 318), 1400,
        ["Computer-navigated knee replacement", "Hip replacement", "Trauma"],
        "Joint-replacement surgeon using computer navigation for precise implant alignment.",
    ),
    _doc(
        "coromandel-chennai", "Dr. Meenakshi Sundaram", _F, "gastroenterology",
        ["MBBS", "MS (General Surgery)", "MCh (Surgical Gastroenterology)", "FMAS"],
        16, ["English", "Tamil", "Hindi", "Bengali"], "97.30", ("4.7", 189), 1400,
        ["Laparoscopic colorectal surgery", "Gallbladder & biliary surgery", "Advanced endoscopy"],
        "GI surgeon specialising in keyhole colorectal and biliary surgery.",
    ),
    # ---------------------------------------------------------------- Pournami, Chennai (5)
    _doc(
        "pournami-chennai", "Dr. Revathi Balasubramanian", _F, "ophthalmology",
        ["MBBS", "MS (Ophthalmology)", "FRCS (Glasgow)", "Fellowship in Cornea & Refractive Surgery"],
        19, ["English", "Tamil", "Hindi", "Sinhala"], "99.30", ("4.9", 522), 1000,
        ["Bladeless LASIK", "Corneal transplant (DMEK/DSAEK)", "Keratoconus cross-linking"],
        "Cornea and refractive surgeon; performs LASIK, lens-based vision correction and partial-thickness "
        "corneal transplants.",
    ),
    _doc(
        "pournami-chennai", "Dr. Arun Prakash", _M, "ophthalmology",
        ["MBBS", "MS (Ophthalmology)", "FICO", "Fellowship in Vitreo-Retina"],
        17, ["English", "Tamil", "Hindi", "Arabic"], "96.80", ("4.7", 241), 1000,
        ["Vitrectomy", "Retinal detachment", "Diabetic retinopathy"],
        "Vitreo-retinal surgeon treating retinal detachment and advanced diabetic eye disease.",
    ),
    _doc(
        "pournami-chennai", "Dr. Divya Raghavan", _F, "dental",
        ["BDS", "MDS (Prosthodontics & Implantology)", "Fellowship in Oral Implantology (Germany)"],
        14, ["English", "Tamil", "Hindi", "French"], "98.60", ("4.9", 403), 800,
        ["Full-mouth rehabilitation", "Immediate-load implants", "Smile design & veneers"],
        "Prosthodontist who plans full-mouth rehabilitation digitally so most patients need one trip.",
    ),
    _doc(
        "pournami-chennai", "Dr. Suresh Babu", _M, "ent",
        ["MBBS", "MS (ENT)", "DNB (ENT)", "Fellowship in Otology & Cochlear Implantation"],
        21, ["English", "Tamil", "Telugu", "Hindi"], "97.90", ("4.8", 276), 1000,
        ["Cochlear implants", "Endoscopic sinus surgery", "Tonsil & adenoid surgery"],
        "ENT surgeon running a paediatric cochlear implant and auditory rehabilitation programme.",
    ),
    _doc(
        "pournami-chennai", "Dr. Nandini Varadarajan", _F, "cosmetic",
        ["MBBS", "MS (General Surgery)", "MCh (Plastic Surgery)", "Fellowship in Hair Restoration"],
        12, ["English", "Tamil", "Hindi", "Arabic"], "98.40", ("4.7", 198), 1500,
        ["FUE hair transplant", "Rhinoplasty", "Facial aesthetics"],
        "Plastic surgeon focused on facial aesthetics and FUE hair restoration.",
    ),
    # ---------------------------------------------------------------- Nandi Valley, Bengaluru (6)
    _doc(
        "nandi-valley-bengaluru", "Dr. Prakash Hegde", _M, "neurology",
        ["MBBS", "MS (General Surgery)", "MCh (Neurosurgery)", "Fellowship in Skull Base Surgery (Japan)"],
        23, ["English", "Kannada", "Hindi", "Arabic"], "96.90", ("4.8", 287), 2000,
        ["Brain tumours", "Aneurysm surgery & coiling", "Deep brain stimulation"],
        "Neurosurgeon heading the skull-base and functional neurosurgery programmes.",
    ),
    _doc(
        "nandi-valley-bengaluru", "Dr. Shruti Kamath", _F, "neurology",
        ["MBBS", "MD (Medicine)", "DM (Neurology)", "Fellowship in Epilepsy (USA)"],
        15, ["English", "Kannada", "Hindi", "Konkani"], "95.40", ("4.7", 166), 1500,
        ["Epilepsy surgery evaluation", "Movement disorders", "Stroke"],
        "Epileptologist leading video-EEG evaluation for patients considering epilepsy surgery.",
    ),
    _doc(
        "nandi-valley-bengaluru", "Dr. Vikram Gowda", _M, "spine",
        ["MBBS", "MS (Orthopaedics)", "Fellowship in Spine Surgery (Germany)"],
        19, ["English", "Kannada", "Hindi", "Telugu", "Swahili"], "97.50", ("4.8", 230), 1800,
        ["Scoliosis correction", "Minimally invasive spinal fusion", "Disc replacement"],
        "Spine surgeon specialising in adolescent and adult deformity correction.",
    ),
    _doc(
        "nandi-valley-bengaluru", "Dr. Ananya Reddy", _F, "orthopedics",
        ["MBBS", "MS (Orthopaedics)", "Fellowship in Sports Medicine (UK)"],
        11, ["English", "Kannada", "Telugu", "Hindi"], "97.90", ("4.6", 124), 1400,
        ["ACL reconstruction", "Knee replacement", "Cartilage repair"],
        "Sports-medicine surgeon for ligament injuries and early knee arthritis.",
    ),
    _doc(
        "nandi-valley-bengaluru", "Dr. Mohan Krishnamurthy", _M, "oncology",
        ["MBBS", "MD (Radiation Oncology)", "DNB (Radiotherapy)", "Fellowship in Radiosurgery"],
        26, ["English", "Kannada", "Tamil", "Hindi"], "94.60", ("4.7", 198), 1800,
        ["Stereotactic radiosurgery", "IMRT", "Brain & spine tumours"],
        "Radiation oncologist with a focus on radiosurgery for brain and spine tumours.",
    ),
    _doc(
        "nandi-valley-bengaluru", "Dr. Bhavana Murthy", _F, "fertility",
        ["MBBS", "MS (Obstetrics & Gynaecology)", "Fellowship in Reproductive Medicine & Embryology"],
        16, ["English", "Kannada", "Hindi", "Arabic"], "66.00", ("4.8", 263), 1200,
        ["ICSI", "Laparoscopic fertility surgery", "Recurrent IVF failure"],
        "Fertility specialist and embryologist with a focus on patients after previous IVF failure.",
    ),
    # ---------------------------------------------------------------- Vasundhara, Hyderabad (5)
    _doc(
        "vasundhara-hyderabad", "Dr. Srinivas Kolli", _M, "transplant",
        ["MBBS", "MS (General Surgery)", "MCh (GI Surgery)", "Fellowship in Liver Transplantation (UK)"],
        22, ["English", "Telugu", "Hindi", "Urdu", "Arabic"], "95.90", ("4.8", 254), 2500,
        ["Living donor liver transplant", "Liver resections", "Kidney transplant"],
        "Transplant surgeon who started the centre's living-donor liver programme.",
    ),
    _doc(
        "vasundhara-hyderabad", "Dr. Sravani Reddy", _F, "gastroenterology",
        ["MBBS", "MS (General Surgery)", "MCh (Surgical Gastroenterology)"],
        14, ["English", "Telugu", "Hindi", "Arabic"], "97.20", ("4.7", 181), 1200,
        ["Laparoscopic hernia & gallbladder surgery", "Colorectal surgery", "Advanced endoscopy"],
        "GI and laparoscopic surgeon offering day-care hernia and gallbladder surgery.",
    ),
    _doc(
        "vasundhara-hyderabad", "Dr. Mohammed Arif Hussain", _M, "nephrology",
        ["MBBS", "MD (Medicine)", "DM (Nephrology)"],
        20, ["English", "Urdu", "Hindi", "Telugu", "Arabic", "Swahili"], "96.60", ("4.6", 172), 1200,
        ["Dialysis", "Pre-transplant evaluation", "AV fistula care"],
        "Nephrologist supporting transplant candidates and patients who need dialysis during their visit.",
    ),
    _doc(
        "vasundhara-hyderabad", "Dr. Kiran Kumar Naidu", _M, "urology",
        ["MBBS", "MS (General Surgery)", "MCh (Urology)", "DNB (Urology)"],
        18, ["English", "Telugu", "Hindi", "Arabic"], "97.70", ("4.7", 209), 1300,
        ["RIRS & PCNL for stones", "HoLEP", "Laser prostate surgery"],
        "Endourologist treating complex kidney stones and prostate enlargement with lasers.",
    ),
    _doc(
        "vasundhara-hyderabad", "Dr. Sameera Fatima", _F, "bariatric",
        ["MBBS", "MS (General Surgery)", "FALS", "Fellowship in Metabolic & Bariatric Surgery (France)"],
        12, ["English", "Urdu", "Hindi", "Telugu", "Arabic", "French"], "99.00", ("4.8", 219), 1500,
        ["Sleeve gastrectomy", "Gastric bypass", "Intragastric balloon"],
        "Bariatric surgeon offering surgical and endoscopic weight-loss options.",
    ),
    # ---------------------------------------------------------------- Hooghly Valley, Kolkata (5)
    _doc(
        "hooghly-valley-kolkata", "Dr. Debashish Ghosh", _M, "cardiology",
        ["MBBS", "MD (Medicine)", "DM (Cardiology)", "FSCAI"],
        22, ["English", "Bengali", "Hindi", "Nepali"], "98.20", ("4.7", 311), 1200,
        ["Primary angioplasty", "Pacemaker implantation", "Coronary imaging"],
        "Interventional cardiologist leading the 24x7 heart-attack programme.",
    ),
    _doc(
        "hooghly-valley-kolkata", "Dr. Paromita Sen", _F, "neurology",
        ["MBBS", "MS (General Surgery)", "MCh (Neurosurgery)"],
        16, ["English", "Bengali", "Hindi", "Assamese"], "96.40", ("4.7", 137), 1500,
        ["Brain tumour surgery", "Endovascular coiling", "Spine trauma"],
        "Neurosurgeon performing brain tumour surgery and endovascular aneurysm treatment.",
    ),
    _doc(
        "hooghly-valley-kolkata", "Dr. Sourav Chatterjee", _M, "oncology",
        ["MBBS", "MD (Medicine)", "DM (Medical Oncology)"],
        19, ["English", "Bengali", "Hindi"], "92.80", ("4.6", 203), 1500,
        ["Chemotherapy & immunotherapy", "Lung cancer", "Gastrointestinal cancers"],
        "Medical oncologist who coordinates shared care with oncologists in the patient's home country.",
    ),
    _doc(
        "hooghly-valley-kolkata", "Dr. Moumita Das", _F, "nephrology",
        ["MBBS", "MD (Medicine)", "DM (Nephrology)"],
        13, ["English", "Bengali", "Hindi", "Nepali"], "96.10", ("4.6", 112), 1000,
        ["Haemodialysis", "Vascular access", "Chronic kidney disease"],
        "Nephrologist running the hospital's dialysis unit and access clinic.",
        teleconsult=False,
    ),
    _doc(
        "hooghly-valley-kolkata", "Dr. Tanmoy Mukherjee", _M, "gastroenterology",
        ["MBBS", "MS (General Surgery)", "MCh (Surgical Gastroenterology)"],
        17, ["English", "Bengali", "Hindi", "Assamese"], "97.00", ("4.6", 158), 1200,
        ["Laparoscopic cholecystectomy", "Hernia repair", "Pancreatic surgery"],
        "GI surgeon specialising in laparoscopic gallbladder, hernia and pancreatic surgery.",
    ),
    # ---------------------------------------------------------------- Vembanad, Kochi (4)
    _doc(
        "vembanad-kochi", "Dr. Lekha Menon", _F, "wellness",
        ["BAMS", "MD (Ayurveda - Panchakarma)"],
        20, ["English", "Malayalam", "Hindi", "Arabic", "German"], "97.50", ("4.9", 312), 800,
        ["Panchakarma", "Lifestyle medicine", "Stress & sleep programmes"],
        "Ayurveda physician who designs supervised panchakarma and recovery programmes with the medical "
        "team.",
    ),
    _doc(
        "vembanad-kochi", "Dr. Thomas Varghese", _M, "orthopedics",
        ["MBBS", "MS (Orthopaedics)", "DNB (Orthopaedics)", "Fellowship in Arthroplasty (Germany)"],
        23, ["English", "Malayalam", "Hindi", "Arabic"], "98.00", ("4.7", 256), 1200,
        ["Knee & hip replacement", "Arthroscopy", "Sports injuries"],
        "Joint-replacement surgeon combining surgery with an integrated rehabilitation wing.",
    ),
    _doc(
        "vembanad-kochi", "Dr. Anitha Pillai", _F, "cardiology",
        ["MBBS", "MD (Medicine)", "DM (Cardiology)"],
        15, ["English", "Malayalam", "Tamil", "Hindi", "Arabic"], "98.30", ("4.7", 187), 1200,
        ["Angioplasty", "Pacemakers", "Cardiac rehabilitation"],
        "Cardiologist with a large practice among patients from the Gulf.",
    ),
    _doc(
        "vembanad-kochi", "Dr. Asha Mathew", _F, "fertility",
        ["MBBS", "DGO", "MS (Obstetrics & Gynaecology)", "Fellowship in Reproductive Medicine"],
        18, ["English", "Malayalam", "Hindi", "Arabic", "French"], "62.00", ("4.8", 241), 1000,
        ["IVF", "IUI", "PCOS management"],
        "Fertility specialist offering IUI and IVF with flexible remote monitoring.",
    ),
    # ---------------------------------------------------------------- Shubh Arogya, Ahmedabad (5)
    _doc(
        "shubh-arogya-ahmedabad", "Dr. Hemant Patel", _M, "cardiology",
        ["MBBS", "MD (Medicine)", "DM (Cardiology)", "FACC"],
        21, ["English", "Gujarati", "Hindi", "Swahili"], "98.10", ("4.6", 276), 1200,
        ["Angioplasty", "Bypass evaluation", "Pacemakers"],
        "Cardiologist with long-standing referral links to Kenya, Tanzania and Uganda.",
    ),
    _doc(
        "shubh-arogya-ahmedabad", "Dr. Kinjal Shah", _F, "oncology",
        ["MBBS", "MD (Medicine)", "DM (Medical Oncology)"],
        13, ["English", "Gujarati", "Hindi"], "93.10", ("4.6", 142), 1200,
        ["Breast cancer", "Chemotherapy", "Supportive care"],
        "Medical oncologist focused on breast and gynaecological cancers.",
    ),
    _doc(
        "shubh-arogya-ahmedabad", "Dr. Jignesh Desai", _M, "orthopedics",
        ["MBBS", "MS (Orthopaedics)", "Fellowship in Joint Replacement (UK)"],
        19, ["English", "Gujarati", "Hindi", "Swahili"], "97.90", ("4.7", 233), 1200,
        ["Bilateral knee replacement", "Robotic-assisted knee surgery", "Hip replacement"],
        "Knee specialist performing single-sitting bilateral knee replacements.",
    ),
    _doc(
        "shubh-arogya-ahmedabad", "Dr. Nirav Trivedi", _M, "urology",
        ["MBBS", "MS (General Surgery)", "MCh (Urology)"],
        16, ["English", "Gujarati", "Hindi", "Arabic"], "97.40", ("4.6", 165), 1200,
        ["Robotic prostatectomy", "Kidney stone surgery", "Uro-oncology"],
        "Urologist offering robotic prostate surgery and laser stone treatment.",
    ),
    _doc(
        "shubh-arogya-ahmedabad", "Dr. Hetal Parikh", _F, "dental",
        ["BDS", "MDS (Prosthodontics)", "Fellowship in Implantology"],
        14, ["English", "Gujarati", "Hindi", "Portuguese"], "98.70", ("4.8", 198), 700,
        ["Dental implants", "Full-mouth rehabilitation", "Aesthetic dentistry"],
        "Prosthodontist leading the implant centre and full-arch rehabilitation.",
    ),
    # ---------------------------------------------------------------- Deccan Crest, Pune (5)
    _doc(
        "deccan-crest-pune", "Dr. Amol Patwardhan", _M, "orthopedics",
        ["MBBS", "MS (Orthopaedics)", "FRCS (Orthopaedics)"],
        20, ["English", "Marathi", "Hindi", "Arabic"], "98.00", ("4.7", 244), 1400,
        ["Knee & hip replacement", "Shoulder surgery", "Arthroscopy"],
        "Orthopaedic surgeon covering joint replacement, shoulder and arthroscopic surgery.",
    ),
    _doc(
        "deccan-crest-pune", "Dr. Gauri Sathe", _F, "spine",
        ["MBBS", "MS (Orthopaedics)", "Fellowship in Spine Surgery (Singapore)"],
        12, ["English", "Marathi", "Hindi"], "97.00", ("4.6", 109), 1500,
        ["Microdiscectomy", "Spinal fusion", "Spine rehabilitation"],
        "Spine surgeon with a conservative-first approach and minimally invasive surgery when needed.",
    ),
    _doc(
        "deccan-crest-pune", "Dr. Snehal Bhosale", _F, "fertility",
        ["MBBS", "MD (Obstetrics & Gynaecology)", "Fellowship in IVF (Spain)"],
        15, ["English", "Marathi", "Hindi", "Arabic", "Dari"], "63.50", ("4.8", 219), 1200,
        ["IVF/ICSI", "Egg freezing", "Male infertility (with andrology team)"],
        "IVF specialist running the hospital's embryology lab and fertility-preservation service.",
    ),
    _doc(
        "deccan-crest-pune", "Dr. Rahul Gokhale", _M, "cosmetic",
        ["MBBS", "MS (General Surgery)", "MCh (Plastic Surgery)", "Fellowship in Aesthetic Surgery (Korea)"],
        14, ["English", "Marathi", "Hindi", "Arabic"], "98.60", ("4.7", 187), 1800,
        ["Rhinoplasty", "Liposuction", "Hair restoration"],
        "Aesthetic plastic surgeon for facial and body procedures.",
    ),
    _doc(
        "deccan-crest-pune", "Dr. Manasi Kelkar", _F, "ophthalmology",
        ["MBBS", "MS (Ophthalmology)", "FICO", "Fellowship in Refractive Surgery"],
        11, ["English", "Marathi", "Hindi"], "99.10", ("4.7", 155), 900,
        ["LASIK", "Phakic lens implants", "Cataract surgery"],
        "Refractive surgeon offering laser and lens-based vision correction.",
    ),
    # ---------------------------------------------------------------- Aravali Heights, Jaipur (4)
    _doc(
        "aravali-heights-jaipur", "Dr. Mahendra Singh Rathore", _M, "orthopedics",
        ["MBBS", "MS (Orthopaedics)", "DNB (Orthopaedics)"],
        25, ["English", "Hindi", "Russian"], "97.60", ("4.6", 281), 1000,
        ["Knee replacement", "Bilateral knee replacement", "ACL reconstruction"],
        "Senior orthopaedic surgeon with a busy knee-replacement practice.",
    ),
    _doc(
        "aravali-heights-jaipur", "Dr. Priyanka Shekhawat", _F, "cosmetic",
        ["MBBS", "MS (General Surgery)", "MCh (Plastic Surgery)"],
        12, ["English", "Hindi", "French"], "98.20", ("4.7", 166), 1500,
        ["Liposuction & abdominoplasty", "Rhinoplasty", "Hair transplant"],
        "Plastic surgeon offering body contouring and facial aesthetic surgery.",
    ),
    _doc(
        "aravali-heights-jaipur", "Dr. Ritika Jain", _F, "dental",
        ["BDS", "MDS (Conservative Dentistry & Endodontics)"],
        10, ["English", "Hindi", "Arabic"], "98.80", ("4.8", 176), 600,
        ["Root canal treatment", "Veneers & smile design", "Implants"],
        "Endodontist and cosmetic dentist focused on single-visit treatments.",
    ),
    _doc(
        "aravali-heights-jaipur", "Dr. Naveen Sharma", _M, "ophthalmology",
        ["MBBS", "MS (Ophthalmology)", "DNB (Ophthalmology)"],
        17, ["English", "Hindi", "Punjabi"], "99.00", ("4.6", 208), 800,
        ["Cataract surgery", "LASIK", "Glaucoma"],
        "Cataract and glaucoma surgeon with a high-volume day-care practice.",
        teleconsult=False,
    ),
    # ---------------------------------------------------------------- Shivalik Foothills, Chandigarh (5)
    _doc(
        "shivalik-chandigarh", "Dr. Gurpreet Kaur Sandhu", _F, "ent",
        ["MBBS", "MS (ENT)", "Fellowship in Cochlear Implantation (Austria)"],
        16, ["English", "Hindi", "Punjabi", "Russian"], "97.80", ("4.7", 183), 1000,
        ["Cochlear implants", "Endoscopic sinus surgery", "Thyroid surgery"],
        "ENT surgeon leading the cochlear implant centre and head-and-neck clinic.",
    ),
    _doc(
        "shivalik-chandigarh", "Dr. Harpreet Singh Gill", _M, "ophthalmology",
        ["MBBS", "MS (Ophthalmology)", "FRCS (Glasgow)"],
        22, ["English", "Hindi", "Punjabi", "Dari"], "98.90", ("4.8", 247), 900,
        ["Vitreo-retinal surgery", "Corneal transplant", "Cataract surgery"],
        "Retina and cornea surgeon serving many patients from Afghanistan and Central Asia.",
    ),
    _doc(
        "shivalik-chandigarh", "Dr. Amandeep Dhillon", _M, "orthopedics",
        ["MBBS", "MS (Orthopaedics)", "Fellowship in Arthroplasty"],
        15, ["English", "Hindi", "Punjabi", "Russian"], "97.50", ("4.6", 151), 1000,
        ["Knee replacement", "Trauma", "Arthroscopy"],
        "Orthopaedic surgeon for knee replacement and arthroscopic surgery.",
    ),
    _doc(
        "shivalik-chandigarh", "Dr. Simran Bedi", _F, "neurology",
        ["MBBS", "MD (Medicine)", "DM (Neurology)", "Fellowship in Epilepsy"],
        13, ["English", "Hindi", "Punjabi", "Urdu"], "95.20", ("4.7", 128), 1200,
        ["Epilepsy", "Epilepsy surgery evaluation", "Headache"],
        "Neurologist running the epilepsy monitoring unit.",
    ),
    _doc(
        "shivalik-chandigarh", "Dr. Navneet Kaur Grewal", _F, "fertility",
        ["MBBS", "MS (Obstetrics & Gynaecology)", "Fellowship in Reproductive Medicine"],
        14, ["English", "Hindi", "Punjabi", "Dari"], "61.50", ("4.7", 174), 1000,
        ["IUI & IVF", "Endometriosis", "Fertility counselling"],
        "Fertility specialist offering IUI and IVF with counselling in Punjabi and Dari.",
    ),
]
# fmt: on
