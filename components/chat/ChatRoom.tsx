'use client';

import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '@/types/match';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';

interface ChatRoomProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => Promise<void>;
  currentUserName?: string | null;
}

export function ChatRoom({ messages, onSendMessage, currentUserName }: ChatRoomProps) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const previousMessagesLengthRef = useRef(messages.length);

  // Detect mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Track if user has manually scrolled away from bottom
  const handleScroll = () => {
    if (!scrollAreaRef.current) return;
    const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
    if (!scrollElement) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollElement;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50; // 50px threshold
    setHasScrolledToBottom(isAtBottom);
  };

  const scrollToBottom = (behavior: 'smooth' | 'auto' = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Handle new messages - only scroll if chat is open and user is at bottom
  useEffect(() => {
    const hasNewMessages = messages.length > previousMessagesLengthRef.current;
    previousMessagesLengthRef.current = messages.length;

    if (hasNewMessages) {
      // On desktop (lg+), chat is always visible, so check scroll position
      // On mobile, only scroll if chat is open
      if (!isMobile || isOpen) {
        // Desktop or mobile with chat open
        if (hasScrolledToBottom) {
          scrollToBottom('smooth');
        }
      } else if (isMobile && !isOpen) {
        // Mobile with chat closed - increment unread count
        setUnreadCount(prev => prev + 1);
      }
    }
  }, [messages, isOpen, hasScrolledToBottom, isMobile]);

  // Reset unread count and scroll when chat is opened on mobile
  useEffect(() => {
    if (isMobile && isOpen) {
      setUnreadCount(0);
      // Small delay to ensure DOM is updated before scrolling
      setTimeout(() => {
        scrollToBottom('auto');
        setHasScrolledToBottom(true);
      }, 100);
    }
  }, [isOpen, isMobile]);

  // On desktop, always show chat content and scroll on new messages if at bottom
  // On mobile, respect the isOpen state
  const shouldShowContent = !isMobile || isOpen;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;

    setSending(true);
    try {
      await onSendMessage(input.trim());
      setInput('');
      // After sending, scroll to bottom
      setTimeout(() => {
        scrollToBottom('smooth');
        setHasScrolledToBottom(true);
      }, 100);
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleHeaderClick = () => {
    if (isMobile) {
      setIsOpen(!isOpen);
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
      {/* Header - clickable on mobile */}
      <CardHeader
        className="pb-3 lg:cursor-default"
        onClick={handleHeaderClick}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">Chat</CardTitle>
            {unreadCount > 0 && (
              <Badge variant="default" className="h-5 min-w-5 px-1.5 flex items-center justify-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </Badge>
            )}
          </div>
          {/* Mobile toggle button */}
          <button
            type="button"
            className="lg:hidden"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(!isOpen);
            }}
            aria-label={isOpen ? 'Close chat' : 'Open chat'}
          >
            {isOpen ? (
              <ChevronDown className="h-5 w-5" />
            ) : (
              <ChevronUp className="h-5 w-5" />
            )}
          </button>
        </div>
      </CardHeader>

      {/* Mobile: Show closed state indicator */}
      <div className="lg:hidden">
        {!isOpen && (
          <CardContent className="p-4 text-center">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs text-muted-foreground">
              {unreadCount > 0
                ? `${unreadCount} new message${unreadCount > 1 ? 's' : ''}`
                : 'Tap to open chat'
              }
            </p>
          </CardContent>
        )}
      </div>

      {/* Chat content - always visible on desktop, conditional on mobile */}
      {shouldShowContent && (
        <>
          <Separator />
          <CardContent className="flex-1 p-3 flex flex-col min-h-0">
            <ScrollArea
              className="flex-1 pr-4"
              ref={scrollAreaRef}
              onScroll={handleScroll}
            >
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
        </>
      )}
    </Card>
  );
}
