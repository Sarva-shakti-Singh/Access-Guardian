# Build the React/Vite dashboard.
FROM node:22-bookworm-slim AS frontend-build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Build the API image with the matching Playwright browser and system libraries.
FROM python:3.12-slim AS app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    ACCESS_GUARDIAN_DATABASE=/var/data/access-guardian.sqlite3 \
    ACCESS_GUARDIAN_AXE_PATH=/app/frontend/node_modules/axe-core/axe.min.js
WORKDIR /app
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt \
    && python -m playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*
COPY backend/ ./backend/
COPY --from=frontend-build /src/frontend/dist ./frontend/dist
COPY --from=frontend-build /src/frontend/node_modules/axe-core/axe.min.js ./frontend/node_modules/axe-core/axe.min.js
EXPOSE 10000
CMD ["sh", "-c", "python -m uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
