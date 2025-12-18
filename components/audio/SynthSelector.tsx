'use client';

import { AVAILABLE_SYNTH_TYPES } from '@/lib/audio/synthConfig';
import type { SynthType } from '@/types/audio';

interface SynthSelectorProps {
  value: SynthType;
  onChange: (synthType: SynthType) => void;
  label?: string;
  disabled?: boolean;
}

export function SynthSelector({ value, onChange, label = 'Select Synth', disabled = false }: SynthSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-[#ADB5BD]">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SynthType)}
        disabled={disabled}
        className="block w-full px-3 py-2 bg-[#495057] border border-[#6C757D] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[#ADB5BD] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {AVAILABLE_SYNTH_TYPES.map((synthType) => (
          <option key={synthType} value={synthType}>
            {synthType}
          </option>
        ))}
      </select>
      <p className="text-xs text-[#6C757D]">
        Choose the synthesizer type for this game
      </p>
    </div>
  );
}
