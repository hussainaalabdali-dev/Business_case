# Multi-arch (linux/amd64, linux/arm64). The official Playwright image ships Chromium and its deps for both.
FROM mcr.microsoft.com/playwright/python:v1.49.1-noble
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /srv
COPY engine /srv/engine
COPY api /srv/api
RUN pip install /srv/engine /srv/api
COPY fixtures /srv/fixtures
WORKDIR /srv/api
USER pwuser
EXPOSE 8000
# --no-access-log: log no requests (CLAUDE.md rule 5); uvicorn never logs bodies.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
