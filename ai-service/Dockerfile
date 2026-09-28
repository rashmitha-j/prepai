FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY app ./app
RUN useradd --create-home appuser && mkdir -p /app/data && chown -R appuser /app
USER appuser

ENV ENVIRONMENT=production PORT=8000 VECTOR_DB_PATH=/app/data/vector_db
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
