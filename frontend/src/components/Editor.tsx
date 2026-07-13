import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { useYjsDocument } from '../hooks/useYjsDocument';
import PresenceBar from './PresenceBar';
import ConnectionStatus from './ConnectionStatus';
import ErrorBoundary from './ErrorBoundary';
import Toolbar from './Toolbar';
import { getUserColor } from '../lib/userColor';

interface EditorProps {
  documentId: string;
  token: string;
  userName: string;
  userId: string;
}

const Editor: React.FC<EditorProps> = ({ documentId, token, userName, userId }) => {
  const userColor = getUserColor(userId);
  const { ydoc, provider, status } = useYjsDocument(documentId, token, userName, userColor);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          history: false,
        }),
        Collaboration.configure({
          document: ydoc,
        }),
        CollaborationCursor.configure({
          provider,
          user: { name: userName, color: userColor },
          render: (user: { name: string; color: string }) => {
            const cursor = document.createElement('span');
            cursor.classList.add('collaboration-cursor__caret');
            cursor.setAttribute('style', `border-color: ${user.color}`);

            const label = document.createElement('div');
            label.classList.add('collaboration-cursor__label');
            label.setAttribute(
              'style',
              `background-color: ${user.color}; color: white; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; white-space: nowrap; position: relative; top: -1.4em; left: -1px;`
            );
            label.textContent = user.name;

            cursor.appendChild(label);
            return cursor;
          },
        }),
      ],
      content: 'Start collaborating...',
    },
    [ydoc, provider]
  );

  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      editor.chain().focus().run();
    }
  }, [editor]);

  if (status !== 'connected') {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-gray-800">{documentId}</h1>
          <ConnectionStatus status={status} />
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 text-sm">
              {status === 'connecting' ? 'Connecting to server...' : 'Syncing document...'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-800">{documentId}</h1>
        <div className="flex items-center gap-4">
          <PresenceBar provider={provider} />
          <ConnectionStatus status={status} />
        </div>
      </div>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <Toolbar editor={editor} />
        <div className="p-6">
          <ErrorBoundary fallback={<div className="text-center py-8 text-red-500">Editor failed to load. Please refresh the page.</div>}>
            <EditorContent editor={editor} />
          </ErrorBoundary>
        </div>
      </div>
      <style>{`
        .collaboration-cursor__caret {
          border-left: 2px solid;
          border-right: 2px solid;
          margin-left: -1px;
          margin-right: -1px;
          box-decoration-break: clone;
          position: relative;
        }
        .ProseMirror {
          outline: none;
          min-height: 400px;
        }
        .ProseMirror p {
          margin: 1em 0;
        }
        .ProseMirror h1, .ProseMirror h2, .ProseMirror h3 {
          margin: 1.5em 0 0.5em 0;
          font-weight: 700;
        }
        .ProseMirror ul, .ProseMirror ol {
          margin: 1em 0;
          padding-left: 2em;
        }
      `}</style>
    </div>
  );
};

export default Editor;
