import React, { useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import ReactMarkdown from 'react-markdown';
import axios from 'axios';

const API_BASE = 'http://127.0.0.1:8000';
const STORAGE_KEY = 'chess_coach_saved_games';
const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const PIECE_SVGS = {
  wP: <path d="M 22.5,9 C 19.5,9 17,11.5 17,14.5 C 17,16.8 18.4,18.7 20.4,19.5 C 17,21 15,24 15,29 L 30,29 C 30,24 28,21 24.6,19.5 C 26.6,18.7 28,16.8 28,14.5 C 28,11.5 25.5,9 22.5,9 z M 11.5,32 L 33.5,32 L 33.5,36 L 11.5,36 L 11.5,32 z" fill="#fff" stroke="#000" strokeWidth="2" />,
  bP: <path d="M 22.5,9 C 19.5,9 17,11.5 17,14.5 C 17,16.8 18.4,18.7 20.4,19.5 C 17,21 15,24 15,29 L 30,29 C 30,24 28,21 24.6,19.5 C 26.6,18.7 28,16.8 28,14.5 C 28,11.5 25.5,9 22.5,9 z M 11.5,32 L 33.5,32 L 33.5,36 L 11.5,36 L 11.5,32 z" fill="#222" stroke="#000" strokeWidth="2" />,
  wR: <g fill="#fff" stroke="#000" strokeWidth="2"><path d="M 9,39 L 36,39 L 36,36 L 9,36 L 9,39 z M 12,36 L 12,32 L 33,32 L 33,36 L 12,36 z M 14,29.5 L 14,16.5 L 31,16.5 L 31,29.5 L 14,29.5 z M 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 L 30,9 L 34,9 L 34,14 L 11,14 z" /></g>,
  bR: <g fill="#222" stroke="#000" strokeWidth="2"><path d="M 9,39 L 36,39 L 36,36 L 9,36 L 9,39 z M 12,36 L 12,32 L 33,32 L 33,36 L 12,36 z M 14,29.5 L 14,16.5 L 31,16.5 L 31,29.5 L 14,29.5 z M 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 L 30,9 L 34,9 L 34,14 L 11,14 z" /></g>,
  wN: <g fill="#fff" stroke="#000" strokeWidth="2"><path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" /><path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10" /></g>,
  bN: <g fill="#222" stroke="#000" strokeWidth="2"><path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" /><path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10" /></g>,
  wB: <g fill="#fff" stroke="#000" strokeWidth="2"><path d="M 9,36 C 12.39,35.03 19.11,36.43 22.5,34 C 25.89,36.43 32.61,35.03 36,36 C 36,36 37.65,36.54 39,38 C 38.32,38.97 37.35,38.99 36,38.5 C 32.61,37.53 25.89,38.96 22.5,37.5 C 19.11,38.96 12.39,37.53 9,38.5 C 7.646,38.99 6.677,38.97 6,38 C 7.354,36.06 9,36 9,36 z" /><path d="M 15,32 C 17.5,34.5 27.5,34.5 30,32 C 30.5,30.5 30,30 30,30 C 30,27.5 27.5,26 27.5,26 C 33,24.5 33.5,14.5 22.5,10.5 C 11.5,14.5 12,24.5 17.5,26 C 17.5,26 15,27.5 15,30 C 15,30 14.5,30.5 15,32 z" /><circle cx="22.5" cy="8" r="2.5" /></g>,
  bB: <g fill="#222" stroke="#000" strokeWidth="2"><path d="M 9,36 C 12.39,35.03 19.11,36.43 22.5,34 C 25.89,36.43 32.61,35.03 36,36 C 36,36 37.65,36.54 39,38 C 38.32,38.97 37.35,38.99 36,38.5 C 32.61,37.53 25.89,38.96 22.5,37.5 C 19.11,38.96 12.39,37.53 9,38.5 C 7.646,38.99 6.677,38.97 6,38 C 7.354,36.06 9,36 9,36 z" /><path d="M 15,32 C 17.5,34.5 27.5,34.5 30,32 C 30.5,30.5 30,30 30,30 C 30,27.5 27.5,26 27.5,26 C 33,24.5 33.5,14.5 22.5,10.5 C 11.5,14.5 12,24.5 17.5,26 C 17.5,26 15,27.5 15,30 C 15,30 14.5,30.5 15,32 z" /><circle cx="22.5" cy="8" r="2.5" /></g>,
  wQ: <g fill="#fff" stroke="#000" strokeWidth="2"><path d="M 9,26 C 17.5,24.5 30,24.5 36,26 L 38.5,13.5 L 31,25 L 30.7,10.9 L 25.5,24.5 L 22.5,10 L 19.5,24.5 L 14.3,10.9 L 14,25 L 6.5,13.5 L 9,26 z" /><path d="M 9,26 C 9,28 10.5,28 11.5,30 C 12.5,31.5 12.5,31 12,33.5 C 10.5,34.5 11,36 11,36 C 9.5,37.5 11,38.5 11,38.5 C 17.5,39.5 27.5,39.5 34,38.5 C 34,38.5 35.5,37.5 34,36 C 34,36 34.5,34.5 33,33.5 C 32.5,31 32.5,31.5 33.5,30 C 34.5,28 36,28 36,26 C 27.5,24.5 17.5,24.5 9,26 z" /></g>,
  bQ: <g fill="#222" stroke="#000" strokeWidth="2"><path d="M 9,26 C 17.5,24.5 30,24.5 36,26 L 38.5,13.5 L 31,25 L 30.7,10.9 L 25.5,24.5 L 22.5,10 L 19.5,24.5 L 14.3,10.9 L 14,25 L 6.5,13.5 L 9,26 z" /><path d="M 9,26 C 9,28 10.5,28 11.5,30 C 12.5,31.5 12.5,31 12,33.5 C 10.5,34.5 11,36 11,36 C 9.5,37.5 11,38.5 11,38.5 C 17.5,39.5 27.5,39.5 34,38.5 C 34,38.5 35.5,37.5 34,36 C 34,36 34.5,34.5 33,33.5 C 32.5,31 32.5,31.5 33.5,30 C 34.5,28 36,28 36,26 C 27.5,24.5 17.5,24.5 9,26 z" /></g>,
  wK: <g fill="#fff" stroke="#000" strokeWidth="2"><path d="M 22.5,11.63 L 22.5,6" /><path d="M 20,8 L 25,8" /><path d="M 22.5,25 C 22.5,25 27,17.5 25.5,14.5 C 25.5,14.5 24.5,12 22.5,12 C 20.5,12 19.5,14.5 19.5,14.5 C 18,17.5 22.5,25 22.5,25" /><path d="M 11.5,37 C 17,40.5 27,40.5 32.5,37 L 32.5,30 C 32.5,30 41.5,25.5 38.5,19.5 C 34.5,13 25,16 22.5,23.5 L 22.5,27 L 22.5,23.5 C 19,16 9.5,13 6.5,19.5 C 3.5,25.5 11.5,29.5 11.5,29.5 L 11.5,37 z" /></g>,
  bK: <g fill="#222" stroke="#000" strokeWidth="2"><path d="M 22.5,11.63 L 22.5,6" /><path d="M 20,8 L 25,8" /><path d="M 22.5,25 C 22.5,25 27,17.5 25.5,14.5 C 25.5,14.5 24.5,12 22.5,12 C 20.5,12 19.5,14.5 19.5,14.5 C 18,17.5 22.5,25 22.5,25" /><path d="M 11.5,37 C 17,40.5 27,40.5 32.5,37 L 32.5,30 C 32.5,30 41.5,25.5 38.5,19.5 C 34.5,13 25,16 22.5,23.5 L 22.5,27 L 22.5,23.5 C 19,16 9.5,13 6.5,19.5 C 3.5,25.5 11.5,29.5 11.5,29.5 L 11.5,37 z" /></g>,
};

// Prints the multi-agent tool trace cleanly to the browser DevTools Console (F12)
function logTraceToConsole(contextLabel, traceList, answeredBy = 'Head Coach Orchestrator') {
  console.group(`🤖 Multi-Agent Orchestration Trace — ${contextLabel}`);
  console.log(`Answered By: ${answeredBy}`);
  console.log(`Total Specialist Tool Calls: ${traceList.length}`);
  traceList.forEach((step, idx) => {
    console.log(`  ${idx + 1}. ${step}`);
  });
  console.groupEnd();
}

function extractPgnMetadata(pgnText) {
  const getTag = (tagName) => {
    const match = pgnText.match(new RegExp(`\\[${tagName}\\s+"([^"]+)"\\]`, 'i'));
    return match && match[1] && match[1] !== '?' ? match[1].trim() : null;
  };

  const white = getTag('White') || 'White';
  const black = getTag('Black') || 'Black';
  const result = getTag('Result') || '*';
  const rawDate = getTag('Date');
  const date = rawDate && !rawDate.includes('?') ? rawDate : new Date().toISOString().slice(0, 10);

  const isOtb = white === 'White' && black === 'Black';
  const defaultTitle = isOtb ? `Over-the-Board Game (${date})` : `${white} vs. ${black}`;

  return { white, black, result, date, defaultTitle };
}

function parseFenToBoard(fen) {
  const rows = (fen || STARTING_FEN).split(' ')[0].split('/');
  return rows.map((row) => {
    const squares = [];
    for (const char of row) {
      if (!isNaN(char)) {
        for (let i = 0; i < parseInt(char, 10); i++) squares.push(null);
      } else {
        const color = char === char.toUpperCase() ? 'w' : 'b';
        const type = char.toUpperCase();
        squares.push(`${color}${type}`);
      }
    }
    return squares;
  });
}

function DirectChessboard({ fen, onSquareClick, selectedSquare, orientation = 'white' }) {
  const board = parseFenToBoard(fen);
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  const rowIndices = orientation === 'white' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const colIndices = orientation === 'white' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(8, 56px)',
      gridTemplateRows: 'repeat(8, 56px)',
      width: '448px',
      height: '448px',
      border: '3px solid #333',
      borderRadius: '4px',
      userSelect: 'none',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
    }}>
      {rowIndices.map((rIdx, visualRow) =>
        colIndices.map((cIdx, visualCol) => {
          const piece = board[rIdx][cIdx];
          const squareName = `${files[cIdx]}${8 - rIdx}`;
          const isDark = (rIdx + cIdx) % 2 === 1;
          const isSelected = selectedSquare === squareName;

          let bg = isDark ? '#769656' : '#eeeed2';
          if (isSelected) bg = '#f6f669';

          return (
            <div
              key={squareName}
              onClick={() => onSquareClick(squareName)}
              style={{
                width: '56px',
                height: '56px',
                backgroundColor: bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                cursor: 'pointer'
              }}
            >
              {visualCol === 0 && (
                <span style={{ position: 'absolute', top: '2px', left: '4px', fontSize: '10px', fontWeight: 'bold', color: isDark ? '#eeeed2' : '#769656' }}>
                  {8 - rIdx}
                </span>
              )}
              {visualRow === 7 && (
                <span style={{ position: 'absolute', bottom: '2px', right: '4px', fontSize: '10px', fontWeight: 'bold', color: isDark ? '#eeeed2' : '#769656' }}>
                  {files[cIdx]}
                </span>
              )}
              {piece && (
                <svg viewBox="0 0 45 45" style={{ width: '46px', height: '46px' }}>
                  {PIECE_SVGS[piece]}
                </svg>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

export default function App() {
  const [activePage, setActivePage] = useState('analyze');

  const [savedGames, setSavedGames] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  });
  const [customTitle, setCustomTitle] = useState('');
  const [saveSuccessBanner, setSaveSuccessBanner] = useState('');

  // Session ID for SQLiteSession multi-turn conversation memory
  const [sessionId, setSessionId] = useState(() => `session_${Date.now()}`);

  const [gameMeta, setGameMeta] = useState({
    white_player: 'White',
    black_player: 'Black',
    result: '*',
    date: ''
  });
  const [fenHistory, setFenHistory] = useState([STARTING_FEN]);
  const [moveLabels, setMoveLabels] = useState(['Start Position']);
  const [currentStep, setCurrentStep] = useState(0);
  const [currentFen, setCurrentFen] = useState(STARTING_FEN);
  const [boardOrientation, setBoardOrientation] = useState('white');

  const [pgnInput, setPgnInput] = useState('');
  const [overviewMarkdown, setOverviewMarkdown] = useState('');
  const [whiteBlunders, setWhiteBlunders] = useState([]);
  const [blackBlunders, setBlackBlunders] = useState([]);

  const [selectedSide, setSelectedSide] = useState('White');
  const [activePuzzleIndex, setActivePuzzleIndex] = useState(null);
  const [revealedMoves, setRevealedMoves] = useState({});
  const [showSolutionText, setShowSolutionText] = useState(false);

  // Interactive Position Inspector State
  const [coachQuestion, setCoachQuestion] = useState('');
  const [coachConversation, setCoachConversation] = useState([]);
  const [askingCoach, setAskingCoach] = useState(false);

  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('Paste a PGN and click Analyze.');
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [puzzleStatus, setPuzzleStatus] = useState('');

  const currentBlundersList = selectedSide === 'White' ? whiteBlunders : blackBlunders;
  const activePuzzle = activePuzzleIndex !== null ? currentBlundersList[activePuzzleIndex] : null;

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (activePage !== 'analyze') return;
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft') goToStep(currentStep - 1);
      if (e.key === 'ArrowRight') goToStep(currentStep + 1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, fenHistory, activePage]);

  const handleAnalyze = async () => {
    if (!pgnInput.trim()) return;
    setLoading(true);
    setOverviewMarkdown('');
    setWhiteBlunders([]);
    setBlackBlunders([]);
    setActivePuzzleIndex(null);
    setRevealedMoves({});
    setShowSolutionText(false);
    setPuzzleStatus('');
    setSaveSuccessBanner('');
    setCoachConversation([]);

    const newSessionId = `session_${Date.now()}`;
    setSessionId(newSessionId);

    try {
      const meta = extractPgnMetadata(pgnInput);
      const res = await axios.post(`${API_BASE}/api/analyze`, { pgn: pgnInput });

      const backendFens = res.data.fens || [STARTING_FEN];
      const backendLabels = res.data.move_labels || ['Start Position'];
      const traceList = res.data.agent_trace || [];

      // Log orchestration trace to browser DevTools console
      logTraceToConsole(`Full Game Analysis (${meta.defaultTitle})`, traceList);

      setGameMeta({
        white_player: meta.white,
        black_player: meta.black,
        result: meta.result,
        date: meta.date
      });
      setCustomTitle(meta.defaultTitle);

      setFenHistory(backendFens);
      setMoveLabels(backendLabels);
      setCurrentStep(backendFens.length - 1);
      setCurrentFen(backendFens[backendFens.length - 1]);

      setOverviewMarkdown(res.data.overview || '');
      setWhiteBlunders(res.data.white_blunders || []);
      setBlackBlunders(res.data.black_blunders || []);
      setStatusText(
        `Analysis complete (${backendFens.length - 1} moves). You can name and save this game above!`
      );
    } catch (err) {
      console.error(err);
      setStatusText('Error analyzing game. Make sure your FastAPI backend is running on port 8000.');
    }
    setLoading(false);
  };

  // Ask the Interactive Coach Orchestrator a question (or click a quick-action button)
  const handleAskCoach = async (customPrompt = null) => {
    const questionText = (customPrompt ?? coachQuestion).trim();
    if (!questionText || askingCoach) return;

    setAskingCoach(true);
    if (!customPrompt) setCoachQuestion('');

    const puzzleContextStr = activePuzzle
      ? `${activePuzzle.player} Puzzle at Move ${activePuzzle.move_number}: Played blunder '${activePuzzle.move}' (${activePuzzle.eval_drop_pawns} pawns), Stockfish best_move is '${activePuzzle.best_move}', puzzle_fen is '${activePuzzle.puzzle_fen}'`
      : '';

    setCoachConversation((prev) => [...prev, { role: 'user', text: questionText }]);

    try {
      const res = await axios.post(`${API_BASE}/api/ask-coach`, {
        session_id: sessionId,
        question: questionText,
        current_fen: currentFen,
        move_label: moveLabels[currentStep] || `Step ${currentStep}`,
        active_puzzle_info: puzzleContextStr
      });

      const traceList = res.data.agent_trace || [];
      const answeredBy = res.data.answered_by || 'Interactive Coach Orchestrator';

      // Log orchestration trace to browser DevTools console
      logTraceToConsole(`Position Inspector ("${questionText.slice(0, 40)}...")`, traceList, answeredBy);

      setCoachConversation((prev) => [
        ...prev,
        {
          role: 'coach',
          text: res.data.reply,
          answeredBy
        }
      ]);
    } catch (err) {
      console.error(err);
      setCoachConversation((prev) => [
        ...prev,
        { role: 'coach', text: '⚠️ Error reaching the Coaching Team on port 8000.', answeredBy: 'System' }
      ]);
    }
    setAskingCoach(false);
  };

  const handleSaveCurrentGame = () => {
    if (fenHistory.length <= 1) return;
    const finalTitle = customTitle.trim() || `${gameMeta.white_player} vs. ${gameMeta.black_player}`;
    const newSavedGame = {
      id: Date.now().toString(),
      session_id: sessionId,
      title: finalTitle,
      saved_at: new Date().toLocaleString(),
      pgn: pgnInput,
      white_player: gameMeta.white_player,
      black_player: gameMeta.black_player,
      result: gameMeta.result,
      date: gameMeta.date,
      overview: overviewMarkdown,
      white_blunders: whiteBlunders,
      black_blunders: blackBlunders,
      fens: fenHistory,
      move_labels: moveLabels
    };

    const updated = [newSavedGame, ...savedGames];
    setSavedGames(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setSaveSuccessBanner(`✅ Saved "${finalTitle}" to My Saved Games!`);
  };

  const handleLoadSavedGame = (savedGame) => {
    setPgnInput(savedGame.pgn || '');
    setCustomTitle(savedGame.title || '');
    setSessionId(savedGame.session_id || `session_${savedGame.id}`);
    setGameMeta({
      white_player: savedGame.white_player || 'White',
      black_player: savedGame.black_player || 'Black',
      result: savedGame.result || '*',
      date: savedGame.date || ''
    });
    const fens = savedGame.fens || [STARTING_FEN];
    setFenHistory(fens);
    setMoveLabels(savedGame.move_labels || ['Start Position']);
    setCurrentStep(fens.length - 1);
    setCurrentFen(fens[fens.length - 1]);
    setOverviewMarkdown(savedGame.overview || '');
    setWhiteBlunders(savedGame.white_blunders || []);
    setBlackBlunders(savedGame.black_blunders || []);
    setCoachConversation([]);
    setActivePuzzleIndex(null);
    setRevealedMoves({});
    setShowSolutionText(false);
    setPuzzleStatus('');
    setSaveSuccessBanner('');
    setStatusText(`Loaded saved game: ${savedGame.title}`);
    setActivePage('analyze');
  };

  const handleDeleteSavedGame = (id) => {
    const updated = savedGames.filter((g) => g.id !== id);
    setSavedGames(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const goToStep = (stepIndex) => {
    const clamped = Math.max(0, Math.min(stepIndex, fenHistory.length - 1));
    setCurrentStep(clamped);
    setCurrentFen(fenHistory[clamped]);
    setSelectedSquare(null);
    setActivePuzzleIndex(null);
    setShowSolutionText(false);
    setPuzzleStatus('');
    setStatusText(`Move ${clamped} of ${fenHistory.length - 1}: ${moveLabels[clamped] || ''}`);
  };

  const handleSideChange = (e) => {
    const newSide = e.target.value;
    setSelectedSide(newSide);
    setActivePuzzleIndex(null);
    setShowSolutionText(false);
    setPuzzleStatus('');
    setBoardOrientation(newSide.toLowerCase());
  };

  const loadPuzzle = (blunder, index) => {
    setCurrentStep(blunder.ply_before);
    setCurrentFen(blunder.puzzle_fen);
    setSelectedSquare(null);
    setActivePuzzleIndex(index);
    setShowSolutionText(false);
    setBoardOrientation(blunder.player.toLowerCase());
    setPuzzleStatus(`Find the best move for ${blunder.player}! (Click a piece, then click a target square)`);
    setStatusText(
      `Viewing ${blunder.player} Puzzle #${index + 1}: Move ${blunder.move_number} — Mistake Played: "${blunder.move}" (${blunder.eval_drop_pawns} pawns)`
    );
  };

  const retryActivePuzzle = () => {
    if (!activePuzzle) return;
    setCurrentFen(activePuzzle.puzzle_fen);
    setSelectedSquare(null);
    setPuzzleStatus(`Position reset! Find the best move for ${activePuzzle.player}.`);
  };

  const toggleRevealMove = (e, side, index) => {
    e.stopPropagation();
    const key = `${side}-${index}`;
    setRevealedMoves((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSquareClick = (squareName) => {
    if (!selectedSquare) {
      setSelectedSquare(squareName);
      return;
    }

    if (selectedSquare === squareName) {
      setSelectedSquare(null);
      return;
    }

    try {
      const chessInstance = new Chess(currentFen);
      const moveObj = chessInstance.move({
        from: selectedSquare,
        to: squareName,
        promotion: 'q'
      });

      if (moveObj) {
        setCurrentFen(chessInstance.fen());
        setSelectedSquare(null);

        if (activePuzzle) {
          if (moveObj.san === activePuzzle.best_move) {
            setPuzzleStatus(`✅ Correct! ${moveObj.san} is the recommended best move!`);
          } else if (moveObj.san === activePuzzle.move) {
            setPuzzleStatus(`❌ You played ${moveObj.san}, which was the mistake played in the game! Click "Retry Position" to try again.`);
          } else {
            setPuzzleStatus(`❌ ${moveObj.san} is not the recommended move. Click "Retry Position" to try another move!`);
          }
        } else {
          setStatusText(`Custom move played on board: ${moveObj.san}`);
        }
      } else {
        setSelectedSquare(squareName);
      }
    } catch (e) {
      setSelectedSquare(squareName);
    }
  };

  return (
    <div style={{ padding: '1.5rem 2rem', fontFamily: 'Arial, sans-serif', maxWidth: '1240px', margin: '0 auto', color: '#222' }}>
      {/* Top Navigation Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '2px solid #dee2e6',
        paddingBottom: '1rem',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <h1 style={{ margin: 0, fontSize: '1.75rem' }}>AI Chess Coach & Blunder Puzzle Trainer</h1>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => setActivePage('analyze')}
            style={{
              padding: '0.6rem 1.2rem',
              background: activePage === 'analyze' ? '#007bff' : '#e9ecef',
              color: activePage === 'analyze' ? '#fff' : '#333',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '0.95rem'
            }}
          >
            ♟️ Analyze & Review Game
          </button>
          <button
            onClick={() => setActivePage('saved')}
            style={{
              padding: '0.6rem 1.2rem',
              background: activePage === 'saved' ? '#007bff' : '#e9ecef',
              color: activePage === 'saved' ? '#fff' : '#333',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '0.95rem'
            }}
          >
            📚 My Saved Games ({savedGames.length})
          </button>
        </div>
      </div>

      {/* PAGE 1: ANALYZE & REVIEW GAME */}
      {activePage === 'analyze' && (
        <>
          <div style={{ marginBottom: '1rem' }}>
            <textarea
              rows="4"
              style={{ width: '100%', padding: '0.6rem', borderRadius: '4px', border: '1px solid #ccc', fontFamily: 'monospace' }}
              placeholder="Paste your PGN string here..."
              value={pgnInput}
              onChange={(e) => setPgnInput(e.target.value)}
            />
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={handleAnalyze}
                disabled={loading}
                style={{ padding: '0.7rem 1.5rem', background: loading ? '#6c757d' : '#007bff', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                {loading ? 'Stockfish Analyzing & Agent Thinking...' : 'Analyze Game'}
              </button>

              {(whiteBlunders.length > 0 || blackBlunders.length > 0) && (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="Name this game (e.g., OTB vs. Alex)..."
                    style={{
                      padding: '0.65rem 0.8rem',
                      borderRadius: '4px',
                      border: '1px solid #adb5bd',
                      minWidth: '240px',
                      fontSize: '0.95rem'
                    }}
                  />
                  <button
                    onClick={handleSaveCurrentGame}
                    style={{
                      padding: '0.7rem 1.3rem',
                      background: '#28a745',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    💾 Save Game
                  </button>
                </div>
              )}

              {saveSuccessBanner && (
                <span style={{ fontWeight: 'bold', color: '#155724', background: '#d4edda', padding: '0.5rem 0.8rem', borderRadius: '4px' }}>
                  {saveSuccessBanner}
                </span>
              )}
            </div>
          </div>

          <div style={{ padding: '0.75rem', background: '#eef2f7', borderRadius: '6px', marginBottom: '1.5rem', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span>{statusText}</span>
            {fenHistory.length > 1 && (
              <span style={{ color: '#555' }}>
                {customTitle || `${gameMeta.white_player} vs. ${gameMeta.black_player}`}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '2.5rem', flexWrap: 'wrap' }}>
            {/* Left Column: Chessboard, Stepper, and White/Black Blunders */}
            <div style={{ width: '454px' }}>
              <DirectChessboard
                fen={currentFen}
                onSquareClick={handleSquareClick}
                selectedSquare={selectedSquare}
                orientation={boardOrientation}
              />

              {puzzleStatus && (
                <div style={{
                  marginTop: '0.75rem',
                  padding: '0.65rem',
                  background: puzzleStatus.startsWith('✅') ? '#d4edda' : '#fff3cd',
                  border: puzzleStatus.startsWith('✅') ? '1px solid #c3e6cb' : '1px solid #ffeeba',
                  borderRadius: '4px',
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span>{puzzleStatus}</span>
                  {activePuzzle && currentFen !== activePuzzle.puzzle_fen && (
                    <button
                      onClick={retryActivePuzzle}
                      style={{
                        padding: '0.35rem 0.65rem',
                        background: '#343a40',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      ↺ Retry Position
                    </button>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '1rem', justifyContent: 'space-between', alignItems: 'center' }}>
                <button onClick={() => goToStep(0)} style={{ padding: '0.45rem 0.65rem', cursor: 'pointer', fontWeight: 'bold' }}>&lt;&lt; Start</button>
                <button onClick={() => goToStep(currentStep - 1)} style={{ padding: '0.45rem 0.65rem', cursor: 'pointer', fontWeight: 'bold' }}>&lt; Prev</button>
                <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>
                  {currentStep} / {fenHistory.length - 1}
                </span>
                <button onClick={() => goToStep(currentStep + 1)} style={{ padding: '0.45rem 0.65rem', cursor: 'pointer', fontWeight: 'bold' }}>Next &gt;</button>
                <button onClick={() => goToStep(fenHistory.length - 1)} style={{ padding: '0.45rem 0.65rem', cursor: 'pointer', fontWeight: 'bold' }}>End &gt;&gt;</button>
                <button
                  onClick={() => setBoardOrientation(boardOrientation === 'white' ? 'black' : 'white')}
                  style={{ padding: '0.45rem 0.65rem', cursor: 'pointer', background: '#343a40', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '0.8rem' }}
                  title="Flip Board Orientation"
                >
                  Flip ⇅
                </button>
              </div>

              {(whiteBlunders.length > 0 || blackBlunders.length > 0) && (
                <div style={{ marginTop: '1.5rem', background: '#f1f3f5', padding: '1rem', borderRadius: '8px', border: '1px solid #dee2e6' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                    <label htmlFor="side-select" style={{ fontWeight: 'bold', fontSize: '1rem' }}>
                      Select Player Puzzles:
                    </label>
                    <select
                      id="side-select"
                      value={selectedSide}
                      onChange={handleSideChange}
                      style={{
                        padding: '0.45rem 0.8rem',
                        fontSize: '0.95rem',
                        fontWeight: 'bold',
                        borderRadius: '6px',
                        border: '1px solid #adb5bd',
                        cursor: 'pointer',
                        background: '#fff'
                      }}
                    >
                      <option value="White">⚪ White: {gameMeta.white_player} ({whiteBlunders.length})</option>
                      <option value="Black">⚫ Black: {gameMeta.black_player} ({blackBlunders.length})</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: '0.6rem', flexDirection: 'column' }}>
                    {currentBlundersList.map((b, index) => {
                      const revealKey = `${selectedSide}-${index}`;
                      const isMoveRevealed = !!revealedMoves[revealKey];

                      return (
                        <div
                          key={index}
                          onClick={() => loadPuzzle(b, index)}
                          style={{
                            padding: '0.75rem',
                            background: activePuzzleIndex === index ? '#d4edda' : '#ffffff',
                            border: activePuzzleIndex === index ? '2px solid #28a745' : '1px solid #ced4da',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontSize: '0.92rem'
                          }}
                        >
                          <div><b>{selectedSide} Puzzle #{index + 1}: Move {b.move_number}</b></div>
                          <div style={{ marginTop: '6px', color: '#555', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                            <span>
                              Mistake Played: <b style={{ color: '#d9534f' }}>{b.move}</b> ({b.eval_drop_pawns} pawns)
                            </span>
                            <span>
                              Best Move:{' '}
                              {isMoveRevealed ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                  <b style={{ color: '#28a745' }}>{b.best_move}</b>
                                  <button
                                    onClick={(e) => toggleRevealMove(e, selectedSide, index)}
                                    style={{
                                      padding: '2px 6px',
                                      fontSize: '0.75rem',
                                      background: '#e9ecef',
                                      border: '1px solid #adb5bd',
                                      borderRadius: '4px',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Hide
                                  </button>
                                </span>
                              ) : (
                                <button
                                  onClick={(e) => toggleRevealMove(e, selectedSide, index)}
                                  style={{
                                    padding: '2px 8px',
                                    fontSize: '0.8rem',
                                    fontWeight: 'bold',
                                    background: '#6c757d',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Show
                                </button>
                              )}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: AI Coach Panel + Interactive Position Inspector */}
            <div style={{ flex: 1, minWidth: '360px', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              {/* Main AI Coach Markdown Panel */}
              <div style={{ background: '#f8f9fa', padding: '1.5rem', borderRadius: '8px', border: '1px solid #ddd', maxHeight: '480px', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e9ecef', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0 }}>
                    {activePuzzleIndex !== null
                      ? `AI Coach: ${selectedSide} Puzzle #${activePuzzleIndex + 1}`
                      : 'AI Coach: Full Game Overview'}
                  </h3>
                  {activePuzzleIndex !== null && (
                    <button
                      onClick={() => setActivePuzzleIndex(null)}
                      style={{
                        padding: '0.4rem 0.8rem',
                        background: '#007bff',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        fontWeight: 'bold'
                      }}
                    >
                      Show Full Game Overview
                    </button>
                  )}
                </div>

                <div style={{ lineHeight: '1.6' }}>
                  {activePuzzle ? (
                    <div>
                      <ReactMarkdown>{activePuzzle.problem_markdown}</ReactMarkdown>

                      <div style={{ marginTop: '1.25rem', borderTop: '1px solid #dee2e6', paddingTop: '1rem' }}>
                        {!showSolutionText ? (
                          <button
                            onClick={() => setShowSolutionText(true)}
                            style={{
                              padding: '0.6rem 1.2rem',
                              background: '#28a745',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontWeight: 'bold',
                              fontSize: '0.95rem'
                            }}
                          >
                            👁️ View Solution & Explanation
                          </button>
                        ) : (
                          <div style={{ background: '#e8f5e9', padding: '1rem', borderRadius: '6px', border: '1px solid #c3e6cb' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                              <span style={{ fontWeight: 'bold', color: '#155724' }}>Solution Revealed</span>
                              <button
                                onClick={() => setShowSolutionText(false)}
                                style={{
                                  padding: '0.25rem 0.6rem',
                                  background: '#fff',
                                  border: '1px solid #adb5bd',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '0.8rem'
                                }}
                              >
                                Hide Solution
                              </button>
                            </div>
                            <ReactMarkdown>{activePuzzle.solution_markdown}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : overviewMarkdown ? (
                    <ReactMarkdown>{overviewMarkdown}</ReactMarkdown>
                  ) : (
                    <p style={{ color: '#666' }}>
                      Paste a PGN (or bare moves from an over-the-board game) and click "Analyze Game & Generate Puzzles" to get Stockfish-backed analysis and interactive blunder puzzles.
                    </p>
                  )}
                </div>
              </div>

              {/* Interactive Position Inspector & Multi-Turn Coaching Desk (SQLiteSession Memory) */}
              <div style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '8px', border: '1px solid #ced4da', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                  <h4 style={{ margin: 0 }}>🧠 Interactive Position Inspector</h4>
                  <span style={{ fontSize: '0.78rem', color: '#6c757d', fontFamily: 'monospace' }}>
                    Session: {sessionId.slice(-8)}
                  </span>
                </div>
                <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.86rem', color: '#555' }}>
                  Ask the Coaching Team about the current board position or active puzzle.
                </p>

                {/* Quick-Action Specialist Tool Triggers */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
                  <button
                    onClick={() => handleAskCoach('Inspect the current board mechanics, material balance, checks, and Stockfish evaluation for this FEN.')}
                    disabled={askingCoach}
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.82rem', background: '#e9ecef', border: '1px solid #ced4da', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    📐 Inspect Board & Material
                  </button>
                  <button
                    onClick={() => handleAskCoach('Give me a subtle positional or tactical hint for this position without spoiling the exact move notation.')}
                    disabled={askingCoach}
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.82rem', background: '#e9ecef', border: '1px solid #ced4da', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    💡 Give Me a Tactical Hint
                  </button>
                  {activePuzzle && (
                    <button
                      onClick={() => handleAskCoach(`Compare the blunder move (${activePuzzle.move}) against Stockfish's best move (${activePuzzle.best_move}) on this puzzle FEN and log the tactical theme.`)}
                      disabled={askingCoach}
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.82rem', background: '#fff3cd', border: '1px solid #ffeeba', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      ⚔️ Compare Blunder vs. Best Move
                    </button>
                  )}
                </div>

                {/* Conversation History Thread */}
                {coachConversation.length > 0 && (
                  <div style={{ maxHeight: '260px', overflowY: 'auto', marginBottom: '0.85rem', padding: '0.75rem', background: '#f8f9fa', borderRadius: '6px', border: '1px solid #e9ecef', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {coachConversation.map((msg, i) => (
                      <div
                        key={i}
                        style={{
                          alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                          background: msg.role === 'user' ? '#007bff' : '#ffffff',
                          color: msg.role === 'user' ? '#fff' : '#222',
                          border: msg.role === 'user' ? 'none' : '1px solid #dee2e6',
                          padding: '0.6rem 0.85rem',
                          borderRadius: '8px',
                          maxWidth: '92%',
                          fontSize: '0.9rem'
                        }}
                      >
                        {msg.role === 'coach' && (
                          <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#0056b3', marginBottom: '4px' }}>
                            🤖 {msg.answeredBy}
                          </div>
                        )}
                        <div style={{ lineHeight: '1.5' }}>
                          {msg.role === 'coach' ? <ReactMarkdown>{msg.text}</ReactMarkdown> : msg.text}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Question Input Bar */}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    placeholder="Ask about this position, a move idea, or a follow-up question..."
                    value={coachQuestion}
                    onChange={(e) => setCoachQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAskCoach();
                    }}
                    style={{ flex: 1, padding: '0.55rem 0.75rem', borderRadius: '4px', border: '1px solid #ced4da', fontSize: '0.9rem' }}
                  />
                  <button
                    onClick={() => handleAskCoach()}
                    disabled={askingCoach || !coachQuestion.trim()}
                    style={{
                      padding: '0.55rem 1rem',
                      background: askingCoach ? '#6c757d' : '#007bff',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    {askingCoach ? 'Thinking...' : 'Ask Coach'}
                  </button>
                </div>
              </div>

            </div>
          </div>
        </>
      )}

      {/* PAGE 2: MY SAVED GAMES (Browser localStorage) */}
      {activePage === 'saved' && (
        <div>
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ margin: 0 }}>My Saved Games</h2>
            <p style={{ margin: '0.25rem 0 0 0', color: '#555' }}>
              Games saved in your browser. Click any game below to reopen its board, move history, and 6 blunder puzzles.
            </p>
          </div>

          {savedGames.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #dee2e6' }}>
              <h3 style={{ marginTop: 0 }}>You haven't saved any games yet</h3>
              <p style={{ color: '#666' }}>
                Analyze a game on the "Analyze & Review Game" tab and click "💾 Save Game" to keep it here!
              </p>
              <button
                onClick={() => setActivePage('analyze')}
                style={{ padding: '0.6rem 1.2rem', background: '#007bff', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Go Analyze a Game
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.25rem' }}>
              {savedGames.map((g) => (
                <div
                  key={g.id}
                  style={{
                    background: '#fff',
                    border: '1px solid #dee2e6',
                    borderRadius: '8px',
                    padding: '1.25rem',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>
                        {g.title}
                      </h3>
                      {g.result && g.result !== '*' && (
                        <span style={{ background: '#e9ecef', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                          {g.result}
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.75rem' }}>
                      🕒 Saved: {g.saved_at}
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                      <span style={{ background: '#eef2f7', padding: '4px 8px', borderRadius: '4px' }}>
                        ♟️ {(g.fens?.length || 1) - 1} Half-Moves
                      </span>
                      <span style={{ background: '#fff3cd', padding: '4px 8px', borderRadius: '4px' }}>
                        🧩 {(g.white_blunders?.length || 0) + (g.black_blunders?.length || 0)} Puzzles
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button
                      onClick={() => handleLoadSavedGame(g)}
                      style={{
                        flex: 1,
                        padding: '0.6rem',
                        background: '#007bff',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      📂 Open Game & Puzzles
                    </button>
                    <button
                      onClick={() => handleDeleteSavedGame(g.id)}
                      style={{
                        padding: '0.6rem 0.85rem',
                        background: '#dc3545',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                      title="Delete Saved Game"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}