
import React from 'react';
import { Bold, Italic, List, Heading1, Heading2 } from 'lucide-react';

interface Props {
  content: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

const Editor: React.FC<Props> = ({ content, onChange, placeholder }) => {
  const insertText = (before: string, after: string = '') => {
    const textarea = document.getElementById('main-editor') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);
    const newText = text.substring(0, start) + before + selectedText + after + text.substring(end);
    
    onChange(newText);
    
    // Reset focus and selection
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, end + before.length);
    }, 0);
  };

  return (
    <div className="flex flex-col h-full border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden focus-within:ring-2 focus-within:ring-primary-500 transition-all">
      <div className="flex items-center gap-1 p-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
        <button onClick={() => insertText('**', '**')} className="p-2 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors" title="Bold">
          <Bold className="w-4 h-4" />
        </button>
        <button onClick={() => insertText('_', '_')} className="p-2 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors" title="Italic">
          <Italic className="w-4 h-4" />
        </button>
        <div className="w-[1px] h-4 bg-slate-300 dark:bg-slate-600 mx-1" />
        <button onClick={() => insertText('# ')} className="p-2 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors" title="Heading 1">
          <Heading1 className="w-4 h-4" />
        </button>
        <button onClick={() => insertText('## ')} className="p-2 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors" title="Heading 2">
          <Heading2 className="w-4 h-4" />
        </button>
        <button onClick={() => insertText('- ')} className="p-2 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors" title="List Item">
          <List className="w-4 h-4" />
        </button>
      </div>
      <textarea
        id="main-editor"
        className="flex-1 p-6 bg-transparent outline-none resize-none text-lg font-medium leading-relaxed custom-scrollbar min-h-[400px]"
        value={content}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
};

export default Editor;
