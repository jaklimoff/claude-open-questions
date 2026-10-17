export type Question = { id: number; text: string }

declare module 'claude-code' {
  interface PluginState {
    'open-questions': {
      questions: Question[]
      questionsNextId: number
      questionsFolded: boolean
      questionsAnswering: number | null
      questionsDrafts: Record<string, string>
    }
  }
}
