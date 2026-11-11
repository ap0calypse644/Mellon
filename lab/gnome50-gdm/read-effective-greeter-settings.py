#!/usr/bin/env python3
"""Read-only GNOME 50 greeter dconf audit. Executed with interactive guest
sudo over SSH PTY; no file writes and no authentication data are inspected.
"""
import os
import pathlib
import pwd
import subprocess

if os.geteuid() != 0:
    raise SystemExit("Read-only audit requires guest sudo")

pids = []
for proc in pathlib.Path("/proc").iterdir():
    if not proc.name.isdigit():
        continue
    try:
        data = (proc / "cmdline").read_bytes().split(b"\0")
        args = [x.decode("utf-8", "replace") for x in data if x]
        if args and args[0].endswith("/gnome-shell") and "--mode=gdm" in args:
            pids.append(proc)
    except (OSError, PermissionError):
        continue

if len(pids) != 1:
    raise SystemExit(f"Expected exactly one live --mode=gdm shell, found {len(pids)}")

proc = pids[0]
uid = proc.stat().st_uid
greeter = pwd.getpwuid(uid)
if greeter.pw_name != "gdm-greeter":
    raise SystemExit("Unexpected GNOME greeter account")

# Extract ONLY the paths needed for reading its actual configuration.
keys = {
    "DCONF_PROFILE", "XDG_CONFIG_HOME", "XDG_RUNTIME_DIR",
    "HOME", "GSETTINGS_BACKEND", "DBUS_SESSION_BUS_ADDRESS",
}
values = {}
for field in (proc / "environ").read_bytes().split(b"\0"):
    if b"=" not in field:
        continue
    key, value = field.split(b"=", 1)
    name = key.decode("utf-8", "replace")
    if name in keys:
        values[name] = value.decode("utf-8", "replace")

print("Greeter account:", greeter.pw_name, "| UID:", uid)
for name in sorted(keys - {"DBUS_SESSION_BUS_ADDRESS"}):
    print(f"{name}: {values.get(name, '<unset>')}")
# Never print the greeter's session bus address.
profile = values.get("DCONF_PROFILE")
if profile != "gdm":
    raise SystemExit("Greeter does not expose DCONF_PROFILE=gdm; inspect before install")

home = values.get("HOME", greeter.pw_dir)
config = values.get("XDG_CONFIG_HOME") or os.path.join(home, ".config")
runtime = values.get("XDG_RUNTIME_DIR") or f"/run/user/{uid}"
if not all(os.path.isabs(x) for x in (home, config, runtime)):
    raise SystemExit("Invalid greeter config/runtime directory")

user_db = pathlib.Path(config) / "dconf/user"
print("Effective profile:", profile)
print("User-db:", user_db, "exists:", user_db.is_file(),
      "symlink:", user_db.is_symlink())

env = {
    "DCONF_PROFILE": profile,
    "HOME": home,
    "XDG_CONFIG_HOME": config,
    "XDG_RUNTIME_DIR": runtime,
    "PATH": "/usr/bin:/bin",
    "LANG": "C.UTF-8",
}
for name in ("GSETTINGS_BACKEND", "DBUS_SESSION_BUS_ADDRESS"):
    if name in values:
        env[name] = values[name]

settings = {}
for name in (
    "enabled-extensions", "disabled-extensions", "disable-user-extensions"
):
    result = subprocess.run(
        ["/usr/bin/gsettings", "get", "org.gnome.shell", name],
        env=env,
        capture_output=True,
        text=True,
        timeout=8,
        user=uid,
        group=greeter.pw_gid,
        extra_groups=[],
        check=False,
    )
    if result.returncode != 0:
        print(f"{name}: <READ FAILED>")
        raise SystemExit(
            f"Cannot read GDM greeter setting {name}: "
            + result.stderr.strip()[:160]
        )
    settings[name] = result.stdout.strip()
    print(f"{name}: {settings[name]}")

if settings["disable-user-extensions"] != "false":
    raise SystemExit("Greeter extensions are disabled: do not install")
if any(
    settings[name] not in ("[]", "@as []")
    for name in ("enabled-extensions", "disabled-extensions")
):
    raise SystemExit("Greeter has non-default extension settings; inspect before install")

vendor = pathlib.Path("/usr/share/dconf/profile/gdm")
if not vendor.is_file() or vendor.is_symlink():
    raise SystemExit("GNOME vendor greeter profile missing or linked")
lines = [
    line.strip()
    for line in vendor.read_text().splitlines()
    if line.strip() and not line.lstrip().startswith("#")
]
expected = [
    "user-db:user",
    "file-db:/var/lib/gdm3/greeter-dconf-defaults",
]
if lines != expected:
    raise SystemExit(f"Unexpected GNOME 50 greeter vendor profile: {lines}")

print("Vendor GDM profile: original user-db and file-db preserved")
print("PASS: real greeter GSettings defaults verified. No GDM changes made.")
