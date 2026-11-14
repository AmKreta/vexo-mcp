# syntax=docker/dockerfile:1

# The tool definitions (../editor-tools, a `file:` dependency), compiled in their own stage. Build
# with the `editor-tools` context: docker compose passes it, or
# `docker build --build-context editor-tools=../editor-tools`.
FROM node:20-alpine AS editor-tools-build
WORKDIR /editor-tools
COPY --from=editor-tools package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY --from=editor-tools . .
# built now; a consumer's `npm ci` would otherwise run `prepare` (tsc) again on the link
RUN npm run build && npm prune --omit=dev && npm pkg delete scripts.prepare

FROM node:20-alpine AS deps
WORKDIR /app
COPY --from=editor-tools-build /editor-tools /editor-tools
COPY package.json package-lock.json ./
RUN npm ci

# local development: source is mounted over /app/src
FROM deps AS dev
COPY . .
EXPOSE 7341 7342
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
EXPOSE 7341 7342
CMD ["node", "src/index.js"]
