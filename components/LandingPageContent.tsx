'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { SynthSelector } from '@/components/audio/SynthSelector';
import { getGuestName, setGuestName } from '@/lib/guestSession';
import { normalizeRoomCode } from '@/lib/roomCode';
import { generateRoomCode } from '@/lib/roomCode';
import type { SynthType } from '@/types/audio';

type Tab = 'create' | 'join' | 'solo';

export function LandingPageContent() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('create');
  const [username, setUsername] = useState<string>('');
  const [roomName, setRoomName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [synthType, setSynthType] = useState<SynthType>('Synth');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdRoomCode, setCreatedRoomCode] = useState<string | null>(null);

  useEffect(() => {
    // Get guest name from sessionStorage
    const guestName = getGuestName();
    if (guestName) {
      setUsername(guestName);
    }
  }, []);

  const handleCreateRoom = async () => {
    if (!username.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!roomName.trim()) {
      setError('Please enter a room name');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const matchData = {
        white_player_name: username.trim(),
        white_player_synth_type: synthType,
        black_player_synth_type: 'Synth', // Default - will be updated when opponent joins
        room_name: roomName.trim(),
        status: 'waiting',
      };

      setGuestName(username.trim());

      const { data, error: createError } = await supabase
        .from('matches')
        .insert(matchData)
        .select()
        .single();

      if (createError) throw createError;

      if (data) {
        const shortCode = generateRoomCode(data.id);
        setCreatedRoomCode(shortCode);
        // Redirect to match page
        router.push(`/match/${data.id}`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!username.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!roomCode.trim()) {
      setError('Please enter a room code');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Normalize room code (accepts both short codes and full UUIDs)
      const matchId = await normalizeRoomCode(supabase, roomCode.trim());

      if (!matchId) {
        throw new Error('Room not found. Please check the room code.');
      }

      // Check if match exists
      const { data: match, error: matchError } = await supabase
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .single();

      if (matchError || !match) {
        throw new Error('Room not found. Please check the room code.');
      }

      // Check if already in match (by name)
      if (match.white_player_name === username.trim() || match.black_player_name === username.trim()) {
        router.push(`/match/${matchId}`);
        return;
      }

      // Check if match is waiting
      if (match.status !== 'waiting') {
        throw new Error('Room is not waiting for players.');
      }

      // Check if black player slot is available
      if (match.black_player_name) {
        throw new Error('Room is full. Both players have already joined.');
      }

      // Join as black player
      const updateData = {
        black_player_name: username.trim(),
        black_player_synth_type: synthType,
        status: 'active',
        started_at: new Date().toISOString(),
      };

      setGuestName(username.trim());

      const { data: updatedMatches, error: updateError } = await supabase
        .from('matches')
        .update(updateData)
        .eq('id', matchId)
        .is('black_player_name', null)
        .select();

      if (updateError) {
        console.error('Update error:', updateError);
        throw updateError;
      }

      if (!updatedMatches || updatedMatches.length === 0) {
        // Re-check the match to see current state
        const { data: currentMatch } = await supabase
          .from('matches')
          .select('*')
          .eq('id', matchId)
          .single();

        if (currentMatch?.black_player_name) {
          throw new Error('Room is full. Both players have already joined.');
        }
        throw new Error('Failed to join room. The room may have been updated by someone else.');
      }

      router.push(`/match/${matchId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to join room');
    } finally {
      setLoading(false);
    }
  };

  const handlePlaySolo = () => {
    router.push(`/play?synth=${synthType}`);
  };

  return (
    <div className="min-h-screen bg-[#212529] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="flex justify-between items-center py-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">♞</span>
            <h1 className="text-2xl font-bold">64 Squares</h1>
          </div>
        </header>

        {/* Main Content */}
        <div className="grid lg:grid-cols-2 gap-12 items-center min-h-[calc(100vh-200px)] py-12">
          {/* Left Panel - Form */}
          <div className="space-y-8">
            <div className="text-center lg:text-left">
              <div className="flex items-center justify-center lg:justify-start gap-3 mb-4">
                <span className="text-5xl">♞</span>
                <h2 className="text-5xl font-bold">Play Chess</h2>
              </div>
              <p className="text-xl text-[#ADB5BD]">Local Network Chess Arena</p>
            </div>

            <div className="bg-[#343A40] rounded-lg p-6 space-y-6">
              {/* Tab Buttons */}
              <div className="flex gap-4 border-b border-[#495057]">
                <button
                  onClick={() => {
                    setActiveTab('create');
                    setError(null);
                  }}
                  className={`flex-1 py-3 font-medium transition-colors ${
                    activeTab === 'create'
                      ? 'border-b-2 border-[#ADB5BD] text-[#ADB5BD]'
                      : 'text-[#6C757D] hover:text-[#ADB5BD]'
                  }`}
                >
                  Create Room
                </button>
                <button
                  onClick={() => {
                    setActiveTab('join');
                    setError(null);
                  }}
                  className={`flex-1 py-3 font-medium transition-colors ${
                    activeTab === 'join'
                      ? 'border-b-2 border-[#ADB5BD] text-[#ADB5BD]'
                      : 'text-[#6C757D] hover:text-[#ADB5BD]'
                  }`}
                >
                  Join Room
                </button>
                <button
                  onClick={() => {
                    setActiveTab('solo');
                    setError(null);
                  }}
                  className={`flex-1 py-3 font-medium transition-colors ${
                    activeTab === 'solo'
                      ? 'border-b-2 border-[#ADB5BD] text-[#ADB5BD]'
                      : 'text-[#6C757D] hover:text-[#ADB5BD]'
                  }`}
                >
                  Play Solo
                </button>
              </div>

              {/* Create Room Tab */}
              {activeTab === 'create' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[#ADB5BD] mb-2">
                      Your Name
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter your name"
                      className="w-full px-4 py-2 bg-[#495057] border border-[#6C757D] rounded-lg text-white placeholder-[#ADB5BD] focus:outline-none focus:ring-2 focus:ring-[#ADB5BD]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#ADB5BD] mb-2">
                      Room Name
                    </label>
                    <input
                      type="text"
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                      placeholder="Enter room name"
                      className="w-full px-4 py-2 bg-[#495057] border border-[#6C757D] rounded-lg text-white placeholder-[#ADB5BD] focus:outline-none focus:ring-2 focus:ring-[#ADB5BD]"
                    />
                  </div>
                  <div>
                    <SynthSelector
                      value={synthType}
                      onChange={setSynthType}
                      label="Synth Choice"
                    />
                  </div>
                  {createdRoomCode && (
                    <div className="p-3 bg-[#495057] rounded-lg">
                      <p className="text-sm text-[#ADB5BD] mb-1">Generated Room Code:</p>
                      <code className="text-lg font-mono text-white">{createdRoomCode}</code>
                    </div>
                  )}
                  <button
                    onClick={handleCreateRoom}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#495057] hover:bg-[#6C757D] rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span>+</span>
                    {loading ? 'Creating...' : 'Create Room'}
                  </button>
                </div>
              )}

              {/* Join Room Tab */}
              {activeTab === 'join' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[#ADB5BD] mb-2">
                      Your Name
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter your name"
                      className="w-full px-4 py-2 bg-[#495057] border border-[#6C757D] rounded-lg text-white placeholder-[#ADB5BD] focus:outline-none focus:ring-2 focus:ring-[#ADB5BD]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#ADB5BD] mb-2">
                      Room Code
                    </label>
                    <input
                      type="text"
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value)}
                      placeholder="Enter room code"
                      className="w-full px-4 py-2 bg-[#495057] border border-[#6C757D] rounded-lg text-white placeholder-[#ADB5BD] focus:outline-none focus:ring-2 focus:ring-[#ADB5BD]"
                    />
                  </div>
                  <div>
                    <SynthSelector
                      value={synthType}
                      onChange={setSynthType}
                      label="Synth Choice"
                    />
                  </div>
                  <button
                    onClick={handleJoinRoom}
                    disabled={loading || !roomCode.trim()}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#495057] hover:bg-[#6C757D] rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span>👤</span>
                    {loading ? 'Joining...' : 'Join Room'}
                  </button>
                </div>
              )}

              {/* Play Solo Tab */}
              {activeTab === 'solo' && (
                <div className="space-y-4">
                  <div>
                    <SynthSelector
                      value={synthType}
                      onChange={setSynthType}
                      label="Synth Choice"
                    />
                  </div>
                  <button
                    onClick={handlePlaySolo}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#495057] hover:bg-[#6C757D] rounded-lg font-medium transition-colors"
                  >
                    Start Solo Game
                  </button>
                </div>
              )}

              {error && (
                <div className="bg-[#495057] border border-[#6C757D] text-[#ADB5BD] px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Chess Board Visual */}
          <div className="hidden lg:block">
            <div className="relative">
              {/* 3D Chess Board Representation */}
              <div className="aspect-square bg-gradient-to-br from-[#495057] via-[#343A40] to-[#495057] rounded-lg shadow-2xl p-8">
                <div className="grid grid-cols-8 gap-0 h-full w-full rounded shadow-inner">
                  {/* Chess board squares */}
                  {Array.from({ length: 64 }).map((_, i) => {
                    const row = Math.floor(i / 8);
                    const col = i % 8;
                    const isLight = (row + col) % 2 === 0;
                    return (
                      <div
                        key={i}
                        className={`${isLight ? 'bg-[#E9ECEF]' : 'bg-[#495057]'} border border-[#DEE2E6]`}
                      />
                    );
                  })}
                </div>
                {/* Decorative pieces */}
                <div className="absolute top-4 left-4 text-4xl text-[#212529]">♜</div>
                <div className="absolute top-4 right-4 text-4xl text-[#212529]">♜</div>
                <div className="absolute bottom-4 left-4 text-4xl text-white">♖</div>
                <div className="absolute bottom-4 right-4 text-4xl text-white">♖</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
