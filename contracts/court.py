# v0.4.0
# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
import json

import genlayer as gl

OUTCOMES = ("allow_a", "allow_b", "remedy", "escalate")

PROMPT = """You are the court for one principal. Agents of that person or company share a wallet and a name, but not a goal.

Given constitution, proposed_action, objection (with its optional counter_action), and evidence. Which decision best executes the constitution: allow_a, allow_b, remedy, or escalate?

Rules:
- allow_a: execute the proposed action. The proposal follows the constitution better.
- allow_b: execute the objector's counter_action, or nothing when the objection is a pure block.
- remedy: neither side is right; return remedy_action as an executable action (kind plus payload fields of the same shape as the proposal). If no such action can be written, answer escalate instead.
- escalate: the constitution is silent or its articles contradict. Nothing executes until the principal decides.
- Also answer whether the objection had grounds in the constitution (objection_grounded).
- If this is an appeal, judge against the constitution snapshot (the constitution field). Use prior_verdict and appeal_note as extra evidence. Do not invent a fifth outcome.

Return ONLY JSON:
{
  "outcome": "allow_a" | "allow_b" | "remedy" | "escalate",
  "remedy_action": {"kind": "spend"|"book"|"message"|"cancel", "summary": str, "amount": number|null, "currency": str|null} | null,
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
        objection: str,
        evidence: str,
        prior_verdict: str,
        appeal_note: str,
    ):
        self._only_admin()

        def leader_fn():
            prompt = (
                PROMPT
                + f"""
constitution:
{constitution}

proposed_action:
{proposed_action}

objection:
{objection}

evidence:
{evidence}

prior_verdict:
{prior_verdict}

appeal_note:
{appeal_note}
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
                "remedy_action": result.get("remedy_action"),
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


def _norm_amount(value):
    if value is None or value == "":
        return None
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return None


def _canonicalize(raw) -> dict:
    if not isinstance(raw, dict):
        return {
            "outcome": "escalate",
            "remedy_action": None,
            "reasoning": "The judge returned an unreadable answer.",
            "objection_grounded": False,
        }
    outcome = str(raw.get("outcome") or "").strip().lower()
    if outcome not in OUTCOMES:
        outcome = "escalate"
    grounded = _as_bool(raw.get("objection_grounded"))
    reasoning = str(raw.get("reasoning") or "").strip() or "No reasoning given."
    remedy = raw.get("remedy_action")
    if not isinstance(remedy, dict):
        remedy = None
    else:
        kind = str(remedy.get("kind") or "").strip().lower()
        summary = str(remedy.get("summary") or "").strip()
        if kind not in ("spend", "book", "message", "cancel") or not summary:
            remedy = None
        else:
            cleaned = {"kind": kind, "summary": summary}
            amount = _norm_amount(remedy.get("amount"))
            if amount is not None:
                cleaned["amount"] = amount
            currency = remedy.get("currency")
            if isinstance(currency, str) and currency.strip():
                cleaned["currency"] = currency.strip()
            remedy = cleaned
    if outcome == "remedy" and remedy is None:
        outcome = "escalate"
        reasoning = "Remedy needs an executable action; escalating."
    if outcome != "remedy":
        remedy = None
    return {
        "outcome": outcome,
        "remedy_action": remedy,
        "reasoning": reasoning,
        "objection_grounded": grounded,
    }


def _decision_key(res) -> tuple:
    if not isinstance(res, dict):
        return ("escalate", False, None, None, None)
    remedy = res.get("remedy_action")
    kind = None
    amount = None
    currency = None
    if isinstance(remedy, dict):
        kind = remedy.get("kind")
        amount = _norm_amount(remedy.get("amount"))
        currency = remedy.get("currency")
    return (
        res.get("outcome"),
        bool(res.get("objection_grounded")),
        kind,
        amount,
        currency,
    )


def _extract_json(s: str) -> str:
    start = s.find("{")
    end = s.rfind("}")
    if start != -1 and end != -1 and start < end:
        return s[start : end + 1]
    return ""
