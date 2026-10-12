import sys
sys.path.insert(0, '/data/data/com.termux/files/home/termux-mcp')
from termux_mcp.mcp_core import tool_list
from termux_mcp.smart import SMART_TOOL_DEFS
out = ['# Herramientas', '', 'Top-level via name. Smart via name=smart + arguments.tool.', '']
tl = tool_list()['tools']
out.append('# === TOP-LEVEL (' + str(len(tl)) + ') ===')
for t in tl:
    out.append('## ' + t['name'])
    out.append((t.get('description') or '')[:250])
    s = t.get('inputSchema') or {}
    for k, v in (s.get('properties') or {}).items():
        req = ' REQ' if k in (s.get('required') or []) else ''
        out.append('- ' + k + ': ' + v.get('type','any') + req)
    out.append('')
out.append('# === SMART (' + str(len(SMART_TOOL_DEFS)) + ') ===')
out.append('Invocar: name=smart, arguments.tool=<nombre>, arguments.params={...}')
out.append('')
for d in SMART_TOOL_DEFS:
    out.append('## ' + d['name'] + ' [' + d.get('category','otros') + ']')
    out.append((d.get('description') or '')[:300])
    s = d.get('inputSchema') or {}
    for k, v in (s.get('properties') or {}).items():
        req = ' REQ' if k in (s.get('required') or []) else ''
        out.append('- ' + k + ': ' + v.get('type','any') + req)
    out.append('')
open('/data/data/com.termux/files/home/deepseek-termux-bridge-v2/TOOLS.md','w').write(chr(10).join(out))
print('ok', len(tl), len(SMART_TOOL_DEFS))
