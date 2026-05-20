import type { PluginModule } from '@opencode-ai/plugin'

import { CattleprodPlugin } from './plugin'

const plugin: PluginModule = {
  id: 'opencode-cattleprod',
  server: CattleprodPlugin,
}

export { CattleprodPlugin }

export default plugin
