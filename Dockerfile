FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS install

RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

FROM base AS prerelease
COPY --from=install /temp/prod/node_modules node_modules
COPY . .

ENV NODE_ENV=production
RUN bun run build

FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /app/dist dist
COPY --from=prerelease /app/package.json .
COPY --from=prerelease /app/drizzle drizzle

ENV NODE_ENV=production
EXPOSE 9000

USER bun
ENTRYPOINT ["bun", "run", "dist/server.js"]
