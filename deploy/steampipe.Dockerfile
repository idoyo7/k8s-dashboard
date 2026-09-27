# Stage 1: Build kubernetes plugin from source
# go.mod의 `go 1.26.0` 지시어(v1.6.0부터, main HEAD도 동일)를 만족해야 한다.
# golang:1.24-alpine 은 ENV GOTOOLCHAIN=local 이 기본값이라 자동 다운로드가 막혀
# "go.mod requires go >= 1.26.0 (running go 1.24.13; GOTOOLCHAIN=local)" 로 빌드가 깨진다.
# go 1.24 자체도 2026-02-10 EOL. 1.27-alpine(현재 stable)로 올리고, 향후 go.mod가
# 더 앞서가도 안전하게 자동 다운로드되도록 GOTOOLCHAIN=auto 를 명시한다.
FROM golang:1.27-alpine AS builder
ENV GOTOOLCHAIN=auto
RUN apk add --no-cache git
# main HEAD는 unreleased 상태로 SDK v6.0.0 리컴파일이 revert/reapply 중이라 불안정 —
# 태그된 릴리스(v1.7.0)로 고정한다.
RUN git clone --depth 1 --branch v1.7.0 https://github.com/turbot/steampipe-plugin-kubernetes.git /src
WORKDIR /src
RUN go build -o steampipe-plugin-kubernetes.plugin .

# Stage 2: Steampipe with pre-installed kubernetes plugin
# turbot/steampipe Docker Hub 리포는 2024-03-15 이후 push 가 끊겼고(:latest = v0.22.0),
# GHCR(ghcr.io/turbot/steampipe)도 태그가 0.22.0 까지만 있다 — 벤더가 풀 CLI 이미지
# 배포를 그 즈음 중단한 것으로 보인다(CLI 자체는 GitHub 릴리스 기준 v2.4.7까지 나왔다).
# 즉 "더 새 버전 태그로 교체"가 불가능하다. 재현성을 위해 :latest 를 그 시점의 digest로
# 고정해 둔다 — 장기적으로는 이 스테이지를 걷어내고 공식 설치 스크립트로 최신 CLI를
# 새 베이스 이미지 위에 까는 재작성이 필요하다(별도 검증 필요, upgrade.patch 미포함).
FROM turbot/steampipe@sha256:3871d0f7c0f8047a50bd2555c885d8863460845472ab1910f939684a828ec706
USER root
COPY --from=builder /src/steampipe-plugin-kubernetes.plugin /home/steampipe/.steampipe/plugins/hub.steampipe.io/plugins/turbot/kubernetes@latest/
RUN echo '{"plugins":{"hub.steampipe.io/plugins/turbot/kubernetes@latest":{"install_date":"2026-09-27","version":"1.7.0","schema_version":"2022-11-10"}},"struct_version":20220411}' \
    > /home/steampipe/.steampipe/plugins/versions.json && \
    chown -R 9193:0 /home/steampipe/.steampipe/plugins
USER steampipe
