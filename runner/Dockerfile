# ─────────────────────────────────────────────────────────────────────
# Marevlo code-execution runner.
#
# Multi-stage:
#   1. build   — full toolchain, compile TypeScript -> dist/
#   2. runtime — slim image with python + jdk-headless + g++ runtime,
#                only production node_modules, no TypeScript, no source.
#
# Languages: Python, JavaScript, C++, Java.
# ─────────────────────────────────────────────────────────────────────

# ── Stage 1: build ─────────────────────────────────────────────────────
FROM node:20-slim AS build

WORKDIR /app
ENV NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false

COPY package*.json ./
# devDependencies (typescript, ts-node, @types) are needed only for the build.
RUN npm install --include=dev --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
COPY workers ./workers
RUN npx tsc

# Re-resolve as production-only to drop ~150 MB of devDeps from the final image.
RUN npm prune --omit=dev


# ── Stage 2: runtime ──────────────────────────────────────────────────
FROM node:20-slim AS runtime

ENV NODE_ENV=production \
    PORT=4002 \
    PYTHON_POOL_SIZE=4 \
    MAX_CONCURRENT=20 \
    COMPILE_CACHE_DIR=/cache/compile \
    DEBIAN_FRONTEND=noninteractive

# Runtime toolchains only — no docs/man/locale.
# javac is needed at runtime (compile-cache miss path), so jdk-headless not jre.
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 \
        g++ \
        openjdk-17-jdk-headless \
        ca-certificates \
    && ln -sf /usr/bin/python3 /usr/local/bin/python \
    && rm -rf /var/lib/apt/lists/* /usr/share/doc /usr/share/man /usr/share/locale/* \
    && useradd -m -u 1001 appuser \
    && mkdir -p /cache/compile \
    && chown -R appuser:appuser /cache

WORKDIR /app
COPY --from=build --chown=appuser:appuser /app/dist          ./dist
COPY --from=build --chown=appuser:appuser /app/node_modules  ./node_modules
COPY --from=build --chown=appuser:appuser /app/workers       ./workers
COPY --from=build --chown=appuser:appuser /app/package.json  ./package.json

# Pre-build the JVM Class Data Sharing archive (one-time at image build).
# Speeds up every subsequent `java` invocation; harmless if it fails.
RUN java -Xshare:dump -XX:SharedArchiveFile=/tmp/jvm.jsa 2>/dev/null || true

USER appuser
VOLUME ["/cache"]
EXPOSE 4002

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||4002)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/index.js"]
