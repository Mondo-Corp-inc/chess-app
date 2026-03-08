import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { Chess } from 'chess.js'
import { createClient } from '@supabase/supabase-js'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

// Supabase client
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'https://hhuwvivukaddykhxwtdu.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || ''
)

app.use(cors())
app.use(express.json())

// Game state
const games = new Map() // gameId -> { game: Chess, white: telegramId, black: telegramId, moves: [] }
const players = new Map() // telegramId -> socketId

// ELO calculation
const calculateEloChange = (playerElo, opponentElo, result) => {
  const K = 32
  const expected = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400))
  const actual = result === 'win' ? 1 : result === 'loss' ? 0 : 0.5
  return Math.round(K * (actual - expected))
}

// Update player ELO
const updatePlayerElo = async (telegramId, eloChange) => {
  try {
    const { data, error } = await supabase
      .from('players')
      .upsert({
        telegram_id: telegramId,
        elo: supabase.raw(`elo + ${eloChange}`),
        games_played: supabase.raw('games_played + 1'),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'telegram_id'
      })
    
    if (error) console.error('Error updating ELO:', error)
  } catch (err) {
    console.error('ELO update error:', err)
  }
}

// Create game
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id)

  socket.on('create-game', async ({ telegramId }) => {
    const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    games.set(gameId, {
      game: new Chess(),
      white: telegramId,
      black: null,
      moves: [],
      createdAt: new Date()
    })

    players.set(telegramId, socket.id)
    socket.join(gameId)

    console.log(`Game created: ${gameId} by ${telegramId}`)

    // Send game ID to creator
    socket.emit('game-created', { gameId })

    // Broadcast to find opponent
    io.emit('game-available', { gameId, creator: telegramId })
  })

  socket.on('join-game', async ({ gameId, telegramId }) => {
    const gameData = games.get(gameId)
    
    if (!gameData || gameData.black) {
      socket.emit('error', { message: 'Game not found or already full' })
      return
    }

    gameData.black = telegramId
    players.set(telegramId, socket.id)
    socket.join(gameId)

    console.log(`${telegramId} joined game ${gameId}`)

    // Notify both players
    io.to(gameId).emit('game-started', {
      gameId,
      white: gameData.white,
      black: gameData.black
    })

    // Tell white player to start
    const whiteSocketId = players.get(gameData.white)
    if (whiteSocketId) {
      io.to(whiteSocketId).emit('game-started', { gameId, color: 'white' })
    }

    // Tell black player
    socket.emit('game-started', { gameId, color: 'black' })
  })

  socket.on('make-move', async ({ gameId, move, fen }) => {
    const gameData = games.get(gameId)
    
    if (!gameData) {
      socket.emit('error', { message: 'Game not found' })
      return
    }

    // Validate it's the player's turn
    const playerTelegramId = gameData.white === socket.telegramId || gameData.black === socket.telegramId
      ? (gameData.white === socket.telegramId ? gameData.white : gameData.black)
      : null

    const currentTurn = gameData.game.turn() === 'w' ? 'white' : 'black'
    const playerColor = gameData.white === playerTelegramId ? 'white' : 'black'

    if (currentTurn !== playerColor) {
      socket.emit('error', { message: 'Not your turn!' })
      return
    }

    // Apply move
    try {
      gameData.game.move(move)
      gameData.moves.push(move)
      games.set(gameId, gameData)

      // Send move to opponent
      socket.to(gameId).emit('opponent-move', { move, fen })

      // Check for game over
      if (gameData.game.isGameOver()) {
        let result = 'draw'
        let reason = 'draw'
        let winner = null

        if (gameData.game.isCheckmate()) {
          result = currentTurn === 'white' ? 'white-wins' : 'black-wins'
          reason = 'checkmate'
          winner = currentTurn === 'white' ? gameData.white : gameData.black
        }

        // Update ELO
        if (winner) {
          const winnerEloChange = calculateEloChange(1200, 1200, 'win')
          const loserEloChange = calculateEloChange(1200, 1200, 'loss')
          
          await updatePlayerElo(winner, winnerEloChange)
          await updatePlayerElo(winner === gameData.white ? gameData.black : gameData.white, loserEloChange)
        }

        io.to(gameId).emit('game-over', { result, reason })
        games.delete(gameId)
      }
    } catch (error) {
      console.error('Invalid move:', error)
      socket.emit('error', { message: 'Invalid move' })
    }
  })

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id)
    
    // Remove from players map
    for (const [telegramId, socketId] of players.entries()) {
      if (socketId === socket.id) {
        players.delete(telegramId)
        break
      }
    }
  })
})

// API Routes
app.get('/api/rankings', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('players')
      .select('telegram_id, username, elo, games_played')
      .order('elo', { ascending: false })
      .limit(50)
    
    if (error) throw error
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/game/:gameId', (req, res) => {
  const gameData = games.get(req.params.gameId)
  
  if (!gameData) {
    return res.status(404).json({ error: 'Game not found' })
  }

  res.json({
    gameId: req.params.gameId,
    fen: gameData.game.fen(),
    moves: gameData.moves,
    white: gameData.white,
    black: gameData.black,
    turn: gameData.game.turn() === 'w' ? 'white' : 'black'
  })
})

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', games: games.size, players: players.size })
})

const PORT = process.env.PORT || 3000
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Chess server running on port ${PORT}`)
})
