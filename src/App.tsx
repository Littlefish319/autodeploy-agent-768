import React, { useState, useEffect } from 'react';
import { AppConfig, GeneratedProject, LogEntry, Step, DeploymentResult, SavedProject } from './types';
import { verifyGithubToken, createRepository, pushFilesToRepo, loadHistoryFromGist, saveHistoryToGist } from './services/githubService';
import { generateProjectCode } from './services/geminiService';
import { createVercelProject } from './services/vercelService';
import { getSelfSourceCode, getTestTemplate } from './services/templateService';
import { Terminal } from './components/Terminal';
import { Code, Github, CloudLightning, ArrowRight, Play, Loader2, CheckCircle, ExternalLink, Settings, LayoutTemplate, HelpCircle, FileJson, Copy, Terminal as TerminalIcon, Check, CircleDashed, User, History, Save, ChevronLeft, Trash2, RefreshCw, Cloud, Info, Zap, TestTube, LogIn, Lock, Mail, Phone, Calendar } from 'lucide-react';

const App: React.FC = () => {
  const [step, setStep] = useState<Step>(Step.CONFIG);
  const [config, setConfig] = useState<AppConfig>({ githubToken: '', githubUsername: '', vercelToken: '', useBetaDeploy: false });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [prompt, setPrompt] = useState('');
  const [project, setProject] = useState<GeneratedProject | null>(null);
  const [deploymentResult, setDeploymentResult] = useState<DeploymentResult | null>(null);
  const [mode, setMode] = useState<'generate' | 'paste'>('generate');
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const savedConfig = localStorage.getItem('autodeploy_config');
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        setConfig(prev => ({...prev, ...parsed}));
        if (parsed.githubToken) {
           verifyGithubToken(parsed.githubToken).then(u => {
               setConfig(prev => ({...prev, githubUsername: u}));
               setStep(Step.PROMPT);
               addLog(`Welcome back, ${u}. Session restored.`, 'success');
               syncHistory(parsed.githubToken, true);
           }).catch(() => {
               addLog("Saved token expired or invalid. Please login again.", 'warning');
               setStep(Step.CONFIG);
           });
        }
      } catch (e) { console.error("Config parse error", e); }
    }
    const savedHistory = localStorage.getItem('autodeploy_history');
    if (savedHistory) { try { setSavedProjects(JSON.parse(savedHistory)); } catch(e) {} }
  }, []);

  const syncHistory = async (token: string, silent = false) => {
      if (!token) return;
      if (!silent) setIsSyncing(true);
      try {
          if (!silent) addLog("Syncing projects with GitHub Cloud...", 'info');
          const cloudHistory = await loadHistoryFromGist(token);
          if (cloudHistory && Array.isArray(cloudHistory)) {
              setSavedProjects(prev => {
                  const combined = [...cloudHistory];
                  prev.forEach(p => { if (!combined.find(c => c.id === p.id)) combined.push(p); });
                  combined.sort((a, b) => b.timestamp - a.timestamp);
                  localStorage.setItem('autodeploy_history', JSON.stringify(combined));
                  return combined;
              });
              if (!silent) addLog("History synced successfully.", 'success');
          } else {
              if (!silent) addLog("No cloud history found. Creating new sync file...", 'info');
          }
      } catch (e) { if (!silent) addLog("Failed to sync history.", 'error'); } finally { if (!silent) setIsSyncing(false); }
  };

  const saveHistory = async (newHistory: SavedProject[]) => {
    setSavedProjects(newHistory);
    localStorage.setItem('autodeploy_history', JSON.stringify(newHistory));
    if (config.githubToken) { try { await saveHistoryToGist(config.githubToken, newHistory); } catch (e) {} }
  };

  const saveConfig = (newConfig: AppConfig) => { localStorage.setItem('autodeploy_config', JSON.stringify(newConfig)); };
  
  const saveCurrentProject = () => {
      if (!project) return;
      const newEntry: SavedProject = { id: Math.random().toString(36).substring(7), timestamp: Date.now(), prompt, project };
      const isDuplicate = savedProjects.some(p => p.project.name === project.name && p.prompt === prompt);
      if (!isDuplicate) {
        const updated = [newEntry, ...savedProjects];
        saveHistory(updated);
        addLog(`Project "${project.name}" saved to history.`, 'success');
      } else { addLog(`Project "${project.name}" is already saved.`, 'warning'); }
  };
  
  const loadProject = (entry: SavedProject) => {
      setPrompt(entry.prompt); setProject(entry.project); setStep(Step.REVIEW); setShowHistory(false);
      addLog(`Loaded project "${entry.project.name}" from history.`, 'info');
  };

  const deleteProject = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const updated = savedProjects.filter(p => p.id !== id);
      saveHistory(updated);
  };

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { id: Math.random().toString(36), timestamp: new Date(), message, type }]);
  };

  const handleError = (error: any) => {
    console.error(error);
    addLog(error instanceof Error ? error.message : "An unexpected error occurred in my systems.", 'error');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config.githubToken) return;
    addLog('Verifying GitHub credentials...');
    try {
      const username = await verifyGithubToken(config.githubToken);
      const newConfig = { ...config, githubUsername: username };
      setConfig(newConfig); saveConfig(newConfig);
      addLog(`Hello, ${username}! Login successful.`, 'success');
      setStep(Step.PROMPT); syncHistory(config.githubToken);
    } catch (err) { handleError(err); }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setStep(Step.GENERATING);
    if (mode === 'generate') { addLog(`I'm brainstorming code for: "${prompt.slice(0, 30)}..."`); } else { addLog('Analyzing code structure...'); }
    try {
      const generated = await generateProjectCode(prompt, mode);
      setProject(generated);
      addLog(`Prepared "${generated.name}" with ${generated.files.length} files.`, 'success');
      setStep(Step.REVIEW);
      const newEntry: SavedProject = { id: Math.random().toString(36).substring(7), timestamp: Date.now(), prompt, project: generated };
      saveHistory([newEntry, ...savedProjects]);
    } catch (err) { handleError(err); setStep(Step.PROMPT); }
  };

  const handleLoadSelfSource = () => {
    let code = getSelfSourceCode();
    setPrompt(code);
    addLog("Loaded AutoDeploy Agent source code. Ready to replicate.", 'success');
  };

  const handleLoadTestTemplate = () => {
      const code = getTestTemplate();
      setPrompt(code);
      addLog("Loaded Test Template (Hello World).", 'success');
  };

  const handleDeploy = async () => {
    if (!project || !config.githubUsername) return;
    setStep(Step.DEPLOYING);
    addLog('Initiating deployment sequence...', 'warning');
    try {
      const repoName = `${project.name}-${Math.floor(Math.random() * 1000)}`;
      addLog(`1. Creating repository '${repoName}' on GitHub...`);
      const repoData = await createRepository(config.githubToken, repoName, project.description);
      addLog(`GitHub Repository created successfully.`, 'success');
      addLog('2. Uploading source code...');
      await pushFilesToRepo(config.githubToken, config.githubUsername, repoName, project.files, (msg) => addLog(msg));
      addLog('Source code uploaded.', 'success');
      let vUrl = null; let isBetaSuccess = false;
      if (config.useBetaDeploy && config.vercelToken) {
          addLog('3. [Beta] Creating Vercel Project automatically...', 'info');
          try {
             const vProject = await createVercelProject(config.vercelToken, repoName, `${config.githubUsername}/${repoName}`);
             if (vProject) {
                 vUrl = `https://vercel.com/${config.githubUsername}/${vProject.name}`; 
                 addLog(`[Beta] Project created! Build triggered on Vercel.`, 'success');
                 isBetaSuccess = true;
             }
          } catch (e: any) { addLog(`[Beta] Auto-deploy failed (${e.message}). Falling back to manual mode.`, 'warning'); }
      } else { addLog('3. Skipping auto-deploy (Beta disabled or no token).', 'info'); }
      setDeploymentResult({ repoUrl: repoData.html_url, deployUrl: vUrl ? vUrl : undefined, isBeta: isBetaSuccess });
      setStep(Step.SUCCESS);
    } catch (err) { handleError(err); setStep(Step.REVIEW); }
  };

  const ProgressStep = ({ s, label, current }: { s: Step, label: string, current: Step }) => {
    const order = [Step.CONFIG, Step.PROMPT, Step.GENERATING, Step.REVIEW, Step.DEPLOYING, Step.SUCCESS];
    const idx = order.indexOf(s);
    const currentIdx = order.indexOf(current);
    let state: 'pending' | 'active' | 'completed' = 'pending';
    if (current === s) state = 'active';
    if (currentIdx > idx) state = 'completed';
    if (s === Step.GENERATING && current === Step.PROMPT) state = 'pending';
    return (
      <div className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${state === 'active' ? 'bg-white/10 border border-white/20' : 'opacity-50'}`}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${
          state === 'completed' ? 'bg-green-500 border-green-500 text-black' :
          state === 'active' ? 'bg-blue-600 border-blue-500 text-white animate-pulse' :
          'bg-black border-gray-700 text-gray-500'
        }`}>
          {state === 'completed' ? <Check size={16} strokeWidth={3} /> : state === 'active' ? <Loader2 size={16} className="animate-spin" /> : <CircleDashed size={16} />}
        </div>
        <div className="flex-1">
          <p className={`text-sm font-medium ${state === 'active' ? 'text-white' : 'text-gray-400'}`}>{label}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen bg-black text-white font-sans flex flex-col md:flex-row overflow-hidden relative">
      {showHistory && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-start">
             <div className="w-80 h-full bg-[#111] border-r border-deploy-border shadow-2xl animate-in slide-in-from-left duration-300 flex flex-col">
                <div className="p-4 border-b border-deploy-border flex justify-between items-center bg-[#1a1a1a]">
                    <h2 className="font-bold flex items-center gap-2"><History size={18}/> Project History</h2>
                    <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-white">✕</button>
                </div>
                {config.githubToken && (
                    <div className="p-3 border-b border-deploy-border bg-[#0a0a0a]">
                        <button onClick={() => syncHistory(config.githubToken)} disabled={isSyncing} className="w-full text-xs flex items-center justify-center gap-2 bg-[#222] hover:bg-[#333] py-2 rounded text-blue-400 border border-blue-900/30 transition-all">
                            {isSyncing ? <Loader2 size={12} className="animate-spin"/> : <Cloud size={12}/>} {isSyncing ? "Syncing..." : "Sync Cloud History"}
                        </button>
                    </div>
                )}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {savedProjects.length === 0 ? ( <p className="text-gray-500 text-sm text-center italic mt-10">No saved projects yet.</p> ) : (
                        savedProjects.map(p => (
                            <div key={p.id} onClick={() => loadProject(p)} className="bg-black/50 border border-deploy-border p-3 rounded-lg hover:border-blue-500 cursor-pointer group transition-all">
                                <div className="flex justify-between items-start mb-1">
                                    <h3 className="font-medium text-sm text-blue-300 truncate w-3/4">{p.project.name}</h3>
                                    <button onClick={(e) => deleteProject(p.id, e)} className="text-gray-600 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12} /></button>
                                </div>
                                <p className="text-xs text-gray-500 mb-2 truncate">{p.project.description}</p>
                                <p className="text-[10px] text-gray-600 flex items-center justify-between">{new Date(p.timestamp).toLocaleDateString()}</p>
                            </div>
                        ))
                    )}
                </div>
             </div>
             <div className="flex-1" onClick={() => setShowHistory(false)}></div>
          </div>
      )}
      <div className="w-full md:w-1/2 flex flex-col border-r border-deploy-border bg-[#050505] relative z-10 h-full">
        <div className="p-6 md:p-10 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-8">
            <header className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/20">
                <CloudLightning size={24} className="text-white" />
                </div>
                <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">AutoDeploy Agent</h1>
                <p className="text-gray-400 text-xs">Deployment & Automation</p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <button onClick={() => setShowAbout(!showAbout)} className={`text-xs bg-[#111] hover:bg-[#222] border border-deploy-border px-3 py-2 rounded-md flex items-center gap-2 transition-colors ${showAbout ? 'text-blue-400 border-blue-900/50' : ''}`}>
                    <Info size={14}/> About
                </button>
                {step !== Step.CONFIG && (
                    <button onClick={() => setShowHistory(true)} className="text-xs bg-[#111] hover:bg-[#222] border border-deploy-border px-3 py-2 rounded-md flex items-center gap-2 transition-colors">
                        <History size={14}/> History
                    </button>
                )}
            </div>
            </header>
            {showAbout ? (
                <div className="animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="bg-deploy-card p-8 rounded-xl border border-deploy-border shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500"></div>
                        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"><Info size={24} className="text-blue-500"/> About This App</h2>
                        <div className="space-y-6 text-gray-300 text-sm leading-relaxed">
                            <p className="text-lg text-white font-medium">This app is for the convenience of auto deploy: fast and easy.</p>
                            <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                                <h3 className="font-bold text-white mb-2 flex items-center gap-2"><User size={16}/> Creator Info</h3>
                                <p>Made by 13 year old <span className="text-blue-400 font-bold">Xiaoyu Tang</span></p>
                                <p className="flex items-center gap-2 mt-1 text-xs text-gray-500"><Calendar size={12}/> 12.02.2025</p>
                            </div>
                            <div className="bg-blue-900/10 p-4 rounded-lg border border-blue-900/30">
                                <h3 className="font-bold text-blue-300 mb-2 flex items-center gap-2"><Mail size={16}/> Contact & Bug Reports</h3>
                                <p>If you find bugs, report to:</p>
                                <ul className="mt-2 space-y-1 font-mono text-xs">
                                    <li className="flex items-center gap-2"><Mail size={12} className="text-gray-500"/> tonytang2359@gmail.com</li>
                                    <li className="flex items-center gap-2"><Phone size={12} className="text-gray-500"/> 2797591107</li>
                                </ul>
                            </div>
                            <div className="bg-red-900/10 p-4 rounded-lg border border-red-900/30">
                                <h3 className="font-bold text-red-400 mb-2 flex items-center gap-2"><Settings size={16}/> System Setup (Critical)</h3>
                                <p className="mb-2">If you see "Gemini API Key Missing" errors when deploying:</p>
                                <ol className="list-decimal pl-5 space-y-2 text-xs text-gray-400">
                                    <li>Go to your Vercel Project Dashboard.</li>
                                    <li>Click <strong>Settings</strong> {'>'} <strong>Environment Variables</strong>.</li>
                                    <li>Add a new variable named <code className="bg-black px-1 rounded text-red-300">API_KEY</code>.</li>
                                    <li>Paste your Google Gemini API Key as the value.</li>
                                    <li>Redeploy your app for changes to take effect.</li>
                                </ol>
                            </div>
                        </div>
                        <div className="mt-8 text-center">
                            <button onClick={() => setShowAbout(false)} className="bg-white text-black font-bold py-2 px-6 rounded-lg hover:bg-gray-200 transition-colors">Close & Return to App</button>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                {step === Step.CONFIG && (
                <form onSubmit={handleLogin} className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-500 flex flex-col justify-center min-h-[50vh]">
                    <div className="bg-deploy-card p-8 rounded-xl border border-deploy-border shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 to-indigo-600"></div>
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-white"><LogIn size={20} /> Login to AutoDeploy</h2>
                        <div className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">GitHub Personal Access Token</label>
                                <div className="relative">
                                    <input type="password" required placeholder="ghp_xxxxxxxxxxxx" className="w-full bg-black border border-deploy-border rounded-lg p-3 pl-10 text-sm focus:border-blue-500 focus:outline-none transition-colors" value={config.githubToken} onChange={(e) => setConfig({ ...config, githubToken: e.target.value })} />
                                    <Lock size={16} className="absolute left-3 top-3.5 text-gray-500" />
                                </div>
                                <div className="mt-2 flex justify-between text-xs">
                                    <span className="text-gray-500">Required for creating repositories.</span>
                                    <a href="https://github.com/settings/tokens/new?scopes=repo,gist" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline flex items-center gap-1">Get Token <ExternalLink size={10}/></a>
                                </div>
                            </div>
                            <div className="pt-4 border-t border-white/5">
                                <label className="block text-sm font-medium text-gray-300 mb-1">Vercel Token (Optional)</label>
                                <input type="password" placeholder="AbCdEfGxxxxxxxx" className="w-full bg-black border border-deploy-border rounded-lg p-3 text-sm focus:border-blue-500 focus:outline-none transition-colors" value={config.vercelToken} onChange={(e) => setConfig({ ...config, vercelToken: e.target.value })} />
                                <a href="https://vercel.com/account/tokens" target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline mt-1 inline-block">Get Vercel Token</a>
                            </div>
                            <div className={`mt-2 flex items-center gap-3 p-3 rounded-lg border transition-colors ${config.vercelToken ? 'bg-blue-900/10 border-blue-900/30' : 'bg-gray-900/30 border-gray-800 opacity-50'}`}>
                                <input type="checkbox" id="betaDeploy" disabled={!config.vercelToken} checked={config.useBetaDeploy || false} onChange={(e) => setConfig({...config, useBetaDeploy: e.target.checked})} className="w-4 h-4 accent-blue-600 cursor-pointer" />
                                <label htmlFor="betaDeploy" className={`text-xs flex-1 ${config.vercelToken ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                                    <span className={`font-bold flex items-center gap-1 ${config.vercelToken ? 'text-blue-400' : 'text-gray-500'}`}>
                                        <Zap size={12} className={config.vercelToken ? "fill-blue-500 text-blue-500" : "text-gray-500"}/> Enable Beta Auto-Deploy
                                    </span>
                                    <span className="block text-gray-500">I will create the Vercel project for you. (Requires Vercel Token)</span>
                                </label>
                            </div>
                            <button type="submit" className="w-full bg-white text-black font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all hover:bg-gray-200 mt-4">Connect & Login <ArrowRight size={16} /></button>
                        </div>
                    </div>
                </form>
                )}
                {(step === Step.PROMPT || step === Step.GENERATING) && (
                <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-500">
                    <div className="bg-deploy-card p-1 rounded-lg border border-deploy-border inline-flex w-full">
                        <button onClick={() => setMode('generate')} disabled={step === Step.GENERATING} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2 ${mode === 'generate' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}><CloudLightning size={14} /> AI Generator</button>
                        <button onClick={() => setMode('paste')} disabled={step === Step.GENERATING} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2 ${mode === 'paste' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}><Copy size={14} /> Paste Code</button>
                    </div>
                    <div className="bg-deploy-card p-6 rounded-xl border border-deploy-border shadow-2xl relative">
                        <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                            <h2 className="text-lg font-semibold flex items-center gap-2"><LayoutTemplate size={18} /> {mode === 'generate' ? 'What should I build?' : 'Paste Source Code'}</h2>
                            {mode === 'paste' && (
                                <div className="flex gap-2">
                                    <button onClick={handleLoadTestTemplate} className="text-[10px] bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 px-2 py-1 rounded flex items-center gap-1 transition-colors"><TestTube size={10} /> Load Test Code</button>
                                    {config.githubUsername === 'Littlefish319' && (
                                        <button onClick={handleLoadSelfSource} className="text-[10px] bg-blue-900/30 hover:bg-blue-900/50 text-blue-300 border border-blue-800 px-2 py-1 rounded flex items-center gap-1 transition-colors" title="Load the code of this AutoDeploy agent"><CloudLightning size={10} /> Load AutoDeploy Source</button>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="relative">
                            <textarea className="w-full bg-black border border-deploy-border rounded-md p-4 text-sm focus:border-blue-500 focus:outline-none min-h-[300px] resize-none font-mono leading-relaxed" placeholder={mode === 'generate' ? "Example: I want a portfolio website..." : "// Paste your file contents here..."} value={prompt} disabled={step === Step.GENERATING} onChange={(e) => setPrompt(e.target.value)} />
                        </div>
                        <button onClick={handleGenerate} disabled={step === Step.GENERATING || !prompt.trim()} className="w-full mt-4 bg-white text-black hover:bg-gray-200 font-bold py-3 rounded-md flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                            {step === Step.GENERATING ? <><Loader2 className="animate-spin" size={18} /> Processing...</> : <><Code size={18} /> {mode === 'generate' ? 'Generate App' : 'Process & Prepare Code'}</>}
                        </button>
                    </div>
                </div>
                )}
                {(step === Step.REVIEW || step === Step.DEPLOYING) && project && (
                <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-500">
                    {step === Step.REVIEW && (
                        <button onClick={() => setStep(Step.PROMPT)} className="text-xs text-gray-400 hover:text-white flex items-center gap-1 mb-2 group"><ChevronLeft size={14} className="group-hover:-translate-x-1 transition-transform"/> Back to Editor</button>
                    )}
                    <div className="bg-deploy-card p-6 rounded-xl border border-deploy-border shadow-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold flex items-center gap-2">{project.name}</h2>
                            <div className="flex gap-2">
                                <button onClick={saveCurrentProject} title="Save to History" className="text-gray-400 hover:text-blue-400 transition-colors"><Save size={18} /></button>
                                <span className="text-xs bg-green-900/30 text-green-400 px-2 py-1 rounded border border-green-900/50">Ready</span>
                            </div>
                        </div>
                        <p className="text-gray-400 text-sm mb-6 bg-black/30 p-3 rounded border border-white/5">{project.description}</p>
                        <div className="mb-6">
                            <h3 className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-3 flex items-center gap-2"><FileJson size={14} /> Project Structure</h3>
                            <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                            {project.files.map(f => (
                                <div key={f.path} className="text-xs bg-black/50 border border-deploy-border p-2 rounded flex items-center justify-between text-gray-300 group hover:border-blue-500/50 transition-colors">
                                    <span className="flex items-center gap-2"><Code size={12} className="text-blue-500"/> {f.path}</span>
                                    <span className="text-[10px] text-gray-600 group-hover:text-gray-400">{(f.content.length / 1024).toFixed(1)} KB</span>
                                </div>
                            ))}
                            </div>
                        </div>
                        <button onClick={handleDeploy} disabled={step === Step.DEPLOYING} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-md flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                            {step === Step.DEPLOYING ? <><Loader2 className="animate-spin" size={18} /> Deploying...</> : <><Play size={18} /> {config.useBetaDeploy ? 'Auto Launch (Beta)' : 'Upload & Launch'}</>}
                        </button>
                    </div>
                </div>
                )}
                {step === Step.SUCCESS && deploymentResult && (
                <div className="space-y-4 animate-in fade-in zoom-in duration-500">
                    <div className="flex justify-end">
                        <button onClick={() => setStep(Step.PROMPT)} className="text-xs text-gray-400 hover:text-white flex items-center gap-1 mb-2 group"><ChevronLeft size={14} className="group-hover:-translate-x-1 transition-transform"/> Back to Editor</button>
                    </div>
                    <div className="bg-green-950/30 border border-green-800 p-8 rounded-xl text-center shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 via-emerald-400 to-green-500"></div>
                        <h2 className="text-2xl font-bold text-white mb-2">Code Uploaded to GitHub</h2>
                        <p className="text-gray-300 mb-6 text-sm">{deploymentResult.isBeta ? "Build triggered on Vercel." : "The hard work is done! Import to Vercel now."}</p>
                        {!deploymentResult.isBeta && (
                            <div className="bg-black/40 border border-white/10 rounded-lg p-4 text-left mb-6 font-mono text-xs text-gray-300 space-y-2">
                                <div className="flex justify-between border-b border-white/10 pb-1 mb-2"><span className="font-bold text-blue-400">DEPLOYMENT SETTINGS</span></div>
                                <div className="flex justify-between"><span>Framework Preset:</span><span className="text-white font-bold">Vite</span></div>
                                <div className="flex justify-between"><span>Output Directory:</span><span className="text-white font-bold">dist</span></div>
                                <div className="flex justify-between"><span>Build Command:</span><span className="text-white font-bold">npm run build</span></div>
                            </div>
                        )}
                        <div className="grid gap-3">
                            <a href={deploymentResult.deployUrl || `https://vercel.com/new/import?s=${deploymentResult.repoUrl}`} target="_blank" rel="noopener noreferrer" className="bg-white hover:bg-gray-100 text-black py-4 px-4 rounded-lg flex items-center justify-center gap-2 transition-all font-bold shadow-lg shadow-white/10 animate-pulse">
                            {deploymentResult.isBeta ? <><Zap size={18} className="fill-black"/> View Vercel Dashboard</> : <><div className="w-5 h-5 bg-black clip-path-triangle mr-1" style={{clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)'}}></div> Click Here to Deploy on Vercel</>}
                            </a>
                            <a href={deploymentResult.repoUrl} target="_blank" rel="noopener noreferrer" className="bg-[#24292e] hover:bg-[#2f363d] text-white py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors font-medium border border-gray-700"><Github size={18} /> View GitHub Repo</a>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => { setStep(Step.PROMPT); setProject(null); setLogs([]); setPrompt(''); }} className="flex-1 text-sm bg-[#111] hover:bg-[#222] border border-deploy-border text-white py-3 rounded-lg transition-colors">Create New App</button>
                    </div>
                </div>
                )}
                </>
            )}
            <div className="mt-auto pt-6 pb-2 text-center border-t border-white/5">
                <p className="text-xs text-gray-500 font-mono flex items-center justify-center gap-2">Copyright © Xiaoyu Tang <a href="https://github.com/Littlefish319" target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-400">@YuNova</a></p>
            </div>
        </div>
      </div>
      <div className="w-full md:w-1/2 bg-[#050505] p-6 md:p-10 border-t md:border-t-0 md:border-l border-deploy-border flex flex-col gap-6 h-[500px] md:h-full overflow-hidden">
         <div className="bg-deploy-card border border-deploy-border rounded-xl p-6 shadow-xl shrink-0">
             <h3 className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-4 flex items-center gap-2"><CloudLightning size={14} /> Deployment Status</h3>
             <div className="space-y-2">
                <ProgressStep s={Step.CONFIG} label="Authorization" current={step} />
                <ProgressStep s={Step.PROMPT} label="Project Definition" current={step} />
                <ProgressStep s={Step.GENERATING} label="Code Generation" current={step} />
                <ProgressStep s={Step.DEPLOYING} label="GitHub Sync" current={step} />
                <ProgressStep s={Step.SUCCESS} label="Ready to Launch" current={step} />
             </div>
         </div>
         <div className="flex-1 flex flex-col min-h-0">
             <div className="flex items-center justify-between mb-2 shrink-0">
                <h2 className="text-gray-400 font-mono text-sm uppercase tracking-widest flex items-center gap-2"><TerminalIcon size={16} /> Console Output</h2>
                <div className="flex gap-1"><div className="w-2 h-2 rounded-full bg-red-500"></div><div className="w-2 h-2 rounded-full bg-yellow-500"></div><div className="w-2 h-2 rounded-full bg-green-500"></div></div>
             </div>
             <div className="flex-1 overflow-hidden relative"><Terminal logs={logs} /></div>
             <div className="mt-2 text-[10px] text-gray-700 font-mono text-center flex justify-between px-2 shrink-0"><span>Model: Gemini 3 Pro</span><span>Latency: 24ms</span></div>
         </div>
      </div>
    </div>
  );
};

export default App;