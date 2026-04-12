import { describe, it, expect } from "vitest";
import { loadConfig } from "../config/config.js";
import { createAgentShieldTools } from "./agent-shield-tools.js";
import { applyToolPolicyPipeline, buildDefaultToolPolicyPipelineSteps } from "./tool-policy-pipeline.js";
import { resolveEffectiveToolPolicy } from "./pi-tools.policy.js";
import { getPluginToolMeta } from "../plugins/tools.js";
import { resolveToolProfilePolicy, mergeAlsoAllowPolicy } from "./tool-policy.js";

describe("Browser tool check", () => {
  it("should list browser tool", () => {
    const cfg = loadConfig();
    const tools = createAgentShieldTools({ config: cfg });
    const hasBrowser = tools.some(t => t.name === "browser");
    console.log("Tools available:", tools.map(t => t.name));
    
    const p = resolveEffectiveToolPolicy({ config: cfg });
    const profilePolicy = resolveToolProfilePolicy(p.profile);
    const steps = buildDefaultToolPolicyPipelineSteps({
      profilePolicy: mergeAlsoAllowPolicy(profilePolicy, p.profileAlsoAllow),
      profile: p.profile,
      globalPolicy: p.globalPolicy,
    });
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filteredTools = applyToolPolicyPipeline({
      tools: tools as any,
      toolMeta: (t) => getPluginToolMeta(t as any) as any,
      warn: console.warn,
      steps
    });
    console.log("Filtered tools:", filteredTools.map(t => t.name));
    
    expect(filteredTools.some(t => t.name === "browser")).toBe(true);
  });
});
