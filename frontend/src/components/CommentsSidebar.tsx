import React, { useState } from 'react';
import type { Comment } from '../hooks/useComments';

interface Props {
  comments: Comment[];
  onAddReply: (commentId: string, text: string) => void;
  onResolve: (commentId: string, resolved: boolean) => void;
  onDelete: (commentId: string) => void;
  currentUserId: string;
}

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const CommentsSidebar: React.FC<Props> = ({ comments, onAddReply, onResolve, onDelete, currentUserId }) => {
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [showResolved, setShowResolved] = useState(false);

  const visible = comments.filter((c) => showResolved || !c.resolved);

  const handleReply = (commentId: string) => {
    if (!replyText.trim()) return;
    onAddReply(commentId, replyText);
    setReplyText('');
    setReplyingTo(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="text-sm font-semibold text-slate-300">Comments</span>
        <button
          onClick={() => setShowResolved(!showResolved)}
          className="text-xs text-slate-400 hover:text-violet-400 transition-colors"
        >
          {showResolved ? 'Hide resolved' : 'Show resolved'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 p-4">
        {visible.length === 0 && (
          <div className="text-center py-8">
            <div className="text-3xl mb-2">💬</div>
            <p className="text-sm text-slate-400">No comments yet.</p>
            <p className="text-xs text-slate-500 mt-1">Select text in the editor to add one.</p>
          </div>
        )}

        {visible.map((comment) => (
          <div key={comment.id} className={`glass rounded-xl p-3 ${comment.resolved ? 'opacity-50' : ''}`}>
            <div className="flex items-start gap-2 mb-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                style={{ backgroundColor: comment.author.color + '40', color: comment.author.color }}
              >
                {comment.author.userName.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-200">{comment.author.userName}</span>
                  <span className="text-xs text-slate-500">{formatTime(comment.createdAt)}</span>
                </div>
                {comment.selectedText && (
                  <div className="text-xs text-violet-400 italic truncate mt-0.5">"{comment.selectedText}"</div>
                )}
                <p className="text-sm text-slate-300 mt-1">{comment.text}</p>
              </div>
            </div>

            {/* Replies */}
            {comment.replies?.map((reply) => (
              <div key={reply.id} className="ml-8 mt-2 flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {reply.userName.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-300">{reply.userName}</span>
                    <span className="text-xs text-slate-500">{formatTime(reply.createdAt)}</span>
                  </div>
                  <p className="text-sm text-slate-400 mt-0.5">{reply.text}</p>
                </div>
              </div>
            ))}

            {/* Reply input */}
            {replyingTo === comment.id ? (
              <div className="ml-8 mt-2 flex gap-2">
                <input
                  autoFocus
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleReply(comment.id)}
                  placeholder="Reply..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500"
                />
                <button onClick={() => handleReply(comment.id)} className="text-xs text-violet-400 hover:text-violet-300">
                  Send
                </button>
                <button onClick={() => setReplyingTo(null)} className="text-xs text-slate-500 hover:text-slate-300">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 mt-2 ml-8">
                <button
                  onClick={() => { setReplyingTo(comment.id); setReplyText(''); }}
                  className="text-xs text-slate-500 hover:text-violet-400 transition-colors"
                >Reply</button>
                <button
                  onClick={() => onResolve(comment.id, !comment.resolved)}
                  className="text-xs text-slate-500 hover:text-emerald-400 transition-colors"
                >{comment.resolved ? 'Unresolve' : 'Resolve'}</button>
                {comment.author.userId === currentUserId && (
                  <button
                    onClick={() => onDelete(comment.id)}
                    className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                  >Delete</button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
