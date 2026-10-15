from dataclasses import replace
from decimal import Decimal
import os
import subprocess
import sys

from fastapi import Response
import pytest

from app.security import COOKIE, LOCAL_COOKIE, cookie_name, network_digest, new_token, set_cookie, token_digest
from app.settings import Settings


def test_model_environment_reaches_gateway_and_rejects_unpriced_or_invalid_configuration():
    check = '''
from app.settings import Settings, MODEL, CHAT_MODEL
from app.provider import prepare_request
Settings("postgresql://test/test", "a"*32, "b"*32, "c"*32, "d"*32, "e"*32).validate()
for purpose, model, maximum in (("index", MODEL, 1024), ("chat", CHAT_MODEL, 4096)):
    payload, _ = prepare_request("chat/completions", {"model": model, "messages": [{"role": "user", "content": "hola"}]}, purpose)
    assert payload["max_tokens"] == maximum
    assert payload["reasoning"] == {"effort": "high", "exclude": True}
'''
    env = {**os.environ, "CERTICHAT_INDEX_MODEL": "anthropic/claude-haiku-5.5",
           "CERTICHAT_CHAT_MODEL": "openai/gpt-5.4", "CERTICHAT_INDEX_REASONING": "high",
           "CERTICHAT_CHAT_REASONING": "high", "CERTICHAT_INDEX_MAX_TOKENS": "1024",
           "CERTICHAT_CHAT_MAX_TOKENS": "4096"}
    result = subprocess.run([sys.executable, "-c", check], env=env, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    for name, value in (("CERTICHAT_INDEX_MODEL", "unpriced"), ("CERTICHAT_CHAT_MODEL", "unpriced"),
                        ("CERTICHAT_CHAT_REASONING", "low"), ("CERTICHAT_INDEX_REASONING", "low"),
                        ("CERTICHAT_INDEX_MAX_TOKENS", "16385"), ("CERTICHAT_CHAT_MAX_TOKENS", "0")):
        result = subprocess.run([sys.executable, "-c", check], env={**env, name: value}, capture_output=True, text=True)
        assert result.returncode != 0, name


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
                   {"questions": "20"}, {"jev_video_enabled": "true"}):
        with pytest.raises(ValueError):
            replace(settings, **change).validate()


@pytest.mark.parametrize('value', [Decimal('0'), Decimal('-1'), Decimal('NaN'), Decimal('Infinity'), Decimal('0.001'), Decimal('1000001'), True, '10'])
def test_budget_settings_reject_invalid_amounts(value):
    settings = Settings('postgresql://test/test', 'a'*32, 'b'*32, 'c'*32, 'd'*32, 'e'*32)
    with pytest.raises(ValueError):
        replace(settings, index_budget_usd=value).validate()


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
                 "CERTICHAT_TURNSTILE_SECRET", "CERTICHAT_SITE_URL", "CERTICHAT_REFRESH", "CERTICHAT_QUESTIONS",
                 "CERTICHAT_INDEX_BUDGET_USD", "CERTICHAT_CHAT_BUDGET_USD", "CERTICHAT_JEV_VIDEO_ENABLED"):
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
    assert Settings.from_env().index_budget_usd == Settings.from_env().chat_budget_usd == Decimal('10')
    monkeypatch.setenv("CERTICHAT_INDEX_BUDGET_USD", "12.50")
    monkeypatch.setenv("CERTICHAT_CHAT_BUDGET_USD", "9.25")
    configured = Settings.from_env()
    configured.validate()
    assert configured.index_budget_usd == Decimal('12.50') and configured.chat_budget_usd == Decimal('9.25')
    monkeypatch.setenv("CERTICHAT_REFRESH", "12")
    monkeypatch.setenv("CERTICHAT_QUESTIONS", "30")
    assert Settings.from_env().refresh_hours == 12 and Settings.from_env().questions == 30
    assert Settings.from_env().jev_video_enabled is False
    monkeypatch.setenv("CERTICHAT_JEV_VIDEO_ENABLED", "true")
    assert Settings.from_env().jev_video_enabled is True
    monkeypatch.setenv("CERTICHAT_JEV_VIDEO_ENABLED", "yes")
    with pytest.raises(ValueError):
        Settings.from_env()
    monkeypatch.setenv("CERTICHAT_JEV_VIDEO_ENABLED", "false")
    monkeypatch.setenv("CERTICHAT_REFRESH", "NaN")
    with pytest.raises(ValueError):
        Settings.from_env()
    monkeypatch.setenv("CERTICHAT_REFRESH", "6")
    monkeypatch.setenv("CERTICHAT_PUBLIC_ORIGIN", "https://certichat.cloudtechnext.net")
    with pytest.raises(ValueError):
        Settings.from_env().validate()
