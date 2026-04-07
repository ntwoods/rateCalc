import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const envBase = (env.VITE_BASE || '').trim();
  const hasCustomEnvBase = Boolean(envBase && envBase !== '/');
  const repository = process.env.GITHUB_REPOSITORY || '';
  const repositoryName = repository.split('/')[1] || '';
  const isUserSiteRepo = repositoryName.toLowerCase().endsWith('.github.io');
  const githubPagesBase =
    process.env.GITHUB_ACTIONS === 'true' && repositoryName && !isUserSiteRepo
      ? `/${repositoryName}/`
      : '/';

  return {
    plugins: [react()],
    base: hasCustomEnvBase ? envBase : githubPagesBase
  };
});
