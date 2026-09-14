# v0.7.0
# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
import json
import re

import genlayer as gl

OUTCOMES = ("allow", "deny", "escalate")
MAX_URLS = 8
MAX_PAGE = 6000
URL_RE = re.compile(r"https?://[^\s<>\"'\\]+", re.I)

PROMPT = """You are the court for one principal. Agents of that person or company share a wallet and a name, but not a goal.

Given constitution, proposed_action, a JSON list of objections (who, text, optional counter_action as advice only), evidence, and fetched pages for any http(s) links those agents cited. Answer only whether the original proposal may proceed.

Rules:
- allow: permit the proposer's current payload as written. The proposal follows the constitution better than rejecting it.
- deny: do not permit. Empty permit. Do not execute anyone's counter_action. Changing the trip is a revise, not a court result.
- escalate: the constitution is silent or its articles contradict. The principal decides yes or no on that same payload.
- objection_grounded: true if at least one objection had grounds in the constitution.
- Do not pick a winning objector. Do not write a remedy_action. Do not invent a fourth outcome. Desk fields are not the payload to permit. Do not read a chat prompt.
- court_agent.label names who is proposing. A constitution amount written for a named desk applies only when that desk is the proposer.
- court_agent.cap is this proposer's assigned override. Only then may it beat a lower general constitution amount, unless the constitution names this same desk and still binds it lower. If cap is absent, use general constitution limits for this proposer — do not copy another desk's number onto them.
- An objector's label matches clauses about that desk's role (for example finance may block over the house monthly limit). It does not move that desk's own spend cap onto this proposal. An objector's cap is their own limit if they proposed, not a veto threshold for others.

Return ONLY JSON:
{
  "outcome": "allow" | "deny" | "escalate",
  "reasoning": str,
  "objection_grounded": bool
}
"""


class Court(gl.contract.Contract):
    admin: gl.contract.Address
    # One canonical verdict JSON per case id. Plain strings keep storage simple.
    verdicts: gl.storage.TreeMap[str, str]

    def __init__(self, admin: str):
        self.admin = gl.contract.Address(admin)

    def _only_admin(self):
        if gl.message.sender_address != self.admin:
            raise gl.vm.UserError("You are not the admin")

    @gl.public.write
    def judge(
        self,
        case_id: str,
        constitution: str,
        proposed_action: str,
        objections: str,
        evidence: str,
    ):
        self._only_admin()

        def leader_fn():
            fetched = _fetch_cited_pages(proposed_action, objections, evidence)
            desks = _desk_note(proposed_action, objections)
            prompt = (
                PROMPT
                + f"""
constitution:
{constitution}

proposed_action:
{proposed_action}

objections:
{objections}

evidence:
{evidence}

fetched_pages:
{fetched}
{desks}
"""
            )
            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            if isinstance(raw, str):
                blob = _extract_json(raw)
                raw = json.loads(blob) if blob else {}
            return _canonicalize(raw)

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            leader_data = leader_result.calldata
            validator_data = leader_fn()
            return _decision_key(leader_data) == _decision_key(validator_data)

        result = gl.vm.run_nondet(leader_fn, validator_fn)
        self.verdicts[case_id] = json.dumps(
            {
                "found": True,
                "outcome": str(result["outcome"]),
                "reasoning": str(result["reasoning"]),
                "objection_grounded": bool(result["objection_grounded"]),
            },
            sort_keys=True,
        )

    @gl.public.view
    def get_verdict(self, case_id: str) -> str:
        self._only_admin()
        if case_id not in self.verdicts:
            return json.dumps({"found": False})
        return self.verdicts[case_id]


def _as_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ("true", "1", "yes")
    return bool(value)


def _canonicalize(raw) -> dict:
    if not isinstance(raw, dict):
        return {
            "outcome": "escalate",
            "reasoning": "The judge returned an unreadable answer.",
            "objection_grounded": False,
        }
    outcome = str(raw.get("outcome") or "").strip().lower()
    if outcome == "allow_a":
        outcome = "allow"
    elif outcome in ("allow_b", "remedy"):
        outcome = "escalate"
    if outcome not in OUTCOMES:
        outcome = "escalate"
    grounded = _as_bool(raw.get("objection_grounded"))
    reasoning = str(raw.get("reasoning") or "").strip() or "No reasoning given."
    return {
        "outcome": outcome,
        "reasoning": reasoning,
        "objection_grounded": grounded,
    }


def _decision_key(res) -> tuple:
    if not isinstance(res, dict):
        return ("escalate",)
    outcome = res.get("outcome")
    if outcome not in OUTCOMES:
        outcome = "escalate"
    return (outcome,)


def _extract_json(s: str) -> str:
    start = s.find("{")
    end = s.rfind("}")
    if start != -1 and end != -1 and start < end:
        return s[start : end + 1]
    return ""


def _clean_url(raw: str) -> str:
    url = raw.strip().rstrip("),.;:!?]>}")
    if not url.lower().startswith(("http://", "https://")):
        return ""
    if len(url) > 2000:
        return ""
    return url


def _urls_in(*blobs: str) -> list:
    found = []
    seen = set()
    for blob in blobs:
        for match in URL_RE.findall(blob or ""):
            url = _clean_url(match)
            if not url or url in seen:
                continue
            seen.add(url)
            found.append(url)
            if len(found) >= MAX_URLS:
                return found
        if len(found) >= MAX_URLS:
            return found
    try:
        items = json.loads(blobs[-1] if blobs else "[]")
    except Exception:
        items = []
    if isinstance(items, list):
        for item in items:
            if not isinstance(item, dict):
                continue
            if str(item.get("type") or "").lower() != "link":
                continue
            url = _clean_url(str(item.get("value") or ""))
            if not url or url in seen:
                continue
            seen.add(url)
            found.append(url)
            if len(found) >= MAX_URLS:
                break
    return found[:MAX_URLS]


def _response_text(response) -> str:
    if response is None:
        return ""
    if isinstance(response, str):
        return response
    body = getattr(response, "body", None)
    if body is None:
        return str(response)
    if isinstance(body, bytes):
        return body.decode("utf-8", errors="replace")
    if isinstance(body, str):
        return body
    return str(body)


def _fetch_url(url: str) -> str:
    try:
        text = _response_text(gl.nondet.web.get(url)).strip()
        if not text:
            rendered = gl.nondet.web.render(url, mode="text")
            text = rendered if isinstance(rendered, str) else str(rendered)
            text = text.strip()
        if len(text) > MAX_PAGE:
            return text[:MAX_PAGE] + "\n…"
        return text or "(empty)"
    except Exception as exc:
        return f"(could not fetch: {exc})"


def _desk_note(proposed_action: str, objections: str) -> str:
    notes = []
    try:
        proposed = json.loads(proposed_action)
    except Exception:
        proposed = None
    if isinstance(proposed, dict):
        agent = proposed.get("court_agent")
        if isinstance(agent, dict):
            cap = str(agent.get("cap") or "").strip()
            label = str(agent.get("label") or "").strip()
            who = label or str(agent.get("id") or "proposer").strip()
            if cap:
                notes.append(f"Proposer desk {who} assigned cap: {cap}. Override for this proposer only.")
            elif label:
                notes.append(
                    f"Proposer desk {label}, no packet cap. "
                    "Apply general constitution limits and clauses that name this desk. "
                    "Do not apply another desk's spend cap."
                )
    try:
        items = json.loads(objections)
    except Exception:
        items = None
    if isinstance(items, list):
        for item in items:
            if not isinstance(item, dict):
                continue
            who = str(item.get("label") or "").strip()
            if not who:
                continue
            notes.append(
                f"Objector desk {who}. Match role clauses (who may block). "
                "Do not treat this desk's own spend cap as a limit on the proposer."
            )
    if not notes:
        return ""
    return "desk_limits:\n" + "\n".join(f"- {line}" for line in notes)


def _fetch_cited_pages(proposed_action: str, objections: str, evidence: str) -> str:
    pages = []
    for url in _urls_in(proposed_action, objections, evidence):
        pages.append({"url": url, "content": _fetch_url(url)})
    if not pages:
        return "(none)"
    return json.dumps(pages, ensure_ascii=False)

