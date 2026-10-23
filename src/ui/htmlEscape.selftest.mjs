// escapeHtml: peer- and host-chosen strings (player names, shell_hit fields) render as text in innerHTML templates
import assert from 'node:assert/strict';
import { escapeHtml } from './dom.ts';

assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
assert.equal(escapeHtml(`"'&`), '&quot;&#39;&amp;');
assert.equal(escapeHtml('T-90AM'), 'T-90AM');
assert.equal(escapeHtml(undefined), '');
assert.equal(escapeHtml(42), '42');
console.log('htmlEscape.selftest: ok');
