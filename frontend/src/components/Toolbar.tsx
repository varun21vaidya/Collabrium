import React from 'react';
import type { Editor } from '@tiptap/react';

interface ToolbarProps {
  editor: Editor | null;
}

const Toolbar: React.FC<ToolbarProps> = ({ editor }) => {
  if (!editor) return null;

  const buttons = [
    { action: () => editor.chain().focus().undo().run(), isActive: () => false, label: 'Undo', shortcut: 'Ctrl+Z', icon: '\u21A9' },
    { action: () => editor.chain().focus().redo().run(), isActive: () => false, label: 'Redo', shortcut: 'Ctrl+Shift+Z', icon: '\u21AA' },
    { type: 'divider' as const },
    { action: () => editor.chain().focus().toggleBold().run(), isActive: () => editor.isActive('bold'), label: 'Bold', shortcut: 'Ctrl+B', icon: 'B' },
    { action: () => editor.chain().focus().toggleItalic().run(), isActive: () => editor.isActive('italic'), label: 'Italic', shortcut: 'Ctrl+I', icon: 'I' },
    { action: () => editor.chain().focus().toggleStrike().run(), isActive: () => editor.isActive('strike'), label: 'Strikethrough', shortcut: 'Ctrl+S', icon: 'S' },
    { type: 'divider' as const },
    { action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), isActive: () => editor.isActive('heading', { level: 1 }), label: 'Heading 1', icon: 'H1' },
    { action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), isActive: () => editor.isActive('heading', { level: 2 }), label: 'Heading 2', icon: 'H2' },
    { type: 'divider' as const },
    { action: () => editor.chain().focus().toggleBulletList().run(), isActive: () => editor.isActive('bulletList'), label: 'Bullet List', icon: '\u2022' },
    { action: () => editor.chain().focus().toggleOrderedList().run(), isActive: () => editor.isActive('orderedList'), label: 'Numbered List', icon: '1.' },
    { type: 'divider' as const },
    { action: () => editor.chain().focus().toggleCodeBlock().run(), isActive: () => editor.isActive('codeBlock'), label: 'Code Block', icon: '<>' },
    { action: () => editor.chain().focus().toggleBlockquote().run(), isActive: () => editor.isActive('blockquote'), label: 'Quote', icon: '\u201C' },
  ];

  return (
    <div className="flex items-center gap-1 p-2 border-b border-gray-200 overflow-x-auto" role="toolbar" aria-label="Text formatting">
      {buttons.map((btn, i) => {
        if ('type' in btn) {
          return <div key={i} className="w-px h-6 bg-gray-200 mx-1 flex-shrink-0" />;
        }
        const active = btn.isActive();
        return (
          <button
            key={i}
            onClick={btn.action}
            className={`px-2.5 py-1.5 rounded text-sm font-medium transition-colors flex-shrink-0 ${
              active ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
            }`}
            aria-label={btn.label}
            title={`${btn.label}${btn.shortcut ? ` (${btn.shortcut})` : ''}`}
          >
            {btn.icon}
          </button>
        );
      })}
    </div>
  );
};

export default Toolbar;
