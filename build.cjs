const fs = require('fs');
const path = require('path');

async function run() {
  const dist = path.join(__dirname, 'dist');
  try {
    await fs.promises.rm(dist, { recursive: true, force: true });
  } catch (e) {}
  await fs.promises.mkdir(dist, { recursive: true });

  // Copy index.html
  await fs.promises.copyFile(path.join(__dirname, 'index.html'), path.join(dist, 'index.html'));

  // Copy src directory
  const src = path.join(__dirname, 'src');
  async function copyDir(srcDir, destDir) {
    await fs.promises.mkdir(destDir, { recursive: true });
    const entries = await fs.promises.readdir(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);
      if (entry.isDirectory()) {
        await copyDir(srcPath, destPath);
      } else if (entry.isFile()) {
        await fs.promises.copyFile(srcPath, destPath);
      }
    }
  }
  await copyDir(src, path.join(dist, 'src'));

  // Copy README
  try {
    await fs.promises.copyFile(path.join(__dirname, 'README.md'), path.join(dist, 'README.md'));
  } catch (e) {}

  console.log('Copied static files to dist/');
}

run().catch(err => { console.error(err); process.exit(1); });
