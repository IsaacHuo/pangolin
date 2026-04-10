<template>
  <div class="studio-graph-wrapper" ref="wrapperRef">
    <svg :viewBox="viewBox" class="studio-svg-graph">
      <!-- Edges -->
      <g class="edges">
        <path
          v-for="edge in renderEdges"
          :key="edge.id"
          :d="edge.path"
          :class="[
            'graph-edge',
             edge.sourceNode?.status === 'completed' ? 'edge-active' : 'edge-dim'
          ]"
        />
        <!-- Animated markers moving along active edges could be added here -->
      </g>

      <!-- Nodes -->
      <g
        v-for="node in renderNodes"
        :key="node.id"
        :transform="`translate(${node.x}, ${node.y})`"
        class="graph-node-group"
      >
        <foreignObject x="-95" y="-35" width="190" height="70">
          <div :class="['node-card', 'status-' + node.status]">
            <div class="node-emoji">{{ node.emoji }}</div>
            <div class="node-content">
              <div class="node-name text-truncate">{{ node.agentName }}</div>
              <div class="node-status-text">
                <v-icon v-if="node.status === 'completed'" color="success" size="12" class="mr-1">mdi-check-circle</v-icon>
                <v-icon v-else-if="node.status === 'error'" color="error" size="12" class="mr-1">mdi-alert-circle</v-icon>
                {{ node.status }}
              </div>
              <v-progress-linear
                v-if="node.status === 'running'"
                color="primary"
                indeterminate
                height="2"
                class="mt-1"
              />
            </div>
            <v-tooltip activator="parent" location="top" max-width="300" open-delay="200">
               <div class="text-caption font-weight-bold mb-1">{{ node.agentName }}</div>
               <div class="text-caption">{{ node.objective || 'Processing...' }}</div>
            </v-tooltip>
          </div>
        </foreignObject>
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AgentGraphData } from '~/composables/useAgentStudio'

const props = defineProps<{
  graph: AgentGraphData
}>()

const NODE_WIDTH = 190
const NODE_HEIGHT = 70
const COL_SPACING = 240
const ROW_SPACING = 90

// We assign logical coordinates to nodes based on their stage index
const renderNodes = computed(() => {
  const stages = new Map<number, typeof props.graph.nodes>()
  props.graph.nodes.forEach((n) => {
    if (!stages.has(n.stageIndex)) {
      stages.set(n.stageIndex, [])
    }
    stages.get(n.stageIndex)!.push(n)
  })

  // Sort them so they display consistently
  const out: any[] = []
  stages.forEach((nodesInStage, stageIndex) => {
    nodesInStage.forEach((n, idx) => {
      // Center vertically blocks of nodes
      const totalInStage = nodesInStage.length
      const startY = -((totalInStage - 1) * ROW_SPACING) / 2
      const x = stageIndex * COL_SPACING + NODE_WIDTH / 2 + 20
      const y = Math.max(80, startY + idx * ROW_SPACING + 80)
      
      out.push({
        ...n,
        x,
        y
      })
    })
  })

  // Normalize Y to start from positive padding
  let minY = Infinity
  out.forEach(n => { if(n.y < minY) minY = n.y })
  const yOffset = minY < 60 ? 60 - minY : 0

  return out.map(n => ({...n, y: n.y + yOffset}))
})

const viewBox = computed(() => {
  if (renderNodes.value.length === 0) return '0 0 600 200'
  let maxX = 0
  let maxY = 0
  renderNodes.value.forEach((n) => {
    if (n.x > maxX) maxX = n.x
    if (n.y > maxY) maxY = n.y
  })
  return `0 0 ${maxX + NODE_WIDTH/2 + 20} ${Math.max(200, maxY + NODE_HEIGHT/2 + 20)}`
})

const renderEdges = computed(() => {
  // Map sources to targets
  const nodeMap = new Map()
  renderNodes.value.forEach(n => nodeMap.set(n.id, n))

  return props.graph.edges.map((e, idx) => {
    const s = nodeMap.get(e.source)
    const t = nodeMap.get(e.target)
    if (!s || !t) return null

    // draw bezier curve from right of source to left of target
    const startX = s.x + NODE_WIDTH / 2
    const startY = s.y
    const endX = t.x - NODE_WIDTH / 2
    const endY = t.y

    const cX1 = startX + 40
    const cY1 = startY
    const cX2 = endX - 40
    const cY2 = endY
    
    return {
      id: `${e.source}-${e.target}-${idx}`,
      sourceNode: s,
      path: `M ${startX} ${startY} C ${cX1} ${cY1}, ${cX2} ${cY2}, ${endX} ${endY}`
    }
  }).filter(Boolean) as any[]
})

</script>

<style scoped>
.studio-graph-wrapper {
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  background-color: rgb(var(--v-theme-surface));
  border-radius: 8px;
  min-height: 200px;
}

.studio-svg-graph {
  display: block;
  min-width: 100%;
  min-height: 200px;
}

.graph-edge {
  fill: none;
  stroke-width: 2;
  transition: all 0.5s ease;
}

.edge-dim {
  stroke: rgba(var(--v-theme-on-surface), 0.15);
  stroke-dasharray: 4;
}

.edge-active {
  stroke: rgb(var(--v-theme-primary));
  opacity: 0.6;
}

.node-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  height: 60px;
  width: 190px;
  box-sizing: border-box;
  transition: all 0.3s ease;
}

.node-card.status-running {
  border-color: rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.2);
  animation: pulse-border 2s infinite;
}

.node-card.status-completed {
  border-color: rgb(var(--v-theme-success));
}

.node-card.status-error {
  border-color: rgb(var(--v-theme-error));
}

.node-emoji {
  font-size: 24px;
}

.node-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.node-name {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
}

.node-status-text {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  text-transform: capitalize;
  display: flex;
  align-items: center;
  margin-top: 2px;
}

@keyframes pulse-border {
  0% { box-shadow: 0 0 0 0 rgba(var(--v-theme-primary), 0.4); }
  70% { box-shadow: 0 0 0 6px rgba(var(--v-theme-primary), 0); }
  100% { box-shadow: 0 0 0 0 rgba(var(--v-theme-primary), 0); }
}
</style>
