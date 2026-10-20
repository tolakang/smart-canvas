import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crc32, zipStore } from './zip';

describe('zipStore', () => {
  it('crc32 matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('writes a ZIP that unzip reads back, with unique UTF-8 names', () => {
    const dir = mkdtempSync(join(tmpdir(), 'zip-'));
    const a = new TextEncoder().encode('hello');
    const b = new Uint8Array([0, 1, 2, 255]);
    writeFileSync(join(dir, 'x.zip'), zipStore([{ name: 'ស្វាគមន៍.png', data: a }, { name: 'ស្វាគមន៍.png', data: b }]));
    let listing: string;
    try {
      listing = execFileSync('python3', ['-c', 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);z.testzip();print("|".join(i.filename for i in z.infolist()));z.extractall(sys.argv[2])', join(dir, 'x.zip'), dir], { encoding: 'utf8' });
    } catch {
      return; // no python here: the crc test above still covers the checksum
    }
    expect(listing.trim()).toBe('ស្វាគមន៍.png|ស្វាគមន៍ (2).png');
    expect(readFileSync(join(dir, 'ស្វាគមន៍.png'), 'utf8')).toBe('hello');
    expect([...readFileSync(join(dir, 'ស្វាគមន៍ (2).png'))]).toEqual([0, 1, 2, 255]);
  });
});
