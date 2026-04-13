"""생기부·포트폴리오 텍스트에서 핵심 블록(세특·동아리·독서 등) 휴리스틱 추출."""

import re

from app.schemas_apass import RecordSections


def _slice_between(text: str, start_pat: str, end_pats: list[str]) -> str:
    m = re.search(start_pat, text, flags=re.IGNORECASE | re.MULTILINE)
    if not m:
        return ""
    start = m.end()
    end = len(text)
    for ep in end_pats:
        m2 = re.search(ep, text[start:], flags=re.IGNORECASE | re.MULTILINE)
        if m2:
            end = min(end, start + m2.start())
    chunk = text[start:end].strip()
    return chunk


def extract_sections_from_full_text(full_text: str) -> RecordSections:
    t = full_text or ""
    t_norm = re.sub(r"\s+", " ", t)

    # NEIS/생기부 흔한 구역명 (완전 일치는 아니어도 키워드로 구간 추정)
    seuteuk = _slice_between(
        t,
        r"(세부능력\s*및\s*특기사항|세부능력및특기사항|세특)",
        [
            r"(창의적\s*체험활동|동아리\s*활동|독서\s*활동|행동특성\s*및\s*종합의견|출결\s*상황)",
            r"\n\s*동아리",
            r"\n\s*독서",
        ],
    )
    if not seuteuk.strip():
        seuteuk = _slice_between(
            t,
            r"(교과\s*세부능력|교과세부능력)",
            [r"(창의적\s*체험활동|행동특성)", r"\n\s*동아리"],
        )

    club = _slice_between(
        t,
        r"(동아리\s*활동|창의적\s*체험활동\s*상황\s*\(?\s*동아리)",
        [r"(진로\s*활동|독서\s*활동|행동특성|세부능력)", r"\n\s*독서"],
    )

    reading = _slice_between(
        t,
        r"(독서\s*활동|독서활동)",
        [r"(행동특성|세부능력|봉사\s*활동|출결)", r"\n\s*행동특성"],
    )

    # 포트폴리오/영문 문서: 키워드 기반 느슨한 버킷
    if not seuteuk and re.search(r"(project|portfolio|research|publication)", t_norm, re.I):
        seuteuk = t[:12000]

    other_parts: list[str] = []
    for label, pat in [
        ("수상", r"(수상\s*경력|수상경력|Awards?)"),
        ("봉사", r"(봉사\s*활동|자원봉사|Volunteer)"),
        ("진로", r"(진로\s*활동|진로활동|Career)"),
    ]:
        seg = _slice_between(t, pat, [r"\n\s*(수상|봉사|진로|독서|동아리|세부능력)"])
        if seg:
            other_parts.append(f"[{label}]\n{seg[:4000]}")

    other = "\n\n".join(other_parts).strip()
    if not other:
        # 나머지를 other에 일부 담아 분석 시그널 유지
        tail = t[-8000:] if len(t) > 8000 else t
        if tail.strip() and tail.strip() != (seuteuk + club + reading):
            other = tail.strip()[:6000]

    return RecordSections(
        seuteuk=seuteuk[:20000] if seuteuk else "",
        club=club[:12000] if club else "",
        reading=reading[:8000] if reading else "",
        other=other[:12000] if other else "",
    )
