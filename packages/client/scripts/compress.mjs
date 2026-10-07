import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { brotliCompressSync, gzipSync, constants } from 'zlib';

const dist = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const COMPRESSIBLE = /\.(js|css|svg|json|webmanifest|txt|xml)$/;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) {
      walk(file);
      continue;
    }
    if (!COMPRESSIBLE.test(name)) continue;
    const data = readFileSync(file);
    if (data.length < 512) continue;
    writeFileSync(`${file}.br`, brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }));
    writeFileSync(`${file}.gz`, gzipSync(data, { level: 9 }));
  }
}

walk(dist);
