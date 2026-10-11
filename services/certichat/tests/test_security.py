from dataclasses import replace

import pytest

from app.security import network_digest, new_token, token_digest
from app.settings import Settings


def test_session_and_network_identity():
    token = new_token()
    assert len(token) == 43 and len(token_digest(token)) == 64
    assert token_digest("x"*42) is None and token_digest(None) is None
    assert network_digest("2001:db8:1:2::1", "secret") == network_digest("2001:db8:1:2::ffff", "secret")
    assert network_digest("::ffff:192.0.2.1", "secret") == network_digest("192.0.2.1", "secret")
    assert network_digest("192.0.2.1", "one") != network_digest("192.0.2.1", "two")


def test_settings_fail_closed():
    settings = Settings("postgresql://test/test", "a"*32, "b"*32, "c"*32, "d"*32, "e"*32)
    settings.validate()
    for change in ({"openrouter_api_key": ""}, {"turnstile_secret": ""}, {"allowed_origins": ("*",)},
                   {"public_origin": "http://public.test"}, {"index_internal_token": "c"*32},
                   {"knowledge_url": "https://evil.test/"}, {"turnstile_hostname": "evil.test"}):
        with pytest.raises(ValueError):
            replace(settings, **change).validate()
