#!/usr/bin/env node
// Pure Node regression tests. Does not load GNOME, PAM or any credential data.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./failure-tracker.js', import.meta.url), 'utf8');
// GJS extensions treat .js as ESM. A data URL keeps this test independent
// from Node's package.json "type" setting without changing runtime code.
const {FailureTracker} = await import(
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

const t = new FailureTracker();
const verifier = {_failCounter: 0};
const failures = () => t.observe(verifier).failures;

assert.equal(failures(), 0, 'fresh prompt');
verifier._failCounter = 1;
assert.equal(failures(), 1, 'first wrong password');
assert.equal(failures(), 0, 'no double-count on next poll');
verifier._failCounter = 2;
assert.equal(failures(), 1, 'second wrong password');
assert.equal(failures(), 0, 'stable counter');
verifier._failCounter = 0;
assert.equal(failures(), 0, 'internal GNOME reset is not another failure');
verifier._failCounter = 1;
assert.equal(failures(), 1, 'count after reset');

assert.equal(t.observe(null).failures, 0, 'temporary missing prompt');
const newVerifier = {_failCounter: 0};
assert.equal(t.observe(newVerifier).failures, 0, 'prompt replacement');
newVerifier._failCounter = 1;
assert.equal(t.observe(newVerifier).failures, 1, 'new prompt first failure');
assert.deepEqual(t.observe({_failCounter: null}), {
    supported: false, failures: 0,
}, 'unknown GNOME API triggers native UI fail-open');

t.reset();
assert.equal(t.observe({_failCounter: 0}).failures, 0, 'new lock cycle');

console.log('PASS: M5.2 per-attempt failure tracking regressions');
