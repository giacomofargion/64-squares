'use client';

import { AVAILABLE_SYNTH_TYPES } from '@/lib/audio/synthConfig';
import type { SynthType } from '@/types/audio';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';

interface SynthSelectorProps {
  value: SynthType;
  onChange: (synthType: SynthType) => void;
  label?: string;
  disabled?: boolean;
}

export function SynthSelector({ value, onChange, label = 'Select Synth', disabled = false }: SynthSelectorProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label className="text-white text-sm">{label}</Label>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="w-3.5 h-3.5 text-white/60 cursor-help" />
          </TooltipTrigger>
          <TooltipContent className="bg-black border-white/20 text-white">
            <p className="max-w-xs text-sm">
              Different synthesizer types produce different timbres and sound characteristics. Experiment to find your favorite!
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-9 bg-black border-white/20 text-white text-sm">
          <SelectValue placeholder="Select synth type" />
        </SelectTrigger>
        <SelectContent className="bg-black border-white/20 text-white">
          {AVAILABLE_SYNTH_TYPES.map((synthType) => (
            <SelectItem key={synthType} value={synthType} className="text-white focus:bg-white/10 focus:text-white text-sm">
              {synthType}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-white/50">
        Choose the synthesizer type for this game
      </p>
    </div>
  );
}
