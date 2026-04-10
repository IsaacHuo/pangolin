<template>
  <div class="schematic-page">
    <div class="page-header">
      <h2>架构体系与安全策略分布图 (Schematic Overview)</h2>
      <p class="subtitle">全程可视化项目的核心链路、双层管控引擎与全景防御图谱</p>
    </div>

    <div class="diagrams-grid">
      <!-- Diagram 1: Overall Architecture -->
      <div class="diagram-card">
        <h3>1. 零信任端到端网关架构模型 (System Architecture)</h3>
        <p class="desc">在 AI Agent 和 工具服务底层之间进行强制接管和 MITM 全局流量检查。</p>
        <div class="mermaid-container" ref="archDiagram"></div>
      </div>

      <!-- Diagram 2: Dual Layer Engine -->
      <div class="diagram-card">
        <h3>2. 漏斗式深层审查双引擎分析流 (Dual-Layer Core Pipeline)</h3>
        <p class="desc">运用高低配置算力分配原则，融合超快速静态文本模式匹配 (L1) 与基于 LLM Context 识别 (L2) 相结合的安全判断网关。</p>
        <div class="mermaid-container" ref="engineDiagram"></div>
      </div>

      <!-- Diagram 3: Strategic Vision -->
      <div class="diagram-card">
        <h3>3. 全局防御策略与能力雷达拓扑 (Strategic Mindmap)</h3>
        <p class="desc">宏观拆解组件模块：全自动监控、红蓝攻防对抗（OmniSafeBench-MM集成），和无死角审计的构建框架。</p>
        <div class="mermaid-container" ref="strategyDiagram"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import mermaid from 'mermaid'
import svgPanZoom from 'svg-pan-zoom'

const archDiagram = ref<HTMLElement | null>(null)
const engineDiagram = ref<HTMLElement | null>(null)
const strategyDiagram = ref<HTMLElement | null>(null)

const archCode = `
graph LR
    subgraph Client ["External Request Origin"]
        A("AI Agents<br/>Claude/GPT-4 / User Client")
    end
    
    A <-->|"MCP Protocol / JSON-RPC Session Stream"| B("🛡️ Pangolin<br/>Zero-Trust Web/Local Security Gateway")
    B <-->|"Filtered Valid Traffic"| C("Tool Servers<br/>OpenClaw Gateway / Local Exec")
    
    subgraph Core ["Firewall Core Control Matrix"]
        direction TB
        B1("Session Manager & SSE Layer") --> B2("Interceptor Engine Data Plane")
        B2 --> B3("Policy Core Enforcement & Evaluator")
        B3 --> B4("Asynchronous JSONL Audit Data Lake")
    end
    
    B -.->|"Contains components"| Core
    
    classDef firewall fill:#e0e7ff,stroke:#4f46e5,stroke-width:2px,color:#1e293b,rx:8,ry:8;
    class B,Core,B1,B2,B3,B4 firewall;
`

const engineCode = `
stateDiagram-v2
    [*] --> Ingress
    Ingress: Unpack Original Request / Event Stream (MCP JSON-RPC Payload)
    Ingress --> L1
    
    state "L1: High-Speed Static Analyzer" as L1 {
        direction LR
        AhoCorasick: 1. Aho-Corasick Multi-Pattern Tree
        Regex: 2. Regular Expression Guardrails
        AhoCorasick --> Regex
    }
    
    L1 --> Blocked: Verification = REJECT / DENY
    L1 --> L2: Verification = PASS 
    
    state "L2: Deep Semantic Analyzer" as L2 {
        direction LR
        Prompt: 1. Assemble Attack Surface & System Context Prompt
        LLM: 2. Specialized Safety LLM Validator
        Output_step: 3. Infer Malicious Intent & Prompt Injection
        Prompt --> LLM
        LLM --> Output_step
    }
    
    L2 --> Blocked: Verification = REJECT / DENY
    L2 --> Allowed: Verification = PASS
    
    Blocked --> [*]
    Allowed --> Forward
    Forward: Send to Tool Server / Model Core (Unrestricted Execution)
`

const strategyCode = `
mindmap
  root((Pangolin 核心))
    Security Perimeter
      Zero-Trust Validation Standard
      Man-In-The-Middle Transparent Interception
      Granular Scope Control and Adaptive Limiter
    Twin-Turbo Analysis Base
      L1 Deterministic Static Matcher
      L2 Generative Semantic Profiler
      Live Configurable Rules Execution
    Omni-Observability Matrix
      Vue-backed Reactive Admin Dashboard
      Full-Duplex WS Event Broadcast
      Immutable JSONL Audit Logging Engine
    Evaluation and Adversarial Range
      Multi-modal Vector Injection Scenarios
      3D Assessment Grading
      Red-blue Tactical Iteration Protocol
`

onMounted(async () => {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    themeVariables: {
      primaryColor: '#ffffff',
      primaryTextColor: '#1e293b',
      primaryBorderColor: '#cbd5e1',
      lineColor: '#64748b',
      secondaryColor: '#f1f5f9',
      tertiaryColor: '#e2e8f0',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    },
    securityLevel: 'loose'
  })
  
  await nextTick()
  
  const renderAndZoom = async (id: string, code: string, container: HTMLElement | null) => {
    if (!container) return
    try {
      const { svg } = await mermaid.render(id, code)
      container.innerHTML = svg
      
      const svgEl = container.querySelector('svg')
      if (svgEl) {
        // override fixed sizing to allow zoom/pan fluidly
        svgEl.style.width = '100%'
        svgEl.style.height = '100%'
        svgEl.style.maxWidth = 'none'
        
        svgPanZoom(svgEl, {
          zoomEnabled: true,
          controlIconsEnabled: true,
          fit: true,
          center: true,
          minZoom: 0.5,
          maxZoom: 10
        })
      }
    } catch(e) {
      console.error(`Mermaid render error for ${id}:`, e)
    }
  }

  await renderAndZoom('gArch', archCode, archDiagram.value)
  await renderAndZoom('gEngine', engineCode, engineDiagram.value)
  await renderAndZoom('gStrategy', strategyCode, strategyDiagram.value)
})
</script>

<style scoped>
.schematic-page {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
  color: #334155;
}

.page-header {
  margin-bottom: 32px;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 16px;
}

.page-header h2 {
  font-size: 26px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: #0f172a;
  letter-spacing: 0.5px;
}

.subtitle {
  color: #64748b;
  font-size: 15px;
  margin: 0;
}

.diagrams-grid {
  display: flex;
  flex-direction: column;
  gap: 40px;
  padding-bottom: 60px;
}

.diagram-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05);
  transition: transform 0.2s, box-shadow 0.2s;
}

.diagram-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
}

.diagram-card h3 {
  margin: 0 0 10px 0;
  font-size: 18px;
  color: #4338ca;
  font-weight: 600;
}

.diagram-card .desc {
  font-size: 14px;
  color: #64748b;
  margin-bottom: 24px;
}

.mermaid-container {
  display: block;
  overflow: hidden;
  background: #f8fafc;
  border-radius: 8px;
  box-sizing: border-box;
  min-height: 400px;
  height: 50vh;
  border: 1px dashed #cbd5e1;
  position: relative;
}

/* Tool control icons positioning over the svg container override */
:deep(.svg-pan-zoom-control) {
  fill: #1e293b;
}

:deep(.svg-pan-zoom-control:hover) {
  fill: #4338ca;
}
</style>
