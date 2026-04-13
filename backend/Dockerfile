FROM python:3.12-slim-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.backend.md ./
COPY src ./src

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir .

ENV PYTHONPATH=/app/src
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
