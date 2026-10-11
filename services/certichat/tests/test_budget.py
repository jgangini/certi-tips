from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest

from app.security import ChatError
from app.store import Store
from test_api import database_url


@pytest.fixture
def ledger(database_url):
    store = Store(database_url)
    store.open()
    try:
        yield store
    finally:
        store.close()


def test_parallel_reservations_never_exceed_daily_budget(ledger):
    def reserve(_):
        try:
            return ledger.reserve("chat", 100000)
        except ChatError:
            return None

    with ThreadPoolExecutor(max_workers=8) as pool:
        reservations = list(pool.map(reserve, range(10)))
    assert sum(value is not None for value in reservations) == 5
    assert ledger.available() is False
    with ledger.pool.connection() as connection:
        assert connection.execute("SELECT sum(charged_micro) AS n FROM cc_spend").fetchone()["n"] == 500000


def test_index_cap_is_separate_and_unknown_charges_survive_restart(ledger, database_url):
    reservation = ledger.reserve("index", 2000000)
    with pytest.raises(ChatError):
        ledger.reserve("index", 1)
    assert ledger.available() is True
    second = Store(database_url)
    second.open()
    try:
        with pytest.raises(ChatError):
            second.reserve("index", 1)
        second.settle(reservation, 1900000)
        second.settle(reservation, 0)
        second.reserve("index", 100000)
        with pytest.raises(ChatError):
            second.reserve("index", 1)
    finally:
        second.close()


def test_monthly_and_total_caps_fail_closed(ledger):
    with ledger.pool.connection() as connection:
        connection.execute("INSERT INTO cc_spend(id,purpose,reserved_micro,charged_micro,created_at) "
                           "VALUES (%s,'chat',7000000,7000000,date_trunc('month',now()))", (uuid4(),))
    with pytest.raises(ChatError):
        ledger.reserve("chat", 1)
    ledger.reserve("index", 2000000)
    with pytest.raises(ChatError):
        ledger.reserve("index", 1)
