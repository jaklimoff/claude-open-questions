// Open questions: the questions Claude asked that are not answered yet, in a box above the prompt.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Question } from '../types'

const open = atom({ plugin: 'open-questions', key: 'questions' } as const, [] as Question[])
const nextId = atom({ plugin: 'open-questions', key: 'questionsNextId' } as const, 1)
const isFolded = atom({ plugin: 'open-questions', key: 'questionsFolded' } as const, false)
const answering = atom({ plugin: 'open-questions', key: 'questionsAnswering' } as const, null as number | null)
const drafts = atom({ plugin: 'open-questions', key: 'questionsDrafts' } as const, {} as Record<string, string>)

const TOOL = 'mcp__open-questions__questions'

// Nerd Font glyphs: without a Nerd Font in the terminal they show as empty squares.
const ICON = {
  unfolded: '\uf078',
  folded: '\uf054',
  question: '\uf059',
  done: '\uf00c',
  answer: '\uf040',
  edit: '\uf044',
  close: '\uf00d',
  send: '\uf1d8',
  keyboard: '\uf11c',
  branch: '╰─',
}

type Args = { ask?: string[]; answered?: number[] }

/** The drafts of the questions still in `list`. */
const keep = (d: Record<string, string>, list: Question[]) =>
  Object.fromEntries(Object.entries(d).filter(([id]) => list.some(q => String(q.id) === id)))

/** One message with every drafted answer. */
export const answersMessage = (list: Question[], d: Record<string, string>): string => {
  const lines = list.filter(q => d[q.id] !== undefined).map(q => `#${q.id} ("${q.text}"): ${d[q.id]}`)
  return lines.length === 1 ? `Answer to your question ${lines[0]}` : `Answers to your questions:\n${lines.join('\n')}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'questions',
      isDeferred: false,
      description:
        'Track the questions you ask the user. Each time your reply asks the user a question that needs an answer, ' +
        'call this tool with `ask` (one short line for each question). When the user answers a question, or it no ' +
        'longer applies, call it with `answered` (the ids). Do not track rhetorical questions or offers. ' +
        'Returns the open questions.',
      inputSchema: {
        type: 'object',
        properties: {
          ask: { type: 'array', items: { type: 'string' } },
          answered: { type: 'array', items: { type: 'number' } },
        },
      },
    })

    return next(e)
  })

  // No .catch on the gating hooks: if one throws, Claude Code skips it and the call or prompt goes through unchanged,
  // which is the right failure for a tracker.
  on('tool.call', { tool: TOOL }, async ($, e) => {
    const { ask = [], answered = [] } = e as unknown as Args
    // Reserve the ids in one update, so parallel calls never hand out the same id.
    const end = await update($, nextId, n => n + ask.length)
    const added = ask.map((text, i) => ({ id: end - ask.length + i, text }))
    const list = await update($, open, qs => [
      ...qs.filter(q => !answered.includes(q.id)),
      ...added,
    ])
    const d = await update($, drafts, x => keep(x, list))
    // The first question without a draft is open, so ctrl+x tab lands in its field.
    await update($, answering, cur =>
      list.some(q => q.id === cur) ? cur : (list.find(q => d[q.id] === undefined)?.id ?? null),
    )
    const lines = list.map(q => `#${q.id} ${q.text}`).join('\n')

    return { result: lines === '' ? 'No open questions.' : `Open questions:\n${lines}` }
  })

  // Each prompt carries the drafted answers and the open questions, so Claude drops the ones it answers or makes moot.
  on('prompt.submit', async ($, e, next) => {
    const all = await read($, open)
    const d = await read($, drafts)
    const ids = all.filter(q => d[q.id] !== undefined).map(q => q.id)
    let text = e.text
    if (ids.length > 0) {
      text = [e.text.trim(), answersMessage(all, d)].filter(t => t !== '').join('\n\n')
      await update($, drafts, () => ({}))
    }
    const list = await update($, open, qs => qs.filter(q => !ids.includes(q.id)))
    if (ids.length > 0) {
      await update($, answering, () => list[0]?.id ?? null)
    }
    if (list.length === 0) {
      return next({ ...e, text })
    }
    const reminder =
      `Open questions you asked:\n${list.map(q => `#${q.id} ${q.text}`).join('\n')}\n` +
      `If this message answers any of them or makes them irrelevant, call ${TOOL} with \`answered\`.`

    return next({ ...e, text, context: [...(e.context ?? []), reminder] })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, open)
    if (list.length === 0 || e.props.hasSurvey) {
      return next(e)
    }

    const folded = await read($, isFolded)
    const current = await read($, answering)
    const d = await read($, drafts)
    const drafted = list.filter(q => d[q.id] !== undefined).length
    const els = $.ui.resolve(e)
    const { Box, Button, Text } = els
    const Input = 'Input' in els ? els.Input : undefined
    // A rounded pill: `color` as the fill, the text dark on it. `bold` is deprecated since v2.1.299 in favour of
    // `weight: 'semibold'`; it still works and keeps the floor at v2.1.293.
    const pill = (color: string, label: string | number) => (
      <Text>
        <Text color={color}>{'\ue0b6'}</Text>
        <Text color="inverseText" backgroundColor={color} bold>
          {label}
        </Text>
        <Text color={color}>{'\ue0b4'}</Text>
      </Text>
    )
    const band = e.requestId
    const toggle = () => update($, isFolded, f => !f)
    const close = async (id: number) => {
      const left = await update($, open, qs => qs.filter(x => x.id !== id))
      await update($, drafts, x => keep(x, left))
    }
    const startAnswer = (q: Question) => update($, answering, () => q.id)
    // Enter keeps the draft and opens the next question without one.
    const save = async (q: Question, value: string) => {
      const all = await update($, drafts, x => {
        const { [q.id]: _, ...rest } = x
        return value.trim() === '' ? rest : { ...rest, [q.id]: value.trim() }
      })
      const after = list.slice(list.indexOf(q) + 1).find(x => all[x.id] === undefined)
      await update($, answering, () => after?.id ?? null)
      void $.ui.focus({ requestId: band, key: after === undefined ? 'send' : `in${after.id}` }).catch(() => undefined)
    }
    const sendAll = async () => {
      const all = await read($, drafts)
      const message = answersMessage(list, all)
      const ids = list.filter(q => all[q.id] !== undefined).map(q => q.id)
      if (ids.length === 0) {
        return
      }
      await update($, answering, () => null)
      const left = await update($, open, qs => qs.filter(x => !ids.includes(x.id)))
      await update($, drafts, x => keep(x, left))
      await $.prompt.submit({ text: message, asUser: true })
    }

    const done = drafted === list.length
    const accent = done ? 'success' : 'warning'

    return (
      <Box flexDirection="column" borderStyle="round" borderColor={accent} paddingX={1}>
        <Box>
          <Button key="fold" label={folded ? ICON.folded : ICON.unfolded} plain dimColor onPress={toggle} />
          <Text> </Text>
          {pill(accent, `${done ? ICON.done : ICON.question} ${list.length} open`)}
          <Text> </Text>
          {list.length <= 8 ? (
            <Text>
              <Text color="success">{'●'.repeat(drafted)}</Text>
              <Text dimColor>{'○'.repeat(list.length - drafted)}</Text>
            </Text>
          ) : (
            <Text dimColor>
              {drafted}/{list.length}
            </Text>
          )}
          {folded && (
            <Box flexShrink={1}>
              <Text dimColor wrap="truncate-end">
                {'  '}
                {list[0]?.text}
                {list.length > 1 ? ' …' : ''}
              </Text>
            </Box>
          )}
          <Box flexGrow={1} justifyContent="flex-end">
            {drafted > 0 ? (
              <Button key="send" variant="primary" onPress={sendAll}>
                {ICON.send} send {drafted}
              </Button>
            ) : (
              !folded && <Text dimColor>{ICON.keyboard} ctrl+x tab</Text>
            )}
          </Box>
        </Box>
        {!folded &&
          list.map(q => {
            const draft = d[q.id]
            const isOpen = current === q.id && Input !== undefined
            return (
              <Box key={`q${q.id}`} flexDirection="column" marginTop={1}>
                <Box>
                  {pill(draft === undefined ? (isOpen ? 'warning' : 'inactive') : 'success', draft === undefined ? q.id : ICON.done)}
                  <Text> </Text>
                  <Box flexGrow={1} flexShrink={1}>
                    <Text bold={isOpen} dimColor={draft !== undefined && !isOpen}>
                      {q.text}
                    </Text>
                  </Box>
                  <Text> </Text>
                  <Button key={`a${q.id}`} label={draft === undefined ? ICON.answer : ICON.edit} plain dimColor onPress={() => startAnswer(q)} />
                  {/* The cross shows only under the pointer, so the rows stay calm. */}
                  <Box display="none" hover={{ display: 'flex' }}>
                    <Text>  </Text>
                    <Button key={`x${q.id}`} label={ICON.close} plain dimColor onPress={() => close(q.id)} />
                  </Box>
                </Box>
                {isOpen ? (
                  <Box paddingLeft={1}>
                    <Input
                      key={`in${q.id}`}
                      label={`${ICON.branch} `}
                      value={draft ?? ''}
                      placeholder="your answer · Enter keeps it and moves on · empty skips"
                      submitLabel="keep"
                      autoFocus
                      onSubmit={(value: string) => save(q, value)}
                    />
                  </Box>
                ) : (
                  draft !== undefined && (
                    <Box paddingLeft={1}>
                      <Text dimColor>{ICON.branch} </Text>
                      <Text color="success">{draft}</Text>
                    </Box>
                  )
                )}
              </Box>
            )
          })}
      </Box>
    )
  })
}
