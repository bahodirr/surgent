### Search tooling

- Files: `fd <pattern> <dir>`
- Text: `rg -n -S "<text>" <dir>`
- TS/TSX structure: `ast-grep --lang ts[x] -p "<pattern>" <dir>`

### Style

- Keep fixes minimal and readable; avoid adding complexity unless it solves a real problem.


-Plase dont do extra type checkes and type conversion unless there is issue in lint. do not overengineer types. Just write concise elegant minimalistic code.

-Use shadcn/ui for UI styling.

-Always use bun for package management.

-Never use as unknown as any cast.