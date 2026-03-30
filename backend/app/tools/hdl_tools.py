"""
HDL Tools — Agent-callable functions for The Lab ↔ HealthDataLab integration.

Provides secure REST API calls to the HDL WordPress server for:
- Submitting health and longevity assessments
- Checking user status and credits
- Resetting test credits
- SSH diagnostics (restricted commands only)

Install: Copy to backend/app/tools/hdl_tools.py in The Lab repo.
Config:  Set HDL_LAB_API_KEY in .env
"""

import os
import re
import json
import subprocess
import httpx
from typing import Optional

# --- Configuration ---
HDL_API_BASE = "https://healthdatalab.net/wp-json/hdl/v1/lab"
HDL_API_KEY = os.environ.get("HDL_LAB_API_KEY", "")
SSH_KEY_PATH = os.path.expanduser("~/.ssh/id_ed25519_labagent")
SSH_HOST = "labagent@108.61.172.199"
SSH_PORT = "8443"
REQUEST_TIMEOUT = 30

# Email whitelist pattern — must match server-side validation
EMAIL_PATTERN = re.compile(r"^260128vm\+[a-z]+@gmail\.com$")

# Whitelisted SSH commands
ALLOWED_SSH_COMMANDS = {"check-credits", "check-user", "tail-logs", "recent-submissions", "ping"}


def _validate_email(email: str) -> None:
    """Validate email is in the Lab whitelist."""
    if not EMAIL_PATTERN.match(email):
        raise ValueError(f"Email '{email}' not in Lab whitelist. Must match 260128vm+<name>@gmail.com")


def _headers() -> dict:
    """Standard headers for HDL Lab API requests."""
    if not HDL_API_KEY:
        raise EnvironmentError("HDL_LAB_API_KEY not set in environment")
    return {
        "X-HDL-Lab-Key": HDL_API_KEY,
        "Content-Type": "application/json",
    }


def _validated_response(response) -> dict:
    """Ensure response.json() returns a dict; wrap non-dict values."""
    data = response.json()
    if isinstance(data, dict):
        return data
    return {
        "success": False,
        "error": f"Unexpected API response type: {type(data).__name__}",
        "raw_response": data,
    }


def submit_health_assessment(email: str, form_data: dict, agent_name: str = "unknown") -> dict:
    """
    Submit a health assessment for a Lab test user.

    Args:
        email: Lab test user email (260128vm+<name>@gmail.com)
        form_data: Health form data dict matching HDL health form structure
                   (personalInfo, bodyComposition, fitness, etc.)
        agent_name: Name of the Lab agent submitting

    Returns:
        Response dict with success, submission_id, dashboard_url, make_status
    """
    _validate_email(email)
    payload = {
        "email": email,
        "form_data": form_data,
        "agent_name": agent_name,
    }
    response = httpx.post(
        f"{HDL_API_BASE}/submit-health",
        headers=_headers(),
        json=payload,
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return _validated_response(response)


def submit_longevity_assessment(email: str, complete_data: dict, agent_name: str = "unknown") -> dict:
    """
    Submit a longevity assessment and trigger Make.com PDF generation.

    Args:
        email: Lab test user email (260128vm+<name>@gmail.com)
        complete_data: Complete longevity form data dict matching HDL longevity structure.
                       Must include: scores (16 metrics), biologicalAge, age, gender,
                       ageShift, agingRate, bmi, bmiCategory, whr, whrCategory, answersText
        agent_name: Name of the Lab agent submitting

    Returns:
        Response dict with success, submission_id, dashboard_url, make_status
    """
    _validate_email(email)
    payload = {
        "email": email,
        "complete_data": complete_data,
        "agent_name": agent_name,
    }
    response = httpx.post(
        f"{HDL_API_BASE}/submit-longevity",
        headers=_headers(),
        json=payload,
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return _validated_response(response)


def check_user_status(email: str) -> dict:
    """
    Check a Lab test user's status: credits, daily usage, meta.

    Args:
        email: Lab test user email

    Returns:
        Dict with user_id, roles, credits (health/longevity), daily_usage,
        source, practitioner_id
    """
    _validate_email(email)
    response = httpx.get(
        f"{HDL_API_BASE}/user-status",
        headers=_headers(),
        params={"email": email},
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return _validated_response(response)


def reset_credits(email: str, amount: int = 100, agent_name: str = "system") -> dict:
    """
    Top up credits for a Lab test user (adds to practitioner pool).

    Args:
        email: Lab test user email
        amount: Credits to add (capped at 500 server-side)
        agent_name: Who is requesting the reset

    Returns:
        Dict with new credit balances
    """
    _validate_email(email)
    payload = {
        "email": email,
        "amount": amount,
        "agent_name": agent_name,
    }
    response = httpx.post(
        f"{HDL_API_BASE}/reset-credits",
        headers=_headers(),
        json=payload,
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return _validated_response(response)


def ssh_diagnostics(command_name: str, args: str = "") -> str:
    """
    Run a whitelisted diagnostic command on the HDL server via SSH.

    Available commands:
        check-credits <email>      — Show credit balance
        check-user <email>         — Show user details and meta
        tail-logs                  — Last 50 lines of debug.log
        recent-submissions <email> — Last 10 form submissions
        ping                       — Connectivity test (returns 'pong')

    Args:
        command_name: One of the whitelisted command names
        args: Arguments (e.g., email address)

    Returns:
        Command output as string
    """
    if command_name not in ALLOWED_SSH_COMMANDS:
        raise ValueError(
            f"Command '{command_name}' not allowed. "
            f"Allowed: {', '.join(sorted(ALLOWED_SSH_COMMANDS))}"
        )

    # Validate email arg for commands that require it
    email_commands = {"check-credits", "check-user", "recent-submissions"}
    if command_name in email_commands:
        if not args:
            raise ValueError(f"Command '{command_name}' requires an email argument")
        _validate_email(args)

    ssh_command = f"{command_name} {args}".strip()
    result = subprocess.run(
        [
            "ssh",
            "-i", SSH_KEY_PATH,
            "-p", SSH_PORT,
            "-o", "StrictHostKeyChecking=accept-new",
            "-o", "ConnectTimeout=10",
            SSH_HOST,
            ssh_command,
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )

    if result.returncode != 0:
        return f"ERR (exit {result.returncode}): {result.stderr.strip()}"
    return result.stdout.strip()
