"""Offline checks for mistakes observed in the saved live acceptance report."""

from evaluate_answers import (citation_ids_are_hidden, certification_coverage,
                              followup_reference_coverage, reference_attribution, video_recommendation_coverage)


def test_visible_internal_alias_is_not_a_successful_answer():
    selected = [{"id": "S1"}, {"id": "S6"}]
    assert not citation_ids_are_hidden("El fragmento S6 describe una matriz.", selected)
    assert not citation_ids_are_hidden("Consulta el material [S1].", selected)
    assert citation_ids_are_hidden("Consulta la matriz publicada.", selected)
    assert citation_ids_are_hidden("El identificador AS6 pertenece al ejemplo.", selected)
    assert citation_ids_are_hidden("No hay información suficiente.", [])


def test_matrix_claim_must_cite_its_published_evidence_not_a_reassigned_glossary_alias():
    published = {
        "matrix": {"id": "data-governance/oracle-map"},
        "matrix-section": {"id": "data-governance/oracle-map#matriz-de-decisiones-y-evidencia"},
        "committee-exercise": {"id": "data-governance/case-study#tu-propuesta-para-el-comite"},
        "glossary": {"id": "oci-ai-foundations-2026/glossary"},
    }
    answer = "Esta matriz permite pasar de una necesidad del dominio DAMA a una acción con Oracle."
    assert not all(reference_attribution(answer, [{"id": "glossary"}], published).values())
    assert not all(reference_attribution(answer, [], published).values())
    for source in ("matrix", "matrix-section", "committee-exercise"):
        assert all(reference_attribution(answer, [{"id": source}], published).values())
    assert all(reference_attribution("El glosario explica conceptos de IA.", [{"id": "glossary"}], published).values())


def test_certification_list_excludes_governance_offering_from_the_actual_navigation():
    navigation = ("Foundation\nCursos iniciales.\nOCI Foundations Associate: Conceptos de nube.\n"
                  "OCI AI Foundations Associate: IA.\nOracle Agentic AI Foundations Associate: Agentes.\n\n"
                  "Governance\nGestión de datos.\nData Management Fundamentals: DAMA y Oracle Cloud.")
    answer = "OCI Foundations Associate, OCI AI Foundations Associate y Oracle Agentic AI Foundations Associate."
    assert all(certification_coverage(answer, navigation).values())
    incorrect = answer + "\nGovernance: Data Management Fundamentals."
    checks = certification_coverage(incorrect, navigation)
    assert checks["foundations"] and checks["ai_foundations"] and checks["agentic_foundations"]
    assert not checks["only_requested_category"]


def test_reference_followup_keeps_the_original_topic_and_allows_oci_sources():
    published = {"dama": {"courseId": "data-governance"}, "oci": {"courseId": "oci-foundations-2026"}}
    answer = "Consulta las guías de gestión de datos y fundamentos de nube."
    assert all(followup_reference_coverage(answer, [{"id": "dama"}, {"id": "oci"}], published).values())
    assert not followup_reference_coverage(answer, [{"id": "oci"}], published)["followup_keeps_dama_source"]
    assert not followup_reference_coverage(answer, [{"id": "removed"}], published)["followup_keeps_dama_source"]


def test_valid_citations_do_not_make_an_explicit_denial_of_links_correct():
    published = {"dama": {"courseId": "data-governance"}}
    sources = [{"id": "dama"}]
    for answer in ("No puedo dar un enlace aquí, pero revisa estos materiales.",
                   "Se menciona la guía, pero no aparece el enlace explícito.",
                   "Los fragmentos no proporcionan los enlaces específicos dentro del texto."):
        checks = followup_reference_coverage(answer, sources, published)
        assert checks["followup_keeps_dama_source"]
        assert not checks["does_not_deny_reference_links"]
    assert all(followup_reference_coverage(
        "Aquí tienes las guías pertinentes. No puedo confirmar el pronóstico del tiempo.", sources, published).values())


def test_video_discovery_requires_a_relevant_video_link_not_a_guide_with_a_similar_title():
    site = "https://jgangini.github.io/certitips/"
    published = {"guide": {"url": site + "agents/"}, "video": {"url": site + "certitube/demo/#t-223"},
                 "other": {"url": site + "certitube/unrelated/"}}
    for source in ([], [{"id": "guide"}], [{"id": "other"}], [{"id": "removed"}]):
        assert not video_recommendation_coverage("Te recomiendo este video.", source, published, ["demo"])["relevant_video_link"]
    assert all(video_recommendation_coverage(
        "Esta demostración incluye un Agent Flow.", [{"id": "video"}], published, ["demo"]).values())
    for answer in ("En CertiTube puedes buscar un video de agentes con estos títulos.",
                   "Para encontrarlo, usa el buscador de CertiTube y selecciona el resultado en el carrusel."):
        assert not video_recommendation_coverage(
            answer, [{"id": "video"}], published, ["demo"])["does_not_delegate_search"]
