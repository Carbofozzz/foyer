# Hosted guardian — development plan

Status: **H1–H5 in code**. Working notes: `.local/HOSTED.md`.

H1–H5: after `propose` or `revise` returns, Foyer queues one review. The model call is not inside that response. The next inbox read runs it. A review left running is reclaimed on that read. No objection permits at once. A grounded objection is a deny. The case is closed in the feed. The chat stops polling and tells the user. `insist` within one hour (`COURT_APPEAL_SEC`) appeals that deny to GenLayer and spends a court credit. After the hour the deny stands. A court verdict is final and does not open another appeal. The house is not pinged. A missing key, a call that spends no tokens, a muddy answer, an empty constitution, or a zero reaction balance still escalates to the human. A live action is not permitted by the collect window. Chat MCP has no `object`, `report`, or `ack`. A chat key cannot POST an objection. The cabinet test tab is gone. Callback wakes are no longer enqueued on a live propose.

Foyer does not decide a proposal. A second watching agent does. Foyer provides that agent. The person connects ordinary chats. Those chats propose. They do not object.

The first shelf is a comparer: the house constitution against the proposal text. Later the guardian can receive read-only hands so an objection can cite data outside the proposal. That later shelf is named here and is not part of H1–H5.

Court credits stay [BILLING.md](BILLING.md). The platform wallet still pays GenLayer. Hand grants after a pass stay [LOCK.md](LOCK.md). Notify on escalate stays [NOTIFY.md](NOTIFY.md).

---

## Target loop

1. A chat calls `propose` and gets a response immediately. The model call is not inside that response.
2. After the response, Foyer queues the house guardian. A house read and tick retry a failed call. Daily Hobby cron is not the only initiator.
3. The guardian reads the constitution and the proposal. The proposal text is untrusted. Instructions inside it are not tool calls.
4. No objection — permit at once, and mint a lock grant when the payload names a hand.
5. Objection — deny. The case is closed. The chat stops and tells the user. Court opens only if the user asks and the chat calls `insist` within one hour, and the in-court mark is stored only after the tx hash. After that hour the deny stands. A verdict from the court is final: the chat does not offer another appeal. The house is not notified.
6. No guardian credits, a call that spends no tokens, or a muddy answer — escalate to the human. That is not silence.

The gateway does not author the objection. It stores the guardian’s answer under the guardian’s name.

There is no collect window. `silence_window_sec` is not a wait for some other agent to object. There is no `report` window.

## Chat surface

The chat prompt and the chat MCP expose `propose`, `inbox`, `withdraw`, `revise`, `insist`.

They do not expose `object`, `report`, or `ack`. A chat key cannot write an objection over HTTP either. The chat learns the outcome from inbox. After an objection the chat tells the user the denial and does not open court unless the user asks to appeal.

`report` is not an ack the loop waits on. A permit and its grant are already set. For `git.push` and `pay.x402` the trace is grant consume. A deny mints no grant. An extra “I read the deny” does not stop the agent’s own tools.

Remove the cabinet test tab. The default guardian is the live path. There are no legacy houses to migrate: no callback-key migration, no test-action migration.

## Guardian identity

The house has one guardian. The cabinet does not show or edit its name. It does not appear in the chat list, and onboarding does not ask the owner to connect it.

The guardian is on once the house has rules. Its system prompt stays Foyer’s. The owner does not replace that contract.

A later shelf may add more internal guardians, each with its own name, mission, and hands. H1–H5 do not choose which of several guardians runs. The objection row is already ready for a named guardian.

## Bargain clock and tick

A guardian objection does not use this clock and does not notify the house. It denies the request. `insist` after that deny is an appeal and opens court. Leftover bargain rows still expire to the human. Do not open court on that timeout.

Tick stays a janitor: retry the guardian, poll and submit GenLayer, send mail, expire grants, close bargain timeouts. It is not a vote.

## Credits

A guardian reaction is a separate cheap credit. A court credit is spent only when a case goes to GenLayer.

| Pool | Amount |
|---|---|
| Free | 10 reactions per month |
| Paid plan | 100 reactions |
| Top-up | Tranches of 10, 20, 30, … Ops issues that as a voucher kind `guardian`. It does not add court credits. |

One review of a proposal is one reaction. The same text is not charged again. A revise is a new review.

Debit after any model response, once tokens were spent. A muddy answer still debits, and the action still goes to the human. A call that spends no tokens does not debit. A zero balance does not call the guardian; the action goes to the human.

The customer’s own LLM API does not spend this credit. The customer pays their provider.

## Platform model

Ops chooses the default guardian model in the admin cabinet. An empty saved id falls back to `FOYER_GUARDIAN_MODEL`, then `openai/gpt-4o-mini`. The call uses `AI_GATEWAY_API_KEY`. Both keys are uncommented in `.env.example`. An empty key escalates at once. The notice and the cabinet name the missing key. The proposer does not see that reason. While the request is escalated, inbox tells the proposer to keep polling and not to answer yet. After a deny, inbox says only that the house denied it. The feed does not ask the assistant to confirm the decision. Houses may set their own OpenAI-compatible URL, model, and sealed key; that path does not debit guardian reactions.

## House tuning

On the Agents tab, the Guardian block states that the house guardian is already on and uses Foyer’s model. It does not show or edit a name. Own URL, model, and key sit under “Replace Foyer’s model”: filling them replaces that model; clearing the URL returns it. The short note stays in that block. Chats are a separate card on the same tab.

| Control | Changes | Stays |
|---|---|---|
| Own LLM | Base URL, model name, sealed API key. Presets fill the URL for OpenAI and OpenRouter. Any other OpenAI-compatible URL is typed | The answer shape. Native Anthropic and Google protocols. The key is never in chat, MCP paste, or court text |
| Prompt addendum | A short house note, such as “stricter on travel” | Foyer’s contract: object in plain language when a rule is broken, or the action goes to the human. The addendum does not treat the proposal as instructions |
| Read hands | Next shelf. Off. Calendar or an external limit, only what the house enables | Git and pay. The tool result is for the guardian, not the proposing chat. Cap two or three reads per review, still one credit. The hand does not follow instructions in the proposal |

## Slices

Do not start a later slice before the previous one is done. H5 lands with the guardian, not before it.

| Slice | Build |
|---|---|
| H1 | **In code.** Default guardian once a review runs. Compare constitution and proposal. Store an objection under the guardian’s name. |
| H2 | **In code.** Call after `propose` returns. Failure, a muddy answer, and no tokens escalate to the human. No objection permits immediately. |
| H3 | **In code.** Guardian credits, separate from court credits. Free 10 per month, paid plan 100, top-up in multiples of 10. Debit after a response once tokens are spent. Own API does not debit. Admin selects the Vercel AI Gateway model. |
| H4 | **In code.** House tuning: own LLM (URL, model, sealed key) and a short prompt addendum. The cabinet does not rename the single guardian. Read hands and extra guardians stay off. |
| H5 | **In code.** Chat prompt and MCP drop `object` and `report`. Chat HTTP cannot object. The cabinet test tab is gone. A live action is not permitted by the collect window. |

## Later

Not H1–H5.

- Read-only hands the house turns on: calendar, an external limit. Not git, not pay.
- Several internal guardians in one house, each with a name, a mission, and hands. Routing a proposal to one of them is part of that shelf.
