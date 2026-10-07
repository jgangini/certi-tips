"""Apply the quiz schema with an administrator; the API receives DML credentials only."""

import os
from pathlib import Path

import psycopg
from psycopg import sql


def main():
    admin_password = os.environ["CERTIQUIZ_POSTGRES_ADMIN_PASSWORD"]
    runtime_password = os.environ["CERTIQUIZ_POSTGRES_RUNTIME_PASSWORD"]
    if min(len(admin_password), len(runtime_password)) < 32 or admin_password == runtime_password:
        raise SystemExit("Independent PostgreSQL passwords of at least 32 characters are required.")
    connection = {"host": os.environ.get("CERTIQUIZ_POSTGRES_HOST", "postgres"),
                  "dbname": "certiquiz", "connect_timeout": 10}
    with psycopg.connect(**connection, user="certiquiz_admin", password=admin_password) as database:
        database.execute("SELECT pg_advisory_xact_lock(18740)")
        if not database.execute("SELECT 1 FROM pg_roles WHERE rolname='certiquiz_runtime'").fetchone():
            database.execute("CREATE ROLE certiquiz_runtime LOGIN")
        database.execute(sql.SQL("ALTER ROLE certiquiz_runtime LOGIN NOINHERIT NOSUPERUSER "
                                 "NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD {}")
                         .format(sql.Literal(runtime_password)))
        database.execute("ALTER ROLE certiquiz_runtime SET statement_timeout='10s'")
        database.execute("ALTER ROLE certiquiz_runtime SET lock_timeout='5s'")
        database.execute("ALTER ROLE certiquiz_runtime SET idle_in_transaction_session_timeout='10s'")
        database.execute("REVOKE ALL ON DATABASE certiquiz FROM PUBLIC")
        database.execute("GRANT CONNECT ON DATABASE certiquiz TO certiquiz_runtime")
        database.execute("REVOKE ALL ON SCHEMA public FROM PUBLIC")
        database.execute(Path(__file__).with_name("schema.sql").read_text(encoding="utf-8"))
        database.execute("GRANT USAGE ON SCHEMA public TO certiquiz_runtime")
        database.execute("GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO certiquiz_runtime")
        database.execute("GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO certiquiz_runtime")
    with psycopg.connect(**connection, user="certiquiz_runtime", password=runtime_password) as database:
        privileged = database.execute("SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication "
                                      "OR rolbypassrls FROM pg_roles WHERE rolname=current_user").fetchone()[0]
        creates = database.execute("SELECT has_schema_privilege('public','CREATE')").fetchone()[0]
        if privileged or creates:
            raise SystemExit("Quiz runtime must have DML-only privileges.")
    print("CertiQuiz schema applied; restricted runtime connection verified.")


if __name__ == "__main__":
    main()
