import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Esegue i test in sequenza per evitare conflitti sui file temp
    pool: 'forks',
  },
});
