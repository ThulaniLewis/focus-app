# Claude Code brief 4: Dumps that understand what she means (27 Nov 2026)

Builds on brief 1b (place reminders). Nothing personal goes in code, so this carries over to the shareable build. Follows section 0 of `docs/FOCUS_BIG_BUILD.md` (Claude is the brain, Focus is the memory and the screens).

**Order:** Part 1, Part 3 and Part 4 first (mostly the dump prompt, the actions it can choose, and display changes). Then Part 2 and Part 5, which need place arrival and leaving from brief 1b. Stop and report after each part. Don't commit until Thulani has tested on her phone. Say whether each part can go out as `eas update --channel preview` or needs an EAS build.

## The problem, from a real dump (Fri 27 Nov, 22:06)

She was at her parents' house because of a puncture. She said, word for word (voice transcription):

> ok so I am currently staying at my parents house because a punctured attire my tyre is going to be fixed tomorrow morning at 10 o'clock in the morning I need some help because I need to my Dad is taking me home so that I can collect some bits I just need you to help me remember what I need to connect so I need the Amazon package so that is behind the really been outside I need savannah's clothes for tomorrow socks and anything she may need for being with her dad tomorrow she's with her dad tomorrow which is an impromptu additional day that he's doing I need my clothes my underwear my makeup definitely my makeup my contact lenses and if I can find a nose piercing as well

What Focus did:
- Split ten items across three spaces (Home, Sav, Just for me) instead of one list for one trip.
- Asked "Link this to Sav nursery?" three times, once per item. Sav is with her dad tomorrow, and it's a Saturday. The right place was **home**, and Focus never offered it, even though Today already showed she was at her parents'.
- Answered cards stayed on screen greyed out, pushing the list down.
- Put clothes, makeup and contact lenses in Just for me ("kept as notes, not to-dos, never shown on a tablet"). Ordinary packing items, now hidden from half her screens. Underwear probably triggered it and dragged the rest in.
- Tagged the Amazon package Hallway. It's outside behind the bin.
- Made "Tyre fixed (10am)" a ticked looking Home task. It's an appointment.
- Lost "Sav is with her dad on Saturday" as a diary fact. It only survived as a vague task.
- Gave each item a time estimate. For a quick grab the total (over an hour) is wrong and just noise.
- Then at 22:15, while she was still at her parents', sent the normal home evening nudge: "Still to do: Wind down: open Focus, check tomorrow. About 1 min." Her normal day wasn't happening, so the normal nudges made no sense.

**The root cause:** the parser sorts each sentence into fixed boxes (space, room, privacy, duration) one item at a time. It never asks what the whole dump is *for*, and the rest of the app never asks whether today is a normal day.

## Part 1: Work out what the dump is for, first

Change the dump step from "classify each item" to **two steps**:

1. **Read the whole dump with her current situation** and decide what she's asking for. Give the model:
   - where she is now (the place Today already shows), and her saved places with their types
   - date, day of week, time, and when her day ends
   - today's and tomorrow's diary, and any fixed rhythms (for example who Sav is with on which days)
   - the list of output shapes below

2. **Then shape the output** into one or more of these:

| Shape | When | What she gets |
|---|---|---|
| **Grab list** | "help me remember what to get, bring, collect, pack" for one trip or one place | One checklist, one title, tied to a place. No spaces, no room tags unless she said them, no time estimates. |
| **Diary event** | a fixed time thing (an appointment, someone has the child) | Goes to the diary. No tick box. Worded as the event ("Tyre repair 10:00"). |
| **Place reminder** | something to do or say when she's somewhere | As brief 1b. |
| **Away from home** | she says she's staying somewhere else, or her day has changed | Starts away mode (Part 5). |
| **Tasks** | ordinary things to do | As now, sorted into spaces. |
| **Shopping** | things to buy | As now. |
| **Note** | thoughts, feelings, context | As now, Just for me rules apply. |

One dump can make several shapes. This dump should make: **one grab list** (10 items), **two diary events** (tyre repair Sat 10:00, Sav with her dad Sat), **away mode** for tonight, and nothing else.

Shapes and their rules are data, not code, so more can be added. Build them as actions (tool calls) Claude chooses from, per section 0.

## Part 2: Grab lists tied to a place

- Focus names the list from what she said, for example "Grab from home".
- **One question for the whole list**, not one per item, with the place already filled in: *"Show you this list when you get home?"* **Yes / Change / No**
- Focus picks the place from the dump and from where she is now. It must never suggest a place the dump rules out (here, nursery: Sav isn't going, and it's a Saturday).
- On arriving at the place: a full screen card, **"You're home. Here's what you came for."** with the list. Big tick boxes. Items she said "if I can find it" about show as *"if you find it"* and don't block finishing.
- On leaving the place with items not ticked: one nudge, *"You left without: contact lenses, makeup. Did you get them?"* Done / Forgot / Didn't need.
- When every item is ticked, or she taps Done, the list closes and leaves no leftovers in Today.
- If she's already at the place when she makes the list, show it straight away.
- Until arrival triggers work, the grab list sits at the top of Today as one card.
- Phone only, same privacy as all location.

## Part 3: Privacy, only when she means it

- **Just for me only applies when she says so** ("just for me", "private", "don't show this") or when it's clearly a feeling or personal note, not a thing to fetch or do.
- A word like underwear inside a packing list does **not** make the list private, and never pulls other items in with it.
- If one item really should stay off the tablet, hide that item's name on the tablet (show "1 private item") rather than splitting the list.

## Part 4: Smaller fixes

- **Answered check-in cards fold away** into one line ("Linked to home. Undo") instead of staying greyed out.
- **Room tags:** only tag a room if she said it or the item clearly lives there. If not sure, no tag. "Outside", "behind the bin" or "in the car" are never Hallway.
- **Time estimates:** not on grab lists. On other tasks, only when the task is long enough to plan around.
- **Appointments** are never tick boxes in a space. Diary only, with the right place.
- **Fixed rhythms from a dump:** "Sav's with her dad tomorrow, an extra day" makes a one off diary event for Sav (and, if Sav has nursery that day, a check-in about telling nursery). It doesn't change the regular rhythm.
- **Notification wording:** "Still to do: Wind down: open Focus, check tomorrow" stacks two labels. Write it as one plain line, for example "Ready to wind down? Tomorrow starts with tyre repair at 10."

## Part 5: Away mode, when it isn't a normal day

**How it starts:**
- She says so in a dump or wind down ("I'm staying at my parents'", "I'm away tonight"), or
- She's at a place that isn't home at her usual evening time (from her profile, not code) and still there 30 minutes later. Focus asks once: *"Looks like you're staying at Mum and Dad's tonight. I'll pause the home stuff till you're back. OK?"* **Yes / No, I'll be home later**

**While away mode is on:**
- **Paused:** house jobs, room rounds, bins, evening routine nudges, the home wind down nudge, and anything tied to the home place. They roll over quietly, with no "missed" or "skipped" counted (they don't feed the three skips rule).
- **Still on:** diary events, place reminders and grab lists for wherever she's heading, alarms she set herself, and anything about Sav's handovers.
- **Wind down becomes one short card:** *"You're at Mum and Dad's tonight. Tomorrow: tyre repair 10:00, Sav with her dad. Anything to add?"* Mic, or **Done**. No room jobs and no wins list about the house.
- Today shows a small line at the top: "Away tonight. Home jobs paused." with **Undo**.

**How it ends:**
- On arriving home: away mode ends, the grab list (if there is one) shows first, then the normal day picks up from now. Anything paused shows as rolled over, not overdue.
- Or she ends it herself from the Today line.
- If she's away for more than one night, Focus asks each evening, once: *"Still away tonight?"*

Away mode, where she is and why are phone only, never on the tablet, never read aloud.

## Tests

Use the 27 Nov dump above word for word. It must give:
- one grab list of 10 items, titled for home, with one "show you this when you get home?" question
- diary: tyre repair Sat 10:00, Sav with her dad Sat
- away mode switched on for tonight (it was in the dump, so no extra question)
- no nursery question, no Just for me, no Hallway tag, no time estimates
- no home wind down nudge at 22:15, just the short away card
- arriving home opens the list; leaving with three items unticked gives one nudge naming them; the nose piercing never blocks Done; home jobs pick up again without anything marked missed

Also test:
- at a family place at the usual evening time with nothing said: one "staying tonight?" question after 30 minutes, and "No, I'll be home later" keeps everything normal
- "When I'm at Mum's remind me to take her dish back" makes a place reminder, not a grab list
- "Just for me, I'm feeling really flat today" stays a private note
- a normal mixed dump (shopping plus tasks) still works as before

## Report after each part
What the old parser did with the test dump, what the new one does, the prompt and data changes made, which notifications away mode pauses, and whether it can go over the air or needs an EAS build.
