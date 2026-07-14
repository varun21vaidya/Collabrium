import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { useYjsDocument } from '../hooks/useYjsDocument';
import { useComments } from '../hooks/useComments';
import { useChat } from '../hooks/useChat';
import PresenceBar from './PresenceBar';
import ConnectionStatus from './ConnectionStatus';
import ErrorBoundary from './ErrorBoundary';
import Toolbar from './Toolbar';
import { DocumentHeader } from './DocumentHeader';
import { ShareModal } from './ShareModal';
import { VersionHistory } from './VersionHistory';
import { CommentsSidebar } from './CommentsSidebar';
import { ChatPanel } from './ChatPanel';
import { getUserColor } from '../lib/userColor';

interface EditorProps {
  documentId: string;
  token: string;
  userName: string;
  userId: string;
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  initialTitle?: string;
  initialDescription?: string;
}

type SidebarTab = 'comments' | 'chat';

const Editor: React.FC<EditorProps> = ({ documentId, token, userName, userId, addToast, initialTitle = 'Untitled document', initialDescription = '' }) => {
  const userColor = getUserColor(userId);
  const { ydoc, provider, status } = useYjsDocument(documentId, token, userName, userColor);
  const { comments, addComment, addReply, resolveComment, deleteComment } = useComments(ydoc, userId, userName, userColor);
  const { messages, sendMessage } = useChat(ydoc, userId, userName, userColor);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('comments');
  const [showShare, setShowShare] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [addingComment, setAddingComment] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [selectedText, setSelectedText] = useState('');

  const unreadChat = useRef(0);
  const [chatBadge, setChatBadge] = useState(0);

  useEffect(() => {
    if (!sidebarOpen || sidebarTab !== 'chat') {
      const count = messages.length - unreadChat.current;
      if (count > 0) setChatBadge(count);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const openChat = () => {
    setSidebarTab('chat');
    setSidebarOpen(true);
    unreadChat.current = messages.length;
    setChatBadge(0);
  };

  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ history: false }),
        Collaboration.configure({ document: ydoc }),
        CollaborationCursor.configure({
          provider,
          user: { name: userName, color: userColor },
          render: (user: { name: string; color: string }) => {
            const cursor = document.createElement('span');
            cursor.classList.add('collaboration-cursor__caret');
            cursor.setAttribute('style', `border-color: ${user.color}`);
            const label = document.createElement('div');
            label.classList.add('collaboration-cursor__label');
            label.setAttribute('style', `background-color: ${user.color}`);
            label.textContent = user.name;
            cursor.appendChild(label);
            return cursor;
          },
        }),
      ],
      content: '',
      onSelectionUpdate: ({ editor: currentEditor }) => {
        if (throttleRef.current) return;
        throttleRef.current = setTimeout(() => {
          throttleRef.current = null;
          const { from, to } = currentEditor.state.selection;
          if (from !== to) {
            const text = currentEditor.state.doc.textBetween(from, to);
            setSelectedText(text);
          } else {
            setSelectedText('');
          }
        }, 50);
      },
    },
    [ydoc, provider]
  );

  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      editor.chain().focus().run();
    }
  }, [editor]);

  const handleAddComment = useCallback(() => {
    if (!commentInput.trim()) return;
    addComment(selectedText, commentInput);
    setCommentInput('');
    setAddingComment(false);
    setSidebarTab('comments');
    setSidebarOpen(true);
    addToast('Comment added', 'success');
  }, [commentInput, selectedText, addComment, addToast]);

  if (status !== 'connected') {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <div className="w-10 h-10 rounded-full border-2 border-violet-500 border-t-transparent animate-spin mb-4" />
        <p className="text-slate-400 text-sm">
          {status === 'connecting' ? 'Connecting to server...' : 'Reconnecting...'}
        </p>
        <p className="text-slate-600 text-xs mt-1">{documentId}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <DocumentHeader
        ydoc={ydoc}
        documentId={documentId}
        token={token}
        initialTitle={initialTitle}
        initialDescription={initialDescription}
        addToast={addToast}
        onShare={() => setShowShare(true)}
        onHistory={() => setShowHistory(true)}
      />

      {/* Toolbar */}
      <div className="border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <Toolbar editor={editor} />
          </div>
          <div className="flex items-center gap-2 pr-3">
            <PresenceBar provider={provider} />
            <ConnectionStatus status={status} />

            {/* Comment button */}
            {selectedText && (
              <button
                type="button"
                onClick={() => setAddingComment(true)}
                className="px-2.5 py-1 text-xs font-medium bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 rounded-lg transition-colors animate-fadeIn"
              >
                💬 Comment
              </button>
            )}

            {/* Sidebar toggle */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => { setSidebarTab('comments'); setSidebarOpen(!sidebarOpen || sidebarTab !== 'comments'); }}
                className={`p-2 rounded-lg text-sm transition-colors ${
                  sidebarOpen && sidebarTab === 'comments'
                    ? 'bg-violet-600/30 text-violet-300'
                    : 'text-slate-400 hover:text-slate-200 glass'
                }`}
                title="Comments"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={openChat}
                className={`relative p-2 rounded-lg text-sm transition-colors ${
                  sidebarOpen && sidebarTab === 'chat'
                    ? 'bg-violet-600/30 text-violet-300'
                    : 'text-slate-400 hover:text-slate-200 glass'
                }`}
                title="Team Chat"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                </svg>
                {chatBadge > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold">
                    {chatBadge}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add comment input */}
      {addingComment && (
        <div className="px-6 py-3 border-b border-white/10 bg-amber-500/5 animate-fadeIn">
          <div className="flex gap-2 items-center">
            <span className="text-xs text-amber-400 font-medium flex-shrink-0">Comment on: "{selectedText.slice(0, 40)}{selectedText.length > 40 ? '…' : ''}"</span>
            <input
              autoFocus
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddComment(); if (e.key === 'Escape') setAddingComment(false); }}
              placeholder="Add your comment..."
              className="flex-1 bg-white/5 border border-amber-500/30 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
            <button type="button" onClick={handleAddComment} className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold rounded-lg transition-colors">Add</button>
            <button type="button" onClick={() => setAddingComment(false)} className="px-2 py-1.5 text-slate-500 hover:text-slate-300 text-xs">Cancel</button>
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-8 py-8">
            <ErrorBoundary fallback={<div className="text-center py-8 text-red-400">Editor failed to load. Please refresh.</div>}>
              <EditorContent editor={editor} />
            </ErrorBoundary>
          </div>
        </div>

        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-72 border-l border-white/10 flex flex-col animate-slideInRight overflow-hidden" style={{ background: 'rgba(15,15,23,0.8)' }}>
            {/* Sidebar tabs */}
            <div className="flex border-b border-white/10">
              {(['comments', 'chat'] as SidebarTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setSidebarTab(tab)}
                  className={`flex-1 py-2.5 text-xs font-semibold capitalize transition-colors ${
                    sidebarTab === tab
                      ? 'text-violet-300 border-b-2 border-violet-500'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {tab === 'comments' ? `💬 Comments (${comments.filter(c => !c.resolved).length})` : '🗨️ Chat'}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="px-3 text-slate-500 hover:text-slate-300 transition-colors"
                aria-label="Close sidebar"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-hidden">
              {sidebarTab === 'comments' ? (
                <CommentsSidebar
                  comments={comments}
                  onAddReply={addReply}
                  onResolve={resolveComment}
                  onDelete={deleteComment}
                  currentUserId={userId}
                />
              ) : (
                <ChatPanel messages={messages} onSend={sendMessage} currentUserId={userId} />
              )}
            </div>
          </div>
        )}
      </div>

      {showShare && (
        <ShareModal
          documentId={documentId}
          token={token}
          onClose={() => setShowShare(false)}
          addToast={addToast}
        />
      )}
      {showHistory && (
        <VersionHistory
          documentId={documentId}
          token={token}
          onClose={() => setShowHistory(false)}
          addToast={addToast}
        />
      )}
    </div>
  );
};

export default Editor;
