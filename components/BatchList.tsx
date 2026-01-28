
import React from 'react';
import { X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { BatchImage } from '../types';

interface Props {
  items: BatchImage[];
  onRemove: (id: string) => void;
  onSelect: (index: number) => void;
  activeIndex: number;
}

const BatchList: React.FC<Props> = ({ items, onRemove, onSelect, activeIndex }) => {
  if (items.length === 0) {
    return (
      <div className="py-12 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-400">
        <p className="text-sm">No images in queue</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
      {items.map((item, index) => (
        <div 
          key={item.id}
          className={`group flex items-center gap-3 p-3 rounded-2xl transition-all cursor-pointer border ${
            activeIndex === index 
              ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800' 
              : 'bg-slate-50 dark:bg-slate-800/50 border-transparent hover:border-slate-200 dark:hover:border-slate-700'
          }`}
          onClick={() => onSelect(index)}
        >
          <div className="relative w-14 h-14 flex-shrink-0">
            <img 
              src={item.previewUrl} 
              alt="Scan" 
              className="w-full h-full object-cover rounded-xl shadow-sm"
            />
            {item.status === 'processing' && (
              <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              </div>
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate">Note Page #{index + 1}</p>
            <div className="flex items-center gap-2 mt-1">
              {item.status === 'completed' ? (
                <span className="flex items-center gap-1 text-[10px] font-bold text-green-500 uppercase">
                  <CheckCircle className="w-3 h-3" /> Ready
                </span>
              ) : item.status === 'error' ? (
                <span className="flex items-center gap-1 text-[10px] font-bold text-red-500 uppercase">
                  <AlertCircle className="w-3 h-3" /> Error
                </span>
              ) : item.status === 'processing' ? (
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full mt-1 overflow-hidden">
                  <div 
                    className="bg-primary-500 h-full transition-all duration-300" 
                    style={{ width: `${item.progress * 100}%` }}
                  />
                </div>
              ) : (
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pending</span>
              )}
            </div>
          </div>

          <button 
            onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};

export default BatchList;
