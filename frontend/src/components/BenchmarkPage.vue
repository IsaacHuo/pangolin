<template>
  <div class="benchmark-page">
    <header class="page-header">
      <div class="header-main">
        <h2>OmniSafeBench Evaluation</h2>
        <p class="subtitle">Unified Multimodal Jailbreak Attack & Defense Benchmark</p>
      </div>
      <div class="header-actions">
        <button class="btn-primary" :disabled="isRunning" @click="runBenchmark">
          <span v-if="!isRunning">Start Benchmark</span>
          <span v-else>Running...</span>
        </button>
      </div>
    </header>

    <div class="page-content">
      <!-- Settings Panel -->
      <aside class="sidebar">
        <div class="panel">
          <div class="panel-header"><h3>Configuration</h3></div>
          <div class="panel-body">
            
            <div class="form-group">
              <label>Target Agent Model</label>
              <select v-model="config.model" class="input-field">
                <option value="deepseek/deepseek-v3.2-speciale">DeepSeek V3.2 Speciale</option>
                <option value="gpt-4o">GPT-4o</option>
                <option value="claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                <option value="llava-1.5">LLaVA-1.5 (Multimodal)</option>
                <option value="minigpt-4">MiniGPT-4</option>
              </select>
            </div>

            <div class="form-group border-top">
              <label>Attack Method (Stage 1)</label>
              <select v-model="config.attack" class="input-field">
                <option value="figstep">FigStep / FigStep-Pro</option>
                <option value="himrd">HIMRD (Heuristic-Induced)</option>
                <option value="jood">JOOD (Out-of-Distribution)</option>
                <option value="viscra">VisCRA (Visual CRA)</option>
                <option value="mml">MML</option>
                <option value="qr-attack">QR-Attack</option>
              </select>
              <p class="help-text">Select jailbreak generation strategy</p>
            </div>

            <div class="form-group border-top">
              <label>Defense Interceptor (Stage 2)</label>
              <select v-model="config.defense" class="input-field">
                <option value="none">None (Direct Attack)</option>
                <option value="pangolin-l1">Pangolin L1 (Static)</option>
                <option value="pangolin-l2">Pangolin L2 (Semantic)</option>
                <option value="jailguard">JailGuard (Perturbation Consistency)</option>
                <option value="cider">CIDER (Intent Risk Classifier)</option>
              </select>
              <p class="help-text">All options now run real defense logic in Stage 2</p>
            </div>

            <div class="form-group border-top">
              <label>Risk Category (Taxonomy)</label>
              <select v-model="config.category" class="input-field">
                <option value="all">All Risk Categories (Full Eval)</option>
                <option value="bias">A. Ethical / Bias & Discrimination</option>
                <option value="illegal">B. Illegal / Crime & Violence</option>
                <option value="privacy">C. Privacy / PII Extraction</option>
                <option value="sexual">D. Harassment & NSFW</option>
              </select>
            </div>

            <div class="form-group border-top">
              <label>Case Budget</label>
              <input
                v-model.number="config.max_cases"
                type="number"
                min="1"
                max="100"
                class="input-field"
              />
              <p class="help-text">Number of cases to run in this benchmark session</p>
            </div>

            <div class="form-group border-top">
              <label>Dataset Path (Optional)</label>
              <input
                v-model="config.dataset_path"
                type="text"
                class="input-field"
                placeholder="data/omnisafebench_cases.jsonl"
              />
              <p class="help-text">If provided, Stage 1 loads this JSON/JSONL file instead of generating cases</p>
            </div>

          </div>
        </div>
      </aside>

      <!-- Main Stages & Results -->
      <main class="main-content">
        <!-- Pipeline Visual -->
        <div class="pipeline">
          <div class="stage" :class="{ active: currentStage >= 1, done: currentStage > 1 }">
            <div class="stage-icon">1</div>
            <div class="stage-info">
              <h4>Test Case Gen</h4>
              <span class="mllm-tag">Attack</span>
            </div>
          </div>
          <div class="connector" :class="{ active: currentStage > 1 }"></div>
          
          <div class="stage" :class="{ active: currentStage >= 2, done: currentStage > 2 }">
            <div class="stage-icon">2</div>
            <div class="stage-info">
              <h4>Response Gen</h4>
              <span class="mllm-tag">{{ config.defense !== 'none' ? 'Intercepted' : 'VLM Target' }}</span>
            </div>
          </div>
          <div class="connector" :class="{ active: currentStage > 2 }"></div>
          
          <div class="stage" :class="{ active: currentStage >= 3, done: currentStage > 3 }">
            <div class="stage-icon">3</div>
            <div class="stage-info">
              <h4>Evaluation</h4>
              <span class="mllm-tag">3D Protocol</span>
            </div>
          </div>
        </div>

        <div v-if="currentStage === 0 && !hasResult" class="empty-state">
          <span class="shield-lg">🛡️</span>
          <h3>Ready for Evaluation</h3>
          <p>Configure your target, attack vector, and defense on the left, then start the OmniSafeBench integration.</p>
        </div>

        <div v-if="isRunning || stage2DisplayCases.length > 0 || currentStage >= 2" class="stage2-cases">
          <div class="stage2-header">
            <h4>Running Cases (Stage 2)</h4>
            <span class="stage2-progress">
              {{ stage2Completed }}/{{ stage2Total || config.max_cases }} · showing {{ stage2DisplayCases.length }}
            </span>
          </div>
          <div class="stage2-body">
            <p class="help-text stage2-help">Real-time list of concrete cases already processed by Stage 2.</p>
            <div v-if="stage2DisplayCases.length === 0" class="stage2-empty">
              Waiting for first processed case... (you can still watch progress in logs)
            </div>
            <div v-else class="case-grid">
              <article v-for="item in stage2DisplayCases" :key="`${item.test_case_id}-${item.index}`" class="case-card">
                <div class="case-top">
                  <span class="case-chip">#{{ item.index }}</span>
                  <span class="case-id">{{ item.test_case_id }}</span>
                  <span class="case-chip">{{ item.main_category || config.category }}</span>
                  <span class="case-chip">{{ (item.attack_method || config.attack).toUpperCase() }}</span>
                  <span class="case-status" :class="item.blocked ? 'blocked' : 'allowed'">
                    {{ item.blocked ? 'BLOCKED' : 'PASSED' }}
                  </span>
                </div>
                <p class="case-preview">{{ item.prompt_preview || '(no prompt preview in this backend event)' }}</p>
                <p v-if="item.blocked_reason" class="case-note">Reason: {{ item.blocked_reason }}</p>
                <p v-if="item.model_error" class="case-note error">Model Error: {{ item.model_error }}</p>
              </article>
            </div>
          </div>
        </div>

        <!-- In-progress Logs Viewer -->
          <div v-if="isRunning || logs.length > 0 || (currentStage > 0 && currentStage <= 3)" class="log-stream">
           <div class="log-header">
              <span>Pipeline Logs</span>
              <div v-if="isRunning" class="spinner-small"></div>
           </div>
           <div class="logs">
             <div v-for="(log, idx) in logs" :key="idx" class="log-line">
               <span class="time">{{ log.time }}</span>
               <span :class="'log-level-' + log.level">[{{ log.level }}]</span>
               <span class="msg">{{ log.msg }}</span>
             </div>
           </div>
        </div>

        <!-- Final Results Dashboard -->
        <div v-if="hasResult && !isRunning" class="results-dashboard">
          <h3>Evaluation Results</h3>
          <div class="radar-summary">
            <!-- 3D Protocol Cards -->
            <div class="score-card">
              <div class="score-title">Harmfulness</div>
              <div class="score-value highlight-red">{{ result.harmfulness }}/5</div>
              <div class="score-desc">Content danger level (lower is better)</div>
            </div>
            <div class="score-card">
              <div class="score-title">Intent Alignment</div>
              <div class="score-value highlight-yellow">{{ result.alignment }}/5</div>
              <div class="score-desc">Attacker intent matched (lower is better)</div>
            </div>
            <div class="score-card">
              <div class="score-title">Detail Level</div>
              <div class="score-value highlight-blue">{{ result.detail }}/5</div>
              <div class="score-desc">Explicitness of response (lower is better)</div>
            </div>
          </div>
          
          <div class="result-details panel">
            <div class="panel-header"><h4>Detailed Breakdown</h4></div>
            <div class="panel-body">
              <p><strong>Attack Method:</strong> {{ config.attack.toUpperCase() }}</p>
              <p><strong>Total Cases Evaluated:</strong> {{ result.total_cases }}</p>
              <p><strong>Successful Attacks:</strong> {{ result.successful_cases }}</p>
              <p><strong>Blocked Cases:</strong> {{ result.blocked_cases }}</p>
              <p><strong>ASR (Attack Success Rate):</strong> {{ result.asr }}%</p>
              <p><strong>Defense Efficacy (vs Baseline):</strong> {{ result.defense_delta }}</p>
              <p><strong>Run ID:</strong> {{ result.run_id || '-' }}</p>
              <p><strong>Persisted Traces:</strong> {{ result.persisted_traces }}</p>
              <div class="metric-bar">
                <div class="metric-fill" :style="{ width: result.asr + '%' }"></div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive } from 'vue'

const config = reactive({
  model: 'deepseek/deepseek-v3.2-speciale',
  attack: 'figstep',
  defense: 'pangolin-l2',
  category: 'all',
  max_cases: 24,
  dataset_path: ''
})

const isRunning = ref(false)
const hasResult = ref(false)
const currentStage = ref(0)
const logs = ref<Array<{time: string, level: string, msg: string}>>([])
const result = ref({
  harmfulness: 0.0,
  alignment: 0.0,
  detail: 0.0,
  asr: 0.0,
  total_cases: 0,
  defense_delta: '',
  blocked_cases: 0,
  successful_cases: 0,
  run_id: '',
  persisted_traces: 0
})

interface Stage2CaseItem {
  index: number
  total: number
  test_case_id: string
  main_category: string
  attack_method: string
  prompt_preview: string
  blocked: boolean
  blocked_reason: string
  model_error: string
}

const stage2Cases = ref<Stage2CaseItem[]>([])
const stage2Total = ref(0)
const stage2Completed = ref(0)

const stage2RecentCases = computed(() => {
  return [...stage2Cases.value]
    .sort((a, b) => b.index - a.index)
    .slice(0, 40)
})

const stage2DisplayCases = computed(() => {
  if (stage2RecentCases.value.length > 0) {
    return stage2RecentCases.value
  }

  // Fallback: extract case IDs from frontend progress debug logs.
  const parsed: Stage2CaseItem[] = []
  const seen = new Set<string>()
  const progressRe = /Progress:\s*(\d+)\/(\d+)\s*\(([^)]+)\)/

  for (let i = logs.value.length - 1; i >= 0; i -= 1) {
    const entry = logs.value[i]
    const matched = entry.msg.match(progressRe)
    if (!matched) continue

    const index = Number(matched[1]) || 0
    const total = Number(matched[2]) || 0
    const testCaseId = matched[3]?.trim() || `case-${String(index).padStart(4, '0')}`
    const key = `${testCaseId}-${index}`
    if (seen.has(key)) continue
    seen.add(key)

    parsed.push({
      index,
      total,
      test_case_id: testCaseId,
      main_category: String(config.category),
      attack_method: String(config.attack),
      prompt_preview: '(preview pending from backend progress payload)',
      blocked: false,
      blocked_reason: '',
      model_error: ''
    })

    if (parsed.length >= 40) break
  }

  return parsed
})

function upsertStage2Case(item: Stage2CaseItem) {
  const existingIndex = stage2Cases.value.findIndex(c => c.test_case_id === item.test_case_id)
  if (existingIndex >= 0) {
    stage2Cases.value.splice(existingIndex, 1, item)
    return
  }
  stage2Cases.value.push(item)
}

function addLog(level: string, msg: string) {
  const d = new Date()
  const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
  logs.value.push({ time, level, msg })
}

async function runBenchmark() {
  isRunning.value = true
  hasResult.value = false
  currentStage.value = 0
  logs.value = []
  stage2Cases.value = []
  stage2Total.value = 0
  stage2Completed.value = 0

  addLog('INFO', `Starting real OmniSafeBench pipeline with ${config.attack.toUpperCase()}...`)

  try {
    const response = await fetch('/api/benchmark/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        attack: config.attack,
        defense: config.defense,
        category: config.category,
        max_cases: config.max_cases,
        dataset_path: config.dataset_path || null
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('application/x-ndjson')) {
      throw new Error(`Unexpected response type: ${contentType || 'unknown'}`)
    }

    if (!response.body) {
      throw new Error('Empty streaming response body')
    }

    const reader = response.body.getReader()
    const decoder = new window.TextDecoder()
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const raw of lines) {
        const line = raw.trim()
        if (!line) continue

        let event: any
        try {
          event = JSON.parse(line)
        } catch {
          continue
        }

        const stageNum = Number(event.stage)

        if (event.type === 'stage' && Number.isFinite(stageNum)) {
          if (event.status === 'start') {
            currentStage.value = Math.max(currentStage.value, stageNum)
            if (stageNum === 2 && event.total) {
              stage2Total.value = Number(event.total) || 0
            }
          }
          if (event.status === 'done' && stageNum === 2) {
            stage2Completed.value = Math.max(stage2Completed.value, stage2Total.value)
          }
          if (event.status === 'done' && stageNum === 3) {
            currentStage.value = 4
          }
          continue
        }

        if (event.type === 'log' && event.log) {
          logs.value.push({
            time: event.log.time || new Date().toLocaleTimeString(),
            level: event.log.level || 'INFO',
            msg: event.log.msg || ''
          })
          continue
        }

        if (event.type === 'progress' && stageNum === 2 && event.index && event.total) {
          const index = Number(event.index) || 0
          const total = Number(event.total) || 0

          stage2Total.value = total || stage2Total.value
          stage2Completed.value = Math.max(stage2Completed.value, index)

          upsertStage2Case({
            index,
            total,
            test_case_id: String(event.test_case_id || `case-${String(index).padStart(4, '0')}`),
            main_category: String(event.main_category || ''),
            attack_method: String(event.attack_method || ''),
            prompt_preview: String(event.prompt_preview || ''),
            blocked: Boolean(event.blocked),
            blocked_reason: String(event.blocked_reason || ''),
            model_error: String(event.model_error || '')
          })

          if (index % 5 === 0 || index === total) {
            addLog('DEBUG', `Progress: ${index}/${total} (${event.test_case_id || 'case'})`)
          }
          continue
        }

        if (event.type === 'result' && event.result) {
          result.value = {
            harmfulness: event.result.harmfulness ?? 0,
            alignment: event.result.alignment ?? 0,
            detail: event.result.detail ?? 0,
            asr: event.result.asr ?? 0,
            total_cases: event.result.total_cases ?? 0,
            defense_delta: event.result.defense_delta ?? '',
            blocked_cases: event.result.blocked_cases ?? 0,
            successful_cases: event.result.successful_cases ?? 0,
            run_id: event.result.run_id ?? '',
            persisted_traces: event.result.persisted_traces ?? 0
          }
          hasResult.value = true
          continue
        }

        if (event.type === 'error') {
          addLog('ERROR', event.error || 'Unknown benchmark error')
          continue
        }

        if (event.type === 'done') {
          break
        }
      }
    }

    if (hasResult.value) {
      currentStage.value = 4
      addLog('SUCCESS', 'Benchmark completed.')
    } else {
      addLog('WARN', 'Benchmark ended without a summary payload.')
    }
  } catch (error) {
    console.error('Benchmark run failed:', error)
    addLog('ERROR', `Benchmark failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    isRunning.value = false
  }
}
</script>

<style scoped>
.benchmark-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-sans);
}

.page-header {
  padding: 24px 32px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  background: var(--bg-surface);
}

.header-main h2 {
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 4px 0;
}

.subtitle {
  color: var(--text-secondary);
  font-size: 14px;
  margin: 0;
}

.btn-primary {
  background: var(--accent);
  color: #fff;
  border: none;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.page-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  width: 320px;
  border-right: 1px solid var(--border);
  background: var(--bg-surface);
  overflow-y: auto;
  padding: 16px;
}

.panel {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  margin-bottom: 16px;
}

.panel-header {
  padding: 12px 16px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
}

.panel-header h3 { margin: 0; font-size: 14px; }

.panel-body { padding: 16px; }

.form-group {
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.border-top {
  border-top: 1px solid var(--border);
  padding-top: 16px;
}

.form-group label { font-size: 13px; font-weight: 500; color: var(--text-secondary); }
.input-field {
  padding: 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: var(--radius-sm);
  font-size: 13px;
}
.input-field:focus { outline: none; border-color: var(--accent); }
.help-text { font-size: 11px; color: var(--text-muted); margin: 0; }

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 32px;
  overflow-y: auto;
  gap: 32px;
  background: var(--bg-primary);
}

/* Pipeline UI */
.pipeline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
}

.stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  opacity: 0.4;
  transition: opacity 0.3s;
}
.stage.active { opacity: 1; }
.stage.done .stage-icon { background: var(--accent-green); border-color: var(--accent-green); }

.stage-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1.5px solid var(--border-active);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 12px;
  z-index: 10;
  background: var(--bg-elevated);
}
.stage.active .stage-icon { border-color: var(--accent); color: var(--accent); }
.stage.done .stage-icon { color: #fff; }

.stage-info { text-align: center; }
.stage-info h4 { margin: 0 0 2px 0; font-size: 12px; }
.mllm-tag {
  background: var(--bg-elevated);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 9px;
  color: var(--text-muted);
  border: 1px solid var(--border);
}

.connector {
  flex: 1;
  height: 2px;
  background: var(--border);
  margin: 0 8px;
  position: relative;
  top: -14px;
}
.connector.active {
  background: var(--accent);
}

.empty-state {
  text-align: center;
  padding: 64px 0;
  color: var(--text-muted);
}
.shield-lg { font-size: 48px; display: block; margin-bottom: 16px; opacity: 0.5; }
.empty-state h3 { color: var(--text-primary); margin-bottom: 8px; }

/* Log Stream */
.log-stream {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-size: 12px;
  display: flex;
  flex-direction: column;
  max-height: 200px;
}
.log-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface);
  color: var(--text-secondary);
  display: flex;
  justify-content: space-between;
}
.logs {
  padding: 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.log-line .time { color: var(--text-muted); margin-right: 8px; }
.log-level-INFO { color: var(--accent-cyan); margin-right: 8px; }
.log-level-WARN { color: var(--accent-yellow); margin-right: 8px; }
.log-level-DEBUG { color: var(--text-disabled); margin-right: 8px; }
.log-level-SUCCESS { color: var(--accent-green); margin-right: 8px; }
.log-level-ERROR { color: var(--accent-red); margin-right: 8px; }
.log-line .msg { color: var(--text-primary); }

.spinner-small {
  width: 14px; height: 14px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin { 100% { transform: rotate(360deg); } }

/* Results */
.results-dashboard { display: flex; flex-direction: column; gap: 24px; margin-bottom: 32px; }
.radar-summary {
  display: flex;
  gap: 16px;
}
.score-card {
  flex: 1;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 20px;
  text-align: center;
}
.score-title { font-size: 14px; color: var(--text-secondary); margin-bottom: 12px; }
.score-value { font-size: 32px; font-weight: 700; margin-bottom: 8px; }
.highlight-red { color: var(--accent-red); }
.highlight-yellow { color: var(--accent-yellow); }
.highlight-blue { color: var(--accent); }
.score-desc { font-size: 12px; color: var(--text-muted); }

.result-details p { margin-bottom: 8px; font-size: 14px; }
.metric-bar { margin-top: 12px; height: 8px; background: var(--bg-elevated); border-radius: 4px; overflow: hidden; }
.metric-fill { height: 100%; background: var(--accent-red); transition: width 0.5s; }

/* Stage 2 case stream */
.stage2-cases {
  border: 1px solid var(--border-active);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  box-shadow: 0 6px 20px rgba(37, 99, 235, 0.08);
  overflow: hidden;
}

.stage2-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}

.stage2-header h4 {
  margin: 0;
  font-size: 14px;
}

.stage2-progress {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-secondary);
}

.stage2-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 280px;
  overflow-y: auto;
  padding: 12px 14px;
}

.case-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.stage2-help {
  margin: 0;
}

.stage2-empty {
  color: var(--text-muted);
  font-size: 13px;
}

.case-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  padding: 10px 12px;
}

.case-top {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.case-chip {
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 8px;
}

.case-id {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-primary);
}

.case-status {
  margin-left: auto;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.case-status.allowed {
  color: var(--accent-green);
}

.case-status.blocked {
  color: var(--accent-red);
}

.case-preview {
  margin: 8px 0 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
  word-break: break-word;
}

.case-note {
  margin: 6px 0 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.case-note.error {
  color: var(--accent-red);
}

@media (max-width: 900px) {
  .case-grid {
    grid-template-columns: 1fr;
  }
}
</style>
