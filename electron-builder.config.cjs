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

  // macOS: DMG (installazione manuale) + ZIP (electron-updater in-place).
  // Le arch NON sono specificate qui: vengono passate dalla CI via flag
  // --arm64 / --x64, così ogni job costruisce solo la propria arch.
  // identity: null — disabilita code signing.
  mac: {
    category: 'public.app-category.productivity',
    icon: 'build-resources/icon.icns',
    target: ['dmg', 'zip'],
    identity: null,
  },

  dmg: {
    sign: false,
  },

  // Windows: installer NSIS x64.
  win: {
    icon: 'build-resources/icon.ico',
    target: [
      { target: 'nsis', arch: ['x64'] },
    ],
  },

  nsis: {
    oneClick: true,
    perMachine: false,
  },

  // Linux: AppImage x64.
  linux: {
    icon: 'build-resources/icon.png',
    target: [
      { target: 'AppImage', arch: ['x64'] },
    ],
    category: 'Office',
  },

  // Pubblicazione su GitHub Releases (usata da electron-updater per il controllo aggiornamenti).
  // Il token GITHUB_TOKEN viene iniettato dalla CI; in locale --publish never evita upload accidentali.
  publish: {
    provider: 'github',
    owner: 'avvocati-e-mac',
    repo: 'pct-link-generator',
  },
};

module.exports = config;
