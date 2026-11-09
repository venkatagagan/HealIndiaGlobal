# syntax=docker/dockerfile:1.7
# Heal India Global - public website image (Next.js standalone server on :3000).
#
# Build context is website/ (this file lives in infra/ so the website project stays a plain npm project):
#   docker build -f infra/website/Dockerfile -t healindia/website ./website
# BuildKit reads infra/website/Dockerfile.dockerignore for this build (node_modules, .next, env files excluded).
#
# The prebuild sync (scripts/prebuild.mjs) cannot see ../content, ../docs/legal or ../design from this context,
# so the committed snapshot (content-snapshot/, public/brand, src/data/*.json) is used as-is - run
# `npm run sync` in website/ before building to refresh it.

ARG NODE_IMAGE=node:22-bookworm-slim

# ------------------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV NPM_CONFIG_AUDIT=false NPM_CONFIG_FUND=false NPM_CONFIG_UPDATE_NOTIFIER=false
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# ------------------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    NEXT_OUTPUT=standalone
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Public, build-time values (baked into the client bundle) - never secrets.
ARG NEXT_PUBLIC_SITE_URL=
ARG NEXT_PUBLIC_API_BASE=/api/v1
ARG NEXT_PUBLIC_PATIENT_APP_URL=
ARG NEXT_PUBLIC_AGENT_PORTAL_URL=
ARG NEXT_PUBLIC_HOSPITAL_PORTAL_URL=
ARG NEXT_PUBLIC_STAFF_URL=
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=
ARG NEXT_PUBLIC_CONTACT_EMAIL=
ARG NEXT_PUBLIC_CONTACT_ENDPOINT=
ARG NEXT_PUBLIC_SOCIAL_PROFILES=
ARG NEXT_PUBLIC_ANALYTICS_PROVIDER=
ARG NEXT_PUBLIC_PLAUSIBLE_DOMAIN=
ARG NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL=
ARG NEXT_PUBLIC_GA4_MEASUREMENT_ID=
# Non-secret server values that prerendered pages depend on (compose / k8s also set them at runtime).
ARG CONTENT_INCLUDE_DRAFTS=false
ARG GOOGLE_SITE_VERIFICATION=
ARG BING_SITE_VERIFICATION=
# The API is unreachable during the image build, so live data cannot be required here (the build would fail);
# the running container sets SITE_REQUIRE_LIVE_DATA=true and ISR / on-demand revalidation replace these pages.
# Never pass REVALIDATE_SECRET as a build arg (build args stay in the image history); it is runtime-only.
# The API is not reachable during `docker build` (API_BASE_URL is the runtime in-network address, also used by
# the compiled /api rewrite): static generation uses the bundled fallback catalogue,
# ISR refreshes pages from the live API at runtime.
ARG DATA_FALLBACK=auto
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE} \
    NEXT_PUBLIC_PATIENT_APP_URL=${NEXT_PUBLIC_PATIENT_APP_URL} \
    NEXT_PUBLIC_AGENT_PORTAL_URL=${NEXT_PUBLIC_AGENT_PORTAL_URL} \
    NEXT_PUBLIC_HOSPITAL_PORTAL_URL=${NEXT_PUBLIC_HOSPITAL_PORTAL_URL} \
    NEXT_PUBLIC_STAFF_URL=${NEXT_PUBLIC_STAFF_URL} \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_CLIENT_ID} \
    NEXT_PUBLIC_CONTACT_EMAIL=${NEXT_PUBLIC_CONTACT_EMAIL} \
    NEXT_PUBLIC_CONTACT_ENDPOINT=${NEXT_PUBLIC_CONTACT_ENDPOINT} \
    NEXT_PUBLIC_SOCIAL_PROFILES=${NEXT_PUBLIC_SOCIAL_PROFILES} \
    NEXT_PUBLIC_ANALYTICS_PROVIDER=${NEXT_PUBLIC_ANALYTICS_PROVIDER} \
    NEXT_PUBLIC_PLAUSIBLE_DOMAIN=${NEXT_PUBLIC_PLAUSIBLE_DOMAIN} \
    NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL=${NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL} \
    NEXT_PUBLIC_GA4_MEASUREMENT_ID=${NEXT_PUBLIC_GA4_MEASUREMENT_ID} \
    CONTENT_INCLUDE_DRAFTS=${CONTENT_INCLUDE_DRAFTS} \
    GOOGLE_SITE_VERIFICATION=${GOOGLE_SITE_VERIFICATION} \
    BING_SITE_VERIFICATION=${BING_SITE_VERIFICATION} \
    SITE_REQUIRE_LIVE_DATA=false \
    DATA_FALLBACK=${DATA_FALLBACK} \
    API_BASE_URL=http://api:8000/api/v1

RUN npm run build \
 && test -f .next/standalone/server.js

# ------------------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
LABEL org.opencontainers.image.title="heal-india-website" \
      org.opencontainers.image.description="Heal India Global public website and login door (Next.js)"
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# Standalone server + the static assets it does not copy itself. Owned by root, run as `node` (read-only code);
# only .next/cache (ISR + image optimiser) must be writable - mount a volume there.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
RUN mkdir -p .next/cache && chown node:node .next/cache

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
