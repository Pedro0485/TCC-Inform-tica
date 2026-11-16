FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PYTHON_BIN=python3 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        libgl1 \
        libglib2.0-0 \
        python3 \
        python3-pip \
        python3-venv \
        tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"
COPY backend/python/requirements-importacao.txt ./backend/python/requirements-importacao.txt
RUN pip install --no-cache-dir --prefer-binary -r backend/python/requirements-importacao.txt

COPY backend/ ./backend/
COPY frontend/ ./frontend/

WORKDIR /app/backend
EXPOSE 3000
CMD ["node", "server.js"]
