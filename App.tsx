
import React, { useState, useEffect, useCallback } from 'react';
import { 
  Camera, 
  Upload, 
  FileText, 
  Download, 
  Share2, 
  Moon, 
  Sun, 
  Play, 
  Settings,
  Loader2,
  Plus,
  Archive,
  AlertTriangle,
  RefreshCw,
  X
} from 'lucide-react';
import { BatchImage, OCRConfig } from './types.ts';
import CameraCapture from './components/CameraCapture.tsx';
import Editor from './components/Editor.tsx';
import BatchList from './components/BatchList.tsx';
import { processImageOCR } from './services/ocrService.ts';
import { generatePdf, generatePdfBlob } from './services/pdfService.ts';

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
  
  const [libsLoaded, setLibsLoaded] = useState(false);
  const [libsError, setLibsError] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const checkLibs = useCallback(() => {
    setLibsError(false);
    let attempts = 0;
    const maxAttempts = 30;

    const check = () => {
      // We check for jspdf in addition to existing libs
      const jspdfReady = (window as any).jspdf;
      const jszipReady = (window as any).JSZip;
      const saveAsReady = (window as any).saveAs;
      
      if (jspdfReady && jszipReady && saveAsReady) {
        setLibsLoaded(true);
        setLibsError(false);
      } else {
        attempts++;
        if (attempts >= maxAttempts) {
          setLibsError(true);
        } else {
          setTimeout(check, 1000);
        }
      }
    };
    check();
  }, []);

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
    setIsProcessing(true);

    const pendingItems = images
      .map((img, index) => ({ img, index }))
      .filter(item => item.img.status !== 'completed');

    if (pendingItems.length === 0) {
      setIsProcessing(false);
      return;
    }

    let nextIndexToAppend = pendingItems[0].index;
    const completedTexts = new Map<number, string>();
    const CONCURRENCY_LIMIT = 10;
    let queuePointer = 0;

    const tryAppendText = () => {
      setFinalText(prev => {
        let newText = prev;
        while (completedTexts.has(nextIndexToAppend)) {
          const textChunk = completedTexts.get(nextIndexToAppend);
          if (textChunk) {
            newText = newText ? newText + '\n\n' + textChunk : textChunk;
          }
          completedTexts.delete(nextIndexToAppend);
          nextIndexToAppend++;
        }
        return newText;
      });
    };

    const processItem = async (item: { img: BatchImage, index: number }) => {
      setImages(prev => prev.map((img, i) => i === item.index ? { ...img, status: 'processing' } : img));
      try {
        const text = await processImageOCR(
          item.img.previewUrl,
          config,
          (progress) => {
            setImages(prev => prev.map((img, i) => i === item.index ? { ...img, progress } : img));
          }
        );
        setImages(prev => prev.map((img, i) => i === item.index ? { ...img, status: 'completed', processedText: text } : img));
        completedTexts.set(item.index, text);
      } catch (err) {
        console.error(`Error processing image ${item.index}`, err);
        setImages(prev => prev.map((img, i) => i === item.index ? { ...img, status: 'error' } : img));
        const errorMessage = err instanceof Error ? err.message : "Transcription failed";
        completedTexts.set(item.index, `[Error: ${errorMessage}]`);
      } finally {
        tryAppendText();
      }
    };

    const runWorker = async () => {
      while (queuePointer < pendingItems.length) {
        const itemIdx = queuePointer++;
        const item = pendingItems[itemIdx];
        await processItem(item);
      }
    };

    const workers = Array(Math.min(CONCURRENCY_LIMIT, pendingItems.length))
      .fill(null)
      .map(() => runWorker());

    await Promise.all(workers);
    setIsProcessing(false);
  };

  const handleExport = async () => {
    if (!finalText) return;
    try {
      await generatePdf(finalText, "Handwritten_Notes_Export");
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  const handleDownloadZip = async () => {
    if (!libsLoaded) return;
    const JSZip = (window as any).JSZip;
    const saveAs = (window as any).saveAs;
    const completedImages = images.filter(img => img.status === 'completed');
    if (completedImages.length === 0) return;

    setIsZipping(true);
    try {
      const zip = new JSZip();
      for (let i = 0; i < completedImages.length; i++) {
        const img = completedImages[i];
        const text = img.processedText || "";
        const filename = `Note_Page_${i + 1}`;
        zip.file(`${filename}.txt`, text);
        const pdfBlob = await generatePdfBlob(text, `Note Page ${i + 1}`);
        zip.file(`${filename}.pdf`, pdfBlob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      saveAs(zipBlob, "Notes_Batch_Export.zip");
    } catch (err) {
      console.error("ZIP Generation failed:", err);
    } finally {
      setIsZipping(false);
    }
  };

  const handleShare = async () => {
    if (!finalText) return;
    const shareData = { title: 'Handwritten Notes Export', text: finalText };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch (err) { console.log('Share failed', err); }
    } else {
      navigator.clipboard.writeText(finalText);
      alert('Text copied to clipboard!');
    }
  };

  const processedCount = images.filter(img => img.status === 'completed').length;
  const isAllDone = images.length > 0 && processedCount === images.length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="flex justify-between items-center mb-10 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary-600 rounded-2xl shadow-lg shadow-primary-500/30">
            <FileText className="text-white w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">ScribbleToDoc</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-0.5">Professional OCR for Handwritten Notes</p>
          </div>
        </div>
        <button 
          onClick={() => setDarkMode(!darkMode)}
          className="p-2.5 rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-300"
        >
          {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </header>

      {!libsLoaded && !libsError && (
        <div className="mb-8 p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl flex items-center gap-3 text-amber-800 dark:text-amber-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <p className="text-sm font-medium">Loading PDF generation libraries...</p>
        </div>
      )}

      {libsError && (
        <div className="mb-8 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl flex items-center justify-between text-red-800 dark:text-red-400">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-4 h-4" />
            <p className="text-sm font-medium">Library load error. Export disabled.</p>
          </div>
          <button onClick={checkLibs} className="px-3 py-1.5 bg-white dark:bg-red-500/20 border border-red-200 dark:border-red-500/30 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-red-50 dark:hover:bg-red-500/30 transition-colors">
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          <section className="pro-card p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-semibold flex items-center gap-2 text-slate-800 dark:text-slate-100">
                <Camera className="w-4 h-4 text-primary-500" />
                Input Source
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setIsCameraOpen(true)} className="flex flex-col items-center justify-center p-6 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-all group">
                <Camera className="w-6 h-6 mb-3 text-slate-400 group-hover:text-primary-500 transition-colors" />
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300 group-hover:text-primary-600 dark:group-hover:text-primary-400">Camera Scan</span>
              </button>
              <label className="flex flex-col items-center justify-center p-6 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-all group cursor-pointer relative">
                <Upload className="w-6 h-6 mb-3 text-slate-400 group-hover:text-primary-500 transition-colors" />
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300 group-hover:text-primary-600 dark:group-hover:text-primary-400 text-center">Upload / Import Scan</span>
                <span className="text-[10px] text-slate-400 mt-1 text-center">Select images from your scanner</span>
                <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
          </section>

          <section className="pro-card p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-semibold flex items-center gap-2 text-slate-800 dark:text-slate-100">
                <Settings className="w-4 h-4 text-primary-500" />
                OCR Settings
              </h2>
              <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase flex items-center gap-1.5 ${isOnline ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                {isOnline ? 'Cloud AI' : 'Offline Mode'}
              </div>
            </div>
            <div className="space-y-5">
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2 block tracking-wider">Language</label>
                <select 
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 text-sm font-medium transition-shadow"
                  value={config.language}
                  onChange={(e) => setConfig({...config, language: e.target.value})}
                >
                  <option value="eng">English</option>
                  <option value="spa">Spanish</option>
                  <option value="fra">French</option>
                  <option value="deu">German</option>
                </select>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Auto-Enhance Image</span>
                <input type="checkbox" checked={config.grayscale} onChange={(e) => setConfig({...config, grayscale: e.target.checked})} className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
              </div>
              {!isOnline && (
                <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg flex items-start gap-2 text-amber-800 dark:text-amber-400 mt-4">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p className="text-xs leading-relaxed">
                    You are offline. The app will use local OCR, which works best for printed text but may struggle with messy handwriting. Connect to the internet for high-accuracy AI transcription.
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="pro-card p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Queue <span className="text-slate-400 font-normal text-sm ml-1">({images.length})</span></h2>
              {images.length > 0 && (
                <button onClick={() => {setImages([]); setFinalText(''); setCurrentIndex(-1);}} className="text-red-500 text-xs font-semibold hover:text-red-600 transition-colors">Clear All</button>
              )}
            </div>
            <BatchList items={images} onRemove={(id) => { const newItems = images.filter(img => img.id !== id); setImages(newItems); if (newItems.length === 0) setCurrentIndex(-1); }} onSelect={(index) => setCurrentIndex(index)} activeIndex={currentIndex} />
            {images.length > 0 && (
              <div className="mt-6 space-y-3">
                <button onClick={startBatchProcess} disabled={isProcessing || isAllDone} className="w-full py-3.5 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-sm">
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                  {isProcessing ? `Processing...` : isAllDone ? "Done" : "Start Conversion"}
                </button>
                {processedCount > 0 && (
                  <button onClick={handleDownloadZip} disabled={isZipping || isProcessing || !libsLoaded} className="w-full py-3 border border-primary-200 dark:border-primary-800 text-primary-600 dark:text-primary-400 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors disabled:opacity-50">
                    {isZipping ? <Loader2 className="w-5 h-5 animate-spin" /> : <Archive className="w-5 h-5" />}
                    Download ZIP (PDFs)
                  </button>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="lg:col-span-7 space-y-6">
          <section className="pro-card min-h-[500px] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Document Editor</h2>
              <div className="flex gap-2">
                <button onClick={handleShare} disabled={!finalText} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-30 text-slate-600 dark:text-slate-300">
                  <Share2 className="w-4 h-4" />
                </button>
                <button onClick={handleExport} disabled={!finalText || !libsLoaded} className="px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 rounded-lg font-semibold text-sm flex items-center gap-2 transition-colors disabled:opacity-30 disabled:bg-slate-400">
                  <Download className="w-4 h-4" /> Export PDF
                </button>
              </div>
            </div>
            <div className="flex-1 p-6 bg-slate-50/50 dark:bg-slate-900/50">
               <Editor content={finalText} onChange={(val) => setFinalText(val)} placeholder="Transcribed notes will appear here..." />
            </div>
          </section>
        </div>
      </main>

      {isCameraOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl w-full max-w-2xl overflow-hidden relative shadow-2xl border border-slate-800">
            <button onClick={() => setIsCameraOpen(false)} className="absolute top-4 right-4 z-10 p-2 bg-black/40 rounded-full text-white hover:bg-black/60 transition-colors">
              <X className="w-5 h-5" />
            </button>
            <CameraCapture onCapture={handleCapture} />
          </div>
        </div>
      )}

      {images.length === 0 && !isCameraOpen && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 max-w-sm w-full px-5 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full shadow-lg flex items-center gap-3 animate-bounce z-40">
          <div className="p-1.5 bg-primary-100 dark:bg-primary-900/30 rounded-full">
            <Plus className="w-4 h-4 text-primary-600 dark:text-primary-400" />
          </div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Scan or upload notes to start</p>
        </div>
      )}
    </div>
  );
};

export default App;
