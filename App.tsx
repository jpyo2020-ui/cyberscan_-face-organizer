
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AppStatus, ScanResult, PersonProfile } from './types';
import { analyzeFaceProfile, checkFaceMatch } from './services/geminiService';
import { NeonButton } from './components/NeonButton';

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [refImage, setRefImage] = useState<string | null>(null);
  const [folderHandle, setFolderHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [legacyFiles, setLegacyFiles] = useState<File[]>([]);
  const [profile, setProfile] = useState<PersonProfile | null>(null);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [envError, setEnvError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!('showDirectoryPicker' in window)) {
      setEnvError("Legacy Browser detected. Directory writing disabled.");
    } else if (window.self !== window.top) {
      setEnvError("Restricted Environment (Iframe). Folder selection may be blocked.");
    }
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setRefImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handlePaste = useCallback(async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes('image/png') || item.types.includes('image/jpeg')) {
          const blob = await item.getType(item.types.find(t => t.startsWith('image/'))!);
          const reader = new FileReader();
          reader.onloadend = () => setRefImage(reader.result as string);
          reader.readAsDataURL(blob);
        }
      }
    } catch (err) {
      console.error("Failed to paste: ", err);
    }
  }, []);

  const selectFolderModern = async () => {
    try {
      const handle = await (window as any).showDirectoryPicker();
      setFolderHandle(handle);
      setLegacyFiles([]);
      setEnvError(null);
    } catch (err: unknown) {
      // Explicitly cast to any to avoid "unknown" property access errors
      const error = err as any;
      if (error.name === 'SecurityError') {
        setEnvError("Access Blocked. Try 'Legacy Fallback' or open in new tab.");
        folderInputRef.current?.click();
      } else if (error.name !== 'AbortError') {
        alert(`Error: ${error.message || 'Unknown error'}`);
      }
    }
  };

  const handleLegacyFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Cast FileList to Array and explicitly type the item as File to avoid "unknown" errors
    const fileList = e.target.files;
    if (!fileList) return;
    
    const files = Array.from(fileList).filter((f: File) => /\.(jpe?g|png|webp)$/i.test(f.name));
    if (files.length > 0) {
      setLegacyFiles(files);
      setFolderHandle(null);
      setEnvError(null);
    }
  };

  const startScan = async () => {
    const hasSource = folderHandle || legacyFiles.length > 0;
    if (!refImage || !hasSource) return;

    setStatus(AppStatus.INITIALIZING);
    setResults([]);
    setProcessedCount(0);
    setProgress(0);

    try {
      const description = await analyzeFaceProfile(refImage);
      setProfile({ description, originalImage: refImage });

      let filesToScan: (File | { handle: FileSystemFileHandle, file: File })[] = [];
      
      if (folderHandle) {
        for await (const entry of (folderHandle as any).values()) {
          const e = entry as any;
          if (e.kind === 'file' && /\.(jpe?g|png|webp)$/i.test(e.name)) {
            const f = await e.getFile();
            filesToScan.push({ handle: e, file: f });
          }
        }
      } else {
        filesToScan = legacyFiles;
      }

      setTotalFiles(filesToScan.length);
      setStatus(AppStatus.SCANNING);

      for (let i = 0; i < filesToScan.length; i++) {
        const item = filesToScan[i];
        const currentFile = 'file' in item ? item.file : item;
        const currentHandle = 'handle' in item ? item.handle : null;

        setProcessedCount(i + 1);
        setProgress(Math.round(((i + 1) / filesToScan.length) * 100));

        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
        });
        reader.readAsDataURL(currentFile);
        const base64 = await base64Promise;

        const { match, confidence } = await checkFaceMatch(description, base64);
        
        if (match && confidence > 0.6) {
          const result: ScanResult = {
            fileName: currentFile.name,
            match,
            confidence,
            handle: currentHandle as any,
            previewUrl: base64
          };
          setResults(prev => [...prev, result]);
        }
      }

      setStatus(AppStatus.COMPLETED);
    } catch (err: unknown) {
      const error = err as any;
      alert(`Scan failed: ${error.message || 'Unknown error'}`);
      setStatus(AppStatus.IDLE);
    }
  };

  const organizeFiles = async () => {
    if (!folderHandle || results.length === 0) return;
    setStatus(AppStatus.ORGANIZING);
    try {
      const newFolderHandle = await folderHandle.getDirectoryHandle('CyberScan_Matches', { create: true });
      for (const res of results) {
        const file = await res.handle.getFile();
        const newFileHandle = await newFolderHandle.getFileHandle(res.fileName, { create: true });
        const writable = await (newFileHandle as any).createWritable();
        await writable.write(file);
        await writable.close();
      }
      alert(`Success: ${results.length} files organized.`);
      setStatus(AppStatus.COMPLETED);
    } catch (err: unknown) {
      const error = err as any;
      alert(`Failed: ${error.message || 'Unknown error'}`);
      setStatus(AppStatus.COMPLETED);
    }
  };

  const getSourceLabel = () => {
    if (folderHandle) return `PATH: ${folderHandle.name}`;
    if (legacyFiles.length > 0) return `LEGACY: ${legacyFiles.length} FILES LOADED`;
    return 'NO_DIRECTORY_LOADED';
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center">
      {/* Banner de Advertencia de Entorno */}
      {envError && (
        <div className="w-full max-w-6xl mb-6 p-4 border border-[#64e1f2]/30 bg-[#64e1f2]/5 text-[#64e1f2] text-[10px] font-mono uppercase tracking-[0.2em] flex flex-col md:flex-row items-center justify-between gap-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <span className="text-lg animate-pulse">!</span>
            <span>{envError}</span>
          </div>
          <NeonButton onClick={() => window.open(window.location.href, '_blank')} variant="secondary" className="px-4 h-8">
            OPEN_TOP_LEVEL_TAB
          </NeonButton>
        </div>
      )}

      {/* Header */}
      <header className="w-full max-w-6xl mb-12 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="text-center md:text-left">
          <h1 className="font-cyber text-4xl md:text-6xl neon-text tracking-tighter">CYBERSCAN_AI</h1>
          <p className="text-slate-500 font-light tracking-[0.4em] mt-1 text-[10px]">PROTO_V1.0 // FACIAL_ANALYSIS</p>
        </div>
        <div className="flex gap-6 items-center">
          <div className="text-right hidden sm:block">
            <div className="text-[9px] text-slate-500 uppercase tracking-widest">System Status</div>
            <div className={`text-xs font-cyber ${status === AppStatus.IDLE ? 'text-slate-500' : 'text-[#64e1f2]'}`}>
              {status}
            </div>
          </div>
          <div className="w-10 h-10 neon-border flex items-center justify-center">
            <div className={`w-2 h-2 rounded-full ${status === AppStatus.IDLE ? 'bg-slate-800' : 'bg-[#64e1f2] shadow-[0_0_8px_#64e1f2] animate-pulse'}`}></div>
          </div>
        </div>
      </header>

      <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Columna Izquierda: Input */}
        <section className="lg:col-span-4 flex flex-col gap-6">
          <div className="neon-border p-6 bg-slate-900/40 backdrop-blur-xl relative overflow-hidden group">
            <div className="scanline"></div>
            <h2 className="font-cyber text-[10px] mb-4 text-slate-500 tracking-widest">_TARGET_PROFILE</h2>
            
            <div 
              className="aspect-square w-full border border-slate-800 flex items-center justify-center relative bg-black/60 cursor-pointer overflow-hidden group-hover:border-[#64e1f2]/40 transition-all duration-500"
              onClick={() => fileInputRef.current?.click()}
            >
              {refImage ? (
                <img src={refImage} alt="Target" className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" />
              ) : (
                <div className="text-center p-8">
                  <span className="text-5xl text-slate-800 mb-4 block font-cyber">?</span>
                  <span className="text-[9px] text-slate-600 uppercase tracking-widest">Drop_Image_Or_Click</span>
                </div>
              )}
            </div>

            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />

            {/* Botones centrados y simétricos */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <NeonButton onClick={handlePaste} variant="secondary">
                PASTE_CLIP
              </NeonButton>
              <NeonButton onClick={() => fileInputRef.current?.click()} variant="secondary">
                UPLOAD_FILE
              </NeonButton>
            </div>
          </div>

          <div className="neon-border p-6 bg-slate-900/40 backdrop-blur-xl">
            <h2 className="font-cyber text-[10px] mb-4 text-slate-500 tracking-widest">_SCAN_SOURCE</h2>
            <div className="p-4 border border-slate-800 bg-black/40 text-[9px] font-mono break-all min-h-[60px] flex items-center justify-center text-slate-500 mb-4 text-center leading-relaxed">
              {getSourceLabel()}
            </div>
            
            <div className="flex flex-col gap-3">
              <NeonButton onClick={selectFolderModern} className="w-full h-11">
                MODERN_SELECT
              </NeonButton>
              <NeonButton onClick={() => folderInputRef.current?.click()} variant="secondary" className="w-full h-9">
                LEGACY_FALLBACK
              </NeonButton>
            </div>

            <input 
              type="file" 
              ref={folderInputRef} 
              className="hidden" 
              {...({ webkitdirectory: "", directory: "" } as any)} 
              onChange={handleLegacyFolderSelect} 
            />
          </div>

          <NeonButton 
            onClick={startScan} 
            disabled={!refImage || (!folderHandle && legacyFiles.length === 0) || status === AppStatus.SCANNING} 
            className="w-full h-14 text-sm tracking-[0.3em] font-bold"
          >
            {status === AppStatus.SCANNING ? 'SCANNING_IN_PROGRESS...' : 'INITIATE_SCAN_PROCESS'}
          </NeonButton>
        </section>

        {/* Columna Derecha: Salida */}
        <section className="lg:col-span-8 flex flex-col h-full min-h-[600px]">
          <div className="neon-border p-6 bg-slate-900/40 backdrop-blur-xl flex-1 flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-cyber text-[10px] text-slate-500 tracking-widest">_ANALYSIS_STREAM</h2>
              <div className="text-[10px] text-[#64e1f2] font-mono">
                MATCHES_FOUND: <span className="font-bold text-lg">{results.length}</span>
              </div>
            </div>

            {(status === AppStatus.SCANNING || status === AppStatus.ORGANIZING) && (
              <div className="mb-8">
                <div className="flex justify-between text-[9px] text-slate-500 mb-2 font-cyber tracking-widest">
                  <span>PROGRESS_STATUS: {progress}%</span>
                  <span>{processedCount} / {totalFiles} UNITS</span>
                </div>
                <div className="h-[2px] w-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-[#64e1f2] transition-all duration-300 shadow-[0_0_10px_#64e1f2]" style={{ width: `${progress}%` }}></div>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              {results.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center border border-slate-800 border-dashed rounded opacity-30">
                  <div className="text-4xl mb-4 font-cyber text-slate-700">VOID</div>
                  <div className="text-[8px] uppercase tracking-[0.4em] text-slate-600">Waiting_for_neural_link_input</div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {results.map((res, idx) => (
                    <div key={idx} className="group relative aspect-square border border-slate-800 bg-black overflow-hidden hover:border-[#64e1f2]/50 transition-colors">
                      <img src={res.previewUrl} alt={res.fileName} className="w-full h-full object-cover grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent p-3 flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="text-[7px] truncate text-slate-400 font-mono mb-1 uppercase tracking-tighter">{res.fileName}</div>
                        <div className="text-[10px] text-[#64e1f2] font-cyber tracking-widest">CONF: {(res.confidence * 100).toFixed(0)}%</div>
                      </div>
                      <div className="absolute top-2 right-2 bg-[#64e1f2] text-[#020617] text-[7px] font-cyber px-1.5 py-0.5 tracking-tighter">MATCHED</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-8 pt-6 border-t border-slate-800/50 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="text-[8px] text-slate-600 font-mono tracking-widest uppercase">
                {folderHandle ? "SYSTEM_ACCESS: READ/WRITE_READY" : "SYSTEM_ACCESS: READ_ONLY (LEGACY)"}
              </div>
              <NeonButton 
                onClick={organizeFiles} 
                variant="primary" 
                disabled={results.length === 0 || status === AppStatus.ORGANIZING || !folderHandle}
                className="w-full sm:w-auto px-10 h-10"
              >
                ORGANIZE_DATA_STREAM
              </NeonButton>
            </div>
          </div>
        </section>
      </main>

      <footer className="w-full max-w-6xl mt-12 mb-8 text-center text-[8px] text-slate-700 uppercase tracking-[0.5em] font-cyber opacity-50">
        &copy; 2024 CYBER_SCAN_CORP // NEURAL_LINK_ESTABLISHED // PRIVATE_STORAGE_LOCAL
      </footer>
    </div>
  );
};

export default App;
