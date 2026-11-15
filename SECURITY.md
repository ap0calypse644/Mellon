# Reporting security issues

Mellon renders inside GNOME Shell's login/lock interfaces, so bugs may affect login availability and user privacy even when authentication is still GNOME-owned.

**Supported/tested environment:** Ubuntu 26.04.1 with GNOME Shell 50.1, GDM 50.1, and the current G1.8/M8.4 source. Other GNOME versions are experimental.

## Sensitive vulnerabilities

Please **do not open a public issue** containing working bypass details, credentials, exploit instructions, or private system configuration.

If GitHub's **Private vulnerability reporting** feature is enabled for this repository, use the repository's *Security → Report a vulnerability* flow. Otherwise contact a maintainer through an agreed private channel; if no private route exists, open a minimal issue requesting contact **without exploit details**.

Include (privately): exact GNOME/GDM version, reproduction steps on an isolated VM, affected version/commit, potential impact, and a safe rollback. Do not attach real passwords or keys.

## Non-sensitive bugs

A regular issue is fine for visual glitches, crashes in a disposable VM, typos and synthetic test regressions. Redact usernames, IP addresses, full process environments, access tokens and identifiable account details from screenshots/logs.

## Recovery if Mellon breaks your login

On the original BlackPearl install, use a working text console and the documented root-owned rollback:

```bash
(
    set -euo pipefail
    sudo /usr/local/sbin/mellon-blackpearl-rollback
    sudo reboot
)
```

On another machine, **do not assume that path exists**. Use your own installer-specific recovery method or restore a tested VM snapshot. See [Deployment](docs/DEPLOYMENT.md) and [Troubleshooting](docs/TROUBLESHOOTING.md).

The project is experimental and makes **no security guarantee** that overlays are compatible with every GNOME version, distro, authentication challenge or accessibility setup.
