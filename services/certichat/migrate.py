"""Apply CertiChat schema with admin credentials; serve with a DML-only role."""

import os
from pathlib import Path

import psycopg
from psycopg import sql


def main():
    admin = os.environ["CERTICHAT_POSTGRES_ADMIN_PASSWORD"]
    runtime = os.environ["CERTICHAT_POSTGRES_RUNTIME_PASSWORD"]
    if min(len(admin), len(runtime)) < 32 or admin == runtime:
        raise SystemExit("Independent PostgreSQL passwords of at least 32 characters are required.")
    connection = {"host": os.environ.get("CERTICHAT_POSTGRES_HOST", "postgres"),
                  "dbname": "certichat", "connect_timeout": 10}
    with psycopg.connect(**connection, user="certichat_admin", password=admin) as database:
        database.execute("SELECT pg_advisory_xact_lock(18741)")
        if not database.execute("SELECT 1 FROM pg_roles WHERE rolname='certichat_runtime'").fetchone():
            database.execute("CREATE ROLE certichat_runtime LOGIN")
        database.execute(sql.SQL("ALTER ROLE certichat_runtime LOGIN NOINHERIT NOSUPERUSER "
                                 "NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD {}")
                         .format(sql.Literal(runtime)))
        database.execute("ALTER ROLE certichat_runtime SET statement_timeout='5s'")
        database.execute("ALTER ROLE certichat_runtime SET lock_timeout='3s'")
        database.execute("ALTER ROLE certichat_runtime SET idle_in_transaction_session_timeout='10s'")
        database.execute("REVOKE ALL ON DATABASE certichat FROM PUBLIC")
        database.execute("GRANT CONNECT ON DATABASE certichat TO certichat_runtime")
        database.execute("REVOKE ALL ON SCHEMA public FROM PUBLIC")
        database.execute(Path(__file__).with_name("schema.sql").read_text(encoding="utf-8"))
        database.execute("GRANT USAGE ON SCHEMA public TO certichat_runtime")
        database.execute("GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO certichat_runtime")
    with psycopg.connect(**connection, user="certichat_runtime", password=runtime) as database:
        if database.execute("SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls "
                            "FROM pg_roles WHERE rolname=current_user").fetchone()[0]:
            raise SystemExit("CertiChat runtime must be DML-only.")
        if database.execute("SELECT has_schema_privilege('public','CREATE')").fetchone()[0]:
            raise SystemExit("CertiChat runtime must not create schema objects.")
    print("CertiChat schema applied; restricted runtime connection verified.")


if __name__ == "__main__":
    main()
