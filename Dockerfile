# Stage 1: Build client React SPA and server TypeScript bundle
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json tsconfig.server.json vite.config.ts tailwind.config.js postcss.config.js ./
COPY src/ ./src/

RUN npm run build

# Stage 2: Production runtime image
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8501
ENV STREAMLIT_SERVER_PORT=8501

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist/ ./dist/

EXPOSE 8501

HEALTHCHECK CMD wget --no-verbose --tries=1 --spider http://localhost:8501/health || exit 1

CMD ["node", "dist/server/index.js"]
