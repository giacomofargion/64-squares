import type { SynthType } from './audio';

export type MatchStatus = 'waiting' | 'active' | 'finished';

export interface User {
  id: string;
  username: string;
  created_at: string;
}

export interface Match {
  id: string;
  white_player_id: string | null;
  black_player_id: string | null;
  white_player_name: string | null;
  black_player_name: string | null;
  room_name: string | null;
  current_fen: string;
  status: MatchStatus;
  winner_id: string | null;
  white_player_synth_type: SynthType;
  black_player_synth_type: SynthType;
  started_at: string | null;
  finished_at: string | null;
  audio_file_url: string | null;
}

export interface MoveRecord {
  id: string;
  match_id: string;
  move_san: string;
  move_from: string;
  move_to: string;
  captured_piece: string | null;
  player_id: string | null;
  player_name: string | null;
  move_number: number;
  timestamp: string;
}

export interface ChatMessage {
  id: string;
  match_id: string;
  user_id: string | null;
  user_name: string | null;
  message: string;
  created_at: string;
  username?: string; // Joined from users table or user_name for guests
}
