import { useEffect, useState, useCallback } from 'react';
import * as Y from 'yjs';

export interface CommentReply {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: number;
}

export interface Comment {
  id: string;
  selectedText: string;
  author: { userId: string; userName: string; color: string };
  text: string;
  createdAt: number;
  resolved: boolean;
  replies: CommentReply[];
}

export function useComments(ydoc: Y.Doc, userId: string, userName: string, userColor: string) {
  const commentsMap = ydoc.getMap<any>('comments');
  const [comments, setComments] = useState<Comment[]>([]);

  const syncComments = useCallback(() => {
    const result: Comment[] = [];
    commentsMap.forEach((val) => {
      if (val && typeof val === 'object') result.push(val as Comment);
    });
    result.sort((a, b) => a.createdAt - b.createdAt);
    setComments(result);
  }, [commentsMap]);

  useEffect(() => {
    syncComments();
    commentsMap.observe(syncComments);
    return () => commentsMap.unobserve(syncComments);
  }, [commentsMap, syncComments]);

  const addComment = useCallback((selectedText: string, text: string) => {
    const id = `comment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const comment: Comment = {
      id,
      selectedText,
      author: { userId, userName, color: userColor },
      text,
      createdAt: Date.now(),
      resolved: false,
      replies: [],
    };
    commentsMap.set(id, comment);
  }, [commentsMap, userId, userName, userColor]);

  const addReply = useCallback((commentId: string, text: string) => {
    const existing = commentsMap.get(commentId);
    if (!existing) return;
    const reply: CommentReply = {
      id: `reply-${Date.now()}`,
      userId,
      userName,
      text,
      createdAt: Date.now(),
    };
    commentsMap.set(commentId, {
      ...existing,
      replies: [...(existing.replies || []), reply],
    });
  }, [commentsMap, userId, userName]);

  const resolveComment = useCallback((commentId: string, resolved: boolean) => {
    const existing = commentsMap.get(commentId);
    if (!existing) return;
    commentsMap.set(commentId, { ...existing, resolved });
  }, [commentsMap]);

  const deleteComment = useCallback((commentId: string) => {
    commentsMap.delete(commentId);
  }, [commentsMap]);

  return { comments, addComment, addReply, resolveComment, deleteComment };
}
