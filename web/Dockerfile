# syntax=docker/dockerfile:1.7
# Heal India Global - static web image: builds the four React SPAs and serves each on its own port.
#
#   docker build -t healindia/web ./web
#   ports: 8081 patient-web · 8082 agent-portal · 8083 hospital-portal · 8084 admin-portal · /healthz on each
#
# The SPAs call the API same-origin at /api/v1, so put a reverse proxy (infra/nginx, the `edge` service)
# in front that routes /api/ to the backend and everything else here. Security headers/CSP are added by
# that edge proxy.

ARG NODE_IMAGE=node:22-alpine
ARG NGINX_IMAGE=nginx:1.27-alpine

# ------------------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS build

WORKDIR /web
ENV CI=true \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

# Whole workspace (node_modules/dist excluded by .dockerignore) so any new workspace package is picked up;
# the BuildKit cache mount keeps `npm ci` fast across builds.
COPY . .
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# Build-time configuration baked into the bundles (public values only - never secrets).
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_GOOGLE_CLIENT_ID=
ARG VITE_PATIENT_WEB_URL=
ARG VITE_AGENT_PORTAL_URL=
ARG VITE_HOSPITAL_PORTAL_URL=
ARG VITE_ADMIN_PORTAL_URL=
ARG VITE_PATIENT_APP_URL=
ARG VITE_PUBLIC_SITE_URL=
ARG VITE_WEBSITE_URL=
ARG VITE_PUBLIC_LOGIN_URL=
ARG VITE_PUBLIC_REGISTER_URL=
ARG VITE_PUBLIC_FORGOT_PASSWORD_URL=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID} \
    VITE_PATIENT_WEB_URL=${VITE_PATIENT_WEB_URL} \
    VITE_AGENT_PORTAL_URL=${VITE_AGENT_PORTAL_URL} \
    VITE_HOSPITAL_PORTAL_URL=${VITE_HOSPITAL_PORTAL_URL} \
    VITE_ADMIN_PORTAL_URL=${VITE_ADMIN_PORTAL_URL} \
    VITE_PATIENT_APP_URL=${VITE_PATIENT_APP_URL} \
    VITE_PUBLIC_SITE_URL=${VITE_PUBLIC_SITE_URL} \
    VITE_WEBSITE_URL=${VITE_WEBSITE_URL} \
    VITE_PUBLIC_LOGIN_URL=${VITE_PUBLIC_LOGIN_URL} \
    VITE_PUBLIC_REGISTER_URL=${VITE_PUBLIC_REGISTER_URL} \
    VITE_PUBLIC_FORGOT_PASSWORD_URL=${VITE_PUBLIC_FORGOT_PASSWORD_URL}

# Root script type-checks and builds every app (apps/*/dist).
RUN npm run build \
 && for app in patient-web agent-portal hospital-portal admin-portal; do \
      test -f "apps/$app/dist/index.html" || { echo "missing build output for $app" >&2; exit 1; }; \
    done

# ------------------------------------------------------------------------------------------------------
FROM ${NGINX_IMAGE} AS runtime

LABEL org.opencontainers.image.title="heal-india-web" \
      org.opencontainers.image.description="Heal India Global patient, agent, hospital and admin SPAs"

RUN rm -f /etc/nginx/conf.d/default.conf

# Shared per-app server behaviour: SPA fallback + cache policy.
COPY <<'EOF' /etc/nginx/spa-locations.conf
index index.html;
charset utf-8;

location = /healthz {
    access_log off;
    default_type text/plain;
    return 200 "ok\n";
}

# Content-hashed build assets: cache forever.
location /assets/ {
    try_files $uri =404;
    expires 1y;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    access_log off;
}

# Other static files (favicon, manifest, images in public/): short cache.
location ~* \.(?:ico|png|jpe?g|gif|svg|webp|avif|woff2?|ttf|otf|webmanifest|json|txt|xml)$ {
    try_files $uri =404;
    add_header Cache-Control "public, max-age=86400" always;
    access_log off;
}

# The HTML shell must always be revalidated so new deployments are picked up immediately.
location = /index.html {
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
}

# Client-side routes: fall back to the SPA shell.
location / {
    try_files $uri $uri/ /index.html;
    add_header Cache-Control "no-cache" always;
}
EOF
COPY <<'EOF' /etc/nginx/conf.d/spa.conf
server_tokens off;
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_min_length 1024;
gzip_types text/plain text/css application/javascript application/json image/svg+xml application/manifest+json;

# Logs: JSON lines without query strings.
log_format spa_json escape=json '{"time":"$time_iso8601","host":"$host","uri":"$uri","status":$status,"bytes":$body_bytes_sent}';
access_log /dev/stdout spa_json;

server {
    listen 8081;
    server_name _;
    root /usr/share/nginx/html/patient-web;
    include /etc/nginx/spa-locations.conf;
}
server {
    listen 8082;
    server_name _;
    root /usr/share/nginx/html/agent-portal;
    include /etc/nginx/spa-locations.conf;
}
server {
    listen 8083;
    server_name _;
    root /usr/share/nginx/html/hospital-portal;
    include /etc/nginx/spa-locations.conf;
}
server {
    listen 8084;
    server_name _;
    root /usr/share/nginx/html/admin-portal;
    include /etc/nginx/spa-locations.conf;
}
EOF

COPY --from=build /web/apps/patient-web/dist     /usr/share/nginx/html/patient-web
COPY --from=build /web/apps/agent-portal/dist    /usr/share/nginx/html/agent-portal
COPY --from=build /web/apps/hospital-portal/dist /usr/share/nginx/html/hospital-portal
COPY --from=build /web/apps/admin-portal/dist    /usr/share/nginx/html/admin-portal

EXPOSE 8081 8082 8083 8084

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8081/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
