FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Путь, по которому портал открывает вкладку, например /automation/
ARG APP_BASE_PATH=/
ENV APP_BASE_PATH=${APP_BASE_PATH}
RUN npm run build

FROM nginx:1.27-alpine
ARG APP_BASE_PATH=/
ENV APP_BASE_PATH=${APP_BASE_PATH} \
    BACKEND_URL=http://backend:8000
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /src/dist /usr/share/nginx/html${APP_BASE_PATH}
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=6 CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
