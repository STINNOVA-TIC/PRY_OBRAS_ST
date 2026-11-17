# ---------- Etapa 1: compilar ----------
FROM node:22-alpine AS build
WORKDIR /app

# Instala dependencias primero para aprovechar la caché de Docker
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build \
 && npm prune --omit=dev

# ---------- Etapa 2: imagen final (solo lo necesario para correr) ----------
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

# pg_dump para el respaldo manual (Administración → Respaldos)
RUN apk add --no-cache postgresql16-client

# Carpeta de adjuntos (firmas, PDFs); se monta como volumen
RUN mkdir -p /app/uploads && chown node:node /app/uploads
ENV UPLOAD_DIR=/app/uploads

# No correr como root
USER node
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "dist/main.js"]
