#!/usr/bin/env node
// G1.6A: GNOME 50 synthetic UI: real GDM remains fully functional.
// Password mode is covered; account selector/OTP/native recovery are not.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const src=await readFile(new URL('./greeter-extension/greeter-password-cover.js',import.meta.url),'utf8');
const fsrc=await readFile(new URL('./greeter-extension/failure-tracker.js',import.meta.url),'utf8');
const FailureTracker=(await import('data:text/javascript;base64,'+
    Buffer.from(fsrc).toString('base64'))).FailureTracker;
let code=src;
for(const imp of [
    "import Clutter from 'gi://Clutter';",
    "import GLib from 'gi://GLib';",
    "import St from 'gi://St';",
    "import {FailureTracker} from './failure-tracker.js';",
]){
    assert.ok(code.includes(imp));
    code=code.replace(imp,'');
}
code=code.replace('export class GreeterPasswordCover','class GreeterPasswordCover');
assert.ok(!/^import\s/m.test(code));
const executable=code.replace(/\/\*[\s\S]*?\*\//g,'')
    .replace(/^\s*\/\/.*$/gm,'');
for(const forbidden of [
    'get_text(', 'getAnswer(', 'get_password(', 'get_buffer(',
    'key-press-event', 'set_text(', 'dconf update', 'PAM', 'activateUser',
]){
    assert.ok(!executable.includes(forbidden),'Native authentication API forbidden: '+forbidden);
}
let now=1_000_000,timerCounter=0;
const timers=new Map();
const GLib={
    PRIORITY_DEFAULT:0,SOURCE_REMOVE:false,SOURCE_CONTINUE:true,
    get_monotonic_time:()=>now,
    timeout_add:(_p,ms,fn)=>{
        assert.equal(ms,62,'Bounded warning uses same M8 animation cadence');
        const id=++timerCounter;timers.set(id,fn);return id;
    },
    source_remove:id=>timers.delete(id),
};
const Clutter={AlignAxis:{BOTH:0},AlignConstraint:class{}};
class Actor{
    constructor(name){this.name=name;this.visible=true;this.destroyed=false;}
    show(){this.visible=true;}
    hide(){this.visible=false;}
    destroy(){this.destroyed=true;}
}
class Button extends Actor{
    constructor(opts){
        super('SHOW LOGIN');
        assert.equal(opts.label,'SHOW LOGIN');
        assert.equal(opts.reactive,true);assert.equal(opts.can_focus,false);
        assert.equal(opts.style_class,'mellon-m5-recovery');
        this.opts=opts;
    }
    set_position(x,y){this.xy=[x,y];}
    connect(name,fn){assert.equal(name,'clicked');this.clicked=fn;}
}
class Label extends Actor{
    constructor(opts){
        super('UNAUTHORIZED ACCESS');
        assert.equal(opts.text,'UNAUTHORIZED ACCESS');
        assert.equal(opts.reactive,false);
        assert.equal(opts.can_focus,false);
        assert.equal(opts.style_class,'mellon-m5-failure');
        this.opacity=255;
    }
    add_constraint(){}
}
const St={Button,Label};
const Cover=new Function('St','Clutter','GLib','FailureTracker',
    code+'\nreturn GreeterPasswordCover;')(St,Clutter,GLib,FailureTracker);
function setup(){
    const photo=new Actor('photo');
    const stars={actor:new Actor('stars'),clearCount:0,
        clear(){this.clearCount++;}};
    const layout=[];
    const hud={actor:new Actor('hud'),
        setRecoveryLayout:v=>layout.push(v),
        cancelIntro(){this.cancelled=true;}};
    let focus=0;
    const pwd={grab_key_focus:()=>focus++};
    const prompt={visible:false,_entry:pwd,_passwordEntry:pwd,
        _userVerifier:{_failCounter:0}};
    const selection={visible:true};
    let ordered=[];
    const container={
        insert_child_above(actor,sibling){
            assert.ok(!ordered.includes(actor));
            const idx=ordered.indexOf(sibling);assert.ok(idx>=0);
            ordered.splice(idx+1,0,actor);
        },
        set_child_above_sibling(actor,sibling){
            const old=ordered.indexOf(actor);assert.ok(old>=0);
            ordered.splice(old,1);
            const idx=ordered.indexOf(sibling);assert.ok(idx>=0);
            ordered.splice(idx+1,0,actor);
        },
        set_child_below_sibling(actor,sibling){
            const old=ordered.indexOf(actor);assert.ok(old>=0);
            ordered.splice(old,1);
            const idx=ordered.indexOf(sibling);assert.ok(idx>=0);
            ordered.splice(idx,0,actor);
        },
    };
    const dialog={name:'native LoginDialog',_authPrompt:prompt,
        _userSelectionBox:selection,get_parent:()=>container};
    ordered=[photo,stars.actor,hud.actor,dialog];
    const cover=new Cover(container,dialog,photo,stars,hud);
    return {cover,photo,stars,hud,layout,prompt,selection,dialog,
        order:()=>ordered.map(a=>a.name),get focus(){return focus;}};
}
function frame(ms){
    now+=ms*1000;
    for(const [id,fn] of [...timers])
        if(fn()===GLib.SOURCE_REMOVE)timers.delete(id);
}
{
    const h=setup();
    const selectionOrder=['photo','stars','hud','native LoginDialog',
        'SHOW LOGIN','UNAUTHORIZED ACCESS'];
    assert.deepEqual(h.order(),selectionOrder,
        'Construction must not cover native account-selection screen');
    h.cover.sync();
    assert.equal(h.cover.isMasked,false);
    h.selection.visible=false;
    h.prompt.visible=true;
    h.cover.sync();
    assert.equal(h.cover.isMasked,true);
    assert.deepEqual(h.order(),['native LoginDialog','photo','stars','hud',
        'SHOW LOGIN','UNAUTHORIZED ACCESS']);
    assert.equal(h.cover._recovery.visible,true);
    assert.equal(h.cover._feedback.visible,false);
    assert.deepEqual(h.layout,[true]);
    assert.deepEqual(h.cover._recovery.xy,[26,22]);
    assert.equal(h.focus,0,'Do not steal keyboard focus from native field');

    h.cover.observeFailure(); // no failure
    assert.equal(timers.size,0);
    h.prompt._userVerifier._failCounter=1;
    h.cover.observeFailure();
    assert.equal(h.stars.clearCount,1);
    assert.ok(h.hud.cancelled);
    assert.equal(h.cover._feedback.visible,true);
    assert.equal(timers.size,1);
    frame(200);
    assert.equal(h.cover._feedback.visible,true);
    h.cover.onLength(2);
    assert.equal(timers.size,0,'Typing cancels warning timer');
    assert.equal(h.cover._feedback.visible,false);
    h.prompt._userVerifier._failCounter=2;
    h.cover.observeFailure();
    frame(1600);
    assert.equal(timers.size,0,'Warning ends after bounded 1.5 s');
    assert.equal(h.cover._feedback.visible,false);

    h.cover._recovery.clicked();
    assert.equal(h.cover.isMasked,false);
    assert.equal(h.photo.visible,false);
    assert.equal(h.stars.actor.visible,false);
    assert.equal(h.hud.actor.visible,false);
    assert.equal(h.focus,1,'SHOW LOGIN explicitly restores native focus');
    h.cover.sync();
    assert.equal(h.photo.visible,false,'Native recovery must stay latched');
    h.prompt.visible=false;
    h.selection.visible=true;
    h.cover.sync();
    assert.deepEqual(h.order(),selectionOrder);
    assert.equal(h.cover.isMasked,false);
    assert.ok(h.photo.visible&&h.hud.actor.visible);
    h.selection.visible=false;
    h.prompt.visible=true;
    h.cover.sync();
    assert.equal(h.cover.isMasked,true,'New prompt gets M8-style cover');

    h.cover.destroy();
    assert.equal(timers.size,0);
    assert.ok(h.cover._destroyed);
    h.cover.sync();
    h.cover.revealNative();
}
{
    const h=setup();
    h.selection.visible=false;
    h.prompt.visible=true;
    h.prompt._entry={name:'username or OTP'};
    h.cover.sync();
    assert.equal(h.cover.isMasked,false);
    h.prompt._entry=h.prompt._passwordEntry;
    h.cover.sync();
    assert.equal(h.cover.isMasked,true);
    h.prompt._entry={name:'OTP'};
    h.cover.sync();
    assert.equal(h.cover.isMasked,false);
    h.cover.destroy();
}
{
    const h=setup();
    h.selection.visible=false;
    h.prompt.visible=true;
    h.dialog._userSelectionBox=null;
    h.cover.sync();
    assert.equal(h.cover.isMasked,false,
        'Unknown GDM selection structure fails OPEN to native UI');
    h.cover.destroy();
}
{
    const h=setup();
    h.selection.visible=false;
    h.prompt.visible=true;
    h.cover.sync();
    h.prompt._userVerifier._failCounter='unavailable';
    h.cover.observeFailure();
    assert.equal(h.cover.isMasked,false,
        'Unknown failure-counter implementation reveals native UI');
    assert.equal(h.focus,1);
    h.cover.destroy();
}
console.log('PASS G1.6A: cover only native secret prompt, M8 failure warning, SHOW LOGIN, selector/OTP fallback, timer teardown');
