-- Chess App Database Schema
-- Run this in your Supabase SQL Editor

-- Players table
CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  telegram_id VARCHAR(50) UNIQUE NOT NULL,
  username VARCHAR(100),
  elo INTEGER DEFAULT 1200,
  games_played INTEGER DEFAULT 0,
  games_won INTEGER DEFAULT 0,
  games_lost INTEGER DEFAULT 0,
  games_drawn INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Games table
CREATE TABLE IF NOT EXISTS games (
  id SERIAL PRIMARY KEY,
  game_id VARCHAR(100) UNIQUE NOT NULL,
  white_player_id VARCHAR(50) REFERENCES players(telegram_id),
  black_player_id VARCHAR(50) REFERENCES players(telegram_id),
  winner_id VARCHAR(50) REFERENCES players(telegram_id),
  moves JSONB DEFAULT '[]',
  fen_start VARCHAR(100),
  fen_end VARCHAR(100),
  result VARCHAR(20), -- 'white-wins', 'black-wins', 'draw'
  reason VARCHAR(50), -- 'checkmate', 'timeout', 'resignation', 'draw'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_players_elo ON players(elo DESC);
CREATE INDEX IF NOT EXISTS idx_players_telegram ON players(telegram_id);
CREATE INDEX IF NOT EXISTS idx_games_white ON games(white_player_id);
CREATE INDEX IF NOT EXISTS idx_games_black ON games(black_player_id);
CREATE INDEX IF NOT EXISTS idx_games_created ON games(created_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for players table
CREATE TRIGGER update_players_updated_at
  BEFORE UPDATE ON players
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (optional, for production)
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

-- Policies (allow all for now, restrict in production)
CREATE POLICY "Allow all operations on players" ON players
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on games" ON games
  FOR ALL USING (true) WITH CHECK (true);
