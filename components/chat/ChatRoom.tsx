'use client';

import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '@/types/match';

interface ChatRoomProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => Promise<void>;
  currentUserName?: string | null;
}

export function ChatRoom({ messages, onSendMessage, currentUserName }: ChatRoomProps) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;

    setSending(true);
    try {
      await onSendMessage(input.trim());
      setInput('');
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const isOwnMessage = (message: ChatMessage) => {
    return currentUserName && message.user_name && message.user_name === currentUserName;
  };

  const getDisplayName = (message: ChatMessage) => {
    return message.username || message.user_name || 'Anonymous';
  };

  return (
    <div className="flex flex-col h-full bg-[#343A40] border border-[#495057] rounded-lg">
      <div className="p-3 border-b border-[#495057]">
        <h3 className="text-sm font-semibold text-[#ADB5BD]">Chat</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 ? (
          <p className="text-xs text-[#6C757D] text-center">No messages yet. Start the conversation!</p>
        ) : (
          messages.map((message) => {
            const isOwn = isOwnMessage(message);
            return (
              <div
                key={message.id}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-lg ${
                    isOwn
                      ? 'bg-[#495057] text-white'
                      : 'bg-[#212529] text-[#ADB5BD]'
                  }`}
                >
                  {!isOwn && (
                    <div className="text-xs font-semibold mb-1 opacity-75">
                      {getDisplayName(message)}
                    </div>
                  )}
                  <div className="text-xs">{message.message}</div>
                  <div className={`text-[10px] mt-1 ${isOwn ? 'text-[#ADB5BD]' : 'text-[#6C757D]'}`}>
                    {new Date(message.created_at).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSubmit} className="p-3 border-t border-[#495057]">
        <div className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 bg-[#495057] border border-[#6C757D] rounded-md text-white placeholder-[#6C757D] focus:outline-none focus:ring-2 focus:ring-[#ADB5BD] text-sm"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="px-3 py-2 bg-[#495057] hover:bg-[#6C757D] text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#ADB5BD] disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {sending ? '...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
