# open-questions

A Claude Code plugin that keeps the questions Claude asked you in a box above the prompt, until you answer them.

Claude often asks something in the middle of a long reply, then keeps writing. The question scrolls away under the text that follows, and you answer only what you saw last. With this plugin, every question Claude asks lands in the box. It stays there until you answer it, or until it no longer applies.

```
╭──────────────────────────────────────────────────────────────╮
│   ? 2 open  ●○                                      send 1  │
│                                                              │
│  1  Token or nkey?                                           │
│  ╰─ nkey                                                     │
│                                                              │
│  2  Which port?                                              │
╰──────────────────────────────────────────────────────────────╯
```

## Install

```
/plugin marketplace add jaklimoff/claude-open-questions
/plugin install open-questions@open-questions
```

The box uses Nerd Font glyphs. Without a Nerd Font in your terminal, the icons show as empty squares.

## Use

- Claude files each question it asks with the `questions` tool. You do nothing.
- Press the pencil next to a question, type the answer, press Enter. The answer is kept as a draft and the next question opens. An empty Enter skips it.
- **send** sends all drafts in one message. Any prompt you type also carries the drafts, after your text.
- `ctrl+x tab` focuses the box, with the first unanswered question already open.
- The cross (on hover) drops a question without an answer. The chevron folds the box to one line.
- Each prompt reminds Claude of the open questions, so it closes the ones your message answered or made moot.

## How it works

The whole plugin is one file, `hooks/open-questions.tsx`, about 250 lines. It hooks four events:

| Event | What it does |
|---|---|
| `session.start` | Registers the `questions` tool: `ask` adds questions, `answered` closes them by id. The tool description tells Claude when to call it. |
| `tool.call` | Handles the tool: keeps the open questions in plugin state (`atom`), hands out ids in one `update` so parallel calls never share one. |
| `prompt.submit` | Adds your drafted answers to the message, and the list of open questions to the context Claude sees. |
| `ui.render` (`AbovePrompt`) | Draws the box with `Box`, `Text`, `Button` and `Input`. |

The tests in `tests/open-questions.test.ts` show each behaviour. Run them with:

```
claude plugin test .
```

For development, start Claude Code with `claude --plugin-dir <path to this folder>`.

## Build your own

This plugin is small on purpose. Fork it, keep the four hooks, and change what they track: TODOs Claude promised, files it said it would come back to, warnings it gave. Claude Code can write most of it for you. The work is in the tuning afterwards, one edge case at a time.
