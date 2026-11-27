# Claude Code brief 1c: Outlook working, and the diary check (25 Nov 2026)

Paste this into Claude Code in the Focus folder **after brief 1b is tested and committed**, alongside brief 1d (`docs/brief-1d.md`: alarms, appointment prep, lateness, calendar views). Every rule in `docs/FOCUS_BIG_BUILD.md` applies. Like everything else, this must carry over to brief 2 (Focus Spaces): Outlook is a switch each person connects to their own account, and nothing personal goes in code.

**Why this matters:** Thulani's real diary lives in Outlook (Hotmail). Things like Sav's physiotherapy arrive there as invites. If Focus can't see them, it can't plan around them, work out leave by times, or remind her. Thulani calls this incredibly important. Outlook calendar first, then email.

Stop and report after each stage.

---

## Stage 1: Find out why Outlook isn't working, and fix it

**What happens now:** the Outlook connection isn't working.

**Find the cause first and report it in plain words.** Check both routes Focus uses:
- **Phone calendar route** (expo-calendar reading the calendars on the phone): is the Hotmail calendar actually syncing to the phone (Outlook app > profile > gear > Hotmail account > Sync calendars on)? Is calendar permission granted? Is Focus reading the right calendar? Does it see invites, not just events she made?
- **Microsoft route** (Microsoft Graph through the Supabase Edge Function): is the app registration in her own Default Directory (not South London and Maudsley, where her Hotmail is only a guest)? Personal Microsoft accounts allowed? Redirect URI matching exactly? Secret in Supabase and not expired? Permissions granted: User.Read, offline_access, Calendars.Read, Mail.Read? Does the token refresh, or does it work once then stop? Check the function logs.

**Then:**
- Prefer the Microsoft route for reading, because it sees invites, attendees, locations and email. Keep the phone calendar route as a fallback and for writing.
- A **Connections** item in Settings showing Outlook as connected or not, last synced time, and one Reconnect button. If it drops, a small card on Today says so with the same button.
- Tokens stay in Supabase, never on the phone.

**Test:** a new event she makes in Outlook shows in Focus within 15 minutes. An invite someone sends her (for example a physio appointment) shows too. Disconnecting shows the card. Reconnecting fixes it.

---

## Stage 2: The diary check

**What she wants:** Focus looks through her diary and asks what each new thing should become, instead of just copying it in.

**How it works:**
- When new items appear in Outlook (events or invites), Focus groups them into one **"Focus is asking"** card (from brief 1 Stage B): *"These are in your diary. What do you want me to do with them?"*
- For each item, quick choices:
  - **Plan around it:** a fixed time. Focus works out the leave by time with live traffic (brief 1b Fix 3), moves tasks round it, and starts the appointment prep flow from brief 1d Stage 2 ("What do you need?": things to bring, prep tasks timed early enough, run up checks before leave by, and the offer of real Clock alarms from brief 1d Stage 1).
  - **Remind me:** pick when (the day before, the morning of, an hour before, or on arriving somewhere).
  - **Something to remember or tell someone:** becomes a place reminder or a note (for example "tell nursery Sav's leaving early for physio").
  - **Just leave it in the diary.**
- Focus suggests the most likely choice for each item so she can usually just tap Yes to all. Nothing is added without her yes.
- **Smart extras, suggested not done:**
  - If the event has an address, offer to save it as a place with a type (for example physio as "Other", linked to Sav).
  - If it's for Sav, put it in Sav's space. Clashes with nursery times: suggest a place reminder to tell nursery.
  - If it's an invite she hasn't accepted yet, say so. She replies in Outlook herself. Focus never accepts, declines or replies.
  - Recurring appointments (weekly physio): ask once for the whole series, not every week.
- **Privacy:** what an appointment is for (health, money, anything personal) is phone only. On the tablet it shows only as "Sav: appointment 14:00", never the detail, and never read aloud.
- Remembers her choices per kind of event, so next time it suggests the same thing ("Last time you chose Plan around it for physio").

**Design first:** mockups of the diary check card, one item expanded, and the Connections screen, light and dark, in `docs/design/`. Show Thulani and wait for her yes before building.

**Test:**
- Three new diary items give one card, not three notifications.
- "Plan around it" on an appointment with an address gives a leave by time and moves a clashing task, with Undo.
- A weekly series is asked about once.
- The tablet shows the time only, never what the appointment is for.

---

## Stage 3: Email (both inboxes)

Build to Phase 7 of `focus-build-spec.md`, Outlook/Hotmail first, Gmail after. New mail goes through the same kind of check: dates go into the diary check from Stage 2, things to do and replies needed become suggestions, and everything lands in the right space. Nothing added without her yes. Focus never sends, replies to, deletes or moves email.

**Scope (updated by brief 1d Stage 5):**
- Personal Focus reads her **whole inbox** (Outlook/Hotmail and Gmail) and her **whole diary**.
- Focus spots appointment emails and letters (job centre, NHS, nursery, physio) and asks: *"This looks like an appointment on Fri 28 Nov at 10:00. Add it?"* Yes starts the appointment prep flow (brief 1d Stage 2).
- Keep only what's needed from each email. Never send, reply, delete or move email.
- How appointment emails are spotted is data (kinds of sender and wording), not code naming her senders, so it carries over to Focus Spaces.

---

## Report
What was broken in Stage 1 and how it was fixed, exactly what Thulani needs to click (Azure, Outlook app, permissions), whether an EAS build is needed, and a two day test: send herself a test invite, and check a real appointment such as Sav's physio comes through and gets a leave by time.
