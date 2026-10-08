"""Pure room transitions; answers and ranking are decided by the server."""

import copy
import secrets
import unicodedata

LIMITS = {"maxPlayers": 500, "maxQuestions": 30, "minSeconds": 10, "maxSeconds": 120}


class GameError(ValueError):
    def __init__(self, message: str, status: int = 409):
        super().__init__(message)
        self.status = status


def nickname_value(value: str) -> tuple[str, str]:
    normalized = unicodedata.normalize("NFKC", value)
    if any(unicodedata.category(char).startswith("C") for char in normalized):
        raise GameError("Usa un nombre sin caracteres de control.", 422)
    nickname = " ".join(normalized.split())
    if not all(char.isalnum() or char == " " for char in nickname):
        raise GameError("Usa solo letras, números y espacios.", 422)
    if not 2 <= len(nickname) <= 25:
        raise GameError("El nombre debe tener entre 2 y 25 caracteres.", 422)
    return nickname, nickname.casefold()


def new_room(course: dict, count: int, seconds: int) -> dict:
    if not 1 <= count <= min(LIMITS["maxQuestions"], len(course["questions"])):
        raise GameError("La cantidad de preguntas no está disponible para este curso.", 422)
    if not LIMITS["minSeconds"] <= seconds <= LIMITS["maxSeconds"]:
        raise GameError("El tiempo por pregunta debe estar entre 10 y 120 segundos.", 422)
    questions = copy.deepcopy(secrets.SystemRandom().sample(course["questions"], count))
    for question in questions:
        secrets.SystemRandom().shuffle(question["options"])
    return {
        "courseId": course["id"], "courseTitle": course["title"], "questions": questions,
        "secondsPerQuestion": seconds, "status": "lobby", "questionIndex": -1,
        "deadline": None, "players": [], "answers": {}, "answerPoints": {}, "version": 1,
    }


def join_room(room: dict, nickname: str) -> str:
    if room["status"] != "lobby":
        raise GameError("La partida ya comenzó. Puedes entrar en la siguiente sala.")
    if len(room["players"]) >= LIMITS["maxPlayers"]:
        raise GameError("La sala está completa.")
    display, normalized = nickname_value(nickname)
    if any(player["normalized"] == normalized for player in room["players"]):
        raise GameError("Ese nombre ya está en uso. Elige otro.")
    player_id = secrets.token_hex(12)
    room["players"].append({"id": player_id, "nickname": display, "normalized": normalized, "score": 0})
    room["version"] += 1
    return player_id


def reveal(room: dict) -> None:
    if room["status"] != "question":
        return
    correct = room["questions"][room["questionIndex"]]["correctOption"]
    for player in room["players"]:
        if room["answers"].get(player["id"]) == correct:
            # ponytail: Existing in-flight answers lack timing; award only the base points.
            player["score"] += room.get("answerPoints", {}).get(player["id"], 500)
    room["status"] = "reveal"
    room["version"] += 1


def advance_clock(room: dict, now: int) -> None:
    if room["status"] == "question" and now >= room["deadline"]:
        reveal(room)


def start_question(room: dict, now: int) -> None:
    room["questionIndex"] += 1
    room["answers"] = {}
    room["answerPoints"] = {}
    if room["questionIndex"] >= len(room["questions"]):
        room["questionIndex"] = len(room["questions"]) - 1
        room["status"] = "finished"
        room["deadline"] = None
    else:
        room["status"] = "question"
        room["deadline"] = now + room["secondsPerQuestion"] * 1000
    room["version"] += 1


def host_action(room: dict, action: str, now: int) -> None:
    advance_clock(room, now)
    if action == "start":
        if room["status"] != "lobby":
            raise GameError("La partida ya comenzó.")
        if not room["players"]:
            raise GameError("Espera a que se una al menos una persona.")
        start_question(room, now)
    elif action == "next":
        if room["status"] == "reveal":
            room["status"] = "ranking"
            room["deadline"] = None
            room["version"] += 1
        elif room["status"] == "ranking":
            start_question(room, now)
        else:
            raise GameError("Espera a que termine la pregunta actual.")
    elif action == "finish":
        if room["status"] == "finished":
            return
        # Closing a running question scores only answers already received.
        reveal(room)
        room["status"] = "finished"
        room["deadline"] = None
        room["version"] += 1
    else:
        raise GameError("Acción desconocida.", 404)


def answer_question(room: dict, player_id: str, question_id: str, option_id: str, now: int) -> None:
    advance_clock(room, now)
    if room["questionIndex"] < 0:
        raise GameError("La partida todavía no comenzó.")
    question = room["questions"][room["questionIndex"]]
    if question_id != question["id"]:
        raise GameError("Esta respuesta pertenece a otra pregunta.")
    previous = room["answers"].get(player_id)
    if previous is not None:
        if previous == option_id:
            return  # Retries cannot score twice, including after the reveal.
        raise GameError("Tu respuesta ya fue registrada y no puede cambiarse.")
    if room["status"] != "question" or now >= room["deadline"]:
        raise GameError("El tiempo de esta pregunta terminó.")
    if player_id not in {player["id"] for player in room["players"]}:
        raise GameError("No formas parte de esta sala.", 403)
    if option_id not in {option["id"] for option in question["options"]}:
        raise GameError("La alternativa no pertenece a esta pregunta.", 422)
    room["answers"][player_id] = option_id
    if option_id == question["correctOption"]:
        duration = room["secondsPerQuestion"] * 1000
        remaining = min(duration, room["deadline"] - now)
        room.setdefault("answerPoints", {})[player_id] = 500 + 500 * remaining // duration
    room["version"] += 1
    if len(room["answers"]) == len(room["players"]):
        reveal(room)


def snapshot(code: str, room: dict, role: str, player_id: str | None, now: int) -> dict:
    advance_clock(room, now)
    question = None
    shown = room["status"] == "reveal"
    if room["status"] in ("question", "reveal"):
        source = room["currentQuestion"] if "currentQuestion" in room else room["questions"][room["questionIndex"]]
        question = {"id": source["id"], "text": source["question"],
                    "options": [{"id": option["id"], "text": option["text"]} for option in source["options"]]}
        if shown:
            question["correctOption"] = source["correctOption"]
            question["explanation"] = next(option.get("explanation", "") for option in source["options"]
                                           if option["id"] == source["correctOption"])
    leaderboard = []
    if room["status"] in ("reveal", "ranking", "finished"):
        previous_score, rank = None, 0
        for index, player in enumerate(sorted(room["players"], key=lambda item: (-item["score"], item["normalized"]))):
            if player["score"] != previous_score:
                rank = index + 1
            previous_score = player["score"]
            leaderboard.append({"id": player["id"], "nickname": player["nickname"], "score": player["score"], "rank": rank})
    me = None
    if player_id:
        player = next(player for player in room["players"] if player["id"] == player_id)
        answer = room["answers"].get(player_id)
        correct = answer == question["correctOption"] if shown and answer is not None else None
        me = {"id": player_id, "nickname": player["nickname"], "answer": answer, "correct": correct, "score": player["score"]}
    return {"code": code, "role": role, "status": room["status"], "courseTitle": room["courseTitle"],
            "questionCount": room["questionCount"] if "questionCount" in room else len(room["questions"]),
            "secondsPerQuestion": room["secondsPerQuestion"],
            "questionIndex": room["questionIndex"], "serverNow": now, "deadline": room["deadline"],
            "playerCount": room.get("playerCount", len(room["players"])),
            "players": [{"id": player["id"], "nickname": player["nickname"]} for player in room["players"]]
                       if room["status"] == "lobby" else [],
            "answeredCount": room.get("answeredCount", len(room["answers"])), "question": question, "me": me,
            "leaderboard": leaderboard, "version": room["version"]}
