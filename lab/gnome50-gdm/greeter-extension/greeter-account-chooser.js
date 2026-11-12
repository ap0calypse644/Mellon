import Clutter from 'gi://Clutter';
import St from 'gi://St';

// G1.6B — GNOME 50 account selection presentation only.
// GNOME's actual UserListItem.emit('activate') performs all account
// selection; login/auth/session/accessibility remain GNOME-owned.
// No password, keystroke, verifier or authentication code lives here.
//
// Native controls remain an explicit SHOW LOGIN click away.  Unknown
// users, incomplete list initialization, disabled lists or unrepresentable
// rosters always leave the native chooser available.
const MAX_CUSTOM_ACCOUNTS = 8;
const AUTO_STABLE_TICKS = 5; // 250ms sync ticks, ~1.25s roster stabilization
const STARTUP_MAX_TICKS = 32; // bounded 8-second GDM initialization curtain

// The native account list may not be populated when the GDM LoginDialog
// first mounts. Cover *that* interval with Mellon instead of exposing the
// Ubuntu logo. Only a known account-selection phase can be covered;
// unsupported, oversized, or unavailable native structures fail open.
function mayBeLoadingRoster(dialog, container) {
    if (!dialog || dialog.get_parent?.() !== container ||
        dialog._disableUserList === true ||
        dialog._authPrompt?.visible !== false ||
        !dialog._userSelectionBox || !dialog._userList ||
        dialog._timedLoginUserListHold)
        return false;
    const list = dialog._userList;
    if (list._items instanceof Map) {
        if (list._items.size > MAX_CUSTOM_ACCOUNTS)
            return false;
        // Once GNOME has loaded a nonempty list, an incompatible item
        // must NEVER be hidden by a perpetual Mellon splash.
        if (dialog._userListLoaded === true &&
            dialog._userManager?.is_loaded === true &&
            list._items.size > 0)
            return false;
        return true;
    }
    // GNOME may construct its list before allocating the internal map.
    // Permit the splash only before GNOME says its roster is loaded.
    return dialog._userListLoaded !== true;
}

function nativeRoster(dialog, container) {
    if (!dialog || dialog.get_parent?.() !== container ||
        dialog._disableUserList !== false ||
        dialog._userListLoaded !== true ||
        dialog._userManager?.is_loaded !== true ||
        dialog._userSelectionBox?.visible !== true ||
        dialog._authPrompt?.visible !== false ||
        dialog._timedLoginUserListHold)
        return null;

    const list = dialog._userList;
    if (!(list?._items instanceof Map) ||
        list._items.size < 1 || list._items.size > MAX_CUSTOM_ACCOUNTS ||
        list.numItems?.() !== list._items.size)
        return null;

    const items = [];
    for (const [key, item] of list._items) {
        const user = item?.user;
        if (typeof key !== 'string' || !key ||
            typeof item?.emit !== 'function' ||
            typeof user?.get_user_name !== 'function' ||
            user.get_user_name() !== key ||
            user.is_loaded !== true ||
            user.locked === true ||
            user.is_system_account?.() !== false)
            return null;
        items.push(item);
    }
    return items.sort((a,b) =>
        a.user.get_user_name().localeCompare(b.user.get_user_name()));
}

function textLabel(text, className) {
    return new St.Label({
        text, style_class: className,
        reactive: false, can_focus: false,
    });
}

export class GreeterAccountChooser {
    constructor(container, dialog, photo, starfield, hud) {
        if (!container || dialog?.get_parent?.() !== container ||
            typeof container.set_child_above_sibling !== 'function' ||
            typeof dialog?._userList?.numItems !== 'function')
            throw new Error('Unsupported GNOME 50 GDM user list');
        this._container = container;
        this._dialog = dialog;
        this._photo = photo;
        this._starfield = starfield;
        this._hud = hud;
        this._active = false;
        this._bypassed = false;
        this._autoAttempted = false;
        this._stableTicks = 0;
        this._startupTicks = 0;
        this._rosterKey = null;
        this._renderedKey = null;
        this._destroyed = false;

        this._layer = new St.Widget({
            reactive: false, can_focus: false,
            layout_manager: new Clutter.FixedLayout(),
        });
        this._layer.add_constraint(new Clutter.BindConstraint({
            source: container, coordinate: Clutter.BindCoordinate.SIZE,
        }));
        this._layer.hide();
        container.insert_child_above(this._layer, dialog);
        this._panel = null;
        this._recovery = null;
    }

    get isVisible() {
        return this._active && !this._bypassed;
    }

    sync() {
        if (this._destroyed || this._bypassed)
            return;
        const roster = nativeRoster(this._dialog, this._container);
        if (!roster) {
            this._rosterKey = null;
            this._stableTicks = 0;
            // A genuine password/alternate prompt gets the existing
            // lock-screen-matched G1.6A.1 cover, never this account layer.
            if (this._dialog?._authPrompt?.visible === true) {
                const prompt = this._dialog._authPrompt;
                if (prompt._passwordEntry &&
                    prompt._entry === prompt._passwordEntry)
                    this._hide(); // Native password covered by G1.6A.1.
                else
                    this.revealNative(); // Username, OTP or other challenge.
                return;
            }
            // GNOME may temporarily hide the user list while finishing
            // the one native activation. Keep the art, not a new loader.
            if (this._autoAttempted &&
                this._dialog?._userSelectionBox?.visible === false) {
                this._hide();
                return;
            }
            if (mayBeLoadingRoster(this._dialog, this._container) &&
                ++this._startupTicks <= STARTUP_MAX_TICKS) {
                this._show(null, 'startup', true);
                return;
            }
            // No native user, unsupported list, or timed out after 8s.
            // Restore both the native compositor order and keyboard focus.
            this.revealNative();
            return;
        }
        this._startupTicks = 0;
        // Never auto-start on a half-loaded roster. The USER LIST is the
        // authoritative source; Mellon never guesses from /etc/passwd.
        const key = roster.map(item => item.user.get_user_name()).join('\x1f');
        if (key !== this._rosterKey) {
            this._rosterKey = key;
            this._stableTicks = 0;
        } else {
            this._stableTicks++;
        }

        // Show a Mellon loading/choice scene immediately: the original
        // GDM account card is covered while the list settles.
        this._show(roster, key, this._stableTicks < AUTO_STABLE_TICKS);

        if (roster.length === 1 &&
            this._stableTicks >= AUTO_STABLE_TICKS &&
            !this._autoAttempted) {
            this._autoAttempted = true; // Once per GDM LoginDialog.
            // Use exactly GNOME's native user-item activation signal.
            // This is NOT automatic login: it only opens password entry.
            this._activate(roster[0]);
        }
    }

    _show(roster, key, settling) {
        if (!this._active) {
            const c = this._container;
            c.set_child_above_sibling(this._photo, this._dialog);
            c.set_child_above_sibling(this._starfield.actor, this._photo);
            c.set_child_above_sibling(this._hud.actor, this._starfield.actor);
            c.set_child_above_sibling(this._layer, this._hud.actor);
            this._photo.show();
            this._starfield.actor.show();
            this._hud.actor.show();
            this._hud.setRecoveryLayout(true);
            this._layer.show();
            this._active = true;
        }
        const startup = roster === null;
        const showChooser = !startup &&
            (roster.length > 1 || this._autoAttempted);
        const renderKey = key + ':' +
            (startup ? 'startup' : showChooser ? 'choose'
                : settling ? 'settle' : 'enter');
        if (this._renderedKey === renderKey)
            return;
        this._renderedKey = renderKey;
        this._panel?.destroy();
        this._recovery?.destroy();

        const panel = new St.BoxLayout({
            vertical: true, reactive: false, can_focus: false,
            style_class: 'mellon-gdm-account-panel',
        });
        panel.add_constraint(new Clutter.AlignConstraint({
            source: this._layer, align_axis: Clutter.AlignAxis.BOTH,
            factor: .5,
        }));
        panel.add_child(textLabel('MELLON  /  ACCESS CONTROL',
            'mellon-gdm-account-eyebrow'));
        panel.add_child(textLabel(
            startup ? 'ESTABLISHING UPLINK'
                : showChooser ? 'SELECT OPERATOR' : 'IDENTIFYING OPERATOR',
            'mellon-gdm-account-title'));
        if (showChooser) {
            // All eligible native users are represented; never silently
            // omit a user from the custom chooser.
            for (const item of roster) {
                const button = new St.Button({
                    reactive: true, can_focus: true,
                    track_hover: true,
                    style_class: 'mellon-gdm-account-option',
                });
                const row = new St.BoxLayout({
                    vertical: true, reactive: false,
                    can_focus: false,
                });
                const user = item.user;
                const display = user.get_real_name?.() ||
                    user.get_user_name();
                row.add_child(textLabel(display, 'mellon-gdm-account-name'));
                if (display !== user.get_user_name())
                    row.add_child(textLabel(user.get_user_name(),
                        'mellon-gdm-account-id'));
                button.set_child(row);
                button.connect('clicked', () => this._activate(item));
                panel.add_child(button);
            }
        } else {
            panel.add_child(textLabel(
                startup ? 'INITIALIZING NATIVE ACCOUNT REGISTRY'
                    : 'PREPARING SECURE LOGIN',
                'mellon-gdm-account-status'));
        }

        const recovery = new St.Button({
            label: 'SHOW LOGIN', can_focus: false,
            reactive: true, track_hover: true,
            style_class: 'mellon-m5-recovery',
        });
        recovery.set_position(26,22);
        recovery.connect('clicked', () => this.revealNative());
        this._layer.add_child(panel);
        this._layer.add_child(recovery);
        // Only the small account panel fades in. The astronomical photo
        // stays continuously opaque above native GDM across handoff.
        if (typeof panel.ease === 'function') {
            panel.opacity = 0;
            panel.ease({
                opacity: 255, duration: 180,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
        this._panel = panel;
        this._recovery = recovery;
        // GNOME's native screen is behind artwork. The custom choices
        // are focusable and keyboard accessible via standard St.Button.
        if (showChooser)
            panel.get_children().find(child =>
                child instanceof St.Button)?.grab_key_focus();
    }

    _activate(item) {
        if (this._destroyed || this._bypassed || !item ||
            this._dialog?._userSelectionBox?.visible !== true)
            return;
        const roster = nativeRoster(this._dialog, this._container);
        if (!roster?.includes(item))
            return; // Stale item; fail open without activating anyone.
        this._autoAttempted = true;
        this._hide();
        try {
            item.emit('activate'); // Same GNOME 50 path as native click.
        } catch (_) {
            // Broken GNOME internals must never strand login or retry.
            this.revealNative();
        }
    }

    _hide() {
        if (!this._active)
            return;
        this._active = false;
        this._layer.hide();
        // Deliberately do NOT lower the artwork here. The password
        // cover takes over the same actors on the next GDM prompt.
    }

    revealNative() {
        if (this._destroyed)
            return;
        this._bypassed = true;
        this._hide();
        const c = this._container;
        c.set_child_below_sibling(this._photo, this._dialog);
        c.set_child_above_sibling(this._starfield.actor, this._photo);
        c.set_child_above_sibling(this._hud.actor, this._starfield.actor);
        this._hud.setRecoveryLayout(false);
        this._dialog?._userList?.grab_key_focus?.();
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        this._layer?.destroy();
        this._layer = null;
        this._panel = null;
        this._recovery = null;
        this._container = null;
        this._dialog = null;
        this._photo = null;
        this._starfield = null;
        this._hud = null;
    }
}
