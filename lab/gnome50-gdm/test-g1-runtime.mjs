#!/usr/bin/env node
// G1.4 synthetic GNOME 50 greeter lifecycle and compositor integration.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('./greeter-extension/extension.js',import.meta.url),'utf8');
const imports=[
"import Clutter from 'gi://Clutter';",
"import Gio from 'gi://Gio';",
"import GLib from 'gi://GLib';",
"import St from 'gi://St';",
"import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';",
"import * as Main from 'resource:///org/gnome/shell/ui/main.js';",
"import {validateLibrary, pickScene} from './scene-data.js';",
"import {hudMetadata} from './hud-state.js';",
"import {ObservatoryHUD} from './observatory-hud.js';",
"import {GreeterStarfield} from './greeter-starfield.js';",
"import {GreeterLengthObserver} from './greeter-length-observer.js';",
"import {GreeterPasswordCover} from './greeter-password-cover.js';",
"import {GreeterAccountChooser} from './greeter-account-chooser.js';",
];
let stripped=source;
for(const imp of imports){
    assert.ok(stripped.includes(imp),'Missing import: '+imp);
    stripped=stripped.replace(imp,'');
}
stripped=stripped.replace('export default class MellonGreeter','class MellonGreeter');
assert.ok(!/^import\s/m.test(stripped));
const tests=[];
function harness(mode='gdm',dialogReady=true,assetMissing=false, failAt=''){
    let nextId=0,warnings=0,photoDestroyed=0,scenePicks=0;
    const timers=new Map(),layers=[],created=[],syncs=[];
    const GLib={
        PRIORITY_DEFAULT:0,SOURCE_REMOVE:false,SOURCE_CONTINUE:true,
        build_filenamev:items=>items.join('/'),
        file_get_contents:()=>[true,new TextEncoder().encode('{}')],
        timeout_add:(_p,ms,cb)=>{
            assert.ok([250,350].includes(ms),'Only bounded mount and length-sync timers');
            const id=++nextId;timers.set(id,{ms,cb});return id;
        },
        source_remove:id=>timers.delete(id),
    };
    const Gio={File:{new_for_path:path=>({
        query_exists:()=>!(assetMissing&&path.endsWith('star-0.png')),
        get_uri:()=> 'file://'+path,
    })}};
    const Clutter={BindConstraint:class {}, BindCoordinate:{SIZE:1}};
    const St={Widget:class {
        constructor(opts){assert.equal(opts.reactive,false);assert.equal(opts.can_focus,false);}
        add_constraint(){}
        set_style(style){assert.ok(style.includes('background-image'));}
        destroy(){photoDestroyed++;}
    }};
    const group={insert_child_below(actor,sibling){
        assert.equal(sibling,Main.screenShield._dialog,
            'All Mellon actors below currently active native login');
        layers.push(actor?.name??'photo');
    }};
    const dialog={get_parent:()=>group,_authPrompt:{visible:false}};
    const Main={sessionMode:{currentMode:mode},
        screenShield:{_dialog:dialogReady?dialog:null,_lockDialogGroup:group}};
    const library={scenes:[{id:'scene0',image:'assets/bg.jpg',
        sprites:Array.from({length:8},(_,i)=>'assets/star-'+i+'.png'),
        vertices:Array.from({length:8},()=>[.5,.5]),edges:[[0,1]]}]};
    const validateLibrary=()=>library;
    const pickScene=(lib,config)=>{
        assert.equal(lib,library);assert.equal(config.mode,'random-on-lock');
        scenePicks++;
        return library.scenes[0];
    };
    const hudMetadata=()=>({sourceStars:8});
    class ObservatoryHUD{
        constructor(parent){assert.equal(parent,group);if(failAt==='hud')throw Error('HUD unavailable');this.actor={name:'hud'};created.push(this);}
        setMapping(){}
        destroy(){this.destroyed=true;}
    }
    class GreeterStarfield {
        constructor(parent,scene,paths,hud){
            assert.equal(parent,group);assert.equal(paths.length,8);
            assert.ok(scene.vertices.length===8&&hud instanceof ObservatoryHUD);
            if(failAt==='stars')throw Error('Sprite scene unavailable');
            this.actor={name:'stars'};this.lengths=[];created.push(this);
        }
        setLength(length){this.lengths.push(length);}
        clear(){this.cleared=true;}
        destroy(){this.destroyed=true;}
    }
    class GreeterPasswordCover {
        constructor(parent,d,photo,stars,hud){
            assert.equal(parent,group);
            assert.equal(d,Main.screenShield._dialog);
            assert.ok(photo && stars && hud);
            this.isMasked=false;
            created.push(this);
        }
        sync(){}
        onLength(){}
        observeFailure(){}
        revealNative(){this.isMasked=false;}
        destroy(){this.destroyed=true;}
    }
    class GreeterAccountChooser {
        constructor(parent,d,photo,stars,hud){
            assert.equal(parent,group);
            assert.equal(d,Main.screenShield._dialog);
            assert.ok(photo && stars && hud);
            created.push(this);
        }
        sync(){}
        destroy(){this.destroyed=true;}
    }
    class GreeterLengthObserver {
        constructor(fn){this.fn=fn;created.push(this);}
        sync(value,isGdm){
            syncs.push({value,isGdm});
            if(failAt==='observer' ||
                (failAt==='observer-sync-after' && syncs.length>1))
                throw Error('Read-only observer refused');
        }
        destroy(){this.destroyed=true;}
    }
    const ctor=new Function('Clutter','Gio','GLib','St','Extension','Main',
        'validateLibrary','pickScene','hudMetadata','ObservatoryHUD',
        'GreeterStarfield','GreeterLengthObserver','GreeterPasswordCover',
        'GreeterAccountChooser',stripped+'\nreturn MellonGreeter;');
    const Greeter=ctor(Clutter,Gio,GLib,St,class{},Main,
        validateLibrary,pickScene,hudMetadata,ObservatoryHUD,
        GreeterStarfield,GreeterLengthObserver,GreeterPasswordCover,
        GreeterAccountChooser);
    const instance=new Greeter();
    instance.path='/usr/share/gnome-shell/extensions/mellon-greeter@local';
    instance._warn=()=>warnings++;
    const tick=(onlyMs=null)=>{
        for(const [id,{ms,cb}] of [...timers]){
            if(onlyMs!==null&&onlyMs!==ms)continue;
            if(cb()===GLib.SOURCE_REMOVE)timers.delete(id);
        }
    };
    return {instance,Main,dialog,layers,timers,created,syncs,tick,
        makeDialog:()=>({get_parent:()=>group,_authPrompt:{visible:false}}),
        get scenePicks(){return scenePicks;},
        get warnings(){return warnings;},
        get photoDestroyed(){return photoDestroyed;}};
}

{
    const h=harness();
    h.instance.enable();
    assert.deepEqual(h.layers,['photo','stars','hud'],
        'Backdrop, original star sprites, HUD, THEN native GDM dialog');
    assert.equal(h.timers.size,1,'Observe prompt state, no perpetual rendering timer');
    assert.ok([...h.timers.values()].some(t=>t.ms===250));
    assert.equal(h.syncs.length,1);
    assert.equal(h.syncs.at(-1).value,h.dialog);
    h.tick(250);
    assert.equal(h.syncs.length,2);
    const stars=h.created.find(x=>x.actor?.name==='stars');
    h.created.find(x=>typeof x.fn==='function').fn(3);
    assert.deepEqual(stars.lengths,[3]);
    h.instance.disable();
    assert.equal(h.timers.size,0);
    assert.equal(h.created.length,5);
    assert.ok(h.created.every(x=>x.destroyed));
    assert.equal(h.photoDestroyed,1);
}
{
    const h=harness('user');
    h.instance.enable();
    assert.equal(h.layers.length,0);
    assert.equal(h.timers.size,0);
    h.instance.disable();
}
{
    const h=harness('gdm',false);
    h.instance.enable();
    assert.equal(h.timers.size,1,'Wait for GDM dialog while bounded');
    h.Main.screenShield._dialog=h.dialog;
    h.tick(350);
    assert.deepEqual(h.layers,['photo','stars','hud']);
    assert.equal(h.timers.size,1,'Swap retry timer for input-only timer');
    h.instance.disable();
    assert.equal(h.timers.size,0);
}
{
    const h=harness('gdm',false);
    h.instance.enable();
    for(let i=0;i<95;i++)h.tick(350);
    assert.equal(h.timers.size,0,'GDM initialization retry must be bounded');
    h.instance.disable();
}
{
    const h=harness('gdm',true,true);
    h.instance.enable();
    assert.equal(h.layers.length,0,'Missing source sprites fail before rendering');
    assert.equal(h.timers.size,0);
    assert.ok(h.warnings>0);
    h.instance.disable();
}
for(const fail of ['hud','stars','observer']){
    const h=harness('gdm',true,false,fail);
    h.instance.enable();
    assert.equal(h.timers.size,1,'Failed mount must remain bounded');
    assert.ok(h.warnings>0);
    assert.equal(h.photoDestroyed,1,'Failed mount restores native GDM layer');
    h.instance.disable();
    assert.equal(h.timers.size,0);
}
{
    const h=harness();
    h.instance.enable();
    assert.equal(h.scenePicks,1);
    h.Main.screenShield._dialog=null;
    for(let i=0;i<6;i++)h.tick(250);
    assert.equal(h.timers.size,1,
        'Only one bounded recovery timer during missing native dialog');
    assert.equal(h.instance._background,null,
        'Detached LoginDialog must remove old visuals and observer');
    h.Main.screenShield._dialog=h.makeDialog();
    h.tick(250);
    assert.deepEqual(h.layers.slice(-3),['photo','stars','hud']);
    assert.equal(h.scenePicks,1,
        'Preserve selected nebula through native LoginDialog re-creation');
    assert.equal(h.timers.size,1);
    h.instance.disable();
    assert.equal(h.timers.size,0,'No timers survive greeter disable');
}
{
    const h=harness();
    h.instance.enable();
    h.Main.screenShield._dialog=null;
    for(let i=0;i<125;i++)h.tick(250);
    assert.equal(h.timers.size,0,'Rebind must stop after 120 failed ticks');
    assert.ok(h.warnings>0,'One bounded rebind warning');
    assert.equal(h.instance._background,null);
    h.instance.disable();
}
{
    const h=harness('gdm',true,false,'observer-sync-after');
    h.instance.enable();
    h.tick(250);
    assert.equal(h.timers.size,0,'Read-only observer failure stops sync');
    const stars=h.created.find(x=>x.actor?.name==='stars');
    assert.ok(stars.cleared,'Visual input mapping resets on observer failure');
    assert.ok(h.instance._background,'Original GDM photo stays visible');
    assert.equal(h.photoDestroyed,0);
    h.instance.disable();
}
{
    const h=harness();
    for(let cycle=1;cycle<=3;cycle++){
        h.instance.enable();
        assert.equal(h.scenePicks,cycle,
            'Each new greeter session can select its own photo');
        assert.equal(h.layers.length,cycle*3,
            'One photo, starfield and HUD per greeter enable');
        h.tick(250);
        h.instance.disable();
        assert.equal(h.timers.size,0,
            'Repeated session teardown must clear all sources');
        assert.ok(h.created.every(x=>x.destroyed),
            'No stranded observers, HUDs or starfields across logouts');
        assert.equal(h.photoDestroyed,cycle);
    }
}
{
    const h=harness();
    h.instance.enable();
    h.dialog.get_parent=()=>null; // GNOME reparented the native actor.
    h.tick(250);
    assert.equal(h.instance._background,null,
        'Detached LoginDialog must lose all Mellon visual siblings');
    assert.equal(h.timers.size,1);
    h.dialog.get_parent=()=>h.Main.screenShield._lockDialogGroup;
    h.tick(250);
    assert.equal(h.scenePicks,1,
        'Preserve chosen scene on reattachment of same native dialog');
    assert.equal(h.timers.size,1);
    h.Main.sessionMode.currentMode='user';
    h.tick(250);
    assert.equal(h.timers.size,0,
        'GDM visual observer must stop as soon as session mode changes');
    assert.equal(h.instance._background,null);
    h.instance.disable();
}
console.log('PASS G1.6B runtime: native GDM account selection, covered password UI, bounded rebind and visual cleanup');
