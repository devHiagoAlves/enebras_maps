const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir);
}

const filesToCopy = ['index.html', 'manifest.json', 'favicon.svg', 'sw.js'];

filesToCopy.forEach(file => {
  const src = path.join(__dirname, file);
  const dest = path.join(distDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied: ${file}`);
  }
});

function minifyJS(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,=+\-*/<>!&|?])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

function minifyCSS(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>+~])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

const jsFiles = ['db.js', 'app.js'];
jsFiles.forEach(file => {
  const src = path.join(__dirname, file);
  const dest = path.join(distDir, file);
  if (fs.existsSync(src)) {
    const code = fs.readFileSync(src, 'utf8');
    fs.writeFileSync(dest, minifyJS(code));
    const original = Buffer.byteLength(code);
    const minified = Buffer.byteLength(minifyJS(code));
    const savings = ((1 - minified / original) * 100).toFixed(1);
    console.log(`Minified: ${file} (${savings}% smaller)`);
  }
});

const cssFiles = ['style.css'];
cssFiles.forEach(file => {
  const src = path.join(__dirname, file);
  const dest = path.join(distDir, file);
  if (fs.existsSync(src)) {
    const code = fs.readFileSync(src, 'utf8');
    fs.writeFileSync(dest, minifyCSS(code));
    const original = Buffer.byteLength(code);
    const minified = Buffer.byteLength(minifyCSS(code));
    const savings = ((1 - minified / original) * 100).toFixed(1);
    console.log(`Minified: ${file} (${savings}% smaller)`);
  }
});

console.log('\nBuild complete! Files in /dist directory');
