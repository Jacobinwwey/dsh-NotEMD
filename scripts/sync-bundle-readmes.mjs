import { copyFile, mkdir } from 'node:fs/promises';
import { URL } from 'node:url';

// The root manuals are authoritative; packaging must not depend on manual copies.
const root = new URL('../', import.meta.url);
const bundle = new URL('packages/notemd-bundle/', root);
await mkdir(new URL('docs/', bundle), { recursive: true });
await copyFile(new URL('README.md', root), new URL('README.md', bundle));
await copyFile(new URL('README.zh-CN.md', root), new URL('docs/README.zh-CN.md', bundle));
