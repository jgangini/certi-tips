FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HOME=/tmp TIKTOKEN_CACHE_DIR=/opt/tiktoken-cache
WORKDIR /app
RUN groupadd --gid 10001 certichat \
    && useradd --uid 10001 --gid 10001 --no-create-home certichat

FROM base AS runtime
COPY services/certichat/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --require-hashes -r requirements.txt
COPY --chown=10001:10001 services/certichat/app /app/app
COPY --chown=10001:10001 services/certichat/schema.sql services/certichat/migrate.py /app/
USER 10001:10001
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM base AS knowledge
RUN apt-get update && apt-get install -y --no-install-recommends libmagic1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*
COPY services/certichat/requirements-knowledge.txt /app/requirements-knowledge.txt
RUN pip install --no-cache-dir --require-hashes -r requirements-knowledge.txt \
    && python -c "import tiktoken; [tiktoken.get_encoding(n) for n in ('cl100k_base','o200k_base','p50k_base','r50k_base')]" \
    && chmod -R a+rX /opt/tiktoken-cache
COPY --chown=10001:10001 services/certichat/app /app/app
USER 10001:10001
EXPOSE 8001
CMD ["uvicorn", "app.knowledge:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1", "--no-access-log"]

FROM runtime AS test
USER root
COPY services/certichat/requirements-test.txt /app/requirements-test.txt
RUN pip install --no-cache-dir --require-hashes -r requirements-test.txt
COPY --chown=10001:10001 services/certichat/tests /app/tests
COPY --chown=10001:10001 services/certichat/*.sh /app/
USER 10001:10001
CMD ["python", "-m", "pytest", "-q", "-p", "no:cacheprovider", "/app/tests"]
