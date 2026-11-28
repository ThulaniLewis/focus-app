# Brief 1b report: location fixes (28 Nov 2026)

All three fixes are built. Fixes 1 and 2 are tested on the phone. Fix 3 (live traffic) and brief 4 Parts 2 and 5 are out over the air on `preview` and still need testing on the phone. Everything is on the branch `wip-1b-brief4`. Nothing is merged to main.

## What caused Fix 1

Typing an address found nothing because **Photon, the old free search, wouldn't answer Supabase's servers**. Supabase's request log showed the phone's searches did get past the sign-in check. The app also hid the error in small red text. The fix moved search to Google Places (New), which goes through `focus-places`, and made failed searches show a clear message.

## Google Cloud setup (Routes API needs one step from you)

The key Focus already uses for Places, `GOOGLE_MAPS_API_KEY` in Supabase secrets, does the routes too, so there's nothing new to paste in. In the Google Cloud console, in the same project:

1. **APIs & Services › Library:** search for **Routes API** and click **Enable**. Until you do, live traffic checks fail quietly and Focus uses your usual travel times. The Places screen says "Live traffic couldn't be reached…".
2. **APIs & Services › Credentials:** open the key, go to **API restrictions › Restrict key**, and tick **Places API (New)** and **Routes API** only. Leave **Application restrictions** set to None. The key is only ever used from Supabase's servers, never from the phone, so an app or website restriction would block it.
3. **APIs & Services › Routes API › Quotas:** set requests per day to **100**. A normal day uses about 8. Keep the Places API daily cap you already set.
4. **Billing › Budgets & alerts:** keep a monthly budget of **£5** with alerts at 50%, 90% and 100%. If you never set one, set it now.
5. Supabase: nothing new. The key and `ALLOWED_EMAILS` are already secrets. `focus-places` was redeployed with the new `route` action. It still checks inside its own code that the caller is a signed-in user on the allowed list. A test call without a sign-in was refused (401).

## Expected monthly calls and cost

| What | When | Calls a month |
|---|---|---|
| Live traffic (Routes, Compute Routes, traffic-aware) | 60, 30 and 15 minutes before each trip's leave-by, plus once on leaving somewhere: at most 4 a trip. About 2 trips a weekday | about 180 |
| Address search (Places autocomplete + one place details per pick) | Only when you add or change a place | a few sessions |
| "Any supermarket" look-up | Off by default; at most 6 a day when on | 0 now |

Traffic-aware routes are, I believe, billed as **Compute Routes Pro**: 5,000 free calls a month, then $10 per 1,000. Google's pricing page lists that SKU but doesn't say which one traffic-aware requests use, so check it on your first bill. At about 180 calls a month you stay well inside the free allowance either way, so **expected cost is £0**. Focus only sends Google the two points, rounded to about 10 m, and nothing about you. Walking, bike and bus trips use a plain route, because traffic doesn't apply.

## EAS build needed?

**No.** Fix 3 and brief 4 Parts 2 and 5 are all app code, plus the `focus-places` function, which is deployed. They're in OTA update group `3b575bbe`, on top of build `1b581216` (runtime 0.8.0). One change takes effect without a build: background positions now come every 5 minutes even when you're sat still, so the live check before you leave can run. Focus restarts its own location tracking once to pick this up.

## Test plan

**One nursery run (a weekday):**
1. In Settings › Places, check your nursery place has its drop off trip linked ("Drop off 08:00 … Focus works out when to leave"). Check **How you get around** is set to Car.
2. Enable the Routes API (step 1 above) the night before.
3. Leave Focus closed. About an hour before your leave-by time, nothing should come if traffic is normal.
4. If traffic is heavy you get one message, for example "I've moved leaving for … to 07:27. Traffic is heavier than usual, so it's 28 minutes today instead of 15." Any job before it says where it moved to. Today shows a **Live traffic** card with **Undo**.
5. Tap Undo once to check it puts the usual time back. You get no more messages about that trip.
6. Leave home: one more check, and no message unless it changed by more than 5 minutes.
7. Arrive at nursery: the arrival card asks about linked tasks and reminders, as now.
8. Afterwards: Places › How you get around should say "Live traffic: last checked …".

**One office day:**
1. Arrive at the office: the work routine card shows today's meetings, your work list and the leave-by time for the next fixed thing, such as pick up.
2. In the afternoon, the pick up leave-by gets the same live checks, starting from the office (where you are) instead of home.
3. Leave the office: one check, and a message only if the leave-by moved.

## Also in this update (brief 4)

- **Part 2, grab lists:**
  - The dump review asks one question for the whole list, "Show you this list when you get home?", with Yes, Change or No.
  - When you arrive there, it opens full screen: "You're home. Here's what you came for."
  - If you leave with things not ticked, you get one nudge: "You left without: … Did you get them?" The answers are Done, Forgot or Didn't need.
  - "If you find it" items never block Done.
  - If you're already at the place when you add the list, it opens straight away.
- **Part 5, away mode:**
  - While you're away, Focus pauses house jobs, room jobs, bins, the home wind down and anything linked to home. They roll over quietly, with nothing marked missed or skipped.
  - Diary events, place reminders, grab lists, your own timed jobs and trips with a place (handovers) still come.
  - Wind down becomes one short card, and Today shows "Away tonight. Home jobs paused." with Undo.
  - Away mode ends when you get home, or with Undo. If you're away more than one night, Focus asks "Still away tonight?" once each evening.
  - At a family or Other place still there 30 minutes into your evening (an hour before your own wind down), Focus asks once, "Looks like you're staying at … tonight?"
