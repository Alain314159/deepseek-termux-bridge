# Herramientas

Top-level via name. Smart via name=smart + arguments.tool.

# === TOP-LEVEL (84) ===
## run
Execute a shell command in Termux with streaming output. Maintains persistent cd state for this MCP session. Long jobs: use session_run/session_poll instead. Risky commands are blocked or need confirmed: true.
- cmd: string REQ
- confirmed: boolean

## system_info
Get live system stats: CPU%, RAM, disk, temperature, uptime as JSON.

## health
Run a full diagnostic: core packages, Termux:API, storage, network, permissions status.

## process_list
List running processes sorted by CPU usage.
- limit: integer

## process_kill
Terminate a process by PID.
- pid: integer REQ
- signal: integer

## ls
List directory contents.
- path: string
- detailed: boolean

## read
Read a file (first 500 lines).
- path: string REQ

## write
Write content to a file.
- path: string REQ
- content: string REQ

## mkdir
Create a directory.
- path: string REQ

## delete
Delete a file or directory. Requires confirmation for recursive deletes.
- path: string REQ
- recursive: boolean
- confirmed: boolean

## search
Find files by name pattern.
- path: string
- pattern: string

## battery
Get battery status: percentage, health, temperature, charging state.

## location
Get GPS coordinates, altitude, accuracy, speed, bearing.
- provider: string

## wifi_info
Get WiFi connection details: SSID, signal strength, IP address.

## screenshot
Take a screenshot.
- output: string

## camera_photo
Take a photo with the camera.
- camera_id: integer
- output: string

## notify
Send an Android notification.
- title: string
- content: string REQ

## sms_send
Send an SMS message.
- number: string REQ
- text: string REQ

## sms_inbox
Read SMS inbox messages.
- limit: integer

## tts_speak
Convert text to speech and play it.
- text: string REQ

## backup
Create a tar.gz backup of home directory, packages, or configs.
- target: string
- output: string

## restore
Restore from a backup file.
- file: string REQ
- target: string

## changes_list
What this server has changed recently: every file it wrote, created or deleted, newest first, each with its time and the tool that did it. Pass task_id to see one task's changes, or since for a time. Use format "json" for structures. Read-only.
- limit: integer
- since: string
- task_id: string
- format: string

## undo
Put files back to their earlier contents: a modified file is restored from the copy taken before it, a created file is removed, a deleted file comes back from the trash. Narrows by task_id, since, or a single path — undoing one task leaves everything
- task_id: string
- since: string
- limit: integer
- path: string
- confirmed: boolean

## cron_add
Schedule a recurring job (an Automation). Schedule is 5 cron fields: '0 9 * * *' = daily 9:00, '0 9 * * 1-5' = weekdays 9:00, '*/30 * * * *' = every 30 min. Output and exit code of every run are logged. Returns the job with its id.
- schedule: string REQ
- command: string REQ
- label: string

## cron_list
List scheduled jobs as JSON: id, label, schedule, command, paused, last_run, last_exit, log_tail; plus whether cron is installed and running.

## cron_remove
Remove one scheduled job by id (from cron_list), or by exact label.
- id: string
- label: string

## cloud_sync
Create or restore cloud backups with rclone integration.
- action: string
- target: string
- output: string
- file: string

## diff
Show diff between two files, or file info for a single file.
- file: string REQ
- file2: string

## open_url
Open a URL in the device browser.
- url: string REQ

## download
Download a file from a URL.
- url: string REQ
- description: string
- title: string

## public_ip
Get the device's public IP address.

## weather
Get current weather for a city.
- city: string REQ

## speedtest
Run an internet speed test.

## smart_install
Intelligently install packages with conflict detection and pre-flight checks.
- packages: string REQ
- manager: string
- dry_run: boolean

## qrcode
Generate a QR code image.
- text: string REQ
- output: string

## image_process
Process images: resize, crop, rotate via ImageMagick.
- action: string REQ
- input: string REQ
- output: string REQ
- width: integer
- height: integer

## cancel
Cancel the command currently running in this session.

## clipboard_get
Read the current clipboard content.

## clipboard_set
Set the clipboard content.
- text: string REQ

## toast
Show a brief Android toast message.
- text: string REQ

## share
Share text or a file via the Android share sheet.
- text: string
- file: string

## diagnose
Diagnose missing tools or environment issues (python, git, storage).
- intent: string

## optimize
Show performance overview: memory, disk, top processes.

## git_pr
GitHub PR operations: list, view, diff, merge, approve, create, status.
- action: string REQ
- repo: string
- number: string
- state: string
- limit: integer
- title: string
- body: string
- base: string
- method: string

## recipe_list
List saved task recipes.

## recipe_run
Run a saved recipe by id.
- recipe: string REQ

## recipe_save
Save a multi-step task as a reusable recipe.
- recipe: string REQ
- name: string REQ
- desc: string
- steps: array REQ

## context
Read the saved environment context.

## context_save
Snapshot environment context (hostname, packages, disk, cwd).

## session_start
Start (or ensure) a persistent tmux session.
- session: string

## session_run
Run a command in a tmux session WITHOUT blocking — returns immediately with initial output; poll with session_poll.
- session: string
- cmd: string REQ

## session_list
List live tmux sessions.

## session_kill
Kill a tmux session.
- session: string

## session_poll
Get new output from a running tmux session.
- session: string

## terminal_open
Open a live interactive terminal (a real PTY). The user sees it and can type into it alongside you. Use this INSTEAD OF run for anything that needs a terminal: cmatrix, vim, vi, nano, emacs, htop, top, less, more, man, fzf, lazygit, tmux, ssh, mysql,
- cmd: string
- cols: integer
- rows: integer
- confirmed: boolean

## terminal_run
Type a command into an open terminal and press Enter. Risk-checked the same way run is. Use this to launch an interactive program in an existing session.
- session: string REQ
- cmd: string REQ
- confirmed: boolean

## terminal_send
Send raw keystrokes to an open terminal — for driving a program that is waiting for input, not for running commands (use terminal_run for that). Control characters: Ctrl+C '\u0003', Ctrl+D '\u0004', Ctrl+Z '\u001a', Ctrl+L '\u000c', Escape '\u001b', 
- session: string REQ
- data: string REQ

## terminal_read
Read what an open terminal currently shows. Returns recent screen text with control sequences stripped. Prefer this over asking the user to copy output.
- session: string REQ
- max_bytes: integer

## terminal_list
List open terminal sessions and whether the user is watching.

## terminal_close
Close a terminal session, terminating its shell and any program in it.
- session: string REQ

## history
List previous task history entries.

## history_save
Save a task entry to history.
- rawInput: string REQ
- output: string REQ
- success: boolean
- ranCommand: string
- traces: array

## history_clear
Clear all task history.

## do
Do what the user asked, in their words, when this phone already knows how — locally and free. Pass their words unchanged. If it is not known, nothing runs.
- text: string REQ
- dry_run: boolean
- confirmed: boolean

## harvest
Save what you just did as a task this phone repeats with no model. Give the commands that worked; the values in them become slots it takes next time. Validated before it is saved, and it lands in the user's own library.
- steps: array REQ
- title: string
- values: object
- phrases: array
- playbook: string
- overwrite: boolean

## capsule
Move a saved task between phones as one signed file: export it, preview what someone else's would do, or install it. A preview shows the steps, what it would install and who signed it, and nothing is installed without confirmed: true.
- action: string
- playbook: string
- path: string
- sign: boolean
- signer: string
- confirmed: boolean
- overwrite: boolean

## doctor
Check this Termux install for the things that break everyday work — a missing tool, unlinked storage, a stuck package manager, no network. Read-only: it reports and names the fix, and changes nothing.
- check: string
- fix: boolean
- confirmed: boolean
- format: string

## playbooks
The library of tasks this phone runs with no model: list, read, run, or undo a run. Costs nothing, meets requirements first, verifies each step.
- playbook: string
- run: boolean
- dry_run: boolean
- with: object
- confirmed: boolean
- task_id: string
- undo: string

## text_extract
Extract text from an image via OCR (Tesseract).
- input: string REQ
- lang: string

## theme_list
List the Termux colour themes that can be applied. Use this first to find a name the user will recognise. Some names exist as both dark and light.

## theme_preview
Show what a theme looks like without applying it — one name as theme, or several at once as themes. Nothing on the device changes, and the app draws the palette for the user, so use this to offer two or three options when they have not decided. Then 
- theme: string
- themes: array
- shade: string

## theme_apply
Apply a colour theme to the user's Termux, changing how every shell on the device looks. Returns the palette so the user can see it. Needs confirmed: true — the first call returns a confirmation request to put to the user.
- theme: string REQ
- shade: string
- confirmed: boolean

## theme_revert
Undo a theme change: either restore the colours that were in place before the last one, or go back to Termux's own defaults. Needs confirmed: true.
- to: string
- confirmed: boolean

## font
Preview terminal text styles — figlet and toilet fonts — by drawing a sample word. action: "list" names what is installed (query filters); action: "preview" draws it in one or more fonts so the user can choose. Nothing is installed or changed, and no
- action: string
- text: string
- fonts: string
- query: string
- filter: string

## banner_render
Render text as a large ASCII banner with figlet. Use this rather than drawing the art yourself — the user sees the result immediately, and it can then be written to the terminal's message of the day.
- text: string REQ
- font: string

## approve
Ask the user to approve one exact action on the device itself — their fingerprint, or a dialog when no fingerprint is enrolled. Use this before a command the risk gate calls risky, so the user sees what is about to run. The approval lasts a few minut
- action: string REQ
- reason: string
- method: string

## ask
Ask the user with a real Android dialog rather than guessing — text, number, radio, sheet, spinner, checkbox, date, time or speech. Use it for a choice or a value only they know: which folder, which port, which day. Returns what they chose, or that t
- widget: string REQ
- title: string
- hint: string
- values: array
- multiline: boolean
- format: string

## run_digest
Shell command → compact digest {ok,exit,summary,facts,errors,out_ref}. Prefer over run.
- cmd: string REQ
- cwd: string
- confirmed: boolean

## out_read
More of a stored output: grep, head, tail or lines 'a-b'.
- ref: string REQ
- grep: string
- head: integer
- tail: integer
- lines: string

## context_pack
Environment summary in one call. Send etag back to get {unchanged:true}.
- etag: string
- memory_file: string
- cwd: string

## batch
Many independent read-only calls in one round trip: [{tool,params}|{cmd}].
- calls: array REQ
- stop_on_error: boolean

## tool_search
Find tools for a need; returns their schemas. Call them via smart.
- query: string REQ
- k: integer

## smart
Call any smart tool: {tool, params}. Schemas via tool_search. E.g. goal_run, service_ensure, venv_ensure, cron_ensure, web_fetch, file_find, db_query, tx_begin, undo_task.
- tool: string REQ
- params: object

# === SMART (87) ===
Invocar: name=smart, arguments.tool=<nombre>, arguments.params={...}

## run_digest [shell]
Shell command → compact digest {ok,exit,summary,facts,errors,out_ref}. Prefer over run.
- cmd: string REQ
- cwd: string
- confirmed: boolean

## out_read [shell]
More of a stored output: grep, head, tail or lines 'a-b'.
- ref: string REQ
- grep: string
- head: integer
- tail: integer
- lines: string

## context_pack [context]
Environment summary in one call. Send etag back to get {unchanged:true}.
- etag: string
- memory_file: string
- cwd: string

## batch [shell]
Many independent read-only calls in one round trip: [{tool,params}|{cmd}].
- calls: array REQ
- stop_on_error: boolean

## tool_search [context]
Find tools for a need; returns their schemas. Call them via smart.
- query: string REQ
- k: integer

## pkg_ensure [packages]
Install only missing packages (pkg|pip) and return verified versions.
- names: array REQ
- manager: string
- task_id: string

## file_edit [files]
Safe edit: find/replace, content or append; snapshot + verify + diff.
- path: string REQ
- find: string
- replace: string
- content: string
- append: string
- regex: boolean
- count: integer
- dry_run: boolean
- task_id: string

## service_ensure [services]
Keep a long-running command up (bot, web server). Starts it detached, health-checks the port, returns {up, pid, url} or the log tail and error codes.
- name: string REQ
- cmd: string
- port: integer
- cwd: string
- restart: boolean
- wait: integer

## service_stop [services]
Stop a managed service.
- name: string REQ

## port_free [services]
Show what holds a TCP port; with confirmed: true stop it and verify the port is free.
- port: integer REQ
- confirmed: boolean

## project_profile [projects]
Detect a project's language, install/run/test commands and README commands. Cached.
- path: string

## project_run [projects]
Install dependencies and run (or test) a project in one call; failures come back with error codes and known fixes.
- path: string
- install: boolean
- test: boolean
- timeout: integer
- confirmed: boolean

## briefing [diagnose]
One-glance daily status: battery and its health, free storage, package updates, services that are down, automations that failed in the last day.

## net_check [diagnose]
Network doctor: router ping, DNS time, web latency, download speed, Wi-Fi signal, with a plain-language verdict (good|slow|problem|offline) and what to do.
- speed: boolean

## services_overview [services]
Everything running: managed services (up/down, port, local URL, log tail, watched) and open public links (tunnels).

## service_watch [services]
Watchdog for a managed service: if it dies, restart it and notify. action watch|stop.
- name: string REQ
- action: string
- every_min: integer

## git_commit [git]
Commit (and optionally push) all changes in a repo. Without message returns the diff to write one; without confirmed returns a preview (branch, files). Call again with confirmed: true.
- path: string
- message: string
- push: boolean
- confirmed: boolean

## security_check [diagnose]
Check this phone's own Termux setup: termux-mcp exposure, servers reachable from the network, sshd password login, private key permissions, API keys left in your project files (masked), pending package upgrades. Read-only; each problem comes with a fix.

## storage_report [storage]
Where the phone's space goes: disk use, biggest folders (DCIM, Download, WhatsApp media, Termux), largest files, old downloads and Termux caches that can be freed. Read-only.
- top: integer
- min_mb: integer
- old_days: integer

## storage_clean [storage]
Measure then free space: apt_cache, pip_cache, npm_cache, tmp, pycache, old_logs, trash. dry_run (default) reports reclaimable size; logs/pycache go to trash (undoable).
- categories: array
- dry_run: boolean
- confirmed: boolean
- task_id: string

## git_sync [git]
Fetch + status + fast-forward pull in one call: branch, ahead/behind, dirty files.
- path: string
- pull: boolean

## intent [routing]
Route a request locally: local|choose|ai + candidate tool calls.
- text: string REQ

## fix_lookup [repair]
Tested fixes for an error code or text, ranked by success rate.
- error: string
- code: string
- cmd: string
- subject: string

## fix_apply [repair]
Apply a FixGraph fix by id and verify it. Non-safe fixes need confirmed: true.
- id: string REQ
- subject: string
- cmd: string
- confirmed: boolean
- cwd: string

## graph_query [inventory]
Ask the device graph: 'is node installed', 'version of python', 'my projects', 'services', 'cron jobs' — no probing.
- q: string REQ

## graph_refresh [inventory]
Rebuild the device graph (packages, commands, projects, services, cron).
- parts: array

## shell_lint [safety]
Check and auto-fix a command before running (brace expansion, cd chains, missing -y, sudo, PEP 668, interactive programs, risk).
- cmd: string REQ

## plan_check [safety]
Dry-run steps [{cmd}]: missing cmds/files/pkgs, busy ports, blocked.
- steps: array REQ

## tx_begin [safety]
Open a transaction; pass the returned task_id to writes so tx_rollback undoes them all.
- title: string

## tx_status [safety]
Changes recorded under a transaction.
- tx: string REQ

## tx_commit [safety]
Mark a transaction as kept.
- tx: string REQ

## tx_rollback [safety]
Undo every change of a transaction (needs confirmed: true).
- tx: string REQ
- confirmed: boolean

## answer_check [safety]
Flag claims in a final answer that no tool result backs.
- answer: string REQ
- evidence: array
- actions: array

## watch_add [automation]
Event reactor: when {battery_below, charging, wifi, at 'HH:MM', every_min, file_changed, port_down, storage_below_gb} → action {cmd} and/or {notify}. Runs forever, 0 tokens.
- when: object REQ
- action: object REQ
- name: string
- confirmed: boolean

## watch_list [automation]
List event-reactor rules.

## watch_remove [automation]
Delete an event-reactor rule.
- id: string REQ

## watch_toggle [automation]
Pause or resume a rule.
- id: string REQ
- enabled: boolean

## sandbox_run [safety]
Run a command on a throw-away copy of a folder and report exactly which files it would add/change/delete (with diffs). sandbox_apply keeps the result.
- cmd: string REQ
- path: string
- timeout: integer

## sandbox_apply [safety]
Apply a sandbox's changes (undoable).
- sandbox: string REQ
- confirmed: boolean
- task_id: string

## sandbox_discard [safety]
Throw a sandbox away.
- sandbox: string REQ

## explain_cmd [help]
Explain a shell command part by part (commands, flags, pipes, redirects, risk) with no model.
- cmd: string REQ

## snapshot_env [backup]
Save a portable twin of this Termux: packages, pip/npm globals, dotfiles, cron, services.
- name: string

## restore_env [backup]
Restore a twin on this phone. dry_run (default) shows the plan.
- file: string REQ
- dry_run: boolean
- confirmed: boolean
- parts: array

## screen_ocr [media]
Read text (and QR/barcodes) from the screen or an image on the device — no AI vision.
- image: string
- lang: string

## camera_scan [media]
Take a photo and read QR/barcodes and text from it on the device.
- camera: integer
- lang: string
- image: string

## notify_ask [device]
Ask the user through an Android notification with up to 3 buttons and wait for the tap.
- question: string REQ
- options: array
- timeout: integer
- title: string

## recipe_share [automation]
Share playbooks as signed capsules: action export (id) | preview (file) | import (file).
- action: string REQ
- id: string
- file: string
- sign: boolean
- confirmed: boolean

## cost_meter [context]
Tokens and AI calls saved by digests and local routing (overall or per task_id).
- task_id: string
- reset: boolean

## health_watch [diagnose]
Device health report: action run (check now) | report (last stored, no probing) | enable (daily at 'at') | disable.
- action: string
- at: string

## task_start [tasks]
Run any smart tool as a background task (long builds, backups, twins). Returns task id.
- tool: string REQ
- params: object

## task_status [tasks]
Status (and result when done) of a task.
- task: string REQ

## task_list [tasks]
Recent background tasks.

## digest_text [shell]
Digest output a client already has (e.g. a streamed run): stores the full text and returns the compact digest with out_ref.
- cmd: string
- text: string REQ
- exit: integer

## learn_propose [learning]
Turn a finished task into a replayable playbook draft: failed/exploratory steps dropped, values become slots, a verify step kept. From steps [{cmd,ok}] or a task_id.
- steps: array
- task_id: string
- title: string
- request: string

## learn_save [learning]
Save a learn_propose draft as a playbook; the phrase then replays it with no AI.
- draft_id: string REQ
- title: string
- phrases: array
- overwrite: boolean

## fix_learn [repair]
Record a fix that worked for an error FixGraph did not know; promoted after 2 successes.
- error: string
- code: string
- fix: array REQ
- verify: string
- worked: boolean
- desc: string

## fix_share [repair]
Learned fixes: action list | export (file) | import (file, confirmed).
- action: string REQ
- file: string
- confirmed: boolean

## plan_cache_get [learning]
Cached plan for a request on this device (0 AI if hit).
- request: string REQ

## plan_cache_put [learning]
Cache the steps that fulfilled a request so the same request replays with no AI.
- request: string REQ
- steps: array REQ
- verify: string

## plan_replay [learning]
Replay a cached plan (or given steps): plan_check first, stop at the first failure.
- request: string
- steps: array
- confirmed: boolean
- task_id: string

## prompt_pack [context]
Only the rules and tools a task type needs (install|git|files|services|device|automation|data|media|remote), or classify from text.
- task_type: string
- text: string

## goal_run [autonomy]
Finish a goal server-side: plan_check → steps in one transaction → one auto-fix per failure → verify → commit, or roll back and return a decision. Budget: {steps, minutes, fixes}.
- goal: string
- steps: array
- verify: array
- budget: object
- confirmed: boolean
- rollback: boolean
- dry_run: boolean

## policy_get [safety]
The device policy (paths, tools, network, pip).

## policy_set [safety]
Change the device policy: deny_paths, allow_paths, deny_tools, network, pip (any|venv_only), sandbox_unknown_scripts. Loosening needs on-device approval.
- policy: object REQ
- replace: boolean
- confirmed: boolean

## cap_issue [safety]
Issue a scoped, expiring token for an external MCP client: tools, paths, read_only, ttl_min.
- tools: array
- paths: array
- read_only: boolean
- ttl_min: integer
- label: string
- confirmed: boolean

## cap_list [safety]
Capability tokens and their scopes.

## cap_revoke [safety]
Revoke a capability token by id (or 'all').
- id: string REQ

## timeline [safety]
Changes grouped by task, newest first — any of them can be undone with undo_task.
- limit: integer

## undo_task [safety]
Undo every change of one past task (warns if later tasks touched the same files).
- task: string REQ
- confirmed: boolean

## metrics [diagnose]
Per-tool latency (p50/p95), error rates, error codes and fix success rates.
- reset: boolean

## venv_ensure [packages]
Project Python venv (.venv) + requirements, reinstalled only when they change.
- path: string REQ
- python: string
- requirements: string

## node_ensure [packages]
Node installed (optionally a major version / lts) and a project's deps up to date.
- path: string
- version: string
- confirmed: boolean

## proot_ensure [packages]
A proot-distro Linux (debian, ubuntu, …) for packages Termux lacks.
- distro: string
- confirmed: boolean

## proot_run [packages]
Run a command inside a proot distro; digest back.
- distro: string
- cmd: string REQ
- timeout: integer
- confirmed: boolean

## cron_ensure [automation]
Idempotent cron job with log capture and verification: action ensure|remove|list.
- name: string
- spec: string
- cmd: string
- action: string
- confirmed: boolean

## tunnel [services]
Expose a local port with a time-limited public URL (cloudflared or ssh): action open|list|stop.
- port: integer
- action: string
- minutes: integer
- provider: string
- id: string
- confirmed: boolean

## web_fetch [network]
Fetch a URL as readable text (article/main or a CSS selector: tag, #id, .class); JSON pretty-printed. Long pages → out_ref.
- url: string REQ
- selector: string
- max_chars: integer

## db_query [data]
SQL on an SQLite file or a CSV (table t); read-only unless write+confirmed; table digest.
- path: string REQ
- sql: string REQ
- limit: integer
- write: boolean
- confirmed: boolean

## log_watch [automation]
Regex over a log: action scan (now) | watch (reactor fires on new matches: notify/cmd) | stop.
- path: string
- pattern: string
- action: string
- notify: string
- cmd: string
- name: string
- id: string
- confirmed: boolean

## file_find [files]
Indexed file search by name (or glob) or content, with ext / newer_than_days / larger_than_mb filters.
- query: string
- path: string
- kind: string
- ext: string
- newer_than_days: number
- larger_than_mb: number
- limit: integer
- refresh: boolean

## backup_incremental [backup]
Incremental, deduplicated backups: action backup|list|verify|restore. Encrypted with restic when a password is given.
- action: string
- src: string
- dest: string
- snapshot: string
- target: string
- password: string
- full: boolean
- confirmed: boolean

## clipboard_pipe [device]
Android clipboard: direction get | set (text or file) | to_file (file).
- direction: string
- text: string
- file: string
- max_chars: integer

## share_to [device]
Open the Android share sheet for a file or text, or open a URL.
- path: string
- text: string
- url: string
- action: string
- title: string

## doc_tool [media]
Documents and photos: pdf_merge (inputs -> output.pdf), images_to_pdf, image_compress (inputs -> output dir, quality, max_width), pdf_text (extract text). Missing packages come back as fixes.
- action: string REQ
- inputs: array REQ
- output: string
- quality: integer
- max_width: integer
- overwrite: boolean

## media_convert [media]
ffmpeg presets: audio, compress, mp4, gif, thumbnail, resize, trim; background: true runs it as a task, action status shows the percent.
- input: string
- output: string
- preset: string
- start: string
- duration: string
- crf: integer
- width: integer
- fps: integer
- overwrite: boolean
- action: string
- background: boolean

## ssh_hosts [remote]
Saved SSH hosts: action list|add|remove.
- action: string
- name: string
- host: string
- user: string
- port: integer
- key: string

## ssh_run [remote]
Run a command on a saved host (or user@host) with key auth; digest back.
- host: string REQ
- cmd: string REQ
- timeout: integer
- confirmed: boolean
