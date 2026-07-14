import React from 'react';
import type { Editor } from '@tiptap/react';

interface ToolbarProps {
  editor: Editor | null;
}

const Toolbar: React.FC<ToolbarProps> = ({ editor }) => {
  if (!editor) return null;

  const btn = (action: () => void, isActive: boolean, title: string, children: React.ReactNode) => (
    <button
      key={title}
      type="button"
      onMouseDown={(e) => { e.preventDefault(); action(); }}
      className={`relative px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all flex-shrink-0 ${
        isActive
          ? 'bg-violet-600/40 text-violet-300 shadow-sm'
          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
      }`}
      title={title}
      aria-label={title}
      aria-pressed={isActive}
    >
      {children}
    </button>
  );

  const divider = <div className="w-px h-5 bg-white/10 mx-0.5 flex-shrink-0" />;

  return (
    <div
      className="flex items-center gap-0.5 px-3 py-2 overflow-x-auto"
      role="toolbar"
      aria-label="Text formatting"
    >
      {btn(() => editor.chain().focus().undo().run(), false, 'Undo (Ctrl+Z)',
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
      )}
      {btn(() => editor.chain().focus().redo().run(), false, 'Redo (Ctrl+Shift+Z)',
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
      )}
      {divider}
      {btn(() => editor.chain().focus().toggleBold().run(), editor.isActive('bold'), 'Bold (Ctrl+B)',
        <strong className="text-xs tracking-wide">B</strong>
      )}
      {btn(() => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'), 'Italic (Ctrl+I)',
        <em className="text-xs">I</em>
      )}
      {btn(() => editor.chain().focus().toggleStrike().run(), editor.isActive('strike'), 'Strikethrough',
        <span className="text-xs line-through">S</span>
      )}
      {btn(() => editor.chain().focus().toggleCode().run(), editor.isActive('code'), 'Inline Code',
        <span className="font-mono text-xs">{'< >'}</span>
      )}
      {divider}
      {btn(() => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive('heading', { level: 1 }), 'Heading 1',
        <span className="text-xs font-bold">H1</span>
      )}
      {btn(() => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }), 'Heading 2',
        <span className="text-xs font-bold">H2</span>
      )}
      {btn(() => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive('heading', { level: 3 }), 'Heading 3',
        <span className="text-xs font-bold">H3</span>
      )}
      {divider}
      {btn(() => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'), 'Bullet List',
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
      )}
      {btn(() => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'), 'Numbered List',
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h10M7 16h10M3 8l.01-.011M3 12l.01-.011M3 16l.01-.011" /></svg>
      )}
      {btn(() => editor.chain().focus().toggleCodeBlock().run(), editor.isActive('codeBlock'), 'Code Block',
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
      )}
      {btn(() => editor.chain().focus().toggleBlockquote().run(), editor.isActive('blockquote'), 'Blockquote',
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
      )}
      {btn(() => editor.chain().focus().setHorizontalRule().run(), false, 'Horizontal Rule',
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" /></svg>
      )}
    </div>
  );
};

export default Toolbar;
