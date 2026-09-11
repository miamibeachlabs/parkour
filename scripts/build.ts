const output = 'dist';

for await (const path of new Bun.Glob(`${output}/*`).scan())
  await Bun.file(path).delete();

const build = await Bun.build({
  entrypoints: ['index.html'],
  outdir: output,
  minify: true,
  target: 'browser',
  external: ['*.webmanifest', '*.svg', '*.png'],
});

if (!build.success)
  throw new AggregateError(build.logs, 'Build failed');

const staticFiles = [
  'manifest.webmanifest',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
];

for (const path of staticFiles)
  await Bun.write(`${output}/${path}`, Bun.file(path));

const fingerprint = new Bun.CryptoHasher('sha256');
const builtFiles = await Array.fromAsync(new Bun.Glob(`${output}/*`).scan());
for (const path of builtFiles.sort()) {
  fingerprint.update(path);
  fingerprint.update(await Bun.file(path).arrayBuffer());
}

const version = fingerprint.digest('hex').slice(0, 12);
const serviceWorker = (await Bun.file('service-worker.js').text())
  .replace('__BUILD__', version);

await Bun.write(`${output}/service-worker.js`, serviceWorker);

console.log(`Built ${build.outputs.length} bundled and ${staticFiles.length + 1} static files (${version}).`);
