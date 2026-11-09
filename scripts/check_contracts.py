#!/usr/bin/env python3
"""Cross-check the Heal India Global API contract: backend routes vs client calls vs docs/PLAN.md.

Sources (each is optional - the tool works on partial trees and says what it could not find):

* backend - the real routes: ``app.main:app`` is imported in the backend venv (every effective route, incl.
  ones hidden from the schema and the WebSocket, cross-checked with ``app.openapi()``). If that import fails,
  each ``app.modules.<x>.router`` is imported on its own, and modules that still fail (or a missing venv) fall
  back to an ``ast`` scan of ``backend/app/**/*.py`` (decorators, ``APIRouter`` prefixes, ``include_router``).
* web - endpoint wrappers in ``web/packages/shared/src/api/endpoints/*.ts`` plus any other ``api.get(...)``
  style call under ``web/packages/shared/src`` and ``web/apps/*/src`` (paths are relative to ``/api/v1``).
* mobile - dio / ApiClient calls in ``mobile/lib/core/repositories/*.dart`` and anywhere under ``mobile/lib``.
* PLAN - every ``METHOD `/path``` in the section 8 tables and paragraphs (``CRUD``, ``GET/POST``, sibling
  shorthands like ``· `/reject``` and ``approve|reject`` are expanded), plus endpoints with an explicit method
  elsewhere in the document (e.g. 3.1 staff door, 7.1 docai, 7.2 voice; ``--plan-section8-only`` to skip).

Severities: CRITICAL = a client calls something the backend does not serve (missing path or wrong method);
WARNING = PLAN endpoint not implemented / implemented with another method, duplicate or shadowed routes,
import problems; INFO = backend routes not in the PLAN and other notes. Exit status 1 when there is a
CRITICAL finding (see ``--fail-on``), else 0; 2 on usage errors.

Examples::

    python scripts/check_contracts.py                 # text report
    python scripts/check_contracts.py --json > contracts.json
    python scripts/check_contracts.py --backend-mode ast --max-items 0
    python scripts/check_contracts.py --inventory      # also list every route / call / PLAN endpoint found

Only the standard library is needed to run it; the backend venv is used (as a subprocess) for the import step.
Nothing from ``backend/.env`` is printed: error text coming back from the import is scrubbed of its values.
"""

from __future__ import annotations

import argparse
import ast
import bisect
import itertools
import json
import os
import re
import shutil
import subprocess
import sys
import textwrap
import time
from collections import defaultdict
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

DEFAULT_ROOT = Path(__file__).resolve().parents[1]
API_PREFIX = "/api/v1"
HTTP_METHODS = ("GET", "POST", "PUT", "PATCH", "DELETE")
IGNORED_METHODS = {"HEAD", "OPTIONS"}
PARAM = "{}"
WILDCARD = "{**}"
SENTINEL = "\x00"
MARK = "@@HIG_CONTRACTS@@"
UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$")
FRAMEWORK_ROUTE_SUFFIXES = ("/oauth2-redirect",)
SEVERITY_ORDER = ("CRITICAL", "WARNING", "INFO")

CATEGORIES: dict[str, tuple[str, str]] = {
    "client_route_missing": ("CRITICAL", "client calls with no backend route"),
    "client_method_mismatch": (
        "CRITICAL",
        "client calls a backend path with a method it does not serve (405)",
    ),
    "backend_import_failed": ("WARNING", "app.main:app does not import - the API cannot start"),
    "backend_syntax_error": ("WARNING", "Python syntax errors under backend/app"),
    "openapi_failed": ("WARNING", "app.openapi() raises - /api/openapi.json and /api/docs would fail"),
    "client_weak_match": (
        "WARNING",
        "client path only matched by a generic {param} route (literal used as id?)",
    ),
    "trailing_slash_mismatch": (
        "WARNING",
        "client and backend differ only by a trailing slash (307 redirect)",
    ),
    "backend_duplicate_route": (
        "WARNING",
        "same method + path registered more than once (the first one wins)",
    ),
    "backend_shadowed_route": (
        "WARNING",
        "unreachable route: an earlier {param} route captures its requests",
    ),
    "backend_unmounted_router": ("WARNING", "router with routes that is never included into the app"),
    "plan_method_mismatch": ("WARNING", "PLAN path is served, but not with the PLAN's method"),
    "plan_not_implemented": ("WARNING", "PLAN endpoints not implemented by the backend"),
    "plan_optional_not_implemented": (
        "INFO",
        "CRUD-derived 'read one' endpoints (GET /x/{id}) not implemented",
    ),
    "plan_weak_match": ("INFO", "PLAN literal path served only by a generic {param} route"),
    "field_request_rejected": ("CRITICAL", "client sends fields the backend schema forbids (422)"),
    "field_required_missing": ("CRITICAL", "client never sends a field/param the backend requires (422)"),
    "field_content_type": ("CRITICAL", "client sends another body encoding than the backend reads"),
    "field_request_ignored": ("WARNING", "client sends fields the backend does not read (silently dropped)"),
    "field_query_unknown": ("WARNING", "client sends query params the backend does not accept (ignored)"),
    "field_response_unknown": ("WARNING", "client model expects response fields the backend never sends"),
    "field_response_optional_unknown": (
        "INFO",
        "client type declares optional response fields the backend never sends",
    ),
    "backend_not_in_plan": ("INFO", "backend routes not described in the PLAN"),
}


# =========================================================================================================
# small utilities
# =========================================================================================================
def rel_path(path: Path, root: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return path.as_posix()


def read_dotenv(path: Path) -> dict[str, str]:
    """python-dotenv compatible enough for redaction purposes (values never leave this process)."""
    values: dict[str, str] = {}
    try:
        text = path.read_text(encoding="utf-8-sig")
    except OSError:
        return values
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        key, sep, value = line.partition("=")
        if not sep:
            continue
        value = value.strip()
        if value[:1] in ("'", '"') and value.endswith(value[0]) and len(value) >= 2:
            value = value[1:-1]
        else:
            comment = re.search(r"\s#", value)
            if comment:
                value = value[: comment.start()].rstrip()
        values[key.strip()] = value
    return values


_SECRET_KEY_RE = re.compile(r"SECRET|PASSW|KEY|TOKEN|DATABASE_URL|REDIS_URL|DSN|PRIVATE|CREDENTIAL", re.IGNORECASE)
_URL_PASSWORD_RE = re.compile(r"^[a-z][a-z0-9+.-]*://[^:/@\s]*:([^@/\s]+)@", re.IGNORECASE)


class Redactor:
    """Masks secret values of backend/.env (and secret-looking env vars) in any text we print or store."""

    def __init__(self, env_file: Path) -> None:
        needles: set[str] = set()
        for key, value in read_dotenv(env_file).items():
            self._add(needles, key, value)
        for key, value in os.environ.items():
            if _SECRET_KEY_RE.search(key):
                self._add(needles, key, value)
        self.needles = sorted(needles, key=len, reverse=True)

    @staticmethod
    def _add(needles: set[str], key: str, value: str) -> None:
        value = value.strip()
        password = _URL_PASSWORD_RE.match(value)
        if password and len(password.group(1)) >= 3:
            needles.add(password.group(1))
        if _SECRET_KEY_RE.search(key) and len(value) >= 4:
            needles.add(value)

    def __call__(self, text: str | None) -> str:
        if not text:
            return text or ""
        for needle in self.needles:
            if needle in text:
                text = text.replace(needle, "***")
        return text


# =========================================================================================================
# path patterns + matching
# =========================================================================================================
@dataclass
class PathPattern:
    display: str
    segs: tuple[str, ...]
    types: tuple[Any, ...]  # None for literal segments, dict for parameters
    trailing_slash: bool = False

    @property
    def key(self) -> str:
        return "/" + "/".join(self.segs)


_ROUTE_PARAM_RE = re.compile(r"^\{([^{}:]+)(?::([^{}]+))?\}$")


def pattern_from_route(path: str, param_types: dict[str, Any] | None = None) -> PathPattern:
    """Backend route path (FastAPI syntax) -> pattern with per-parameter type info."""
    segs: list[str] = []
    types: list[Any] = []
    for raw in (p for p in path.split("/") if p):
        m = _ROUTE_PARAM_RE.match(raw)
        if m:
            name, conv = m.group(1).strip(), (m.group(2) or "").strip().lower()
            if conv == "path":
                segs.append(WILDCARD)
                types.append({"type": "path", "name": name, "convertor": "path"})
                continue
            info = dict((param_types or {}).get(name) or {"type": "unknown"})
            if conv in ("int", "float", "uuid"):
                info = {"type": conv, "convertor": conv}
            info["name"] = name
            segs.append(PARAM)
            types.append(info)
        elif "{" in raw and "}" in raw:
            segs.append(PARAM)
            types.append({"type": "unknown", "name": raw})
        else:
            segs.append(raw)
            types.append(None)
    return PathPattern(path, tuple(segs), tuple(types), len(path) > 1 and path.endswith("/"))


def _is_template_param(seg: str) -> bool:
    return (
        SENTINEL in seg
        or seg.startswith(":")
        or seg == "*"
        or (seg.startswith("{") and seg.endswith("}"))
        or (seg.startswith("<") and seg.endswith(">"))
    )


def pattern_from_template(path: str, display: str | None = None) -> PathPattern:
    """PLAN / client path (``{id}``, ``:id``, ``<id>`` or SENTINEL placeholders) -> pattern."""
    segs = tuple(PARAM if _is_template_param(p) else p for p in path.split("/") if p)
    return PathPattern(display or path, segs, tuple(None for _ in segs), len(path) > 1 and path.endswith("/"))


def match_path(concrete: PathPattern, route: PathPattern, *, dynamic_vs_literal_ok: bool) -> str | None:
    """Does a request built from ``concrete`` land on backend ``route``? -> 'strong' | 'weak' | None.

    literal==literal and param~param are strong. A concrete literal against a route parameter depends on the
    parameter's type (uuid/int reject words, enums accept their values, str/unknown is 'weak'). A concrete
    parameter against a route literal is accepted only when ``dynamic_vs_literal_ok`` (client code that builds
    e.g. ``/admin/hospitals/${id}/${action}``).
    """
    c, r = concrete.segs, route.segs
    quality = "strong"
    for i, rseg in enumerate(r):
        if rseg == WILDCARD:
            return quality if len(c) >= i else None
        if i >= len(c):
            return None
        cseg = c[i]
        if cseg in (PARAM, WILDCARD):
            if rseg == PARAM:
                continue
            if not dynamic_vs_literal_ok:
                return None
            continue
        if rseg == PARAM:
            info = route.types[i] or {}
            kind = info.get("type", "unknown")
            if kind == "uuid":
                if UUID_RE.match(cseg):
                    continue
                return None
            if kind == "int":
                if cseg.isdigit():
                    continue
                return None
            if kind == "float":
                if re.fullmatch(r"-?\d+(\.\d+)?", cseg):
                    continue
                return None
            if kind == "enum":
                if cseg in info.get("values", ()):
                    continue
                return None
            quality = "weak"
            continue
        if cseg != rseg:
            return None
    return quality if len(c) == len(r) else None


def shadows(earlier: PathPattern, later: PathPattern) -> bool:
    """Starlette-level check: does every request for ``later`` match ``earlier`` first?"""
    a, b = earlier.segs, later.segs
    generalised = False
    for i, aseg in enumerate(a):
        if aseg == WILDCARD:
            return len(b) > i and a != b
        if i >= len(b):
            return False
        bseg = b[i]
        if aseg == PARAM:
            conv = (earlier.types[i] or {}).get("convertor")
            if bseg in (PARAM, WILDCARD):
                later_conv = (later.types[i] or {}).get("convertor")
                if conv and conv != later_conv:
                    return False
                continue
            if conv == "int" and not bseg.isdigit():
                return False
            if conv == "uuid" and not UUID_RE.match(bseg):
                return False
            if conv == "float" and not re.fullmatch(r"-?\d+(\.\d+)?", bseg):
                return False
            generalised = True
            continue
        if bseg != aseg:
            return False
    return generalised and len(a) == len(b)


def method_ok(call_method: str, route_method: str) -> bool:
    if route_method == "*":
        return call_method != "WS"
    if call_method == "ANY":
        return route_method != "WS"
    return call_method == route_method


# =========================================================================================================
# backend: import helper (runs inside the backend venv)
# =========================================================================================================
_IMPORT_HELPER = r'''
import enum, importlib, inspect, json, sys, traceback, types, typing, uuid
from pathlib import Path

MARK = "@@HIG_CONTRACTS@@"
BACKEND = Path.cwd().resolve()


def describe(ann, depth=0):
    try:
        if depth > 5 or ann is None:
            return {"type": "unknown"}
        origin = typing.get_origin(ann)
        if origin is typing.Annotated:
            return describe(typing.get_args(ann)[0], depth + 1)
        if ann is uuid.UUID:
            return {"type": "uuid"}
        if ann is bool:
            return {"type": "enum", "values": ["true", "false", "1", "0"]}
        if ann is int:
            return {"type": "int"}
        if ann is float:
            return {"type": "float"}
        if ann is str:
            return {"type": "str"}
        if isinstance(ann, type) and issubclass(ann, enum.Enum):
            return {"type": "enum", "values": [str(m.value) for m in ann]}
        if origin is typing.Literal:
            return {"type": "enum", "values": [str(a) for a in typing.get_args(ann)]}
        if origin is typing.Union or (hasattr(types, "UnionType") and origin is types.UnionType):
            kinds = [describe(a, depth + 1) for a in typing.get_args(ann) if a is not type(None)]
            if len(kinds) == 1:
                return kinds[0]
            if all(k["type"] == "enum" for k in kinds):
                return {"type": "enum", "values": sorted({v for k in kinds for v in k["values"]})}
            if any(k["type"] in ("str", "unknown") for k in kinds):
                return {"type": "str"}
            return {"type": "unknown"}
        if isinstance(ann, type) and issubclass(ann, str):
            return {"type": "str"}
        return {"type": "unknown", "repr": repr(ann)[:80]}
    except Exception:
        return {"type": "unknown"}


def location(fn):
    try:
        fn = inspect.unwrap(fn)
        src = Path(inspect.getsourcefile(fn)).resolve()
        line = fn.__code__.co_firstlineno
        try:
            rel = "backend/" + src.relative_to(BACKEND).as_posix()
        except ValueError:
            rel = src.as_posix()
        return f"{rel}:{line}"
    except Exception:
        return None


def path_params(route):
    out = {}
    try:
        dep = route.dependant
        try:
            from fastapi.dependencies.utils import get_flat_dependant
            dep = get_flat_dependant(dep)
        except Exception:
            pass
        for p in dep.path_params:
            ann = getattr(getattr(p, "field_info", None), "annotation", None)
            if ann is None:
                ann = getattr(p, "type_", None)
            out[getattr(p, "alias", None) or p.name] = describe(ann)
    except Exception:
        pass
    return out


def entries(orig, ctx, prefix):
    """One route -> records. ``ctx`` is FastAPI's effective route context (prefixes applied), if any."""
    from starlette.routing import Mount, Route, WebSocketRoute
    try:
        from fastapi.routing import APIRoute
    except Exception:
        APIRoute = None
    src = ctx if ctx is not None else orig
    path = prefix + (getattr(src, "path", None) or getattr(orig, "path", "") or "")
    name = getattr(src, "name", None) or getattr(orig, "name", None)
    endpoint = getattr(src, "endpoint", None) or getattr(orig, "endpoint", None)
    if APIRoute is not None and isinstance(orig, APIRoute):
        has_dep = getattr(src, "dependant", None) is not None
        in_schema = getattr(src, "include_in_schema", None)
        return [{"path": path, "methods": sorted(getattr(src, "methods", None) or orig.methods or []),
                 "name": name, "in_schema": bool(orig.include_in_schema if in_schema is None else in_schema),
                 "location": location(endpoint), "params": path_params(src if has_dep else orig)}]
    if isinstance(orig, WebSocketRoute):
        return [{"path": path, "methods": ["WS"], "name": name, "in_schema": False,
                 "location": location(endpoint), "params": {}}]
    if isinstance(orig, Mount):
        sub = list(getattr(orig, "routes", None) or [])
        if sub:
            out = []
            collect(sub, path, out)
            return out
        return [{"path": path.rstrip("/") + "/{path:path}", "methods": ["*"], "name": name,
                 "in_schema": False, "location": None, "params": {}, "mount": True}]
    if isinstance(orig, Route):
        return [{"path": path, "methods": sorted(getattr(src, "methods", None) or orig.methods or ["GET"]),
                 "name": name, "in_schema": bool(getattr(orig, "include_in_schema", False)),
                 "location": location(endpoint), "params": {}}]
    return []


def collect(routes, prefix, out):
    routes = list(routes)
    try:  # newer FastAPI (0.156 here) nests included routers (_IncludedRouter); this yields effective routes
        from fastapi.routing import iter_route_contexts
    except Exception:
        iter_route_contexts = None
    if iter_route_contexts is None:
        for r in routes:
            out.extend(entries(r, None, prefix))
        return
    for ctx in iter_route_contexts(routes):
        out.extend(entries(ctx.original_route, ctx, prefix))
    for r in routes:  # low-priority routes of included routers are matched last and not yielded above
        low = getattr(r, "effective_low_priority_routes", None)
        if callable(low):
            try:
                for ctx in low():
                    out.extend(entries(ctx.original_route, ctx, prefix))
            except Exception:
                pass


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "app"
    out = {"ok": False, "mode": mode}
    if mode == "app":
        try:
            app = importlib.import_module("app.main").app
        except BaseException as exc:
            out["error"] = f"{type(exc).__name__}: {exc}"
            out["traceback"] = traceback.format_exc()[-4000:]
            print(MARK + json.dumps(out, default=str))
            return
        routes = []
        collect(app.routes, "", routes)
        out["routes"] = routes
        try:
            schema = app.openapi()
            out["openapi"] = schema
            out["openapi_paths"] = {
                p: sorted(k.upper() for k in item if k.lower() in ("get", "post", "put", "patch", "delete"))
                for p, item in (schema.get("paths") or {}).items()
            }
        except BaseException as exc:
            out["openapi_error"] = f"{type(exc).__name__}: {exc}"
            out["openapi_traceback"] = traceback.format_exc()[-3000:]
        out["ok"] = True
    else:
        names = [n for n in (sys.argv[2] if len(sys.argv) > 2 else "").split(",") if n]
        out["modules"] = {}
        for name in names:
            try:
                router = importlib.import_module(f"app.modules.{name}.router").router
                routes = []
                collect(router.routes, "", routes)
                out["modules"][name] = {"ok": True, "routes": routes}
            except BaseException as exc:
                out["modules"][name] = {"ok": False, "error": f"{type(exc).__name__}: {exc}",
                                        "traceback": traceback.format_exc()[-3000:]}
        out["ok"] = True
    print(MARK + json.dumps(out, default=str))


main()
'''


def run_import_helper(python: Path, backend_dir: Path, args: list[str], timeout: float) -> dict[str, Any]:
    env = dict(os.environ)
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    env.pop("PYTHONSTARTUP", None)
    try:
        proc = subprocess.run(
            [str(python), "-", *args],
            input=_IMPORT_HELPER,
            cwd=str(backend_dir),
            env=env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"importing the app timed out after {timeout:.0f}s"}
    except OSError as exc:
        return {"ok": False, "error": f"cannot run {python}: {exc}"}
    for line in reversed(proc.stdout.splitlines()):
        if line.startswith(MARK):
            try:
                return json.loads(line[len(MARK) :])
            except ValueError as exc:
                return {"ok": False, "error": f"unreadable helper output: {exc}"}
    tail = (proc.stderr or proc.stdout or "").strip().splitlines()[-12:]
    return {
        "ok": False,
        "error": f"helper exited with {proc.returncode} without a result",
        "traceback": "\n".join(tail),
    }


# =========================================================================================================
# backend: AST fallback
# =========================================================================================================
ROUTE_DECORATORS: dict[str, list[str] | None] = {
    "get": ["GET"],
    "post": ["POST"],
    "put": ["PUT"],
    "patch": ["PATCH"],
    "delete": ["DELETE"],
    "head": ["HEAD"],
    "options": ["OPTIONS"],
    "trace": ["TRACE"],
    "api_route": None,
    "route": None,
    "websocket": ["WS"],
    "websocket_route": ["WS"],
}
ADD_ROUTE_CALLS: dict[str, list[str] | None] = {
    "add_api_route": None,
    "add_route": None,
    "add_api_websocket_route": ["WS"],
    "add_websocket_route": ["WS"],
}


def _dotted(node: ast.AST | None) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        base = _dotted(node.value)
        return f"{base}.{node.attr}" if base else node.attr
    return ""


@dataclass
class _PyModule:
    name: str
    rel: str
    is_pkg: bool
    tree: ast.Module
    nodes: list[ast.AST] = field(default_factory=list)  # one cached ast.walk()
    aliases: dict[str, tuple[str, str]] = field(default_factory=dict)
    mod_aliases: dict[str, str] = field(default_factory=dict)
    consts: dict[str, str] = field(default_factory=dict)
    loops: dict[str, list[ast.expr]] = field(default_factory=dict)
    routers: dict[str, dict[str, Any]] = field(default_factory=dict)
    routes: list[dict[str, Any]] = field(default_factory=list)
    includes: list[dict[str, Any]] = field(default_factory=list)
    functions: dict[str, ast.AST] = field(default_factory=dict)


class BackendAstScanner:
    """Static view of the FastAPI app: routers, their prefixes, include chains and route decorators."""

    def __init__(self, backend_dir: Path) -> None:
        self.backend_dir = backend_dir
        self.modules: dict[str, _PyModule] = {}
        self.enums: dict[str, list[str]] = {}
        self.syntax_errors: list[str] = []
        self.notes: list[str] = []
        self.mount_prefix: dict[tuple[str, str], str] = {}
        self.visit_order: dict[tuple[str, str], int] = {}
        self.unmounted: list[dict[str, Any]] = []
        self.assumed: list[tuple[str, str]] = []

    # ---- parsing -----------------------------------------------------------------------------------------
    def scan(self) -> None:
        app_dir = self.backend_dir / "app"
        for path in sorted(app_dir.rglob("*.py")):
            if "__pycache__" in path.parts:
                continue
            rel = path.relative_to(self.backend_dir).as_posix()
            parts = list(path.relative_to(self.backend_dir).with_suffix("").parts)
            is_pkg = parts[-1] == "__init__"
            if is_pkg:
                parts = parts[:-1]
            try:
                source = path.read_text(encoding="utf-8-sig")
                tree = ast.parse(source, filename=rel)
            except SyntaxError as exc:
                self.syntax_errors.append(f"backend/{rel}:{exc.lineno}: {exc.msg}")
                continue
            except (OSError, UnicodeDecodeError, ValueError) as exc:
                self.notes.append(f"cannot read backend/{rel}: {type(exc).__name__}")
                continue
            self.modules[".".join(parts)] = _PyModule(
                ".".join(parts), rel, is_pkg, tree, list(ast.walk(tree))
            )
        for mod in self.modules.values():
            self._collect_enums(mod)
        for mod in self.modules.values():
            self._analyse(mod)

    def _collect_enums(self, mod: _PyModule) -> None:
        for node in mod.nodes:
            if not isinstance(node, ast.ClassDef):
                continue
            if not any(_dotted(b).split(".")[-1].endswith("Enum") for b in node.bases):
                continue
            values = []
            for stmt in node.body:
                if isinstance(stmt, ast.Assign) and isinstance(stmt.value, ast.Constant):
                    if isinstance(stmt.value.value, (str, int)) and not isinstance(stmt.value.value, bool):
                        values.append(str(stmt.value.value))
            if values:
                self.enums[node.name] = values

    def _str(self, node: ast.AST | None, mod: _PyModule) -> str | None:
        if node is None:
            return None
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            return node.value
        if isinstance(node, ast.Name):
            return mod.consts.get(node.id)
        if isinstance(node, ast.JoinedStr):
            out = []
            for value in node.values:
                if isinstance(value, ast.Constant) and isinstance(value.value, str):
                    out.append(value.value)
                elif isinstance(value, ast.FormattedValue):
                    inner = self._str(value.value, mod)
                    if inner is None:
                        return None
                    out.append(inner)
                else:
                    return None
            return "".join(out)
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
            left, right = self._str(node.left, mod), self._str(node.right, mod)
            return None if left is None or right is None else left + right
        if isinstance(node, ast.IfExp):
            return self._str(node.body, mod)
        return None

    def _methods_kw(self, call: ast.Call, mod: _PyModule) -> list[str] | None:
        for kw in call.keywords:
            if kw.arg == "methods" and isinstance(kw.value, (ast.List, ast.Tuple, ast.Set)):
                found = [self._str(e, mod) for e in kw.value.elts]
                return [m.upper() for m in found if m]
        return None

    def _classify(self, node: ast.AST | None) -> dict[str, Any]:
        if node is None:
            return {"type": "unknown"}
        if isinstance(node, ast.Constant) and isinstance(node.value, str):  # string annotation
            try:
                return self._classify(ast.parse(node.value, mode="eval").body)
            except SyntaxError:
                return {"type": "unknown"}
        if isinstance(node, ast.Subscript):
            base = _dotted(node.value).split(".")[-1]
            elts = list(node.slice.elts) if isinstance(node.slice, ast.Tuple) else [node.slice]
            if base == "Annotated" and elts:
                return self._classify(elts[0])
            if base == "Literal":
                return {"type": "enum", "values": [str(e.value) for e in elts if isinstance(e, ast.Constant)]}
            if base == "Optional" and elts:
                return self._classify(elts[0])
            return {"type": "unknown"}
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.BitOr):
            parts = [
                p for p in (node.left, node.right) if not (isinstance(p, ast.Constant) and p.value is None)
            ]
            if len(parts) == 1:
                return self._classify(parts[0])
            return {"type": "str"}
        name = _dotted(node).split(".")[-1]
        if name in ("UUID", "UUID1", "UUID4", "UUID7"):
            return {"type": "uuid"}
        if name == "int":
            return {"type": "int"}
        if name == "float":
            return {"type": "float"}
        if name == "str":
            return {"type": "str"}
        if name in self.enums:
            return {"type": "enum", "values": self.enums[name]}
        return {"type": "unknown"}

    def _param_types(self, func: ast.AST | None) -> dict[str, Any]:
        if not isinstance(func, (ast.FunctionDef, ast.AsyncFunctionDef)):
            return {}
        out: dict[str, Any] = {}
        for arg in [*func.args.posonlyargs, *func.args.args, *func.args.kwonlyargs]:
            if arg.annotation is not None:
                out[arg.arg] = self._classify(arg.annotation)
        return out

    def _analyse(self, mod: _PyModule) -> None:
        package = mod.name if mod.is_pkg else mod.name.rpartition(".")[0]
        tree = mod.tree
        for node in mod.nodes:
            if isinstance(node, ast.ImportFrom):
                if node.level:
                    base_parts = package.split(".") if package else []
                    if node.level > 1:
                        base_parts = base_parts[: max(0, len(base_parts) - (node.level - 1))]
                    base = ".".join(base_parts + ([node.module] if node.module else []))
                else:
                    base = node.module or ""
                for alias in node.names:
                    if alias.name != "*":
                        mod.aliases[alias.asname or alias.name] = (base, alias.name)
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.asname:
                        mod.mod_aliases[alias.asname] = alias.name
                    else:
                        mod.mod_aliases[alias.name] = alias.name
            elif isinstance(node, ast.For) and isinstance(node.target, ast.Name):
                if isinstance(node.iter, (ast.Tuple, ast.List)):
                    mod.loops[node.target.id] = list(node.iter.elts)
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                mod.functions.setdefault(node.name, node)
        for node in tree.body:
            target, value = None, None
            if isinstance(node, ast.Assign) and len(node.targets) == 1:
                target, value = node.targets[0], node.value
            elif isinstance(node, ast.AnnAssign) and node.value is not None:
                target, value = node.target, node.value
            if isinstance(target, ast.Name):
                text = self._str(value, mod)
                if text is not None:
                    mod.consts[target.id] = text
        for node in mod.nodes:
            targets: list[ast.expr] = []
            value: ast.AST | None = None
            if isinstance(node, ast.Assign):
                targets, value = list(node.targets), node.value
            elif isinstance(node, ast.AnnAssign) and node.value is not None:
                targets, value = [node.target], node.value
            if not isinstance(value, ast.Call):
                continue
            ctor = _dotted(value.func).split(".")[-1]
            if ctor not in ("APIRouter", "FastAPI"):
                continue
            kwargs = {k.arg: k.value for k in value.keywords if k.arg}
            info: dict[str, Any] = {
                "kind": "app" if ctor == "FastAPI" else "router",
                "prefix": (self._str(kwargs.get("prefix"), mod) or "") if "prefix" in kwargs else "",
                "line": node.lineno,
                "docs": self._docs_routes(kwargs, mod) if ctor == "FastAPI" else [],
            }
            for t in targets:
                if isinstance(t, ast.Name):
                    mod.routers[t.id] = info
        for node in mod.nodes:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                for dec in node.decorator_list:
                    if not (isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute)):
                        continue
                    if dec.func.attr not in ROUTE_DECORATORS:
                        continue
                    path_node = (
                        dec.args[0]
                        if dec.args
                        else next((k.value for k in dec.keywords if k.arg == "path"), None)
                    )
                    methods = ROUTE_DECORATORS[dec.func.attr] or self._methods_kw(dec, mod) or ["GET"]
                    mod.routes.append(
                        {
                            "owner": dec.func.value,
                            "path": self._str(path_node, mod),
                            "methods": methods,
                            "line": dec.lineno,
                            "func": node,
                        }
                    )
            elif isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                attr = node.func.attr
                kwargs = {k.arg: k.value for k in node.keywords if k.arg}
                if attr == "include_router":
                    child = node.args[0] if node.args else kwargs.get("router")
                    prefix = self._str(kwargs.get("prefix"), mod) if "prefix" in kwargs else ""
                    mod.includes.append(
                        {
                            "owner": node.func.value,
                            "child": child,
                            "prefix": prefix or "",
                            "line": node.lineno,
                            "prefix_unknown": prefix is None,
                        }
                    )
                elif attr in ADD_ROUTE_CALLS:
                    path_node = node.args[0] if node.args else kwargs.get("path")
                    endpoint = node.args[1] if len(node.args) > 1 else kwargs.get("endpoint")
                    func = mod.functions.get(endpoint.id) if isinstance(endpoint, ast.Name) else None
                    methods = ADD_ROUTE_CALLS[attr] or self._methods_kw(node, mod) or ["GET"]
                    mod.routes.append(
                        {
                            "owner": node.func.value,
                            "path": self._str(path_node, mod),
                            "methods": methods,
                            "line": node.lineno,
                            "func": func,
                        }
                    )

    def _docs_routes(self, kwargs: dict[str, ast.AST], mod: _PyModule) -> list[str]:
        out = []
        for key, default in (
            ("openapi_url", "/openapi.json"),
            ("docs_url", "/docs"),
            ("redoc_url", "/redoc"),
        ):
            if key not in kwargs:
                out.append(default)
                continue
            node = kwargs[key]
            if isinstance(node, ast.Constant) and node.value is None:
                continue
            value = self._str(node, mod)
            if value:
                out.append(value)
        return out

    # ---- resolution --------------------------------------------------------------------------------------
    def _resolve_symbol(self, modname: str, symbol: str, depth: int = 0) -> tuple[str, str] | None:
        mod = self.modules.get(modname)
        if mod is None or depth > 6:
            return None
        if symbol in mod.routers:
            return (modname, symbol)
        if symbol in mod.aliases:
            target_mod, target_sym = mod.aliases[symbol]
            return self._resolve_symbol(target_mod, target_sym, depth + 1)
        return None

    def _module_of(self, mod: _PyModule, dotted: str) -> str | None:
        if dotted in mod.mod_aliases:
            return mod.mod_aliases[dotted]
        head, _, rest = dotted.partition(".")
        if head in mod.aliases:
            base, sym = mod.aliases[head]
            candidate = f"{base}.{sym}" + (f".{rest}" if rest else "")
            if candidate in self.modules:
                return candidate
        if dotted in self.modules:
            return dotted
        return None

    def resolve_ref(self, mod: _PyModule, expr: ast.AST | None) -> tuple[str, str] | None:
        if isinstance(expr, ast.Name):
            if expr.id in mod.routers:
                return (mod.name, expr.id)
            if expr.id in mod.aliases:
                base, sym = mod.aliases[expr.id]
                return self._resolve_symbol(base, sym)
            return None
        if isinstance(expr, ast.Attribute):
            modname = self._module_of(mod, _dotted(expr.value))
            if modname:
                return self._resolve_symbol(modname, expr.attr)
        return None

    def api_prefix_hint(self) -> str:
        api = self.modules.get("app.api")
        if api and "api_router" in api.routers and api.routers["api_router"]["prefix"]:
            return api.routers["api_router"]["prefix"]
        return API_PREFIX

    # ---- route table -------------------------------------------------------------------------------------
    def build_routes(self) -> list[dict[str, Any]]:
        own: dict[tuple[str, str], list[tuple[_PyModule, dict[str, Any]]]] = defaultdict(list)
        edges: dict[tuple[str, str], list[tuple[tuple[str, str], str]]] = defaultdict(list)
        for mod in self.modules.values():
            for route in mod.routes:
                key = self.resolve_ref(mod, route["owner"])
                if key is None:
                    owner = _dotted(route["owner"]) or "?"
                    self.notes.append(
                        f"route at backend/{mod.rel}:{route['line']} on '{owner}' could not be "
                        "attributed to a router"
                    )
                    continue
                own[key].append((mod, route))
            for inc in mod.includes:
                parent = self.resolve_ref(mod, inc["owner"])
                child = inc["child"]
                children = (
                    mod.loops.get(child.id, [child])
                    if isinstance(child, ast.Name)
                    and child.id not in mod.routers
                    and child.id not in mod.aliases
                    else [child]
                )
                for ch in children:
                    ckey = self.resolve_ref(mod, ch)
                    if parent and ckey:
                        edges[parent].append((ckey, inc["prefix"]))
                    elif parent:
                        self.notes.append(
                            f"include_router at backend/{mod.rel}:{inc['line']}: cannot resolve "
                            f"'{_dotted(ch) or '?'}'"
                        )
        out: list[dict[str, Any]] = []
        visited: set[tuple[str, str]] = set()
        counter = itertools.count()

        def emit(
            path: str | None,
            methods: list[str],
            location: str,
            params: dict[str, Any],
            key: tuple[str, str],
            assumed: bool,
        ) -> None:
            if path is None:
                self.notes.append(f"route at {location} has a non-literal path (skipped)")
                return
            for method in methods:
                out.append(
                    {
                        "path": path,
                        "method": method.upper(),
                        "location": location,
                        "params": params,
                        "router": f"{key[0]}:{key[1]}",
                        "assumed_mount": assumed,
                        "order": next(counter),
                    }
                )

        def dfs(key: tuple[str, str], acc: str, stack: frozenset[tuple[str, str]], assumed: bool) -> None:
            visited.add(key)
            self.visit_order.setdefault(key, next(counter))
            self.mount_prefix.setdefault(key, acc)
            mod = self.modules[key[0]]
            info = mod.routers[key[1]]
            base = acc + info["prefix"]
            for doc_path in info.get("docs", []):
                emit(doc_path, ["GET"], f"backend/{mod.rel}:{info['line']}", {}, key, assumed)
            for route_mod, route in own.get(key, []):
                emit(
                    None if route["path"] is None else base + route["path"],
                    route["methods"],
                    f"backend/{route_mod.rel}:{route['line']}",
                    self._param_types(route.get("func")),
                    key,
                    assumed,
                )
            for child, prefix in edges.get(key, []):
                if child not in stack:
                    dfs(child, base + prefix, stack | {child}, assumed)

        roots = [
            (m.name, var) for m in self.modules.values() for var, i in m.routers.items() if i["kind"] == "app"
        ]
        roots.sort(key=lambda k: (k != ("app.main", "app"), k))
        for root in roots:
            if root not in visited:
                dfs(root, "", frozenset({root}), False)
        hint = self.api_prefix_hint()
        for mod in list(self.modules.values()):
            for var in mod.routers:
                key = (mod.name, var)
                if key in visited or (not own.get(key) and not edges.get(key)):
                    continue
                if var == "router" and re.fullmatch(r"app\.modules\.[A-Za-z0-9_]+\.router", mod.name):
                    self.assumed.append(key)
                    dfs(key, hint, frozenset({key}), True)
        for mod in self.modules.values():
            for var in mod.routers:
                key = (mod.name, var)
                if key not in visited and own.get(key):
                    self.unmounted.append(
                        {
                            "router": f"{mod.name}:{var}",
                            "location": f"backend/{mod.rel}",
                            "routes": len(own[key]),
                        }
                    )
        return out


# =========================================================================================================
# backend loader (import -> per-module import + ast -> ast)
# =========================================================================================================
@dataclass
class BackendRoute:
    method: str
    pattern: PathPattern
    location: str | None
    origin: str
    order: float
    in_schema: bool | None = None
    name: str | None = None
    note: str = ""


@dataclass
class BackendResult:
    status: str = "missing"  # import | hybrid | ast | missing
    routes: list[BackendRoute] = field(default_factory=list)
    python: str | None = None
    import_error: str | None = None
    import_traceback: str | None = None
    openapi_error: str | None = None
    openapi_paths: int | None = None
    openapi: dict[str, Any] | None = None
    module_status: dict[str, str] = field(default_factory=dict)
    syntax_errors: list[str] = field(default_factory=list)
    unmounted: list[dict[str, Any]] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    order_reliable: bool = True


def _route_records_to_backend(
    records: Iterable[dict[str, Any]], origin: str, prefix: str, start_order: float, step: float = 1.0
) -> list[BackendRoute]:
    out: list[BackendRoute] = []
    order = start_order
    for rec in records:
        for method in rec.get("methods") or []:
            method = method.upper()
            if method in IGNORED_METHODS:
                continue
            path = prefix + rec["path"]
            out.append(
                BackendRoute(
                    method,
                    pattern_from_route(path, rec.get("params")),
                    rec.get("location"),
                    origin,
                    order,
                    rec.get("in_schema"),
                    rec.get("name"),
                    "mount" if rec.get("mount") else "",
                )
            )
            order += step
    return out


def default_backend_python(backend_dir: Path) -> Path | None:
    for candidate in (
        backend_dir / ".venv" / "Scripts" / "python.exe",
        backend_dir / ".venv" / "bin" / "python",
    ):
        if candidate.exists():
            return candidate
    return None


def load_backend(
    root: Path, mode: str, python: Path | None, timeout: float, redact: Redactor
) -> BackendResult:
    backend_dir = root / "backend"
    result = BackendResult()
    if not (backend_dir / "app").is_dir():
        result.notes.append("backend/app not found")
        return result

    # 1) the real thing: import app.main:app in the backend venv
    py = python or default_backend_python(backend_dir)
    if py is not None and not py.exists() and not shutil.which(str(py)):
        result.notes.append(f"interpreter {py} not found")
        py = None
    full: dict[str, Any] = {}
    if mode != "ast" and py is not None:
        result.python = rel_path(py, root)
        full = run_import_helper(py, backend_dir, ["app"], timeout)
        if full.get("ok"):
            result.status = "import"
            result.routes = _route_records_to_backend(full.get("routes", []), "import", "", 0)
            if full.get("openapi_error"):
                result.openapi_error = redact(full["openapi_error"])
                result.import_traceback = redact(full.get("openapi_traceback"))
            else:
                paths = full.get("openapi_paths") or {}
                result.openapi_paths = len(paths)
                result.openapi = full.get("openapi")
                known = {(r.method, r.pattern.display) for r in result.routes}
                extra = [
                    {"path": p, "methods": [m for m in ms if (m, p) not in known]} for p, ms in paths.items()
                ]
                result.routes += _route_records_to_backend(
                    [e for e in extra if e["methods"]], "openapi", "", len(result.routes)
                )
            return result
    elif mode != "ast":
        result.notes.append("backend venv python not found - using the ast scan")

    # 2) static view (needed for the fallbacks)
    scanner = BackendAstScanner(backend_dir)
    scanner.scan()
    ast_records = scanner.build_routes()
    result.syntax_errors = scanner.syntax_errors
    result.notes.extend(scanner.notes)
    result.unmounted = scanner.unmounted

    def ast_routes(filter_fn: Callable[[dict[str, Any]], bool]) -> list[BackendRoute]:
        out = []
        for rec in ast_records:
            if not filter_fn(rec) or rec["method"] in IGNORED_METHODS:
                continue
            route = BackendRoute(
                rec["method"],
                pattern_from_route(rec["path"], rec["params"]),
                rec["location"],
                "ast",
                rec["order"],
            )
            if rec["assumed_mount"]:
                route.note = "mount assumed (include chain not resolved)"
            out.append(route)
        return out

    if mode == "ast" or py is None:
        result.status = "ast"
        result.routes = ast_routes(lambda rec: True)
        return result

    # 3) app.main failed: import each module router on its own, ast for the modules that still fail
    result.import_error = redact(full.get("error"))
    result.import_traceback = redact(full.get("traceback"))
    modules_dir = backend_dir / "app" / "modules"
    names = (
        sorted(d.name for d in modules_dir.iterdir() if (d / "router.py").is_file())
        if modules_dir.is_dir()
        else []
    )
    per_module = run_import_helper(py, backend_dir, ["modules", ",".join(names)], timeout) if names else {}
    imported = per_module.get("modules", {}) if per_module.get("ok") else {}
    if names and not per_module.get("ok"):
        result.notes.append("per-module import failed: " + redact(per_module.get("error")))
    ok_modules = {name for name, info in imported.items() if info.get("ok")}
    for name in names:
        info = imported.get(name)
        if info is None:
            result.module_status[name] = "ast (not imported)"
        elif info.get("ok"):
            result.module_status[name] = "import"
        else:
            result.module_status[name] = "ast (import failed: " + redact(info.get("error", "?"))[:160] + ")"

    def in_ok_module(rec: dict[str, Any]) -> bool:
        loc = rec.get("location") or ""
        return any(loc.startswith(f"backend/app/modules/{name}/") for name in ok_modules)

    routes = ast_routes(lambda rec: not in_ok_module(rec))
    hint = scanner.api_prefix_hint()
    for name in sorted(ok_modules):
        key = (f"app.modules.{name}.router", "router")
        prefix = scanner.mount_prefix.get(key, hint)
        # slot the imported routes where the static scan saw this router being included
        start = scanner.visit_order.get(key, 10**6) + 0.0001
        recs = imported[name].get("routes", [])
        routes += _route_records_to_backend(recs, "import", prefix, start, step=0.0001)
        if key in scanner.assumed:
            result.notes.append(
                f"module '{name}': mounting under {prefix} assumed (include chain not resolved)"
            )
    routes.sort(key=lambda r: r.order)
    result.routes = routes
    result.status = "hybrid" if ok_modules else "ast"
    result.order_reliable = False
    return result


# =========================================================================================================
# client scanners (TypeScript + Dart)
# =========================================================================================================
def _scan_js_string(src: str, i: int) -> tuple[list[tuple[str, str]], int] | None:
    """``src[i]`` is ' " or `` ` ``. Returns ([(kind, text)], index after the closing quote)."""
    quote = src[i]
    j, n = i + 1, len(src)
    parts: list[tuple[str, str]] = []
    buf: list[str] = []
    while j < n:
        ch = src[j]
        if ch == "\\":
            buf.append(src[j : j + 2])
            j += 2
            continue
        if ch == quote:
            if buf:
                parts.append(("lit", "".join(buf)))
            return parts, j + 1
        if quote == "`" and ch == "$" and j + 1 < n and src[j + 1] == "{":
            if buf:
                parts.append(("lit", "".join(buf)))
                buf = []
            end = _skip_expr(src, j + 2, "ts")
            if end is None:
                return None
            parts.append(("expr", src[j + 2 : end].strip()))
            j = end + 1
            continue
        if quote != "`" and ch == "\n":
            return None
        buf.append(ch)
        j += 1
    return None


def _scan_dart_string(src: str, i: int) -> tuple[list[tuple[str, str]], int] | None:
    raw = False
    if src[i] in "rR":
        raw = True
        i += 1
    quote = src[i]
    delim = quote * 3 if src.startswith(quote * 3, i) else quote
    j, n = i + len(delim), len(src)
    parts: list[tuple[str, str]] = []
    buf: list[str] = []
    while j < n:
        if src.startswith(delim, j):
            if buf:
                parts.append(("lit", "".join(buf)))
            return parts, j + len(delim)
        ch = src[j]
        if len(delim) == 1 and ch == "\n":
            return None
        if not raw and ch == "\\":
            buf.append(src[j : j + 2])
            j += 2
            continue
        if not raw and ch == "$" and j + 1 < n:
            if src[j + 1] == "{":
                end = _skip_expr(src, j + 2, "dart")
                if end is None:
                    return None
                if buf:
                    parts.append(("lit", "".join(buf)))
                    buf = []
                parts.append(("expr", src[j + 2 : end].strip()))
                j = end + 1
                continue
            ident = re.match(r"[A-Za-z_][A-Za-z0-9_]*", src[j + 1 : j + 80])
            if ident:
                if buf:
                    parts.append(("lit", "".join(buf)))
                    buf = []
                parts.append(("expr", ident.group(0)))
                j += 1 + len(ident.group(0))
                continue
        buf.append(ch)
        j += 1
    return None


def _string_start(src: str, i: int, lang: str) -> bool:
    ch = src[i]
    if lang == "ts":
        return ch in "'\"`"
    if ch in "'\"":
        return True
    return (
        ch in "rR"
        and i + 1 < len(src)
        and src[i + 1] in "'\""
        and (i == 0 or not (src[i - 1].isalnum() or src[i - 1] in "_$"))
    )


def _scan_string(src: str, i: int, lang: str) -> tuple[list[tuple[str, str]], int] | None:
    return _scan_js_string(src, i) if lang == "ts" else _scan_dart_string(src, i)


def _skip_expr(src: str, i: int, lang: str) -> int | None:
    """From inside ``${``, return the index of the matching ``}``."""
    depth, j, n = 0, i, len(src)
    while j < n:
        ch = src[j]
        if _string_start(src, j, lang):
            res = _scan_string(src, j, lang)
            if res is None:
                j += 1
                continue
            j = res[1]
            continue
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            if depth == 0:
                return j if ch == "}" else None
            depth -= 1
        j += 1
    return None


def strip_comments(src: str, lang: str) -> str:
    out = list(src)
    i, n = 0, len(src)
    while i < n:
        ch = src[i]
        if ch == "/" and i + 1 < n and src[i + 1] == "/":
            end = src.find("\n", i)
            end = n if end == -1 else end
            for k in range(i, end):
                out[k] = " "
            i = end
            continue
        if ch == "/" and i + 1 < n and src[i + 1] == "*":
            end = src.find("*/", i + 2)
            end = n if end == -1 else end + 2
            for k in range(i, end):
                if out[k] != "\n":
                    out[k] = " "
            i = end
            continue
        if _string_start(src, i, lang):
            res = _scan_string(src, i, lang)
            if res is not None:
                i = res[1]
                continue
        i += 1
    return "".join(out)


def split_args(src: str, open_idx: int, lang: str) -> tuple[list[tuple[int, int]], int] | None:
    """``src[open_idx]`` is '('. Returns top-level argument spans and the index of the closing ')'."""
    depth, j, n = 0, open_idx + 1, len(src)
    spans: list[tuple[int, int]] = []
    start = j
    while j < n:
        ch = src[j]
        if _string_start(src, j, lang):
            res = _scan_string(src, j, lang)
            if res is not None:
                j = res[1]
                continue
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            if depth == 0:
                if src[start:j].strip():
                    spans.append((start, j))
                return spans, j
            depth -= 1
        elif ch == "," and depth == 0:
            spans.append((start, j))
            start = j + 1
        j += 1
    return None


_EXPR_OPERAND_RE = re.compile(r"\s*(?:new\s+)?[A-Za-z_$][\w$]*(?:\s*[?!]?\.\s*[A-Za-z_$][\w$]*)*")


def eval_string_expr(
    src: str, start: int, end: int, lang: str, resolve: Callable[[str], str | None]
) -> list[tuple[str, str]] | None:
    """Evaluate a string-ish argument: literals, templates/interpolations, ``+`` chains, adjacent Dart
    literals and identifiers that are known constants. Returns parts, or None when it is not string-like."""
    parts: list[tuple[str, str]] = []
    j = start
    saw_string = False
    expect_operand = True
    while j < end:
        ch = src[j]
        if ch.isspace():
            j += 1
            continue
        if _string_start(src, j, lang):
            res = _scan_string(src, j, lang)
            if res is None or res[1] > end:
                return parts or None
            parts.extend(res[0])
            saw_string = True
            j = res[1]
            expect_operand = False
            continue
        if ch == "+":
            expect_operand = True
            j += 1
            continue
        if expect_operand:
            m = _EXPR_OPERAND_RE.match(src, j)
            if m and m.end() > j:
                name = re.sub(r"\s+", "", m.group(0))
                k = m.end()
                if k < end and src[k] == "(":  # call: dynamic value
                    spans = split_args(src, k, lang)
                    k = spans[1] + 1 if spans else end
                    parts.append(("expr", src[j:k].strip()))
                else:
                    value = resolve(name)
                    if value is not None:
                        parts.append(("lit", value))
                        saw_string = True
                    else:
                        parts.append(("expr", name))
                j = k
                expect_operand = False
                continue
        break  # anything else (ternary, `as`, etc.) ends the string expression
    return parts if saw_string else None


def _expr_label(expr: str) -> str:
    skip = {
        "encodeURIComponent",
        "encodeURI",
        "String",
        "toString",
        "Number",
        "trim",
        "Uri",
        "encodeComponent",
        "encodeQueryComponent",
        "encodeFull",
        "this",
        "widget",
        "new",
    }
    names = [n for n in re.findall(r"[A-Za-z_$][\w$]*", expr) if n not in skip]
    return names[-1] if names else "param"


def assemble_path(
    parts: list[tuple[str, str]], resolve: Callable[[str], str | None]
) -> tuple[str, str] | None:
    """parts -> (path with SENTINEL placeholders, display path); None unless it is a '/'-rooted path."""
    raw: list[str] = []
    shown: list[str] = []
    for kind, value in parts:
        if kind == "lit":
            raw.append(value)
            shown.append(value)
            continue
        resolved = resolve(value.strip())
        if resolved is not None:
            raw.append(resolved)
            shown.append(resolved)
        else:
            raw.append(SENTINEL)
            shown.append("{" + _expr_label(value) + "}")
    text, disp = "".join(raw), "".join(shown)
    if text.startswith(("http://", "https://", "ws://", "wss://")):
        idx = text.find(API_PREFIX + "/")
        if idx == -1:
            return None
        text = text[idx:]
        disp = disp[disp.find(API_PREFIX + "/") :] if API_PREFIX + "/" in disp else text
    if not text.startswith("/") or text.startswith("//"):
        return None
    for stop in ("?", "#"):
        if stop in text:
            text = text[: text.index(stop)]
        if stop in disp:
            disp = disp[: disp.index(stop)]
    return text, disp


def normalise_client_path(text: str, disp: str) -> PathPattern | None:
    if not text.startswith("/api/"):
        text, disp = API_PREFIX + text, API_PREFIX + disp
    raw_segs = [s for s in text.split("/") if s]
    disp_segs = [s for s in disp.split("/") if s]
    if len(disp_segs) != len(raw_segs):
        disp_segs = [("{param}" if SENTINEL in s else s) for s in raw_segs]
    segs: list[str] = []
    shown: list[str] = []
    for idx, (seg, dseg) in enumerate(zip(raw_segs, disp_segs, strict=True)):
        if SENTINEL in seg:
            literal = seg.split(SENTINEL)[0]
            if idx == len(raw_segs) - 1 and literal and seg.rstrip(SENTINEL) == literal:
                segs.append(
                    literal
                )  # `/hospitals${buildQuery(q)}` -> query builder glued to the last segment
                shown.append(literal)
                continue
            segs.append(PARAM)
            shown.append(dseg)
            continue
        if _is_template_param(seg):
            segs.append(PARAM)
        else:
            segs.append(seg)
        shown.append(dseg)
    if len(segs) <= 2 and segs[:2] == ["api", "v1"]:
        return None  # the base URL itself
    trailing = text.endswith("/") and len(text) > 1
    display = "/" + "/".join(shown) + ("/" if trailing else "")
    return PathPattern(display, tuple(segs), tuple(None for _ in segs), trailing)


@dataclass
class ClientCall:
    method: str  # GET..DELETE | WS | ANY (path reference without a known method)
    pattern: PathPattern
    source: str
    locations: list[str]
    kind: str  # call | ref | ws


_GENERIC = r"(?:<(?:[^<>()]|<(?:[^<>()]|<[^<>()]*>)*>)*>)?"
TS_MEMBER_CALL_RE = re.compile(  # anchored on the dot; the receiver is read backwards (see _receiver_before)
    r"\??\.\s*(?P<meth>get|post|put|patch|delete|del|upload|download|downloadAndSave|request|getJson|postJson|"
    r"putJson|patchJson|deleteJson|postForm)\s*" + _GENERIC + r"\s*\("
)
_RECEIVER_RE = re.compile(r"([A-Za-z_$][\w$]*)\s*$")


def _receiver_before(code: str, pos: int) -> str:
    match = _RECEIVER_RE.search(code, max(0, pos - 64), pos)
    return match.group(1) if match else ""


TS_FUNC_CALL_RE = re.compile(
    r"(?<![\w$.])(?P<fn>request|apiRequest|apiFetch|fetchJson)\s*" + _GENERIC + r"\s*\("
)
TS_FETCH_RE = re.compile(r"(?<![\w$.])fetch\s*\(")
DART_CALL_RE = re.compile(
    r"\.\s*(?P<meth>get|post|put|patch|delete|head|fetch|request|send|upload|uploadFile|download|"
    r"(?:get|post|put|patch|delete)[A-Z][A-Za-z0-9]*)\s*" + _GENERIC + r"\s*\("
)
TS_CONST_RE = re.compile(
    r"(?:^|[;{}\s])(?:export\s+)?(?:const|let|var|(?:(?:private|public|protected|static|readonly)\s+)+)"
    r"\s*(?P<name>[A-Za-z_$][\w$]*)\s*(?::\s*[^=;\n]+?)?=\s*(?=['\"`])"
)
DART_CONST_RE = re.compile(
    r"(?:^|[;{}\s])(?:static\s+)?(?:const|final)\s+(?:String\s+)?(?P<name>[A-Za-z_][\w]*)\s*=\s*(?=r?['\"])"
)
ROOT_URL_RE = re.compile(r"\s*(?:rootUrl|originUrl)\s*\(")
DART_CLASS_RE = re.compile(r"\bclass\s+(?P<name>[A-Za-z_]\w*)[^{;]*\{")
NAVIGATION_CALL_RE = re.compile(
    r"(?<![\w$])(?:navigate|push|go|pushNamed|goNamed|pushReplacement|pushReplacementNamed|replace|"
    r"redirect|Navigate|Link|setLocation|assign)\s*" + _GENERIC + r"\s*\("
)
ASSET_PATH_RE = re.compile(r"\.(?:png|jpe?g|gif|svg|webp|ico|css|js|mjs|map|html?|txt|woff2?|ttf)$", re.IGNORECASE)
RECEIVER_DENYLIST = {
    "searchParams",
    "params",
    "headers",
    "map",
    "cache",
    "storage",
    "localStorage",
    "sessionStorage",
    "formData",
    "url",
    "URL",
    "query",
    "Object",
    "Reflect",
    "set",
    "weakMap",
    "prefs",
    "box",
    "Map",
    "Set",
    "location",
    "history",
}
SKIP_DIRS = {
    "node_modules",
    "dist",
    "build",
    ".dart_tool",
    "coverage",
    "__tests__",
    "__mocks__",
    ".turbo",
    ".vite",
    "generated",
}


def _method_from_name(name: str) -> str | None:
    lowered = name.lower()
    for prefix, method in (
        ("download", "GET"),
        ("fetch", "GET"),
        ("get", "GET"),
        ("post", "POST"),
        ("upload", "POST"),
        ("put", "PUT"),
        ("patch", "PATCH"),
        ("delete", "DELETE"),
        ("del", "DELETE"),
        ("head", "HEAD"),
    ):
        if lowered.startswith(prefix):
            return method
    return None


@dataclass
class SourceFile:
    path: Path
    rel: str
    lang: str
    source: str
    endpointish: bool
    raw: str = ""
    code: str = ""
    line_starts: list[int] = field(default_factory=list)
    consts: dict[str, list[tuple[int, str]]] = field(default_factory=dict)  # name -> [(position, value)]
    const_spans: list[tuple[int, int]] = field(default_factory=list)

    def load(self) -> bool:
        try:
            self.raw = self.path.read_text(encoding="utf-8-sig")
        except (OSError, UnicodeDecodeError):
            return False
        self.code = strip_comments(self.raw, self.lang)
        self.line_starts = [0] + [i + 1 for i, ch in enumerate(self.raw) if ch == "\n"]
        return True

    def line_of(self, pos: int) -> int:
        return bisect.bisect_right(self.line_starts, pos)


class ClientScanner:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.files: list[SourceFile] = []
        self.global_consts: dict[str, dict[str, str]] = {"ts": {}, "dart": {}}
        self.sites: list[CallSite] = []

    def add_files(self, paths: Iterable[Path], lang: str, source: str, endpointish: bool) -> int:
        count = 0
        seen = {f.path for f in self.files}
        for path in paths:
            if path in seen or any(part in SKIP_DIRS for part in path.parts):
                continue
            name = path.name
            if re.search(r"\.(test|spec|stories)\.[jt]sx?$|\.d\.ts$|\.(g|freezed|mocks|gr)\.dart$", name):
                continue
            sf = SourceFile(path, rel_path(path, self.root), lang, source, endpointish)
            if sf.load():
                self.files.append(sf)
                seen.add(path)
                count += 1
        return count

    # ---- constants ---------------------------------------------------------------------------------------
    def collect_constants(self) -> None:
        counts: dict[str, dict[str, set[str]]] = {"ts": defaultdict(set), "dart": defaultdict(set)}
        for sf in self.files:
            regex = TS_CONST_RE if sf.lang == "ts" else DART_CONST_RE
            class_spans: list[tuple[int, int, str]] = []
            if sf.lang == "dart":
                for m in DART_CLASS_RE.finditer(sf.code):
                    end = self._block_end(sf.code, m.end() - 1, sf.lang)
                    class_spans.append((m.end(), end, m.group("name")))
            for m in regex.finditer(sf.code):
                res = _scan_string(sf.code, m.end(), sf.lang)
                if res is None:
                    continue
                parts, end = res
                if any(kind != "lit" for kind, _ in parts):
                    continue
                value = "".join(v for _, v in parts)
                if not value.startswith("/"):
                    continue
                name = m.group("name")
                sf.consts.setdefault(name, []).append((m.start("name"), value))
                sf.const_spans.append((m.end(), end))
                counts[sf.lang][name].add(value)
                for start, stop, cls in class_spans:
                    if start <= m.start() <= stop:
                        counts[sf.lang][f"{cls}.{name}"].add(value)
        for lang, table in counts.items():
            self.global_consts[lang] = {k: next(iter(v)) for k, v in table.items() if len(v) == 1}

    @staticmethod
    def _block_end(code: str, open_idx: int, lang: str) -> int:
        depth, j, n = 0, open_idx, len(code)
        while j < n:
            if _string_start(code, j, lang):
                res = _scan_string(code, j, lang)
                if res is not None:
                    j = res[1]
                    continue
            ch = code[j]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return j
            j += 1
        return n

    def _resolver(self, sf: SourceFile, pos: int) -> Callable[[str], str | None]:
        """Constant lookup at ``pos``: nearest preceding local definition, then a later one, then global."""
        local, global_ = sf.consts, self.global_consts[sf.lang]

        def pick(name: str) -> str | None:
            defs = local.get(name)
            if not defs:
                return None
            before = [value for at, value in defs if at <= pos]
            return before[-1] if before else defs[0][1]

        def resolve(expr: str) -> str | None:
            name = re.sub(r"^(?:this|widget|_?self)\.", "", expr.strip())
            if not re.fullmatch(r"[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?", name):
                return None
            value = pick(name)
            if value is not None:
                return value
            if name in global_:
                return global_[name]
            return pick(name.rsplit(".", 1)[-1]) if "." in name else None

        return resolve

    # ---- calls -------------------------------------------------------------------------------------------
    def scan(self) -> list[ClientCall]:
        self.collect_constants()
        found: list[ClientCall] = []
        for sf in self.files:
            found.extend(self._scan_file(sf))
        merged: dict[tuple[str, str], ClientCall] = {}
        for call in found:
            key = (call.method, call.pattern.key + ("/" if call.pattern.trailing_slash else ""))
            if key in merged:
                for loc in call.locations:
                    if loc not in merged[key].locations:
                        merged[key].locations.append(loc)
                if merged[key].source != call.source and call.source not in merged[key].source.split("+"):
                    merged[key].source += "+" + call.source
            else:
                merged[key] = call
        return list(merged.values())

    def _make(
        self,
        sf: SourceFile,
        method: str,
        parts: list[tuple[str, str]] | None,
        pos: int,
        kind: str,
        root: bool = False,
    ) -> ClientCall | None:
        if not parts:
            return None
        assembled = assemble_path(parts, self._resolver(sf, pos))
        if assembled is None:
            return None
        # root=True: the path is made absolute against the API origin (e.g. rootUrl('/health/live')), no /api/v1
        pattern = pattern_from_template(*assembled) if root else normalise_client_path(*assembled)
        if pattern is None:
            return None
        return ClientCall(method, pattern, sf.source, [f"{sf.rel}:{sf.line_of(pos)}"], kind)

    def _scan_file(self, sf: SourceFile) -> list[ClientCall]:
        code, lang = sf.code, sf.lang
        calls: list[ClientCall] = []
        consumed: list[tuple[int, int]] = list(sf.const_spans)

        def arg_parts(span: tuple[int, int]) -> list[tuple[str, str]] | None:
            return eval_string_expr(code, span[0], span[1], lang, self._resolver(sf, span[0]))

        def literal_value(span: tuple[int, int]) -> str | None:
            parts = arg_parts(span)
            if parts and all(k == "lit" for k, _ in parts):
                return "".join(v for _, v in parts)
            return None

        def explicit_method(text: str) -> str | None:
            m = re.search(r"\bmethod\s*:\s*['\"]([A-Za-z]+)['\"]", text)
            return m.group(1).upper() if m else None

        def handle(method_name: str, open_idx: int, pos: int) -> None:
            res = split_args(code, open_idx, lang)
            if res is None or not res[0]:
                return
            spans, close = res
            generic = method_name in ("request", "send", "apiRequest", "apiFetch", "fetchJson")
            method = None if generic else _method_from_name(method_name)
            path_span = spans[0]
            if method is None:
                first = literal_value(spans[0])
                if first and first.upper() in HTTP_METHODS and len(spans) > 1:
                    method, path_span = first.upper(), spans[1]
                else:
                    method = explicit_method(code[spans[0][1] : close]) or "GET"
            if method not in HTTP_METHODS:
                return
            root = ROOT_URL_RE.match(code, path_span[0])
            if root:  # api.get(rootUrl('/health/live')) -> served at the origin root, outside the API base
                inner = split_args(code, root.end() - 1, lang)
                if not inner or not inner[0]:
                    return
                call = self._make(sf, method, arg_parts(inner[0][0]), pos, "call", root=True)
                if call:
                    calls.append(call)
                    consumed.append((open_idx, close))
                return
            call = self._make(sf, method, arg_parts(path_span), pos, "call")
            if call:
                calls.append(call)
                consumed.append((open_idx, close))
                self.sites.append(
                    CallSite(sf, method_name, pos, open_idx, close, spans, spans.index(path_span), call)
                )

        def skip(open_idx: int) -> None:
            """A call that is not an API request: keep its string arguments out of the loose-ref scan."""
            res = split_args(code, open_idx, lang)
            if res is not None:
                consumed.append((open_idx, res[1]))

        if lang == "ts":
            for m in TS_MEMBER_CALL_RE.finditer(code):
                if code[max(0, m.start() - 2) : m.start()] == "..":
                    continue  # spread operator, not a member call
                if _receiver_before(code, m.start()) in RECEIVER_DENYLIST:
                    skip(m.end() - 1)
                else:
                    handle(m.group("meth"), m.end() - 1, m.start("meth"))
            for m in TS_FUNC_CALL_RE.finditer(code):
                handle(m.group("fn"), m.end() - 1, m.start("fn"))
            for m in TS_FETCH_RE.finditer(code):
                res = split_args(code, m.end() - 1, lang)
                if not res or not res[0]:
                    continue
                spans, close = res
                first_start, first_end = spans[0]
                lead = len(code[first_start:first_end]) - len(code[first_start:first_end].lstrip())
                wrapper = re.compile(r"(?:buildUrl|apiUrl|toApiUrl)\s*\(").match(code, first_start + lead)
                parts = None
                if wrapper:  # fetch(buildUrl('/auth/refresh'), ...) -> path relative to the API base
                    sub = split_args(code, wrapper.end() - 1, lang)
                    if sub and sub[0]:
                        parts = arg_parts(sub[0][0])
                else:  # fetch('/api/v1/...') only; other fetches are static assets
                    parts = arg_parts(spans[0])
                    if not "".join(v for k, v in parts or [] if k == "lit").lstrip().startswith("/api/"):
                        parts = None
                call = self._make(
                    sf, explicit_method(code[first_end:close]) or "GET", parts, m.start(), "call"
                )
                if call:
                    calls.append(call)
                consumed.append((m.end() - 1, close))  # non-API fetches (assets) are not path references
        else:
            for m in DART_CALL_RE.finditer(code):
                handle(m.group("meth"), m.end() - 1, m.start("meth"))
        for m in NAVIGATION_CALL_RE.finditer(code):  # router navigation, links: app routes, not API paths
            skip(m.end() - 1)

        calls.extend(self._string_refs(sf, consumed))
        return calls

    def _string_refs(self, sf: SourceFile, consumed: list[tuple[int, int]]) -> list[ClientCall]:
        """WebSocket URLs (any string with ``/ws`` + ``?``/end) in every file; in endpoint/repository files
        also every other '/'-rooted string literal, as an API path reference with an unknown method."""
        code, lang = sf.code, sf.lang
        out: list[ClientCall] = []
        i, n = 0, len(code)
        while i < n:
            if not _string_start(code, i, lang):
                i += 1
                continue
            res = _scan_string(code, i, lang)
            if res is None:
                i += 1
                continue
            parts, end = res
            literal = "".join(v for k, v in parts if k == "lit")
            if re.search(r"(?:^|/)ws(?:\?|$)", literal) and "/ws" in "".join(
                v if k == "lit" else SENTINEL for k, v in parts
            ):
                where = [f"{sf.rel}:{sf.line_of(i)}"]
                out.append(
                    ClientCall("WS", pattern_from_template(API_PREFIX + "/ws"), sf.source, where, "ws")
                )
            elif (
                sf.endpointish
                and not any(a <= i < b for a, b in consumed)
                and not ASSET_PATH_RE.search(literal.split("?")[0])
            ):
                call = self._make(sf, "ANY", parts, i, "ref")
                if call is not None:
                    out.append(call)
            i = end
        return out


def collect_clients(root: Path, include_apps: bool) -> tuple[list[ClientCall], dict[str, Any], ClientScanner]:
    scanner = ClientScanner(root)
    info: dict[str, Any] = {"web": {}, "mobile": {}}
    web = root / "web"
    endpoints_dir = web / "packages" / "shared" / "src" / "api" / "endpoints"
    shared_src = web / "packages" / "shared" / "src"
    info["web"]["endpoint_files"] = scanner.add_files(
        sorted(endpoints_dir.rglob("*.ts")) if endpoints_dir.is_dir() else [], "ts", "web-shared", True
    )
    info["web"]["shared_files"] = scanner.add_files(
        sorted(p for ext in ("*.ts", "*.tsx") for p in shared_src.rglob(ext)) if shared_src.is_dir() else [],
        "ts",
        "web-shared",
        False,
    )
    app_files = 0
    if include_apps and (web / "apps").is_dir():
        for app_dir in sorted(p for p in (web / "apps").iterdir() if (p / "src").is_dir()):
            app_files += scanner.add_files(
                sorted(p for ext in ("*.ts", "*.tsx") for p in (app_dir / "src").rglob(ext)),
                "ts",
                f"web-app:{app_dir.name}",
                False,
            )
    info["web"]["app_files"] = app_files
    info["web"]["missing"] = [rel_path(p, root) for p in (endpoints_dir, shared_src) if not p.is_dir()]
    lib = root / "mobile" / "lib"
    repos = lib / "core" / "repositories"
    info["mobile"]["repository_files"] = scanner.add_files(
        sorted(repos.rglob("*.dart")) if repos.is_dir() else [], "dart", "mobile", True
    )
    auth_repo = lib / "core" / "auth" / "auth_repository.dart"
    info["mobile"]["repository_files"] += scanner.add_files(
        [auth_repo] if auth_repo.is_file() else [], "dart", "mobile", True
    )
    info["mobile"]["other_files"] = scanner.add_files(
        sorted(lib.rglob("*.dart")) if lib.is_dir() else [], "dart", "mobile", False
    )
    info["mobile"]["missing"] = [rel_path(p, root) for p in (repos,) if not p.is_dir()]
    calls = scanner.scan()
    info["web"]["calls"] = sum(1 for c in calls if c.source.startswith("web"))
    info["mobile"]["calls"] = sum(1 for c in calls if "mobile" in c.source)
    return calls, info, scanner


# =========================================================================================================
# request / response fields (client payloads and models vs the OpenAPI schemas)
# =========================================================================================================
@dataclass
class CallSite:
    """One recognised API call, kept for the field checks."""

    sf: SourceFile
    method_name: str
    pos: int
    open_idx: int
    close: int
    spans: list[tuple[int, int]]
    path_idx: int
    call: ClientCall


@dataclass
class Shape:
    """Field names a client sends or reads. ``open`` = there may be more (spread, index signature, ...)."""

    keys: dict[str, bool]  # name -> optional
    open: bool = False
    nested: dict[str, Shape] = field(default_factory=dict)
    origin: str = ""


_IDENT = r"[A-Za-z_$][\w$]*"


def _split_top(src: str, open_idx: int, lang: str, sep: str = ",") -> tuple[list[str], int] | None:
    """``src[open_idx]`` is an opening bracket: top-level pieces split on ``sep`` (also ';' and newlines for
    TS type bodies when sep == ';') and the index of the closing bracket."""
    depth, j, n = 0, open_idx + 1, len(src)
    pieces: list[str] = []
    start = j
    while j < n:
        if _string_start(src, j, lang):
            res = _scan_string(src, j, lang)
            if res is not None:
                j = res[1]
                continue
        ch = src[j]
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            if depth == 0:
                pieces.append(src[start:j])
                return [p for p in pieces if p.strip()], j
            depth -= 1
        elif depth == 0 and (ch == sep or (sep == ";" and ch in ",\n")):
            pieces.append(src[start:j])
            start = j + 1
        j += 1
    return None


def _read_type_expr(src: str, i: int) -> str:
    """TS type annotation starting at ``i``: up to a top-level ',' ')' ';' '=' (not '=>') or '{' body."""
    depth, j, n = 0, i, len(src)
    while j < n:
        ch = src[j]
        if ch in "<([{":
            if ch == "{" and depth == 0 and src[i:j].strip():
                break
            depth += 1
        elif ch in ">)]}":
            if depth == 0:
                break
            if ch == ">" and j > 0 and src[j - 1] == "=":
                j += 1
                continue
            depth -= 1
        elif depth == 0 and ch in ",;" or depth == 0 and ch == "=" and src[j + 1 : j + 2] != ">":
            break
        j += 1
    return src[i:j].strip()


class TsTypes:
    """Interfaces and object type aliases of the web shared package (name -> definition)."""

    _DECL_RE = re.compile(
        r"(?:^|[\s;{}])(?:export\s+)?(?:(?P<kind>interface)\s+(?P<iname>" + _IDENT + r")\s*(?:<[^{]*?>)?"
        r"\s*(?:extends\s+(?P<bases>[^{]+))?\{|type\s+(?P<tname>" + _IDENT + r")\s*(?:<[^=]*?>)?\s*=)"
    )

    def __init__(self, files: list[SourceFile]) -> None:
        self.defs: dict[str, tuple[str, Any]] = {}
        for sf in files:
            if sf.lang != "ts":
                continue
            code = sf.code
            for m in self._DECL_RE.finditer(code):
                if m.group("kind"):
                    open_idx = m.end() - 1
                    res = _split_top(code, open_idx, "ts", ";")
                    if res is None:
                        continue
                    bases = [b.strip() for b in _split_generic_list(m.group("bases") or "")]
                    self.defs.setdefault(m.group("iname"), ("interface", (bases, res[0])))
                else:
                    expr = _read_type_expr_until_semicolon(code, m.end())
                    self.defs.setdefault(m.group("tname"), ("alias", expr))

    def shape(self, expr: str, depth: int = 0) -> tuple[str, Any] | None:
        """-> ('object', Shape) | ('array', inner expr) | ('page', inner expr) | None (unknown/primitive)."""
        expr = expr.strip()
        if depth > 12 or not expr:
            return None
        while expr.startswith("(") and expr.endswith(")") and _balanced(expr[1:-1]):
            expr = expr[1:-1].strip()
        union = _split_level(expr, "|")
        if len(union) > 1:
            rest = [u for u in union if u.strip() not in ("null", "undefined", "void")]
            return self.shape(rest[0], depth + 1) if len(rest) == 1 else None
        inter = _split_level(expr, "&")
        if len(inter) > 1:
            merged = Shape({})
            for part in inter:
                sub = self.shape(part, depth + 1)
                if not sub or sub[0] != "object":
                    merged.open = True
                    continue
                merged.keys.update(sub[1].keys)
                merged.open |= sub[1].open
            return ("object", merged)
        if expr.endswith("[]"):
            return ("array", expr[:-2])
        if expr.startswith("{"):
            res = _split_top(expr, 0, "ts", ";")
            return ("object", _ts_members(res[0] if res else [])) if res else None
        m = re.fullmatch(r"(" + _IDENT + r")\s*(?:<(.*)>)?", expr, re.DOTALL)
        if not m:
            return None
        name, args = m.group(1), _split_generic_list(m.group(2) or "")
        if name in ("Array", "ReadonlyArray") and args:
            return ("array", args[0])
        if name == "Page" and args:
            return ("page", args[0])
        if name in ("Partial", "Required", "Readonly") and args:
            sub = self.shape(args[0], depth + 1)
            if not sub or sub[0] != "object":
                return sub
            if name == "Readonly":
                return sub
            return ("object", Shape({k: name == "Partial" for k in sub[1].keys}, sub[1].open))
        if name in ("Omit", "Pick") and len(args) == 2:
            sub = self.shape(args[0], depth + 1)
            if not sub or sub[0] != "object":
                return sub
            names = set(re.findall(r"['\"]([^'\"]+)['\"]", args[1]))
            keys = {k: o for k, o in sub[1].keys.items() if (k in names) == (name == "Pick")}
            return ("object", Shape(keys, sub[1].open and name == "Omit"))
        if name in (
            "Record",
            "Map",
            "unknown",
            "any",
            "object",
            "string",
            "number",
            "boolean",
            "Blob",
            "File",
        ):
            return None
        d = self.defs.get(name)
        if d is None:
            return None
        if d[0] == "alias":
            return self.shape(d[1], depth + 1)
        bases, members = d[1]
        shape = _ts_members(members)
        shape.origin = name
        for base in bases:
            sub = self.shape(base, depth + 1)
            if sub and sub[0] == "object":
                for k, o in sub[1].keys.items():
                    shape.keys.setdefault(k, o)
                shape.open |= sub[1].open
            else:
                shape.open = True
        return ("object", shape)


def _balanced(s: str) -> bool:
    depth = 0
    for ch in s:
        depth += ch in "([{<"
        depth -= ch in ")]}>"
        if depth < 0:
            return False
    return depth == 0


def _split_level(expr: str, sep: str) -> list[str]:
    out, depth, start = [], 0, 0
    for j, ch in enumerate(expr):
        if ch in "([{<":
            depth += 1
        elif ch in ")]}>" and not (ch == ">" and j and expr[j - 1] == "="):
            depth -= 1
        elif ch == sep and depth == 0:
            out.append(expr[start:j])
            start = j + 1
    out.append(expr[start:])
    return [o.strip() for o in out if o.strip()]


def _split_generic_list(s: str) -> list[str]:
    return _split_level(s, ",")


def _read_type_expr_until_semicolon(src: str, i: int) -> str:
    depth, j, n = 0, i, len(src)
    while j < n:
        if _string_start(src, j, "ts"):
            res = _scan_string(src, j, "ts")
            if res is not None:
                j = res[1]
                continue
        ch = src[j]
        if ch in "([{<":
            depth += 1
        elif ch in ")]}>" and not (ch == ">" and src[j - 1] == "="):
            depth -= 1
        elif ch == ";" and depth <= 0:
            break
        j += 1
    return src[i:j].strip()


_TS_MEMBER_RE = re.compile(
    r"^\s*(?:readonly\s+)?(?:['\"](?P<q>[^'\"]+)['\"]|(?P<n>" + _IDENT + r"))\s*(?P<opt>\?)?\s*:"
)


def _ts_members(pieces: list[str]) -> Shape:
    shape = Shape({})
    for piece in pieces:
        p = piece.strip()
        if not p:
            continue
        if p.startswith("["):
            shape.open = True  # index signature
            continue
        m = _TS_MEMBER_RE.match(p)
        if m:
            shape.keys[m.group("q") or m.group("n")] = bool(m.group("opt"))
    return shape


def _ts_literal_keys(text: str, types: TsTypes, sf: SourceFile, pos: int) -> Shape | None:
    """Keys of a TS object literal ``{ a: 1, b, 'c': x, ...rest }``."""
    res = _split_top(text, 0, "ts")
    if res is None:
        return None
    shape = Shape({})
    for piece in res[0]:
        p = piece.strip()
        if p.startswith("..."):
            sub = _ts_value_shape(p[3:].strip(), types, sf, pos)
            if sub is None:
                shape.open = True
            else:
                shape.keys.update({k: True for k in sub.keys})
                shape.open |= sub.open
            continue
        m = re.match(r"^(?:['\"](?P<q>[^'\"]+)['\"]|(?P<n>" + _IDENT + r"))\s*(?::|$|\()", p)
        if m:
            shape.keys[m.group("q") or m.group("n")] = False
        else:
            shape.open = True
    return shape


def _ts_param_type(sf: SourceFile, name: str, pos: int) -> str | None:
    """Type annotation of a parameter/variable ``name`` declared shortly before ``pos``."""
    window_start = max(0, pos - 1500)
    best = None
    for m in re.finditer(r"(?<![\w$.])" + re.escape(name) + r"\s*\??\s*:\s*", sf.code[window_start:pos]):
        best = window_start + m.end()
    if best is None:
        return None
    t = _read_type_expr(sf.code, best)
    return t or None


def _ts_value_shape(text: str, types: TsTypes, sf: SourceFile, pos: int) -> Shape | None:
    text = text.strip()
    text = re.split(r"\s+(?:satisfies|as)\s+", text)[0].strip()
    if text.startswith("{"):
        return _ts_literal_keys(text, types, sf, pos)
    if re.fullmatch(_IDENT, text):
        t = _ts_param_type(sf, text, pos)
        if t:
            sh = types.shape(t)
            if sh and sh[0] == "object":
                return sh[1]
    return None


# ---- Dart -----------------------------------------------------------------------------------------------
def _dart_map_keys(text: str, models: DartModels, sf: SourceFile, pos: int, depth: int = 0) -> Shape | None:
    text = text.strip()
    m = re.match(r"^(?:compactJson|_compact\w*|Map<[^>]*>\.from)\s*\(", text)
    if m:
        res = split_args(text, m.end() - 1, "dart")
        if not res or not res[0]:
            return None
        text = text[res[0][0][0] : res[0][0][1]].strip()
    text = re.sub(r"^(?:const\s+)?<[^>]*>\s*", "", text)
    if not text.startswith("{"):
        mm = re.fullmatch(r"(" + _IDENT + r")\s*[!?]?\s*\.\s*toJson\s*\(\s*\)", text)
        if mm and depth < 4:
            cls = models.var_type(sf, mm.group(1), pos)
            return models.to_json_shape(cls) if cls else None
        return None
    res = _split_top(text, 0, "dart")
    if res is None:
        return None
    shape = Shape({})
    for piece in res[0]:
        p = piece.strip()
        optional = False
        cond = re.match(r"^if\s*\(", p)
        if cond:
            sub = split_args(p, cond.end() - 1, "dart")
            if sub is None:
                shape.open = True
                continue
            p = p[sub[1] + 1 :].strip()
            optional = True
        km = re.match(r"^(['\"])(?P<k>[^'\"$]+)\1\s*:\s*(?P<v>.*)$", p, re.DOTALL)
        if not km:
            shape.open = True  # spread, for-element, computed key
            continue
        key = km.group("k")
        shape.keys[key] = optional
        value = km.group("v").strip().lstrip("?").strip()
        if depth < 4 and (value.startswith("{") or re.search(r"\.toJson\s*\(\s*\)\s*$", value)):
            sub_shape = _dart_map_keys(value, models, sf, pos, depth + 1)
            if sub_shape is not None:
                shape.nested[key] = sub_shape
    return shape


class DartModels:
    """Dart model classes of the Flutter app: keys written by ``toJson`` and read by ``fromJson``."""

    _CLASS_RE = re.compile(r"\bclass\s+(?P<name>[A-Za-z_]\w*)[^{;]*\{")

    def __init__(self, files: list[SourceFile]) -> None:
        self.classes: dict[str, tuple[SourceFile, int, int]] = {}
        for sf in files:
            if sf.lang != "dart":
                continue
            for m in self._CLASS_RE.finditer(sf.code):
                end = ClientScanner._block_end(sf.code, m.end() - 1, "dart")
                self.classes.setdefault(m.group("name"), (sf, m.end() - 1, end))

    def var_type(self, sf: SourceFile, name: str, pos: int) -> str | None:
        window_start = max(0, pos - 2500)
        best = None
        for m in re.finditer(
            r"\b(?P<t>[A-Z]\w*)(?:<[^<>]*>)?\??\s+" + re.escape(name) + r"\b", sf.code[window_start:pos]
        ):
            best = m.group("t")
        return best

    def _member_expr(self, cls: str, member_re: str) -> tuple[SourceFile, str] | None:
        info = self.classes.get(cls)
        if info is None:
            return None
        sf, start, end = info
        body = sf.code[start:end]
        m = re.search(member_re, body)
        if not m:
            return None
        i = start + m.end()
        res = split_args(sf.code, i - 1, "dart") if sf.code[i - 1] == "(" else None
        j = res[1] + 1 if res else i
        rest = sf.code[j:end]
        arrow = re.match(r"\s*(?:async\s*)?=>", rest)
        if arrow:
            k = j + arrow.end()
            depth = 0
            n = k
            while n < end:
                if _string_start(sf.code, n, "dart"):
                    r = _scan_string(sf.code, n, "dart")
                    if r is not None:
                        n = r[1]
                        continue
                ch = sf.code[n]
                if ch in "([{":
                    depth += 1
                elif ch in ")]}":
                    depth -= 1
                elif ch == ";" and depth == 0:
                    break
                n += 1
            return sf, sf.code[k:n]
        brace = rest.find("{")
        if brace < 0:
            return None
        b_end = ClientScanner._block_end(sf.code, j + brace, "dart")
        return sf, sf.code[j + brace : b_end + 1]

    def to_json_shape(self, cls: str) -> Shape | None:
        got = self._member_expr(cls, r"\btoJson\s*\(")
        if got is None:
            return None
        sf, expr = got
        expr = expr.strip()
        if expr.startswith("{") and not re.match(r"^\{\s*(?:['\"]|if\b|\.\.\.|\})", expr):
            m = re.search(r"\breturn\s+", expr)  # block body: the returned map
            if not m:
                return None
            expr = expr[m.end() :].strip()
        shape = _dart_map_keys(expr, self, sf, 0)
        if shape is not None:
            shape.origin = cls
        return shape

    def from_json_keys(self, cls: str) -> Shape | None:
        got = self._member_expr(cls, r"\bfactory\s+" + re.escape(cls) + r"\.fromJson\s*\(")
        if got is None:
            return None
        _sf, expr = got
        keys = re.findall(r"\[\s*'([A-Za-z_]\w*)'\s*\]", expr)
        keys += re.findall(r"\(\s*(?:j|json|m|map|data|raw)\s*,\s*'([A-Za-z_]\w*)'", expr)
        return Shape(dict.fromkeys(keys, True), origin=cls)


# ---- OpenAPI --------------------------------------------------------------------------------------------
class OpenApiIndex:
    def __init__(self, spec: dict[str, Any]) -> None:
        self.schemas: dict[str, Any] = (spec.get("components") or {}).get("schemas") or {}
        self.ops: list[tuple[str, PathPattern, str, dict[str, Any]]] = []
        for path, item in (spec.get("paths") or {}).items():
            for method, op in item.items():
                if method.upper() in HTTP_METHODS and isinstance(op, dict):
                    self.ops.append(
                        (method.upper(), pattern_from_route(path, self._param_types(op)), path, op)
                    )

    def _param_types(self, op: dict[str, Any]) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for p in op.get("parameters") or []:
            if p.get("in") != "path":
                continue
            s = self.resolve(p.get("schema") or {})
            if s.get("format") == "uuid":
                out[p["name"]] = {"type": "uuid"}
            elif s.get("type") == "integer":
                out[p["name"]] = {"type": "int"}
            elif s.get("enum"):
                out[p["name"]] = {"type": "enum", "values": [str(v) for v in s["enum"]]}
            else:
                out[p["name"]] = {"type": "str"}
        return out

    def find(self, method: str, pattern: PathPattern) -> tuple[str, dict[str, Any]] | None:
        weak = None
        for m, rp, path, op in self.ops:
            if m != method:
                continue
            q = match_path(pattern, rp, dynamic_vs_literal_ok=False)
            if q == "strong":
                return path, op
            if q and weak is None:
                weak = (path, op)
        return weak

    def resolve(self, s: Any, depth: int = 0) -> dict[str, Any]:
        if not isinstance(s, dict) or depth > 20:
            return {}
        if "$ref" in s:
            return self.resolve(self.schemas.get(s["$ref"].rsplit("/", 1)[-1]) or {}, depth + 1)
        for key in ("anyOf", "oneOf"):
            if key in s:
                alts = [a for a in s[key] if not (isinstance(a, dict) and a.get("type") == "null")]
                return self.resolve(alts[0], depth + 1) if len(alts) == 1 else {}
        if "allOf" in s and len(s["allOf"]) == 1:
            return self.resolve(s["allOf"][0], depth + 1)
        return s

    def object(self, s: Any) -> tuple[dict[str, Any], set[str], bool] | None:
        """-> (properties, required, closed) for an object schema with properties, else None."""
        s = self.resolve(s)
        props = s.get("properties")
        if not isinstance(props, dict) or not props:
            return None
        return props, set(s.get("required") or []), s.get("additionalProperties") is False

    def name_of(self, s: Any) -> str:
        if isinstance(s, dict):
            if "$ref" in s:
                return s["$ref"].rsplit("/", 1)[-1]
            for key in ("anyOf", "oneOf"):
                for a in s.get(key) or []:
                    if isinstance(a, dict) and "$ref" in a:
                        return a["$ref"].rsplit("/", 1)[-1]
        return "schema"

    @staticmethod
    def request(op: dict[str, Any]) -> tuple[str, Any] | None:
        content = (op.get("requestBody") or {}).get("content") or {}
        for ctype in ("application/json", "multipart/form-data", "application/x-www-form-urlencoded"):
            if ctype in content:
                return ctype, content[ctype].get("schema")
        return None

    @staticmethod
    def response(op: dict[str, Any]) -> Any | None:
        responses = op.get("responses") or {}
        for code in ("200", "201", "202"):
            content = (responses.get(code) or {}).get("content") or {}
            if "application/json" in content:
                return content["application/json"].get("schema")
        return None


# ---- the checks -----------------------------------------------------------------------------------------
_FIELD_SKIP_RE = re.compile(r"\b(?:Blob|Response|ArrayBuffer|void|unknown|any|string|Uint8List)\b")


def check_fields(
    spec: dict[str, Any], sites: list[CallSite], files: list[SourceFile]
) -> tuple[list[tuple[str, str, str, str, str]], dict[str, int]]:
    """-> ([(category, method, openapi path, message, location)], stats)."""
    oa = OpenApiIndex(spec)
    ts_types = TsTypes(files)
    dart = DartModels(files)
    out: list[tuple[str, str, str, str, str]] = []
    stats = {"field_sites": 0, "field_requests_checked": 0, "field_responses_checked": 0}

    def compare_request(
        shape: Shape, schema: Any, where: str, ctype: str, method: str, path: str, loc: str, prefix: str = ""
    ) -> None:
        info = oa.object(schema)
        if info is None:
            return
        props, required, closed = info
        name = oa.name_of(schema)
        extra = sorted(k for k in shape.keys if k not in props)
        if extra:
            if ctype == "application/json" and closed:
                cat, why = "field_request_rejected", f"{name} forbids extra fields -> 422"
            else:
                cat, why = "field_request_ignored", f"not in {name}; the server ignores it"
            out.append(
                (cat, method, path, f"{where} sends {', '.join(prefix + k for k in extra)} ({why})", loc)
            )
        if not shape.open:
            missing = sorted(k for k in required if k not in shape.keys)
            if missing:
                out.append(
                    (
                        "field_required_missing",
                        method,
                        path,
                        f"{where} never sends required {', '.join(prefix + k for k in missing)} ({name})",
                        loc,
                    )
                )
        for key, sub in shape.nested.items():
            if key in props:
                compare_request(sub, props[key], where, ctype, method, path, loc, f"{prefix}{key}.")

    def compare_response(
        shape: Shape, schema: Any, where: str, method: str, path: str, loc: str, sf_lang: str
    ) -> None:
        info = oa.object(schema)
        if info is None:
            return
        props = info[0]
        label = f"{shape.origin} " if shape.origin else ""
        # TS: a required property is relied upon; an optional one is only declared. Dart readers are lenient
        # (defaults) but a key that never arrives still means the UI never shows it -> treated as relied upon.
        for optional, category in (
            (False, "field_response_unknown"),
            (True, "field_response_optional_unknown"),
        ):
            unknown = sorted(k for k, opt in shape.keys.items() if k not in props and opt == optional)
            if sf_lang == "dart" and optional:
                unknown = sorted(k for k in shape.keys if k not in props)
                category = "field_response_unknown"
            elif sf_lang == "dart":
                continue
            if unknown:
                out.append(
                    (
                        category,
                        method,
                        path,
                        f"{where} model {label}expects {', '.join(unknown)} - not in {oa.name_of(schema)}",
                        loc,
                    )
                )

    def unwrap(schema: Any, kind: str) -> Any | None:
        s = oa.resolve(schema)
        if kind == "array":
            return s.get("items") if s.get("type") == "array" else None
        if kind == "page":
            info = oa.object(s)
            if info and "items" in info[0]:
                items = oa.resolve(info[0]["items"])
                return items.get("items") if items.get("type") == "array" else None
            return s.get("items") if s.get("type") == "array" else None
        return schema

    for site in sites:
        found = oa.find(site.call.method, site.call.pattern)
        if found is None:
            continue
        path, op = found
        sf, code, method = site.sf, site.sf.code, site.call.method
        loc = f"{sf.rel}:{sf.line_of(site.pos)}"
        stats["field_sites"] += 1
        req = oa.request(op)
        query_names = {p["name"] for p in op.get("parameters") or [] if p.get("in") == "query"}
        required_query = {
            p["name"] for p in op.get("parameters") or [] if p.get("in") == "query" and p.get("required")
        }
        resp = oa.response(op)
        args = [code[a:b] for a, b in site.spans]
        rest = args[site.path_idx + 1 :]
        if sf.lang == "ts":
            body_shape: Shape | None = None
            query_shape: Shape | None = None
            ctype = "application/json"
            if site.method_name == "upload" and rest:
                ctype = "multipart/form-data"
                start = code.rfind("new FormData", max(0, site.pos - 2500), site.pos)
                if start >= 0:
                    keys = re.findall(
                        r"\.(?:append|set)\s*\(\s*['\"]([\w.\[\]-]+)['\"]", code[start : site.pos]
                    )
                    body_shape = Shape(
                        dict.fromkeys(keys, True),
                        open=bool(re.search(r"\.append\s*\(\s*[^'\"\s]", code[start : site.pos])),
                    )
            elif method in ("POST", "PUT", "PATCH") and rest:
                body_shape = _ts_value_shape(rest[0], ts_types, sf, site.pos)
            elif method in ("GET", "DELETE") and rest and site.method_name in ("get",):
                query_shape = _ts_value_shape(rest[0], ts_types, sf, site.pos)
            if body_shape is not None and req is not None:
                stats["field_requests_checked"] += 1
                if req[0] != ctype and not (
                    req[0] == "application/x-www-form-urlencoded" and ctype != "application/json"
                ):
                    out.append(
                        (
                            "field_content_type",
                            method,
                            path,
                            f"client sends {ctype}, the backend expects {req[0]}",
                            loc,
                        )
                    )
                else:
                    compare_request(body_shape, req[1], "client", req[0], method, path, loc)
            if query_shape is not None:
                extra = sorted(k for k in query_shape.keys if k not in query_names)
                if extra:
                    out.append(
                        (
                            "field_query_unknown",
                            method,
                            path,
                            f"query params {', '.join(extra)} are not accepted",
                            loc,
                        )
                    )
            generic = code[site.pos + len(site.method_name) : site.open_idx].strip()
            if generic.startswith("<") and generic.endswith(">") and resp is not None:
                texpr = generic[1:-1].strip()
                if not _FIELD_SKIP_RE.fullmatch(texpr):
                    sh = ts_types.shape(texpr)
                    schema = resp
                    while sh and sh[0] in ("array", "page"):
                        schema = unwrap(schema, sh[0])
                        sh = ts_types.shape(sh[1]) if schema is not None else None
                    if sh and sh[0] == "object" and schema is not None:
                        stats["field_responses_checked"] += 1
                        compare_response(sh[1], schema, "client", method, path, loc, "ts")
        else:
            named: dict[str, str] = {}
            for a in rest:
                m = re.match(r"\s*(\w+)\s*:\s*", a)
                if m:
                    named[m.group(1)] = a[m.end() :].strip()
            if site.method_name in ("upload", "uploadFile"):
                fields_shape = _dart_map_keys(named.get("fields", "{}"), dart, sf, site.pos) or Shape(
                    {}, open=True
                )
                file_field = named.get("fileField", "'file'").strip().strip("'\"")
                fields_shape.keys[file_field] = False
                if req is not None:
                    stats["field_requests_checked"] += 1
                    if req[0] == "application/json":
                        out.append(
                            (
                                "field_content_type",
                                method,
                                path,
                                "client sends multipart, the backend expects JSON",
                                loc,
                            )
                        )
                    else:
                        compare_request(fields_shape, req[1], "client", req[0], method, path, loc)
            elif "data" in named and req is not None:
                shape = _dart_map_keys(named["data"], dart, sf, site.pos)
                if shape is not None:
                    stats["field_requests_checked"] += 1
                    compare_request(shape, req[1], "client", req[0], method, path, loc)
            q = named.get("query") or named.get("queryParameters")
            if q:
                shape = _dart_map_keys(q, dart, sf, site.pos)
                if shape is not None:
                    extra = sorted(k for k in shape.keys if k not in query_names)
                    if extra:
                        out.append(
                            (
                                "field_query_unknown",
                                method,
                                path,
                                f"query params {', '.join(extra)} are not accepted",
                                loc,
                            )
                        )
                    if not shape.open and required_query - set(shape.keys):
                        out.append(
                            (
                                "field_required_missing",
                                method,
                                path,
                                f"client never sends required query {', '.join(sorted(required_query - set(shape.keys)))}",
                                loc,
                            )
                        )
            # response model: X.fromJson in the same statement
            stmt_start = max(
                code.rfind(";", 0, site.pos), code.rfind("{", 0, site.pos), code.rfind("}", 0, site.pos)
            )
            stmt_end = code.find(";", site.close)
            stmt = code[stmt_start + 1 : stmt_end if stmt_end > 0 else site.close + 200]
            fm = re.search(r"\b([A-Z]\w*)\.fromJson\b", stmt)
            if fm and resp is not None:
                shape = dart.from_json_keys(fm.group(1))
                schema = resp
                if re.search(r"\bparseList\s*\(|\bjList\s*\(|\.map\s*\(", stmt):
                    s = oa.resolve(resp)
                    schema = unwrap(resp, "page" if oa.object(s) else "array")
                if shape is not None and shape.keys and schema is not None:
                    stats["field_responses_checked"] += 1
                    compare_response(shape, schema, "client", method, path, loc, "dart")
    return out, stats


# =========================================================================================================
# PLAN.md section 8
# =========================================================================================================
@dataclass
class PlanEndpoint:
    methods: frozenset[str]
    alts: list[PathPattern]
    section: str
    line: int
    optional: bool = False
    note: str = ""

    def label(self, strip_prefix: bool = False) -> str:
        def show(p: PathPattern) -> str:
            return (
                p.display[len(API_PREFIX) :]
                if strip_prefix and p.display.startswith(API_PREFIX + "/")
                else p.display
            )

        if len(self.alts) == 2 and self.alts[1].display == self.alts[0].display + "/{id}":
            path = show(self.alts[0]) + "[/{id}]"
        else:
            path = " or ".join(show(a) for a in self.alts)
        return f"{'|'.join(sorted(self.methods))} {path}"


_PLAN_METHOD = r"(?:GET|POST|PUT|PATCH|DELETE|WS|CRUD)(?:/(?:GET|POST|PUT|PATCH|DELETE))*"
_PLAN_TOKEN_RE = re.compile(r"`([^`]*)`|(?<![A-Za-z0-9_/])(" + _PLAN_METHOD + r")(?![A-Za-z0-9_])")
_INLINE_METHOD_RE = re.compile(r"^(" + _PLAN_METHOD + r")(?:\s+(/\S*))?$")
_TABLE_SEP_RE = re.compile(r"^\|?\s*:?-{3,}")


def _split_cells(row: str) -> list[str]:
    cells, buf, in_code = [], [], False
    body = row.strip()
    body = body.removeprefix("|")
    for ch in body:
        if ch == "`":
            in_code = not in_code
        if ch == "|" and not in_code:
            cells.append("".join(buf).strip())
            buf = []
            continue
        buf.append(ch)
    if "".join(buf).strip():
        cells.append("".join(buf).strip())
    return cells


@dataclass
class _Block:
    section: str
    absolute: bool
    in_section8: bool = True
    text: str = ""
    offsets: list[tuple[int, int]] = field(default_factory=list)  # (char offset, line number)
    default_method: str | None = None

    def add(self, text: str, line: int) -> None:
        if self.text:
            self.text += " "
        self.offsets.append((len(self.text), line))
        self.text += text

    def line_at(self, pos: int) -> int:
        line = self.offsets[0][1] if self.offsets else 0
        for offset, number in self.offsets:
            if offset <= pos:
                line = number
        return line


def parse_plan(
    plan_file: Path, section8_only: bool = False
) -> tuple[list[PlanEndpoint], list[str], list[str]]:
    """Returns (endpoints, section titles, parse notes).

    Section 8 is the API contract: every ``METHOD `/path``` (and path cells under a "GET path" table header)
    counts.
    Elsewhere (e.g. 3.1 staff door, 7.1 docai, 7.2 voice) only paths with an explicit method are taken - both
    ``METHOD `/path``` and ```METHOD /path``` - so client routes and door URLs without a verb are ignored.
    Fenced code blocks are skipped.
    """
    try:
        lines = plan_file.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        return [], [], [f"cannot read {plan_file.name}: {exc}"]
    if not any(re.match(r"^##\s+8[.\s]", ln) for ln in lines):
        return [], [], ["PLAN.md: no '## 8.' section found"]
    blocks: list[_Block] = []
    sections: list[str] = []
    section, absolute, in8 = "", False, False
    para: _Block | None = None
    table_default: str | None = None
    in_fence = False
    for i, raw in enumerate(lines):
        stripped = raw.strip()
        if stripped.startswith("```"):
            in_fence = not in_fence
            para = None
            continue
        if in_fence:
            continue
        heading = re.match(r"^(#{2,})\s+(\d+(?:\.\d+)*)\.?\s*(.*)$", stripped)
        if heading:
            para, table_default = None, None
            number, rest = heading.group(2), heading.group(3)
            title = re.sub(r"`[^`]*`|\([^)]*\)", "", rest).strip()
            title = re.split(r"\s[-—–]\s|:", title)[0].strip()
            section = f"{number} {title}".strip()
            in8 = number == "8" or number.startswith("8.")
            absolute = in8 and "system" in rest.lower()
            if (in8 and number != "8") or not section8_only:
                sections.append(section)
            continue
        if stripped.startswith("#"):
            para, table_default = None, None
            continue
        if section8_only and not in8:
            continue
        if stripped.startswith("|"):
            para = None
            if _TABLE_SEP_RE.match(stripped):
                continue
            cells = _split_cells(stripped)
            if i + 1 < len(lines) and _TABLE_SEP_RE.match(lines[i + 1].strip()):
                head = re.match(r"\s*(GET|POST|PUT|PATCH|DELETE)\b", cells[0] if cells else "")
                table_default = head.group(1) if head and in8 else None
                continue
            block = _Block(section, absolute, in8, default_method=table_default)
            block.add(cells[0] if cells else "", i + 1)
            blocks.append(block)
        elif not stripped:
            para, table_default = None, None
        else:
            if para is None or re.match(r"^[*-]\s", stripped):
                para = _Block(section, absolute, in8)
                blocks.append(para)
            para.add(stripped, i + 1)

    top_level: set[str] = set()
    for block in blocks:
        for m in _PLAN_TOKEN_RE.finditer(block.text):
            code = (m.group(1) or "").strip()
            if code.startswith("/"):
                segs = [s for s in code.split("?")[0].split("/") if s]
                if len(segs) >= 2:
                    top_level.add(segs[0])

    endpoints: list[PlanEndpoint] = []
    seen: set[tuple[Any, ...]] = set()
    notes: list[str] = []

    def add(
        methods: set[str],
        seg_alts: list[list[str]],
        block: _Block,
        line: int,
        optional: bool = False,
        note: str = "",
    ) -> None:
        alts = []
        for segs in seg_alts:
            path = "/" + "/".join(segs)
            if not (block.absolute or path.startswith("/api/")):
                path = API_PREFIX + path
            alts.append(pattern_from_template(path))
        key = (frozenset(methods), tuple(a.key for a in alts))
        if key in seen:
            return
        seen.add(key)
        endpoints.append(PlanEndpoint(frozenset(methods), alts, block.section, line, optional, note))

    blocks.sort(key=lambda b: not b.in_section8)  # stable: section 8 wins attribution of repeated endpoints
    for block in blocks:
        methods_token = block.default_method
        prev_segs: list[str] | None = None
        method_since_path = methods_token is not None
        for m in _PLAN_TOKEN_RE.finditer(block.text):
            if m.group(2):
                methods_token = m.group(2)
                method_since_path = True
                continue
            code = (m.group(1) or "").strip()
            inline = _INLINE_METHOD_RE.match(code)  # `POST /voice/transcriptions` or a bare `PATCH`
            if inline:
                methods_token = inline.group(1)
                method_since_path = True
                code = (inline.group(2) or "").strip()
            if not code.startswith("/") or code.startswith("//"):
                continue
            line = block.line_at(m.start())
            segs = [s for s in code.split("?")[0].split("#")[0].split("/") if s]
            if not segs or any("*" in s for s in segs):
                continue  # `/auth/staff/*` is a wildcard reference, not an endpoint
            if (
                not method_since_path
                and prev_segs
                and len(prev_segs) >= 2
                and len(segs) == 1
                and segs[0] not in top_level
            ):
                segs = prev_segs[:-1] + segs  # "POST `/x/{id}/approve` · `/reject`"
            if methods_token is None:
                if block.in_section8:
                    notes.append(f"PLAN.md:{line}: path {code} has no HTTP method - skipped")
                prev_segs, method_since_path = segs, False
                continue
            options = [s.split("|") if "|" in s else [s] for s in segs]
            for combo in itertools.product(*options):
                combo_segs = list(combo)
                item = combo_segs + ["{id}"]
                if methods_token == "CRUD":
                    add({"GET"}, [combo_segs], block, line, note="CRUD list")
                    add({"POST"}, [combo_segs], block, line, note="CRUD create")
                    add({"GET"}, [item], block, line, optional=True, note="CRUD read one")
                    add({"PATCH", "PUT"}, [item], block, line, note="CRUD update")
                    add({"DELETE"}, [item], block, line, note="CRUD delete")
                    continue
                verbs = methods_token.split("/")
                collection = len(verbs) > 1 and "POST" in verbs and not _is_template_param(combo_segs[-1])
                for verb in verbs:
                    if collection and verb in ("PATCH", "PUT", "DELETE"):
                        add(
                            {verb},
                            [combo_segs, item],
                            block,
                            line,
                            note=f"{verb} on the collection or an item",
                        )
                    else:
                        add({verb}, [combo_segs], block, line)
            prev_segs, method_since_path = segs, False
    return endpoints, sections, notes


# =========================================================================================================
# analysis
# =========================================================================================================
@dataclass
class Finding:
    severity: str
    category: str
    method: str
    path: str
    message: str
    locations: list[str] = field(default_factory=list)
    group: str = ""
    label: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "severity": self.severity,
            "category": self.category,
            "method": self.method,
            "path": self.path,
            "label": self.label or f"{self.method} {self.path}".strip(),
            "message": self.message,
            "locations": self.locations,
            "group": self.group,
        }


def _route_group(path: str) -> str:
    segs = [s for s in path.split("/") if s]
    if segs[:2] == ["api", "v1"]:
        segs = segs[2:]
    return "/" + segs[0] if segs else "/"


def _short(path: str) -> str:
    return path[len(API_PREFIX) :] if path.startswith(API_PREFIX + "/") else path


def analyse(
    backend: BackendResult, calls: list[ClientCall], plan: list[PlanEndpoint], plan_available: bool
) -> tuple[list[Finding], dict[str, Any]]:
    findings: list[Finding] = []
    stats: dict[str, Any] = {}

    def add(
        category: str,
        method: str,
        path: str,
        message: str,
        locations: Iterable[str] = (),
        group: str = "",
        label: str = "",
    ) -> None:
        severity = CATEGORIES[category][0]
        findings.append(Finding(severity, category, method, path, message, list(locations), group, label))

    routes = [r for r in backend.routes if not r.pattern.display.endswith(FRAMEWORK_ROUTE_SUFFIXES)]
    have_backend = backend.status != "missing"

    # ---- meta problems -----------------------------------------------------------------------------------
    if backend.import_error:
        add("backend_import_failed", "", "app.main:app", backend.import_error, [], "import")
    for err in backend.syntax_errors:
        location, _, msg = err.rpartition(": ")
        add("backend_syntax_error", "", location, msg, [location], "syntax")
    if backend.openapi_error:
        add("openapi_failed", "GET", "/api/openapi.json", backend.openapi_error, [], "openapi")
    for item in backend.unmounted:
        add(
            "backend_unmounted_router",
            "",
            item["router"],
            f"{item['routes']} route(s) on this router are never included into the app",
            [item["location"]],
            "router",
        )

    # ---- PLAN helpers ------------------------------------------------------------------------------------
    def plan_hint(call: ClientCall) -> str:
        if not plan_available:
            return ""
        same_path: set[str] = set()
        for ep in plan:
            for alt in ep.alts:
                # PLAN parameters are untyped, so a literal value for one ("weak") still counts here
                if match_path(call.pattern, alt, dynamic_vs_literal_ok=True) is not None:
                    if call.method == "ANY" or call.method in ep.methods:
                        return f"in PLAN {ep.section.split(' ')[0]} (backend not implemented yet)"
                    same_path.update(ep.methods)
        if same_path:
            return f"PLAN lists this path only as {'/'.join(sorted(same_path))}"
        return "NOT in PLAN - client invented this path (fix the client or the plan)"

    # ---- client -> backend -------------------------------------------------------------------------------
    resolved = 0
    if have_backend:
        for call in sorted(calls, key=lambda c: (c.pattern.display, c.method)):
            strong, weak, path_only = [], [], []
            for route in routes:
                quality = match_path(call.pattern, route.pattern, dynamic_vs_literal_ok=True)
                if quality is None:
                    continue
                if method_ok(call.method, route.method):
                    (strong if quality == "strong" else weak).append(route)
                elif quality == "strong":
                    path_only.append(route)
            what = (
                "WebSocket" if call.method == "WS" else ("path reference" if call.kind == "ref" else "call")
            )
            if strong:
                resolved += 1
                if all(r.pattern.trailing_slash != call.pattern.trailing_slash for r in strong):
                    add(
                        "trailing_slash_mismatch",
                        call.method,
                        call.pattern.display,
                        f"backend route is {strong[0].pattern.display}",
                        call.locations,
                        call.source,
                    )
                continue
            if path_only:
                methods = "/".join(sorted({r.method for r in path_only}))
                add(
                    "client_method_mismatch",
                    call.method,
                    call.pattern.display,
                    f"backend serves this path only as {methods}; {plan_hint(call)}",
                    call.locations,
                    call.source,
                )
            elif weak:
                resolved += 1
                add(
                    "client_weak_match",
                    call.method,
                    call.pattern.display,
                    f"only matches {weak[0].method} {weak[0].pattern.display} "
                    f"({weak[0].location or 'route'}) - "
                    "a literal segment would be taken as the {param} value; add an explicit route",
                    call.locations,
                    call.source,
                )
            else:
                hint = plan_hint(call)
                # e.g. /health/live called through the /api/v1 client base
                if call.pattern.segs[:2] == ("api", "v1"):
                    bare = PathPattern(
                        call.pattern.display[len(API_PREFIX) :],
                        call.pattern.segs[2:],
                        call.pattern.types[2:],
                        call.pattern.trailing_slash,
                    )
                    root_hit = next(
                        (
                            r
                            for r in routes
                            if method_ok(call.method, r.method)
                            and match_path(bare, r.pattern, dynamic_vs_literal_ok=True) == "strong"
                        ),
                        None,
                    )
                    if root_hit is not None:
                        hint = (
                            f"the backend serves {root_hit.method} {root_hit.pattern.display} at the root, "
                            f"outside {API_PREFIX} - the client's API base URL adds the prefix"
                        )
                add(
                    "client_route_missing",
                    call.method,
                    call.pattern.display,
                    f"{call.source} {what} has no backend route; {hint}",
                    call.locations,
                    call.source,
                )
    stats["client_calls"] = len(calls)
    stats["client_calls_resolved"] = resolved

    # ---- PLAN -> backend ---------------------------------------------------------------------------------
    covered: set[int] = set()
    implemented = 0
    if plan_available and have_backend:
        for ep in plan:
            strong_hit, weak_hit = False, None
            other_methods: set[str] = set()
            for alt in ep.alts:
                for route in routes:
                    quality = match_path(alt, route.pattern, dynamic_vs_literal_ok=False)
                    if quality is None:
                        continue
                    if route.method in ep.methods or route.method == "*":
                        covered.add(id(route))
                        if quality == "strong":
                            strong_hit = True
                        else:
                            weak_hit = weak_hit or route
                    elif quality == "strong":
                        other_methods.add(route.method)
            where = f"PLAN.md:{ep.line}"
            methods = "|".join(sorted(ep.methods))
            if strong_hit:
                implemented += 1
            elif weak_hit is not None:
                implemented += 1
                add(
                    "plan_weak_match",
                    methods,
                    ep.alts[0].display,
                    f"served by {weak_hit.method} {weak_hit.pattern.display}",
                    [where],
                    ep.section,
                    ep.label(True),
                )
            elif ep.optional:
                add(
                    "plan_optional_not_implemented",
                    methods,
                    ep.alts[0].display,
                    ep.note,
                    [where],
                    ep.section,
                    ep.label(True),
                )
            elif other_methods:
                add(
                    "plan_method_mismatch",
                    methods,
                    ep.alts[0].display,
                    f"PLAN says {ep.label(True)}; backend serves this path only as "
                    f"{'/'.join(sorted(other_methods))}",
                    [where],
                    ep.section,
                    ep.label(True),
                )
            else:
                add(
                    "plan_not_implemented",
                    methods,
                    ep.alts[0].display,
                    ep.label(True) + (f" ({ep.note})" if ep.note else ""),
                    [where],
                    ep.section,
                    ep.label(True),
                )
        for route in routes:
            if id(route) in covered or route.note == "mount":
                continue
            add(
                "backend_not_in_plan",
                route.method,
                route.pattern.display,
                route.location or route.origin,
                [route.location] if route.location else [],
                _route_group(route.pattern.display),
                f"{route.method} {_short(route.pattern.display)}",
            )
    stats["plan_endpoints"] = len(plan)
    stats["plan_required"] = sum(1 for ep in plan if not ep.optional)
    stats["plan_implemented"] = implemented

    # ---- duplicates + shadowing --------------------------------------------------------------------------
    by_key: dict[tuple[str, str], list[BackendRoute]] = defaultdict(list)
    for route in routes:
        by_key[(route.method, route.pattern.key)].append(route)
    for (method, _), dupes in by_key.items():
        if len(dupes) > 1:
            add(
                "backend_duplicate_route",
                method,
                dupes[0].pattern.display,
                f"registered {len(dupes)} times; only the first is reachable",
                [d.location or d.origin for d in dupes],
                _route_group(dupes[0].pattern.display),
            )
    ordered = sorted(routes, key=lambda r: r.order)
    approx = "" if backend.order_reliable and backend.status == "import" else " (order inferred from source)"
    reported: set[int] = set()
    for idx, later in enumerate(ordered):
        for earlier in ordered[:idx]:
            if earlier.method != later.method and "*" not in (earlier.method, later.method):
                continue
            if id(later) in reported or not shadows(earlier.pattern, later.pattern):
                continue
            reported.add(id(later))
            add(
                "backend_shadowed_route",
                later.method,
                later.pattern.display,
                f"{earlier.method} {earlier.pattern.display} is registered earlier and matches first{approx}",
                [x for x in (later.location, earlier.location) if x],
                _route_group(later.pattern.display),
            )
    return findings, stats


# =========================================================================================================
# output
# =========================================================================================================
def _wrap_items(items: list[str], indent: str, width: int = 112) -> list[str]:
    return textwrap.wrap(
        ", ".join(items),
        width=width,
        initial_indent=indent,
        subsequent_indent=indent,
        break_on_hyphens=False,
        break_long_words=False,
    )


def render_text(report: dict[str, Any], findings: list[Finding], max_items: int, quiet: bool) -> str:
    out: list[str] = []
    src = report["sources"]
    summary = report["summary"]
    out.append(f"Heal India Global - API contract check  ({report['generated_at']}, root {report['root']})")
    out.append("")
    out.append("Sources")
    be = src["backend"]
    detail = {
        "import": "import of app.main:app",
        "hybrid": "per-module import + ast (app.main failed)",
        "ast": "ast scan of backend/app",
    }.get(be["status"])
    openapi = ""
    if be["status"] == "import":
        openapi = (
            "; openapi FAILED"
            if be.get("openapi_error")
            else f"; openapi ok ({be.get('openapi_paths')} paths)"
        )
    if detail is None:
        out.append("  backend : not found (backend/app is missing) - backend checks skipped")
    else:
        out.append(
            f"  backend : {be['routes']} routes via {detail}{openapi}"
            + (f"  [python {be['python']}]" if be.get("python") else "")
        )
    for name, status in (be.get("module_status") or {}).items():
        if status != "import":
            out.append(f"            module {name}: {status}")
    web, mob = src["web"], src["mobile"]
    out.append(
        f"  web     : {web.get('calls', 0)} distinct calls in {web.get('endpoint_files', 0)} endpoint files "
        f"+ {web.get('shared_files', 0)} shared + {web.get('app_files', 0)} app files"
        + (f"  [missing: {', '.join(web['missing'])}]" if web.get("missing") else "")
    )
    out.append(
        f"  mobile  : {mob.get('calls', 0)} distinct calls in {mob.get('repository_files', 0)} repository "
        f"files + {mob.get('other_files', 0)} other files"
        + (f"  [missing: {', '.join(mob['missing'])}]" if mob.get("missing") else "")
    )
    pl = src["plan"]
    elsewhere = pl.get("endpoints_outside_section8", 0)
    out.append(
        f"  PLAN    : {pl['endpoints']} endpoints from {pl['file']} (section 8: {pl['endpoints'] - elsewhere}"
        + (
            f"; elsewhere: {elsewhere} in "
            + ", ".join(s.split(" ")[0] for s in pl["sections"] if not s.startswith("8"))
            if elsewhere
            else ""
        )
        + ")"
        + (f"  [{pl['status']}]" if pl["status"] != "ok" else "")
    )
    for note in (be.get("notes") or [])[:8] + (pl.get("notes") or [])[:5]:
        out.append(f"  note    : {note}")
    out.append("")
    stats = report["stats"]
    out.append(
        f"Summary: {summary['CRITICAL']} CRITICAL, {summary['WARNING']} WARNING, {summary['INFO']} INFO"
        f"  |  PLAN implemented {stats.get('plan_implemented', 0)}/{stats.get('plan_endpoints', 0)}"
        f"  |  client calls resolved {stats.get('client_calls_resolved', 0)}/{stats.get('client_calls', 0)}"
        f"  ->  exit {report['exit_code']}"
    )
    by_cat: dict[str, list[Finding]] = defaultdict(list)
    for f in findings:
        by_cat[f.category].append(f)
    for severity in SEVERITY_ORDER:
        if quiet and severity != "CRITICAL":
            continue
        for category, (sev, description) in CATEGORIES.items():
            items = by_cat.get(category, [])
            if sev != severity or not items:
                continue
            out.append("")
            out.append(f"{severity} {category} ({len(items)}): {description}")
            if category in (
                "plan_not_implemented",
                "plan_optional_not_implemented",
                "backend_not_in_plan",
                "plan_weak_match",
            ):
                groups: dict[str, list[Finding]] = defaultdict(list)
                for f in items:
                    groups[f.group].append(f)
                shown = 0
                for group, members in groups.items():
                    if max_items and shown >= max_items:
                        out.append(
                            f"  ... {len(groups) - list(groups).index(group)} more groups "
                            "(--max-items 0 or --json for everything)"
                        )
                        break
                    labels = [m.label or f"{m.method} {_short(m.path)}" for m in members]
                    out.append(f"  {group} ({len(members)}):")
                    out.extend(_wrap_items(labels, "      "))
                    shown += 1
                continue
            for n, f in enumerate(items):
                if max_items and n >= max_items:
                    out.append(f"  ... and {len(items) - n} more (--max-items 0 or --json for everything)")
                    break
                head = f"  {f.method:<6} {f.path}" if f.method else f"  {f.path}"
                out.append(head)
                out.append(f"         {f.message}")
                if f.locations:
                    extra = f" (+{len(f.locations) - 3} more)" if len(f.locations) > 3 else ""
                    out.append(f"         at {', '.join(f.locations[:3])}{extra}")
    return "\n".join(out)


def build_inventory(
    backend: BackendResult, calls: list[ClientCall], plan: list[PlanEndpoint]
) -> dict[str, Any]:
    return {
        "backend_routes": [
            {
                "method": r.method,
                "path": r.pattern.display,
                "location": r.location,
                "origin": r.origin,
                "in_schema": r.in_schema,
                "note": r.note,
            }
            for r in sorted(backend.routes, key=lambda r: r.order)
        ],
        "client_calls": [
            {
                "method": c.method,
                "path": c.pattern.display,
                "source": c.source,
                "kind": c.kind,
                "locations": c.locations,
            }
            for c in sorted(calls, key=lambda c: (c.pattern.display, c.method))
        ],
        "plan_endpoints": [
            {
                "methods": sorted(ep.methods),
                "paths": [a.display for a in ep.alts],
                "section": ep.section,
                "line": ep.line,
                "optional": ep.optional,
                "note": ep.note,
            }
            for ep in plan
        ],
    }


def render_inventory_text(inv: dict[str, Any]) -> str:
    out = ["", f"Inventory: backend routes ({len(inv['backend_routes'])})"]
    out += [
        f"  {r['method']:<6} {r['path']}  [{r['origin']}] {r['location'] or ''}"
        for r in inv["backend_routes"]
    ]
    out += ["", f"Inventory: client calls ({len(inv['client_calls'])})"]
    out += [
        f"  {c['method']:<6} {c['path']}  [{c['source']}/{c['kind']}] {', '.join(c['locations'][:2])}"
        for c in inv["client_calls"]
    ]
    out += ["", f"Inventory: PLAN endpoints ({len(inv['plan_endpoints'])})"]
    out += [
        f"  {'|'.join(p['methods']):<10} {' or '.join(p['paths'])}  ({p['section']}, line {p['line']})"
        + ("  [optional]" if p["optional"] else "")
        for p in inv["plan_endpoints"]
    ]
    return "\n".join(out)


# =========================================================================================================
# CLI
# =========================================================================================================
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="check_contracts.py",
        description="Compare backend routes, web + mobile client calls and PLAN.md section 8.",
        epilog="Exit status: 1 when findings reach --fail-on (default: any CRITICAL), else 0. "
        "See scripts/README-tools.md.",
    )
    parser.add_argument(
        "--root", type=Path, default=DEFAULT_ROOT, help="repository root (default: parent of scripts/)"
    )
    parser.add_argument("--json", action="store_true", help="print the full report as JSON")
    parser.add_argument("--json-file", type=Path, help="also write the JSON report to this file")
    parser.add_argument(
        "--backend-mode",
        choices=("auto", "ast"),
        default="auto",
        help="auto: import app.main in the backend venv, falling back to per-module import + ast "
        "(default); ast: static scan only",
    )
    parser.add_argument("--python", type=Path, help="interpreter for the import step (default backend/.venv)")
    parser.add_argument("--import-timeout", type=float, default=120.0, help="seconds (default 120)")
    parser.add_argument(
        "--no-web-apps", action="store_true", help="only scan web/packages/shared, not web/apps/*"
    )
    parser.add_argument(
        "--plan-section8-only",
        action="store_true",
        help="ignore endpoints the PLAN defines outside section 8 (e.g. 3.1 staff door, 7.1 docai, "
        "7.2 voice)",
    )
    parser.add_argument(
        "--fail-on",
        choices=("critical", "warning", "never"),
        default="critical",
        help="severity that makes the exit status 1 (default critical)",
    )
    parser.add_argument(
        "--max-items",
        type=int,
        default=40,
        help="text mode: max items/groups per category (0 = all; default 40)",
    )
    parser.add_argument(
        "-q", "--quiet", action="store_true", help="text mode: sources, summary and CRITICAL only"
    )
    parser.add_argument(
        "--no-fields",
        action="store_true",
        help="skip the request/response field checks (client payloads and models vs OpenAPI schemas)",
    )
    parser.add_argument(
        "--inventory",
        action="store_true",
        help="also list every backend route, client call and PLAN endpoint found",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")  # type: ignore[attr-defined]
        except (AttributeError, ValueError):
            pass
    args = build_parser().parse_args(argv)
    root: Path = args.root.resolve()
    if not root.is_dir():
        print(f"error: --root {root} is not a directory", file=sys.stderr)
        return 2
    started = time.perf_counter()
    redact = Redactor(root / "backend" / ".env")

    backend = load_backend(root, args.backend_mode, args.python, args.import_timeout, redact)
    calls, client_info, scanner = collect_clients(root, include_apps=not args.no_web_apps)
    plan_file = root / "docs" / "PLAN.md"
    if plan_file.is_file():
        plan, _sections, plan_notes = parse_plan(plan_file, section8_only=args.plan_section8_only)
        plan_status = "ok" if plan else "no endpoints parsed"
    else:
        plan, plan_notes, plan_status = [], [], "missing"
    findings, stats = analyse(backend, calls, plan, plan_available=bool(plan))
    if backend.openapi and not args.no_fields:
        field_rows, field_stats = check_fields(backend.openapi, scanner.sites, scanner.files)
        stats.update(field_stats)
        merged: dict[tuple[str, ...], Finding] = {}
        more: dict[tuple[str, ...], set[str]] = defaultdict(set)
        for category, method, fpath, message, loc in field_rows:
            # one model read by many endpoints -> one finding (the message names model + schema)
            key = (
                (category, message)
                if category.startswith("field_response")
                else (category, method, fpath, message)
            )
            if key in merged:
                if loc not in merged[key].locations:
                    merged[key].locations.append(loc)
                if f"{method} {fpath}" != f"{merged[key].method} {merged[key].path}":
                    more[key].add(f"{method} {fpath}")
                continue
            merged[key] = Finding(
                CATEGORIES[category][0], category, method, fpath, message, [loc], _route_group(fpath)
            )
            findings.append(merged[key])
        for key, extra in more.items():
            merged[key].message += f" [also {len(extra)} more endpoint(s)]"
    findings.sort(
        key=lambda f: (
            SEVERITY_ORDER.index(f.severity),
            list(CATEGORIES).index(f.category),
            f.group,
            f.path,
            f.method,
        )
    )
    summary = {sev: sum(1 for f in findings if f.severity == sev) for sev in SEVERITY_ORDER}
    by_category: dict[str, int] = defaultdict(int)
    for f in findings:
        by_category[f.category] += 1
    if args.fail_on == "critical":
        exit_code = 1 if summary["CRITICAL"] else 0
    elif args.fail_on == "warning":
        exit_code = 1 if summary["CRITICAL"] or summary["WARNING"] else 0
    else:
        exit_code = 0

    report: dict[str, Any] = {
        "tool": "check_contracts",
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "root": root.as_posix(),
        "elapsed_s": round(time.perf_counter() - started, 2),
        "exit_code": exit_code,
        "sources": {
            "backend": {
                "status": backend.status,
                "routes": len(backend.routes),
                "python": backend.python,
                "import_error": backend.import_error,
                "import_traceback": backend.import_traceback,
                "openapi_error": backend.openapi_error,
                "openapi_paths": backend.openapi_paths,
                "module_status": backend.module_status,
                "notes": [redact(n) for n in backend.notes],
            },
            "web": client_info["web"],
            "mobile": client_info["mobile"],
            "plan": {
                "file": rel_path(plan_file, root),
                "status": plan_status,
                "endpoints": len(plan),
                "endpoints_outside_section8": sum(1 for ep in plan if not ep.section.startswith("8")),
                "sections": list(dict.fromkeys(ep.section for ep in plan)),
                "notes": plan_notes,
            },
        },
        "summary": summary,
        "by_category": dict(by_category),
        "stats": stats,
        "findings": [f.as_dict() for f in findings],
    }
    if args.inventory:
        report["inventory"] = build_inventory(backend, calls, plan)
    payload = json.dumps(report, indent=2)
    if args.json_file:
        args.json_file.write_text(payload + "\n", encoding="utf-8")
    if args.json:
        print(payload)
    else:
        print(render_text(report, findings, args.max_items, args.quiet))
        if args.inventory:
            print(render_inventory_text(report["inventory"]))
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
