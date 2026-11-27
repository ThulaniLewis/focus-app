# Claude Code brief 1d: alarms, appointment prep, lateness and calendar views (25 Nov 2026)

**When:** don't start until brief 1b is tested and committed. Run it alongside brief 1c (Outlook). This brief updates brief 1c (Stage 2 "Plan around it", Stage 3 email) and brief 2 (onboarding and inbox scope); those changes are already written into them.

**Rules:** every rule in `docs/FOCUS_BIG_BUILD.md` applies. Everything must carry over to Focus Spaces: rules and suggestions are data, nothing personal in code. Nothing new is added or changed without Thulani's yes. Stop and report after each stage.

---

## Stage 1: Alarms that actually go off (do first)

Focus alarms don't work. The "get ready to leave" notification did work and was really useful.

- Find out why alarms fail and tell Thulani in plain words: exact alarm permission, battery saver, Samsung battery Unrestricted, notification channel, full screen intent, app closed. Fix it.
- **Real phone alarms too:** when something important goes in, ask "Do you want me to set an alarm on your phone for this?" On yes, set a real Clock app alarm with Android's set alarm intent, labelled clearly, for example "Job centre: start getting ready".
- Two per important event: **get ready** and **leave now**.
- If the event moves or is cancelled, tell her to change or remove the Clock alarm.
- Get ready can't just be snoozed away. It tells her to start getting ready now, not just that there's an appointment.

**Test:** phone locked, Focus closed, battery saver on: both alarms ring.

---

## Stage 2: Appointment prep, "What do you need?"

When an important event goes in (job centre, GP, a procedure, a child's physio), typed, said or from Outlook:

- Ask short follow ups: what do you need to bring, anything to prepare, anything to sort the day before?
- Suggest things by appointment type (as data). She ticks yes or no. Medical procedure: baggy comfy clothes, washed and ready. Child health appointment: the child's red book, pack a bag.
- Each yes becomes a task, timed early enough. "Pack Sav's physio bag" lands the day before.
- Run up checks about 30 min before leave by, one item at a time ("Is the bag by the door? Red book in it?"). Firm enough that she does it, not nagging. Stops when all are ticked.
- Important events: Focus suggests from what the event is and asks her to confirm. She can mark any event important.
- In brief 1c, "Plan around it" starts this prep flow.

**Test:** "Sav physio Friday 10:00" gives prep questions, the red book is suggested, the bag task lands on Thursday, and run up checks happen on Friday.

---

## Stage 3: Learning from lateness

Use the Places log.

- For any fixed time (nursery drop off and pick up, work, appointments), compare arrival with the fixed time and spot patterns, for example about 30 min late four days running.
- Work out where the time goes: left late, or journey longer than planned.
- Ask once, no guilt: "You've reached nursery about 30 minutes late four days this week. What's been slowing the mornings down?" Options: child didn't want to go, I was running late, traffic, too much before leaving, something else.
- Ask before changing: "Do you mind if I start your get ready 30 minutes earlier?" Yes, Try 15, No.
- Learn her real getting out time (for example 45 min from get ready to out the door) and use it instead of a fixed buffer.
- Run mornings backwards with checkpoints ("Sav dressed by 07:50, shoes and coat by 08:00, out by 08:05").
- Night before prep in wind down: bag by the door, clothes out, keys and phone charging.
- Carry learning to similar tasks: other outings with Sav get the extra time too, after asking.
- Weekly trend in wind down ("Nursery: 4 late, average 30 min"), and say when it improves. Never tells anyone. Phone only.

**Test:** four simulated late arrivals give one check in and a suggested earlier get ready, and nothing changes until she says yes.

---

## Stage 4: Calendar views

She added something for 12 Dec and can't see it because only this week shows.

- Week view with arrows back and forward.
- Month view with a dot on days that have something.
- Tap a day to see everything on it.
- A "This week" button, always in the same place when she's moved away, hidden when she's on this week.
- When something's added for a later date: "Added for Fri 12 Dec. Want to see it?"

---

## Stage 5: Email and diary scope (updates brief 1c Stage 3 and brief 2)

- **Personal Focus:** reads her whole inbox (Outlook/Hotmail and Gmail) and whole diary.
- **Focus Spaces:** onboarding asks whole inbox or selected senders only, changeable in Settings.
- **Both:** spot appointment emails and letters (job centre, NHS, nursery, physio) and ask "This looks like an appointment on Fri 28 Nov at 10:00. Add it?" Yes starts appointment prep. Keep only what's needed. Never send, reply, delete or move email.

---

## Design first

Mockups in `docs/design/` for the alarm offer, prep questions and ticks, run up check, lateness check in, and week and month views, light and dark. Show Thulani and wait for her yes before building.

## Report

Why alarms failed, whether an EAS build is needed, and a test plan using Sav's physio on Friday and a nursery morning.
