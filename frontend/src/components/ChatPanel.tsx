import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../hooks/useChat';

interface Props {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  currentUserId: string;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const ChatPanel: React.FC<Props> = ({ messages, onSend, currentUserId }) => {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-white/10">
        <span className="text-sm font-semibold text-slate-300">Team Chat</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="text-3xl mb-2">🗨️</div>
            <p className="text-sm text-slate-400">No messages yet.</p>
            <p className="text-xs text-slate-500 mt-1">Start the conversation!</p>
          </div>
        )}
        {messages.map((msg) => {
          const isMe = msg.userId === currentUserId;
          return (
            <div key={msg.id} className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
              {!isMe && (
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: msg.color + '40', color: msg.color }}
                >
                  {msg.userName.charAt(0)}
                </div>
              )}
              <div className={`max-w-[80%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                {!isMe && (
                  <span className="text-xs text-slate-500 mb-1 ml-1">{msg.userName}</span>
                )}
                <div
                  className={`px-3 py-2 rounded-2xl text-sm ${
                    isMe
                      ? 'bg-violet-600 text-white rounded-br-md'
                      : 'glass text-slate-200 rounded-bl-md'
                  }`}
                >
                  {msg.text}
                </div>
                <span className="text-xs text-slate-600 mt-1 mx-1">{formatTime(msg.timestamp)}</span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 pb-4 pt-2 border-t border-white/10">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Message..."
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
          />
          <button
            onClick={handleSend}
            className="px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl transition-colors flex-shrink-0"
            aria-label="Send message"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
