#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const code=await readFile(
  new URL('./greeter-extension/greeter-length-observer.js',import.meta.url),
  'utf8');
const executable=code.replace(/\/\*[\s\S]*?\*\//g,'')
    .replace(/^\s*\/\/.*$/gm,'');
for(const forbidden of [
    'get_text(', '.text', 'getAnswer(', 'key-press-event',
    'text-changed', '_userVerifier', 'password-changed', 'log(',
    'console.', 'get_password(',
]){
    // Inspect executable code, not explanatory comments.
    assert.ok(!executable.includes(forbidden),
        'Forbidden greeter data access: '+forbidden);
}
const {GreeterLengthObserver}=await import(
    'data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
class FakeBuffer {
    constructor(){this.length=0;this.handlers=new Map();this.seq=0;}
    get_length(){return this.length;}
    connect(signal,fn){
        assert.equal(signal,'notify::length');
        const id=++this.seq;this.handlers.set(id,fn);return id;
    }
    disconnect(id){this.handlers.delete(id);}
    change(length){this.length=length;for(const fn of this.handlers.values())fn();}
}
const seen=[];
const observer=new GreeterLengthObserver(n=>seen.push(n));
const buffer=new FakeBuffer();
const passwordEntry={clutter_text:{get_buffer:()=>buffer}};
const usernameEntry={clutter_text:{get_buffer:()=>{
    throw Error('Must not inspect username/OTP buffers');
}}};
const prompt={
    visible:false,_passwordEntry:passwordEntry,_entry:usernameEntry,
};
const dialog={_authPrompt:prompt};

observer.sync(dialog,true);
assert.deepEqual(seen,[]);
prompt.visible=true;
observer.sync(dialog,true); // username: do not inspect / count
assert.deepEqual(seen,[]);
prompt._entry=passwordEntry;
observer.sync(dialog,true);
assert.deepEqual(seen,[0]);
assert.equal(buffer.handlers.size,1);
buffer.change(1);
buffer.change(2);
buffer.change(2); // no repeated callback
buffer.change(1); // backspace
assert.deepEqual(seen,[0,1,2,1]);
buffer.change(-1); // invalid, ignored
buffer.change(99999); // invalid, ignored
assert.deepEqual(seen,[0,1,2,1]);
prompt._entry=usernameEntry;
observer.sync(dialog,true);
assert.deepEqual(seen,[0,1,2,1,0]);
assert.equal(buffer.handlers.size,0);
buffer.change(8);
assert.deepEqual(seen,[0,1,2,1,0]);
prompt._entry=passwordEntry;
observer.sync(dialog,true);
assert.deepEqual(seen,[0,1,2,1,0,8]);
observer.sync(dialog,false); // outside GDM mode: clear and disconnect
assert.deepEqual(seen,[0,1,2,1,0,8,0]);
assert.equal(buffer.handlers.size,0);
observer.sync(dialog,true);
prompt.visible=false; // user-selection screen
observer.sync(dialog,true);
assert.deepEqual(seen.slice(-2),[8,0]);
observer.destroy();
assert.equal(buffer.handlers.size,0);
assert.doesNotThrow(()=>observer.destroy());
assert.doesNotThrow(()=>observer.sync(dialog,true));
buffer.change(2);
assert.deepEqual(seen.slice(-1),[0]);
console.log('PASS G1.4: password LENGTH only, username ignored, random-safe reset, no auth interception, teardown');
