// Server-side config. Names and types are declared in astro.config.mjs (env.schema).
import { getSecret } from 'astro:env/server';

export const env = (name) => getSecret(name) || undefined;
