import copy

import pytest

from app import game
from app.security import client_network, token_digest, new_token


def course():
    return {"id": "practice", "title": "Práctica", "questions": [
        {"id": f"q{number}", "question": f"Pregunta {number}", "correctOption": "b", "options": [
            {"id": "a", "text": "Incorrecta", "explanation": "Explicación incorrecta"},
            {"id": "b", "text": "Correcta", "explanation": "Explicación correcta"}]} for number in range(3)]}


def playing(count=2):
    room = game.new_room(course(), count, 10)
    players = [game.join_room(room, name) for name in ("Ana", "Luis")]
    game.host_action(room, "start", 1000)
    return room, players


def test_answers_stay_hidden_and_correctness_scores_only_on_reveal():
    room, players = playing()
    question_id = room["questions"][0]["id"]
    game.answer_question(room, players[0], question_id, "b", 1500)
    state = game.snapshot("123456", room, "player", players[0], 1500)
    assert state["status"] == "question" and state["me"]["answer"] == "b"
    assert state["me"]["correct"] is None and state["me"]["score"] == 0
    assert state["playerCount"] == 2 and state["players"] == [] and state["leaderboard"] == []
    assert "correctOption" not in state["question"] and "explanation" not in state["question"]
    assert all(set(option) == {"id", "text"} for option in state["question"]["options"])
    assert all(player["score"] == 0 for player in state["leaderboard"])
    game.answer_question(room, players[1], question_id, "a", 2000)
    state = game.snapshot("123456", room, "player", players[0], 2000)
    assert state["status"] == "reveal" and state["me"]["correct"] is True
    assert state["playerCount"] == 2 and state["players"] == [] and len(state["leaderboard"]) == 2
    assert state["question"]["correctOption"] == "b"
    assert state["leaderboard"][0]["id"] == players[0] and state["leaderboard"][0]["score"] == 975


def test_exact_deadline_rejects_answer_and_reveal_is_scored_once():
    room, players = playing()
    question_id = room["questions"][0]["id"]
    game.answer_question(room, players[0], question_id, "b", room["deadline"] - 1)
    with pytest.raises(game.GameError, match="terminó"):
        game.answer_question(room, players[1], question_id, "b", room["deadline"])
    game.advance_clock(room, 1_000_000)
    assert room["status"] == "reveal"
    assert [player["score"] for player in room["players"]] == [500, 0]


def test_duplicate_answers_are_idempotent_but_changed_or_stale_answers_fail():
    room, players = playing()
    question_id = room["questions"][0]["id"]
    game.answer_question(room, players[0], question_id, "b", 1500)
    version = room["version"]
    game.answer_question(room, players[0], question_id, "b", 1600)
    assert room["version"] == version and room["answerPoints"][players[0]] == 975
    with pytest.raises(game.GameError, match="cambiarse"):
        game.answer_question(room, players[0], question_id, "a", 1700)
    game.answer_question(room, players[1], question_id, "b", 1800)
    game.answer_question(room, players[0], question_id, "b", 1850)
    assert [player["score"] for player in room["players"]] == [975, 960]
    game.host_action(room, "next", 1900)
    game.host_action(room, "next", 1950)
    with pytest.raises(game.GameError, match="otra pregunta"):
        game.answer_question(room, players[0], question_id, "b", 2000)


def test_nicknames_are_normalized_and_controls_are_rejected():
    room = game.new_room(course(), 1, 10)
    game.join_room(room, "  Alice  ")
    with pytest.raises(game.GameError, match="ya está en uso"):
        game.join_room(room, "ＡＬＩＣＥ")
    with pytest.raises(game.GameError, match="control"):
        game.join_room(room, "Alice\u202eevil")


def test_nicknames_allow_letters_numbers_and_spaces_only_with_a_30_character_limit():
    assert game.nickname_value("  Ana 7 María  ")[0] == "Ana 7 María"
    assert game.nickname_value("A" * 30)[0] == "A" * 30
    with pytest.raises(game.GameError, match="solo letras"):
        game.nickname_value("Ana!")
    with pytest.raises(game.GameError, match="2 y 30"):
        game.nickname_value("A" * 31)


def test_room_cannot_start_empty_or_advance_during_question_or_join_late():
    room = game.new_room(course(), 1, 10)
    with pytest.raises(game.GameError, match="al menos"):
        game.host_action(room, "start", 1000)
    game.join_room(room, "Ana")
    lobby = game.snapshot("123456", room, "host", None, 999)
    assert lobby["playerCount"] == len(lobby["players"]) == 1 and lobby["leaderboard"] == []
    game.host_action(room, "start", 1000)
    with pytest.raises(game.GameError, match="actual"):
        game.host_action(room, "next", 1100)
    with pytest.raises(game.GameError, match="comenzó"):
        game.join_room(room, "Luis")


def test_ties_share_rank_and_finished_snapshot_has_no_unasked_questions():
    room, players = playing()
    third = copy.deepcopy(room["players"][0])
    third.update(id="third", nickname="Zoe", normalized="zoe")
    room["players"].append(third)
    question_id = room["questions"][0]["id"]
    for player in players:
        game.answer_question(room, player, question_id, "b", 2000)
    game.host_action(room, "finish", 3000)
    state = game.snapshot("123456", room, "host", None, 3000)
    assert state["question"] is None and state["status"] == "finished"
    assert [(player["score"], player["rank"]) for player in state["leaderboard"]] == [(950, 1), (950, 1), (0, 3)]


def test_last_question_finishes_with_correct_total():
    room, players = playing(count=1)
    question_id = room["questions"][0]["id"]
    for player in players:
        game.answer_question(room, player, question_id, "b", 2000)
    game.host_action(room, "next", 3000)
    assert room["status"] == "ranking" and room["deadline"] is None
    game.host_action(room, "next", 4000)
    state = game.snapshot("123456", room, "player", players[0], 3000)
    assert state["status"] == "finished" and state["me"]["score"] == 950
    assert state["deadline"] is None and state["questionIndex"] == 0


def test_ranking_waits_for_host_and_next_question_gets_its_full_time():
    room, players = playing()
    question_id = room["questions"][0]["id"]
    for player in players:
        game.answer_question(room, player, question_id, "b", 2000)
    version = room["version"]
    game.host_action(room, "next", 3000)
    assert room["version"] == version + 1 and room["questionIndex"] == 0
    for role, player_id in (("host", None), ("player", players[0])):
        state = game.snapshot("123456", room, role, player_id, 100_000)
        assert state["status"] == "ranking" and state["question"] is None and state["deadline"] is None
        assert [entry["score"] for entry in state["leaderboard"]] == [950, 950]
    game.host_action(room, "next", 101_000)
    assert room["status"] == "question" and room["questionIndex"] == 1
    assert room["deadline"] == 111_000 and room["answers"] == {} and room["answerPoints"] == {}
    assert [player["score"] for player in room["players"]] == [950, 950]


@pytest.mark.parametrize("seconds,elapsed,points", [
    (10, 0, 1000), (10, 5000, 750), (10, 9999, 500),
    (120, 60000, 750), (120, 119999, 500), (10, -1, 1000),
])
def test_speed_bonus_is_integer_and_only_correct_answers_score(seconds, elapsed, points):
    room, players = playing()
    room["secondsPerQuestion"] = seconds
    room["deadline"] = 1000 + seconds * 1000
    question_id = room["questions"][0]["id"]
    game.answer_question(room, players[1], question_id, "a", 1000)
    game.answer_question(room, players[0], question_id, "b", 1000 + elapsed)
    assert [player["score"] for player in room["players"]] == [points, 0]
    assert type(room["players"][0]["score"]) is int


def test_speed_ranks_and_points_accumulate_across_questions():
    room, players = playing()
    first = room["questions"][0]["id"]
    game.answer_question(room, players[1], first, "b", 2000)
    game.answer_question(room, players[0], first, "b", 6000)
    state = game.snapshot("123456", room, "host", None, 6000)
    assert [(player["id"], player["score"], player["rank"]) for player in state["leaderboard"]] == [
        (players[1], 950, 1), (players[0], 750, 2)]
    game.host_action(room, "next", 7000)
    game.host_action(room, "next", 8000)
    second = room["questions"][1]["id"]
    game.answer_question(room, players[0], second, "b", 8000)
    game.answer_question(room, players[1], second, "b", 13000)
    state = game.snapshot("123456", room, "host", None, 13000)
    assert [(player["id"], player["score"], player["rank"]) for player in state["leaderboard"]] == [
        (players[0], 1750, 1), (players[1], 1700, 2)]


def test_in_flight_legacy_answers_receive_base_points_without_rewriting_old_totals():
    room, players = playing()
    room.pop("answerPoints")
    room["players"][0]["score"] = 2
    room["answers"][players[0]] = "b"
    game.host_action(room, "finish", 2000)
    game.host_action(room, "finish", 3000)
    assert [player["score"] for player in room["players"]] == [502, 0]


def test_session_tokens_and_network_normalization():
    token = new_token()
    assert token_digest(token) != token and len(token_digest(token)) == 64
    assert token_digest("malformed") is None
    assert client_network("::ffff:192.0.2.10") == client_network("192.0.2.10")
    assert client_network("2001:db8:1234:5678::1") == client_network("2001:db8:1234:5678:ffff:ffff:ffff:ffff")
    assert client_network("2001:db8:1234:5678::1") != client_network("2001:db8:1234:5679::1")
