import { useEffect, useState, useCallback } from 'react';
import * as Y from 'yjs';

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  color: string;
  text: string;
  timestamp: number;
}

export function useChat(ydoc: Y.Doc, userId: string, userName: string, userColor: string) {
  const chatArray = ydoc.getArray<ChatMessage>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const syncMessages = useCallback(() => {
    setMessages(chatArray.toArray());
  }, [chatArray]);

  useEffect(() => {
    syncMessages();
    chatArray.observe(syncMessages);
    return () => chatArray.unobserve(syncMessages);
  }, [chatArray, syncMessages]);

  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const msg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId,
      userName,
      color: userColor,
      text: trimmed,
      timestamp: Date.now(),
    };
    chatArray.push([msg]);
  }, [chatArray, userId, userName, userColor]);

  return { messages, sendMessage };
}
