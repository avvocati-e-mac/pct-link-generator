/** @type {import('electron-builder').Configuration} */
const config = {
  appId: 'it.pct.link-generator',
  productName: 'PCT Link Generator',

  directories: {
    output: 'dist',
    buildResources: 'build-resources',
  },

  // File inclusi nel pacchetto finale.
  // node_modules viene gestito automaticamente (solo `dependencies`, non `devDependencies`).
  files: [
    'src/**/*',
    'package.json',
    '!src/**/*.test.js',
    '!**/.DS_Store',
  ],

  // macOS: DMG per ARM (Apple Silicon) e Intel x64.
  // identity: null — disabilita code signing.
  // Senza certificato Apple Developer l'app mostra avviso "sviluppatore non identificato".
  // Accettabile per distribuzione open source.
  // Per aggiungere icone: mettere icon.icns in build-resources/
  mac: {
    category: 'public.app-category.productivity',
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] },
    ],
    identity: null,
  },

  dmg: {
    sign: false,
  },

  // Windows: installer NSIS x64.
  // Per aggiungere icona: mettere icon.ico in build-resources/
  win: {
    target: [
      { target: 'nsis', arch: ['x64'] },
    ],
  },

  nsis: {
    oneClick: true,
    perMachine: false,
  },

  // Linux: AppImage x64.
  // Per aggiungere icona: mettere icon.png (512x512) in build-resources/
  linux: {
    target: [
      { target: 'AppImage', arch: ['x64'] },
    ],
    category: 'Office',
  },
};

export default config;
