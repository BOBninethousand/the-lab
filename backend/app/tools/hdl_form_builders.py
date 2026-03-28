"""
HDL Form Builders — Generate realistic health/longevity form data for Lab agents.

Each builder takes a persona config and submission history, then uses the LLM
to generate varied but progression-consistent form data matching the exact
structure expected by the HDL WordPress endpoints.

Install: Copy to backend/app/tools/hdl_form_builders.py in The Lab repo.
"""

import math
import random
import json
from datetime import datetime
from typing import Optional


# ---------------------------------------------------------------------------
# Longevity form calculations (replicate JS from longevity-form-raw.php)
# ---------------------------------------------------------------------------

def calculate_bmi(weight_kg: float, height_cm: float) -> tuple[float, str]:
    """Calculate BMI and category."""
    height_m = height_cm / 100
    bmi = round(weight_kg / (height_m ** 2), 1)
    if bmi < 18.5:
        category = "Underweight"
    elif bmi < 25:
        category = "Normal"
    elif bmi < 30:
        category = "Overweight"
    else:
        category = "Obese"
    return bmi, category


def calculate_whr(waist_cm: float, hip_cm: float, gender: str) -> tuple[float, str]:
    """Calculate waist-hip ratio and risk category."""
    whr = round(waist_cm / hip_cm, 2)
    if gender.lower() == "male":
        if whr < 0.90:
            category = "Low Risk"
        elif whr < 1.00:
            category = "Moderate Risk"
        else:
            category = "High Risk"
    else:
        if whr < 0.80:
            category = "Low Risk"
        elif whr < 0.85:
            category = "Moderate Risk"
        else:
            category = "High Risk"
    return whr, category


def calculate_biological_age(chronological_age: int, scores: dict) -> tuple[float, float, float]:
    """
    Calculate biological age, age shift, and aging rate from lifestyle scores.

    NOTE: This is a SIMPLIFIED approximation of the production JS formula.
    The production calculateAgeShift() in longevity-form-raw.php uses per-metric
    weights (0.24-0.8), a center point of 3.5, and age-dependent scaling.
    This simplified version uses an unweighted average with center point of 3.
    The difference is acceptable for Lab test data (all tagged source='the_lab').
    If exact parity with production is needed, port the JS weights and age scaling.
    """
    score_keys = [
        "physicalActivity", "sleepDuration", "sleepQuality", "stressLevels",
        "socialConnections", "dietQuality", "alcoholConsumption", "smokingStatus",
        "cognitiveActivity", "sunlightExposure", "supplementIntake", "dailyHydration",
        "sitStand", "breathHold", "balance", "skinElasticity",
    ]
    valid_scores = [float(scores[k]) for k in score_keys if k in scores and scores[k] is not None]

    if not valid_scores:
        return float(chronological_age), 0.0, 1.0

    avg_score = sum(valid_scores) / len(valid_scores)

    # Map: 0→+15, 3→0, 5→-10 (same as JS calculateBiologicalAge)
    if avg_score <= 3:
        age_shift = round(15 * (1 - avg_score / 3), 1)
    else:
        age_shift = round(-10 * (avg_score - 3) / 2, 1)

    biological_age = round(chronological_age + age_shift, 1)
    aging_rate = round(biological_age / chronological_age, 2) if chronological_age > 0 else 1.0

    return biological_age, age_shift, aging_rate


def calculate_lifestyle_score(scores: dict) -> float:
    """Calculate average lifestyle score from the 16 metrics."""
    lifestyle_keys = [
        "physicalActivity", "sleepDuration", "sleepQuality", "stressLevels",
        "socialConnections", "dietQuality", "alcoholConsumption", "smokingStatus",
        "cognitiveActivity", "sunlightExposure", "supplementIntake", "dailyHydration",
        "sitStand", "breathHold", "balance", "skinElasticity",
    ]
    valid = [float(scores[k]) for k in lifestyle_keys if k in scores and scores[k] is not None]
    return round(sum(valid) / len(valid), 1) if valid else 3.0


# ---------------------------------------------------------------------------
# Persona-based data generation
# ---------------------------------------------------------------------------

def _apply_variance(base_value: float, variance: list[float]) -> float:
    """Apply random variance within bounds."""
    return round(base_value + random.uniform(variance[0], variance[1]), 1)


def _apply_progression(base_value: float, direction: str, change_rate: str, submission_count: int) -> float:
    """Apply gradual progression based on trajectory rules."""
    rate_map = {"gradual": 0.02, "moderate": 0.05, "rapid": 0.08}
    rate = rate_map.get(change_rate, 0.03)
    delta = rate * submission_count

    if direction == "improving":
        return base_value + delta
    elif direction == "declining":
        return base_value - delta
    return base_value


def build_longevity_form_data(persona: dict, submission_history: list = None) -> dict:
    """
    Build a complete longevity form payload matching the HDL endpoint structure.

    Args:
        persona: Agent persona config (from hdl_personas/<name>.json)
        submission_history: List of previous submission results (for progression)

    Returns:
        Dict ready to pass as complete_data to submit_longevity_assessment()
    """
    history = submission_history or []
    submission_count = len(history)
    base = persona["base_profile"]
    prog = persona.get("progression", {})
    var = persona.get("variance", {})

    # Apply progression to weight
    weight = persona["weight_kg"]
    if prog.get("direction") == "improving" and "weight" in str(prog.get("focus_areas", [])):
        weight -= 0.3 * (submission_count // 2)  # -0.3kg every 2 submissions
    weight = _apply_variance(weight, var.get("weight_kg", [-0.5, 0.5]))
    weight = max(45, weight)  # sanity floor

    height = persona["height_cm"]
    bmi, bmi_category = calculate_bmi(weight, height)

    # Waist/hip with variance
    waist = _apply_variance(persona.get("waist_cm", 85), var.get("waist_cm", [-1, 1]))
    hip = _apply_variance(persona.get("hip_cm", 98), var.get("hip_cm", [-1, 1]))
    whr, whr_category = calculate_whr(waist, hip, persona["gender"])

    # Generate lifestyle scores (0-5 scale) with progression
    score_bases = base.get("scores", {})
    scores = {}
    score_keys = [
        "physicalActivity", "sleepDuration", "sleepQuality", "stressLevels",
        "socialConnections", "dietQuality", "alcoholConsumption", "smokingStatus",
        "cognitiveActivity", "sunlightExposure", "supplementIntake", "dailyHydration",
        "sitStand", "breathHold", "balance", "skinElasticity",
    ]
    focus_areas = prog.get("focus_areas", [])

    for key in score_keys:
        base_score = score_bases.get(key, 3.0)
        # Apply progression to focus areas
        if key.lower() in [f.lower() for f in focus_areas]:
            base_score = _apply_progression(base_score, prog.get("direction", "stable"), prog.get("change_rate", "gradual"), submission_count)
        # Add noise
        scores[key] = max(0, min(5, round(base_score + random.uniform(-0.3, 0.3), 1)))

    # Blood pressure and heart rate scores (0-5)
    bp_sys = _apply_variance(persona.get("bp_systolic", 120), var.get("bp_systolic", [-3, 3]))
    bp_dia = _apply_variance(persona.get("bp_diastolic", 78), var.get("bp_diastolic", [-2, 2]))
    rhr = _apply_variance(persona.get("resting_heart_rate", 72), var.get("resting_heart_rate", [-2, 2]))

    # Map BP to 0-5 score (120/80 = optimal = 4, 140/90 = high = 2, 160/100 = very high = 1)
    if bp_sys < 120:
        scores["bloodPressureScore"] = 4.5
    elif bp_sys < 130:
        scores["bloodPressureScore"] = 3.5
    elif bp_sys < 140:
        scores["bloodPressureScore"] = 2.5
    else:
        scores["bloodPressureScore"] = 1.5

    # Map HR to 0-5 score (60-70 = excellent = 4.5, 70-80 = good = 3.5, 80+ = fair = 2.5)
    if rhr < 60:
        scores["heartRateScore"] = 5.0
    elif rhr < 70:
        scores["heartRateScore"] = 4.5
    elif rhr < 80:
        scores["heartRateScore"] = 3.5
    else:
        scores["heartRateScore"] = 2.5

    # Calculated fields
    biological_age, age_shift, aging_rate = calculate_biological_age(persona["age"], scores)
    lifestyle_score = calculate_lifestyle_score(scores)
    overall_health_pct = round(lifestyle_score / 5 * 100, 1)

    # Build answer text descriptions
    answers_text = {}
    score_labels = {
        0: "Very poor", 1: "Poor", 2: "Below average",
        3: "Average", 4: "Good", 5: "Excellent",
    }
    for key in score_keys:
        val = scores[key]
        label = score_labels.get(round(val), "Moderate")
        answers_text[key] = f"{label} ({val}/5)"

    # Build the complete payload
    return {
        "fullName": persona["name"],
        "email": persona["email"],
        "age": persona["age"],
        "gender": persona["gender"],
        "height": height,
        "weight": weight,
        "waistCircumference": waist,
        "hipCircumference": hip,
        "bmi": bmi,
        "bmiCategory": bmi_category,
        "whr": whr,
        "whrCategory": whr_category,
        "bpSystolic": round(bp_sys),
        "bpDiastolic": round(bp_dia),
        "restingHeartRateBpm": round(rhr),
        "biologicalAge": biological_age,
        "ageShift": age_shift,
        "agingRate": aging_rate,
        "lifestyle_score_value": lifestyle_score,
        "overallHealthPercentage": overall_health_pct,
        "overall_health_percent": overall_health_pct,
        "overallHealthScore": round(overall_health_pct),
        "scores": scores,
        "answersText": answers_text,
        "healthChallenges": base.get("health_challenges", ""),
        "healthGoals": base.get("health_goals", ""),
        "practitionerEmail": persona.get("practitioner_email", "260128vm+practitioner@gmail.com"),
        "entryDate": datetime.now().strftime("%Y-%m-%d"),
        # Chart URLs — empty for Lab submissions (Make.com generates charts)
        "radarChartImage": "",
        "bodyCompChartImage": "",
        "agingRateChartImage": "",
        "independence_chart_image": "",
        "has_independence_chart_image": False,
        # AI results — null for Lab (Make.com generates AI content)
        "ai_results": None,
        "ai_generated_by": "make.com",
        # Metadata
        "metadata": {
            "source": "the_lab",
            "agent_name": persona["name"],
            "formVersion": "2.1.0",
            "submissionTime": datetime.now().isoformat(),
            "language": {
                "code": "en",
                "name": "English",
                "source": "lab-api",
                "originalLanguage": "en",
                "translationDirection": "en/en",
                "isTranslated": False,
            },
        },
    }


def _health_score_text(value: int, labels: dict) -> str:
    """Map a 1-5 score value to its human-readable label."""
    return labels.get(value, labels.get(3, "Average"))


def _get_bmi_category_score(bmi: float) -> tuple[str, int]:
    """Return BMI category and chart score (1-5)."""
    if bmi < 18.5:
        return "Underweight", 2
    elif bmi < 25:
        return "Normal", 5
    elif bmi < 30:
        return "Overweight", 3
    elif bmi < 35:
        return "Obese Class I", 2
    else:
        return "Obese Class II+", 1


def _get_bp_category(systolic: int) -> tuple[str, int]:
    """Return systolic BP category and score."""
    if systolic < 120:
        return "Optimal", 5
    elif systolic < 130:
        return "Normal", 4
    elif systolic < 140:
        return "High Normal", 3
    elif systolic < 160:
        return "Grade 1 Hypertension", 2
    else:
        return "Grade 2+ Hypertension", 1


def _get_hr_category(hr: int) -> tuple[str, int]:
    """Return resting heart rate category and score."""
    if hr < 60:
        return "Athlete", 5
    elif hr < 70:
        return "Excellent", 5
    elif hr < 80:
        return "Good", 4
    elif hr < 90:
        return "Average", 3
    else:
        return "Below Average", 2


def build_health_form_data(persona: dict, submission_history: list = None) -> dict:
    """
    Build a complete health form payload matching the EXACT structure from
    health-form-raw.php lines 12296-12586. Every field name and nesting level
    must match what Make.com's Health scenario expects.

    Args:
        persona: Agent persona config (from hdl_personas/<name>.json)
        submission_history: Previous submission results

    Returns:
        Dict ready to pass as form_data to submit_health_assessment()
    """
    history = submission_history or []
    submission_count = len(history)
    base = persona["base_profile"]
    prog = persona.get("progression", {})
    var = persona.get("variance", {})
    health = base.get("health_form", {})

    # --- Body metrics with progression ---
    weight = persona["weight_kg"]
    if prog.get("direction") == "improving":
        weight -= 0.2 * submission_count
    weight = round(_apply_variance(weight, var.get("weight_kg", [-0.5, 0.5])), 1)
    weight = max(45, weight)

    height = persona["height_cm"]
    bmi = round(weight / (height / 100) ** 2, 1)
    bmi_category, bmi_score = _get_bmi_category_score(bmi)

    waist = round(_apply_variance(persona.get("waist_cm", 85), var.get("waist_cm", [-1, 1])), 1)
    hip = round(_apply_variance(persona.get("hip_cm", 98), var.get("hip_cm", [-0.5, 0.5])), 1)
    whr = round(waist / hip, 2) if hip > 0 else 0
    whr_category = "Low Risk" if (whr < 0.90 if persona["gender"] == "male" else whr < 0.80) else "Moderate Risk"
    whr_score = 5 if "Low" in whr_category else 3

    bp_sys = round(_apply_variance(persona.get("bp_systolic", 120), var.get("bp_systolic", [-3, 3])))
    bp_dia = round(_apply_variance(persona.get("bp_diastolic", 78), var.get("bp_diastolic", [-2, 2])))
    rhr = round(_apply_variance(persona.get("resting_heart_rate", 72), var.get("resting_heart_rate", [-2, 2])))

    sys_cat, sys_score = _get_bp_category(bp_sys)
    dia_cat, dia_score = _get_bp_category(bp_dia)
    hr_cat, hr_score = _get_hr_category(rhr)

    # --- Fitness scores (1-5 scale, STRING values for Make.com) ---
    fitness_vals = health.get("fitness", {})
    daily_steps_val = str(fitness_vals.get("dailySteps", 3))
    physical_activity_val = str(fitness_vals.get("physicalActivity", 3))
    carry_ability_val = str(fitness_vals.get("carryAbility", 3))
    run_stairs_val = str(fitness_vals.get("runStairs", 3))
    floor_getup_val = str(fitness_vals.get("floorGetUp", 3))
    touch_toes_val = str(fitness_vals.get("touchToes", 3))

    steps_labels = {"1": "Less than 3,000", "2": "3,000-5,000", "3": "5,000-7,000", "4": "7,000-10,000", "5": "More than 10,000"}
    activity_labels = {"1": "Rarely", "2": "1-2 times per week", "3": "3-4 times per week", "4": "5-6 times per week", "5": "Daily"}
    ability_labels = {"1": "Very Difficult", "2": "Somewhat Difficult", "3": "Moderate", "4": "Fairly Easy", "5": "Very Easy"}

    flex_score = (int(floor_getup_val) + int(touch_toes_val)) / 2
    strength_score = int(carry_ability_val)
    zone2_score = (int(daily_steps_val) + int(physical_activity_val)) / 2
    zone5_score = int(run_stairs_val)

    # --- Diet & Lifestyle scores (1-5 scale) ---
    diet_vals = health.get("diet", {})
    diet_quality_val = str(diet_vals.get("dietQuality", 3))
    drink_choice_val = str(diet_vals.get("drinkChoice", 3))
    digestive_discomfort_val = str(diet_vals.get("digestiveDiscomfort", 2))
    digestive_health_val = str(diet_vals.get("digestiveHealth", 4))
    bowel_movements_val = str(diet_vals.get("bowelMovements", 4))
    smoking_val = str(diet_vals.get("smoking", 5))
    alcohol_val = str(diet_vals.get("alcohol", 3))

    diet_labels = {"1": "Very Poor", "2": "Poor", "3": "Average", "4": "Good", "5": "Excellent"}
    drink_labels = {"1": "Mostly sugary drinks", "2": "Mix of drinks", "3": "Mostly water/tea", "4": "Almost all water", "5": "Only water and herbal tea"}
    smoking_labels = {"1": "Daily", "2": "Regularly", "3": "Occasionally", "4": "Former smoker", "5": "Never"}
    alcohol_labels = {"1": "Daily heavy", "2": "4-6 times/week", "3": "2-3 times/week", "4": "Occasionally", "5": "Rarely/Never"}

    # --- Mental Wellbeing scores (1-5 scale) ---
    mental_vals = health.get("mental", {})
    handle_stress_val = str(mental_vals.get("handleStress", 3))
    sleep_quality_val = str(mental_vals.get("sleepQuality", 3))
    concentration_val = str(mental_vals.get("concentration", 3))
    mental_fatigue_val = str(mental_vals.get("mentalFatigue", 3))
    relationship_support_val = str(mental_vals.get("relationshipSupport", 4))
    quality_time_val = str(mental_vals.get("qualityTime", 3))

    mental_labels = {"1": "Very Poor", "2": "Poor", "3": "Average", "4": "Good", "5": "Excellent"}

    # --- Medical Details scores (1-5 scale, 1=significant issues, 5=no issues) ---
    medical_vals = health.get("medical", {})
    current_health_val = str(medical_vals.get("currentHealth", 4))
    longterm_health_val = str(medical_vals.get("longTermHealth", 4))
    family_history_val = str(medical_vals.get("familyHistory", 3))
    recent_issues_val = str(medical_vals.get("recentIssues", 4))
    physical_restrictions_val = str(medical_vals.get("physicalRestrictions", 4))
    current_medications_val = str(medical_vals.get("currentMedications", 4))

    medical_labels = {"1": "Significant issues", "2": "Some concerns", "3": "Minor concerns", "4": "Mostly healthy", "5": "No issues"}

    # --- Calculate section scores (0-100 scale) ---
    body_comp_score = round((bmi_score + whr_score + sys_score + dia_score + hr_score) / 5 * 20, 1)
    fitness_score = round((flex_score + strength_score + zone2_score + zone5_score) / 4 * 20, 1)
    diet_score = round((int(digestive_discomfort_val) + int(digestive_health_val) + int(bowel_movements_val) + int(smoking_val) + int(alcohol_val)) / 5 * 20, 1)
    mental_score = round((int(handle_stress_val) + int(sleep_quality_val) + int(concentration_val) + int(mental_fatigue_val) + int(relationship_support_val) + int(quality_time_val)) / 6 * 20, 1)
    medical_score = round((int(current_health_val) + int(longterm_health_val) + int(family_history_val) + int(recent_issues_val) + int(physical_restrictions_val) + int(current_medications_val)) / 6 * 20, 1)
    overall_score = round((body_comp_score + fitness_score + diet_score + mental_score + medical_score) / 5, 1)

    # --- Interpretation ---
    if overall_score >= 80:
        interp_title, interp_text = "Excellent Health Status", f"Your overall health score of {overall_score}% indicates excellent health across all assessment areas."
    elif overall_score >= 65:
        interp_title, interp_text = "Good Health Status", f"Your overall health score of {overall_score}% indicates good health with some areas for improvement."
    elif overall_score >= 50:
        interp_title, interp_text = "Fair Health Status", f"Your overall health score of {overall_score}% suggests moderate health. Focus on the highlighted improvement areas."
    else:
        interp_title, interp_text = "Needs Attention", f"Your overall health score of {overall_score}% indicates several areas need focused attention for improvement."

    today = datetime.now().strftime("%Y-%m-%d")
    today_display = datetime.now().strftime("%B %d, %Y")

    return {
        "personalInfo": {
            "name": persona["name"],
            "refNickname": "",
            "gender": persona["gender"],
            "age": str(persona["age"]),
            "email": persona["email"],
            "practitionersEmail": persona.get("practitioner_email", "260128vm+practitioner@gmail.com"),
            "healthChallenges": base.get("health_challenges", "Not specified"),
            "healthGoals": base.get("health_goals", "Not specified"),
            "entryDate": today,
            "termsAgreed": True,
            "reportDate": today_display,
        },

        "bodyComposition": {
            "heightCm": str(height),
            "weightKg": str(weight),
            "waistCm": str(waist),
            "hipCm": str(hip),
            "bpSystolic": str(bp_sys),
            "bpDiastolic": str(bp_dia),
            "restingHeartRate": str(rhr),
            "maleBodyFatPercent": str(health.get("bodyFatPercent", "")) if persona["gender"] == "male" else "",
            "maleMuscleMassKg": str(health.get("muscleMassKg", "")) if persona["gender"] == "male" else "",
            "femaleBodyFatPercent": str(health.get("bodyFatPercent", "")) if persona["gender"] == "female" else "",
            "femaleMuscleMassKg": str(health.get("muscleMassKg", "")) if persona["gender"] == "female" else "",
            "menstrualCycleRegularity": "",
            "menstrualCycleRegularityText": "",
            "bmi": bmi,
            "bmiCategory": bmi_category,
            "bmiComment": f"Your BMI of {bmi} falls in the {bmi_category} range.",
            "whr": whr,
            "whrCategory": whr_category,
            "whrComment": f"Your waist-to-hip ratio of {whr} indicates {whr_category}.",
            "systolicCategory": sys_cat,
            "systolicComment": f"Systolic BP of {bp_sys} mmHg is {sys_cat}.",
            "diastolicCategory": dia_cat,
            "diastolicComment": f"Diastolic BP of {bp_dia} mmHg is {dia_cat}.",
            "heartRateCategory": hr_cat,
            "heartRateComment": f"Resting heart rate of {rhr} bpm is {hr_cat}.",
            "scores": {
                "bmi": bmi_score,
                "whr": whr_score,
                "systolic": sys_score,
                "diastolic": dia_score,
                "heartRate": hr_score,
            },
            "chartImage": "",
            "summaryChartImage": "",
        },

        "fitness": {
            "physicalIssues": health.get("physicalIssues", "None reported"),
            "dailyStepsValue": daily_steps_val,
            "dailyStepsText": steps_labels.get(daily_steps_val, "5,000-7,000"),
            "physicalActivityValue": physical_activity_val,
            "physicalActivityText": activity_labels.get(physical_activity_val, "3-4 times per week"),
            "carryAbilityValue": carry_ability_val,
            "carryAbilityText": ability_labels.get(carry_ability_val, "Moderate"),
            "runStairsValue": run_stairs_val,
            "runStairsText": ability_labels.get(run_stairs_val, "Moderate"),
            "floorGetUpValue": floor_getup_val,
            "floorGetUpText": ability_labels.get(floor_getup_val, "Moderate"),
            "touchToesValue": touch_toes_val,
            "touchToesText": ability_labels.get(touch_toes_val, "Moderate"),
            "scores": {
                "flexibility": flex_score,
                "strength": strength_score,
                "zone2": zone2_score,
                "zone5": zone5_score,
            },
            "chartImage": "",
            "summaryChartImage": "",
        },

        "dietLifestyle": {
            "dietQualityValue": diet_quality_val,
            "dietQualityText": diet_labels.get(diet_quality_val, "Average"),
            "drinkChoiceValue": drink_choice_val,
            "drinkChoiceText": drink_labels.get(drink_choice_val, "Mostly water/tea"),
            "supplements": base.get("medications", "None"),
            "digestiveDiscomfortValue": digestive_discomfort_val,
            "digestiveDiscomfortText": "Occasional" if int(digestive_discomfort_val) <= 3 else "Rarely",
            "digestiveHealthValue": digestive_health_val,
            "digestiveHealthText": diet_labels.get(digestive_health_val, "Good"),
            "bowelMovementsValue": bowel_movements_val,
            "bowelMovementsText": diet_labels.get(bowel_movements_val, "Good"),
            "smokingValue": smoking_val,
            "smokingText": smoking_labels.get(smoking_val, "Never"),
            "alcoholValue": alcohol_val,
            "alcoholText": alcohol_labels.get(alcohol_val, "Occasionally"),
            "recreationalDrugs": "None",
            "comments": "",
            "eatingHabits": "",
            "scores": {
                "digestiveDiscomfort": int(digestive_discomfort_val),
                "digestiveHealth": int(digestive_health_val),
                "bowelMovements": int(bowel_movements_val),
                "smoking": int(smoking_val),
                "alcohol": int(alcohol_val),
            },
            "chartImage": "",
            "summaryChartImage": "",
        },

        "mentalWellbeing": {
            "handleStressValue": handle_stress_val,
            "handleStressText": mental_labels.get(handle_stress_val, "Average"),
            "sleepQualityValue": sleep_quality_val,
            "sleepQualityText": mental_labels.get(sleep_quality_val, "Average"),
            "concentrationValue": concentration_val,
            "concentrationText": mental_labels.get(concentration_val, "Average"),
            "mentalFatigueValue": mental_fatigue_val,
            "mentalFatigueText": mental_labels.get(mental_fatigue_val, "Average"),
            "relationshipSupportValue": relationship_support_val,
            "relationshipSupportText": mental_labels.get(relationship_support_val, "Good"),
            "qualityTimeValue": quality_time_val,
            "qualityTimeText": mental_labels.get(quality_time_val, "Average"),
            "maleEmotionalExpressionValue": str(mental_vals.get("emotionalExpression", 3)) if persona["gender"] == "male" else "",
            "maleEmotionalExpressionText": mental_labels.get(str(mental_vals.get("emotionalExpression", 3)), "Average") if persona["gender"] == "male" else "",
            "femaleHormonalMoodChangesValue": str(mental_vals.get("hormonalMoodChanges", 3)) if persona["gender"] == "female" else "",
            "femaleHormonalMoodChangesText": mental_labels.get(str(mental_vals.get("hormonalMoodChanges", 3)), "Average") if persona["gender"] == "female" else "",
            "scores": {
                "handleStress": int(handle_stress_val),
                "sleepQuality": int(sleep_quality_val),
                "concentration": int(concentration_val),
                "mentalFatigue": int(mental_fatigue_val),
                "relationshipSupport": int(relationship_support_val),
                "qualityTime": int(quality_time_val),
            },
            "chartImage": "",
            "summaryChartImage": "",
        },

        "medicalDetails": {
            "currentHealthConditionValue": current_health_val,
            "currentHealthConditionText": medical_labels.get(current_health_val, "Mostly healthy"),
            "longTermHealthConditionValue": longterm_health_val,
            "longTermHealthConditionText": medical_labels.get(longterm_health_val, "Mostly healthy"),
            "familyHistoryValue": family_history_val,
            "familyHistoryText": medical_labels.get(family_history_val, "Minor concerns"),
            "recentHealthIssuesValue": recent_issues_val,
            "recentHealthIssuesText": medical_labels.get(recent_issues_val, "Mostly healthy"),
            "physicalRestrictionsValue": physical_restrictions_val,
            "physicalRestrictionsText": medical_labels.get(physical_restrictions_val, "Mostly healthy"),
            "currentMedicationsValue": current_medications_val,
            "currentMedicationsText": medical_labels.get(current_medications_val, "Mostly healthy"),
            "medicationDetails": base.get("medications", "None"),
            "prostateExam": {"value": "", "text": "Not applicable"} if persona["gender"] == "male" else {},
            "mammogram": {"value": "", "text": "Not applicable"} if persona["gender"] == "female" else {},
            "papSmear": {"value": "", "text": "Not applicable"} if persona["gender"] == "female" else {},
            "scores": {
                "currentHealth": int(current_health_val),
                "longTermHealth": int(longterm_health_val),
                "familyHistory": int(family_history_val),
                "recentHealthIssues": int(recent_issues_val),
                "physicalRestrictions": int(physical_restrictions_val),
                "currentMedications": int(current_medications_val),
            },
            "chartImage": "",
            "summaryChartImage": "",
        },

        "genderSpecificHealth": {
            "femaleChecks": [],
            "maleChecks": [],
            "selectedGender": persona["gender"],
            "maleCheckCount": 0,
            "femaleCheckCount": 0,
            "selectedConditions": [],
            "conditionsSummary": "No conditions reported",
        },

        "overallHealth": {
            "scorePercent": f"{overall_score}%",
            "interpretation": {
                "title": interp_title,
                "text": interp_text,
            },
            "breakdown": {
                "bodyComposition": {"score": str(round(body_comp_score)), "percent": f"{body_comp_score}%"},
                "fitness": {"score": str(round(fitness_score)), "percent": f"{fitness_score}%"},
                "dietLifestyle": {"score": str(round(diet_score)), "percent": f"{diet_score}%"},
                "mentalWellbeing": {"score": str(round(mental_score)), "percent": f"{mental_score}%"},
                "medicalDetails": {"score": str(round(medical_score)), "percent": f"{medical_score}%"},
            },
            "scores": {
                "bodyComposition": body_comp_score,
                "fitness": fitness_score,
                "dietLifestyle": diet_score,
                "mentalWellbeing": mental_score,
                "medicalDetails": medical_score,
            },
            "chartImage": "",
        },

        "metadata": {
            "submissionTime": datetime.now().isoformat(),
            "formVersion": "1.3.0",
            "userAgent": "TheLabAgent/1.0 (HealthDataLab Synthetic Testing)",
            "screenSize": "1920x1080",
            "completionTimeSeconds": random.randint(180, 600),
            "language": {
                "code": "en",
                "name": "English",
                "source": "lab-api",
                "originalLanguage": "en",
                "translationDirection": "en/en",
                "isTranslated": False,
            },
            "formLocale": "en-US",
            "timezone": "Asia/Manila",
            "gtranslateDetected": False,
            "currentUrl": "https://healthdatalab.net/health-assessment/",
            "source": "the_lab",
            "agent_name": persona["name"],
        },
    }
