#!/usr/bin/env node
// Line-ending guard.
//
// Usage:
//   node scripts/check-eol.mjs              Check every tracked text file as stored in the Git index.
//   node scripts/check-eol.mjs <file...>    Check the given files on disk (used by tests and fixtures).
//
// Exits 1 if any checked file contains CRLF (or mixed) line endings, 0 otherwise.
// Files that .gitattributes marks as binary (-text) or eol=crlf (e.g. *.bat, *.ps1) are skipped
// in index mode.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** @param {Buffer} buf */
function hasCrlf(buf) {
  return buf.includes('\r\n');
}

/** @param {string[]} files */
function checkFiles(files) {
  return files.filter((file) => hasCrlf(readFileSync(file)));
}

function checkIndex() {
  const out = execFileSync('git', ['ls-files', '--eol', '-z'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  /** @type {string[]} */
  const offenders = [];
  for (const entry of out.split('\0')) {
    if (entry === '') continue;
    // Format: "i/<eol> w/<eol> attr/<attrs>\t<path>"
    const tab = entry.indexOf('\t');
    if (tab === -1) continue;
    const info = entry.slice(0, tab);
    const path = entry.slice(tab + 1);
    const index = /^i\/(\S*)/.exec(info)?.[1] ?? '';
    const attr = /attr\/(.*)$/.exec(info)?.[1] ?? '';
    if (attr.includes('-text') || attr.includes('eol=crlf')) continue;
    if (index === 'crlf' || index === 'mixed') offenders.push(`${path} (i/${index})`);
  }
  return offenders;
}

const args = process.argv.slice(2);
const offenders = args.length > 0 ? checkFiles(args) : checkIndex();

if (offenders.length > 0) {
  console.error(`check-eol: ${String(offenders.length)} file(s) with CRLF line endings:`);
  for (const file of offenders) console.error(`  ${file}`);
  console.error('Fix: git add --renormalize . (or convert the files to LF).');
  process.exit(1);
}
console.log(
  `check-eol: OK (${args.length > 0 ? `${String(args.length)} file(s)` : 'Git index'}, LF only)`,
);
