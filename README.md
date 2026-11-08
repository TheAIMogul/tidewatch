# Tidewatch

**Donor intelligence for nonprofits that live on exports.**

Drop in every donor list you have. Tidewatch resolves every human to one record, ranks everyone, and tells you who to call before the money stops.

Built for the [Give Miami Day](https://www.givemiamiday.org) community hackathon by The Miami Foundation, challenge 2: *duplicate donor records, and donors who quietly stop giving.*

> **Status: design phase.** The stage prototype and mockups are in [`mockups/`](mockups). The Worker, the database and the AI pipeline are not built yet. Nothing in this repo claims otherwise.

## The problem

Give Miami Day sends thousands of donations to small nonprofits as CSV exports. Fiscally sponsored projects have nothing but that CSV. Gifts also arrive through event tickets, gala auctions and paper checks, and each keeps its own list.

So one donor ends up in the database as "Rosa Delgado", "Rosa M. Delgado" and "R. Delgado", gets the year-end letter three times, and the totals are wrong. Worse, nothing says when someone stops giving. A donor who gave every December skipped last year and nobody called. A monthly donor's card expires and the gifts just stop.

## What it does

1. **Drop your lists.** GiveMiamiDay.org export, ticketing, gala, typed-in checks.
2. **Find the people.** Duplicates are found and shown side by side. A person approves each merge. Nothing is deleted, and every merge can be undone.
3. **See who's slipping.** Donors whose expected gift is late, ranked by dollars at risk.
4. **Make the call.** A note drafted only from that donor's real record, with the facts it used shown next to it.

## How the AI is used

Every judgment call goes through the [OpenAI Decisions API](https://developers.openai.com/api/docs/guides/decisions), which returns a probability for a typed question instead of free text:

| Question | Type | Used for |
| --- | --- | --- |
| Are these records the same person? | predicate | merge candidates, up to 400 per request |
| How likely is this donor to lapse? | score | the call list |
| Does this note say anything not in the record? | predicate | a check before any note is shown |

Drafted notes use a chat model and are limited to the facts passed in. The UI shows each question and its probability, so the model's work is visible rather than implied.

## Stack

All on Cloudflare.

- **Workers** for the API and static assets
- **D1** for donors, source rows and the merge log
- **R2** for uploaded exports
- **Workflows** for the import pipeline as durable steps
- **Durable Objects** for live board state over WebSocket
- **Agents SDK** for the follow-up agent
- **Workers AI** embeddings with **Vectorize** for candidate matching before the Decisions call
- **OpenAI Decisions** for judgments and drafted notes

## Design

Frosted glass over a slow gradient, faces with merge-count badges, one idea per screen, plain-English labels and type readable from the back of a room.

`mockups/v3/index.html` is the stage prototype. Open it in a browser and advance with the arrow keys, space bar or a presentation clicker.

## Run the prototype

```bash
open mockups/v3/index.html
```

## Data

All names, gifts and organizations in the mockups are made up. Tidepath Family Alliance is a fictional nonprofit from the hackathon brief.

## License

[MIT](LICENSE)
