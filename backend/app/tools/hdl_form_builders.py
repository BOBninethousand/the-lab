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


def build_health_form_data(persona: dict, submission_history: list = None) -> dict:
    """
    Build a complete health form payload matching the HDL endpoint structure.

    Args:
        persona: Agent persona config
        submission_history: Previous submission results

    Returns:
        Dict ready to pass as form_data to submit_health_assessment()
    """
    history = submission_history or []
    submission_count = len(history)
    base = persona["base_profile"]
    prog = persona.get("progression", {})
    var = persona.get("variance", {})

    weight = persona["weight_kg"]
    if prog.get("direction") == "improving":
        weight -= 0.2 * submission_count
    weight = _apply_variance(weight, var.get("weight_kg", [-0.5, 0.5]))
    weight = max(45, weight)

    height = persona["height_cm"]
    bmi, bmi_category = calculate_bmi(weight, height)

    # Energy and wellbeing scores (1-10 scale for health form)
    energy = min(10, max(1, round(base.get("energy_level", 6) +
                (0.2 * submission_count if prog.get("direction") == "improving" else 0) +
                random.uniform(-0.5, 0.5))))
    sleep_quality = min(10, max(1, round(base.get("sleep_quality_10", 6) +
                (0.15 * submission_count if "sleep" in str(prog.get("focus_areas", [])) else 0) +
                random.uniform(-0.5, 0.5))))
    stress = max(1, min(10, round(base.get("stress_level_10", 5) +
                (-0.1 * submission_count if prog.get("direction") == "improving" else 0) +
                random.uniform(-0.5, 0.5))))

    return {
        "personalInfo": {
            "name": persona["name"],
            "email": persona["email"],
            "age": persona["age"],
            "gender": persona["gender"],
            "height": height,
            "weight": weight,
        },
        "bodyComposition": {
            "bmi": bmi,
            "bmiCategory": bmi_category,
            "waistCircumference": _apply_variance(persona.get("waist_cm", 85), var.get("waist_cm", [-1, 1])),
        },
        "fitness": {
            "exerciseFrequency": base.get("exercise_frequency", "3-4 times per week"),
            "exerciseType": base.get("exercise_type", "Mixed cardio and strength"),
            "dailySteps": round(_apply_variance(base.get("daily_steps", 7000), [-500, 500])),
            "fitnessLevel": base.get("fitness_level", "moderate"),
        },
        "dietLifestyle": {
            "dietQuality": base.get("diet_quality", "good"),
            "waterIntake": base.get("water_intake", "6-8 glasses"),
            "alcoholFrequency": base.get("alcohol_frequency", "occasional"),
            "smokingStatus": base.get("smoking_status", "never"),
        },
        "mentalWellbeing": {
            "stressLevel": stress,
            "sleepQuality": sleep_quality,
            "energyLevel": energy,
            "socialConnections": base.get("social_connections", "good"),
        },
        "medicalDetails": {
            "existingConditions": base.get("health_challenges", ""),
            "medications": base.get("medications", "None"),
            "familyHistory": base.get("family_history", ""),
        },
        "overallHealth": {
            "selfRating": min(10, max(1, round(energy * 0.8 + random.uniform(-0.5, 0.5)))),
            "healthGoals": base.get("health_goals", ""),
        },
        "metadata": {
            "source": "the_lab",
            "agent_name": persona["name"],
            "submissionDate": datetime.now().isoformat(),
        },
    }
