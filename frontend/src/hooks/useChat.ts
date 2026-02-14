import { useState, useCallback, useRef } from 'react';
import api from '../lib/api';
import type { ChatMessage, ChatResponse } from '../types/robot';

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const conversationId = useRef<string | null>(null);

  const sendMessage = useCallback(async (query: string) => {
    // Add user message
    const userMsg: ChatMessage = {
      role: 'user',
      content: query,
      timestamp: new Date().toISOString(),
      robot_ids: [],
      suggested_followups: [],
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const { data } = await api.post<ChatResponse>('/chat', {
        query,
        conversation_id: conversationId.current,
      });

      conversationId.current = data.conversation_id;

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.response,
        timestamp: new Date().toISOString(),
        robot_ids: data.robot_ids,
        suggested_followups: data.suggested_followups,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: ChatMessage = {
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        timestamp: new Date().toISOString(),
        robot_ids: [],
        suggested_followups: ['What is the fleet status?', 'Show me robots with errors'],
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    conversationId.current = null;
  }, []);

  return { messages, loading, sendMessage, clearChat };
}
