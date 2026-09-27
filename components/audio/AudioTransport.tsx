'use client';

import { useState } from 'react';
import * as Tone from 'tone';
import { CircleStop, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';

const VOLUME_FLOOR_DB = -40;

function sliderToDb(slider: number): number {
  const clamped = Math.min(100, Math.max(0, slider));
  return VOLUME_FLOOR_DB + (clamped / 100) * (0 - VOLUME_FLOOR_DB);
}

interface AudioTransportProps {
  onStop: () => void;
}

export function AudioTransport({ onStop }: AudioTransportProps) {
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(100);

  const handleMuteToggle = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    Tone.getDestination().mute = nextMuted;
  };

  const handleVolumeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextVolume = Number(event.target.value);
    setVolume(nextVolume);
    Tone.getDestination().volume.value = sliderToDb(nextVolume);
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={handleMuteToggle}
        aria-label={muted ? 'Unmute' : 'Mute'}
        aria-pressed={muted}
      >
        {muted ? <VolumeX /> : <Volume2 />}
      </Button>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={volume}
        onChange={handleVolumeChange}
        aria-label="Volume"
        className="h-2 w-20 sm:w-28 cursor-pointer accent-foreground"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={onStop}
        aria-label="Stop sound"
      >
        <CircleStop />
      </Button>
    </div>
  );
}
