#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('./greeter-extension/extension.js',import.meta.url),'utf8');
const imports=[
    "import Clutter from 'gi://Clutter';\n",
    "import Gio from 'gi://Gio';\n",
    "import GLib from 'gi://GLib';\n",
    "import St from 'gi://St';\n",
    "import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';\n",
    "import * as Main from 'resource:///org/gnome/shell/ui/main.js';\n",
    "\nimport {validateLibrary, pickScene} from './scene-data.js';\n",
];
let code=source;
for(const imp of imports){
    assert.ok(code.includes(imp),'Unexpected GNOME import change: '+imp);
    code=code.replace(imp,'');
}
code=code.replace('export default class MellonGreeter','class MellonGreeter');
assert.ok(!/^import /m.test(code));

function harness(mode='gdm', ready=true, imagesExist=true){
    let timerID=0, warnings=0, added=0, destroyed=0, above=false;
    const timers=new Map();
    const GLib={
        PRIORITY_DEFAULT:0,
        SOURCE_REMOVE:false,
        SOURCE_CONTINUE:true,
        build_filenamev:a=>a.join('/'),
        file_get_contents:()=>[true,new TextEncoder().encode('{"scenes":[]}')],
        timeout_add:(_p,ms,callback)=>{
            assert.equal(ms,350);
            const id=++timerID;
            timers.set(id,callback);return id;
        },
        source_remove:id=>timers.delete(id),
    };
    const Gio={File:{new_for_path:path=>({
        query_exists:()=>imagesExist,
        get_uri:()=> 'file://'+path,
    })}};
    const Clutter={BindConstraint:class{},BindCoordinate:{SIZE:1}};
    const St={Widget:class{
        constructor(props){ assert.equal(props.reactive,false);assert.equal(props.can_focus,false); }
        add_constraint(){}
        set_style(style){ assert.ok(style.includes('background-image')); }
        destroy(){destroyed++;}
    }};
    const group={insert_child_below:function(photo,sibling){
        assert.equal(sibling,dialog,'Must layer photo BELOW actual native dialog');
        added++;
    }};
    const dialog={get_parent:()=>group};
    const Main={sessionMode:{currentMode:mode},
        screenShield:{_lockDialogGroup:group,_dialog:ready?dialog:null}};
    const lib={scenes:Array.from({length:12},(_,i)=>({
        image:'assets/image'+i+'.jpg',id:'scene'+i,
    }))};
    const validateLibrary=()=>lib;
    const pickScene=(library,config)=>{
        assert.equal(library,lib);
        assert.equal(config.mode,'random-on-lock');
        return lib.scenes[0];
    };
    const Extension=class{};
    const ctor=new Function('Clutter','Gio','GLib','St','Extension',
        'Main','validateLibrary','pickScene',
        code+'\nreturn MellonGreeter;');
    const Klass=ctor(Clutter,Gio,GLib,St,Extension,Main,
        validateLibrary,pickScene);
    const instance=new Klass();
    instance.path='/usr/share/gnome-shell/extensions/mellon-greeter@local';

    instance._warn = () => {warnings++;};
    const tick=()=>{
        for (const [id,callback] of [...timers]) {
            if (callback()===GLib.SOURCE_REMOVE) timers.delete(id);
        }
    };
    return {
        instance,Main,tick,
        get size(){return timers.size;},
        get added(){return added;},
        get destroyed(){return destroyed;},
        get warnings(){return warnings;},
    };
}

{
    const h=harness();
    h.instance.enable();
    assert.equal(h.added,1,'Must mount behind native GDM login exactly once');
    assert.equal(h.size,0,'No timer when background already exists');
    h.instance.disable();
    assert.equal(h.destroyed,1);
    assert.equal(h.size,0);
}
{
    const h=harness('user');
    h.instance.enable();
    assert.equal(h.added,0,'Must do nothing outside GDM mode');
    h.instance.disable();
}
{
    const h=harness('gdm',false);
    h.instance.enable();
    assert.equal(h.added,0);
    assert.equal(h.size,1);
    h.Main.screenShield._dialog={get_parent:()=>h.Main.screenShield._lockDialogGroup};
    h.tick();
    assert.ok(h.instance._background);
    assert.equal(h.size,0);
    h.instance.disable();
    assert.equal(h.destroyed,1);
}
{
    const h=harness('gdm',false);
    h.instance.enable();
    for(let i=0;i<95;i++)h.tick();
    assert.equal(h.size,0,'Retry must not poll forever');
    assert.equal(h.added,0);
    h.instance.disable();
}
{
    const h=harness('gdm',true,false);
    h.instance.enable();
    assert.equal(h.added,0,'Missing pack must not obscure GDM');
    assert.equal(h.size,0);
    assert.ok(h.warnings>0);
    h.instance.disable();
}
console.log('PASS G1.2.1 runtime: native GDM dialog sibling layering, bounded retry, fail-open and teardown');
