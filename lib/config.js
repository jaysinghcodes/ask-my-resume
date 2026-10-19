/**
 * Runtime configuration.
 * ANTHROPIC_API_KEY and MODEL_ID are both required. There is no default model.
 */

/**
 * @param {string} name
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function readEnv(name, env = process.env) {
  const value = env[name];
  if (typeof value !== "string") return "";
  return value.trim();
}

/**
 * True only when both required variables are set to a non empty value.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isConfigured(env = process.env) {
  return Boolean(readEnv("ANTHROPIC_API_KEY", env) && readEnv("MODEL_ID", env));
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function requireModelId(env = process.env) {
  const model = readEnv("MODEL_ID", env);
  if (!model) {
    throw new Error("Missing MODEL_ID");
  }
  return model;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function requireApiKey(env = process.env) {
  const apiKey = readEnv("ANTHROPIC_API_KEY", env);
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY");
  }
  return apiKey;
}
