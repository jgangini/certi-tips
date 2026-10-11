from dataclasses import replace

from fastapi import Response
import pytest

from app.security import COOKIE, LOCAL_COOKIE, cookie_name, network_digest, new_token, set_cookie, token_digest
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
                   {"knowledge_url": "https://evil.test/"}, {"turnstile_hostname": "evil.test"},
                   {"mode": "local"}, {"mode": "LOCAL"}, {"refresh_hours": 0}, {"refresh_hours": 25},
                   {"refresh_hours": 1.5}, {"refresh_hours": True}, {"questions": 0}, {"questions": 101},
                   {"questions": "20"}):
        with pytest.raises(ValueError):
            replace(settings, **change).validate()


def test_local_mode_requires_loopback_and_uses_separate_cookie():
    settings = Settings("postgresql://test/test", "a"*32, "", "c"*32, "d"*32, "e"*32,
                        mode="LOCAL", public_origin="http://127.0.0.1:18741",
                        allowed_origins=("http://127.0.0.1:4173", "http://localhost:4173"))
    settings.validate()
    assert settings.site_url == "https://jgangini.github.io/certitips/"
    for change in ({"public_origin": "https://certichat.cloudtechnext.net"},
                   {"allowed_origins": ("http://127.0.0.1.evil.test:4173",)},
                   {"allowed_origins": ("http://192.168.1.10:4173",)},
                   {"allowed_origins": ("http://user@localhost:4173",)},
                   {"allowed_origins": ("http://localhost:4173/path",)},
                   {"site_url": "http://localhost:4173/certitips/"}, {"mode": "VPS"}):
        with pytest.raises(ValueError):
            replace(settings, **change).validate()
    response = Response()
    set_cookie(response, new_token(), settings)
    cookie = response.headers["set-cookie"].lower()
    assert cookie.startswith(LOCAL_COOKIE + "=") and cookie_name(settings) != COOKIE
    assert "httponly" in cookie and "samesite=lax" in cookie
    assert "secure" not in cookie and "partitioned" not in cookie and "domain=" not in cookie


def test_environment_mode_defaults_fail_closed(monkeypatch):
    for name in ("CERTICHAT_MODE", "CERTICHAT_PUBLIC_ORIGIN", "CERTICHAT_ALLOWED_ORIGINS",
                 "CERTICHAT_TURNSTILE_SECRET", "CERTICHAT_SITE_URL", "CERTICHAT_REFRESH", "CERTICHAT_QUESTIONS"):
        monkeypatch.delenv(name, raising=False)
    for name, value in (("CERTICHAT_DATABASE_URL", "postgresql://test/test"), ("OPENROUTER_API_KEY", "a"*32),
                        ("CERTICHAT_CHAT_INTERNAL_TOKEN", "c"*32), ("CERTICHAT_INDEX_INTERNAL_TOKEN", "d"*32),
                        ("CERTICHAT_NETWORK_SECRET", "e"*32)):
        monkeypatch.setenv(name, value)
    assert Settings.from_env().mode == "VPS"
    with pytest.raises(ValueError):
        Settings.from_env().validate()
    monkeypatch.setenv("CERTICHAT_MODE", "LOCAL")
    Settings.from_env().validate()
    monkeypatch.setenv("CERTICHAT_REFRESH", "12")
    monkeypatch.setenv("CERTICHAT_QUESTIONS", "30")
    assert Settings.from_env().refresh_hours == 12 and Settings.from_env().questions == 30
    monkeypatch.setenv("CERTICHAT_REFRESH", "NaN")
    with pytest.raises(ValueError):
        Settings.from_env()
    monkeypatch.setenv("CERTICHAT_REFRESH", "6")
    monkeypatch.setenv("CERTICHAT_PUBLIC_ORIGIN", "https://certichat.cloudtechnext.net")
    with pytest.raises(ValueError):
        Settings.from_env().validate()
