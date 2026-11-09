# ruff: noqa: E501  (data file: long multilingual regex alternations read better unwrapped)
"""Red-flag lexicon for the rules triage engine (data only; matching lives in ``rules_redflags.py``).

* ``SIGNALS``: a signal is one clinical finding ("vomiting blood", "pregnant", "fever") with multilingual
  regexes (English plus Arabic, French, Russian, Swahili, Bengali, Hindi, Spanish and Portuguese for the core
  emergencies). Patterns are matched against ``rules_negation.normalise``d clauses; negated and past/family
  history mentions do not count (context signals such as "pregnant" or "on dialysis" ignore history scoping).
* ``FAMILIES``: an emergency family fires when every signal of one of its ``rules`` is present. A one-signal
  rule is a "single very strong signal"; combination rules encode families that need two findings (sepsis,
  DKA, pre-eclampsia, cauda equina, head injury on blood thinners, missed dialysis, child danger signs …).
* ``SYMPTOM_SIGNALS``: catalog questionnaire answers -> signals (curated; isolated chronic markers such as
  "Seizures" or "Fainting" are supporting signals only).

Pattern mini-language (expanded before compiling, then folded like the text):
  ``~`` prefix  substring match (Arabic / Bengali / Devanagari, whose marks break ``\\b``); otherwise the pattern
               is wrapped in word boundaries.
  ``%N``        up to N intervening words.
  ``@cant``     can't / cannot / unable to / could not …
  ``@blood``    "blood" not followed by pressure / sugar / test …
Patterns must not use upper-case regex escapes (``\\S``, ``\\W`` …): sources are casefolded.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SignalDef:
    label: str
    patterns: tuple[str, ...] = ()
    exclude: tuple[str, ...] = ()  # a clause matching one of these never yields the signal
    context: bool = False  # a fact about the patient (pregnant, diabetic …): history scoping does not apply
    neg_window: int = 6  # tokens before the trigger searched for a negator


@dataclass(frozen=True)
class Family:
    id: str
    label: str
    specialty: str | None
    rules: tuple[tuple[str, ...], ...]


def _s(
    label: str,
    *patterns: str,
    exclude: tuple[str, ...] = (),
    context: bool = False,
    neg_window: int = 6,
) -> SignalDef:
    return SignalDef(label=label, patterns=patterns, exclude=exclude, context=context, neg_window=neg_window)


SIGNALS: dict[str, SignalDef] = {
    # ------------------------------------------------------------------------------ cardiac / chest
    "chest_pain": _s(
        "Chest pain",
        r"chest (?:pain|pressure|tightness|discomfort|heaviness|ache)",
        r"(?:pain|pressure|tightness|heaviness|discomfort|ache|squeezing|band|weight) %4(?:in|on|across|around|"
        r"inside) (?:the |my |his |her )?(?:middle of (?:the |my |his |her )?|centre of (?:my |the )?)?chest",
        r"(?:tight|heavy) chest|angina|chest (?:hurts|is hurting)|clutch\w* %2chest",
        r"douleurs? %3(?:à la|dans la|de la) poitrine|douleur thoracique|oppression thoracique|serrement %2poitrine",
        r"dolor %3(?:en el|de|del) pecho|dolor torácico|opresión en el pecho",
        r"dor %3(?:no|do) peito|aperto no peito|dor torácica",
        r"бол\w* %2в груди|давит в груди|жжет в груди|жжёт в груди|загрудинн\w*",
        r"~(?:الم|وجع|ضغط) (?:[^ ]+ ){0,2}(?:في |على )?الصدر",
        r"maumivu %3(?:ya |kwenye |katika )?kifua\w*|kifua kinauma",
        r"~বুকে (?:[^ ]+ )?(?:ব্যথা|চাপ)|~বুক ব্যথা",
        r"~(?:सीने|छाती) में (?:[^ ]+ )?(?:दर्द|दबाव|जकड़न)",
        exclude=(r"on exertion|when i (?:climb|walk|run)|climbing|stairs|uphill",),
    ),
    "chest_crushing": _s(
        "Crushing chest pain",
        r"crushing %3(?:chest|pain|pressure)|(?:chest|pressure|pain) %2crushing",
        r"(?:elephant|weight|someone) %3(?:on|sitting on|standing on) (?:my |his |her )?chest",
        r"douleur %2(?:écrasante|en étau)|dolor %2(?:aplastante|opresivo)|dor %2(?:esmagadora|em aperto)",
        r"~الم (?:[^ ]+ )?ساحق",
    ),
    "heart_attack": _s(
        "Possible heart attack",
        r"heart attack|cardiac arrest|crise cardiaque|infarctus|ataque (?:al corazón|cardíaco|cardiaco)|"
        r"infarto|инфаркт\w*|mshtuko wa moyo",
        r"~نوبة قلبية|~جلطة (?:في )?القلب|~হার্ট অ্যাটাক|~दिल का दौरा|~हार्ट अटैक",
        exclude=(r"\bscreening\b|\brisk\b|\bprevent\w*",),
    ),
    "chest_at_rest": _s(
        "Chest pain at rest",
        r"(?:chest pain|chest pressure|chest tightness|angina) %2(?:at rest|while resting|when resting)",
    ),
    "rest_onset": _s(
        "Started at rest",
        r"(?:at rest|while %2resting|when resting|woke me|woke him|woke her|in my sleep|while sitting)",
    ),
    "radiation": _s(
        "Pain spreading to the arm, jaw or neck",
        r"(?:spread\w*|radiat\w*|going|goes|moving|moves|shooting|travel\w*) %4(?:to|into|down|up|through) %3"
        r"(?:arm|arms|jaw|shoulder|neck)",
        r"left arm|left shoulder",
        r"irradi\w* %3(?:bras|mâchoire|machoire)|bras gauche|brazo izquierdo|braço esquerdo|"
        r"mandíbula|mâchoire|отда\w* %2(?:руку|челюсть|лопатку)|левую руку|mkono wa kushoto",
        r"~الذراع اليسري|~الذراع الايسر|~ينتشر|~الفك|~বাম হাতে|~बाएं हाथ|~बाएँ हाथ|~जबड़े",
    ),
    "sweating": _s(
        "Cold sweat",
        r"cold sweat\w*|sweating|sweaty|clammy|sueurs?|sudor|suor|пот|потливость|jasho",
        r"~تعرق|~عرق بارد|~ঘাম|~पसीना",
        exclude=(r"night sweats?|feeding",),
    ),
    "tearing_pain": _s(
        "Sudden tearing pain (possible aortic dissection)",
        r"(?:ripping|tearing|torn|rip) %3(?:pain|sensation|feeling)",
        r"douleur %2déchirante|dolor %2desgarrador|dor %2(?:lacerante|rasgando)|разрывающ\w* боль",
    ),
    "through_to_back": _s(
        "Pain going through to the back",
        r"(?:going|goes|went|radiat\w*|spread\w*|shooting|through) %2(?:through )?to (?:my |his |her |the )?back",
        r"between (?:my |his |her |the )?shoulder blades",
    ),
    # ---------------------------------------------------------------------------------------- stroke
    "face_droop": _s(
        "Facial drooping (stroke sign)",
        r"(?:face|mouth|lip|lips)\w* %3(?:droop\w*|dropped|sagging|twisted|lopsided)",
        r"droop\w* %3(?:face|mouth)|facial (?:droop\w*|palsy|weakness|paralysis)",
        r"smile %2(?:is |has gone |went |looks )?(?:lopsided|droop\w*|crooked)",
        r"(?:bouche|visage) %2(?:déformée?|tordue?|paralysée?|de travers)",
        r"(?:cara|boca) %2(?:caída|torcida|desviada)|(?:boca|rosto) %2(?:torta|caída|caído|torto)",
        r"(?:перекосил\w*|перекошен\w*) %2(?:лицо|рот)|(?:лицо|рот) %2перекош\w*",
        r"~(?:تدلي|ارتخاء|انحراف|اعوجاج|ميلان) (?:[^ ]+ )?(?:الوجه|الفم)|~(?:الوجه|الفم) (?:[^ ]+ )?(?:مائل|معوج|متدلي)",
        r"(?:uso|mdomo) %2(?:umepinda|umelegea|umepooza|umeenda upande)",
        r"~মুখ (?:[^ ]+ )?(?:বেঁকে|বাঁকা)|~(?:चेहरा|मुंह|मुँह) (?:[^ ]+ )?(?:टेढ़ा|लटक)",
        exclude=(
            r"skin|wrinkl\w*|ageing|aging|face ?lift|cheeks?|jowls?|eyelids?|botox|cosmetic|filler|teeth|"
            r"veneers?|gums?|braces|since birth|for years",
        ),
    ),
    "slurred_speech": _s(
        "Slurred speech (stroke sign)",
        r"slurred %2(?:speech|words|talk\w*)|speech %3slurr\w*|slurring",
        r"parole %2(?:pâteuse|bredouillante)|habla %2(?:arrastrada|torpe)|fala %2(?:arrastada|enrolada)",
        r"(?:невнятн\w*|нечетк\w*|нечётк\w*|смазанн\w*) речь|речь %2(?:невнятн\w*|нарушен\w*)",
        r"~ثقل (?:في )?اللسان|~কথা (?:[^ ]+ )?জড়িয়ে|~(?:ज़ुबान|जुबान) लड़खड़ा",
    ),
    "speech_difficulty": _s(
        "Sudden difficulty speaking (stroke sign)",
        r"(?:@cant|struggling to|trouble|difficulty|problems?) %1(?:speak\w*|talk\w*|get %1words out|find %1words)",
        r"sudden\w* %3(?:speech|speak\w*|talk\w*)",
        r"n'arrive (?:plus|pas) à parler|ne (?:peut|peux) (?:plus|pas) parler|trouble de la parole",
        r"no (?:puede|puedo) hablar|dificultad para hablar|não (?:consegue|consigo) falar",
        r"не (?:может|могу) говорить|не говорит",
        r"~(?:لا يستطيع|لا تستطيع|لا استطيع|صعوبة في) (?:[^ ]+ )?(?:الكلام|التكلم|النطق)",
        r"(?:hawezi|anashindwa) (?:ku)?(?:ongea|zungumza|sema)",
        r"~কথা (?:[^ ]+ )?বলতে পারছ|~(?:बोल नहीं|बोलने में) (?:[^ ]+ )?(?:पा|सक|दिक्कत|परेशानी|तकलीफ)",
        exclude=(
            r"hoarse|voice|stammer|stutter|delayed|speech therapy|since birth|for (?:months|years)|english|"
            r"language|(?:talk|speak)\w* (?:to|with|about)",
        ),
    ),
    "sudden_weakness": _s(
        "Sudden weakness or numbness on one side (stroke sign)",
        r"sudden\w* %2(?:weak\w*|numb\w*|paralys\w*|paralyz\w*)",
        r"(?:weak\w*|numb\w*|paralys\w*|paralyz\w*) %4(?:one|left|right) side of %1(?:body|face)",
        r"sudden\w* %3@cant %1(?:lift|raise|move|feel) %2(?:arm|leg|hand)",
        r"(?:arm|leg|hand|side) %2(?:went|gone|has gone|is) (?:limp|dead|floppy)",
        r"ne (?:peut|peux) plus (?:lever|bouger) %2(?:bras|jambe)",
        r"(?:debilidad|fuerza) %3(?:un lado|lado (?:izquierdo|derecho))|fraqueza %3(?:um lado|lado)",
        r"(?:онемел\w*|отнял\w*|не двигается) %2(?:рука|нога|половина)",
        r"~شلل|~(?:ضعف|خدر) (?:[^ ]+ )?(?:في )?(?:جانب|نصف)|kupooza|~লকওয়া|~लकवा|~पक्षाघात",
        exclude=(r"for (?:months|years)|since birth|slowly",),
    ),
    "stroke_word": _s(
        "Possible stroke signs",
        r"stroke|avc|accident vasculaire|derrame cerebral|ictus|derrame|инсульт\w*|kiharusi",
        r"~سكتة دماغية|~جلطة (?:في )?(?:الدماغ|المخ)|~جلطة دماغية|~স্ট্রোক|~स्ट्रोक",
        exclude=(
            r"heat ?stroke|sunstroke|stroke risk|risk of %2stroke|prevent\w* %2stroke|swimming|strokes of|pleural",
        ),
    ),
    # ------------------------------------------------------------------------------------- breathing
    "cant_breathe": _s(
        "Severe breathing difficulty",
        r"(?:@cant|struggling to|hard to|fighting to) %1(?:breathe|breath|get %1air)",
        r"gasping|(?:not|stopped) breathing|choking|laboured breathing|labored breathing",
        r"difficulty (?:in )?breathing|breathing difficult\w*|trouble breathing",
        r"severe\w* %1(?:breathless\w*|short of breath|shortness of breath|breathing problem\w*)",
        r"@cant %1(?:finish|complete|say) %2(?:sentence|sentences|words)",
        r"only (?:say|speak|manage|get out) %2(?:few|single|one|two|three) words",
        r"(?:breathless\w*|short of breath|shortness of breath) %3(?:at rest|sitting still|when sitting|while "
        r"sitting|lying still|resting|doing nothing)",
        r"(?:n'arrive|ne peut|ne peux) (?:plus|pas) (?:à )?respirer|étouffe|suffoque",
        r"no (?:puede|puedo) respirar|me ahogo|se ahoga|dificultad %1para respirar",
        r"não (?:consegue|consigo) respirar|falta de ar %1(?:forte|grave|intensa)|sufocando",
        r"не (?:может|могу) дышать|задыха\w*|удушь\w*",
        r"~(?:لا|ما) (?:استطيع|يستطيع|تستطيع|اقدر|يقدر) (?:على )?التنفس|~صعوبة (?:شديدة )?في التنفس|~اختناق",
        r"(?:anapumua|ninapumua|kupumua|anahema) kwa shida|(?:hawezi|siwezi|anashindwa) kupumua",
        r"~শ্বাস (?:নিতে )?(?:পারছে না|পারছি না|পারছেন না)",
        r"~(?:सांस|साँस) (?:लेने में )?(?:बहुत )?(?:तकलीफ|दिक्कत)|~(?:सांस|साँस) नहीं (?:ले|आ)",
        exclude=(r"stairs|uphill|exertion|exercis\w*|climb\w*|walking|nose|nasal|snor\w*|sleep apn\w*",),
    ),
    "blue": _s(
        "Blue or grey lips or skin",
        r"(?:lips?|face|fingers?|tongue|skin) %3(?:blue|bluish|blueish|grey|gray|dusky)",
        r"(?:lips?|tongue) %3purple|(?:blue|bluish|grey) %1(?:lips?|face)|cyanos\w*|turning blue",
        r"lèvres %1(?:bleues|violettes)|labios %1(?:azules|morados)|lábios %1(?:azuis|roxos)",
        r"(?:синие|посинел\w*|синеют) %1губ\w*|губы %1(?:синие|посинел\w*)",
        r"~(?:الشفاه|الشفتين|شفتاه|شفتيه|شفايف) (?:[^ ]+ )?(?:زرقاء|ازرقت|مزرقة)|~ازرقاق",
        r"midomo %3(?:bluu|buluu|samawati)|~ঠোঁট (?:[^ ]+ )?নীল|~होंठ (?:[^ ]+ )?नीले",
    ),
    "breathless": _s(
        "Breathlessness",
        r"short(?:ness)? of breath|breathless\w*|out of breath|@cant %1catch %2breath|wheez\w*",
        r"essouffl\w*|du mal à respirer|falta de aire|me falta el aire|falta de ar|одышк\w*",
        r"~ضيق (?:[^ ]+ )?(?:في )?التنفس|~ضيق نفس|kupumua kwa shida|~শ্বাসকষ্ট|~(?:सांस|साँस) फूल",
    ),
    "sudden_breathless": _s(
        "Sudden breathlessness",
        r"sudden\w* %2(?:became |became very |got |felt )?(?:breathless\w*|short of breath|shortness of breath|"
        r"out of breath)",
    ),
    "pleuritic": _s(
        "Sharp chest pain on breathing",
        r"(?:sharp|stabbing) %3pain %4(?:breathe|breathing|breath)|pain %2when (?:i )?(?:breathe|take a breath)",
    ),
    "calf_swelling": _s(
        "Swollen painful calf (possible clot)",
        r"(?:calf|calves) %2(?:swell\w*|swollen|painful|tender|red)|swollen %1calf|"
        r"deep vein thrombosis|dvt|blood clot",
    ),
    "palpitations": _s(
        "Palpitations",
        r"palpitation\w*|heart %2(?:racing|pounding|fluttering|skipping)|racing heart|fluttering",
    ),
    # --------------------------------------------------------------------------------------- bleeding
    "haematemesis": _s(
        "Vomiting blood",
        r"(?:vomit\w*|throw\w* up|threw up|puk\w*|sick) %6@blood|@blood %2(?:in|with) %1vomit\w*",
        r"ha?ematemesis|coffee ground\w*",
        r"vomi\w* %3(?:du )?sang|vomit\w* %3sangre|vomit\w* %3sangue|рвот\w* %2кров\w*|рвет кровью|"
        r"рвёт кровью|кровав\w* рвот\w*",
        r"~(?:تقي\w*|اتقي\w*|يتقي\w*|استفر\w*|قيء) (?:[^ ]+ ){0,2}(?:دم|الدم|دما)",
        r"(?:ku|ana|na|ali|ni)?tapika %1damu",
        r"~রক্তবমি|~রক্ত বমি|~বমির সাথে রক্ত|~खून की उल्टी|~उल्टी में खून",
    ),
    "melaena": _s(
        "Black, tarry stools",
        r"(?:black|tarry) %2(?:stool|stools|poo|faeces|feces|motions?)|(?:stool|stools|poo|motions?) %3"
        r"(?:black|tarry)|mela?ena",
        r"(?:selles|heces|fezes|deposiciones) %3(?:noires|negras|pretas)|(?:черн\w*|чёрн\w*) стул|стул %1(?:черн\w*|чёрн\w*)",
        r"~براز (?:[^ ]+ )?اسود|kinyesi cheusi|~পায়খানা (?:[^ ]+ )?কালো|~কালো পায়খানা|~काला मल|~मल काला",
        exclude=(r"iron (?:tablets|pills|supplements)",),
    ),
    "severe_bleed": _s(
        "Severe bleeding",
        r"(?:severe|heavy|heavily|uncontrolled|uncontrollable|profuse|profusely|massive|lots of|a lot of|"
        r"large amount of|pouring) %2(?:bleed\w*|@blood)",
        r"bleed\w* %3(?:won't|will not|doesn't|does not|wont|not) stop|soak\w* %3(?:pads?|towels?|through)",
        r"ha?emorrhag\w*",
        r"saign\w* %2(?:beaucoup|abondamment)|hémorragie|sangra\w* %2mucho|hemorragia|"
        r"sangrado %1(?:abundante|fuerte)|sangrando muito|sangramento %1(?:forte|intenso)",
        r"сильн\w* кровотечени\w*|кровотечени\w* %2не останавлива\w*",
        r"~نزيف (?:[^ ]+ )?(?:حاد|شديد|غزير)|~نزيف لا يتوقف|damu nyingi|~প্রচুর রক্ত",
        r"~बहुत (?:ज़्यादा |ज्यादा )?खून (?:बह|निकल)|~भारी रक्तस्राव",
        exclude=(r"period|menstrua\w*|menses|gums?|nose ?bleeds? (?:for|every)",),
    ),
    "bleeding_any": _s(
        "Bleeding",
        r"bleed\w*|spotting|saign\w*|sangr\w*|кровотеч\w*|kutokwa (?:na )?damu|~نزيف|~রক্তপাত|~रक्तस्राव",
        exclude=(r"gums?|nose|haemorrhoids?|hemorrhoids?|piles|when i brush",),
    ),
    "vaginal_bleeding": _s(
        "Vaginal bleeding",
        r"vaginal %1bleed\w*|bleed\w* %2from (?:the )?vagina|saignement\w* vaginal\w*|sangrado vaginal|"
        r"sangramento vaginal|кровотечени\w* из влагалища|~نزيف مهبلي",
    ),
    "haemoptysis": _s(
        "Coughing up blood",
        r"cough\w* %3@blood|@blood %2(?:when|while) (?:i )?cough\w*|ha?emoptysis",
        r"кашл\w* %1кровь\w*|кашель с кровью|tos con sangre|tosse com sangue|toux %2sang",
        r"~(?:سعال|كحة) (?:[^ ]+ )?(?:دم|مع دم)|kukohoa damu|~কাশির সাথে রক্ত|~(?:खांसी|खाँसी) में खून",
    ),
    "fainting": _s(
        "Fainting",
        r"faint\w*|passed out|pass out|passing out|blacked out|black out|collaps\w*|lost consciousness",
        r"évanoui\w*|perdu connaissance|desmay\w*|desmai\w*|обморок\w*|потерял\w* сознание|(?:ku|ali|ni)?zimia",
        r"~اغمي|~اغماء|~فقد(?:ان)? الوعي|~অজ্ঞান|~জ্ঞান হার|~बेहोश",
        exclude=(r"faint (?:line|smell|sound|mark)",),
    ),
    "unconscious": _s(
        "Unconscious or unresponsive",
        r"unconscious|unresponsive|not responding|won't wake up|will not wake up|@cant %1wake (?:him|her|them) "
        r"%1up|inconscient\w*|inconsciente|без сознания|hajitambui|amepoteza fahamu",
        r"~(?:فاقد|غائب عن) الوعي|~জ্ঞান নেই|~होश नहीं",
    ),
    "dizziness": _s("Dizziness", r"dizz\w*|lightheaded|light headed|vertigo|~মাথা ঘুর|~चक्कर"),
    # ------------------------------------------------------------------------------- mental health
    "suicidal": _s(
        "Suicidal thoughts",
        r"suicid\w*|kill (?:myself|himself|herself)|end (?:my|his|her) (?:own )?life|end it all|take my (?:own )?"
        r"life|(?:don't|do not|dont|no longer) want to (?:live|be alive|wake up)|want to die|better off dead|"
        r"wish i (?:was|were) dead",
        r"me suicider|envie de mourir|en finir|ne (?:veux|veut) plus vivre|suicidarme|quitarme la vida|"
        r"no quiero (?:seguir )?vivir|quiero morir(?:me)?|me matar|suicídio|não quero (?:mais )?viver|"
        r"quero morrer|tirar (?:a )?minha (?:própria )?vida",
        r"не хочу %1жить|покончить с собой|суицид\w*|убить себя|хочу умереть|покончу с собой",
        r"kujiua|sitaki kuishi|nataka kufa",
        r"~انتحار|~انتحر|~اقتل نفسي|~لا اريد ان اعيش|~لا اريد العيش|~انهي حياتي",
        r"~আত্মহত্যা|~বাঁচতে চাই না|~মরে যেতে চাই|~आत्महत्या|~खुदकुशी|~जीना नहीं चाह|~मरना चाह",
        neg_window=2,  # "No veo sentido, quiero morir": a distant negator belongs to another verb
    ),
    "self_harm": _s(
        "Self-harm",
        r"self harm\w*|(?:harm\w*|hurt\w*|cut\w*) myself|overdos\w*|automutil\w*|autolesi\w*|самоповрежд\w*",
        exclude=(r"accidentally|by accident",),
        neg_window=2,
    ),
    # ------------------------------------------------------------------------------------ anaphylaxis
    "airway_swelling": _s(
        "Swelling of the lips, tongue or throat",
        r"(?:lips?|tongue|throat)(?: and (?:lips?|tongue|throat|face))? %3(?:swell\w*|swollen|puff\w*)",
        r"swell\w* %2(?:of |in )?(?:the |my |his |her )?(?:lips?|tongue|throat)",
        r"throat %4(?:closing|tight\w*|closing up)|tight throat",
        r"(?:gonflement|œdème|oedème) %2(?:lèvres|langue|gorge)|(?:lèvres|langue|gorge) %1gonfl\w*|gorge %1serrée",
        r"(?:hinchazón|inflamación) %2(?:labios|lengua|garganta)|(?:labios|lengua|garganta) %1(?:hinchad\w*|"
        r"inflamad\w*)|se me cierra la garganta|garganta %3(?:cerrando|cierra|fechando)",
        r"inchaço %2(?:lábios|língua|garganta)|(?:lábios|língua|garganta) %1inchad\w*|garganta fechando",
        r"(?:отек|отёк|опух\w*) %2(?:губ\w*|язык\w*|горл\w*)|(?:губы|язык|горло) %1(?:опух\w*|отек\w*|отёк\w*)",
        r"~(?:تورم|انتفاخ) (?:[^ ]+ )?(?:الشفاه|الشفتين|اللسان|الحلق)",
        r"(?:midomo|ulimi|koo) %1(?:kuvimba|imevimba|umevimba|limevimba)",
        r"~(?:ঠোঁট|জিভ|গলা) (?:[^ ]+ )?ফুলে|~(?:होंठ|जीभ|गला) (?:[^ ]+ )?सूज",
        exclude=(r"tonsil\w*|for (?:weeks|months|years)",),
    ),
    "anaphylaxis_word": _s(
        "Severe allergic reaction",
        r"anaphyla\w*|allergic shock|epi ?pen|choc anaphylactique|anafila\w*|анафилак\w*",
        r"~صدمة تحسسية|~حساسية مفرطة",
    ),
    "allergen": _s(
        "Allergic trigger",
        r"hives|urticaria|stung|bee sting|wasp|allergic reaction|peanut\w*|shellfish",
    ),
    "wheeze": _s("Wheezing", r"wheez\w*|sifflement\w*|sibilanc\w*|хрип\w*"),
    "swelling_face_hands": _s(
        "Swelling of the face or hands",
        r"(?:face|hands|fingers) %3(?:swollen|swell\w*|puffy)|swollen %2(?:face|hands)",
    ),
    # ---------------------------------------------------------------------------------- urology / obs
    "testicular_pain": _s(
        "Sudden severe testicular pain (possible torsion)",
        r"(?:sudden|severe|intense|excruciating|terrible|bad|unbearable|sharp|agonising|agonizing) %4pain %5"
        r"(?:testic\w*|testis|testes|scrot\w*|balls?|groin)",
        r"(?:testic\w*|testis|scrot\w*) %6(?:sudden\w*|severe|swollen and painful|very painful|excruciating|"
        r"agonising|agonizing)",
        r"douleur %3(?:testicule|bourse)\w*|dolor %3test[ií]cul\w*|dor %3test[ií]cul\w*|бол\w* %3яичк\w*",
        r"~الم (?:[^ ]+ ){0,2}(?:في )?الخصية|maumivu %2(?:ya )?korodani|~অণ্ডকোষে (?:[^ ]+ )?ব্যথা|"
        r"~अंडकोष में (?:[^ ]+ )?दर्द",
    ),
    "pregnant": _s(
        "Pregnancy",
        r"pregnant|pregnancy test %2positive|positive pregnancy test|period is %3late|missed %1period|"
        r"expecting a baby|enceinte|embarazada|grávida|gravida|беременн\w*|mjamzito|ujauzito",
        r"~حامل|~গর্ভবতী|~অন্তঃসত্ত্বা|~गर्भवती|~प्रेग्नेंट",
        context=True,
    ),
    "reduced_fetal_movement": _s(
        "Baby moving less than usual",
        r"baby %3(?:moving|kicking|movements?) %3(?:less|stopped|not)|(?:no|reduced|decreased|fewer|less) %1"
        r"(?:fetal |foetal |baby |baby's )?(?:movements?|kicks?)|@cant %1feel %2baby",
    ),
    "severe_abdo_pain": _s(
        "Severe abdominal pain",
        r"(?:severe|intense|excruciating|terrible|unbearable|worst|sudden|sharp|agonising|agonizing) %3"
        r"(?:abdominal|stomach|belly|tummy|abdomen|pelvic) %1(?:pain|cramp\w*|ache)",
        r"(?:abdominal|stomach|belly|tummy) pain %3(?:severe|unbearable|excruciating)",
        r"(?:sharp|severe|sudden) pain %2low %2(?:right|left) side|shoulder tip pain|pain in %1shoulder tip",
        r"douleur %2(?:violente|atroce|intense) %2ventre|douleur abdominale %1(?:intense|violente|atroce)",
        r"dolor %2(?:fuerte|intenso|insoportable) %2(?:abdomen|barriga|estómago|vientre)",
        r"dor %2(?:forte|intensa|insuportável) %2(?:barriga|abdômen|abdome|estômago)",
        r"(?:сильн\w*|остр\w*|резк\w*) боль в животе",
        r"~الم (?:شديد|حاد) في (?:البطن|المعدة)|maumivu makali %2tumbo\w*",
        r"~পেটে (?:[^ ]+ )?(?:তীব্র|প্রচণ্ড) ব্যথা|~पेट में (?:[^ ]+ )?(?:तेज़|तेज|भयंकर) दर्द",
    ),
    "rigid_abdomen": _s(
        "Hard, rigid abdomen",
        r"(?:belly|abdomen|stomach|tummy) %1(?:is |feels |has become |became |gone |went )(?:very )?(?:hard|"
        r"rigid|board like|like a board|swollen and hard)(?! to)|rigid abdomen|guarding",
        r"ventre %1(?:dur|de bois)|abdomen %1(?:duro|rígido)|barriga %1dura|abdômen %1rígido|"
        r"живот %1(?:тверд\w*|твёрд\w*|как доска|напряжен\w*)",
        r"~البطن (?:[^ ]+ )?(?:صلب|متصلب|قاسي)|tumbo %1(?:gumu|limekaza)|~পেট (?:[^ ]+ )?শক্ত|"
        r"~पेट (?:[^ ]+ )?(?:सख्त|कड़ा)",
    ),
    "vomiting": _s(
        "Vomiting",
        r"vomit\w*|throwing up|threw up|being sick|vomi\w*|рвот\w*|рвет|рвёт|(?:ku|ana|na)?tapika",
        r"~تقيؤ|~استفراغ|~يتقيا|~اتقيا|~قيء|~বমি|~उल्टी",
    ),
    # ------------------------------------------------------------------------- neuro / infection
    "severe_headache": _s(
        "Severe headache",
        r"(?:severe|terrible|bad|intense|splitting|worst|sudden|excruciating|awful|pounding|blinding) %2"
        r"(?:headache|head ache|head pain)|headache %3(?:severe|terrible|won't go away)",
        r"(?:fort|violent|terrible) mal de tête|mal de tête %2(?:violent|terrible|intense)|dolor de cabeza "
        r"%1(?:fuerte|intenso)|dor de cabeça %1(?:forte|intensa)|(?:сильн\w*|страшн\w*) головн\w* бол\w*",
        r"~صداع (?:[^ ]+ )?(?:شديد|قوي)|maumivu makali %2kichwa|~(?:তীব্র|প্রচণ্ড) মাথাব্যথা|~(?:तेज़|तेज) सिरदर्द",
    ),
    "thunderclap": _s(
        "Sudden severe headache",
        r"worst headache|thunderclap|sudden\w* %3(?:severe|terrible|explosive|excruciating|worst|blinding|"
        r"violent) headache|like (?:being )?(?:hit|struck|kicked) %3head|headache %3(?:came on|started) %2"
        r"(?:suddenly|in seconds|instantly)",
        r"pire mal de tête|mal de tête %2(?:brutal|soudain)|peor dolor de cabeza|dolor de cabeza %2(?:súbito|"
        r"repentino|explosivo)|pior dor de cabeça|внезапн\w* %1головн\w* бол\w*|самая сильная головная боль",
        r"~اسوا صداع|~صداع (?:[^ ]+ )?مفاجئ|~হঠাৎ (?:[^ ]+ )?(?:তীব্র |প্রচণ্ড )?মাথাব্যথা|"
        r"~अचानक (?:[^ ]+ )?(?:तेज़|तेज|भयंकर) सिरदर्द",
    ),
    "fever": _s(
        "Fever",
        r"fever\w*|high temperature|temperature of|rigou?rs|shaking chills|chills|"
        r"(?:3[89]|4[0-2])(?:\.\d)? ?(?:c|degrees)|10[2-6](?:\.\d)? ?(?:f|degrees)",
        r"fièvre|fiebre|febre|температур\w*|жар|лихорадк\w*|homa",
        r"~حمى|~حرارة (?:عالية|مرتفعة)|~سخونة|~জ্বর|~बुखार",
        context=False,
    ),
    "confusion": _s(
        "Confusion",
        r"confus\w*|disorient\w*|delirious|delirium|not making sense|désorienté\w*|desorientad\w*|"
        r"спутанн\w* сознани\w*|бредит|(?:ame|nime)?changanyikiwa",
        r"~مشوش|~ارتباك|~تشوش|~هذيان|~বিভ্রান্ত|~बेसुध",
        exclude=(r"for (?:months|years)|memory loss for",),
    ),
    "reduced_consciousness": _s(
        "Very drowsy or hard to wake",
        r"drowsy|(?:hard|difficult) to wake|(?:can|could) (?:hardly|barely) stay awake|@cant %1stay awake|"
        r"very sleepy|keeps? falling asleep|floppy|letharg\w*|somnolent\w*|сонлив\w*|заторможен\w*",
        r"~(?:نعسان|خامل)|~ঘুম ঘুম|~সাড়া দিচ্ছে না|~सुस्त",
    ),
    "low_urine": _s(
        "Passing little or no urine",
        r"(?:barely|hardly|not|haven't|have not|hasn't) %2(?:passed|passing|peed|urinated)|"
        r"(?:no|little|very little) urine (?:output|today|since)|stopped (?:passing urine|peeing)",
    ),
    "mottled": _s("Mottled or cold skin", r"mottled|blotchy skin|cold (?:hands and feet|and clammy)"),
    "rash_nonblanching": _s(
        "Rash that does not fade when pressed",
        r"(?:rash|spots|blotches|marks|dots|patches) %6(?:don't|do not|doesn't|does not|didn't|won't|not|no) %1"
        r"(?:fade|blanch|disappear|go away)|non blanching|glass test|purpura|petechia\w*",
        r"taches %2(?:violettes|pourpres)|manchas %1(?:moradas|púrpura|roxas|arroxeadas)",
        r"(?:сыпь|пятна) %3не (?:исчеза\w*|бледне\w*)|геморрагическ\w* сыпь",
        r"~طفح (?:[^ ]+ )?(?:لا يختفي|ارجواني|بنفسجي)|(?:vipele|madoa) %2zambarau",
        r"~বেগুনি (?:[^ ]+ )?(?:দাগ|ফুসকুড়ি)|~बैंगनी (?:[^ ]+ )?(?:दाने|चकत्ते|धब्बे)",
    ),
    "purple_rash": _s("Purple rash", r"(?:purple|dark red) %1(?:spots|rash|blotches|patches|marks|dots)"),
    "neck_stiffness": _s(
        "Stiff neck",
        r"stiff neck|neck %1(?:is |feels )?stiff|neck stiffness|@cant %1(?:bend|move|touch) %2neck|"
        r"chin to %1chest",
        r"raideur %2nuque|nuque raide|rigidez de nuca|cuello rígido|rigidez %1nuca|ригидн\w* %1затыл\w*",
        r"~(?:تيبس|تصلب) (?:في )?الرقبة|shingo %1(?:ngumu|imekaza)|~ঘাড় শক্ত|~गर्दन (?:में )?अकड़",
        exclude=(r"for (?:weeks|months|years)|desk|posture|pillow",),
    ),
    "photophobia": _s(
        "Light hurts the eyes",
        r"light hurts %1eyes|(?:sensitive|sensitivity) to light|photophobia|@cant %1(?:stand|bear|tolerate) "
        r"%1light",
    ),
    "seizure_now": _s(
        "Ongoing or first seizure",
        r"(?:seizure|fit|convulsion)s? %3(?:won't stop|not stopping|still going|lasting|for \d+ minutes)|"
        r"(?:is|still) (?:having (?:a )?(?:seizure|fit|convulsion)s?|fitting|convulsing)|seizure now|first (?:ever )?(?:seizure|fit|convulsion)|"
        r"(?:fitting|convulsing) now",
    ),
    "vision_loss": _s(
        "Sudden loss of vision",
        r"sudden\w* %3(?:lost|lose|losing|loss of) %4(?:vision|sight|eyesight)|(?:lost|loss of) %3(?:vision|"
        r"sight) %4sudden\w*|(?:curtain|shadow|veil) %4(?:came down|coming down|over %1(?:eye|vision))|"
        r"dark curtain|(?:went|gone|going) %1blind|sudden\w* %2blind|@cant see %3(?:suddenly|all of a sudden)",
        r"perdu %2la vue|voile noir|perdí la vista|pérdida %1de (?:la )?visión|perdi a visão|perda súbita de "
        r"visão|внезапно %2(?:ослеп\w*|потерял\w* зрение|перестал\w* видеть)",
        r"~فقدت (?:[^ ]+ )?(?:البصر|النظر)|~فقدان (?:مفاجئ )?(?:للبصر|البصر|النظر)|ghafla %3sioni",
        r"~হঠাৎ (?:[^ ]+ ){0,2}চোখে দেখতে পাচ্ছি না|~अचानक (?:[^ ]+ ){0,2}(?:दिखना बंद|दिखाई नहीं)",
    ),
    "visual_disturbance": _s(
        "Visual disturbance",
        r"flash\w* %2(?:lights?|in my eyes)|(?:blurred|blurry|double) vision|seeing (?:spots|stars)|"
        r"spots before %1eyes",
    ),
    # ------------------------------------------------------------------------------- injury / context
    "head_injury": _s(
        "Head injury",
        r"(?:hit|banged|bumped|struck|knocked|injured) %1(?:his|her|my|their|the|its) head|"
        r"head (?:injury|trauma|wound)|fell %4(?:on|onto) (?:his|her|my|the) head|concussion",
        r"(?:cogné|tapé) la tête|traumatisme crânien|golpe %1en la cabeza|se golpeó la cabeza|"
        r"traumatismo cr[aá]n\w*|bateu a cabeça|pancada na cabeça|удари\w* %1голов\w*|травм\w* голов\w*|"
        r"черепно",
        r"~(?:ضرب|اصطدم|اصابة في|ارتطم) (?:[^ ]+ )?(?:راسه|راسها|راسي|الراس)|aligonga kichwa|"
        r"jeraha la kichwa|~মাথায় (?:[^ ]+ )?(?:আঘাত|চোট)|~सिर (?:पर|में) (?:[^ ]+ )?चोट",
        exclude=(r"like %2(?:hit|struck|kicked)|as if %2(?:hit|struck)",),
    ),
    "anticoagulant": _s(
        "Takes blood thinners",
        r"warfarin|coumadin|apixaban|eliquis|rivaroxaban|xarelto|dabigatran|pradaxa|edoxaban|heparin|"
        r"enoxaparin|blood thinners?|anticoagul\w*|acenocoumarol|acitrom|sintrom|варфарин|~وارفارين|"
        r"~مميع(?:ات)? (?:لل)?دم|~खून पतला",
        context=True,
    ),
    "diabetic": _s(
        "Diabetes",
        r"diabet\w*|diabét\w*|type (?:1|one)|insulin|t1d|диабет\w*|kisukari",
        r"~سكري|~ডায়াবেটিস|~मधुमेह|~डायबिटीज",
        context=True,
    ),
    "no_insulin": _s(
        "Without insulin",
        r"(?:ran out of|run out of|running out of|no|missed|stopped|without|haven't (?:had|taken)|out of) %2"
        r"insulin",
    ),
    "very_high_glucose": _s(
        "Very high blood sugar",
        r"(?:meter|glucometer|monitor) %3(?:says|shows|reads|reading) %1(?:hi|high)|ketones?|ketoacidosis|dka",
        r"(?:sugar|glucose) %3(?:over|above) (?:[4-9]\d\d|[3-9]\d)",
    ),
    "fruity_breath": _s(
        "Fruity-smelling breath",
        r"(?:fruity|pear drops?|acetone|nail polish) %2(?:breath|smell\w*)|breath %2(?:smells|smelling) %2"
        r"(?:fruity|sweet|of acetone|like nail polish)",
    ),
    "kussmaul": _s(
        "Fast, deep breathing",
        r"breathing %2(?:fast|rapid|rapidly|quickly) and deep|deep (?:and )?(?:fast|rapid) breath\w*",
    ),
    "dialysis_patient": _s(
        "On dialysis",
        r"dialysis|ha?emodialysis|dialyse|diálisis|diálise|диализ\w*|~غسيل (?:الكلى|كلوي)|~ডায়ালাইসিস|~डायलिसिस",
        context=True,
    ),
    "missed_dialysis": _s(
        "Missed dialysis sessions",
        r"(?:missed|skipped|missing|haven't had|have not had|couldn't get|could not get) %4(?:dialysis|"
        r"sessions?)",
    ),
    "weak_general": _s("Severe weakness", r"(?:very|extremely|so|too) weak|weakness"),
    "back_context": _s(
        "Back problem",
        r"back pain|backache|lower back|slipped disc|disc %1(?:herniation|prolapse|bulge)|herniated disc|"
        r"sciatica|lumbar|spinal|spine",
        context=True,
    ),
    "saddle_numbness": _s(
        "Numbness between the legs (saddle area)",
        r"(?:numb\w*|no feeling|@cant %1feel|lost %1feeling|tingl\w*) %6(?:between (?:my |his |her |the )?legs|"
        r"saddle|genitals?|private (?:parts|area)|back passage|perineum|inner thighs)",
        r"saddle (?:anaesthesia|anesthesia|numbness)",
    ),
    "urinary_retention": _s(
        "Unable to pass urine",
        r"@cant %1(?:pass\w*|empty\w*|start\w*) %2(?:urine|water|bladder|pee)|"
        r"urinary retention|@cant %1(?:urinate|pee|wee)",
    ),
    "incontinence_new": _s(
        "Lost bladder or bowel control",
        r"(?:lost|loss of|no) %1control %2(?:bladder|bowels?|urine|stool)|(?:wet|soiled) myself|"
        r"incontinent of (?:urine|faeces|feces|stool)",
    ),
    "bilateral_leg_weakness": _s(
        "Both legs getting weak",
        r"(?:both|my) legs %3(?:getting weak|weak\w*|giving way|collaps\w*)|weak\w* %2(?:in )?both legs",
        exclude=(r"when (?:i )?walk|after walking|walking|stairs",),
    ),
    "young_child_text": _s(
        "Young child",
        r"baby|infant|newborn|toddler|\d{1,2} months? old|[1-4] years? old|(?:one|two|three|four) years? old|"
        r"mtoto|bébé|nourrisson|bebé|малыш\w*|младен\w*|ребен\w*|ребён\w*",
        r"~رضيع|~طفلي|~طفلتي|~শিশু|~বাচ্চা|~शिशु|~बच्चा|~बच्ची",
        exclude=(
            r"pregnan\w*|weeks pregnant|fetal|foetal|(?:trying|want\w*|have|having) %2baby|test tube baby",
        ),
        context=True,
    ),
    "cant_feed": _s(
        "Not able to feed or drink",
        r"(?:@cant|won't|will not|not|isn't|is not|refus\w*|stopped) %1(?:feed\w*|breastfeed\w*|drink\w*|"
        r"suck\w*|nurse|nursing|take %1(?:feeds|bottle|milk))",
        r"hawezi kunyonya|hanyonyi|hawezi kunywa|ne (?:boit|mange|tète) plus|no (?:quiere )?(?:come|toma|bebe|"
        r"mama)|não (?:quer )?(?:mama|come|bebe)|не (?:ест|пьет|пьёт|сосет|сосёт)",
        r"~(?:لا|لم) (?:[^ ]+ )?(?:يرضع|ترضع|يشرب|تشرب)|~খেতে পারছে না|~দুধ খাচ্ছে না|~दूध नहीं पी",
    ),
}

FAMILIES: tuple[Family, ...] = (
    Family(
        "acute_coronary_syndrome",
        "Possible heart attack",
        "cardiology",
        (
            ("chest_crushing",),
            ("heart_attack",),
            ("chest_at_rest",),
            ("sx_chest_pain_acute",),
            ("sx_radiation_acute",),
            ("chest_pain", "radiation"),
            ("chest_pain", "sweating"),
            ("chest_pain", "rest_onset"),
            ("chest_pain", "pain_severe_acute"),
            ("chest_pain", "fainting"),
        ),
    ),
    Family(
        "aortic_dissection",
        "Possible aortic dissection",
        "cardiology",
        (("tearing_pain",), ("chest_pain", "through_to_back")),
    ),
    Family(
        "pulmonary_embolism",
        "Possible blood clot in the lungs",
        "cardiology",
        (
            ("sudden_breathless", "chest_pain"),
            ("sudden_breathless", "haemoptysis"),
            ("sudden_breathless", "calf_swelling"),
            ("pleuritic", "haemoptysis"),
            ("breathless", "haemoptysis", "calf_swelling"),
        ),
    ),
    Family(
        "stroke",
        "Possible stroke",
        "neurology",
        (
            ("face_droop",),
            ("slurred_speech",),
            ("speech_difficulty",),
            ("sudden_weakness",),
            ("stroke_word",),
            ("sx_one_sided_weakness",),
            ("sx_sudden_speech",),
        ),
    ),
    Family(
        "thunderclap_headache",
        "Sudden severe headache",
        "neurology",
        (("thunderclap",),),
    ),
    Family(
        "meningitis",
        "Possible meningitis or meningococcal infection",
        "neurology",
        (
            ("rash_nonblanching",),
            ("purple_rash", "fever"),
            ("neck_stiffness", "fever"),
            ("neck_stiffness", "severe_headache"),
            ("photophobia", "fever", "severe_headache"),
        ),
    ),
    Family(
        "head_injury",
        "Head injury needing urgent assessment",
        "neurology",
        (
            ("head_injury", "anticoagulant"),
            ("head_injury", "reduced_consciousness"),
            ("head_injury", "confusion"),
            ("head_injury", "vomiting"),
            ("head_injury", "fainting"),
            ("head_injury", "unconscious"),
            ("head_injury", "seizure_now"),
        ),
    ),
    Family(
        "sudden_vision_loss",
        "Sudden loss of vision",
        "ophthalmology",
        (("vision_loss",),),
    ),
    Family(
        "seizure",
        "Ongoing or first seizure",
        "neurology",
        (("seizure_now",),),
    ),
    Family(
        "unconscious",
        "Loss of consciousness",
        None,
        (("unconscious",),),
    ),
    Family(
        "severe_breathlessness",
        "Severe breathing difficulty",
        None,
        (("cant_breathe",), ("blue",)),
    ),
    Family(
        "child_danger_signs",
        "Danger signs in a young child",
        None,
        (
            ("young_child", "sx_breathless_acute"),
            ("young_child", "cant_feed"),
            ("young_child", "reduced_consciousness"),
            ("young_child", "fever", "fainting"),
            ("young_child", "purple_rash"),
        ),
    ),
    Family(
        "gi_bleeding",
        "Possible bleeding from the gut",
        "gastroenterology",
        (
            ("haematemesis",),
            ("melaena",),
            ("sx_blood_in_stool", "fainting"),
            ("sx_blood_in_stool", "dizziness"),
        ),
    ),
    Family("severe_bleeding", "Severe bleeding", None, (("severe_bleed",),)),
    Family(
        "haemoptysis",
        "Coughing up blood with breathlessness or chest pain",
        None,
        (("haemoptysis", "breathless"), ("haemoptysis", "chest_pain")),
    ),
    Family(
        "suicidal_ideation",
        "Suicidal thoughts",
        "wellness",
        (("suicidal",), ("self_harm",), ("sx_self_harm",)),
    ),
    Family(
        "anaphylaxis",
        "Possible severe allergic reaction (anaphylaxis)",
        None,
        (("airway_swelling",), ("anaphylaxis_word",), ("allergen", "wheeze"), ("allergen", "fainting")),
    ),
    Family(
        "testicular_torsion",
        "Possible testicular torsion",
        "urology",
        (("testicular_pain",),),
    ),
    Family(
        "pregnancy_emergency",
        "Possible pregnancy emergency (ectopic pregnancy or bleeding)",
        "fertility",
        (
            ("pregnant", "fainting"),
            ("pregnant", "severe_bleed"),
            ("pregnant", "vaginal_bleeding"),
            ("pregnant", "bleeding_any"),
            ("pregnant", "sx_abnormal_bleeding"),
            ("pregnant", "reduced_fetal_movement"),
            ("pregnant", "severe_abdo_pain"),
        ),
    ),
    Family(
        "severe_preeclampsia",
        "Possible severe pre-eclampsia",
        None,
        (
            ("pregnant", "severe_headache"),
            ("pregnant", "visual_disturbance"),
            ("pregnant", "bp_severe"),
            ("pregnant", "seizure_now"),
            ("pregnant", "sx_high_bp", "swelling_face_hands"),
        ),
    ),
    Family(
        "hypertensive_emergency",
        "Very high blood pressure with warning signs",
        "cardiology",
        (
            ("bp_crisis", "severe_headache"),
            ("bp_crisis", "chest_pain"),
            ("bp_crisis", "visual_disturbance"),
            ("bp_crisis", "confusion"),
        ),
    ),
    Family(
        "sepsis",
        "Possible sepsis",
        None,
        (
            ("fever", "confusion"),
            ("fever", "low_urine"),
            ("fever", "reduced_consciousness"),
            ("fever", "mottled"),
        ),
    ),
    Family(
        "cauda_equina",
        "Possible cauda equina syndrome",
        "spine",
        (
            ("saddle_numbness",),
            ("back_context", "urinary_retention"),
            ("back_context", "incontinence_new"),
            ("back_context", "bilateral_leg_weakness"),
        ),
    ),
    Family(
        "acute_abdomen",
        "Possible acute abdomen",
        "gastroenterology",
        (
            ("rigid_abdomen",),
            ("severe_abdo_pain", "vomiting", "fever"),
            ("severe_abdo_pain", "fainting"),
            ("abdo_pain_severe_acute", "vomiting"),
        ),
    ),
    Family(
        "diabetic_ketoacidosis",
        "Possible diabetic ketoacidosis",
        None,
        (
            ("fruity_breath",),
            ("diabetic", "no_insulin", "vomiting"),
            ("very_high_glucose", "vomiting"),
            ("very_high_glucose", "reduced_consciousness"),
            ("diabetic", "kussmaul"),
            ("diabetic", "reduced_consciousness"),
            ("no_insulin", "reduced_consciousness"),
        ),
    ),
    Family(
        "missed_dialysis",
        "Missed dialysis with warning signs",
        "nephrology",
        (
            ("dialysis_patient", "missed_dialysis", "breathless"),
            ("dialysis_patient", "missed_dialysis", "palpitations"),
            ("dialysis_patient", "missed_dialysis", "weak_general"),
            ("dialysis_patient", "missed_dialysis", "chest_pain"),
            ("dialysis_patient", "missed_dialysis", "confusion"),
        ),
    ),
)

# Labels of signals derived from structured answers / intake facts (not text patterns).
DERIVED_LABELS: dict[str, str] = {
    "sx_chest_pain_acute": "Chest pain or pressure",
    "sx_radiation_acute": "Pain radiating to the left arm or jaw",
    "sx_one_sided_weakness": "Weakness on one side of the body (stroke sign)",
    "sx_sudden_speech": "Sudden difficulty speaking (stroke sign)",
    "sx_self_harm": "Thoughts of self-harm",
    "sx_abnormal_bleeding": "Abnormal bleeding",
    "sx_blood_in_stool": "Blood in stool",
    "sx_breathless_acute": "Shortness of breath",
    "sx_high_bp": "High blood pressure",
    "young_child": "Young child",
    "pain_severe_acute": "Very severe pain that started recently",
    "abdo_pain_severe_acute": "Very severe abdominal pain that started recently",
    "bp_severe": "Very high blood pressure (160/110 or more)",
    "bp_crisis": "Very high blood pressure (180/120 or more)",
    "abdo_pain": "Abdominal pain",
}

# Catalog symptom (casefolded name) -> [(signal, answers that count, only when the problem is recent)].
_YM = frozenset({"yes", "maybe"})
_Y = frozenset({"yes"})
SYMPTOM_SIGNALS: dict[str, tuple[tuple[str, frozenset[str], bool], ...]] = {
    "chest pain or pressure": (("chest_pain", _YM, False), ("sx_chest_pain_acute", _Y, True)),
    "pain radiating to the left arm or jaw": (("radiation", _YM, False), ("sx_radiation_acute", _Y, True)),
    "weakness on one side of the body": (("sx_one_sided_weakness", _YM, True),),
    "sudden difficulty speaking": (("sx_sudden_speech", _YM, True),),
    "severe bleeding": (("severe_bleed", _YM, False),),
    "thoughts of self-harm": (("sx_self_harm", _YM, False),),
    "persistent cough or coughing blood": (("haemoptysis", _Y, True),),
    "fainting or near-fainting": (("fainting", _Y, False),),
    "memory loss or confusion": (("confusion", _Y, True),),
    "shortness of breath": (("breathless", _Y, False), ("sx_breathless_acute", _Y, True)),
    "shortness of breath when lying flat": (("breathless", _Y, False),),
    "palpitations or irregular heartbeat": (("palpitations", _Y, False),),
    "on dialysis": (("dialysis_patient", _Y, False),),
    "abnormal bleeding": (("sx_abnormal_bleeding", _Y, False),),
    "blood in stool": (("sx_blood_in_stool", _Y, False),),
    "blurred or cloudy vision": (("visual_disturbance", _Y, True),),
    "high blood pressure": (("sx_high_bp", _Y, False),),
    "high fever with shaking chills": (("fever", _YM, False),),
    "fever lasting more than a week": (("fever", _Y, False),),
    "swelling of the lips and tongue": (("airway_swelling", _YM, False),),
    "dizziness or vertigo": (("dizziness", _Y, True),),
    "lower back pain": (("back_context", _YM, False),),
    "upper back pain": (("back_context", _YM, False),),
    "pain shooting down the leg (sciatica)": (("back_context", _YM, False),),
    "abdominal pain": (("abdo_pain", _Y, False),),
}

# ------------------------------------------------------------------------------------- specialty routing
# Catalog specialty slug -> free-text hints (same mini-language as SIGNALS). Matched per clause, negation-aware,
# on notes with instruction-like sentences removed. Each distinct matching pattern adds weight (capped).
SPECIALTY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "cardiology": (
        r"heart(?!burn)\w*|cardiac|cardio\w*|coronary|angina|angiogra\w*|angioplasty|stents?",
        r"heart bypass|coronary bypass|cabg|valve\w*|mitral|aortic|atrial fibrillation|arrhythmi\w*|palpitation\w*",
        r"pacemaker|echo(?:cardiogram)?|ecg|vsd|asd|hole in the heart|rheumatic",
        r"сердц\w*|кардио\w*|cœur|coeur|cardiaque|corazón|coração|moyo|~القلب|~হৃদ|~হার্ট|~दिल|~हृदय",
    ),
    "orthopedics": (
        r"knees?|hips?|joints?|osteoarthritis|arthritis|acl|menisc\w*|ligament\w*|rotator cuff|shoulders?",
        r"fractur\w*|cartilage|limp\w*|club ?foot|ponseti|bones?|orthop(?:a)?edic\w*",
        r"genou\w*|hanche|rodilla\w*|cadera|joelho\w*|quadril|колен\w*|тазобедр\w*|сустав\w*|goti|magoti",
        r"~الركب|~مفصل|~হাঁটু|~घुटन",
    ),
    "spine": (
        r"spine|spinal|discs?|disks?|sciatica|lumbar|cervical|vertebra\w*|scoliosis|kyphosis|slipped disc",
        r"lower back|back pain|spinal stenosis|spondyl\w*|pivd",
        r"позвоноч\w*|поясниц\w*|грыж\w* диска|межпозвон\w*|colonne|hernie discale|columna|hernia discal|"
        r"coluna|~العمود الفقري|~الديسك|~غضروف|~মেরুদণ্ড|~কোমর|~रीढ़|~कमर",
    ),
    "neurology": (
        r"brain|neuro\w*|seizures?|epilep\w*|migraines?|headaches?|parkinson\w*|tremors?|stroke|dementia",
        r"memory loss|nerves?|pituitary|meningitis|aneurysm|deep brain|dbs|dystonia",
        r"мозг\w*|эпилеп\w*|cerveau|cerebro|cérebro|~الدماغ|~المخ|~মস্তিষ্ক|~दिमाग",
    ),
    "oncology": (
        r"cancer\w*|tumou?rs?|carcinoma|malignan\w*|lumps?|biopsy|chemo\w*|radiotherapy|lymphoma|leuka?emia",
        r"oncolog\w*|metasta\w*|night sweats",
        r"рак\w*|опухол\w*|онколог\w*|tumeur|cáncer|câncer|cancro|saratani|~سرطان|~ورم|~ক্যান্সার|~कैंसर",
    ),
    "gastroenterology": (
        r"stomach|gastro\w*|gastritis|liver|bowels?|colon\w*|endoscop\w*|reflux|heartburn|gerd|hiatus hernia",
        r"gall ?bladder|gallstones?|crohn\w*|colitis|ibs|ibd|constipation|diarrh\w*|bloating|cramps|jaundice",
        r"hepat\w*|pancrea\w*|appendi\w*|belly button|abdominal pain|swallow\w*|fundoplication|stools?",
        r"желуд\w*|кишеч\w*|печен\w*|estomac|ventre|intestin\w*|estómago|estômago|barriga|tumbo",
        r"~المعدة|~القولون|~الكبد|~পেট|~পায়খানা|~पेट",
    ),
    "urology": (
        r"urin\w*|urine|bladder|prostat\w*|psa|kidney stones?|renal colic|flank|testic\w*|testis|scrot\w*",
        r"orchid\w*|incontinen\w*|leak\w* urine|erectile|urolog\w*|ureter\w*|sling",
        r"почк\w*|мочев\w*|простат\w*|vessie|rein|riñón|vejiga|próstata|bexiga|figo|kibofu",
        r"~حصوة|~حصي|~الكلية|~الكلي|~المثانة|~البروستات|~কিডনি|~প্রস্রাব|~गुर्दे|~पेशाब|~किडनी",
    ),
    "nephrology": (
        r"dialysis|ha?emodialysis|nephr\w*|ckd|egfr|creatinine|kidney (?:disease|failure|function|biopsy)",
        r"protein\w* in %1urine|proteinuria|frothy urine|foamy urine|albumin|fistula",
        r"диализ\w*|~غسيل الكلي|~الفشل الكلوي",
    ),
    "transplant": (
        r"transplant\w*|donors?|donate|cirrhosis|end stage|thalass?a?emia|bone marrow|hla",
        r"трансплант\w*|~زراعة",
    ),
    "bariatric": (
        r"bmi (?:3[5-9]|[4-9]\d)|obes\w*|weight loss surgery|gastric (?:bypass|sleeve|band|balloon)",
        r"sleeve gastrectomy|bariatric|morbid\w*|weigh \d{3} kg|\d{3} kg",
        r"ожирен\w*|obésité|obesidad|obesidade|~السمنة|~تكميم|~मोटापा",
    ),
    "ophthalmology": (
        r"eyes?|vision|cataracts?|retina\w*|glaucoma|lasik|glasses|contact lenses|cornea\w*|squint",
        r"strabismus|short sighted|myopia|floaters|macula\w*|blurr\w*|sight",
        r"глаз\w*|зрени\w*|катаракт\w*|yeux|œil|vue|cataracte|ojos?|vista|catarata|olhos?|visão|macho|jicho",
        r"~العين|~عيون|~النظر|~البصر|~চোখ|~ছানি|~ঝাপসা|~आंख|~आँख|~मोतियाबिंद",
    ),
    "ent": (
        r"ears?|earache|hearing|deaf\w*|cochlear|tinnitus|sinus\w*|nasal|nose|tonsil\w*|adenoids?|throat",
        r"snor\w*|hoarse|voice|thyroid|goitre|polyps|smell",
        r"слух\w*|уш\w*|горл\w*|~الاذن|~السمع|~الانف|~اللوزتين|~الحلق",
    ),
    "fertility": (
        r"ivf|icsi|iui|infertil\w*|fertility|conceiv\w*|sperm|ovulation|pcos|embryo|egg freezing",
        r"fallopian|tubes|miscarriage|ovarian|uter\w*|fibroids?|periods?|menstrua\w*|gyn(?:a)?ec\w*",
        r"hysterectomy|myomectomy|endometriosis",
        r"fiv|enfant|ovarienne|gynéco\w*|fertilidad|эко|бесплод\w*|kupata mtoto|ugumba",
        r"~اطفال الانابيب|~الانجاب|~العقم|~বন্ধ্যা|~बांझ|~आईवीएफ",
    ),
    "cosmetic": (
        r"cosmetic\w*|aesthetic\w*|plastic surgery|rhinoplasty|nose job|liposuction|lipo|tummy tuck",
        r"abdominoplasty|blepharoplasty|eyelids?|face ?lift|breast (?:augmentation|implants?|enlargement|lift)",
        r"hair transplant|baldness|hair loss|wrinkles|scars?|loose skin",
        r"увеличени\w* груди|имплант\w*|эстетич\w*|пластическ\w*|esthétique|estética|plástica|~تجميل",
    ),
    "dental": (
        r"tooth|teeth|dental|dentist\w*|dentures?|molars?|gums?|root canal|crowns?|veneers?|fillings?",
        r"cleaning|wisdom tooth|orthodont\w*|braces|smile makeover",
        r"meno|jino|fizi|зуб\w*|десн\w*|dents?|dientes?|muelas?|dentes?|~اسنان|~ضرس|~দাঁত|~दांत|~दाँत",
    ),
    "wellness": (
        r"wellness|check ?ups?|health check|preventive|screening|ayurveda|panchakarma|yoga|retreat|detox",
        r"stress\w*|burn(?:t|ed)? out|burnout|exhausted",
        r"оздоров\w*|~فحص شامل",
    ),
}
