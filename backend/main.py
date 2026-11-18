import os
import io
from datetime import datetime
from typing import List, Optional
import chess
import chess.pgn
import chess.engine
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from openai import AsyncAzureOpenAI
from agents import (
    Agent,
    Runner,
    OpenAIChatCompletionsModel,
    SQLiteSession,
    set_tracing_disabled,
    function_tool,
    GuardrailFunctionOutput,
    RunContextWrapper,
    InputGuardrailTripwireTriggered,
    input_guardrail,
)
from agents.extensions.handoff_prompt import RECOMMENDED_PROMPT_PREFIX

load_dotenv(override=True)
set_tracing_disabled(True)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

azure_client = AsyncAzureOpenAI(
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
    api_version="2024-10-21",
)
azure_model = OpenAIChatCompletionsModel(
    model="gpt-5.4-ptu",
    openai_client=azure_client,
)

STOCKFISH_PATH = "./stockfish.exe"

# Track tool calls during a request so the frontend can see orchestration in action
CURRENT_RUN_TOOL_LOG: List[str] = []


class GameInput(BaseModel):
    pgn: str


class AskCoachInput(BaseModel):
    session_id: str
    question: str
    current_fen: str
    move_label: Optional[str] = ""
    active_puzzle_info: Optional[str] = ""


class PuzzleCoaching(BaseModel):
    problem_markdown: str = Field(
        description="Markdown explaining why the move played in the game was a blunder and a brief hint on what to look for, WITHOUT naming or spoiling Stockfish's best_move."
    )
    solution_markdown: str = Field(
        description="Markdown revealing Stockfish's recommended best_move, explaining why it is the best move tactically/positionally, and stating the key lesson."
    )


class CoachingResponse(BaseModel):
    overview_markdown: str = Field(
        description="High-level Markdown summary of the overall game, opening play, and key takeaways for both sides."
    )
    white_puzzles: List[PuzzleCoaching] = Field(
        description="List of 3 PuzzleCoaching items corresponding in exact order to White's 3 blunders."
    )
    black_puzzles: List[PuzzleCoaching] = Field(
        description="List of 3 PuzzleCoaching items corresponding in exact order to Black's 3 blunders."
    )


# =====================================================================
# DETERMINISTIC TOOLS
# =====================================================================

@function_tool
def inspect_board_mechanics_tool(fen: str) -> str:
    """Inspects a chess position FEN using python-chess to report material balance, checks, and legal captures.

    Args:
        fen: The Forsyth-Edwards Notation (FEN) string of the board position.
    """
    CURRENT_RUN_TOOL_LOG.append("Game Analyst -> inspect_board_mechanics_tool")
    try:
        board = chess.Board(fen)
        piece_Map = {
            chess.PAWN: ("Pawns", 1),
            chess.KNIGHT: ("Knights", 3),
            chess.BISHOP: ("Bishops", 3),
            chess.ROOK: ("Rooks", 5),
            chess.QUEEN: ("Queens", 9),
        }
        w_pts, b_pts = 0, 0
        w_summary, b_summary = [], []
        for p_type, (name, val) in piece_Map.items():
            w_count = len(board.pieces(p_type, chess.WHITE))
            b_count = len(board.pieces(p_type, chess.BLACK))
            w_pts += w_count * val
            b_pts += b_count * val
            if w_count:
                w_summary.append(f"{w_count} {name}")
            if b_count:
                b_summary.append(f"{b_count} {name}")

        turn_str = "White" if board.turn == chess.WHITE else "Black"
        captures = [board.san(m) for m in board.legal_moves if board.is_capture(m)]
        checks = [board.san(m) for m in board.legal_moves if board.gives_check(m)]

        return (
            f"Turn to move: {turn_str} | Material: White ({w_pts} pts: {', '.join(w_summary)}) vs "
            f"Black ({b_pts} pts: {', '.join(b_summary)}) | "
            f"In Check: {board.is_check()} | Available Captures: {captures[:8]} | Available Checks: {checks[:8]}"
        )
    except Exception as e:
        return f"Error inspecting FEN: {e}"


@function_tool
def evaluate_fen_with_stockfish_tool(fen: str) -> str:
    """Runs Stockfish on a specific FEN position to get the engine evaluation and top continuation line.

    Args:
        fen: The Forsyth-Edwards Notation (FEN) string to evaluate.
    """
    CURRENT_RUN_TOOL_LOG.append("Game Analyst -> evaluate_fen_with_stockfish_tool")
    try:
        if not os.path.exists(STOCKFISH_PATH):
            return "Stockfish binary not found."
        board = chess.Board(fen)
        engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)
        info = engine.analyse(board, chess.engine.Limit(depth=12))
        engine.quit()

        score_obj = info["score"].white()
        cp = score_obj.score(mate_score=10000)
        pawns = round(cp / 100.0, 2) if cp is not None else "Mate"

        pv_moves = info.get("pv", [])[:4]
        pv_san = []
        temp_board = board.copy()
        for m in pv_moves:
            pv_san.append(temp_board.san(m))
            temp_board.push(m)

        return f"Stockfish Eval (White POV): {pawns} pawns | Best Engine Continuation: {' '.join(pv_san)}"
    except Exception as e:
        return f"Error evaluating FEN with Stockfish: {e}"


@function_tool
def compare_blunder_vs_best_move_tool(puzzle_fen: str, played_move_san: str, best_move_san: str) -> str:
    """Simulates the blunder move vs Stockfish's best move on the board and finds how the opponent punishes the blunder.

    Args:
        puzzle_fen: The FEN string right before the blunder occurred.
        played_move_san: The mistake move played in the game (in SAN, e.g., 'Qxd5').
        best_move_san: Stockfish's recommended best move (in SAN, e.g., 'Bb5+').
    """
    CURRENT_RUN_TOOL_LOG.append(f"Puzzle Designer -> compare_blunder_vs_best_move_tool ({played_move_san} vs {best_move_san})")
    try:
        if not os.path.exists(STOCKFISH_PATH):
            return "Stockfish binary not found."
        board = chess.Board(puzzle_fen)
        engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)

        # 1. See what happens after the blunder move is played
        board_after_blunder = board.copy()
        board_after_blunder.push_san(played_move_san)
        punish_res = engine.play(board_after_blunder, chess.engine.Limit(depth=10))
        punish_san = board_after_blunder.san(punish_res.move) if punish_res.move else "None"

        # 2. See the follow-up after the best move is played
        board_after_best = board.copy()
        board_after_best.push_san(best_move_san)
        reply_res = engine.play(board_after_best, chess.engine.Limit(depth=10))
        reply_san = board_after_best.san(reply_res.move) if reply_res.move else "None"

        engine.quit()
        return (
            f"After blunder '{played_move_san}', opponent immediately punishes with '{punish_san}'. "
            f"Instead, after best move '{best_move_san}', expected continuation is '{reply_san}'."
        )
    except Exception as e:
        return f"Comparison error: {e}"


@function_tool
def log_training_theme_tool(player: str, move_number: int, tactical_theme: str) -> str:
    """Logs a detected tactical weakness or blunder theme to training_log.txt for player progress tracking.

    Args:
        player: 'White' or 'Black'.
        move_number: The full move number where the blunder occurred.
        tactical_theme: Short name of the tactical motif (e.g., 'Hanging Piece', 'Pin', 'Back-Rank Mate', 'King Safety').
    """
    CURRENT_RUN_TOOL_LOG.append(f"Puzzle Designer -> log_training_theme_tool ({tactical_theme})")
    try:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        with open("training_log.txt", "a", encoding="utf-8") as f:
            f.write(f"[{timestamp}] {player} (Move {move_number}): {tactical_theme}\n")
        return f"Logged theme '{tactical_theme}' for {player} at move {move_number}."
    except Exception as e:
        return f"Failed to log theme: {e}"


# =====================================================================
# MULTI-AGENT ARCHITECTURE: 2 SPECIALISTS + 1 ORCHESTRATOR
# =====================================================================

analyst_instructions = f"""{RECOMMENDED_PROMPT_PREFIX}
You are the Strategic Game Analyst Agent on the Chess Coaching Team.
Your role is to evaluate board positions, material imbalances, and strategic plans.
- ALWAYS call `inspect_board_mechanics_tool` and `evaluate_fen_with_stockfish_tool` when asked to analyze a FEN position or explain the state of a game.
- Never guess piece locations or evaluations without calling your tools first.
"""

game_analyst_agent = Agent(
    name="Game Analyst Agent",
    handoff_description="Analyzes board mechanics, material balance, and Stockfish evaluations for any FEN.",
    instructions=analyst_instructions,
    tools=[inspect_board_mechanics_tool, evaluate_fen_with_stockfish_tool],
    model=azure_model,
)

puzzle_designer_instructions = f"""{RECOMMENDED_PROMPT_PREFIX}
You are the Tactical Puzzle Designer Agent on the Chess Coaching Team.
Your role is to investigate blunders, find how the opponent refutes the blunder, and log tactical training themes.
- ALWAYS call `compare_blunder_vs_best_move_tool` to see the exact refutation of a blunder move vs. the best move.
- ALWAYS call `log_training_theme_tool` to record the tactical motif (e.g., 'Hanging Piece', 'Missed Check', 'Fork', 'King Exposure') for the player's training log.
"""

puzzle_designer_agent = Agent(
    name="Puzzle Designer Agent",
    handoff_description="Investigates blunder refutations and logs tactical puzzle themes.",
    instructions=puzzle_designer_instructions,
    tools=[compare_blunder_vs_best_move_tool, log_training_theme_tool],
    model=azure_model,
)

# Wrap both specialist agents as tools for the Orchestrator (Lab 9 / Lab 11 Pattern)
consult_game_analyst = game_analyst_agent.as_tool(
    tool_name="consult_game_analyst",
    tool_description="Consult the Strategic Game Analyst Agent to inspect a FEN's material balance, checks, captures, and Stockfish continuation.",
)

consult_puzzle_designer = puzzle_designer_agent.as_tool(
    tool_name="consult_puzzle_designer",
    tool_description="Consult the Tactical Puzzle Designer Agent to compare a blunder against Stockfish's best move and log the tactical theme.",
)

# Orchestrator 1: Structured Full-Game & Puzzle Report Orchestrator
analysis_orchestrator = Agent(
    name="Head Coach Orchestrator",
    instructions="""You are the Head Chess Coach Orchestrator. You coordinate two specialist agents:
    1. `consult_game_analyst`: Call this specialist on the final game FEN (or key critical FENs) to get material/positional context for `overview_markdown`.
    2. `consult_puzzle_designer`: Call this specialist to compare the blunder move vs. Stockfish's best move and log the tactical theme.

    You MUST call BOTH `consult_game_analyst` and `consult_puzzle_designer` at least once before generating your final structured `CoachingResponse`.
    In `white_puzzles` and `black_puzzles`:
    - `problem_markdown`: Explain why the played move failed and provide a tactical hint. CRITICAL: Do NOT name or spoil Stockfish's `best_move` in `problem_markdown`!
    - `solution_markdown`: Reveal Stockfish's `best_move`, include the refutation/continuation discovered by `consult_puzzle_designer`, and state the key takeaway.""",
    tools=[consult_game_analyst, consult_puzzle_designer],
    output_type=CoachingResponse,
    model=azure_model,
)

# Input guardrail: keep the interactive coach on chess topics only
class ChessTopicCheck(BaseModel):
    is_off_topic: bool
    reasoning: str


chess_topic_guardrail_agent = Agent(
    name="Chess Topic Guardrail",
    instructions=(
        "You are a topic filter for a chess coaching app. "
        "The input contains a board state followed by the text 'Player Request:' and the player's request. "
        "Judge ONLY the player's request, never the board state. "
        "Set is_off_topic to false if the request is about chess: the position, the game, a puzzle, "
        "a move, a mistake, chess strategy or rules, or a short follow-up such as 'why?', "
        "'give me a hint', or 'what should I have played?'. "
        "Set is_off_topic to true if the request is unrelated to chess (for example geography, coding, "
        "homework, or general chat), even though a board position is attached. "
        "If you are unsure, set is_off_topic to false. Explain briefly in reasoning."
    ),
    output_type=ChessTopicCheck,
    model=azure_model,
)


@input_guardrail
async def chess_topic_guardrail(ctx: RunContextWrapper, agent: Agent, input) -> GuardrailFunctionOutput:
    result = await Runner.run(chess_topic_guardrail_agent, input, context=ctx.context)
    return GuardrailFunctionOutput(
        output_info=result.final_output,
        tripwire_triggered=result.final_output.is_off_topic,
    )


# Orchestrator 2: Interactive Multi-Turn Position & Puzzle Coach (with SQLiteSession memory)
interactive_coach_orchestrator = Agent(
    name="Interactive Coach Orchestrator",
    instructions="""You are the Head Chess Coach Orchestrator helping a player study a specific board position or blunder puzzle.
    - When the player asks about a position, plan, or square, call `consult_game_analyst` with the current FEN so your answer is grounded in exact board mechanics and Stockfish lines.
    - When the player asks about a blunder, why a move was bad, or wants a puzzle breakdown, call `consult_puzzle_designer`.
    - If the player asks for a HINT on an active puzzle, give a helpful positional or tactical clue WITHOUT spoiling the exact `best_move` notation unless they explicitly ask for the answer.
    - Keep your responses concise, encouraging, and formatted in clean Markdown.""",
    tools=[consult_game_analyst, consult_puzzle_designer],
    input_guardrails=[chess_topic_guardrail],
    model=azure_model,
)


# =====================================================================
# STOCKFISH FULL-GAME PARSER
# =====================================================================

def analyze_game_with_stockfish(pgn_text: str):
    """Runs Stockfish across the PGN, extracts all FENs, and finds top 3 blunders for White and Black."""
    try:
        pgn = io.StringIO(pgn_text.strip())
        game = chess.pgn.read_game(pgn)
        if not game:
            return {"error": "Invalid PGN provided."}

        board = game.board()
        if not os.path.exists(STOCKFISH_PATH):
            return {"error": f"Stockfish binary not found at {STOCKFISH_PATH}."}

        engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)

        fens = [board.fen()]
        move_labels = ["Start Position"]
        moves_data = []

        info = engine.analyse(board, chess.engine.Limit(depth=12))
        score_obj = info["score"].white()
        prev_score = score_obj.score(mate_score=10000)
        if prev_score is None:
            prev_score = 10000 if score_obj.is_mate() and score_obj.mate() > 0 else -10000

        for ply, node in enumerate(game.mainline(), start=1):
            board_before_fen = board.fen()
            move = node.move
            is_white_turn = (board.turn == chess.WHITE)
            full_move_number = board.fullmove_number

            san_move = board.san(move)

            best_move_info = engine.play(board, chess.engine.Limit(depth=10))
            best_move_san = board.san(best_move_info.move) if best_move_info.move else "Unknown"

            board.push(move)
            after_fen = board.fen()
            fens.append(after_fen)

            move_notation = f"{full_move_number}. {san_move}" if is_white_turn else f"{full_move_number}... {san_move}"
            move_labels.append(move_notation)

            info = engine.analyse(board, chess.engine.Limit(depth=12))
            score_obj = info["score"].white()
            current_score = score_obj.score(mate_score=10000)
            if current_score is None:
                current_score = 10000 if score_obj.is_mate() and score_obj.mate() > 0 else -10000

            if is_white_turn:
                eval_drop = current_score - prev_score
            else:
                eval_drop = prev_score - current_score

            moves_data.append({
                "ply_before": ply - 1,
                "move_number": full_move_number,
                "player": "White" if is_white_turn else "Black",
                "move": san_move,
                "best_move": best_move_san,
                "eval_before": round(prev_score / 100.0, 2),
                "eval_after": round(current_score / 100.0, 2),
                "eval_drop": eval_drop,
                "eval_drop_pawns": round(eval_drop / 100.0, 2),
                "puzzle_fen": board_before_fen
            })
            prev_score = current_score

        engine.quit()

        white_moves = [m for m in moves_data if m["player"] == "White" and m["move"] != m["best_move"]]
        black_moves = [m for m in moves_data if m["player"] == "Black" and m["move"] != m["best_move"]]

        white_moves.sort(key=lambda x: x["eval_drop"])
        black_moves.sort(key=lambda x: x["eval_drop"])

        return {
            "fens": fens,
            "move_labels": move_labels,
            "white_blunders": white_moves[:3],
            "black_blunders": black_moves[:3],
            "total_plies": len(fens) - 1
        }
    except Exception as e:
        return {"error": str(e)}


# =====================================================================
# API ENDPOINTS
# =====================================================================

@app.post("/api/analyze")
async def analyze_game(data: GameInput):
    CURRENT_RUN_TOOL_LOG.clear()
    analysis_raw = analyze_game_with_stockfish(data.pgn)
    if "error" in analysis_raw:
        raise HTTPException(status_code=500, detail=analysis_raw["error"])

    white_blunders = analysis_raw["white_blunders"]
    black_blunders = analysis_raw["black_blunders"]
    mid_fen = analysis_raw["fens"][len(analysis_raw["fens"]) // 2]

    prompt = (
        f"Analyze this chess game ({analysis_raw['total_plies']} half-moves).\n"
        f"Mid-game snapshot FEN to inspect with `consult_game_analyst`: {mid_fen}\n\n"
        f"White's Top 3 Blunders: {white_blunders}\n\n"
        f"Black's Top 3 Blunders: {black_blunders}\n\n"
        f"Instructions:\n"
        f"1. Call `consult_game_analyst` on the mid-game FEN (or a critical blunder FEN) to inspect board mechanics and Stockfish evaluation.\n"
        f"2. Call `consult_puzzle_designer` on the worst blunders to compare the mistake against Stockfish's best move and log the tactical themes.\n"
        f"3. Return the complete `CoachingResponse` with `overview_markdown`, `white_puzzles`, and `black_puzzles`."
    )

    result = await Runner.run(analysis_orchestrator, prompt)
    structured_output: CoachingResponse = result.final_output

    for i, b in enumerate(white_blunders):
        if i < len(structured_output.white_puzzles):
            b["problem_markdown"] = structured_output.white_puzzles[i].problem_markdown
            b["solution_markdown"] = structured_output.white_puzzles[i].solution_markdown
        else:
            b["problem_markdown"] = "### Puzzle Challenge\nFind the best move in this position."
            b["solution_markdown"] = f"### Solution\nThe best move was **{b['best_move']}**."

    for i, b in enumerate(black_blunders):
        if i < len(structured_output.black_puzzles):
            b["problem_markdown"] = structured_output.black_puzzles[i].problem_markdown
            b["solution_markdown"] = structured_output.black_puzzles[i].solution_markdown
        else:
            b["problem_markdown"] = "### Puzzle Challenge\nFind the best move in this position."
            b["solution_markdown"] = f"### Solution\nThe best move was **{b['best_move']}**."

    return {
        "overview": structured_output.overview_markdown,
        "white_blunders": white_blunders,
        "black_blunders": black_blunders,
        "fens": analysis_raw["fens"],
        "move_labels": analysis_raw["move_labels"],
        "agent_trace": list(CURRENT_RUN_TOOL_LOG),
    }


@app.post("/api/ask-coach")
async def ask_coach(data: AskCoachInput):
    """Multi-turn interactive coaching endpoint backed by SQLiteSession memory and Orchestrator tools."""
    CURRENT_RUN_TOOL_LOG.clear()
    session = SQLiteSession(data.session_id, "chess_coach_memory.db")

    context_message = (
        f"[Current Board State Viewed by Player]\n"
        f"- FEN: {data.current_fen}\n"
        f"- Move Step: {data.move_label}\n"
        f"- Active Puzzle Context: {data.active_puzzle_info or 'None (browsing game history)'}\n\n"
        f"Player Request: {data.question}"
    )

    try:
        result = await Runner.run(
            interactive_coach_orchestrator,
            context_message,
            session=session,
        )
    except InputGuardrailTripwireTriggered:
        with open("flagged_messages.txt", "a", encoding="utf-8") as f:
            f.write(f"Off topic message: {data.question}\n")
        return {
            "reply": "Only chess-related questions, please.",
            "answered_by": "Chess Topic Guardrail",
            "agent_trace": ["Chess Topic Guardrail -> tripwire triggered"],
        }

    return {
        "reply": result.final_output,
        "answered_by": result.last_agent.name,
        "agent_trace": list(CURRENT_RUN_TOOL_LOG),
    }