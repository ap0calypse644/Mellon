#!/usr/bin/env node
// M9 GDM: native credential ownership, account selection and recovery
// across a shared visual layer. Pure mocks; no GDM process is started.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const getClass = async (file, name, deps) => {
    let js = await readFile(new URL('./greeter-extension/' + file,
        import.meta.url), 'utf8');
    js = js.replace(/^import [\s\S]*?;\s*$/gm, '')
        .replace('export class ' + name, 'class ' + name);
    assert.ok(!/^import /m.test(js));
    return new Function(...Object.keys(deps), js + '\nreturn ' + name + ';')(
        ...Object.values(deps));
};
class Actor {
    constructor(options = {}) {
        this.options = options;
        this.visible = true;
        this.children = [];
        this.opacity = 255;
    }
    add_constraint() {}
    set_position(x, y) {this.x = x; this.y = y;}
    set_size(w, h) {this.width = w; this.height = h;}
    show() {this.visible = true;}
    hide() {this.visible = false;}
    destroy() {this.destroyed = true;}
    add_child(child) {this.children.push(child);}
    get_children() {return this.children;}
    set_child(child) {this.children = [child];}
    connect(_signal, callback) {this.clicked = callback;}
    grab_key_focus() {this.focused = true;}
    ease({opacity}) {this.opacity = opacity;}
}
const St = {
    Widget: class extends Actor {},
    BoxLayout: class extends Actor {},
    Button: class extends Actor {},
    Label: class extends Actor {},
};
const Clutter = {
    AlignConstraint: class {},
    AlignAxis: {BOTH: 0},
    FixedLayout: class {},
    AnimationMode: {EASE_OUT_QUAD: 1},
};
const GLib = {
    PRIORITY_DEFAULT: 0,
    SOURCE_REMOVE: false,
    SOURCE_CONTINUE: true,
    get_monotonic_time: () => 0,
    timeout_add: () => 1,
    source_remove() {},
};
class FailureTracker {
    observe() {return {supported: true, failures: 0};}
    reset() {}
}
const Cover = await getClass('greeter-password-cover.js',
    'GreeterPasswordCover', {St, Clutter, GLib, FailureTracker});
const Chooser = await getClass('greeter-account-chooser.js',
    'GreeterAccountChooser', {St, Clutter});

const visuals = {
    actor: new St.Widget(),
    primary: {x: 0, y: 0, width: 3440, height: 1440},
    primaryRoot: new St.Widget(),
    show() {this.actor.show();},
    hide() {this.actor.hide();},
    setRecoveryLayout(value) {this.recovery = value;},
    clear() {this.cleared = true;},
};
const dialog = {
    _userSelectionBox: {visible: true},
    _authPrompt: {visible: false},
    _disableUserList: false,
    _userListLoaded: true,
    _userManager: {is_loaded: true},
    _timedLoginUserListHold: false,
};
const ordered = [visuals.actor, dialog];
const container = {
    insert_child_above(actor, sibling) {
        const i = ordered.indexOf(sibling);
        assert.ok(i >= 0);
        assert.ok(!ordered.includes(actor));
        ordered.splice(i + 1, 0, actor);
    },
    set_child_above_sibling(actor, sibling) {
        let i = ordered.indexOf(actor);
        assert.ok(i >= 0);
        ordered.splice(i, 1);
        i = ordered.indexOf(sibling);
        assert.ok(i >= 0);
        ordered.splice(i + 1, 0, actor);
    },
    set_child_below_sibling(actor, sibling) {
        let i = ordered.indexOf(actor);
        assert.ok(i >= 0);
        ordered.splice(i, 1);
        i = ordered.indexOf(sibling);
        assert.ok(i >= 0);
        ordered.splice(i, 0, actor);
    },
};
dialog.get_parent = () => container;

const entries = new Map();
const activated = [];
for (const name of ['test1', 'test2']) {
    const user = {
        get_user_name: () => name, get_real_name: () => name,
        is_system_account: () => false, is_loaded: true, locked: false,
    };
    entries.set(name, {
        user,
        emit(signal) {
            assert.equal(signal, 'activate');
            activated.push(name);
            dialog._userSelectionBox.visible = false;
            dialog._authPrompt.visible = true;
        },
    });
}
dialog._userList = {
    _items: entries,
    numItems: () => entries.size,
    grab_key_focus() {this.focused = true;},
};

const cover = new Cover(container, dialog, visuals);
const chooser = new Chooser(container, dialog, visuals);
assert.equal(cover.isMasked, false);
chooser.sync();
assert.equal(chooser.isVisible, true);
assert.equal(ordered.indexOf(visuals.actor) > ordered.indexOf(dialog),
    true, 'Mellon artwork covers only supported account selection');
assert.equal(chooser._layer.x, 0);
assert.equal(chooser._layer.width, 3440);
assert.equal(chooser._recovery.x, 26);

const buttons = chooser._panel.children.filter(x => x instanceof St.Button);
assert.equal(buttons.length, 2, 'Represent both native accounts');
buttons[0].clicked();
assert.deepEqual(activated, ['test1']);
assert.equal(chooser.isVisible, false);

const password = {grab_key_focus() {this.focused = true;}};
dialog._authPrompt._passwordEntry = password;
dialog._authPrompt._entry = password;
cover.sync();
assert.equal(cover.isMasked, true);
assert.equal(ordered.indexOf(visuals.actor) > ordered.indexOf(dialog),
    true);
assert.equal(cover._recovery.x, 26);
assert.equal(cover._recovery.y, 22);
assert.ok(visuals.primaryRoot.children.includes(cover._feedback),
    'Failed-password alert belongs inside the primary monitor viewport');
cover._recovery.clicked();
assert.equal(cover.isMasked, false);
assert.equal(visuals.actor.visible, false);
assert.equal(password.focused, true, 'Recovery focuses native password');
cover.sync();
assert.equal(visuals.actor.visible, false, 'Native recovery stays latched');

cover.destroy();
chooser.destroy();
console.log('PASS M9 GDM: primary-only chooser, native user selection, password cover, SHOW LOGIN and safe actor order');
