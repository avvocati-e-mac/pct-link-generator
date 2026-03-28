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
  mac: {
    category: 'public.app-category.productivity',
    icon: 'build-resources/icon.icns',
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] },
    ],
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
    releaseNotes: [
      '---',
      '',
      '## Installazione su macOS',
      '',
      "L'app non è notarizzata. Prima di avviarla, esegui nel Terminale:",
      '',
      '```bash',
      'sudo xattr -cr /Applications/PCT\\ Link\\ Generator.app',
      '```',
      '',
      "Questo comando rimuove l'attributo di quarantena imposto da macOS sui file scaricati da internet.",
      '',
      '> Sostituisci il percorso se hai installato l\'app in una cartella diversa da `/Applications`.',
    ].join('\n'),
  },
};

module.exports = config;
