import os
import io
import chess
import chess.pgn
import chess.engine
from typing import List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from openai import AsyncAzureOpenAI
from agents import Agent, Runner, OpenAIChatCompletionsModel, set_tracing_disabled, function_tool

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

class GameInput(BaseModel):
    pgn: str

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

def analyze_game_with_stockfish(pgn_text: str):
    """Runs Stockfish, extracts all game FENs, and finds the top 3 blunders for White and Black separately."""
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
        
        white_blunders = white_moves[:3]
        black_blunders = black_moves[:3]

        return {
            "fens": fens,
            "move_labels": move_labels,
            "white_blunders": white_blunders,
            "black_blunders": black_blunders,
            "total_plies": len(fens) - 1
        }
    except Exception as e:
        return {"error": str(e)}

@function_tool
def get_stockfish_analysis(pgn: str) -> str:
    """Analyzes a PGN string using Stockfish and returns top blunders for White and Black."""
    results = analyze_game_with_stockfish(pgn)
    return str(results)

coach_agent = Agent(
    name="Chess Coach Agent",
    instructions="""You are an expert chess coach. You will be given the top 3 biggest evaluation drops for White and the top 3 biggest evaluation drops for Black from Stockfish analysis.
    1. In `overview_markdown`, write a clean Markdown summary of the game's flow, opening play, and key lessons for both sides.
    2. For each blunder in `white_puzzles` and `black_puzzles`, split your coaching into two parts so the user can try solving the puzzle without spoilers:
       - `problem_markdown`: Use Markdown headings (##) and bullets to explain what move was played in the game, why it was a mistake, and a subtle hint about the position. CRITICAL: Do NOT mention or spoil Stockfish's `best_move` in `problem_markdown`!
       - `solution_markdown`: Use Markdown headings (##) and bold text to reveal Stockfish's `best_move`, explain why it works tactically or positionally, and give a one-sentence takeaway lesson.""",
    tools=[get_stockfish_analysis],
    output_type=CoachingResponse,
    model=azure_model
)

@app.post("/api/analyze")
async def analyze_game(data: GameInput):
    analysis_raw = analyze_game_with_stockfish(data.pgn)
    if "error" in analysis_raw:
        raise HTTPException(status_code=500, detail=analysis_raw["error"])
        
    white_blunders = analysis_raw["white_blunders"]
    black_blunders = analysis_raw["black_blunders"]
    
    prompt = (
        f"Here are White's top 3 evaluation drops in order: {white_blunders}\n\n"
        f"Here are Black's top 3 evaluation drops in order: {black_blunders}\n\n"
        f"Generate the game overview_markdown, white_puzzles, and black_puzzles."
    )
    result = await Runner.run(coach_agent, prompt)
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
        "move_labels": analysis_raw["move_labels"]
    }