"""Generate grafana/dashboards/hig-api-overview.json (Grafana 10/11 schema).

Usage: python deploy/observability/grafana/gen_dashboard.py deploy/observability/grafana/dashboards/hig-api-overview.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

OUT = Path(sys.argv[1])

DS = {"type": "prometheus", "uid": "${datasource}"}
SEL = 'job="$job", instance=~"$instance"'

# Status palette (reserved for state; always paired with a label) and sequential blue ramp (ordinal steps).
GOOD, WARNING, SERIOUS, CRITICAL = "#0ca30c", "#fab219", "#ec835a", "#d03b3b"
BLUE_250, BLUE_450, BLUE_600 = "#86b6ef", "#2a78d6", "#184f95"
NEUTRAL = "#8d8c88"

panels: list[dict] = []
_next_id = 1


def pid() -> int:
    global _next_id
    _next_id += 1
    return _next_id - 1


def row(title: str, y: int) -> None:
    panels.append({
        "type": "row", "id": pid(), "title": title, "collapsed": False,
        "gridPos": {"h": 1, "w": 24, "x": 0, "y": y}, "panels": [],
    })


def target(expr: str, legend: str = "__auto", ref: str = "A") -> dict:
    return {"datasource": DS, "expr": expr, "legendFormat": legend, "refId": ref, "range": True, "instant": False}


def thresholds(*steps: tuple[float | None, str]) -> dict:
    return {"mode": "absolute", "steps": [{"color": c, "value": v} for v, c in steps]}


def stat(title: str, desc: str, expr: str, unit: str, th: dict, x: int, y: int, decimals: int | None = None,
         w: int = 4) -> None:
    defaults: dict = {"unit": unit, "color": {"mode": "thresholds"}, "thresholds": th, "noValue": "0"}
    if decimals is not None:
        defaults["decimals"] = decimals
    panels.append({
        "type": "stat", "id": pid(), "title": title, "description": desc, "datasource": DS,
        "gridPos": {"h": 4, "w": w, "x": x, "y": y},
        "targets": [target(expr, "", "A")],
        "fieldConfig": {"defaults": defaults, "overrides": []},
        "options": {
            "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
            "colorMode": "value", "graphMode": "area", "justifyMode": "auto", "orientation": "auto",
            "textMode": "value", "wideLayout": True, "showPercentChange": False,
        },
    })


def fixed(name: str, color: str, dashed: bool = False) -> dict:
    props: list[dict] = [{"id": "color", "value": {"mode": "fixed", "fixedColor": color}}]
    if dashed:
        props.append({"id": "custom.lineStyle", "value": {"fill": "dash", "dash": [10, 10]}})
    return {"matcher": {"id": "byName", "options": name}, "properties": props}


def timeseries(title: str, desc: str, targets: list[dict], unit: str, x: int, y: int, w: int = 12, h: int = 8,
               overrides: list[dict] | None = None, th: dict | None = None, single: bool = False,
               decimals: int | None = None) -> None:
    custom = {
        "drawStyle": "line", "lineWidth": 2, "fillOpacity": 0, "showPoints": "never", "pointSize": 8,
        "lineInterpolation": "linear", "spanNulls": False, "gradientMode": "none", "axisPlacement": "auto",
        "axisSoftMin": 0, "stacking": {"mode": "none", "group": "A"},
        "thresholdsStyle": {"mode": "dashed" if th else "off"},
    }
    defaults: dict = {"unit": unit, "min": 0, "custom": custom, "color": {"mode": "palette-classic"}}
    if th:
        defaults["thresholds"] = th
    if decimals is not None:
        defaults["decimals"] = decimals
    panels.append({
        "type": "timeseries", "id": pid(), "title": title, "description": desc, "datasource": DS,
        "gridPos": {"h": h, "w": w, "x": x, "y": y},
        "targets": targets,
        "fieldConfig": {"defaults": defaults, "overrides": overrides or []},
        "options": {
            "legend": (
                {"showLegend": False, "displayMode": "list", "placement": "bottom", "calcs": []}
                if single else
                {"showLegend": True, "displayMode": "table", "placement": "bottom", "calcs": ["lastNotNull", "max"]}
            ),
            "tooltip": {"mode": "multi", "sort": "desc"},
        },
    })


rate = "$__rate_interval"
req = f"http_requests_total{{{SEL}}}"
req5 = f'http_requests_total{{{SEL}, status="5xx"}}'
highr = f"http_request_duration_highr_seconds_bucket{{{SEL}}}"
lowr = f"http_request_duration_seconds_bucket{{{SEL}}}"

# --- Row: headline -------------------------------------------------------------------------------------
y = 0
row("API - headline (prometheus-fastapi-instrumentator)", y)
y += 1
stat("Request rate", "All API requests per second (health and metrics endpoints excluded).",
     f"sum(rate({req}[{rate}]))", "reqps", thresholds((None, BLUE_450)), 0, y, decimals=1)
stat("5xx ratio", "Share of responses with status 5xx. Alerts: warning > 2%, critical > 5% (5 min).",
     f"(sum(rate({req5}[{rate}])) or vector(0)) / sum(rate({req}[{rate}]))", "percentunit",
     thresholds((None, GOOD), (0.02, WARNING), (0.05, CRITICAL)), 4, y, decimals=2)
stat("p95 latency", "95th percentile request latency (fine-grained histogram). Alerts: warning > 2 s, critical > 4 s.",
     f"histogram_quantile(0.95, sum by (le) (rate({highr}[{rate}])))", "s",
     thresholds((None, GOOD), (2, WARNING), (4, CRITICAL)), 8, y, decimals=2)
stat("Healthy API targets", "Scrapeable API instances (up == 1).",
     'sum(up{job="$job"})', "none", thresholds((None, CRITICAL), (1, WARNING), (2, GOOD)), 12, y, decimals=0)
stat("Due background jobs", "Queued jobs whose run_at is due (sql_exporter: hig_jobs_queued_total). Alert > 200 for 10 min.",
     "max(hig_jobs_queued_total)", "none", thresholds((None, GOOD), (50, WARNING), (200, CRITICAL)), 16, y,
     decimals=0)
stat("Oldest due job", "Wait time of the oldest due job (sql_exporter). Alert > 10 min: workers not consuming.",
     "max(hig_jobs_oldest_queued_age_seconds)", "s", thresholds((None, GOOD), (120, WARNING), (600, CRITICAL)),
     20, y, decimals=0)
y += 4

# --- Row: traffic & latency -------------------------------------------------------------------------------
row("API - traffic and latency", y)
y += 1
timeseries(
    "Requests by status class", "Requests per second grouped by status class.",
    [target(f"sum by (status) (rate({req}[{rate}]))", "{{status}}")], "reqps", 0, y,
    overrides=[fixed("2xx", GOOD), fixed("3xx", NEUTRAL), fixed("4xx", WARNING), fixed("5xx", CRITICAL)],
)
timeseries(
    "Latency quantiles", "p50 / p95 / p99 from http_request_duration_highr_seconds.",
    [
        target(f"histogram_quantile(0.50, sum by (le) (rate({highr}[{rate}])))", "p50", "A"),
        target(f"histogram_quantile(0.95, sum by (le) (rate({highr}[{rate}])))", "p95", "B"),
        target(f"histogram_quantile(0.99, sum by (le) (rate({highr}[{rate}])))", "p99", "C"),
    ],
    "s", 12, y,
    overrides=[fixed("p50", BLUE_250), fixed("p95", BLUE_450), fixed("p99", BLUE_600)],
)
y += 8
timeseries(
    "5xx ratio", "Share of 5xx responses; dashed lines mark the warning (2%) and critical (5%) alert thresholds.",
    [target(f"(sum(rate({req5}[{rate}])) or vector(0)) / sum(rate({req}[{rate}]))", "5xx ratio")],
    "percentunit", 0, y, single=True,
    overrides=[fixed("5xx ratio", CRITICAL)],
    th=thresholds((None, "transparent"), (0.02, WARNING), (0.05, CRITICAL)),
)
timeseries(
    "Top routes by request rate", "Eight busiest route templates (requests per second).",
    [target(f"topk(8, sum by (handler) (rate({req}[{rate}])))", "{{handler}}")], "reqps", 12, y,
)
y += 8
timeseries(
    "Slowest routes (p95)",
    "Per-route p95 from the coarse default buckets (0.1 / 0.5 / 1 s): use to find slow routes, not for SLOs.",
    [target(f"topk(8, histogram_quantile(0.95, sum by (handler, le) (rate({lowr}[{rate}]))))", "{{handler}}")],
    "s", 0, y,
)
timeseries(
    "5xx by route", "Routes returning 5xx (requests per second).",
    [target(f"topk(8, sum by (handler) (rate({req5}[{rate}])) > 0)", "{{handler}}")], "reqps", 12, y,
)
y += 8

# --- Row: background jobs, payments, settlements (sql_exporter) ------------------------------------------
row("Background jobs, payments and settlements (sql_exporter)", y)
y += 1
timeseries(
    "Due jobs by task", "hig_jobs_queued: due queued jobs per task (top 8).",
    [target("topk(8, sum by (task_name) (hig_jobs_queued))", "{{task_name}}")], "none", 0, y, decimals=0,
)
timeseries(
    "Dead and failed jobs (last hour)",
    "hig_jobs_dead_recent (retries exhausted) and hig_jobs_failed_recent (PermanentJobError) per task.",
    [
        target("sum by (task_name) (hig_jobs_dead_recent)", "dead: {{task_name}}", "A"),
        target("sum by (task_name) (hig_jobs_failed_recent)", "failed: {{task_name}}", "B"),
    ],
    "none", 12, y, decimals=0,
)
y += 8
timeseries(
    "Payment webhooks", "Stored events failing processing, waiting > 10 min, and invalid signatures (last hour) per gateway.",
    [
        target("sum by (gateway) (hig_webhook_events_failing)", "failing: {{gateway}}", "A"),
        target("sum by (gateway) (hig_webhook_events_unprocessed)", "backlog: {{gateway}}", "B"),
        target("sum by (gateway) (hig_webhook_events_invalid_signature_recent)", "invalid signature: {{gateway}}", "C"),
    ],
    "none", 0, y, decimals=0,
)
timeseries(
    "Settlements and payouts",
    "Partially failed batches (24 h), batches stuck in processing (> 2 h), batches awaiting approval, failed payouts (24 h).",
    [
        target("max(hig_settlement_batches_failed_recent_total)", "batches partially failed (24h)", "A"),
        target("max(hig_settlement_batches_stuck_total)", "batches stuck processing", "B"),
        target("max(hig_settlement_batches_pending_approval_total)", "batches awaiting approval", "C"),
        target("sum(hig_payouts_failed_recent)", "payouts failed (24h)", "D"),
    ],
    "none", 12, y, decimals=0,
)
y += 8
timeseries(
    "AI screening requests by status (15 min window)",
    "ai_request_logs by status: ok, fallback (rules engine), error, refusal.",
    [target("sum by (status) (hig_ai_requests_recent)", "{{status}}")], "none", 0, y, decimals=0,
    overrides=[fixed("ok", GOOD), fixed("fallback", WARNING), fixed("error", CRITICAL), fixed("refusal", SERIOUS)],
)
timeseries(
    "Ledger imbalance", "Sum of debits minus credits over all ledger entries (must stay 0; refreshed every 15 min).",
    [target("max(hig_ledger_imbalance_minor)", "imbalance (minor units)")], "none", 12, y, single=True,
    decimals=0, overrides=[fixed("imbalance (minor units)", CRITICAL)],
)
y += 8

# --- Row: data stores --------------------------------------------------------------------------------------
row("PostgreSQL and Redis", y)
y += 1
timeseries(
    "PostgreSQL connections", "Client connections by state (sql_exporter, pg_stat_activity) against max_connections (dashed).",
    [
        target("sum by (state) (hig_db_connections)", "{{state}}", "A"),
        target("max(hig_db_max_connections)", "max_connections", "B"),
    ],
    "none", 0, y, decimals=0,
    overrides=[fixed("max_connections", NEUTRAL, dashed=True)],
)
timeseries(
    "Redis memory used", "redis_memory_used_bytes / redis_memory_max_bytes per node (allkeys-lru evicts near 100%).",
    [target("redis_memory_used_bytes / (redis_memory_max_bytes > 0)", "{{instance}}")], "percentunit", 12, y,
    th=thresholds((None, "transparent"), (0.85, WARNING)),
)
y += 8

dashboard = {
    "annotations": {"list": [{
        "builtIn": 1, "datasource": {"type": "grafana", "uid": "-- Grafana --"}, "enable": True, "hide": True,
        "iconColor": "rgba(0, 211, 255, 1)", "name": "Annotations & Alerts", "type": "dashboard",
    }]},
    "description": "Heal India Global API: traffic, errors, latency, background jobs, payments, settlements, DB and Redis.",
    "editable": True,
    "fiscalYearStartMonth": 0,
    "graphTooltip": 1,
    "id": None,
    "links": [],
    "panels": panels,
    "refresh": "30s",
    "schemaVersion": 39,
    "tags": ["heal-india-global", "api"],
    "templating": {"list": [
        {
            "name": "datasource", "label": "Data source", "type": "datasource", "query": "prometheus",
            "current": {}, "hide": 0, "includeAll": False, "multi": False, "options": [], "refresh": 1, "regex": "",
        },
        {
            "name": "job", "label": "API job", "type": "query", "datasource": DS,
            "definition": "label_values(http_requests_total, job)",
            "query": "label_values(http_requests_total, job)",
            "current": {"selected": True, "text": "hig-api", "value": "hig-api"},
            "hide": 0, "includeAll": False, "multi": False, "options": [], "refresh": 2, "regex": "", "sort": 1,
        },
        {
            "name": "instance", "label": "Instance", "type": "query", "datasource": DS,
            "definition": 'label_values(http_requests_total{job="$job"}, instance)',
            "query": 'label_values(http_requests_total{job="$job"}, instance)',
            "current": {"selected": True, "text": ["All"], "value": ["$__all"]},
            "hide": 0, "includeAll": True, "allValue": ".*", "multi": True, "options": [], "refresh": 2,
            "regex": "", "sort": 1,
        },
    ]},
    "time": {"from": "now-6h", "to": "now"},
    "timepicker": {},
    "timezone": "browser",
    "title": "Heal India Global - API overview",
    "uid": "hig-api-overview",
    "version": 1,
    "weekStart": "",
}

OUT.write_text(json.dumps(dashboard, indent=2) + "\n", encoding="utf-8", newline="\n")
print(f"wrote {OUT} with {len(panels)} panels")
