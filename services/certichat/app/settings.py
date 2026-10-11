"""Fail-closed deployment settings."""

from dataclasses import dataclass
import os
from urllib.parse import urlsplit

MODEL = "qwen/qwen3-235b-a22b-2507"
CHAT_MODEL = "google/gemini-2.5-flash-lite"
EMBEDDING_MODEL = "openai/text-embedding-3-small"


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

    def validate(self):
        if self.mode not in ("LOCAL", "VPS"):
            raise ValueError("CERTICHAT_MODE must be LOCAL or VPS.")
        if type(self.refresh_hours) is not int or not 1 <= self.refresh_hours <= 24:
            raise ValueError("CERTICHAT_REFRESH must be an integer from 1 to 24 hours.")
        if type(self.questions) is not int or not 1 <= self.questions <= 100:
            raise ValueError("CERTICHAT_QUESTIONS must be an integer from 1 to 100.")
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
                   questions=int(os.environ.get("CERTICHAT_QUESTIONS", "20")))
