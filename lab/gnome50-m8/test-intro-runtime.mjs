#!/usr/bin/env node
// M9.2: only bounded scheduling remains; frames use Clutter easing.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const raw = await readFile(new URL('./observatory-intro.js', import.meta.url), 'utf8');
const source = raw.replace(/^import [\s\S]*?;\n/gm, '')
    .replace('export class ObservatoryIntro', 'class ObservatoryIntro');
assert.ok(!/^import /m.test(source), 'Unexpected import form');

let now = 0;
let nextId = 1;
const tasks = new Map();
const repaints = [];
const schedule = (delay, interval, callback) => {
    const id = nextId++;
    tasks.set(id, {due: now + delay, interval, callback});
    return id;
};
const GLib = {
    PRIORITY_DEFAULT: 0,
    PRIORITY_DEFAULT_IDLE: 100,
    SOURCE_REMOVE: false,
    SOURCE_CONTINUE: true,
    timeout_add: (_priority, delay, fn) => schedule(delay, delay, fn),
    idle_add: (_priority, fn) => schedule(0, 0, fn),
    source_remove: id => tasks.delete(id),
};
class Actor {
    constructor(options = {}) {
        this.options = options;
        this.visible = true;
        this.opacity = 255;
    }
    add_constraint() {}
    add_child() {}
    set_style() {}
    set_size(w,h) { this.width=w; this.height=h; }
    set_position(x,y) { this.x=x; this.y=y; }
    show() { this.visible=true; }
    hide() { this.visible=false; }
    remove_all_transitions() { this.animation=null; }
    ease(options) { this.animation=options; }
    destroy() { this.destroyed=true; }
}
class DrawingArea extends Actor {
    connect(signal, handler) {
        assert.equal(signal,'repaint');
        this.repaint=handler;
    }
    queue_repaint() { repaints.push(now); }
}
class Widget extends Actor {}
const St = {Widget, DrawingArea};
const Clutter = {
    BindConstraint: class {},
    BindCoordinate: {SIZE: 1},
    FixedLayout: class {},
    AnimationMode: {LINEAR: 1, EASE_OUT_CUBIC: 2},
};
const introDuration = 1850, repeatMs = 5000, beamWidth = 240;
const Factory = new Function('Clutter','GLib','St',
    'INTRO_DURATION_MS','INTRO_REPEAT_MS','gridGeometry',
    source + '\nreturn ObservatoryIntro;');
const Intro = Factory(Clutter, GLib, St, introDuration, repeatMs,
    () => ({}));
const panels=Object.fromEntries(
    ['topLeft','topRight','bottomLeft','bottomRight'].map(key =>
        [key, new Widget()]));
const root = {
    set_clip_to_allocation(value) {
        assert.equal(value,true);
        this.clipped=value;
    },
    insert_child_below(actor, sibling) {
        assert.ok(actor instanceof DrawingArea);
        assert.equal(sibling,panels.topLeft);
    },
    insert_child_above(actor, sibling) {
        assert.ok(actor instanceof Widget);
        assert.ok(sibling instanceof DrawingArea);
    },
};
const intro = new Intro(root, panels);
function advance(target) {
    assert.ok(target >= now);
    let limit=0;
    while (true) {
        const found=[...tasks.entries()].sort((a,b)=>
            a[1].due-b[1].due || a[0]-b[0])[0];
        if (!found || found[1].due > target)
            break;
        assert.ok(++limit < 100,'Unexpected fast timer loop');
        const [id,task]=found;
        now=task.due;
        const repeat=task.callback() === GLib.SOURCE_CONTINUE;
        if (tasks.get(id) !== task)
            continue;
        if (repeat && task.interval > 0)
            task.due += task.interval;
        else
            tasks.delete(id);
    }
    now=target;
}
intro.onLayout({},3440,1440);
advance(0);
assert.equal(intro._scanner.animation.x, 3440);
assert.equal(intro._scanner.animation.duration, 1850);
assert.equal(intro._scanner.animation.mode, Clutter.AnimationMode.LINEAR);
assert.equal(intro._scanner.x, -beamWidth);
assert.equal(intro._scanner.visible, true);
assert.ok(repaints.length <= 1,'Grid must not repaint every frame');
assert.ok([...tasks.values()].every(task =>
    task.interval === 0 || task.interval >= 1850),
    'No 16ms/25ms/50ms GLib render timer allowed');
advance(1950);
assert.equal(intro._scanner.visible, false);
assert.equal(intro._grid.visible, false);
assert.ok([...tasks.values()].every(task => task.interval >= 5000));
advance(5000);
assert.equal(intro._scanner.visible, true);
assert.equal(intro._scanner.animation.x, 3440);
intro.onLayout({},1920,1080);
advance(5000);
assert.equal(intro._scanner.animation.x, 1920);
assert.equal(intro._edge.x, beamWidth - 3);
intro.stop();
assert.equal(tasks.size,0);
intro.destroy();
assert.equal(intro._scanner,null);
console.log('PASS M9.2: native compositor motion covers each viewport, no JS frame loop, 5s repeat, resize and cleanup');
