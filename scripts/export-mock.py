#!/usr/bin/env python3
"""
Export current PostgreSQL data into FE mock JSON files.

Usage:
    cd fe
    python scripts/export-mock.py
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import psycopg

DB_DSN = "host=localhost port=5432 dbname=tedo_db user=postgres password=123456"


def dt_to_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def fetch_programs(conn: psycopg.Connection) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                p.id,
                p.uni_id,
                u.name AS university_name,
                p.name,
                p.code,
                p.degree_type,
                p.credits,
                p.duration,
                p.tuition,
                p.language,
                p.form_of_study,
                p.source_url,
                p.last_crawled,
                p.description,
                p.goals,
                p.career_outlook,
                p.is_active,
                p.created_at,
                p.updated_at,
                (
                    SELECT count(*)::int
                    FROM curricula c
                    WHERE c.program_id = p.id
                ) AS course_count
            FROM programs p
            INNER JOIN universities u ON u.id = p.uni_id
            ORDER BY p.created_at DESC
            """
        )
        rows = cur.fetchall()

    programs = []
    for row in rows:
        (
            pid,
            uni_id,
            university_name,
            name,
            code,
            degree_type,
            credits,
            duration,
            tuition,
            language,
            form_of_study,
            source_url,
            last_crawled,
            description,
            goals,
            career_outlook,
            is_active,
            created_at,
            updated_at,
            course_count,
        ) = row
        programs.append(
            {
                "id": str(pid),
                "universityId": str(uni_id),
                "universityName": university_name,
                "name": name,
                "code": code,
                "degreeType": degree_type,
                "credits": credits,
                "duration": duration,
                "tuition": tuition,
                "language": language,
                "formOfStudy": form_of_study,
                "sourceUrl": source_url,
                "lastCrawled": dt_to_iso(last_crawled),
                "description": description,
                "goals": goals,
                "careerOutlook": career_outlook,
                "isActive": is_active,
                "createdAt": dt_to_iso(created_at),
                "updatedAt": dt_to_iso(updated_at),
                "courseCount": course_count,
            }
        )
    return programs


def fetch_degree_types(conn: psycopg.Connection) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT degree_type
            FROM programs
            WHERE degree_type IS NOT NULL
            ORDER BY degree_type
            """
        )
        return [row[0] for row in cur.fetchall()]


def fetch_curricula(conn: psycopg.Connection) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                c.id,
                c.program_id,
                p.name AS program_name,
                c.year,
                c.course_name,
                c.course_code,
                c.credits,
                c.mandatory,
                c.semester,
                c.hours_theory,
                c.hours_practice,
                c.description,
                c.prerequisites,
                c.created_at,
                c.updated_at
            FROM curricula c
            JOIN programs p ON p.id = c.program_id
            ORDER BY c.program_id, c.course_name
            """
        )
        rows = cur.fetchall()

    curricula = []
    for row in rows:
        (
            cid,
            program_id,
            program_name,
            year,
            course_name,
            course_code,
            credits,
            mandatory,
            semester,
            hours_theory,
            hours_practice,
            description,
            prerequisites,
            created_at,
            updated_at,
        ) = row
        curricula.append(
            {
                "id": str(cid),
                "programId": str(program_id),
                "programName": program_name,
                "year": year,
                "courseName": course_name,
                "courseCode": course_code,
                "credits": credits,
                "mandatory": mandatory,
                "semester": semester,
                "hoursTheory": hours_theory,
                "hoursPractice": hours_practice,
                "description": description,
                "prerequisites": prerequisites,
                "createdAt": dt_to_iso(created_at),
                "updatedAt": dt_to_iso(updated_at),
            }
        )
    return curricula


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main() -> int:
    fe_root = Path(__file__).resolve().parent.parent
    targets = [fe_root / "public" / "mock", fe_root / "dist" / "mock"]

    print("Connecting to PostgreSQL...")
    with psycopg.connect(DB_DSN) as conn:
        print("Fetching programs...")
        programs = fetch_programs(conn)
        print(f"  -> {len(programs)} programs")

        print("Fetching degree types...")
        degree_types = fetch_degree_types(conn)
        print(f"  -> {len(degree_types)} degree types")

        print("Fetching curricula...")
        curricula = fetch_curricula(conn)
        print(f"  -> {len(curricula)} curricula")

    for target in targets:
        print(f"Writing mock files to {target}...")
        write_json(target / "programs.json", programs)
        write_json(target / "degree-types.json", degree_types)
        write_json(target / "curricula.json", curricula)

    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
