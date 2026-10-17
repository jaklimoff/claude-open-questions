import { expect, test } from 'claude-code/testing'

const TOOL = 'mcp__open-questions__questions'

test('an asked question stays open until it is answered', async $ => {
  const asked = await $.tool.call({ tool: TOOL, ask: ['Token or nkey?', 'Which port?'] })
  expect(asked.result).toBe('Open questions:\n#1 Token or nkey?\n#2 Which port?')

  const left = await $.tool.call({ tool: TOOL, answered: [1] })
  expect(left.result).toBe('Open questions:\n#2 Which port?')

  const none = await $.tool.call({ tool: TOOL, answered: [2] })
  expect(none.result).toBe('No open questions.')
})

test('answers are kept as drafts and sent together', async ($, on) => {
  const sent: string[] = []
  on('prompt.submit', ($, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  await $.tool.call({ tool: TOOL, ask: ['Token or nkey?', 'Which port?', 'Which host?'] })

  const ui = await $.ui.mount({
    plugin: 'open-questions',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false } as never,
  })
  await ui.press({ key: 'a1' })
  await ui.input({ key: 'in1', text: 'nkey' })
  expect(sent).toEqual([])

  // Enter opened the next question; an empty Enter skips it.
  await ui.input({ key: 'in2', text: '' })
  await ui.input({ key: 'in3', text: 'mini-m4' })
  await ui.press({ key: 'send' })

  expect(sent).toEqual(['Answers to your questions:\n#1 ("Token or nkey?"): nkey\n#3 ("Which host?"): mini-m4'])
  const left = await $.tool.call({ tool: TOOL, ask: [] })
  expect(left.result).toBe('Open questions:\n#2 Which port?')
})

test('the first question is open without pressing answer', async ($, on) => {
  const sent: string[] = []
  on('prompt.submit', ($, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  await $.tool.call({ tool: TOOL, ask: ['Token or nkey?', 'Which port?'] })
  const ui = await $.ui.mount({
    plugin: 'open-questions',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false } as never,
  })
  await ui.input({ key: 'in1', text: 'nkey' })
  await ui.input({ key: 'in2', text: '4222' })
  await ui.press({ key: 'send' })
  expect(sent).toEqual(['Answers to your questions:\n#1 ("Token or nkey?"): nkey\n#2 ("Which port?"): 4222'])
})

test('one question draws the box, none draws nothing', async ($, on) => {
  on('ui.render', () => ({ type: 'Box', props: { key: 'prompt' }, children: [] }) as never)
  await $.tool.call({ tool: TOOL, ask: ['Tabs or spaces?'] })
  const one = await $.ui.mount({
    plugin: 'open-questions',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false } as never,
  })
  expect(await one.find({ key: 'fold' })).toBeDefined()
  await $.tool.call({ tool: TOOL, answered: [1] })
  const ui = await $.ui.mount({
    plugin: 'open-questions',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false } as never,
  })
  expect(await ui.find({ key: 'fold' })).toBeUndefined()
})

test('one draft reads as one answer', async ($, on) => {
  const sent: string[] = []
  on('prompt.submit', ($, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  await $.tool.call({ tool: TOOL, ask: ['Tabs or spaces?', 'Which port?'] })
  const ui = await $.ui.mount({
    plugin: 'open-questions',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false } as never,
  })
  await ui.input({ key: 'in1', text: 'spaces' })
  await ui.press({ key: 'send' })
  expect(sent).toEqual(['Answer to your question #1 ("Tabs or spaces?"): spaces'])
})

test('a prompt carries the open questions', async ($, on) => {
  const context: (readonly string[] | undefined)[] = []
  on('prompt.submit', ($, e) => {
    context.push(e.context)
    return { text: e.text }
  })
  await $.prompt.submit({ text: 'hi', asUser: true })
  await $.tool.call({ tool: TOOL, ask: ['Which port?'] })
  await $.prompt.submit({ text: '4222', asUser: true })

  expect(context[0]).toBeUndefined()
  expect(context[1]?.[0]).toContain('#1 Which port?')
})

test('a typed prompt carries the drafted answers', async ($, on) => {
  const sent: { text: string; context?: readonly string[] }[] = []
  on('prompt.submit', ($, e) => {
    sent.push({ text: e.text, context: e.context })
    return { text: e.text }
  })
  await $.tool.call({ tool: TOOL, ask: ['Token or nkey?', 'Which port?'] })
  const ui = await $.ui.mount({
    plugin: 'open-questions',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false } as never,
  })
  await ui.input({ key: 'in1', text: 'nkey' })
  await $.prompt.submit({ text: 'and what about TLS?', asUser: true })

  expect(sent[0]?.text).toBe('and what about TLS?\n\nAnswer to your question #1 ("Token or nkey?"): nkey')
  expect(sent[0]?.context?.[0]).toContain('#2 Which port?')
  expect(sent[0]?.context?.[0]).not.toContain('#1')
  const left = await $.tool.call({ tool: TOOL, ask: [] })
  expect(left.result).toBe('Open questions:\n#2 Which port?')
})

test('parallel calls never share an id', async $ => {
  await Promise.all([$.tool.call({ tool: TOOL, ask: ['A?', 'B?'] }), $.tool.call({ tool: TOOL, ask: ['C?'] })])
  const all = await $.tool.call({ tool: TOOL, ask: [] })
  const ids = String(all.result).match(/#\d+/g) ?? []
  expect(ids.length).toBe(3)
  expect(new Set(ids).size).toBe(3)
})
