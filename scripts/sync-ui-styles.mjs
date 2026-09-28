import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Run from this checkout beside wareongo-website. Production builds use the
// committed copies, so neither deployment depends on the other's filesystem.
const checking = process.argv.includes('--check');
let drift = false;
for (const name of ['ui.tokens.css', 'ui.css', 'navigation.css', 'WarehouseCard.css']) {
  const sourcePath = name === 'navigation.css' ? 'components/navigation' : name === 'WarehouseCard.css' ? 'components' : 'styles';
  const source = new URL(`../../wareongo-website/src/${sourcePath}/${name}`, import.meta.url);
  const target = new URL(`../styles/${name}`, import.meta.url);
  const css = await readFile(source, 'utf8');
  if (checking) {
    if (css !== await readFile(target, 'utf8')) {
      console.error(`Out of sync: ${fileURLToPath(target)}`);
      drift = true;
    }
  } else {
    await writeFile(target, css);
  }
}
if (drift) process.exitCode = 1;
else console.log(checking ? 'CMS UI styles match the website.' : 'CMS UI styles synced.');
