from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from uuid import uuid4

import pytest

from app.security import ChatError
from app.store import Store
from test_api import database_url


@pytest.fixture
def ledger(database_url):
    store = Store(database_url, chat_budget_usd=Decimal("10"))
    store.open()
    try:
        yield store
    finally:
        store.close()


def test_parallel_reservations_allow_more_than_five_per_day_but_never_exceed_monthly_budget(ledger):
    def reserve(_):
        try:
            return ledger.reserve("chat", 1000000)
        except ChatError:
            return None

    with ThreadPoolExecutor(max_workers=8) as pool:
        reservations = list(pool.map(reserve, range(20)))
    assert sum(value is not None for value in reservations) == 10
    assert ledger.available() is False
    with ledger.pool.connection() as connection:
        assert connection.execute("SELECT sum(charged_micro) AS n FROM cc_spend").fetchone()["n"] == ledger.monthly_limits["chat"] == 10_000_000


def test_monthly_limit_matches_availability_and_settled_cost_without_erasing_history(ledger):
    first = ledger.reserve("chat", 500001)
    assert ledger.available() is True
    ledger.reserve("chat", ledger.monthly_limits["chat"] - 500001)
    assert ledger.available() is False
    with pytest.raises(ChatError):
        ledger.reserve("chat", 1)
    ledger.settle(first, 1)
    assert ledger.available() is True
    ledger.reserve("chat", 500000)
    assert ledger.available() is False
    with ledger.pool.connection() as connection:
        row = connection.execute("SELECT count(*) AS n,sum(charged_micro) AS charged FROM cc_spend").fetchone()
        assert row["n"] == 3 and row["charged"] == ledger.monthly_limits["chat"]


def test_index_cap_is_separate_and_unknown_charges_survive_restart(ledger, database_url):
    reservation = ledger.reserve("index", 10000000)
    with pytest.raises(ChatError):
        ledger.reserve("index", 1)
    assert ledger.available() is True
    second = Store(database_url)
    second.open()
    try:
        with pytest.raises(ChatError):
            second.reserve("index", 1)
        second.settle(reservation, 9900000)
        second.settle(reservation, 0)
        second.reserve("index", 100000)
        with pytest.raises(ChatError):
            second.reserve("index", 1)
    finally:
        second.close()


def test_independent_monthly_caps_fail_closed(ledger):
    with ledger.pool.connection() as connection:
        connection.execute("INSERT INTO cc_spend(id,purpose,reserved_micro,charged_micro,created_at) "
                           "VALUES (%s,'chat',10000000,10000000,date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')", (uuid4(),))
    with pytest.raises(ChatError):
        ledger.reserve("chat", 1)
    ledger.reserve("index", 10000000)
    with pytest.raises(ChatError):
        ledger.reserve("index", 1)


def test_configured_decimal_limits_remain_independent(database_url):
    store = Store(database_url, index_budget_usd=Decimal('0.20'), chat_budget_usd=Decimal('0.15'))
    store.open()
    try:
        store.reserve('index', 200000)
        assert store.available() is True
        store.reserve('chat', 150000)
        assert store.available() is False
        for purpose in ('chat', 'index'):
            with pytest.raises(ChatError):
                store.reserve(purpose, 1)
    finally:
        store.close()


def test_previous_utc_month_does_not_consume_current_budget(ledger):
    with ledger.pool.connection() as connection:
        connection.execute("INSERT INTO cc_spend(id,purpose,reserved_micro,charged_micro,created_at) "
                           "VALUES (%s,'chat',10000000,10000000,(date_trunc('month',now() AT TIME ZONE 'UTC') "
                           "- interval '1 second') AT TIME ZONE 'UTC')", (uuid4(),))
    assert ledger.available() is True
    ledger.reserve("chat", 10000000)
    assert ledger.available() is False
