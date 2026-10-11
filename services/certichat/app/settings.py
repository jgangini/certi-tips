"""Fail-closed deployment settings."""

from dataclasses import dataclass
import os
from urllib.parse import urlsplit

MODEL = "qwen/qwen3-235b-a22b-2507"
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
    site_url: str = "https://jgangini.github.io/certi-tips/"

    def validate(self):
        if not self.database_url.startswith(("postgresql://", "postgres://")):
            raise ValueError("CertiChat requires PostgreSQL.")
        secrets = (self.openrouter_api_key, self.turnstile_secret, self.chat_internal_token,
                   self.index_internal_token, self.network_secret)
        if any(len(value) < 32 for value in secrets) or len(set(secrets)) != len(secrets):
            raise ValueError("CertiChat requires distinct configured secrets of at least 32 characters.")
        if not self.allowed_origins or len(self.allowed_origins) > 8:
            raise ValueError("Explicit frontend origins are required.")
        for origin in (self.public_origin, *self.allowed_origins):
            parsed = urlsplit(origin)
            if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
                    or parsed.path or parsed.query or parsed.fragment or "*" in origin):
                raise ValueError("CertiChat requires exact HTTPS origins.")
        site = urlsplit(self.site_url)
        if f"{site.scheme}://{site.netloc}" not in self.allowed_origins or not site.path.endswith("/"):
            raise ValueError("Published site URL must be under an allowed frontend origin.")
        if self.turnstile_hostname not in {urlsplit(value).hostname for value in self.allowed_origins}:
            raise ValueError("Turnstile hostname must match a frontend origin.")
        worker = urlsplit(self.knowledge_url)
        if worker.scheme != "http" or worker.hostname not in ("knowledge", "localhost", "127.0.0.1"):
            raise ValueError("Knowledge worker must use the private service network.")

    @classmethod
    def from_env(cls):
        return cls(database_url=os.environ["CERTICHAT_DATABASE_URL"],
                   openrouter_api_key=os.environ["OPENROUTER_API_KEY"],
                   turnstile_secret=os.environ["CERTICHAT_TURNSTILE_SECRET"],
                   chat_internal_token=os.environ["CERTICHAT_CHAT_INTERNAL_TOKEN"],
                   index_internal_token=os.environ["CERTICHAT_INDEX_INTERNAL_TOKEN"],
                   network_secret=os.environ["CERTICHAT_NETWORK_SECRET"],
                   public_origin=os.environ.get("CERTICHAT_PUBLIC_ORIGIN", cls.public_origin),
                   allowed_origins=tuple(value.strip() for value in os.environ.get(
                       "CERTICHAT_ALLOWED_ORIGINS", "https://jgangini.github.io").split(",") if value.strip()),
                   turnstile_hostname=os.environ.get("CERTICHAT_TURNSTILE_HOSTNAME", cls.turnstile_hostname),
                   knowledge_url=os.environ.get("CERTICHAT_KNOWLEDGE_URL", cls.knowledge_url),
                   site_url=os.environ.get("CERTICHAT_SITE_URL", cls.site_url))
