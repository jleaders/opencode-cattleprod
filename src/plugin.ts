import type { Plugin, PluginInput } from '@opencode-ai/plugin'

/**
 * Cattleprod Plugin for OpenCode
 *
 * When a model stops on its own (not user-initiated), checks if the todo list
 * exists and has incomplete items. If so, sends a "continue until done" prompt
 * to keep the model working.
 */
export const CattleprodPlugin: Plugin = async (input: PluginInput) => {
  const { client } = input

  if (!client || typeof client !== 'object') {
    return {
      event: async () => { },
    }
  }

  const interruptedSessions = new Set<string>()
  const lastProdBySession = new Map<string, string>()
  let lastInterruptTime = 0

  const INTERRUPT_WINDOW_MS = 5000
  const CONTINUE_DELAY_MS = 2000

  const isInInterruptWindow = (sessionID: string) => {
    const now = Date.now()
    if (now - lastInterruptTime > INTERRUPT_WINDOW_MS) {
      interruptedSessions.clear()
      return false
    }
    return interruptedSessions.has(sessionID)
  }

  return {
    event: async ({ event }) => {
      if (!event || typeof event !== 'object') return

      if (event.type === 'tui.command.execute' && event.properties && event.properties.command === 'session.interrupt') {
        lastInterruptTime = Date.now()
      }

      if (event.type === 'session.idle' && event.properties && event.properties.sessionID) {
        const sessionID = event.properties.sessionID

        if (isInInterruptWindow(sessionID)) {
          interruptedSessions.delete(sessionID)
          return
        }

        await delay(CONTINUE_DELAY_MS)

        try {
          const res = await client.session.todo({ path: { id: sessionID } })

          if (res.error) {
            return
          }

          const todos = res.data
          if (!todos || todos.length === 0) {
            return
          }

          const allDone = todos.every(t => t.status === 'completed' || t.status === 'cancelled')

          if (allDone) {
            return
          }

          const remaining = todos.filter(t => t.status !== 'completed' && t.status !== 'cancelled')
          const summary = remaining.map(t => `• [${t.status}] ${t.content}`).join('\n')
          const prodText = `⚠️ Cattleprod: The following todos are still incomplete. Continue until all todos are done.\n\n${summary}`

          const messagesRes = await client.session.messages({ path: { id: sessionID } })
          if (messagesRes.data) {
            const latestMessage = messagesRes.data.at(-1)
            const latestText = latestMessage?.parts.find(part => part.type === 'text')?.text

            if (
              latestMessage?.info.role === 'user' &&
              latestText === prodText &&
              lastProdBySession.get(sessionID) === prodText
            ) {
              return
            }
          }

          await client.session.prompt({
            path: { id: sessionID },
            body: {
              parts: [
                {
                  type: 'text',
                  text: prodText,
                },
              ],
            },
          })

          lastProdBySession.set(sessionID, prodText)
        } catch {
        }
      }
    },
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
