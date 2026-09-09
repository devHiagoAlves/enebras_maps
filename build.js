const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir);
}

const filesToCopy = [
  'index.html',
  'manifest.json',
  'favicon.svg',
  'sw.js',
  'routes.js',
  'exemplo-clientes.csv',
  'brasil-estados.geojson'
];

filesToCopy.forEach(file => {
  const src = path.join(__dirname, file);
  const dest = path.join(distDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied: ${file}`);
  } else {
    console.log(`Missing (skipped): ${file}`);
  }
});

// Minificação conservadora: remove SÓ comentários de bloco e linhas
// inteiras de comentário. Nunca toca no meio da linha — regex agressiva
// quebra URLs (https://) e conteúdo dentro de strings/template literals.
function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(line => !/^\s*\/\//.test(line))
    .join('\n')
    .trim() + '\n';
}

const jsFiles = ['db.js', 'app.js'];
jsFiles.forEach(file => {
  const src = path.join(__dirname, file);
  const dest = path.join(distDir, file);
  if (fs.existsSync(src)) {
    const code = fs.readFileSync(src, 'utf8');
    const stripped = stripComments(code);
    fs.writeFileSync(dest, stripped);
    const original = Buffer.byteLength(code);
    const result = Buffer.byteLength(stripped);
    const savings = ((1 - result / original) * 100).toFixed(1);
    console.log(`Stripped: ${file} (${savings}% smaller)`);
  }
});

const cssFiles = ['style.css'];
cssFiles.forEach(file => {
  const src = path.join(__dirname, file);
  const dest = path.join(distDir, file);
  if (fs.existsSync(src)) {
    const code = fs.readFileSync(src, 'utf8');
    const stripped = code.replace(/\/\*[\s\S]*?\*\//g, '').trim() + '\n';
    fs.writeFileSync(dest, stripped);
    const original = Buffer.byteLength(code);
    const result = Buffer.byteLength(stripped);
    const savings = ((1 - result / original) * 100).toFixed(1);
    console.log(`Stripped: ${file} (${savings}% smaller)`);
  }
});

console.log('\nBuild complete! Files in /dist directory');
