'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { SynthSelector } from '@/components/audio/SynthSelector';
import { getGuestName, setGuestName } from '@/lib/guestSession';
import { normalizeRoomCode } from '@/lib/roomCode';
import { generateRoomCode } from '@/lib/roomCode';
import type { SynthType } from '@/types/audio';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Users, Play } from 'lucide-react';

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room');
    } finally {
      setLoading(false);
    }
  };

  const handlePlaySolo = () => {
    router.push(`/play?synth=${synthType}`);
  };

  return (
    <div className="min-h-screen bg-black relative">
      {/* Gradient Background */}
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-900/50 via-black to-zinc-900/50 pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-800/20 via-black to-black pointer-events-none" />

      {/* Content */}
      <div className="relative z-10">
        {/* Main Content */}
        <main className="container mx-auto px-4 py-4 md:py-6">
          <div className="grid lg:grid-cols-2 gap-6 lg:gap-8 items-start max-w-7xl mx-auto">
            {/* Left Column - Get Started */}
            <div className="space-y-4">
              <div className="space-y-2">
                <h2 className="text-3xl md:text-4xl font-bold text-balance leading-tight text-white">Get Started</h2>
                <p className="text-base text-white/60 text-pretty">
                  Create a room, join a friend, or play solo
                </p>
              </div>

              <Card className="border-white/10 shadow-2xl overflow-hidden bg-zinc-950">
                <Tabs value={activeTab} onValueChange={(value) => {
                  setActiveTab(value as Tab);
                  setError(null);
                }} className="w-full">
                  <TabsList className="grid w-full grid-cols-3 rounded-none border-b border-white/10 bg-black h-10">
                    <TabsTrigger
                      value="create"
                      className="gap-1.5 text-sm data-[state=active]:bg-white/10 text-white/70 data-[state=active]:text-white py-2"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Create Room</span>
                      <span className="sm:hidden">Create</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="join"
                      className="gap-1.5 text-sm data-[state=active]:bg-white/10 text-white/70 data-[state=active]:text-white py-2"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Join Room</span>
                      <span className="sm:hidden">Join</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="solo"
                      className="gap-1.5 text-sm data-[state=active]:bg-white/10 text-white/70 data-[state=active]:text-white py-2"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Play Solo</span>
                      <span className="sm:hidden">Solo</span>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="create" className="p-4 space-y-4">
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="create-name" className="text-white text-sm">
                          Your Name
                        </Label>
                        <Input
                          id="create-name"
                          type="text"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="Enter your name"
                          className="h-9 bg-black border-white/20 text-white placeholder:text-white/40 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="create-room-name" className="text-white text-sm">
                          Room Name
                        </Label>
                        <Input
                          id="create-room-name"
                          type="text"
                          value={roomName}
                          onChange={(e) => setRoomName(e.target.value)}
                          placeholder="Enter room name"
                          className="h-9 bg-black border-white/20 text-white placeholder:text-white/40 text-sm"
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
                        <div className="p-2 bg-black/50 rounded-lg border border-white/10">
                          <p className="text-xs text-white/60 mb-1">Generated Room Code:</p>
                          <Badge variant="outline" className="text-sm font-mono bg-black border-white/20 text-white">{createdRoomCode}</Badge>
                        </div>
                      )}
                    </div>
                    <Button
                      onClick={handleCreateRoom}
                      disabled={loading}
                      className="w-full h-9 text-sm font-medium bg-white text-black hover:bg-white/90"
                    >
                      <Users className="w-3.5 h-3.5 mr-2" />
                      {loading ? 'Creating...' : 'Create Room'}
                    </Button>
                  </TabsContent>

                  <TabsContent value="join" className="p-4 space-y-4">
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="join-name" className="text-white text-sm">
                          Your Name
                        </Label>
                        <Input
                          id="join-name"
                          type="text"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="Enter your name"
                          className="h-9 bg-black border-white/20 text-white placeholder:text-white/40 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="join-room-code" className="text-white text-sm">
                          Room Code
                        </Label>
                        <Input
                          id="join-room-code"
                          type="text"
                          value={roomCode}
                          onChange={(e) => setRoomCode(e.target.value)}
                          placeholder="Enter room code"
                          className="h-9 bg-black border-white/20 text-white placeholder:text-white/40 text-sm"
                        />
                      </div>
                      <div>
                        <SynthSelector
                          value={synthType}
                          onChange={setSynthType}
                          label="Synth Choice"
                        />
                      </div>
                    </div>
                    <Button
                      onClick={handleJoinRoom}
                      disabled={loading || !roomCode.trim()}
                      className="w-full h-9 text-sm font-medium bg-white text-black hover:bg-white/90"
                    >
                      <Users className="w-3.5 h-3.5 mr-2" />
                      {loading ? 'Joining...' : 'Join Room'}
                    </Button>
                  </TabsContent>

                  <TabsContent value="solo" className="p-4 space-y-4">
                    <div>
                      <SynthSelector
                        value={synthType}
                        onChange={setSynthType}
                        label="Synth Choice"
                      />
                    </div>
                    <Button
                      onClick={handlePlaySolo}
                      className="w-full h-9 text-sm font-medium bg-white text-black hover:bg-white/90"
                    >
                      <Play className="w-3.5 h-3.5 mr-2" />
                      Start Solo Game
                    </Button>
                  </TabsContent>
                </Tabs>

                {error && (
                  <Alert variant="destructive" className="mt-4 bg-destructive/20 border-destructive/50">
                    <AlertDescription className="text-white">{error}</AlertDescription>
                  </Alert>
                )}
              </Card>
            </div>

            {/* Right Column - About */}
            <div className="lg:sticky lg:top-20">
              <Card className="border-white/10 shadow-2xl p-6 space-y-4 bg-zinc-950">
                <div className="space-y-1.5">
                  <h3 className="text-xl font-bold text-balance text-white">64 Squares</h3>
                  <div className="h-0.5 w-full bg-white rounded-full" />
                </div>

                <div className="space-y-2.5 text-white/70 leading-relaxed text-sm">
                  <p>
                    64 Squares is a virtual chess board which utilises an 8 note scale to represent the columns on a
                    chess board: A, B (bflat in German), C, D, E, F G, H (b in German).
                  </p>

                  <p>
                    Each note of the scale has 8 variations in colour, to represent the ranks (rows) of the board. (eg
                    D1, D2, D3, D4 etc), making in total 64 different but related sounds.
                  </p>

                  <p>
                    As the pieces move around the board, they trigger various tones which have different durations,
                    creating overlaps. Experiment with the different synthesizer types to see how the sound changes.
                  </p>
                </div>
              </Card>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="container mx-auto px-4 py-10">
          <div className="flex justify-center items-center">
            <p className="text-sm text-white/60">
              Created by{' '}
              <a
                href="https://giacomofargion.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors underline"
              >
                Giacomo Fargion
              </a>
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
