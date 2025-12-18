'use client';

import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '@/types/match';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

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
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Chat</CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="flex-1 p-3 flex flex-col">
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-2">
            {messages.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No messages yet. Start the conversation!</p>
            ) : (
              messages.map((message) => {
                const isOwn = isOwnMessage(message);
                const displayName = getDisplayName(message);
                const initials = displayName
                  .split(' ')
                  .map(n => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2);

                return (
                  <div
                    key={message.id}
                    className={`flex gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isOwn && (
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={`max-w-[80%] px-3 py-2 rounded-lg ${
                        isOwn
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground'
                      }`}
                    >
                      {!isOwn && (
                        <div className="text-xs font-semibold mb-1 opacity-75">
                          {displayName}
                        </div>
                      )}
                      <div className="text-xs">{message.message}</div>
                      <div className={`text-[10px] mt-1 ${isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                        {new Date(message.created_at).toLocaleTimeString()}
                      </div>
                    </div>
                    {isOwn && (
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
        <Separator className="my-2" />
        <form onSubmit={handleSubmit} className="flex space-x-2">
          <Input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={sending}
            className="flex-1"
          />
          <Button
            type="submit"
            disabled={sending || !input.trim()}
            size="sm"
          >
            {sending ? '...' : 'Send'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
