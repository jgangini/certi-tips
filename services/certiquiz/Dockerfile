FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app

COPY services/certiquiz/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt \
    && groupadd --gid 10001 certiquiz \
    && useradd --uid 10001 --gid 10001 --no-create-home certiquiz

COPY --chown=10001:10001 services/certiquiz/app /app/app
COPY --chown=10001:10001 services/certiquiz/schema.sql services/certiquiz/migrate.py /app/
COPY --chown=10001:10001 data/catalog.json data/questions*.json /app/data/

USER 10001:10001
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM runtime AS test
USER root
COPY services/certiquiz/requirements-test.txt /app/requirements-test.txt
RUN pip install --no-cache-dir -r requirements-test.txt
COPY --chown=10001:10001 services/certiquiz/tests /app/tests
USER 10001:10001
CMD ["python", "-m", "pytest", "-q", "-p", "no:cacheprovider", "/app/tests"]
