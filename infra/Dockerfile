# Open Civil Site Risk Checker — フロントエンド配信イメージ（systemd の代替）。
# ビルドコンテキストはプロジェクトルート（docker-compose.yml の context: .. を参照）。

# ---- build stage ----
FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
# lockfile を厳密再現（不整合時はビルド失敗）。再現性・セキュリティ向上。
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- runtime stage ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8700
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.mjs ./server.mjs
# 非 root 実行（侵害時の影響範囲を限定）。node イメージ同梱の非特権ユーザー。
# 配信は読み取りのみ・ポート 8700 は非特権ポートのため node ユーザーで動作する。
USER node
EXPOSE 8700
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["node", "server.mjs"]
