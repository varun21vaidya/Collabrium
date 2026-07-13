FROM node:20-alpine

RUN apk add --no-cache curl

WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
RUN npm ci --only=production

COPY dist/ ./dist/

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1

CMD ["node", "dist/server.js"]
