# Stage 1: Build kubernetes plugin from source
FROM golang:1.24-alpine AS builder
RUN apk add --no-cache git
RUN git clone --depth 1 https://github.com/turbot/steampipe-plugin-kubernetes.git /src
WORKDIR /src
RUN go build -o steampipe-plugin-kubernetes.plugin .

# Stage 2: Steampipe with pre-installed kubernetes plugin
FROM turbot/steampipe:latest
USER root
COPY --from=builder /src/steampipe-plugin-kubernetes.plugin /home/steampipe/.steampipe/plugins/hub.steampipe.io/plugins/turbot/kubernetes@latest/
RUN echo '{"plugins":{"hub.steampipe.io/plugins/turbot/kubernetes@latest":{"install_date":"2026-04-13","version":"1.5.1","schema_version":"2022-11-10"}},"struct_version":20220411}' \
    > /home/steampipe/.steampipe/plugins/versions.json && \
    chown -R 9193:0 /home/steampipe/.steampipe/plugins
USER steampipe
