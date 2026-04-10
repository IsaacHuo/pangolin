export interface AgentStudioProfile {
  id: string
  name: string
  description: string
  category: string
  emoji: string
  vibe: string
  source_file: string
  instructions_excerpt: string
}

export interface AgentStudioRunRequest {
  task: string
  model?: string
  agent_ids?: string[]
  max_parallel?: number
}

export interface AgentStudioRunStartedEvent {
  type: 'run_started'
  run: {
    id: string
    task: string
    model: string
    created_at: string
    agent_ids: string[]
  }
}

export interface AgentStudioStageStartedEvent {
  type: 'stage_started'
  stage: {
    id: string
    index: number
    agent_count: number
    agents: string[]
  }
}

export interface AgentStudioDelegationEvent {
  type: 'agent_delegation'
  event: {
    run_id: string
    stage_id: string
    step_id: string
    from_agent: string
    to_agent: string
    to_agent_name: string
    objective: string
    depends_on: string[]
    timestamp: string
  }
}

export interface AgentStudioToolEvent {
  tool?: string
  args?: Record<string, unknown>
  result_preview?: string
  allowed?: boolean
  blocked_reason?: string | null
  l1_patterns?: string[]
  l2_confidence?: number | null
  l2_reasoning?: string
}

export interface AgentStudioAgentResultEvent {
  type: 'agent_result'
  result: {
    run_id: string
    step_id: string
    agent_id: string
    agent_name: string
    objective: string
    depends_on: string[]
    content: string
    analysis: Record<string, unknown>
    tool_calls: number
    blocked_tool_calls: number
    tool_events?: AgentStudioToolEvent[]
    started_at: string
    ended_at: string
  }
}

export interface AgentStudioStageDoneEvent {
  type: 'stage_done'
  stage: {
    id: string
    index: number
    artifact_count: number
  }
}

export interface AgentStudioSynthesisEvent {
  type: 'synthesis'
  result: {
    run_id: string
    agent_id: string
    agent_name: string
    content: string
  }
}

export interface AgentStudioErrorEvent {
  type: 'error'
  error: string
}

export interface AgentStudioDoneEvent {
  type: 'done'
  run_id: string
  status: 'completed' | 'failed'
}

export type AgentStudioStreamEvent =
  | AgentStudioRunStartedEvent
  | AgentStudioStageStartedEvent
  | AgentStudioDelegationEvent
  | AgentStudioAgentResultEvent
  | AgentStudioStageDoneEvent
  | AgentStudioSynthesisEvent
  | AgentStudioErrorEvent
  | AgentStudioDoneEvent

export interface AgentStudioRunSummary {
  id: string
  task: string
  status: string
  created_at: string
  completed_at?: string
  artifact_count: number
  agent_count: number
}

export interface AgentStudioRunDetail {
  id: string
  task: string
  model: string
  status: string
  created_at: string
  completed_at?: string
  agents: Array<{
    id: string
    name: string
    description: string
    emoji: string
    category: string
  }>
  timeline: Array<Record<string, unknown>>
  artifacts: Array<{
    id: string
    step_id: string
    agent_id: string
    agent_name: string
    objective: string
    depends_on: string[]
    content: string
    tool_calls: number
    blocked_tool_calls: number
    tool_events?: AgentStudioToolEvent[]
    analysis: Record<string, unknown>
    started_at: string
    ended_at: string
  }>
  final_report: string
  error?: string
}
