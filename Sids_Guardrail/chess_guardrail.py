from agents.decorators import input_guardrail
from agents import GuardrailFunctionOutput, RunContextWrapper, InputGuardrailTripwireTriggered


class ChessTopicCheck(BaseModel):
    is_off_topic: bool
    reasoning: str


chess_topic_guardrail_agent = Agent(
    name="Chess Topic Guardrail",
    instructions=(
        "Decide if this message has nothing to do with chess, "
        "the current board position, the game, or the puzzle. "
        "The message includes the current board state and the player's request. "
        "Short follow-up questions about the previous answer are on topic."
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


interactive_coach_orchestrator = Agent(
    name="Interactive Coach Orchestrator",
    instructions=interactive_coach_instructions,
    tools=[consult_game_analyst, consult_puzzle_designer],
    input_guardrails=[chess_topic_guardrail],
    model=azure_model,
)


@app.post("/api/ask-coach")
async def ask_coach(data: AskCoachInput):
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
        with open("flagged_messages.txt", "a") as f:
            f.write(f"Off topic message: {data.question}\n")
        return {
            "reply": "Only chess related questions please.",
            "answered_by": "Chess Topic Guardrail",
            "agent_trace": ["Chess Topic Guardrail -> tripwire triggered"],
        }

    return {
        "reply": result.final_output,
        "answered_by": result.last_agent.name,
        "agent_trace": list(CURRENT_RUN_TOOL_LOG),
    }
