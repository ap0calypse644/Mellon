#!/usr/bin/env python3
"""G1 post-install diagnostics for the ACTUAL GNOME 50 GDM greeter.

Only reads environment-key metadata, dconf settings, installed file
metadata, and narrowly filtered Shell logs. No file writes, no auth
information, and no shell modifications. Runs under guest-root with
an interactive sudo prompt forwarded over SSH.
"""
import json
import os
from pathlib import Path
import pwd
import re
import subprocess
import sys

VM_NAME = "mellon-gnome50-lab"
UUID = "mellon-greeter@local"
BASE = Path("/usr/share/gnome-shell/extensions") / UUID
PROFILE = Path("/etc/dconf/profile/gdm")
KEYFILE = Path("/etc/dconf/db/gdm.d/95-mellon-greeter")
COMPILED = Path("/etc/dconf/db/gdm")
MARKER = Path("/var/lib/mellon-greeter-g1-installed")
ROLLBACK = Path("/usr/local/sbin/mellon-greeter-g1-rollback")


def info(path):
    try:
        stat = path.lstat()
    except FileNotFoundError:
        print(f"ABSENT: {path}")
        return False
    print(f"PRESENT: {path} kind={'symlink' if path.is_symlink() else 'file' if path.is_file() else 'dir'} "
          f"uid={stat.st_uid} gid={stat.st_gid} mode={stat.st_mode & 0o777:o}")
    return True


def read_expected(path):
    if not path.exists() or path.is_symlink():
        return
    try:
        print(path.read_text(encoding="utf-8")[:700])
    except (OSError, UnicodeError) as err:
        print("Cannot read config:", type(err).__name__)


def process_env(proc):
    names = {"DCONF_PROFILE", "XDG_CONFIG_HOME", "XDG_RUNTIME_DIR", "HOME",
             "DBUS_SESSION_BUS_ADDRESS", "GSETTINGS_BACKEND"}
    values = {}
    for field in (proc / "environ").read_bytes().split(b"\0"):
        if b"=" not in field:
            continue
        k, v = field.split(b"=", 1)
        key = k.decode("utf-8", "replace")
        if key in names:
            values[key] = v.decode("utf-8", "replace")
    return values


def as_greeter(argv, env, uid, gid):
    try:
        return subprocess.run(
            argv, capture_output=True, text=True, timeout=9, check=False,
            env=env, user=uid, group=gid, extra_groups=[])
    except (OSError, subprocess.TimeoutExpired) as err:
        print("READ FAILED:", type(err).__name__, argv[-1])
        return None


if os.geteuid() != 0:
    raise SystemExit("Requires guest-root read-only diagnostics.")

pids = []
for proc in Path("/proc").iterdir():
    if not proc.name.isdigit():
        continue
    try:
        argv = (proc / "cmdline").read_bytes().split(b"\0")
        if (b"--mode=gdm" in argv and
                any(arg.endswith(b"/gnome-shell") for arg in argv)):
            pids.append(proc)
    except OSError:
        pass

print("========== LIVE GREETER PROCESS ==========")
if len(pids) != 1:
    raise SystemExit(f"Expected exactly one GDM shell, found {len(pids)}")
proc = pids[0]
pid = int(proc.name)
uid = proc.stat().st_uid
account = pwd.getpwuid(uid)
print(f"GNOME Shell PID={pid} account={account.pw_name} uid={uid}")
if account.pw_name != "gdm-greeter":
    raise SystemExit("Refusing unexpected greeter identity")

values = process_env(proc)
profile = values.get("DCONF_PROFILE", "")
home = values.get("HOME", account.pw_dir)
config = values.get("XDG_CONFIG_HOME") or os.path.join(home, ".config")
runtime = values.get("XDG_RUNTIME_DIR") or f"/run/user/{uid}"
print("DCONF_PROFILE:", profile or "<unset>")
print("XDG_CONFIG_HOME:", config)
print("XDG_RUNTIME_DIR:", runtime)
if profile != "gdm" or not all(
        os.path.isabs(path) for path in (home, config, runtime)):
    raise SystemExit("Unexpected GDM environment; do not modify anything")

env = {"DCONF_PROFILE": profile, "HOME": home,
       "XDG_CONFIG_HOME": config, "XDG_RUNTIME_DIR": runtime,
       "PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}
for key in ("DBUS_SESSION_BUS_ADDRESS", "GSETTINGS_BACKEND"):
    if key in values:
        env[key] = values[key]

print("\n========== INSTALLED GREETER FILES ==========")
for path in (BASE, BASE / "metadata.json", BASE / "extension.js",
             BASE / "library.json", PROFILE, KEYFILE, COMPILED,
             MARKER, ROLLBACK):
    info(path)
if (BASE / "metadata.json").is_file() and not (BASE / "metadata.json").is_symlink():
    try:
        meta = json.loads((BASE / "metadata.json").read_text())
        print("Extension UUID:", meta.get("uuid"))
        print("Session modes:", meta.get("session-modes"))
    except (ValueError, OSError) as err:
        print("Metadata read error:", type(err).__name__)

print("\n========== ADMIN GDM CONFIGURATION (EXPECTED KEYS ONLY) ==========")
read_expected(PROFILE)
read_expected(KEYFILE)
print("Vendor profile:")
read_expected(Path("/usr/share/dconf/profile/gdm"))

print("\n========== ACTUAL GREETER GSETTINGS ==========")
for key in ("enabled-extensions", "disabled-extensions",
            "disable-user-extensions"):
    result = as_greeter(
        ["/usr/bin/gsettings", "get", "org.gnome.shell", key],
        env, uid, account.pw_gid)
    print(f"{key}: {result.stdout.strip() if result and result.returncode == 0 else '<READ FAILED>'}")
    if result and result.returncode:
        print("  error:", result.stderr.strip()[:220])

print("\n========== ACTUAL GREETER DCONF KEY OVERRIDES ==========")
for key in ("enabled-extensions", "disabled-extensions",
            "disable-user-extensions"):
    result = as_greeter(
        ["/usr/bin/dconf", "read", "/org/gnome/shell/" + key],
        env, uid, account.pw_gid)
    if result and result.returncode == 0:
        print(f"dconf {key}: {result.stdout.strip() or '<unset>'}")
    else:
        print(f"dconf {key}: <READ FAILED>")

print("\n========== GREETER PHOTO READABILITY ==========")
try:
    library = json.loads((BASE / "library.json").read_text())
    scenes = library.get("scenes", [])
    print("Curated scene count:", len(scenes))
    if scenes:
        rel = scenes[0].get("image")
        if isinstance(rel, str) and rel.startswith("assets/") and ".." not in Path(rel).parts:
            image = BASE / rel
            print("Sample photo:", rel)
            info(image)
            accessible = as_greeter(
                ["/usr/bin/test", "-r", str(image)], env,
                uid, account.pw_gid)
            print("Readable by greeter:",
                  bool(accessible and accessible.returncode == 0))
except (OSError, ValueError, TypeError) as err:
    print("Scene library read failed:", type(err).__name__)

print("\n========== RELEVANT CURRENT GREETER JOURNAL ==========")
try:
    journal = subprocess.run(
        ["/usr/bin/journalctl", "-b", "--no-pager", "-o", "cat",
         f"_PID={pid}", "-n", "700"], capture_output=True,
        text=True, timeout=12, check=False)
    if journal.returncode:
        print("Journal unreadable:", journal.stderr.strip()[:250])
    else:
        regex = re.compile(
            r"mellon|extension|js error|error loading|failed to load|"
            r"resource:///org/gnome/shell/extensions|typeerror",
            re.IGNORECASE)
        matched = [
            line[:300].strip() for line in journal.stdout.splitlines()
            if regex.search(line)
        ]
        for line in matched[-45:]:
            print(line)
        if not matched:
            print("No Mellon/extension-related lines in current greeter journal.")
except (OSError, subprocess.TimeoutExpired) as err:
    print("Journal query failed:", type(err).__name__)

print("\nPASS: G1 diagnosis complete; no settings, files or sessions changed.")
