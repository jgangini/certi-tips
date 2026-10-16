"""Fail-closed deployment settings."""

from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
import os
from urllib.parse import urlsplit
from typing import Literal

Locale = Literal["es", "en", "pt", "it"]
LANGUAGES = {"es": "español", "en": "inglés", "pt": "portugués de Brasil", "it": "italiano"}

MODEL = os.environ.get("CERTICHAT_INDEX_MODEL", "anthropic/claude-haiku-5.5")
CHAT_MODEL = os.environ.get("CERTICHAT_CHAT_MODEL", "openai/gpt-5.4")
INDEX_REASONING = os.environ.get("CERTICHAT_INDEX_REASONING", "high")
CHAT_REASONING = os.environ.get("CERTICHAT_CHAT_REASONING", "medium")
INDEX_MAX_TOKENS = int(os.environ.get("CERTICHAT_INDEX_MAX_TOKENS", "16384"))
CHAT_MAX_TOKENS = int(os.environ.get("CERTICHAT_CHAT_MAX_TOKENS", "8192"))
EMBEDDING_MODEL = "openai/text-embedding-3-small"
VOICE_MODELS = ("openai/gpt-audio-mini", "openai/gpt-audio")


@dataclass(frozen=True)
class Settings:
    database_url: str
    openrouter_api_key: str
    turnstile_secret: str
    chat_internal_token: str
    index_internal_token: str
    network_secret: str
    public_origin: str = "https://certichat.cloudtechnext.net"
    allowed_origins: tuple[str, ...] = ("https://jgangini.github.io",)
    turnstile_hostname: str = "jgangini.github.io"
    knowledge_url: str = "http://knowledge:8001"
    site_url: str = "https://jgangini.github.io/certitips/"
    mode: str = "VPS"
    refresh_hours: int = 6
    questions: int = 20
    index_budget_usd: Decimal = Decimal("10")
    chat_budget_usd: Decimal = Decimal("50")
    jev_video_enabled: bool = False
    voice_enabled: bool = False
    local_voice_pilot: bool = False
    local_voice_corpus_dir: str = ""
    voice_model: str = VOICE_MODELS[0]
    # 2026-10-16: USD 0.42 of the USD 5 pilot remains set aside for earlier probes, including uncertain charges.
    voice_pilot_budget_usd: Decimal = Decimal("4.58")

    def validate(self):
        if type(self.jev_video_enabled) is not bool:
            raise ValueError("CERTICHAT_JEV_VIDEO_ENABLED must be true or false.")
        if type(self.voice_enabled) is not bool or self.voice_model not in VOICE_MODELS:
            raise ValueError("Voice requires a boolean switch and a reviewed audio model.")
        if type(self.local_voice_pilot) is not bool or (self.local_voice_pilot and (self.mode != "LOCAL" or not self.voice_enabled)):
            raise ValueError("The local voice pilot requires LOCAL mode and enabled voice.")
        if not isinstance(self.local_voice_corpus_dir, str) or (self.local_voice_corpus_dir and
                (not self.local_voice_pilot or self.mode != "LOCAL" or not Path(self.local_voice_corpus_dir).is_absolute())):
            raise ValueError("A local voice corpus requires the isolated LOCAL voice pilot and an absolute mounted directory.")
        if (MODEL, CHAT_MODEL) != ("anthropic/claude-haiku-5.5", "openai/gpt-5.4"):
            raise ValueError("Model changes require reviewed provider prices and compatibility.")
        if not {INDEX_REASONING, CHAT_REASONING} <= {"medium", "high"}:
            raise ValueError("CertiChat reasoning must be medium or high.")
        if not 1 <= INDEX_MAX_TOKENS <= 16384 or not 1 <= CHAT_MAX_TOKENS <= 8192:
            raise ValueError("CertiChat output limits must be positive and within index/chat ceilings.")
        if self.mode not in ("LOCAL", "VPS"):
            raise ValueError("CERTICHAT_MODE must be LOCAL or VPS.")
        if type(self.refresh_hours) is not int or not 1 <= self.refresh_hours <= 24:
            raise ValueError("CERTICHAT_REFRESH must be an integer from 1 to 24 hours.")
        if type(self.questions) is not int or not 1 <= self.questions <= 100:
            raise ValueError("CERTICHAT_QUESTIONS must be an integer from 1 to 100.")
        for value in (self.index_budget_usd, self.chat_budget_usd, self.voice_pilot_budget_usd):
            if type(value) not in (int, Decimal) or not Decimal(value).is_finite() or not 0 < value <= 1000000 or Decimal(value).normalize().as_tuple().exponent < -2:
                raise ValueError("CertiChat budgets must be positive USD amounts up to 1000000 with at most two decimal places.")
        if self.chat_budget_usd > 50 or self.voice_pilot_budget_usd > Decimal("4.58"):
            raise ValueError("Joint chat/voice runtime is limited to USD 50 monthly and future voice pilot spending to USD 4.58.")
        if not self.database_url.startswith(("postgresql://", "postgres://")):
            raise ValueError("CertiChat requires PostgreSQL.")
        secrets = (self.openrouter_api_key, self.chat_internal_token,
                   self.index_internal_token, self.network_secret)
        if self.mode == "VPS":
            secrets += (self.turnstile_secret,)
        if any(len(value) < 32 for value in secrets) or len(set(secrets)) != len(secrets):
            raise ValueError("CertiChat requires distinct configured secrets of at least 32 characters.")
        if not self.allowed_origins or len(self.allowed_origins) > 8:
            raise ValueError("Explicit frontend origins are required.")
        for origin in (self.public_origin, *self.allowed_origins):
            parsed = urlsplit(origin)
            local = self.mode == "LOCAL"
            if (parsed.scheme not in (("http", "https") if local else ("https",))
                    or not parsed.hostname or parsed.username or parsed.password
                    or parsed.path or parsed.query or parsed.fragment or "*" in origin):
                raise ValueError("CertiChat requires exact origins (HTTPS in VPS mode).")
            if local and parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
                raise ValueError("LOCAL mode requires loopback origins only.")
        site = urlsplit(self.site_url)
        if (site.scheme != "https" or not site.hostname or site.username or site.password
                or site.query or site.fragment or not site.path.endswith("/")):
            raise ValueError("Published site URL must be a canonical HTTPS URL.")
        if self.mode == "VPS" and f"{site.scheme}://{site.netloc}" not in self.allowed_origins:
            raise ValueError("Published site URL must be under an allowed frontend origin.")
        if self.mode == "VPS" and self.turnstile_hostname not in {urlsplit(value).hostname for value in self.allowed_origins}:
            raise ValueError("Turnstile hostname must match a frontend origin.")
        worker = urlsplit(self.knowledge_url)
        if worker.scheme != "http" or worker.hostname not in ("knowledge", "localhost", "127.0.0.1"):
            raise ValueError("Knowledge worker must use the private service network.")

    @classmethod
    def from_env(cls):
        mode = os.environ.get("CERTICHAT_MODE", "VPS")
        jev_enabled = os.environ.get("CERTICHAT_JEV_VIDEO_ENABLED", "false")
        voice_enabled = os.environ.get("CERTICHAT_VOICE_ENABLED", "false")
        local_voice_pilot = os.environ.get("CERTICHAT_LOCAL_VOICE_PILOT", "false")
        if jev_enabled not in ("true", "false"):
            raise ValueError("CERTICHAT_JEV_VIDEO_ENABLED must be true or false.")
        if voice_enabled not in ("true", "false"):
            raise ValueError("CERTICHAT_VOICE_ENABLED must be true or false.")
        if local_voice_pilot not in ("true", "false"):
            raise ValueError("CERTICHAT_LOCAL_VOICE_PILOT must be true or false.")
        return cls(database_url=os.environ["CERTICHAT_DATABASE_URL"],
                   openrouter_api_key=os.environ["OPENROUTER_API_KEY"],
                   turnstile_secret=os.environ.get("CERTICHAT_TURNSTILE_SECRET", ""),
                   chat_internal_token=os.environ["CERTICHAT_CHAT_INTERNAL_TOKEN"],
                   index_internal_token=os.environ["CERTICHAT_INDEX_INTERNAL_TOKEN"],
                   network_secret=os.environ["CERTICHAT_NETWORK_SECRET"],
                   public_origin=os.environ.get("CERTICHAT_PUBLIC_ORIGIN",
                                                "http://127.0.0.1:18741" if mode == "LOCAL" else cls.public_origin),
                   allowed_origins=tuple(value.strip() for value in os.environ.get(
                       "CERTICHAT_ALLOWED_ORIGINS", "http://127.0.0.1:4173,http://localhost:4173"
                       if mode == "LOCAL" else "https://jgangini.github.io").split(",") if value.strip()),
                   turnstile_hostname=os.environ.get("CERTICHAT_TURNSTILE_HOSTNAME", cls.turnstile_hostname),
                   knowledge_url=os.environ.get("CERTICHAT_KNOWLEDGE_URL", cls.knowledge_url),
                   site_url=os.environ.get("CERTICHAT_SITE_URL", cls.site_url), mode=mode,
                   refresh_hours=int(os.environ.get("CERTICHAT_REFRESH", "6")),
                   questions=int(os.environ.get("CERTICHAT_QUESTIONS", "20")),
                   index_budget_usd=Decimal(os.environ.get("CERTICHAT_INDEX_BUDGET_USD", "10")),
                   chat_budget_usd=Decimal(os.environ.get("CERTICHAT_CHAT_BUDGET_USD", "50")),
                   jev_video_enabled=jev_enabled == "true", voice_enabled=voice_enabled == "true",
                   local_voice_pilot=local_voice_pilot == "true",
                   local_voice_corpus_dir=os.environ.get("CERTICHAT_LOCAL_VOICE_CORPUS_DIR", ""),
                   voice_model=os.environ.get("CERTICHAT_VOICE_MODEL", VOICE_MODELS[0]),
                   voice_pilot_budget_usd=Decimal(os.environ.get("CERTICHAT_VOICE_PILOT_BUDGET_USD", "4.58")))
