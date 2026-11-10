# @getcadcraft/mcp

CadCraft's tools for AI assistants and scripts: an MCP server (`cadcraft-mcp`, stdio) and a command line (`cadcraft`). They run the
CadCraft apps' own code with no window: DWG and DXF drawings (CadCraft), IFC models (BimCraft), CivilCraft sites, PartCraft parts,
takeoffs (TakeoffCraft) and PDF markups (MarkupCraft). The apps contain no AI; your assistant brings its own, and you decide what it
may touch. Node.js 20.19 or newer.

## MCP server

    npx -y @getcadcraft/mcp --root ~/Drawings --allow read,edit

- `--root <folder>` (repeat for more): the only folders it opens files in and writes to. Without one, no file is reachable.
- `--allow`: read (default) · edit (run commands and scripts; each call one undo step) · save (write files) · export (PDF, SVG, conversions, CSV/XLSX, LandXML, STL/3MF/STEP, OpenUSD, PartCraft manuals).
- `--log activity.jsonl`: every call as a JSON line. Environment: `CADCRAFT_MCP_ROOTS`, `CADCRAFT_MCP_ALLOW`.

## Connect to CadCraft Studio (the apps' windows)

    npx -y @getcadcraft/mcp setup           # finds your AI apps, shows what it will write, asks first
    npx -y @getcadcraft/mcp setup --list    # what it looked for
    npx -y @getcadcraft/mcp unsetup         # takes CadCraft out of their settings again
    npx -y @getcadcraft/mcp openapi > cadcraft-tools.openapi.json   # the same tools as an OpenAPI 3.1 description

`setup` adds one entry, `npx -y @getcadcraft/mcp connect`, to the settings of the AI apps it finds on your computer (the setup cards on
getcadcraft.com/connect-ai list them). That entry holds no password; CadCraft Studio keeps its connection secret in a file only you
can read, and `connect` reads it each time. Open CadCraft Studio, then ask your AI: "Use the CadCraft tools: list the apps you can
reach." The tools are named by app (`cad_…`, `bim_…`, `model_…`, `markup_…`, `takeoff_…`, `civil_…`, `detail_…`, `part_…`); each app
has its own Read / Suggest / Edit / Save / Export switches in Studio.

In your assistant's MCP settings, add it as a stdio server: `{"mcpServers": {"cadcraft": {"command": "npx", "args": ["-y", "@getcadcraft/mcp", "--root", "/Users/me/Drawings"]}}}`

What your assistant reads goes to whoever runs that assistant: a cloud assistant's maker sees the parts of the files it is shown.
Keep folders out of `--root` when that matters.

## Command line

    cadcraft info plan.dwg
    cadcraft run cleanup.scr plan.dwg -o plan-clean.dwg
    cadcraft convert plan.dwg plan.dxf --version 2018
    cadcraft convert *.dwg out --to dxf
    cadcraft plot plan.dwg plan.pdf --all
    cadcraft check *.dwg --rules rules.json
    cadcraft convert site.civilcraft.json site.xml
    cadcraft convert bracket.partcraft.json bracket.stl
    cadcraft convert bracket.partcraft.json bracket.usdz
    cadcraft convert linkage.partcraft-manual.json linkage.pdf
    cadcraft count kitchen.dwg --block SHELF-18X48 --sheet K-101
    cadcraft tools

`--json` on any command; exit codes 0 ok, 1 problems, 2 bad usage. `cadcraft tools` lists every tool and which ones need the app
open in CadCraft Studio. Apache-2.0. https://getcadcraft.com
