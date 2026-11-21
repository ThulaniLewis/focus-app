# Focus phone app: setup

## Updating to version 0.2 (do this if Focus is already on your phone)

1. Unzip `focus-v0.2.zip` **on top of** `Documents\focus\focus`, and say **Replace** when Windows asks. Your filled-in `src\config.ts` is not in the zip, so it stays as it is.
2. In PowerShell:
   ```
   cd Documents\focus\focus
   npm install
   $env:EAS_NO_VCS="1"
   npx eas-cli@latest build -p android --profile preview
   ```
3. When it finishes, open the link on your phone and install over the old Focus. Your tasks stay.
4. First time you open it: allow **calendar** (Today shows a card) and the **microphone** (first tap on the mic).

What's new: Today, Spaces, a centre mic, Week and Wind down tabs. Spaces you can rename, add and remove in the app (pencil on Spaces). Shopping in aisle order. A private "Just for me" space. Your phone diary in Focus, with dated things added to it. Back arrows everywhere. The new sunset logo, icon and splash screen.

---

**The rule this whole guide follows: your Anthropic key never goes in the app.** It lives in Supabase, inside a small server function. The app signs in with your email and asks that function to talk to Claude for it. Nothing on your phone, in the code, or on GitHub can leak the key, because none of them ever have it.

```
Phone (Focus)  →  Supabase function "focus-claude"  →  Anthropic
 signed in         holds the key, checks it's you
```

Allow about an hour and a half the first time. Most of it is waiting for the build.

---

## Part 1: Anthropic (10 minutes)

1. Go to **console.anthropic.com** and sign in.
2. Under **API keys**, delete any old key that was ever pasted into an app, a code file or GitHub, including the Glow Up one. Treat them as public now.
3. Create a new key called **Focus server**. Copy it into your password manager or a note for Part 2. You only see it once.
4. Under **Billing**, check you have some credit. £5 to £10 covers the test week many times over.
5. Under **Limits**, set a low monthly spend limit, say £10. If anything ever goes wrong, that caps the damage.

## Part 2: Supabase (25 minutes)

### Create the project
1. Go to **supabase.com**, sign in, and create a **New project**. Call it `focus`, choose the **London** region, and save the database password in your password manager.
2. Wait a couple of minutes while it sets up.

### Make sign-in send a code
3. Go to **Authentication > Emails** (sometimes called **Email Templates**). Open the **Confirm signup** template, then the **Magic Link** template, and do the next step in both.
4. Replace the message body with:
   ```
   <h2>Your Focus code</h2>
   <p>Enter this code in Focus: {{ .Token }}</p>
   ```
   Save it.

### Put the key in a server function
5. Go to **Edge Functions**, click **Deploy a new function**, and choose **Via Editor**.
6. Delete the sample code. Open `supabase\functions\focus-claude\index.ts` from the zip in Notepad, copy all of it, and paste it in.
7. Name the function `focus-claude` exactly, then click **Deploy**.
8. Go to **Edge Functions > Secrets** and add two:

   | Name | Value |
   | --- | --- |
   | `ANTHROPIC_API_KEY` | the key from Part 1 |
   | `ALLOWED_EMAILS` | the email you'll sign in to Focus with |

   This is the only place the key ever goes.

### Copy two public values for the app
9. Go to **Project Settings > API Keys**. Copy the **publishable key** (starts `sb_publishable_`). Then copy the **Project URL** (it looks like `https://abcdxyz.supabase.co`). You'll find it under **Project Settings > Data API**, or by clicking **Connect** at the top of the project.
10. Unzip `focus.zip` into your Documents folder. Open `Documents\focus\src\config.ts` in Notepad and paste the two values between the quotes. Save.

These two are designed to be public, so it's fine that they're in the app. On their own they let someone see your sign-in screen, nothing more. Never put the **secret key** or **service role key** in the app.

## Part 3: Build the app (laptop, 10 minutes plus waiting)

1. Install **Node.js LTS** from nodejs.org if you don't have it. In **PowerShell**, `node -v` should show a version number.
2. Make a free account at **expo.dev**.
3. In PowerShell:
   ```
   cd Documents\focus
   npm install
   $env:EAS_NO_VCS="1"
   npx eas-cli@latest login
   npx eas-cli@latest init
   npx eas-cli@latest build -p android --profile preview
   ```
   Say yes to creating the project and to generating an Android keystore. On a Mac, use `export EAS_NO_VCS=1` instead of the `$env` line.
4. The build runs in Expo's cloud. On the free plan this can take 10 to 40 minutes. It ends with a link and a QR code.

## Part 4: Install and sign in (phone, 10 minutes)

1. Scan the QR code or open the link on your Samsung, download the file and open it. Allow installs from your browser when asked. If **Auto Blocker** stops it, turn it off in **Settings > Security and privacy**, install, then turn it back on.
2. Open Focus and go to **Settings > Account**. Enter your email (the same one you put in `ALLOWED_EMAILS`), tap **Send code**, and enter the 6 digit code from the email. You stay signed in from then on.
3. **Lock the door behind you.** In Supabase, go to **Authentication > Sign In / Providers** and turn off **Allow new users to sign up**. Now nobody else can even make an account. The `ALLOWED_EMAILS` check is a second lock on top.
4. In Focus: on **Today**, tap **Turn on notifications**, then **Allow exact alarms**.
5. In **Settings > Places**, check Nursery's travel time (set to 20 minutes) and change it if needed.
6. Tap the big mic in the middle and say: *"Drop Sav at nursery by 8:15 every weekday."* Tap **Sort it**, then **Add**.

If the dump works, the key setup is done.

## Part 5: NFC tags (tomorrow)

1. Check NFC is on: **Settings > Connections > NFC and contactless payments**.
2. Install **NFC Tools** (by wakdev) from the Play Store.
3. In NFC Tools: **Write > Add a record > Custom URL / URI**, then type the room address, for example `focus://room/kitchen`. **Settings > NFC sticker addresses** in Focus lists every room's address.
4. Tap **Write**, hold the phone on the sticker, then stick it where you'll naturally tap it.

---

## If something goes wrong

| What you see | What to do |
| --- | --- |
| "Focus is not connected to Supabase yet" | `src\config.ts` still has the placeholders. Fill it in and build again. |
| No code email arrives | Check spam. Supabase's built-in email is slow and limited to a few emails an hour, so wait a minute before asking again. |
| The email has a link, not a code | The Magic Link template wasn't saved (Part 2, step 4). |
| "Server not set up" | A secret is missing or misspelt. Check both names in Part 2, step 8, then click **Deploy** on the function again. |
| "Not allowed" | The email you signed in with doesn't match `ALLOWED_EMAILS`. |
| "Invalid JWT" or "Your sign-in has expired" on every dump | Sign out and back in. If it keeps happening, open the function's settings in Supabase and turn off JWT verification. The function checks your sign-in itself, so it stays locked. |
| A Claude error about the model | Check the model name at the bottom of Settings against the models listed in the Anthropic console. |

## Why this fixes the Glow Up problem

- **Before:** the key was built into the app or the code. Anything built into an app can be pulled back out of it, and any key that reaches GitHub gets flagged as leaked.
- **Now:** the app only holds your sign-in. If your phone or the code ever leaked, there's no key to find. If you lose your phone, sign out from Supabase (**Authentication > Users**). Your key is safe either way.
- **The habit:** keys only ever go in **Supabase secrets**. They never go in code, chat or screenshots. If one slips, delete it in the Anthropic console and make a new one. You only need to update the Supabase secret, never the app.

Glow Up can use the same function later. It would sign in the same way and call `focus-claude`, so it never needs a key of its own.

## Updating later

When I send new code, replace the files in `Documents\focus`, keep your filled-in `src\config.ts`, then run `npm install` and the build command again. Install the new file over the old one and your data stays. If the function code changes, paste it into the Supabase editor and click **Deploy**.
