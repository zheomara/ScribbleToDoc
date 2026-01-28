
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Camera, 
  Upload, 
  FileText, 
  Download, 
  Share2, 
  Moon, 
  Sun, 
  Trash2, 
  Play, 
  Settings,
  ChevronRight,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  Copy,
  Plus,
  Archive,
  AlertTriangle,
  RefreshCw,
  Key,
  X
} from 'lucide-react';
import { BatchImage, OCRConfig } from './types';
import CameraCapture from './components/CameraCapture';
import Editor from './components/Editor';
import BatchList from './components/BatchList';
import { processImageOCR } from './services/ocrService';
import { generateDocx, generateDocxBlob } from './services/docxService';

const App: React.FC = () => {
  const [images, setImages] = useState<BatchImage[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [config, setConfig] = useState<OCRConfig>({
    language: 'eng',
    grayscale: true,
    contrast: 1.2,
    threshold: 128
  });
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [finalText, setFinalText] = useState('');
  
  // API Key State
  const [apiKey, setApiKey] = useState('');
  const [showKeyModal, setShowKeyModal] = useState(false);
  
  // Library loading state
  const [libsLoaded, setLibsLoaded] = useState(false);
  const [libsError, setLibsError] = useState(false);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Load API Key from local storage on mount
  useEffect(() => {
    const storedKey = localStorage.getItem('gemini_api_key');
    if (storedKey) {
      setApiKey(storedKey);
    } else {
      setShowKeyModal(true);
    }
  }, []);

  const handleSaveKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('gemini_api_key', key);
    setShowKeyModal(false);
  };

  const handleRemoveKey = () => {
    setApiKey('');
    localStorage.removeItem('gemini_api_key');
    setShowKeyModal(true);
  };

  const checkLibs = useCallback(() => {
    setLibsError(false);
    let attempts = 0;
    const maxAttempts = 60; // 30 seconds total (500ms * 60)

    const check = () => {
      const docxReady = (window as any).docx || (window as any).DOCX;
      const jszipReady = (window as any).JSZip;
      const saveAsReady = (window as any).saveAs;
      
      if (docxReady && jszipReady && saveAsReady) {
        setLibsLoaded(true);
        setLibsError(false);
      } else {
        attempts++;
        if (attempts >= maxAttempts) {
          setLibsError(true);
        } else {
          setTimeout(check, 500);
        }
      }
    };
    check();
  }, []);

  // Initial check
  useEffect(() => {
    checkLibs();
  }, [checkLibs]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newImages: BatchImage[] = Array.from(files).map((file: File) => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'pending',
      progress: 0
    }));

    setImages(prev => [...prev, ...newImages]);
    if (currentIndex === -1) setCurrentIndex(images.length);
  };

  const handleCapture = (blob: Blob) => {
    const newImage: BatchImage = {
      id: Math.random().toString(36).substr(2, 9),
      file: blob,
      previewUrl: URL.createObjectURL(blob),
      status: 'pending',
      progress: 0
    };
    setImages(prev => [...prev, newImage]);
    setIsCameraOpen(false);
    if (currentIndex === -1) setCurrentIndex(images.length);
  };

  const startBatchProcess = async () => {
    if (isProcessing) return;
    
    if (!apiKey) {
      setShowKeyModal(true);
      return;
    }

    setIsProcessing(true);

    // Filter which items need processing
    const pendingItems = images
      .map((img, index) => ({ img, index }))
      .filter(item => item.img.status !== 'completed');

    if (pendingItems.length === 0) {
      setIsProcessing(false);
      return;
    }

    // Determine the starting index for appending text to ensure order
    const firstPendingIndex = pendingItems[0].index;
    let nextIndexToAppend = firstPendingIndex;
    
    // Map to hold text results temporarily until they are ready to be appended in order
    const completedTexts = new Map<number, string>();

    // Parallel Processing Queue Configuration
    const CONCURRENCY_LIMIT = 3;
    let queuePointer = 0;

    // Helper function to append text in correct order
    const tryAppendText = () => {
      setFinalText(prev => {
        let newText = prev;
        while (completedTexts.has(nextIndexToAppend)) {
          const textChunk = completedTexts.get(nextIndexToAppend);
          if (textChunk) {
            newText = newText ? newText + '\n\n' + textChunk : textChunk;
          }
          // Cleanup map and move to next
          completedTexts.delete(nextIndexToAppend);
          nextIndexToAppend++;
        }
        return newText;
      });
    };

    // Worker function
    const processItem = async (item: { img: BatchImage, index: number }) => {
      // 1. Set status to processing
      setImages(prev => prev.map((img, i) => i === item.index ? { ...img, status: 'processing' } : img));

      try {
        // 2. Process OCR
        const text = await processImageOCR(
          item.img.previewUrl,
          config,
          (progress) => {
            setImages(prev => prev.map((img, i) => i === item.index ? { ...img, progress } : img));
          },
          apiKey
        );

        // 3. Mark complete
        setImages(prev => prev.map((img, i) => i === item.index ? { ...img, status: 'completed', processedText: text } : img));
        
        // 4. Store result
        completedTexts.set(item.index, text);

      } catch (err) {
        console.error(`Error processing image ${item.index}`, err);
        setImages(prev => prev.map((img, i) => i === item.index ? { ...img, status: 'error' } : img));
        
        // Add placeholder so the order isn't broken for subsequent pages
        completedTexts.set(item.index, "[Error: Failed to process this page]");
      } finally {
        // 5. Try to append whatever we have, in order
        tryAppendText();
      }
    };

    // Worker Loop
    const runWorker = async () => {
      while (queuePointer < pendingItems.length) {
        const item = pendingItems[queuePointer++];
        await processItem(item);
      }
    };

    // Start workers
    const workers = Array(Math.min(CONCURRENCY_LIMIT, pendingItems.length))
      .fill(null)
      .map(() => runWorker());

    await Promise.all(workers);
    setIsProcessing(false);
  };

  const handleExport = async () => {
    if (!finalText) return;
    try {
      await generateDocx(finalText, "ScribbleToDoc_Notes");
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  const handleDownloadZip = async () => {
    if (!libsLoaded) {
      alert("Export libraries failed to load. Please refresh the page or check your connection.");
      return;
    }

    const JSZip = (window as any).JSZip;
    const saveAs = (window as any).saveAs;

    const completedImages = images.filter(img => img.status === 'completed');
    if (completedImages.length === 0) {
      alert("No processed notes to export. Please start conversion first.");
      return;
    }

    setIsZipping(true);
    try {
      const zip = new JSZip();
      
      for (let i = 0; i < completedImages.length; i++) {
        const img = completedImages[i];
        const text = img.processedText || "";
        const filename = `Note_Page_${i + 1}`;
        
        zip.file(`${filename}.txt`, text);
        
        const docBlob = await generateDocxBlob(text, `Note Page ${i + 1}`);
        zip.file(`${filename}.docx`, docBlob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      saveAs(zipBlob, "ScribbleToDoc_Batch_Export.zip");
    } catch (err) {
      console.error("ZIP Generation failed:", err);
      alert(err instanceof Error ? err.message : "Failed to generate ZIP archive.");
    } finally {
      setIsZipping(false);
    }
  };

  const handleShare = async () => {
    if (!finalText) return;
    const shareData = {
      title: 'Handwritten Notes Export',
      text: finalText,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.log('Share failed', err);
      }
    } else {
      navigator.clipboard.writeText(finalText);
      alert('Text copied to clipboard!');
    }
  };

  const processedCount = images.filter(img => img.status === 'completed').length;
  const isAllDone = images.length > 0 && processedCount === images.length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="flex justify-between items-center mb-10">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary-600 rounded-2xl shadow-lg shadow-primary-200 dark:shadow-none">
            <FileText className="text-white w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">ScribbleToDoc</h1>
            <p className="text-slate-500 text-sm font-medium">Capture. OCR. Document.</p>
          </div>
        </div>
        
        <div className="flex gap-2">
           <button 
            onClick={() => setShowKeyModal(true)}
            className={`p-3 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors ${!apiKey ? 'text-red-500 bg-red-50 dark:bg-red-900/20' : ''}`}
            title="API Key Settings"
          >
            <Key className="w-6 h-6" />
          </button>
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="p-3 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            title="Toggle Theme"
          >
            {darkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {!libsLoaded && !libsError && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl flex items-center gap-3 text-amber-700 dark:text-amber-400 animate-pulse">
          <Loader2 className="w-5 h-5 animate-spin" />
          <p className="text-sm font-medium">Initializing document libraries... (This may take a moment)</p>
        </div>
      )}

      {libsError && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl flex items-center justify-between text-red-700 dark:text-red-400">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5" />
            <p className="text-sm font-medium">
              Could not load DOCX export libraries. Export is disabled. Check internet connection.
            </p>
          </div>
          <button 
            onClick={checkLibs} 
            className="px-3 py-1.5 bg-red-100 dark:bg-red-900/40 rounded-lg text-xs font-bold hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          {/* Input Source */}
          <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Camera className="w-5 h-5 text-primary-500" />
                Input Source
              </h2>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setIsCameraOpen(true)}
                className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-all group"
              >
                <Camera className="w-8 h-8 mb-2 text-slate-400 group-hover:text-primary-500" />
                <span className="text-sm font-semibold">Scan Camera</span>
              </button>
              
              <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-all group cursor-pointer">
                <Upload className="w-8 h-8 mb-2 text-slate-400 group-hover:text-primary-500" />
                <span className="text-sm font-semibold text-center">Upload Files</span>
                <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
          </section>

          {/* OCR Settings */}
          <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800">
             <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Settings className="w-5 h-5 text-primary-500" />
                OCR Settings
              </h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Language</label>
                <select 
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800 rounded-lg outline-none focus:ring-2 focus:ring-primary-500"
                  value={config.language}
                  onChange={(e) => setConfig({...config, language: e.target.value})}
                >
                  <option value="eng">English</option>
                  <option value="spa">Spanish</option>
                  <option value="fra">French</option>
                  <option value="deu">German</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Grayscale Pre-processing</span>
                <input 
                  type="checkbox" 
                  checked={config.grayscale}
                  onChange={(e) => setConfig({...config, grayscale: e.target.checked})}
                  className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500"
                />
              </div>
            </div>
          </section>

          {/* Batch Queue */}
          <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Batch Queue ({images.length})</h2>
              {images.length > 0 && (
                <button 
                  onClick={() => {setImages([]); setFinalText(''); setCurrentIndex(-1);}} 
                  className="text-red-500 text-xs font-bold hover:underline"
                >
                  Clear All
                </button>
              )}
            </div>
            
            <BatchList 
              items={images} 
              onRemove={(id) => {
                const newItems = images.filter(img => img.id !== id);
                setImages(newItems);
                if (newItems.length === 0) setCurrentIndex(-1);
              }} 
              onSelect={(index) => setCurrentIndex(index)}
              activeIndex={currentIndex}
            />

            {images.length > 0 && (
              <div className="mt-6 space-y-3">
                <button 
                  onClick={startBatchProcess}
                  disabled={isProcessing || isAllDone}
                  className="w-full py-4 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-2xl font-bold flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-lg shadow-primary-200 dark:shadow-none"
                >
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                  {isProcessing ? `Processing...` : isAllDone ? "Batch Complete" : "Start Batch Conversion"}
                </button>
                
                {processedCount > 0 && (
                  <button 
                    onClick={handleDownloadZip}
                    disabled={isZipping || isProcessing || !libsLoaded}
                    className="w-full py-3 border-2 border-primary-500 text-primary-600 dark:text-primary-400 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-colors disabled:opacity-50"
                  >
                    {isZipping ? <Loader2 className="w-5 h-5 animate-spin" /> : <Archive className="w-5 h-5" />}
                    Download Batch as ZIP
                  </button>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Editor Column */}
        <div className="lg:col-span-7 space-y-6">
          <section className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 min-h-[500px] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-bold">Document Editor</h2>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={handleShare}
                  disabled={!finalText}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-colors disabled:opacity-30"
                  title="Share"
                >
                  <Share2 className="w-5 h-5" />
                </button>
                <button 
                  onClick={handleExport}
                  disabled={!finalText || !libsLoaded}
                  className="px-5 py-2.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl font-bold text-sm flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-30"
                >
                  <Download className="w-4 h-4" />
                  DOCX
                </button>
              </div>
            </div>
            
            <div className="flex-1 p-6">
               <Editor 
                content={finalText} 
                onChange={(val) => setFinalText(val)} 
                placeholder="Transcribed text will appear here. Batch processing will append all notes here sequentially as they finish..."
               />
            </div>
          </section>
        </div>
      </main>

      {/* Camera Overlay */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl overflow-hidden relative">
            <button 
              onClick={() => setIsCameraOpen(false)}
              className="absolute top-4 right-4 z-10 p-2 bg-black/20 rounded-full text-white hover:bg-black/40"
            >
              <Trash2 className="w-6 h-6" />
            </button>
            <CameraCapture onCapture={handleCapture} />
          </div>
        </div>
      )}

      {/* API Key Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md p-8 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-6">
               <h2 className="text-xl font-bold flex items-center gap-2">
                <Key className="w-5 h-5 text-primary-500" />
                Enter API Key
              </h2>
              {apiKey && (
                 <button onClick={() => setShowKeyModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                   <X className="w-5 h-5" />
                 </button>
              )}
            </div>
           
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              To use the handwriting recognition features, you need a Google Gemini API Key. The key is stored locally on your device.
            </p>

            <form onSubmit={(e) => { e.preventDefault(); const val = (e.target as any).keyInput.value; if(val) handleSaveKey(val); }}>
              <input 
                name="keyInput"
                type="password" 
                placeholder="AIza..." 
                defaultValue={apiKey}
                className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl mb-4 outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
              <button 
                type="submit"
                className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold transition-colors"
              >
                Save API Key
              </button>
            </form>

            <div className="mt-6 flex flex-col gap-4 text-center">
              <a 
                href="https://aistudio.google.com/app/apikey" 
                target="_blank" 
                rel="noreferrer"
                className="text-xs text-primary-500 font-bold hover:underline"
              >
                Get a free API Key from Google AI Studio
              </a>
              
              {apiKey && (
                <button 
                  onClick={handleRemoveKey}
                  className="text-xs text-red-500 font-bold hover:underline"
                >
                  Remove saved key
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Empty State Instruction */}
      {images.length === 0 && !isCameraOpen && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 max-w-md w-full px-6 py-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl flex items-center gap-4 animate-bounce z-40">
          <div className="p-2 bg-primary-100 rounded-lg">
            <Plus className="w-5 h-5 text-primary-600" />
          </div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Start by uploading or scanning multiple handwritten notes!
          </p>
        </div>
      )}
    </div>
  );
};

export default App;
