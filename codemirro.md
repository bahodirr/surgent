## CodeMirror v6 — Deep Dive and Practical Guide

This guide distills the core concepts, APIs, and best practices of CodeMirror v6 (CM6), along with practical integration tips, performance and accessibility notes, and example snippets. It’s intended as a comprehensive reference you can skim or dive into.

### What is CodeMirror v6?
CodeMirror v6 is a modern, modular, and extensible code editor for the web. Unlike v5’s monolithic architecture, v6 is a set of small, focused packages under the `@codemirror/*` scope that you compose via extensions. The design centers on:
- Immutable editor state
- A declarative extension system
- A small, fast DOM view with virtualized rendering
- Language-agnostic infrastructure powered by Lezer parsers

Key official resources:
- System Guide: `https://codemirror.net/docs/`
- Packages: `https://github.com/codemirror/` (monorepo and package READMEs)
- Discussion forum: `https://discuss.codemirror.net/`

## Core Building Blocks

### EditorState
Represents the immutable state: document text, selection, and all configured extensions. You typically create it once and evolve it via transactions.

```ts
import {EditorState} from "@codemirror/state";

const state = EditorState.create({
  doc: "Hello, CodeMirror!",
  extensions: [],
});
```

Important pieces:
- `doc`: the text; use transactions to change it
- `selection`: current selections/cursors
- `extensions`: an array of `Extension` values configuring behavior, theme, keymaps, language, etc.

### EditorView
The DOM-bound view. It renders the state and receives user input. You update it by dispatching transactions.

```ts
import {EditorView} from "@codemirror/view";

const view = new EditorView({
  state,
  parent: document.getElementById("editor")!,
});

// Apply an edit
view.dispatch({
  changes: {from: 0, to: 0, insert: "// intro\n"}
});
```

Key points:
- Create once and keep around; destroy with `view.destroy()` when unmounting
- Read current state via `view.state`
- Attach listeners with extensions (preferred) or `updateListener`

### Transactions
Describe how to transform one state into the next. Dispatched to the view.

Components of a transaction:
- `changes`: text edits (single or array of ranges)
- `selection`: set a new selection/cursor
- `effects`: side-channel signals to state fields/plugins
- `annotations`: metadata (e.g., `Transaction.userEvent`) that affects grouping and history

```ts
import {EditorSelection, Transaction} from "@codemirror/state";

view.dispatch({
  changes: {from: 0, to: 0, insert: "const x = 1;\n"},
  selection: EditorSelection.single(10),
  annotations: Transaction.userEvent.of("input"),
});
```

### Extensions and Precedence
Almost everything is an `Extension` value. You compose behavior by supplying an array of extensions to the state. If ordering matters, control it with `Prec`.

```ts
import {Prec} from "@codemirror/state";

const extensions = [
  Prec.highest(/* critical extension */),
  /* … other extensions … */
];
```

### Compartments (Dynamic Reconfiguration)
Use a `Compartment` to reconfigure a subset of extensions at runtime without recreating the entire editor.

```ts
import {Compartment} from "@codemirror/state";

const languageCompartment = new Compartment();

const state = EditorState.create({
  doc: "",
  extensions: [languageCompartment.of([])],
});

// Later: swap language/theme/etc.
view.dispatch({
  effects: languageCompartment.reconfigure(/* new language extension */)
});
```

## Extensibility Model

### Facets (Configuration Plumbing)
Facets aggregate configuration from extensions. Many built-in behaviors are controlled via facets (e.g., indentation, content attributes). Advanced use-cases define custom facets to let other extensions read config.

### StateField (Persistent, Serializable State)
Keeps derived editor state that updates with transactions, and can optionally expose extensions (e.g., decorations) via `provide`.

```ts
import {StateField} from "@codemirror/state";
import {Decoration, DecorationSet, EditorView} from "@codemirror/view";

const highlightField = StateField.define<DecorationSet>({
  create() { return Decoration.none; },
  update(value, tr) {
    // Map existing decorations across changes
    value = value.map(tr.changes);
    // Optionally recompute based on new state
    return value;
  },
  provide: f => EditorView.decorations.from(f),
});
```

### ViewPlugin (Ephemeral, View-Only State)
Attaches to the view, receives `update` calls, and can produce decorations, DOM side-effects, and tooltips.

```ts
import {ViewPlugin, ViewUpdate} from "@codemirror/view";

const plugin = ViewPlugin.fromClass(class {
  constructor(readonly view: EditorView) {}
  update(update: ViewUpdate) {
    if (update.docChanged) {
      // respond to changes
    }
  }
}, {
  // Optionally expose decorations, tooltips, etc.
});
```

## Rendering and Decoration

### Decorations and RangeSets
Decorations annotate the document with styling, widgets, replacements, etc. They live in `DecorationSet` (a `RangeSet<Decoration>` under the hood) and must be mapped through changes.

```ts
import {Decoration, DecorationSet} from "@codemirror/view";
import {RangeSetBuilder} from "@codemirror/state";

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const text = view.state.doc.toString();
  // Example: underline TODO words
  const re = /\bTODO\b/g;
  for (let m; (m = re.exec(text)); ) {
    builder.add(m.index, m.index + m[0].length,
      Decoration.mark({class: "cm-todo"})
    );
  }
  return builder.finish();
}
```

Decoration types:
- `Decoration.mark`: inline styling (adds classes/attributes)
- `Decoration.replace`: hide or replace ranges
- `Decoration.widget`: embed a DOM node at a position (inline or block)

### Gutters and Panels
- Gutters (e.g., line numbers) come from `@codemirror/gutter` (e.g., `lineNumbers()`, `gutter({class, markers})`).
- Panels are floating UI regions inside the editor from `@codemirror/view` (`showPanel` with a factory returning a `Panel`).

## Languages and Highlighting

### Lezer and Language Packages
CM6 integrates with the Lezer parsing system. Official language packages provide parsing, indentation, folding, and language data.

Common packages:
- `@codemirror/lang-javascript`, `@codemirror/lang-json`, `@codemirror/lang-css`, `@codemirror/lang-html`, `@codemirror/lang-xml`
- `@codemirror/lang-markdown`, `@codemirror/lang-sql`, `@codemirror/lang-python`, etc.

```ts
import {javascript} from "@codemirror/lang-javascript";

const state = EditorState.create({
  doc: "function main() {}",
  extensions: [javascript({jsx: true, typescript: false})],
});
```

### Syntax Highlighting and Tags
Highlighting is tag-based via `@lezer/highlight`. Themes map tags to CSS.

```ts
import {HighlightStyle, tags as t} from "@codemirror/highlight";
import {syntaxHighlighting} from "@codemirror/language";

const customHighlight = HighlightStyle.define([
  {tag: t.keyword, color: "#c678dd"},
  {tag: [t.string, t.special(t.string)], color: "#98c379"},
  {tag: t.comment, color: "#5c6370", fontStyle: "italic"},
]);

const highlightingExt = syntaxHighlighting(customHighlight);
```

## Features and Packages

### Basic/Minimal Setup
- `basicSetup` (from the `codemirror` meta package) enables a batteries-included editor (search, history, selection, default keymaps, etc.).
- `minimalSetup` is a slimmer baseline—compose only what you need.

```ts
import {EditorView, minimalSetup} from "codemirror";
// or: import {basicSetup} from "codemirror";
```

### History
```ts
import {history, undo, redo, historyKeymap} from "@codemirror/history";
import {keymap} from "@codemirror/view";

const historyExt = [history(), keymap.of(historyKeymap)];
```

### Search
```ts
import {searchKeymap, openSearchPanel, highlightSelectionMatches} from "@codemirror/search";
```

### Autocompletion
```ts
import {autocompletion, completeFromList, CompletionContext} from "@codemirror/autocomplete";

const fruits = autocompletion({
  override: [completeFromList([
    {label: "apple", type: "variable"},
    {label: "banana", type: "variable"},
  ])]
});
```

### Close Brackets
```ts
import {closeBrackets, closeBracketsKeymap} from "@codemirror/closebrackets";
```

### Lint
```ts
import {linter, lintGutter, Diagnostic} from "@codemirror/lint";

const myLinter = linter(view => {
  const diagnostics: Diagnostic[] = [];
  const text = view.state.doc.toString();
  if (text.includes("eval(")) {
    diagnostics.push({
      from: text.indexOf("eval("),
      to: text.indexOf("eval(") + 4,
      severity: "warning",
      message: "Avoid eval",
    });
  }
  return diagnostics;
});
```

### Keymaps and Commands
```ts
import {keymap} from "@codemirror/view";
import {indentWithTab} from "@codemirror/commands";

const keys = keymap.of([
  indentWithTab,
  {key: "Mod-s", run: () => { /* save */ return true; }},
]);
```

## Theming and Styling

### Theme Extensions
```ts
import {EditorView} from "@codemirror/view";

const myTheme = EditorView.theme({
  "&": { color: "#d0d0d0", backgroundColor: "#1e1e1e" },
  ".cm-content": { caretColor: "#ffffff" },
  ".cm-todo": { textDecoration: "underline wavy #ffbd2e" },
}, {dark: true});
```

You can also use community themes like `@codemirror/theme-one-dark`.

## Dynamic Configuration Patterns

### Switching Languages/Themes at Runtime
Use `Compartment` + `reconfigure` to swap extensions without full reinit.

```ts
import {Compartment} from "@codemirror/state";
import {javascript} from "@codemirror/lang-javascript";

const lang = new Compartment();
const theme = new Compartment();

const state = EditorState.create({
  doc: "",
  extensions: [
    lang.of(javascript()),
    theme.of(myTheme),
  ],
});

// Later
view.dispatch({ effects: lang.reconfigure(/* another language */) });
view.dispatch({ effects: theme.reconfigure(/* another theme */) });
```

## Observability & Update Hooks

### Update Listener
```ts
import {EditorView} from "@codemirror/view";

const onUpdate = EditorView.updateListener.of((update) => {
  if (update.docChanged) {
    const newText = update.state.doc.toString();
    // sync to app state, validate, etc.
  }
});
```

Prefer view plugins for stateful logic; use listeners for simple, side-effectful hooks.

## Collaboration and LSP

### Yjs Collaboration
Use `y-codemirror.next` to bind CM6 to a Yjs shared document for real-time multi-user editing.

- Package: `y-codemirror.next` (bindings for CM6)
- Typical setup: create a Yjs `Doc`, bind to the editor via the extension, coordinate awareness/cursors

### Language Server Protocol (LSP)
Community packages like `codemirror-lsp` provide completion, hover, and diagnostics via LSP servers in the browser or over a bridge.

## Framework Integrations

### React
The most popular wrapper is `@uiw/react-codemirror`.

```tsx
import React from "react";
import CodeMirror from "@uiw/react-codemirror";
import {javascript} from "@codemirror/lang-javascript";
import {oneDark} from "@codemirror/theme-one-dark";

export function Editor() {
  return (
    <CodeMirror
      value="console.log('hello')"
      height="400px"
      extensions={[javascript({jsx: true}), oneDark]}
      onChange={(value) => {/* sync */}}
    />
  );
}
```

Tips for Next.js/SSR:
- Only create views on the client (e.g., dynamic import with `ssr: false`)
- Or gate editor creation in `useEffect`

### Vue
- `vue-codemirror` (v6-compatible) offers a directive/component interface

### Svelte
- `svelte-codemirror-editor` or similar community wrappers

### Angular
- Community wrappers for v6 exist; evaluate maintenance status before adopting

## Performance Best Practices

- Compute heavy decorations in a `ViewPlugin` and only for visible ranges when possible
- Always map `DecorationSet` through `tr.changes`
- Avoid repeatedly converting the whole document to string in hot paths
- Prefer incremental parsing via language packages (Lezer)
- Enable line wrapping only if needed (`EditorView.lineWrapping`)
- Use compartments to avoid full reinit when toggling modes/themes
- Destroy views on unmount to avoid memory leaks

## Accessibility & Mobile

- CM6 is designed to work with screen readers; avoid injecting inaccessible widgets
- Use clear contrast in themes; respect OS-level high contrast when applicable
- IME composition is supported; avoid interfering DOM hacks in input area
- Mobile: CM6 leverages native selection; test gestures and virtual keyboards early

## Migration: v5 → v6 (Key Differences)

- Modular packages vs. monolith
- Immutable `EditorState`; most behaviors are extensions
- New decoration model and plugin system
- Lezer-based language infrastructure
- New theming and keymap approach

Migration tips:
- Reimplement custom addons as `StateField` or `ViewPlugin`
- Replace v5 modes with v6 language packages (or build Lezer grammars)
- Map configuration to facets/compartments; avoid global mutable state

## Common Pitfalls & Gotchas

- Forgetting to map decorations across changes -> stale or mispositioned widgets
- Dispatching many tiny transactions unnecessarily -> batch edits when possible
- Overusing update listeners for stateful logic -> prefer view plugins/fields
- Reconfiguring without compartments -> you’ll replace the entire extension set
- Creating/destroying views frequently in frameworks -> manage lifecycle carefully

## Practical Snippets

### Minimal Editor with History and Search
```ts
import {EditorState} from "@codemirror/state";
import {EditorView, keymap} from "@codemirror/view";
import {history, historyKeymap} from "@codemirror/history";
import {searchKeymap, highlightSelectionMatches} from "@codemirror/search";

const state = EditorState.create({
  doc: "Type here…",
  extensions: [
    history(),
    keymap.of([...historyKeymap, ...searchKeymap]),
    highlightSelectionMatches(),
  ],
});

new EditorView({state, parent: document.querySelector("#editor")!});
```

### Custom Completion Source
```ts
import {autocompletion, CompletionContext} from "@codemirror/autocomplete";

function mySource(ctx: CompletionContext) {
  const word = ctx.matchBefore(/\w*/);
  if (!word || (word.from == word.to && !ctx.explicit)) return null;
  return {
    from: word.from,
    options: [
      {label: "print", type: "function"},
      {label: "printf", type: "function"},
    ],
  };
}

const completionExt = autocompletion({override: [mySource]});
```

### Inline Widget Decoration
```ts
import {Decoration, WidgetType, EditorView} from "@codemirror/view";

class DotWidget extends WidgetType {
  toDOM() { const span = document.createElement("span"); span.textContent = "•"; return span; }
}

const dot = Decoration.widget({widget: new DotWidget(), side: 1});
```

## Ecosystem Overview (Selected)

- Core: `@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/highlight`
- Features: `@codemirror/history`, `@codemirror/search`, `@codemirror/lint`, `@codemirror/autocomplete`, `@codemirror/closebrackets`, `@codemirror/commands`, `@codemirror/gutter`
- Themes: `@codemirror/theme-one-dark`, community themes
- Languages: `@codemirror/lang-*` packages; community grammar packages
- Integrations: `@uiw/react-codemirror`, `vue-codemirror`, `y-codemirror.next`, `codemirror-lsp`

## References & Further Reading

- System Guide and API Reference: `https://codemirror.net/docs/`
- GitHub organization: `https://github.com/codemirror`
- Forum: `https://discuss.codemirror.net/`
- Lezer parser system: `https://lezer.codemirror.net/`
- React wrapper (@uiw): `https://github.com/uiwjs/react-codemirror`
- Yjs bindings: `https://github.com/yjs/y-codemirror.next`
- LSP integration (community): search for `codemirror-lsp`

— End —


