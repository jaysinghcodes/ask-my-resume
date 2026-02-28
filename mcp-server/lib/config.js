/**
 * Server configuration.
 */

export const PORT = Number(process.env.PORT) || 3001;

export function getEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}
