'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Match, MoveRecord, ChatMessage } from '@/types/match';

interface UseRealtimeMatchOptions {
  matchId: string;
  onMove?: (move: MoveRecord) => void;
  onChatMessage?: (message: ChatMessage) => void;
  onMatchUpdate?: (match: Match) => void;
}

export function useRealtimeMatch({
  matchId,
  onMove,
  onChatMessage,
  onMatchUpdate,
}: UseRealtimeMatchOptions) {
  const [match, setMatch] = useState<Match | null>(null);
  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial match data
  useEffect(() => {
    const fetchMatch = async () => {
      try {
        const { data, error } = await supabase
          .from('matches')
          .select('*')
          .eq('id', matchId)
          .single();

        if (error) throw error;
        setMatch(data as Match);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (matchId) {
      fetchMatch();
    }
  }, [matchId]);

  // Fetch initial moves
  useEffect(() => {
    const fetchMoves = async () => {
      try {
        const { data, error } = await supabase
          .from('moves')
          .select('*')
          .eq('match_id', matchId)
          .order('move_number', { ascending: true });

        if (error) throw error;
        setMoves(data as MoveRecord[]);
      } catch (err: any) {
        console.error('Error fetching moves:', err);
      }
    };

    if (matchId) {
      fetchMoves();
    }
  }, [matchId]);

  // Fetch initial chat messages
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('match_id', matchId)
          .order('created_at', { ascending: true });

        if (error) throw error;
        const messages = (data || []).map((msg: any) => ({
          ...msg,
          username: msg.user_name || 'Anonymous', // Use user_name for guests
        }));
        setChatMessages(messages as ChatMessage[]);
      } catch (err: any) {
        console.error('Error fetching messages:', err);
      }
    };

    if (matchId) {
      fetchMessages();
    }
  }, [matchId]);

  // Subscribe to match updates
  useEffect(() => {
    if (!matchId) return;

    // Use refs for callbacks to avoid stale closures
    const onMoveRef = { current: onMove };
    const onMatchUpdateRef = { current: onMatchUpdate };
    const onChatMessageRef = { current: onChatMessage };

    const channel = supabase
      .channel(`match:${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
          filter: `id=eq.${matchId}`,
        },
        (payload) => {
          console.log('Match updated via realtime:', payload.new);
          const updatedMatch = payload.new as Match;
          setMatch(updatedMatch);
          onMatchUpdateRef.current?.(updatedMatch);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'moves',
          filter: `match_id=eq.${matchId}`,
        },
        async (payload) => {
          console.log('Move received via realtime:', payload.new);
          const newMove = payload.new as MoveRecord;
          setMoves((prev) => {
            // Avoid duplicates
            if (prev.some(m => m.id === newMove.id)) {
              console.log('Duplicate move detected, skipping');
              return prev;
            }
            console.log('Adding new move to state');
            return [...prev, newMove];
          });
          // Call the callback with the latest ref
          onMoveRef.current?.(newMove);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `match_id=eq.${matchId}`,
        },
        async (payload) => {
          const newMessage = payload.new as any;
          // Use user_name for guests
          const messageWithUsername: ChatMessage = {
            ...newMessage,
            username: newMessage.user_name || 'Anonymous',
          };
          setChatMessages((prev) => [...prev, messageWithUsername]);
          onChatMessageRef.current?.(messageWithUsername);
        }
      )
      .subscribe((status, err) => {
        console.log('Realtime subscription status:', status, err);
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to realtime updates');
          setError(null); // Clear any previous errors
        } else if (status === 'CHANNEL_ERROR') {
          const errorMessage = err?.message || err?.toString() || (err ? JSON.stringify(err) : 'Unknown realtime error');
          const errorCode = err?.code || err?.status || 'UNKNOWN';

          console.error('Realtime subscription error:', {
            status,
            error: err,
            message: errorMessage,
            code: errorCode,
            matchId,
            errorType: typeof err,
            errorKeys: err ? Object.keys(err) : [],
          });

          // Only show error if it's a persistent issue (not just an empty object)
          // Sometimes Supabase sends empty error objects for transient issues
          if (err && Object.keys(err).length > 0) {
            // Provide helpful error message based on error type
            let helpfulMessage = 'Realtime connection error. ';

            if (errorMessage.includes('permission') || errorMessage.includes('RLS') || errorCode === 'PGRST301') {
              helpfulMessage += 'This might be an RLS (Row Level Security) issue. Check that your RLS policies allow SELECT on matches, moves, and chat_messages tables.';
            } else if (errorMessage.includes('publication') || errorMessage.includes('replication')) {
              helpfulMessage += 'Tables may not be in the supabase_realtime publication. Check Database > Replication in Supabase dashboard.';
            } else if (errorMessage !== '{}' && errorMessage !== 'Unknown realtime error') {
              helpfulMessage += `Error: ${errorMessage}. Check the browser console for more details.`;
            } else {
              // Empty error object - likely transient, don't show error to user
              console.warn('Transient realtime error (empty object), subscription may still work');
              return; // Don't set error state for transient issues
            }

            setError(helpfulMessage);
          } else {
            // Empty error - likely transient, don't show to user
            console.warn('Realtime error with empty object, likely transient');
          }

          // Log detailed error for debugging
          if (err && Object.keys(err).length > 0) {
            console.error('Detailed error:', JSON.stringify(err, null, 2));
            console.error('Error object:', err);
          }
        } else if (status === 'TIMED_OUT') {
          console.warn('Realtime subscription timed out');
          setError('Realtime connection timed out. Please refresh the page.');
        } else if (status === 'CLOSED') {
          console.log('Realtime subscription closed');
        } else {
          console.log('Realtime subscription status:', status);
        }
      });

    return () => {
      console.log('Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [matchId, onMove, onMatchUpdate, onChatMessage]); // Include callbacks but use refs inside

  const sendMessage = useCallback(async (message: string, userName?: string | null) => {
    if (!userName) {
      throw new Error('User name is required');
    }

    const messageData = {
      match_id: matchId,
      message,
      user_name: userName,
    };

    const { error } = await supabase
      .from('chat_messages')
      .insert(messageData);

    if (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }, [matchId]);

  return {
    match,
    moves,
    chatMessages,
    loading,
    error,
    sendMessage,
  };
}
