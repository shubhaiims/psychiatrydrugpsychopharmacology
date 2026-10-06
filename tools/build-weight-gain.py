"""Builds server/data/adverse-effects/weight-gain.json from the reviewer-supplied sources.

Citations are written as {key} or {key1,key2}; they are numbered in order of first
appearance on the page and replaced with [n] / [n,m]. Run from the repo root.
"""
import json, re

drugs = {d["name"]: d["id"] for d in json.load(open("server/data/drugs.json"))}

REFS = {
    "carolan": "Carolan A, Hynes-Ryan C, Agarwal SM, et al. Metformin for the prevention of antipsychotic-induced weight gain: guideline development and consensus validation. Schizophr Bull. 2025;51(5):1193–1205. doi:10.1093/schbul/sbae205",
    "maudsley": "Taylor DM, Barnes TRE, Young AH. The Maudsley Prescribing Guidelines in Psychiatry. 15th ed. Wiley-Blackwell; 2025.",
    "ks": "Boland R, Verduin ML, eds. Kaplan & Sadock's Comprehensive Textbook of Psychiatry. 11th ed. Wolters Kluwer; 2024.",
    "ada2026": "American Diabetes Association Professional Practice Committee for Obesity. Pharmacologic treatment of obesity in adults: Standards of Care in Overweight and Obesity. Diabetes Obes Cardiometab CARE. 2026;1:5–36. doi:10.2337/dci25-0008",
    "adaapa": "American Diabetes Association, American Psychiatric Association, American Association of Clinical Endocrinologists, North American Association for the Study of Obesity. Consensus development conference on antipsychotic drugs and obesity and diabetes. Diabetes Care. 2004;27:596–601.",
    "fleischhacker": "Fleischhacker WW, Heikkinen ME, Olié JP, et al. Effects of adjunctive treatment with aripiprazole on body weight and clinical efficacy in schizophrenia patients treated with clozapine. Int J Neuropsychopharmacol. 2010;13:1115–25.",
    "enlighten2": "Correll CU, Newcomer JW, Silverman B, et al. Effects of olanzapine combined with samidorphan on weight gain in schizophrenia: a 24-week phase 3 study (ENLIGHTEN-2). Am J Psychiatry. 2020;177:1168–78.",
    "morgan": "Morgan AP, Crowley JJ, Nonneman RJ, et al. The antipsychotic olanzapine interacts with the gut microbiome to cause weight gain in mouse. PLoS One. 2014;9(12):e115225.",
    "allison": "Allison DB, Mentore JL, Heo M, et al. Antipsychotic-induced weight gain: a comprehensive research synthesis. Am J Psychiatry. 1999;156:1686–96.",
    "catie": "Lieberman JA, Stroup TS, McEvoy JP, et al. Effectiveness of antipsychotic drugs in patients with chronic schizophrenia (CATIE). N Engl J Med. 2005;353:1209–23.",
    "cafe": "McEvoy JP, Lieberman JA, Perkins DO, et al. Efficacy and tolerability of olanzapine, quetiapine, and risperidone in the treatment of early psychosis: a randomized, double-blind 52-week comparison (CAFE). Am J Psychiatry. 2007;164:1050–60.",
}


def R(rating, names, src, outside=False):
    out = []
    for n in names:
        e = {"rating": rating, "source": src}
        if outside:
            e["name"] = n
        else:
            e["drug"] = drugs[n]
        out.append(e)
    return out


FGA_GROUP = ["Fluphenazine", "Perphenazine", "Thioridazine", "Thiothixene", "Zuclopenthixol", "Loxapine", "Molindone"]
ratings = (
    # Antipsychotics: Maudsley Table 1.31
    R("high", ["Clozapine", "Olanzapine"], "maudsley")
    + R("moderate", ["Chlorpromazine", "Iloperidone", "Haloperidol", "Quetiapine", "Paliperidone", "Risperidone"], "maudsley")
    + [dict(e, group="FGA") for e in R("moderate", FGA_GROUP, "maudsley")]
    + R("moderate", ["Sertindole"], "maudsley", outside=True)
    + R("low", ["Amisulpride", "Aripiprazole", "Asenapine", "Brexpiprazole", "Cariprazine", "Lumateperone", "Lurasidone", "Sulpiride", "Trifluoperazine", "Ziprasidone"], "maudsley")
    # Other classes: K&S Table 27.4-5 (+++ high, ++ moderate, + low, 0 neutral, - loss)
    + R("moderate", ["Paroxetine", "Carbamazepine"], "ks")
    + R("moderate", ["Divalproex", "Lithium"], "ks", outside=True)
    + R("low", ["Mirtazapine", "Trazodone", "Fluoxetine", "Citalopram", "Escitalopram", "Sertraline", "Duloxetine"], "ks")
    + R("low", ["Imipramine", "Amitriptyline"], "ks", outside=True)
    + R("minimal", ["Fluvoxamine", "Venlafaxine"], "ks")
    + R("minimal", ["Lamotrigine"], "ks", outside=True)
    + R("loss", ["Bupropion"], "ks")
    + R("loss", ["Topiramate", "Zonisamide"], "ks", outside=True)
)

ANTIDEPRESSANTS = {"Paroxetine", "Mirtazapine", "Trazodone", "Fluoxetine", "Citalopram", "Escitalopram", "Sertraline", "Duloxetine", "Imipramine", "Amitriptyline", "Fluvoxamine", "Venlafaxine", "Bupropion"}
MOOD = {"Carbamazepine", "Divalproex", "Lithium", "Lamotrigine", "Topiramate", "Zonisamide"}
names = {v: k for k, v in drugs.items()}
for e in ratings:
    n = e.get("name") or names[e["drug"]]
    e["class"] = "antidepressants" if n in ANTIDEPRESSANTS else "moodStabilisers" if n in MOOD else "antipsychotics"

topic = {
    "id": "weight-gain",
    "title": "Psychotropic-induced weight gain",
    "summary": "Which psychotropics cause weight gain, how to monitor it, and when to start metformin or an obesity medication.",
    "status": "draft",
    "lastReviewed": "2026-10-06",
    "reviewer": "Dr. Shubham Chauhan",
    "markers": "Text in [verify] still needs checking against the source. Remove the tag once checked.",
    "keyPoints": [
        "About **three-quarters** of people with psychosis have **overweight or obesity**, and up to **80%** in a first episode gain **≥7%** of body weight within a year {carolan}.",
        "**Choice of antipsychotic** is the most important risk factor. Clozapine and olanzapine carry the highest risk {maudsley,carolan}.",
        "Give **diet and exercise** advice to everyone **from the day of prescribing** {ks,carolan}.",
        "**Metformin:** start with olanzapine or clozapine; with quetiapine, risperidone or paliperidone if there is a cardiometabolic risk factor or age 10–25; with **any** antipsychotic if weight rises **>3% in the first year** {carolan}.",
    ],
    "clinicalFeatures": {
        "definition": "Clinically significant weight gain is a rise of **≥7% from baseline body weight** {carolan}. Weight gain comes from more calorie intake, more appetite and a slower metabolism {ks}.",
        "course": {
            "onset": "Rapid in the **first weeks**; the first year is critical {carolan}",
            "driver": "**Choice of drug**, the strongest baseline factor {carolan}",
            "reversible": "Partly. Switching drug gives about **−1.5 kg** on average {carolan}",
        },
        "consequences": "Obesity doubles the risk of all-cause death, coronary heart disease, stroke and type 2 diabetes. Each 1 kg gained raises cardiovascular risk by about 3.1%. Weight gain is a leading cause of distress, and people with obesity are 2.5 times more likely to stop their medicine {carolan}.",
        "thresholds": [
            {"measure": "BMI, ethnicity", "value": "Use a lower BMI threshold (**>23**) for South Asian, Chinese, Black African and African-Caribbean people {carolan}"},
            {"measure": "Central adiposity", "value": "Waist-to-height ratio **≥0.5** {ada2026}"},
            {"measure": "Prediabetes", "value": "HbA1c **42–47 mmol/mol** (6.0–6.4%) or fasting glucose **6.1–6.9 mmol/L** (110–125 mg/dL) {carolan}"},
        ],
    },
    "riskFactors": [
        "**Choice of antipsychotic:** the most important non-genetic factor {carolan}",
        "**Younger age:** children and adolescents gain up to twice as much as adults {carolan}",
        "**First episode or antipsychotic-naive:** 3–4 times more weight gain {carolan}",
        "**Low or normal baseline BMI** {carolan}",
        "**Early gain in weight or BMI:** the strongest predictor of long-term gain {carolan}",
        "**Increased appetite early in treatment** {carolan}",
    ],
    "drugsImplicated": {
        "note": "Antipsychotics {maudsley}; other drugs {ks}. Drugs not shown are not rated in these sources.",
        "groupNote": "First-generation antipsychotics other than chlorpromazine and haloperidol have little individual data; they are rated moderate as a group {maudsley}.",
    },
    "drugClasses": {"antipsychotics": "Antipsychotics", "antidepressants": "Antidepressants", "moodStabilisers": "Mood stabilisers and anticonvulsants"},
    "ratingScale": {"high": "High", "moderate": "Moderate", "low": "Low", "minimal": "Weight-neutral", "loss": "Weight loss"},
    "drugRatings": ratings,
    "monitoring": {
        "sources": {"maudsley": "Maudsley {maudsley}", "adaapa": "ADA/APA {adaapa}"},
        "rows": [
            {"check": "Weight, BMI, waist", "maudsley": "Baseline, frequently for 3 months, then yearly. Clozapine, olanzapine: 3-monthly in year 1.", "adaapa": "Baseline, 4, 8 and 12 weeks, then quarterly. Waist: baseline, then yearly."},
            {"check": "Blood pressure", "maudsley": "Baseline, then frequently during titration and dose changes.", "adaapa": "Baseline, 12 weeks, then yearly."},
            {"check": "Fasting glucose or HbA1c", "maudsley": "Baseline, 4–6 months, then yearly. Clozapine, olanzapine, chlorpromazine: baseline, 1 month, then 4–6-monthly.", "adaapa": "Baseline, 12 weeks, then yearly."},
            {"check": "Fasting lipids", "maudsley": "Baseline, 3 months, then yearly. Clozapine, olanzapine: 3-monthly in year 1.", "adaapa": "Baseline, 12 weeks, then every 5 years if normal."},
        ],
        "ifAbnormal": "If results are abnormal: lifestyle advice, consider changing the antipsychotic, and start a statin or refer as needed {maudsley}.",
    },
    "management": {
        "steps": [
            {"step": "Everyone", "items": [
                "Give **diet and exercise** advice when prescribing, and continue it throughout {ks,carolan}.",
                "Choose the **lowest-risk antipsychotic** that suits the patient, especially if BMI is already raised {ks,carolan}.",
                "Avoid other **weight-promoting medicines** where possible {ada2026}.",
            ]},
            {"step": "Decide on metformin", "items": ["Use the **flowchart** below at the start of an antipsychotic or a switch {carolan}."]},
            {"step": "Review the antipsychotic", "items": [
                "**Switching** or lowering the dose: about **−1.5 kg** (95% CI −2.03 to −0.98) versus staying on the same drug. Clinical significance is uncertain, and switching is not possible for some, e.g. on clozapine {carolan}.",
                "**Adjunctive aripiprazole** (5–15 mg/day) added to clozapine gives modest weight loss {fleischhacker}.",
            ]},
            {"step": "Treat obesity", "items": [
                "Match treatment to **BMI class** and offer an **FDA-approved obesity medication** where indicated (below) {ks,ada2026}.",
            ]},
        ],
        "flowchart": {
            "appliesTo": "At the start of an antipsychotic, or a switch from one to another {carolan}",
            "groups": [
                {"risk": "High risk", "drugs": "Olanzapine, clozapine (not first line)", "condition": "No extra criteria", "action": "Start metformin with the antipsychotic"},
                {"risk": "Medium risk", "drugs": "Quetiapine, paliperidone, risperidone", "condition": "Any of: hypertension, dyslipidaemia, diabetes, prediabetes, BMI >25 (adjust for ethnicity), or age 10–25", "action": "Start metformin with the antipsychotic"},
                {"risk": "Lower risk", "drugs": "All other antipsychotics", "condition": ">3% weight gain at any time in the first year (60 kg → 1.8 kg; 70 kg → 2.1 kg; 80 kg → 2.4 kg; 90 kg → 2.7 kg). Young people: >3% outside their growth trajectory.", "action": "Start metformin"},
                {"risk": "Established obesity", "drugs": "Any antipsychotic", "condition": "BMI ≥30, or 27–30 with hypertension, dyslipidaemia, diabetes, prediabetes or obstructive sleep apnoea", "action": "Start a GLP-1 agonist; metformin if not possible"},
            ],
            "always": "Diet and exercise for everyone, continued alongside metformin {carolan}.",
        },
        "metformin": {
            "effect": "Prevents about **3–4 kg** of gain when started with the antipsychotic; about **3 kg** loss in established gain {carolan}.",
            "howItWorks": "Lowers appetite and liver glucose output and improves insulin response. It does not stimulate insulin secretion, so it does not cause hypoglycaemia {carolan}.",
            "before": "Check **renal function (eGFR)** {carolan}.",
            "titration": [
                {"week": "1", "morning": "500 mg", "evening": "—"},
                {"week": "2", "morning": "500 mg", "evening": "500 mg"},
                {"week": "4", "morning": "1 g", "evening": "500 mg"},
                {"week": "6", "morning": "1 g", "evening": "1 g"},
            ],
            "tips": [
                "Take with or after food. Target **1–2 g/day** {carolan}.",
                "Check efficacy at weeks 2 and 4 {carolan}.",
                "If GI side effects persist, use **slow-release once daily** {carolan}.",
                "**eGFR 30–44:** maximum **1 g/day** {carolan}.",
            ],
            "sideEffects": [
                {"frequency": "Under 1 in 10", "effects": "Transient nausea, vomiting, diarrhoea, abdominal pain, loss of appetite; vitamin B12 deficiency"},
                {"frequency": "Under 1 in 100", "effects": "Taste disturbance"},
                {"frequency": "Under 1 in 10,000", "effects": "Lactic acidosis; abnormal liver tests or hepatitis; skin reactions"},
            ],
            "avoid": [
                "Acute metabolic acidosis",
                "Severe renal failure (**eGFR <30**)",
                "Hepatic insufficiency",
                "Acute physical illness, or harmful alcohol use (**AUDIT ≥8**)",
            ],
            "monitor": [
                "Weight and BMI",
                "Symptoms of lactic acidosis: breathlessness, muscle cramps, abdominal pain, hypothermia, weakness",
                "Liver tests and HbA1c **yearly**",
                "Renal function **yearly**; 6-monthly if over 75 or on NSAIDs, ACE inhibitors, ARBs or diuretics",
                "Vitamin B12 **yearly**; 6-monthly if vegan, after bariatric surgery, on a PPI or colchicine, older, or with malabsorption",
            ],
            "stop": [
                "Suspected lactic acidosis, or risk of it: dehydration, acute alcohol intoxication, decompensated heart failure, respiratory failure, recent MI, shock, severe infection",
                "Before or at iodinated contrast; restart at least **48 h** after",
                "eGFR falls below **30**",
                "BMI below **20**",
                "**Sick-day rule:** stop if systemically unwell, restart when well",
                "The antipsychotic is stopped",
            ],
            "cite": "{carolan}",
        },
        "obesityMedications": {
            "intro": "FDA-approved obesity medications, with lifestyle change. Weight loss shown is beyond placebo {ada2026}.",
            "rows": [
                {"drug": "Tirzepatide", "loss": "16.2%", "dose": "2.5 mg → 15 mg weekly (SC)", "avoid": "Severe GI disease; personal or family history of medullary thyroid carcinoma or MEN2. Reduces oral contraceptive efficacy."},
                {"drug": "Semaglutide", "loss": "11.9%", "dose": "0.25 mg → 2.4 mg weekly (SC)", "avoid": "Severe GI disease; personal or family history of medullary thyroid carcinoma or MEN2"},
                {"drug": "Phentermine-topiramate", "loss": "8.8%", "dose": "3.75/23 mg → 15/92 mg daily", "avoid": "Cardiovascular disease, uncontrolled hypertension, glaucoma, hyperthyroidism"},
                {"drug": "Naltrexone-bupropion", "loss": "4.8%", "dose": "8/90 mg tablets → 2 tablets twice daily", "avoid": "Uncontrolled hypertension, seizures, glaucoma, eating disorders, substance use disorder, chronic opioid use"},
                {"drug": "Liraglutide", "loss": "4.5%", "dose": "0.6 mg → 3.0 mg daily (SC)", "avoid": "Severe GI disease; personal or family history of medullary thyroid carcinoma or MEN2"},
                {"drug": "Phentermine", "loss": "3.6%", "dose": "Up to 37.5 mg daily", "avoid": "Cardiovascular disease, uncontrolled hypertension, glaucoma, hyperthyroidism, substance use disorder, agitated states"},
                {"drug": "Orlistat", "loss": "3.1%", "dose": "120 mg three times daily", "avoid": "Malabsorption, cholestasis"},
            ],
            "goals": [
                "**≥5%** sustained loss gives meaningful health benefit; **≥10%** for most obesity-related diseases; **≥15%** in some {ada2026}.",
                "Follow up **monthly for 3 months**, then **3-monthly** in year 1, then **6-monthly** {ada2026}.",
                "If **≥5%** is lost by 3 months, continue long term; stopping usually leads to regain {ada2026}.",
                "Not in pregnancy, when trying to conceive, or when breastfeeding {ada2026}.",
                "GLP-1 agonists in people with overweight or obesity, including antipsychotic-induced: about **−6 kg** (95% CI −10.8 to −1.36) {carolan}.",
            ],
        },
        "otherOptions": [
            {"option": "Olanzapine + samidorphan", "notes": "≥10% weight gain in **17.8% vs 29.8%** on olanzapine alone at 24 weeks {enlighten2}."},
        ],
        "bmiClasses": {
            "rows": [
                {"cls": "Underweight", "bmi": "<18.5", "treatment": "Nutrition or eating disorder treatment"},
                {"cls": "Normal", "bmi": "18.5–24.9", "treatment": "Maintenance"},
                {"cls": "Overweight", "bmi": "25–29.9", "treatment": "Behavioural weight management"},
                {"cls": "Obese class I", "bmi": "30–34.9", "treatment": "Behavioural + medical weight management"},
                {"cls": "Obese class II", "bmi": "35–39.9 (with comorbidities)", "treatment": "Behavioural + medical weight management, or behavioural management + surgery"},
                {"cls": "Obese class III", "bmi": ">40", "treatment": "Behavioural weight management + surgery"},
            ],
            "cite": "{ks}",
        },
    },
    "mechanism": {
        "intro": "Clozapine, olanzapine, quetiapine and mirtazapine block both **H1 and 5-HT2C** receptors {ks}.",
        "diagrams": [
            {
                "title": "Appetite: H1 and 5-HT2C blockade",
                "cite": "{ks}",
                "start": "Psychotropic with H1 and/or 5-HT2C blocking activity",
                "branches": [
                    {"head": "H1 blockade", "items": ["Less central satiety signalling", "More hypothalamic AMPK activity, which promotes feeding", "Sedation, so less spontaneous activity"]},
                    {"head": "5-HT2C blockade", "items": ["Weaker appetite suppression through POMC neurons"]},
                ],
                "join": ["More hunger and food intake, less energy spent on movement", "Sustained energy surplus", "More fat storage → weight gain"],
            },
            {
                "title": "Leptin resistance",
                "cite": "{ks}",
                "context": "Normally, leptin from fat cells activates POMC/CART neurons (α-MSH → MC4 receptors → less appetite) and inhibits NPY/AgRP neurons (less hunger).",
                "start": "Psychotropic exposure and increasing body fat",
                "startUncertain": True,
                "branches": [
                    {"head": "Reduced hypothalamic response to leptin: leptin resistance", "items": ["POMC satiety pathway under-activated", "NPY/AgRP hunger pathway under-suppressed"]},
                ],
                "join": ["Weaker satiety and persistent hunger", "More food intake → further fat gain, which worsens leptin resistance"],
            },
            {
                "title": "Peripheral metabolic effects",
                "cite": "{ks}",
                "start": "Certain antipsychotics, particularly clozapine and olanzapine",
                "branches": [
                    {"head": "Pancreatic β-cell M3 blockade", "items": ["Less acetylcholine-driven insulin secretion", "Weaker insulin response"]},
                    {"head": "Weight-independent loss of insulin sensitivity", "items": ["Muscle, liver and fat respond less to insulin; worsened by rising body fat"]},
                    {"head": "Altered lipid handling", "uncertain": True, "items": ["Dyslipidaemia, including raised triglycerides"]},
                ],
                "join": ["Poorer glucose control → hyperglycaemia and diabetes risk, sometimes before weight changes"],
            },
            {
                "title": "Gut microbiome",
                "cite": "{morgan}",
                "note": "Evidence is mostly from animal studies.",
                "start": "Antipsychotic exposure → gut dysbiosis",
                "branches": [
                    {"head": "Altered microbial metabolites, including short-chain fatty acids", "uncertain": True},
                    {"head": "Altered gut–brain signalling", "uncertain": True},
                    {"head": "Possible change in energy extracted from food", "uncertain": True},
                ],
                "join": ["Changes in metabolism and appetite regulation", "More energy available for storage → weight gain"],
                "joinUncertain": True,
            },
        ],
        "metformin": "Metformin may also reduce antipsychotic-induced metabolic dysfunction through the gut–brain axis; this evidence is emerging {ks}.",
    },
    "differentialDiagnosis": [
        "**Hypothyroidism:** check TSH {ada2026}",
        "**Pregnancy:** pregnancy test where relevant {ada2026}",
        "**Other weight-promoting medicines:** insulin, sulfonylureas, pioglitazone, beta-blockers, glucocorticoids, progestogen contraception, sedating antihistamines {ada2026}",
        "**Cushing's syndrome**",
        "**Fluid retention** rather than fat gain",
        "**Recovery of appetite** as depression or psychosis improves",
        "**Lifestyle change:** less activity, diet, stopping smoking, alcohol",
    ],
    "keyEvidence": [
        {"study": "Allison 1999", "finding": "Mean gain at **10 weeks**: clozapine ~4.5 kg, olanzapine ~4.2 kg, risperidone ~2.1 kg, haloperidol ~1.1 kg, ziprasidone ~0.04 kg {allison}."},
        {"study": "CATIE", "finding": "**30% on olanzapine** gained ≥7% of body weight, versus 7–16% on the other drugs {catie}."},
        {"study": "CAFE", "finding": "Early psychosis, 52 weeks: ≥7% gain in **80%** on olanzapine, **58%** on risperidone, **50%** on quetiapine {cafe}."},
        {"study": "Metformin, 4 RCTs", "finding": "Started with risperidone or olanzapine: **−4.03 kg** (95% CI −5.78 to −2.28); low certainty {carolan}."},
        {"study": "Metformin, 14 RCTs", "finding": "Started with an antipsychotic: **−3.12 kg** (95% CI −4.22 to −2.01); very low certainty {carolan}."},
        {"study": "Metformin with clozapine", "finding": "Cohort of 396: **−3.14 kg** at 6 months and **−5.38 kg** at 12 months; low certainty {carolan}."},
    ],
    "examPearls": [
        "Clinically significant weight gain is **≥7% of baseline weight** {carolan}.",
        "**H1 + 5-HT2C** blockers cause the most gain: clozapine, olanzapine, quetiapine, mirtazapine {ks}.",
        "**Bupropion** may be the only antidepressant that causes weight loss {ks}.",
        "**Paroxetine** causes the most gain among SSRIs; TCAs and MAOIs cause more than SSRIs {ks}.",
        "Among mood stabilisers, **divalproex, carbamazepine and lithium** cause the most gain; lamotrigine is weight-neutral; topiramate and zonisamide cause weight loss {ks}.",
        "Insulin resistance can develop **independently of weight gain** {ks}.",
    ],
    "selfTest": {
        "question": "A 70 kg man starts aripiprazole for schizophrenia. He has no cardiometabolic risk factors. Four months later he weighs 72.6 kg. What is the best next step?",
        "options": [
            {"text": "Recheck at 12 months; aripiprazole is low risk", "correct": False},
            {"text": "Start metformin and continue diet and exercise advice", "correct": True},
            {"text": "Start a GLP-1 agonist", "correct": False},
            {"text": "Stop aripiprazole abruptly", "correct": False},
        ],
        "explanation": "He has gained 2.6 kg (3.7%), more than the >3% threshold (2.1 kg at 70 kg) in the first year, so the guideline recommends metformin even with a lower-risk antipsychotic. His BMI does not meet the GLP-1 criteria {carolan}.",
    },
}

# Number citations in order of first appearance.
order = []


def number(s):
    def rep(m):
        keys = [k.strip() for k in m.group(1).split(",")]
        nums = []
        for k in keys:
            assert k in REFS, k
            if k not in order:
                order.append(k)
            nums.append(order.index(k) + 1)
        return "[" + ",".join(str(n) for n in nums) + "]"
    return re.sub(r"\{([a-z0-9]+(?:,[a-z0-9]+)*)\}", rep, s)


def walk(x):
    if isinstance(x, dict):
        return {k: walk(v) for k, v in x.items()}
    if isinstance(x, list):
        return [walk(v) for v in x]
    if isinstance(x, str):
        return number(x)
    return x


topic = walk(topic)
# Rating sources are shown through the drugsImplicated note; map them to numbers too.
for r in topic["drugRatings"]:
    r["source"] = order.index(r["source"]) + 1
topic["references"] = [REFS[k] for k in order]
unused = set(REFS) - set(order)
assert not unused, unused

open("server/data/adverse-effects/weight-gain.json", "w").write(json.dumps(topic, indent=2, ensure_ascii=False) + "\n")
print("references:", len(order), "ratings:", len(ratings))
for i, k in enumerate(order, 1):
    print(i, k)
