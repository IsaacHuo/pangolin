export function collectConfigEnvVars(cfg) {
    const envConfig = cfg?.env;
    if (!envConfig) {
        return {};
    }
    const entries = {};
    if (envConfig.vars) {
        for (const [key, value] of Object.entries(envConfig.vars)) {
            if (!value) {
                continue;
            }
            entries[key] = value;
        }
    }
    for (const [key, value] of Object.entries(envConfig)) {
        if (key === "shellEnv" || key === "vars") {
            continue;
        }
        if (typeof value !== "string" || !value.trim()) {
            continue;
        }
        entries[key] = value;
    }
    return entries;
}
export function applyConfigEnvVars(cfg, env = process.env) {
    const entries = collectConfigEnvVars(cfg);
    for (const [key, value] of Object.entries(entries)) {
        if (env[key]?.trim()) {
            continue;
        }
        env[key] = value;
    }
}
