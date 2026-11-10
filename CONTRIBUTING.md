# Contributing

Thank you for looking. A few things to know first.

- **The code here comes from the CadCraft apps.** `cli/apps/` holds each app's own modules, copied when the package is built; the
  tools themselves are in `mcp/` and `cli/`. A fix to how an app reads or writes a file belongs in that app's repo
  (github.com/getcadcraft/<app>); a fix to a tool, the server or the command line belongs here.
- **Pull requests run the Tests workflow** (`npm test` on Linux, Windows and macOS with Node 20, 22 and 24, then the same test on
  the packed package installed into an empty folder). Run `npm test` before you send one.
- **Rules every tool keeps:** no AI inside, nothing sent anywhere, files only in the folders given with `--root`, read only unless
  `--allow` says otherwise, every edit one undo step, every call in the log. A change that breaks one of these is not taken.
- **Test files** in `fixtures/` must be your own or openly licensed; never a client's drawing.
- Contributions are under Apache-2.0, the license of this repo.

Questions: open an issue, or the CadCraft Discord (https://getcadcraft.com).
