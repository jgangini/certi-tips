"""Check source banks with the API contract, without network, database or dependencies."""

import argparse
from pathlib import Path
import sys

from app.catalog import load_catalog


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data_dir", nargs="?", type=Path, default=Path("data"))
    args = parser.parse_args()
    try:
        courses = load_catalog(args.data_dir)
    except (OSError, ValueError, RecursionError) as error:
        print(f"CertiQuiz: {error}", file=sys.stderr)
        return 1
    for course in courses.values():
        print(f"{course['id']}: {len(course['questions'])} preguntas")
    print(f"CertiQuiz: {len(courses)} bancos de curso compatibles con la API.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
