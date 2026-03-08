import { useState, useEffect } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { createClient } from '@supabase/supabase-js'
import { io } from 'socket.io-client'

// Supabase client
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://hhuwvivukaddykhxwtdu.supabase.co',
  import.meta.env.VITE_SUPABASE_ANON_KEY || ''
)

// Socket connection
const socket = io(import.meta.env.VITE_SERVER_URL || 'http://localhost:3000')

function App() {
  const [game, setGame] = useState(new Chess())
  const [playerColor, setPlayerColor] = useState('white')
  const [gameStatus, setGameStatus] = useState('waiting') // waiting, playing, your-turn, opponent-turn
  const [moveHistory, setMoveHistory] = useState([])
  const [gameId, setGameId] = useState(null)
  const [telegramId, setTelegramId] = useState(null)
  const [rankings, setRankings] = useState([])
  const [message, setMessage] = useState('')

  // Get Telegram ID from URL param or prompt
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tgId = params.get('telegram_id')
    
    if (tgId) {
      setTelegramId(tgId)
      fetchRankings()
    } else {
      // Prompt for Telegram ID
      const storedId = localStorage.getItem('telegram_id')
      if (storedId) {
        setTelegramId(storedId)
        fetchRankings()
      }
    }
  }, [])

  // Listen for socket events
  useEffect(() => {
    socket.on('game-started', ({ gameId: id, color }) => {
      setGameId(id)
      setPlayerColor(color)
      setGameStatus(color === 'white' ? 'your-turn' : 'opponent-turn')
      setMessage(`Game started! You're playing as ${color}`)
    })

    socket.on('opponent-move', ({ move, fen }) => {
      const newGame = new Chess(fen)
      setGame(newGame)
      setMoveHistory(prev => [...prev, move])
      setGameStatus('your-turn')
      setMessage('Your turn!')
    })

    socket.on('game-over', ({ result, reason }) => {
      setGameStatus('finished')
      setMessage(`Game Over: ${result} - ${reason}`)
      fetchRankings()
    })

    return () => {
      socket.off('game-started')
      socket.off('opponent-move')
      socket.off('game-over')
    }
  }, [])

  // Fetch rankings
  const fetchRankings = async () => {
    try {
      const { data, error } = await supabase
        .from('players')
        .select('telegram_id, username, elo, games_played')
        .order('elo', { ascending: false })
        .limit(10)
      
      if (data) setRankings(data)
    } catch (err) {
      console.error('Error fetching rankings:', err)
    }
  }

  // Make a move
  const onDrop = (sourceSquare, targetSquare) => {
    try {
      const move = {
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q'
      }

      const newGame = new Chess(game.fen())
      const result = newGame.move(move)

      if (result === null) return false

      setGame(newGame)
      setMoveHistory(prev => [...prev, newGame.history({ verbose: true }).pop()])

      // Send move to server
      socket.emit('make-move', {
        gameId,
        move: result,
        fen: newGame.fen()
      })

      // Check game status
      if (newGame.isGameOver()) {
        setGameStatus('finished')
        if (newGame.isCheckmate()) {
          setMessage(`Checkmate! ${game.turn() === 'w' ? 'Black' : 'White'} wins!`)
        } else if (newGame.isDraw()) {
          setMessage('Draw!')
        }
      } else {
        setGameStatus('opponent-turn')
        setMessage('Waiting for opponent...')
      }

      return true
    } catch (error) {
      console.error('Invalid move:', error)
      return false
    }
  }

  // Create new game
  const createGame = async () => {
    if (!telegramId) {
      setMessage('Please enter your Telegram ID first!')
      return
    }

    socket.emit('create-game', { telegramId })
    setMessage('Waiting for opponent...')
  }

  // Join existing game
  const joinGame = (targetGameId) => {
    if (!telegramId) {
      setMessage('Please enter your Telegram ID first!')
      return
    }

    socket.emit('join-game', { gameId: targetGameId, telegramId })
  }

  // Save Telegram ID
  const saveTelegramId = (id) => {
    localStorage.setItem('telegram_id', id)
    setTelegramId(id)
    fetchRankings()
    setMessage('Telegram ID saved!')
  }

  // Render login screen
  if (!telegramId) {
    return (
      <div className="container">
        <div className="login-prompt">
          <h2>♟️ Welcome to Chess!</h2>
          <p>Enter your Telegram ID to start playing</p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <input
              type="text"
              placeholder="Your Telegram ID"
              id="telegram-input"
              style={{
                padding: '12px 20px',
                fontSize: '1rem',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.1)',
                color: '#fff',
                width: '250px'
              }}
            />
            <button
              className="btn btn-primary"
              onClick={() => {
                const input = document.getElementById('telegram-input')
                if (input.value) saveTelegramId(input.value)
              }}
            >
              Start Playing
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="header">
        <h1>♟️ Chess Arena</h1>
        <p>Real-time chess with Telegram integration</p>
      </div>

      <div className="game-container">
        <div className="board-wrapper">
          <Chessboard
            position={game.fen()}
            onPieceDrop={onDrop}
            boardOrientation={playerColor}
            animationDuration={200}
            customDarkSquareStyle={{ backgroundColor: '#779556' }}
            customLightSquareStyle={{ backgroundColor: '#ebecd0' }}
          />
        </div>

        <div className="info-panel">
          <h2>Game Info</h2>
          
          <div className="game-info">
            <p><strong>Telegram ID:</strong> {telegramId}</p>
            <p><strong>Playing as:</strong> {playerColor === 'white' ? '⚪ White' : '⚫ Black'}</p>
            <p><strong>Game ID:</strong> {gameId || 'None'}</p>
          </div>

          <div className="status">
            <strong>Status:</strong> {gameStatus === 'waiting' && 'Waiting to start'}
            {gameStatus === 'your-turn' && '🟢 Your turn!'}
            {gameStatus === 'opponent-turn' && '🟡 Waiting for opponent...'}
            {gameStatus === 'finished' && '🏁 Game finished'}
          </div>

          {message && <p style={{ color: '#00ff88', marginTop: '10px' }}>{message}</p>}

          <div className="actions">
            <button className="btn btn-primary" onClick={createGame}>
              New Game
            </button>
            <button 
              className="btn btn-secondary" 
              onClick={() => {
                setGame(new Chess())
                setMoveHistory([])
                setGameId(null)
                setGameStatus('waiting')
                setMessage('')
              }}
            >
              Reset Board
            </button>
          </div>

          <div className="move-history">
            <h3>Move History</h3>
            <div className="moves-list">
              {moveHistory.length === 0 ? (
                <p>No moves yet</p>
              ) : (
                moveHistory.map((move, i) => (
                  <p key={i}>
                    {Math.floor(i / 2) + 1}.{i % 2 === 0 ? '' : '..'} {move.san}
                  </p>
                ))
              )}
            </div>
          </div>

          <div className="ranking-preview">
            <h3>🏆 Top Rankings</h3>
            <div className="ranking-list">
              {rankings.slice(0, 5).map((player, i) => (
                <div key={i} className="ranking-item">
                  <span className="rank">#{i + 1}</span>
                  <span className="player">{player.username || player.telegram_id}</span>
                  <span className="elo">{player.elo} ELO</span>
                </div>
              ))}
              {rankings.length === 0 && <p style={{ padding: '15px', color: '#8892b0' }}>No rankings yet</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
