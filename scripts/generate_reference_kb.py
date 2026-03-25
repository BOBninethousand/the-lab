#!/usr/bin/env python3
"""Generate a JSON file from reference docs for bulk import into The Lab's Knowledge Base."""

import json
import os

BASE = "/Volumes/Media/download me/Lab-Knowledge-Handover"

REFERENCE_DOCS = [
    {
        "file": "reference-docs/about-me.md",
        "title": "Matthew D'haemer - About Me",
        "tags": "matthew, identity, background, positioning",
        "category": "reference",
    },
    {
        "file": "reference-docs/why-statement.md",
        "title": "WHY Statement",
        "tags": "matthew, why, purpose, decision-filter",
        "category": "reference",
    },
    {
        "file": "reference-docs/coaching-framework.md",
        "title": "Coaching Framework - Hormozi + Robbins Principles",
        "tags": "hormozi, robbins, coaching, framework, value-equation",
        "category": "reference",
    },
    {
        "file": "reference-docs/working-style.md",
        "title": "Working Style - How to Work With Matthew",
        "tags": "matthew, working-style, process, schedule, priority",
        "category": "reference",
    },
    {
        "file": "reference-docs/preferences.md",
        "title": "Preferences and Learnings",
        "tags": "matthew, preferences, tools, workflows, email-style",
        "category": "reference",
    },
    {
        "file": "reference-docs/ai-recurring-tasks.md",
        "title": "AI Recurring Tasks",
        "tags": "schedule, tasks, automation, daily-kickoff, friday-review",
        "category": "reference",
    },
    {
        "file": "reference-docs/HDL/INSTRUCTIONS.md",
        "title": "HDL Project Instructions",
        "tags": "hdl, healthdatalab, instructions, practitioner, pricing",
        "category": "reference",
    },
    {
        "file": "reference-docs/HDL/hdl-current-status.md",
        "title": "HDL Current Status",
        "tags": "hdl, status, current-status, blocker, launch",
        "category": "reference",
    },
    {
        "file": "reference-docs/HDL/course-project.md",
        "title": "HDL Course - Longevity Trajectory Protocol",
        "tags": "hdl, course, protocol, 3+9, cohort, marketing",
        "category": "reference",
    },
    {
        "file": "reference-docs/HDL/decisions-log.md",
        "title": "HDL Decisions and Learnings Log",
        "tags": "hdl, decisions, learnings, pivot, strategy",
        "category": "reference",
    },
    {
        "file": "reference-docs/HDL/hdl-project-report.md",
        "title": "HDL Master Project Report",
        "tags": "hdl, project, report, technical, trajectory-chart",
        "category": "reference",
    },
    {
        "file": "reference-docs/IrisLab/INSTRUCTIONS.md",
        "title": "IrisLab Project Instructions",
        "tags": "irislab, iriscope, iipa, instructions",
        "category": "reference",
    },
    {
        "file": "reference-docs/Altituding/INSTRUCTIONS.md",
        "title": "Altituding Project Instructions",
        "tags": "altituding, instructions, coaching",
        "category": "reference",
    },
    {
        "file": "reference-docs/Altituding/altituding-project-report.md",
        "title": "Altituding Complete Project Report",
        "tags": "altituding, project, report, coaching, longevity-by-design",
        "category": "reference",
    },
    {
        "file": "hormozi-business-playbook.md",
        "title": "Alex Hormozi Business Playbook",
        "tags": "hormozi, value-equation, pricing, sales, CLOSER, leads, leverage, scaling",
        "category": "reference",
    },
    {
        "file": "robbins-mastery-playbook.md",
        "title": "Tony Robbins Mastery Playbook",
        "tags": "robbins, identity, state-management, six-needs, habits, business-mastery, CANI",
        "category": "reference",
    },
]


def main():
    entries = []
    for doc in REFERENCE_DOCS:
        path = os.path.join(BASE, doc["file"])
        if not os.path.exists(path):
            print(f"WARNING: {path} not found, skipping")
            continue
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        entries.append({
            "title": doc["title"],
            "content": content,
            "tags": doc["tags"],
            "category": doc["category"],
        })
        print(f"  Added: {doc['title']} ({len(content)} chars)")

    output_path = os.path.join(os.path.dirname(__file__), "..", "the-lab-kb-references.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(entries, f, indent=2, ensure_ascii=False)

    print(f"\nGenerated {len(entries)} entries -> {output_path}")


if __name__ == "__main__":
    main()
