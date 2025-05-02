ARG OPENHANDS_BUILD_VERSION=dev
FROM node:21.7.2-bookworm-slim AS frontend-builder

WORKDIR /app

COPY ./frontend/package.json frontend/package-lock.json ./
RUN npm install -g npm@10.5.1
RUN npm ci

COPY ./frontend ./
RUN npm run build

FROM node:21.7.2-bookworm-slim AS wrapper-builder

WORKDIR /app/wrapper
COPY ./wrapper/package.json ./wrapper/package-lock.json ./
RUN npm install
COPY ./wrapper ./
RUN npm run build || true # If you have a build step, otherwise ignore

FROM python:3.12.3-slim AS backend-builder

WORKDIR /app
ENV PYTHONPATH='/app'

ENV POETRY_NO_INTERACTION=1 \
    POETRY_VIRTUALENVS_IN_PROJECT=1 \
    POETRY_VIRTUALENVS_CREATE=1 \
    POETRY_CACHE_DIR=/tmp/poetry_cache

RUN apt-get update -y \
    && apt-get install -y curl make git build-essential \
    && python3 -m pip install poetry==1.8.2  --break-system-packages

COPY ./pyproject.toml ./poetry.lock ./
RUN touch README.md
RUN export POETRY_CACHE_DIR && poetry install --without evaluation --no-root && rm -rf $POETRY_CACHE_DIR

FROM python:3.12.3-slim AS openhands-app

WORKDIR /app

ARG OPENHANDS_BUILD_VERSION #re-declare for this section

ENV RUN_AS_OPENHANDS=true
# A random number--we need this to be different from the user's UID on the host machine
ENV OPENHANDS_USER_ID=42420
ENV SANDBOX_LOCAL_RUNTIME_URL=http://host.docker.internal
ENV USE_HOST_NETWORK=false
ENV WORKSPACE_BASE=/opt/workspace_base
ENV OPENHANDS_BUILD_VERSION=$OPENHANDS_BUILD_VERSION
ENV SANDBOX_USER_ID=0
ENV FILE_STORE=local
ENV FILE_STORE_PATH=/.openhands-state
RUN mkdir -p $FILE_STORE_PATH
RUN mkdir -p $WORKSPACE_BASE

RUN apt-get update -y \
    && apt-get install -y curl ssh sudo supervisor \
    && rm -rf /var/lib/apt/lists/*

# Default is 1000, but OSX is often 501
RUN sed -i 's/^UID_MIN.*/UID_MIN 499/' /etc/login.defs
# Default is 60000, but we've seen up to 200000
RUN sed -i 's/^UID_MAX.*/UID_MAX 1000000/' /etc/login.defs

RUN groupadd app
RUN useradd -l -m -u $OPENHANDS_USER_ID -s /bin/bash openhands && \
    usermod -aG app openhands && \
    usermod -aG sudo openhands && \
    echo '%sudo ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers
RUN chown -R openhands:app /app && chmod -R 770 /app
RUN sudo chown -R openhands:app $WORKSPACE_BASE && sudo chmod -R 770 $WORKSPACE_BASE
USER root

# Download and extract the latest OpenVSCode server release to /openhands/.openvscode-server as root, then set ownership
RUN mkdir -p /openhands/.openvscode-server && \
    LATEST_URL=$(curl -s https://api.github.com/repos/gitpod-io/openvscode-server/releases/latest | grep "browser_download_url.*linux-x64.tar.gz" | cut -d '"' -f 4 | head -n 1) && \
    curl -L "$LATEST_URL" -o /tmp/openvscode-server.tar.gz && \
    tar -xzf /tmp/openvscode-server.tar.gz --strip-components=1 -C /openhands/.openvscode-server && \
    rm /tmp/openvscode-server.tar.gz && \
    chown -R openhands:app /openhands/.openvscode-server && \
    test -x /openhands/.openvscode-server/bin/openvscode-server

USER openhands

ENV VIRTUAL_ENV=/app/.venv \
    PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH='/app'

COPY --chown=openhands:app --chmod=770 --from=backend-builder ${VIRTUAL_ENV} ${VIRTUAL_ENV}
RUN playwright install --with-deps chromium

COPY --chown=openhands:app --chmod=770 ./microagents ./microagents
COPY --chown=openhands:app --chmod=770 ./openhands ./openhands
COPY --chown=openhands:app --chmod=777 ./openhands/runtime/plugins ./openhands/runtime/plugins
COPY --chown=openhands:app --chmod=770 ./openhands/agenthub ./openhands/agenthub
COPY --chown=openhands:app ./pyproject.toml ./pyproject.toml
COPY --chown=openhands:app ./poetry.lock ./poetry.lock
COPY --chown=openhands:app ./README.md ./README.md
COPY --chown=openhands:app ./MANIFEST.in ./MANIFEST.in
COPY --chown=openhands:app ./LICENSE ./LICENSE

# --- Copy built wrapper from wrapper-builder stage ---
COPY --chown=openhands:app --from=wrapper-builder /app/wrapper /app/wrapper
WORKDIR /app

# This is run as "openhands" user, and will create __pycache__ with openhands:openhands ownership
RUN python openhands/core/download.py # No-op to download assets
# Add this line to set group ownership of all files/directories not already in "app" group
# openhands:openhands -> openhands:app
RUN find /app \! -group app -exec chgrp app {} +

COPY --chown=openhands:app --chmod=770 --from=frontend-builder /app/build ./frontend/build
COPY --chown=openhands:app --chmod=770 ./containers/app/entrypoint.sh /app/entrypoint.sh

USER root

WORKDIR /app

COPY --chmod=770 ./containers/app/start_openvscode.sh /app/start_openvscode.sh
COPY ./containers/app/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

ENTRYPOINT ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
