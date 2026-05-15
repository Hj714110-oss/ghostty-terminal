import { useState, useRef, useEffect, useCallback } from “react”;

// ═══════════════════════════════════════════════════════════
//  VIRTUAL FILE SYSTEM
// ═══════════════════════════════════════════════════════════
const useFS = () => {
const files = useRef({
“README.md”: “# Mobile Terminal\nGhostty-style terminal for iPhone\n”,
“.zshrc”: “export PATH=$PATH:/usr/local/bin\nalias ll=‘ls -la’\n”,
});
return {
write: (p, c) => { files.current[p] = c; },
read:  (p)    => files.current[p] ?? null,
list:  ()     => Object.keys(files.current),
del:   (p)    => { delete files.current[p]; },
exists:(p)    => p in files.current,
dump:  ()     => ({ …files.current }),
};
};

// ═══════════════════════════════════════════════════════════
//  SANDBOXED JS EXECUTOR
// ═══════════════════════════════════════════════════════════
function execJS(code) {
return new Promise(resolve => {
const iframe = document.createElement(“iframe”);
iframe.style.cssText = “display:none;position:absolute;width:0;height:0”;
document.body.appendChild(iframe);
const timer = setTimeout(() => {
try { document.body.removeChild(iframe); } catch(*){}
resolve({ out: “”, err: “Timeout (5s)” });
}, 5000);
try {
const w = iframe.contentWindow;
w.eval(`var __L=[];var __c=console.log;console.log=function(){__L.push(Array.from(arguments).map(function(x){try{return typeof x==='object'?JSON.stringify(x,null,2):String(x);}catch(e){return String(x);}}).join(' '));};console.error=console.warn=console.log;`);
w.eval(code);
const out = w.eval(”__L.join(’\n’)”);
clearTimeout(timer);
document.body.removeChild(iframe);
resolve({ out: out || “(no output)”, err: null });
} catch(e) {
clearTimeout(timer);
try { document.body.removeChild(iframe); } catch(*){}
resolve({ out: “”, err: e.message });
}
});
}

function execPython(code) {
let js = code
.replace(/print(f”(.*?)”)/g,  (_,s)=>`console.log(\`${s.replace(/{(.*?)}/g,’${$1}’)}`)`) .replace(/print\(f'(.*?)'\)/g,  (_,s)=>`console.log(`${s.replace(/{(.*?)}/g,’${$1}’)}`)`)
.replace(/print((.*?))\s*$/gm, “console.log($1)”)
.replace(/True/g,“true”).replace(/False/g,“false”).replace(/None/g,“null”)
.replace(/elif /g,“else if “).replace(/**/g,”**”);
const lines = js.split(”\n”);
const out = []; const stack = [0];
for (const raw of lines) {
const ind = raw.search(/\S/);
if (ind < 0) { out.push(””); continue; }
while (stack[stack.length-1] > ind) { stack.pop(); out.push(”}”); }
const trim = raw.trim();
out.push(raw);
if (trim.endsWith(”:”) && !trim.startsWith(”#”)) {
out[out.length-1] = raw.replace(/:$/, “ {”);
stack.push(ind + 2);
}
}
while (stack.length > 1) { stack.pop(); out.push(”}”); }
return execJS(out.join(”\n”));
}

// ═══════════════════════════════════════════════════════════
//  SHELL SIMULATOR
// ═══════════════════════════════════════════════════════════
function runShell(cmd, fs) {
const [prog, …args] = cmd.trim().split(/\s+/);
const CWD = “/Users/mobile/Desktop”;
switch(prog) {
case “ls”:    return fs.list().join(”  “) || “(empty)”;
case “ll”:    return fs.list().map(f=>`-rw-r--r--  1 mobile  staff  ${fs.read(f).length}  ${f}`).join(”\n”) || “(empty)”;
case “pwd”:   return CWD;
case “echo”:  return args.join(” “);
case “cat”: {
const c = fs.read(args[0]);
return c !== null ? c : `cat: ${args[0]}: No such file or directory`;
}
case “rm”:    if(fs.exists(args[0])){fs.del(args[0]);return “”;}return `rm: ${args[0]}: No such file`;
case “touch”: fs.write(args[0],””); return “”;
case “mkdir”: return `mkdir: ${args[0]}: created`;
case “cp”:    if(fs.exists(args[0])){fs.write(args[1],fs.read(args[0]));return “”;}return `cp: ${args[0]}: No such file`;
case “mv”:    if(fs.exists(args[0])){fs.write(args[1],fs.read(args[0]));fs.del(args[0]);return “”;}return `mv: ${args[0]}: No such file`;
case “grep”:  {
const pat=args[0]; const fname=args[1];
if(!fname) return “usage: grep pattern file”;
const c=fs.read(fname); if(!c) return `grep: ${fname}: No such file`;
return c.split(”\n”).filter(l=>l.includes(pat)).join(”\n”) || “(no match)”;
}
case “wc”:    {
const c=fs.read(args[args.length-1])||””;
return `${c.split("\n").length}\t${c.split(/\s+/).filter(Boolean).length}\t${c.length}\t${args[args.length-1]}`;
}
case “clear”: return “**CLEAR**”;
case “date”:  return new Date().toString();
case “whoami”:return “mobile”;
case “hostname”:return “iPhone-Air”;
case “uname”: return args[0]===”-a”?“Darwin iPhone-Air 24.0.0 arm64 (Ghostty Mobile)”:“Darwin”;
case “uptime”:return `${new Date().toLocaleTimeString()}  up 3 days, 14:22, 1 user, load averages: 0.12 0.08 0.05`;
case “env”:   return “PATH=/usr/local/bin:/usr/bin:/bin\nHOME=/Users/mobile\nSHELL=/bin/zsh\nTERM=ghostty”;
case “history”:return “(session history not persisted)”;
case “curl”:  return `curl: (6) Could not resolve host: ${args[args.length-1]} (sandbox)`;
case “ping”:  return `PING ${args[args.length-1]}: 56 data bytes\n--- ${args[args.length-1]} ping statistics ---\nRequest timeout (sandbox)`;
case “which”: {
const bins=[“node”,“python3”,“git”,“curl”,“grep”,“ls”,“cat”];
return bins.includes(args[0])?`/usr/bin/${args[0]}`:`${args[0]} not found`;
}
case “node”:  return “Node.js v22.4.0 — use ‘run js <code>’”;
case “python3”:return “Python 3.12.4 — use ‘run python <code>’”;
case “git”:   {
const sub=args[0];
if(sub===“status”) return “On branch main\nnothing to commit, working tree clean”;
if(sub===“log”) return “commit a3f9c2e (HEAD -> main)\nAuthor: mobile [mobile@iphone](mailto:mobile@iphone)\nDate: “+new Date().toDateString()+”\n\n    Initial commit”;
if(sub===“init”) return “Initialized empty Git repository”;
return `git: '${sub}' — sandbox mode`;
}
case “help”:
case “?”:
return `Ghostty Mobile — available commands: Files:    ls  ll  cat  cp  mv  rm  touch  mkdir  grep  wc System:   pwd  echo  date  whoami  hostname  uname  uptime  env  which Dev:      node  python3  git  curl  ping Terminal: clear  history  help AI:       /claude  /gemini  /openai  /codex  /copilot  /opencode`;
case “/claude”:  return “**SWITCH_CLAUDE**”;
case “/gemini”:  return “**SWITCH_GEMINI**”;
case “/openai”:  return “**SWITCH_OPENAI**”;
case “/codex”:   return “**SWITCH_CODEX**”;
case “/copilot”: return “**SWITCH_COPILOT**”;
case “/opencode”:return “**SWITCH_OPENCODE**”;
default: return `${prog}: command not found\nType 'help' for available commands`;
}
}

// ═══════════════════════════════════════════════════════════
//  AI PROFILES
// ═══════════════════════════════════════════════════════════
const AI_PROFILES = {
claude: {
id: “claude”, name: “Claude Code”, version: “v2.1.66”,
accent: “#e8700a”, accentDim: “rgba(232,112,10,0.15)”,
prompt: “claude”,
mascot: “🤖”,
welcome: “Welcome back!”,
subtitle: “Opus 4.6 · API Usage Billing”,
system: `You are Claude Code — Anthropic's agentic coding assistant in a mobile terminal. You have tools to write/read files, execute JS/Python, run shell commands, render HTML. Be concise. Use tools to actually DO things. Terminal style — no markdown headers. After tool calls, give brief human-readable summary.`,
},
gemini: {
id: “gemini”, name: “Gemini CLI”, version: “v2.5-flash”,
accent: “#4d9de0”, accentDim: “rgba(77,157,224,0.15)”,
prompt: “gemini”,
mascot: “✦”,
welcome: “Gemini CLI ready”,
subtitle: “gemini-2.5-flash · MCP enabled”,
system: `You are Gemini CLI — Google's terminal AI assistant. You have tools to write/read files, execute JS/Python, run shell commands, render HTML. Be concise. Use tools to DO things. Respond in terminal style.`,
},
openai: {
id: “openai”, name: “OpenAI Codex”, version: “codex-1”,
accent: “#10a37f”, accentDim: “rgba(16,163,127,0.15)”,
prompt: “codex”,
mascot: “⬡”,
welcome: “Codex terminal ready”,
subtitle: “codex-1 · Code generation”,
system: `You are OpenAI Codex CLI — a code-focused terminal assistant. You have tools to write/read files, execute JS/Python, run shell commands, render HTML. Specialize in code generation. Be concise. Use tools to DO things.`,
},
copilot: {
id: “copilot”, name: “GitHub Copilot CLI”, version: “1.0”,
accent: “#6e40c9”, accentDim: “rgba(110,64,201,0.15)”,
prompt: “gh-copilot”,
mascot: “◈”,
welcome: “Copilot CLI connected”,
subtitle: “GitHub · gh extension”,
system: `You are GitHub Copilot CLI — an AI coding assistant integrated with GitHub. You have tools to write/read files, execute JS/Python, run shell commands, render HTML. Focus on git workflows, code review, and GitHub operations. Use tools to DO things.`,
},
opencode: {
id: “opencode”, name: “OpenCode”, version: “v0.1”,
accent: “#f59e0b”, accentDim: “rgba(245,158,11,0.15)”,
prompt: “opencode”,
mascot: “◉”,
welcome: “OpenCode initialized”,
subtitle: “open-source · local models”,
system: `You are OpenCode — an open-source terminal coding assistant. You have tools to write/read files, execute JS/Python, run shell commands, render HTML. Be concise, developer-focused. Use tools to DO things. No fluff.`,
},
};

// ═══════════════════════════════════════════════════════════
//  TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════
const TOOLS = [
{ name:“write_file”, description:“Write content to virtual filesystem”,
input_schema:{ type:“object”, properties:{ filename:{type:“string”}, content:{type:“string”} }, required:[“filename”,“content”] } },
{ name:“read_file”,  description:“Read file from virtual filesystem”,
input_schema:{ type:“object”, properties:{ filename:{type:“string”} }, required:[“filename”] } },
{ name:“list_files”, description:“List all files”,
input_schema:{ type:“object”, properties:{} } },
{ name:“run_code”,   description:“Execute JavaScript or Python code. Returns stdout.”,
input_schema:{ type:“object”, properties:{ language:{type:“string”,enum:[“javascript”,“python”,“js”,“py”]}, code:{type:“string”} }, required:[“language”,“code”] } },
{ name:“run_shell”,  description:“Run shell command (ls, cat, echo, git, etc.)”,
input_schema:{ type:“object”, properties:{ command:{type:“string”} }, required:[“command”] } },
{ name:“render_html”,description:“Render interactive HTML/CSS/JS in preview pane”,
input_schema:{ type:“object”, properties:{ html:{type:“string”}, title:{type:“string”} }, required:[“html”] } },
];

// ═══════════════════════════════════════════════════════════
//  SYNTAX HIGHLIGHTER
// ═══════════════════════════════════════════════════════════
function hl(line, accent=”#4ade80”) {
return line
.replace(/&/g,”&”).replace(/</g,”<”).replace(/>/g,”>”)
.replace(/\b(def|return|import|from|class|if|elif|else|for|while|in|and|or|not|pass|break|continue|lambda|with|as|try|except|finally|raise|async|await|function|const|let|var|new|this|typeof|instanceof|export|default)\b/g,
`<span style="color:#60a5fa">$1</span>`)
.replace(/(#[^\n]*|//[^\n]*)/g, `<span style="color:#4b5563;font-style:italic">$1</span>`)
.replace(/(”(?:[^”\]|\.)*”|’(?:[^’\]|\.)*’|`(?:[^`\]|\.)*`)/g, `<span style="color:${accent}">$1</span>`) .replace(/\b(\d+\.?\d*)\b/g, `<span style="color:#fbbf24">$1</span>`);
}

// ═══════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
export default function GhosttyTerminal() {
const [activeAI, setActiveAI] = useState(“claude”);
const profile = AI_PROFILES[activeAI];

const [sessions, setSessions] = useState({
claude:[]  , gemini:[], openai:[], copilot:[], opencode:[]
});
const [apiHistory, setApiHistory] = useState({
claude:[], gemini:[], openai:[], copilot:[], opencode:[]
});

const entries    = sessions[activeAI];
const history    = apiHistory[activeAI];

const [input, setInput]       = useState(””);
const [loading, setLoading]   = useState(false);
const [cmdHist, setCmdHist]   = useState([]);
const [cmdIdx, setCmdIdx]     = useState(-1);
const [preview, setPreview]   = useState(null);
const [showPreview, setShowPreview] = useState(false);
const [showSwitcher, setShowSwitcher] = useState(false);
const [tabs, setTabs]         = useState([“main”]);
const [activeTab, setActiveTab] = useState(“main”);

const fs       = useFS();
const scrollRef= useRef(null);
const inputRef = useRef(null);

const addEntry = useCallback((type, data, ai=null) => {
const target = ai || activeAI;
setSessions(prev => ({
…prev,
[target]: […prev[target], { id: Date.now()+Math.random(), type, data }]
}));
}, [activeAI]);

useEffect(() => {
// boot sequence
if (sessions.claude.length === 0) {
addEntry(“boot”, { profile: AI_PROFILES.claude }, “claude”);
}
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

useEffect(() => {
scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior:“smooth” });
}, [sessions, activeAI]);

// ── Tool Executor ──────────────────────────────────────
const execTool = useCallback(async (name, inp) => {
switch(name) {
case “write_file”: {
fs.write(inp.filename, inp.content);
addEntry(“tool_write”, { filename:inp.filename, content:inp.content });
return `Written '${inp.filename}' (${inp.content.length} bytes)`;
}
case “read_file”: {
const c = fs.read(inp.filename);
if(c===null) return `Error: '${inp.filename}' not found`;
addEntry(“tool_read”, { filename:inp.filename, content:c });
return c;
}
case “list_files”: {
const list = fs.list();
addEntry(“tool_ls”, { files:list });
return list.join(”\n”) || “(empty)”;
}
case “run_code”: {
const lang = inp.language.toLowerCase();
addEntry(“tool_running”, { language:lang, code:inp.code });
const r = (lang===“python”||lang===“py”) ? await execPython(inp.code) : await execJS(inp.code);
addEntry(“tool_output”, { out:r.out, err:r.err });
return r.err ? `${r.out}\nERROR: ${r.err}` : r.out;
}
case “run_shell”: {
const result = runShell(inp.command, fs);
if(result===”**CLEAR**”) { setSessions(p=>({…p,[activeAI]:[]})); return “cleared”; }
addEntry(“tool_shell”, { cmd:inp.command, out:result });
return result;
}
case “render_html”: {
setPreview({ html:inp.html, title:inp.title||“Preview” });
setShowPreview(true);
addEntry(“tool_preview”, { title:inp.title||“Preview” });
return “Rendered in preview panel”;
}
default: return `Unknown tool: ${name}`;
}
}, [addEntry, activeAI, fs]);

// ── AI Send ────────────────────────────────────────────
const sendAI = useCallback(async (text) => {
const newHist = […history, { role:“user”, content:text }];
let msgs = newHist;

```
for (let i=0; i<8; i++) {
  addEntry("thinking", {});
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({
      model:"claude-sonnet-4-20250514",
      max_tokens:1000,
      system: profile.system,
      tools: TOOLS,
      messages: msgs,
    }),
  });
  const data = await resp.json();
  setSessions(p=>({ ...p, [activeAI]: p[activeAI].filter(e=>e.type!=="thinking") }));

  if(!data.content) { addEntry("error",{text:data.error?.message||"API error"}); break; }

  const texts = data.content.filter(b=>b.type==="text");
  const tools = data.content.filter(b=>b.type==="tool_use");
  if(texts.length) {
    const t = texts.map(b=>b.text).join("\n").trim();
    if(t) addEntry("ai_text", { text:t });
  }
  msgs = [...msgs, { role:"assistant", content:data.content }];
  if(data.stop_reason==="end_turn"||!tools.length) break;

  const results = [];
  for(const tb of tools) {
    addEntry("tool_call",{ name:tb.name, input:tb.input });
    const r = await execTool(tb.name, tb.input);
    results.push({ type:"tool_result", tool_use_id:tb.id, content:String(r) });
  }
  msgs = [...msgs, { role:"user", content:results }];
}
setApiHistory(p=>({ ...p, [activeAI]: msgs }));
```

}, [history, activeAI, addEntry, execTool, profile.system]);

// ── Send handler ───────────────────────────────────────
const handleSend = useCallback(async () => {
const text = input.trim();
if(!text||loading) return;
setInput(””); setLoading(true);
setCmdHist(h=>[text,…h.slice(0,49)]); setCmdIdx(-1);
addEntry(“user_input”,{text});

```
// Check shell commands first
const firstWord = text.split(/\s+/)[0].toLowerCase();
const shellCmds = ["ls","ll","cat","pwd","echo","rm","touch","mkdir","cp","mv","grep","wc","clear","date","whoami","hostname","uname","uptime","env","which","node","python3","git","curl","ping","help","?","/claude","/gemini","/openai","/codex","/copilot","/opencode"];

if(shellCmds.includes(firstWord)) {
  const result = runShell(text, fs);
  if(result==="__CLEAR__") { setSessions(p=>({...p,[activeAI]:[]})); }
  else if(result.startsWith("__SWITCH_")) {
    const target = result.replace("__SWITCH_","").replace("__","").toLowerCase();
    const map = { claude:"claude",gemini:"gemini",openai:"openai",codex:"openai",copilot:"copilot",opencode:"opencode" };
    const ai = map[target]||target;
    if(AI_PROFILES[ai]) {
      setActiveAI(ai);
      if(sessions[ai]?.length===0) {
        setTimeout(()=>addEntry("boot",{profile:AI_PROFILES[ai]},ai),50);
      }
      addEntry("system_msg",{text:`Switched to ${AI_PROFILES[ai].name}`});
    }
  }
  else addEntry("shell_out",{cmd:text,out:result});
  setLoading(false); return;
}

// Send to AI
try { await sendAI(text); }
catch(e) { addEntry("error",{text:e.message}); }
setLoading(false);
```

}, [input, loading, addEntry, activeAI, fs, sendAI, sessions]);

const handleKey = (e) => {
if(e.key===“Enter”&&!e.shiftKey) { e.preventDefault(); handleSend(); }
else if(e.key===“ArrowUp”) { e.preventDefault(); const i=Math.min(cmdIdx+1,cmdHist.length-1); setCmdIdx(i); setInput(cmdHist[i]||””); }
else if(e.key===“ArrowDown”) { e.preventDefault(); const i=Math.max(cmdIdx-1,-1); setCmdIdx(i); setInput(i===-1?””:cmdHist[i]||””); }
};

// ══════════════════════════════════════════════════════
//  RENDER ENTRY
// ══════════════════════════════════════════════════════
const renderEntry = (e) => {
const { id, type, data } = e;
const ac = profile.accent;

```
switch(type) {
  case "boot": return (
    <div key={id} style={{ marginBottom:12 }}>
      {/* Welcome panel - Claude Code style */}
      <div style={{
        border:`1px solid ${data.profile.accent}`, borderRadius:6,
        overflow:"hidden", marginBottom:8,
      }}>
        <div style={{
          padding:"3px 10px", borderBottom:`1px solid ${data.profile.accent}`,
          display:"flex", alignItems:"center", gap:8,
        }}>
          <span style={{ color:data.profile.accent, fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:700 }}>
            {data.profile.name}
          </span>
          <span style={{ color:data.profile.accent, fontFamily:"'JetBrains Mono',monospace", fontSize:11, opacity:0.7 }}>
            {data.profile.version}
          </span>
        </div>
        <div style={{ display:"flex" }}>
          {/* Left panel */}
          <div style={{ flex:"0 0 42%", padding:"12px 14px", borderRight:`1px solid ${data.profile.accent}22` }}>
            <div style={{ color:"#e2e8f0", fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:700, marginBottom:10 }}>
              {data.profile.welcome}
            </div>
            <div style={{ fontSize:28, marginBottom:8, filter:`drop-shadow(0 0 8px ${data.profile.accent})` }}>
              {data.profile.mascot}
            </div>
            <div style={{ color:"#6b7a8d", fontFamily:"'JetBrains Mono',monospace", fontSize:10, lineHeight:1.5 }}>
              {data.profile.subtitle}
            </div>
          </div>
          {/* Right panel */}
          <div style={{ flex:1, padding:"12px 14px" }}>
            <div style={{ color:data.profile.accent, fontFamily:"'JetBrains Mono',monospace", fontSize:11, fontWeight:700, marginBottom:6 }}>
              Tips for getting started
            </div>
            <div style={{ color:"#8892a4", fontFamily:"'JetBrains Mono',monospace", fontSize:11, lineHeight:1.7 }}>
              <div>Run /init to create config file</div>
              <div>Type <span style={{color:data.profile.accent}}>help</span> for commands</div>
              <div>Use <span style={{color:"#60a5fa"}}>/claude /gemini /openai</span> to switch AI</div>
            </div>
            <div style={{ borderTop:`1px solid #1e2433`, marginTop:8, paddingTop:8 }}>
              <div style={{ color:data.profile.accent, fontFamily:"'JetBrains Mono',monospace", fontSize:11, fontWeight:700, marginBottom:4 }}>
                Recent activity
              </div>
              <div style={{ color:"#4b5563", fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}>No recent activity</div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ color:"#6b7a8d", fontFamily:"'JetBrains Mono',monospace", fontSize:12 }}>
        Welcome to {data.profile.name} {data.profile.version}
      </div>
    </div>
  );

  case "user_input": return (
    <div key={id} style={{ display:"flex", gap:6, marginBottom:5, alignItems:"flex-start" }}>
      <span style={{ color:ac, fontFamily:"'JetBrains Mono',monospace", fontSize:13, flexShrink:0, marginTop:1 }}>&gt;</span>
      <span style={{ color:"#e2e8f0", fontFamily:"'JetBrains Mono',monospace", fontSize:13, wordBreak:"break-all" }}>{data.text}</span>
    </div>
  );

  case "thinking": return (
    <div key={id} style={{ display:"flex", gap:8, alignItems:"center", marginBottom:4 }}>
      <span style={{ color:ac, fontFamily:"'JetBrains Mono',monospace", fontSize:12, animation:"spin 1s linear infinite", display:"inline-block" }}>◌</span>
      <span style={{ color:"#4b5563", fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontStyle:"italic" }}>Thinking…</span>
    </div>
  );

  case "ai_text": return (
    <div key={id} style={{ display:"flex", gap:6, marginBottom:6, alignItems:"flex-start" }}>
      <span style={{ color:ac, fontFamily:"'JetBrains Mono',monospace", fontSize:13, flexShrink:0, marginTop:1 }}>{profile.mascot}</span>
      <span style={{ color:"#e2e8f0", fontFamily:"'JetBrains Mono',monospace", fontSize:13, lineHeight:1.65, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{data.text}</span>
    </div>
  );

  case "system_msg": return (
    <div key={id} style={{ color:"#6b7a8d", fontFamily:"'JetBrains Mono',monospace", fontSize:11, fontStyle:"italic", marginBottom:4, padding:"3px 8px", background:"rgba(255,255,255,0.03)", borderRadius:4 }}>
      ── {data.text} ──
    </div>
  );

  case "shell_out": return (
    <div key={id} style={{ marginBottom:6 }}>
      <pre style={{ color:"#9ca3af", fontFamily:"'JetBrains Mono',monospace", fontSize:12, margin:0, whiteSpace:"pre-wrap", lineHeight:1.6 }}>{data.out}</pre>
    </div>
  );

  case "tool_call": return (
    <div key={id} style={{
      margin:"3px 0", padding:"3px 8px",
      background:`${ac}12`, borderLeft:`2px solid ${ac}`,
      borderRadius:"0 4px 4px 0",
      display:"flex", alignItems:"center", gap:6,
    }}>
      <span style={{ color:ac, fontFamily:"'JetBrains Mono',monospace", fontSize:10 }}>⚙</span>
      <span style={{ color:ac, fontFamily:"'JetBrains Mono',monospace", fontSize:11, fontWeight:700 }}>{data.name}</span>
      {data.input?.filename && <span style={{ color:"#6b7a8d", fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}>→ {data.input.filename}</span>}
      {data.input?.command  && <span style={{ color:"#6b7a8d", fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}>$ {data.input.command}</span>}
      {data.input?.language && <span style={{ color:"#fbbf24", fontFamily:"'JetBrains Mono',monospace", fontSize:10, padding:"1px 4px", background:"rgba(251,191,36,0.1)", borderRadius:3 }}>{data.input.language}</span>}
    </div>
  );

  case "tool_write": {
    const lines = data.content.split("\n");
    return (
      <div key={id} style={{ margin:"5px 0", background:"#0d1117", border:"1px solid #1e2433", borderRadius:6, overflow:"hidden" }}>
        <div style={{ padding:"5px 10px", background:"#111827", borderBottom:"1px solid #1e2433", display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ color:"#4ade80", fontSize:11 }}>✓</span>
          <span style={{ color:ac, fontFamily:"'JetBrains Mono',monospace", fontSize:11, fontWeight:700 }}>WriteFile</span>
          <span style={{ color:"#6b7a8d", fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}>{data.filename}</span>
          <span style={{ color:"#374151", fontFamily:"'JetBrains Mono',monospace", fontSize:10, marginLeft:"auto" }}>{lines.length} lines</span>
        </div>
        <div style={{ maxHeight:160, overflowY:"auto" }}>
          {lines.slice(0,40).map((line,i)=>(
            <div key={i} style={{ display:"flex", minHeight:16 }}>
              <span style={{ color:"#374151", fontFamily:"'JetBrains Mono',monospace", fontSize:10, minWidth:30, textAlign:"right", paddingRight:8, flexShrink:0, userSelect:"none" }}>{i+1}</span>
              <span style={{ color:"#9ca3af", fontFamily:"'JetBrains Mono',monospace", fontSize:11, whiteSpace:"pre", paddingLeft:4 }} dangerouslySetInnerHTML={{__html:hl(line,ac)}} />
            </div>
          ))}
          {lines.length>40&&<div style={{color:"#4b5563",fontFamily:"'JetBrains Mono',monospace",fontSize:10,padding:"2px 10px"}}>… {lines.length-40} more lines</div>}
        </div>
      </div>
    );
  }

  case "tool_read": return (
    <div key={id} style={{ margin:"5px 0", background:"#0d1117", border:"1px solid #1e2433", borderRadius:6, overflow:"hidden" }}>
      <div style={{ padding:"5px 10px", background:"#111827", borderBottom:"1px solid #1e2433", display:"flex", gap:8 }}>
        <span style={{ color:"#fbbf24", fontFamily:"'JetBrains Mono',monospace", fontSize:11, fontWeight:700 }}>ReadFile</span>
        <span style={{ color:"#6b7a8d", fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}>{data.filename}</span>
      </div>
      <pre style={{ color:"#9ca3af", fontFamily:"'JetBrains Mono',monospace", fontSize:11, padding:"6px 10px", margin:0, whiteSpace:"pre-wrap", maxHeight:120, overflowY:"auto" }}>{data.content}</pre>
    </div>
  );

  case "tool_ls": return (
    <div key={id} style={{ margin:"3px 0 5px", display:"flex", flexWrap:"wrap", gap:6 }}>
      {data.files.length===0
        ? <span style={{color:"#4b5563",fontFamily:"'JetBrains Mono',monospace",fontSize:12}}>(empty filesystem)</span>
        : data.files.map((f,i)=>(
          <span key={i} style={{ color:"#60a5fa", fontFamily:"'JetBrains Mono',monospace", fontSize:12 }}>{f}</span>
        ))}
    </div>
  );

  case "tool_running": return (
    <div key={id} style={{ margin:"4px 0", background:"#0d1117", border:"1px solid #1e2433", borderRadius:6, overflow:"hidden" }}>
      <div style={{ padding:"5px 10px", background:"#111827", borderBottom:"1px solid #1e2433", display:"flex", gap:8, alignItems:"center" }}>
        <span style={{ color:"#fbbf24", fontSize:11 }}>▶</span>
        <span style={{ color:"#fbbf24", fontFamily:"'JetBrains Mono',monospace", fontSize:11, fontWeight:700 }}>Executing</span>
        <span style={{ background:data.language==="python"?"rgba(59,130,246,0.2)":"rgba(234,179,8,0.2)", color:data.language==="python"?"#60a5fa":"#fbbf24", fontFamily:"'JetBrains Mono',monospace", fontSize:10, padding:"1px 5px", borderRadius:3 }}>{data.language}</span>
      </div>
      <pre style={{ color:"#4b5563", fontFamily:"'JetBrains Mono',monospace", fontSize:11, padding:"5px 10px", margin:0, whiteSpace:"pre-wrap", maxHeight:80, overflowY:"auto" }}>{data.code.slice(0,300)}{data.code.length>300?"…":""}</pre>
    </div>
  );

  case "tool_output": return (
    <div key={id} style={{
      margin:"2px 0 6px", padding:"6px 10px",
      background: data.err ? "rgba(239,68,68,0.06)" : "rgba(74,222,128,0.04)",
      border:`1px solid ${data.err?"#7f1d1d":"#14532d"}`,
      borderRadius:4,
    }}>
      {data.out&&<pre style={{ color: data.err?"#fca5a5":"#4ade80", fontFamily:"'JetBrains Mono',monospace", fontSize:12, margin:0, whiteSpace:"pre-wrap", lineHeight:1.6 }}>{data.out}</pre>}
      {data.err&&<pre style={{ color:"#ef4444", fontFamily:"'JetBrains Mono',monospace", fontSize:11, margin: data.out?"4px 0 0":0, whiteSpace:"pre-wrap" }}>Error: {data.err}</pre>}
    </div>
  );

  case "tool_shell": return (
    <div key={id} style={{ margin:"3px 0 6px" }}>
      <div style={{ color:"#374151", fontFamily:"'JetBrains Mono',monospace", fontSize:11, marginBottom:2 }}>$ {data.cmd}</div>
      {data.out&&<pre style={{ color:"#9ca3af", fontFamily:"'JetBrains Mono',monospace", fontSize:12, margin:0, paddingLeft:8, whiteSpace:"pre-wrap", lineHeight:1.6 }}>{data.out}</pre>}
    </div>
  );

  case "tool_preview": return (
    <div key={id} onClick={()=>setShowPreview(true)} style={{
      margin:"4px 0", padding:"8px 12px",
      background:`${ac}0d`, border:`1px solid ${ac}33`, borderRadius:6,
      display:"flex", alignItems:"center", gap:8, cursor:"pointer",
    }}>
      <span style={{ color:ac, fontSize:14 }}>⬡</span>
      <span style={{ color:ac, fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:700 }}>HTML Preview</span>
      <span style={{ color:"#6b7a8d", fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}>{data.title}</span>
      <span style={{ color:"#4d9de0", fontFamily:"'JetBrains Mono',monospace", fontSize:10, marginLeft:"auto" }}>tap →</span>
    </div>
  );

  case "error": return (
    <div key={id} style={{ color:"#ef4444", fontFamily:"'JetBrains Mono',monospace", fontSize:12, padding:"4px 8px", background:"rgba(239,68,68,0.08)", borderRadius:4, marginBottom:4 }}>
      ✗ {data.text}
    </div>
  );

  default: return null;
}
```

};

// ══════════════════════════════════════════════════════
//  LAYOUT
// ══════════════════════════════════════════════════════
return (
<>
<style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap'); * { box-sizing:border-box; margin:0; padding:0; -webkit-tap-highlight-color:transparent; } html,body { background:#060910; height:100%; overflow:hidden; } @keyframes spin { to { transform:rotate(360deg); } } @keyframes fadeUp { from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)} } @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.5} } .entry { animation: fadeUp 0.12s ease-out; } ::-webkit-scrollbar { width:2px; } ::-webkit-scrollbar-thumb { background:#1e2433; border-radius:1px; } input,textarea { -webkit-appearance:none; } textarea::placeholder { color:#374151; }`}</style>

```
  {/* ── Preview fullscreen ── */}
  {showPreview && preview && (
    <div style={{
      position:"fixed",inset:0,zIndex:200,
      background:"#060910",display:"flex",flexDirection:"column",
    }}>
      <div style={{
        display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"10px 14px",
        background:"rgba(13,17,23,0.95)",
        backdropFilter:"blur(20px)",
        borderBottom:"1px solid rgba(255,255,255,0.06)",
      }}>
        <span style={{color:profile.accent,fontFamily:"'JetBrains Mono',monospace",fontSize:13,fontWeight:700}}>
          ⬡ {preview.title}
        </span>
        <button onClick={()=>setShowPreview(false)} style={{
          background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.3)",
          color:"#ef4444",borderRadius:5,padding:"4px 12px",
          fontFamily:"'JetBrains Mono',monospace",fontSize:12,cursor:"pointer",
        }}>✕</button>
      </div>
      <iframe srcDoc={preview.html} sandbox="allow-scripts allow-same-origin" style={{flex:1,border:"none"}} title="preview" />
    </div>
  )}

  {/* ── AI Switcher overlay ── */}
  {showSwitcher && (
    <div style={{
      position:"fixed",inset:0,zIndex:150,
      background:"rgba(6,9,16,0.85)",backdropFilter:"blur(20px)",
      display:"flex",flexDirection:"column",justifyContent:"flex-end",
      padding:"0 0 40px",
    }} onClick={()=>setShowSwitcher(false)}>
      <div onClick={e=>e.stopPropagation()} style={{
        margin:"0 12px",
        background:"rgba(15,20,30,0.98)",
        border:"1px solid rgba(255,255,255,0.08)",
        borderRadius:16,overflow:"hidden",
        boxShadow:"0 -20px 60px rgba(0,0,0,0.8)",
      }}>
        <div style={{padding:"14px 16px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
          <div style={{color:"#6b7a8d",fontFamily:"'JetBrains Mono',monospace",fontSize:11,textAlign:"center"}}>Switch AI Runtime</div>
        </div>
        {Object.values(AI_PROFILES).map(p=>(
          <div key={p.id} onClick={()=>{
            setActiveAI(p.id);
            if(sessions[p.id]?.length===0) setTimeout(()=>addEntry("boot",{profile:p},p.id),50);
            addEntry("system_msg",{text:`Switched to ${p.name}`});
            setShowSwitcher(false);
          }} style={{
            display:"flex",alignItems:"center",gap:12,
            padding:"12px 16px",cursor:"pointer",
            background: activeAI===p.id ? `${p.accent}15` : "transparent",
            borderLeft: activeAI===p.id ? `3px solid ${p.accent}` : "3px solid transparent",
          }}>
            <span style={{fontSize:18,filter:`drop-shadow(0 0 6px ${p.accent})`}}>{p.mascot}</span>
            <div>
              <div style={{color: activeAI===p.id ? p.accent : "#e2e8f0",fontFamily:"'JetBrains Mono',monospace",fontSize:13,fontWeight:700}}>{p.name}</div>
              <div style={{color:"#4b5563",fontFamily:"'JetBrains Mono',monospace",fontSize:10}}>{p.subtitle}</div>
            </div>
            {activeAI===p.id&&<span style={{color:p.accent,marginLeft:"auto",fontSize:11}}>● active</span>}
          </div>
        ))}
      </div>
    </div>
  )}

  {/* ── Main Terminal Window ── */}
  <div style={{
    display:"flex",flexDirection:"column",
    height:"100dvh",
    maxWidth:430,margin:"0 auto",
    // Ghostty glass effect
    background:"linear-gradient(160deg,rgba(12,16,26,0.97) 0%,rgba(8,11,20,0.99) 100%)",
    position:"relative",
  }}>
    {/* Ghostty glass border glow */}
    <div style={{
      position:"absolute",inset:0,pointerEvents:"none",zIndex:0,
      background:"radial-gradient(ellipse at 50% 0%,rgba(255,255,255,0.03) 0%,transparent 60%)",
    }} />

    {/* ── Title Bar (macOS style) ── */}
    <div style={{
      flexShrink:0,zIndex:10,
      background:"rgba(13,17,23,0.92)",
      backdropFilter:"blur(30px) saturate(180%)",
      WebkitBackdropFilter:"blur(30px) saturate(180%)",
      borderBottom:"1px solid rgba(255,255,255,0.07)",
      padding:"10px 14px 8px",
    }}>
      {/* Traffic lights row */}
      <div style={{ display:"flex",alignItems:"center",gap:0 }}>
        {/* Traffic lights */}
        <div style={{ display:"flex",gap:7,alignItems:"center",marginRight:12 }}>
          {/* Red */}
          <div style={{
            width:12,height:12,borderRadius:"50%",
            background:"radial-gradient(circle at 35% 35%,#ff6b6b,#e5484d)",
            boxShadow:"0 0 0 0.5px rgba(229,72,77,0.5),0 1px 2px rgba(0,0,0,0.4)",
            cursor:"pointer",flexShrink:0,
          }} />
          {/* Yellow */}
          <div style={{
            width:12,height:12,borderRadius:"50%",
            background:"radial-gradient(circle at 35% 35%,#ffd93d,#e8b000)",
            boxShadow:"0 0 0 0.5px rgba(232,176,0,0.5),0 1px 2px rgba(0,0,0,0.4)",
            cursor:"pointer",flexShrink:0,
          }} />
          {/* Green */}
          <div style={{
            width:12,height:12,borderRadius:"50%",
            background:"radial-gradient(circle at 35% 35%,#69ff7d,#28c840)",
            boxShadow:"0 0 0 0.5px rgba(40,200,64,0.5),0 1px 2px rgba(0,0,0,0.4)",
            cursor:"pointer",flexShrink:0,
          }} />
        </div>

        {/* Window title */}
        <div style={{ flex:1,display:"flex",alignItems:"center",justifyContent:"center" }}>
          <span style={{
            color:"#8892a4",fontFamily:"'JetBrains Mono',monospace",
            fontSize:11,fontWeight:500,letterSpacing:"0.02em",
          }}>
            ✳ {profile.name}
          </span>
        </div>

        {/* Right controls */}
        <div style={{ display:"flex",gap:8,alignItems:"center" }}>
          {preview&&(
            <button onClick={()=>setShowPreview(true)} style={{
              background:`${profile.accent}20`,border:`1px solid ${profile.accent}40`,
              color:profile.accent,borderRadius:4,padding:"2px 7px",
              fontFamily:"'JetBrains Mono',monospace",fontSize:9,cursor:"pointer",
            }}>⬡ preview</button>
          )}
          <button onClick={()=>setShowSwitcher(true)} style={{
            background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",
            color:"#6b7a8d",borderRadius:4,padding:"2px 7px",
            fontFamily:"'JetBrains Mono',monospace",fontSize:9,cursor:"pointer",
          }}>switch</button>
        </div>
      </div>

      {/* Shell path line (Claude Code style) */}
      <div style={{ marginTop:8,display:"flex",alignItems:"center",gap:6 }}>
        <span style={{ color:"#374151",fontFamily:"'JetBrains Mono',monospace",fontSize:11 }}>
          mobile@iPhone-Air
        </span>
        <span style={{ color:"#4b5563",fontFamily:"'JetBrains Mono',monospace",fontSize:11 }}>~</span>
        <span style={{ color:"#6b7a8d",fontFamily:"'JetBrains Mono',monospace",fontSize:11 }}>%</span>
        <span style={{ color:profile.accent,fontFamily:"'JetBrains Mono',monospace",fontSize:11 }}>{profile.prompt}</span>
      </div>

      {/* AI indicator strip */}
      <div style={{
        marginTop:6,display:"flex",alignItems:"center",gap:6,
        padding:"3px 8px",
        background:`${profile.accent}0d`,
        borderRadius:4,
        border:`1px solid ${profile.accent}20`,
      }}>
        <span style={{ color:profile.accent,fontSize:10 }}>{profile.mascot}</span>
        <span style={{ color:profile.accent,fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:700 }}>{profile.name}</span>
        <span style={{ color:"#374151",fontFamily:"'JetBrains Mono',monospace",fontSize:10 }}>{profile.version}</span>
        <span style={{ marginLeft:"auto",color: loading?"#fbbf24":"#4ade80",fontFamily:"'JetBrains Mono',monospace",fontSize:10, animation: loading?"pulse 1s ease-in-out infinite":undefined }}>
          {loading?"● running":"● ready"}
        </span>
      </div>
    </div>

    {/* ── Terminal output ── */}
    <div
      ref={scrollRef}
      onClick={()=>inputRef.current?.focus()}
      style={{
        flex:1,overflowY:"auto",padding:"12px 14px 8px",
        position:"relative",zIndex:1,
      }}
    >
      {entries.map(e=>(
        <div key={e.id} className="entry">{renderEntry(e)}</div>
      ))}
    </div>

    {/* ── Status bar ── */}
    <div style={{
      flexShrink:0,zIndex:10,
      padding:"4px 14px",
      background:"rgba(13,17,23,0.9)",
      backdropFilter:"blur(20px)",
      borderTop:"1px solid rgba(255,255,255,0.05)",
      display:"flex",justifyContent:"space-between",alignItems:"center",
    }}>
      <span style={{color:"#374151",fontFamily:"'JetBrains Mono',monospace",fontSize:9}}>
        {fs.list().length} files · JS+PY · HTML
      </span>
      <div style={{display:"flex",gap:8}}>
        <span style={{color:"#374151",fontFamily:"'JetBrains Mono',monospace",fontSize:9}}>no sandbox</span>
        <span style={{color:"#374151",fontFamily:"'JetBrains Mono',monospace",fontSize:9}}>auto</span>
      </div>
    </div>

    {/* ── Input bar ── */}
    <div style={{
      flexShrink:0,zIndex:10,
      padding:"8px 10px 12px",
      background:"rgba(13,17,23,0.95)",
      backdropFilter:"blur(30px) saturate(180%)",
      WebkitBackdropFilter:"blur(30px) saturate(180%)",
      borderTop:"1px solid rgba(255,255,255,0.06)",
    }}>
      <div style={{
        display:"flex",alignItems:"flex-end",gap:8,
        background:"rgba(255,255,255,0.04)",
        border:`1px solid ${loading ? profile.accent+"60" : "rgba(255,255,255,0.08)"}`,
        borderRadius:10,padding:"8px 12px",
        transition:"border-color 0.2s",
        boxShadow: loading ? `0 0 0 1px ${profile.accent}20` : "none",
      }}>
        <span style={{
          color:profile.accent,fontFamily:"'JetBrains Mono',monospace",
          fontSize:14,paddingBottom:1,flexShrink:0,
        }}>&gt;</span>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={`Type a command or ask ${profile.name}…`}
          disabled={loading}
          rows={1}
          style={{
            flex:1,background:"transparent",border:"none",outline:"none",
            color:"#e2e8f0",fontFamily:"'JetBrains Mono',monospace",fontSize:13,
            caretColor:profile.accent,resize:"none",lineHeight:1.5,
            maxHeight:80,overflowY:"auto",minHeight:20,
          }}
          onInput={e=>{
            e.target.style.height="auto";
            e.target.style.height=Math.min(e.target.scrollHeight,80)+"px";
          }}
        />
        {loading
          ? <div style={{color:"#fbbf24",fontSize:15,animation:"spin 1s linear infinite",flexShrink:0}}>◌</div>
          : <button onClick={handleSend} disabled={!input.trim()} style={{
              background:"transparent",border:"none",cursor:input.trim()?"pointer":"default",
              color:input.trim()?profile.accent:"#374151",fontSize:16,padding:0,flexShrink:0,
              transition:"color 0.15s",
            }}>⏎</button>
        }
      </div>

      {/* Quick command chips */}
      <div style={{display:"flex",gap:5,marginTop:7,overflowX:"auto",paddingBottom:2}}>
        {[
          {label:"hello world", cmd:"write hello.py and run it"},
          {label:"fibonacci",   cmd:"write fibonacci in python and run it"},
          {label:"web app",     cmd:"make a beautiful calculator html app"},
          {label:"ls files",    cmd:"ls"},
          {label:"help",        cmd:"help"},
        ].map(s=>(
          <button key={s.label} onClick={()=>{setInput(s.cmd);inputRef.current?.focus();}} style={{
            background:`${profile.accent}0d`,
            border:`1px solid ${profile.accent}25`,
            color:"#4b5563",fontFamily:"'JetBrains Mono',monospace",fontSize:9,
            borderRadius:4,padding:"3px 8px",cursor:"pointer",whiteSpace:"nowrap",
            flexShrink:0,
          }}>{s.label}</button>
        ))}
      </div>
    </div>
  </div>
</>
```

);
}