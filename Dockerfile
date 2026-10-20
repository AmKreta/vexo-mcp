# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# local development: source is mounted over /app/src
FROM deps AS dev
COPY . .
EXPOSE 7341
CMD ["node", "src/index.js"]

# production image: dependencies and source only, running as a non-root user
FROM deps AS prod
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --chown=app:app package.json ./
COPY --from=deps --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app src ./src
USER app
EXPOSE 7341
CMD ["node", "src/index.js"]
