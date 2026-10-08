# Running Sonar in GitHub Codespaces

A Codespace is a computer in the cloud that GitHub runs for you. It has a copy of this repo, runs Sonar the same way your laptop would, and gives it a public https link so people can answer on their phones. It's free within GitHub's monthly allowance for personal accounts, and you don't need any account besides GitHub.

## First time (about 5 minutes)

1. On the repo page on GitHub, click the green **Code** button, open the **Codespaces** tab, and click **Create codespace on main**.
2. Wait while it sets up. It installs everything and downloads the open-source Whisper speech model (about 80 MB). You'll see progress in the terminal at the bottom.
3. When setup finishes, a terminal named **sonar** starts the app. Look for this box and **copy the password**:

   ```
   Sonar creator sign-in
   username: anything      password: xxxxxxxxxxxxxxxx
   ```

4. Open the **Ports** tab (next to Terminal). Find port **3000**, right-click it, choose **Port Visibility → Public**. Without this step, only you can open the link.
5. Hover over the address in the **Forwarded Address** column and click the globe icon to open it. Sign in with the password (any username).

That's your creator workspace. Its address looks like `https://something-3000.app.github.dev`.

## Sharing with testers

Open a Sonar, publish it, and use **Copy link**. The link (`…app.github.dev/s/your-sonar`) is all a respondent needs. No sign-in for them; the password only protects your side.

## Keep it awake while people are responding

A Codespace stops itself after a stretch with no activity in the editor, and the link stops working until you start it again. Before a test session:

- Go to **github.com → Settings → Codespaces → Default idle timeout** and set it to the maximum (240 minutes).
- Keep the Codespace's browser tab open during your test window.

Your data survives stops. When you come back, open the Codespace from **github.com/codespaces**; Sonar restarts by itself. Check the Ports tab that 3000 is still Public.

## Stay within the free allowance

GitHub gives personal accounts a monthly allowance of Codespace hours and storage (see **Settings → Billing → Codespaces** for your numbers). A 2-core Codespace uses it about twice as fast as the clock. To save it:

- **Stop** the Codespace when you're not testing: github.com/codespaces → `…` → **Stop codespace**.
- Don't delete it until you've exported what you need: deleting erases the database.

## Security, in plain terms

- **Your side is password-protected.** The password is in `.env` as `SONAR_PASSWORD`. Change it there and restart if you share your screen by accident.
- **Respondents are anonymous.** No names, emails or accounts.
- **Audio never leaves the Codespace.** Whisper runs inside it. Recordings are transcribed in memory and discarded; only the text is saved.
- **Abuse limits.** The public endpoints are rate-limited per visitor.
- **The model is data, not code.** Whisper is downloaded as ONNX weights from Hugging Face; nothing in it can execute. After the first download you can set `TRANSCRIPTION_OFFLINE=true` in `.env` so the Codespace never fetches it again.
- **When testing is over,** set port 3000 back to **Private** (or stop the Codespace) and the link stops working.

## If something's off

- **"Sign in" prompt keeps coming back:** the password is the one printed in the sonar terminal, or in `.env`.
- **Transcription is slow:** the first answer after a restart loads the model (around 10 seconds). For faster answers, set `TRANSCRIPTION_MODEL=Xenova/whisper-tiny.en` in `.env` and restart (slightly less accurate).
- **Restart Sonar:** click in the sonar terminal, press `Ctrl+C`, then run `npm run serve`.
- **Start over with fresh demo data:** in the app, Settings → Testing tools → Reset to demo data.
