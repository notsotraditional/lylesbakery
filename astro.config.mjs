import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel';

const secret = (optional = true) => envField.string({ context: 'server', access: 'secret', optional });

// Pages are prerendered; the endpoints in src/pages/api run on demand (Vercel functions).
// Every server-side variable is declared here, so the build knows exactly what the app reads.
export default defineConfig({
  output: 'static',
  adapter: vercel(),
  env: {
    schema: {
      ADMIN_TOKEN: secret(),
      OWNER_EMAIL: secret(),
      SITE_URL: secret(),
      FROM_EMAIL: secret(),
      RESEND_API_KEY: secret(),
      YOCO_SECRET_KEY: secret(),
      YOCO_WEBHOOK_SECRET: secret(),
      YOCO_API_BASE: secret(),
      KV_REST_API_URL: secret(),
      KV_REST_API_TOKEN: secret(),
      DB_KV_REST_API_URL: secret(),
      DB_KV_REST_API_TOKEN: secret(),
      UPSTASH_REDIS_REST_URL: secret(),
      UPSTASH_REDIS_REST_TOKEN: secret(),
    },
  },
});
