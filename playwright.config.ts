import { defineConfig, devices } from '@playwright/test';
import { execSync } from 'node:child_process';

const PORT = 4173;

/** Les tests utilisent la vraie base locale : aucune réponse du serveur n'est simulée. */
function readSupabaseEnv() {
  if (process.env.E2E_SUPABASE_URL) return;
  let output: string;
  try {
    output = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: 'pipe' });
  } catch {
    throw new Error('Supabase local est arrêté. Lancez Docker puis : npx supabase start');
  }
  const read = (name: string) => {
    const value = new RegExp(`^${name}="?([^"\\n]+)"?$`, 'm').exec(output)?.[1];
    if (!value) throw new Error(`Valeur absente de « supabase status » : ${name}`);
    return value;
  };
  process.env.E2E_SUPABASE_URL = read('API_URL');
  process.env.E2E_ANON_KEY = read('ANON_KEY');
  process.env.E2E_SERVICE_KEY = read('SERVICE_ROLE_KEY');
  process.env.E2E_MAILPIT_URL = read('MAILPIT_URL');
}

readSupabaseEnv();

// Les tests s'exécutent sur le build de production, comme sur Netlify.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: process.env.E2E_SUPABASE_URL as string,
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.E2E_ANON_KEY as string,
    },
  },
});
