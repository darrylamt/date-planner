/**
 * The emails Supabase sends for us: confirm an account, reset a password,
 * sign in with a link, confirm a new address.
 *
 * Supabase holds these in its dashboard, not in this repo, and sends its own
 * grey defaults until somebody pastes something better in. So they are
 * written here, from one layout so the four cannot drift apart, into
 * supabase/email/, and pasted from there: Authentication > Emails in the
 * Supabase dashboard, one template each, with the subject in README.md.
 *
 *   npx tsx scripts/auth-emails.ts
 *
 * Built the way mail clients need it: tables for layout, every style inline,
 * a flat colour behind every gradient, no scripts and no stylesheets. The
 * {{ .ConfirmationURL }} and friends are Supabase's own template tags and are
 * left for it to fill in.
 */
import fs from "fs";
import path from "path";

const ROSE = "#E23D6D";
const GOLD = "#E5B04E";
const INK = "#1C1216";
const SOFT = "#6E5A63";
const PAGE = "#FBF4F7";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const APP_STORE = "https://apps.apple.com/gh/app/adurogh/id6809005685";

interface Mail {
  file: string;
  subject: string;
  /** The line an inbox shows beside the subject. */
  preview: string;
  emoji: string;
  heading: string;
  body: string;
  button: string;
  /** Under the button: how long the link lasts, and what to do if it was not them. */
  after: string;
}

const MAILS: Mail[] = [
  {
    file: "confirm-signup.html",
    subject: "Confirm your email for aduro",
    preview: "One tap and your plans are saved to your account.",
    emoji: "🎉",
    heading: "One tap and you are in",
    body: "Welcome to aduro. Confirm this is your email address and every plan you make is saved to your account, ready to share, repeat or pick up on another phone.",
    button: "Confirm my email",
    after: "If you did not sign up for aduro, ignore this email and nothing happens.",
  },
  {
    file: "reset-password.html",
    subject: "Reset your aduro password",
    preview: "Choose a new password. The link works once.",
    emoji: "🔑",
    heading: "Choose a new password",
    body: "Somebody, hopefully you, asked to reset the password for {{ .Email }}. Tap below to choose a new one.",
    button: "Choose a new password",
    after: "The link works once and expires soon. If you did not ask for this, ignore it: your password stays as it is.",
  },
  {
    file: "magic-link.html",
    subject: "Your aduro sign-in link",
    preview: "Tap to sign in. No password needed.",
    emoji: "✨",
    heading: "Here is your way in",
    body: "Tap below to sign in to aduro as {{ .Email }}. No password needed.",
    button: "Sign me in",
    after: "The link works once and expires soon. If you did not ask to sign in, ignore this email.",
  },
  {
    file: "change-email.html",
    subject: "Confirm your new email for aduro",
    preview: "Confirm the change, and your plans follow you.",
    emoji: "📬",
    heading: "Confirm your new address",
    body: "You asked to move your aduro account from {{ .Email }} to {{ .NewEmail }}. Confirm it and your plans come with you.",
    button: "Confirm the change",
    after: "If you did not ask for this, ignore it and your account keeps its current address.",
  },
];

function render(m: Mail): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${m.subject}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE};">
<!-- The inbox preview line, hidden in the email itself. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${m.preview}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE};">
  <tr>
    <td align="center" style="padding:32px 14px;">

      <!-- The logo: the tile and the wordmark, drawn in HTML so it shows with images off. -->
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td style="width:40px;height:40px;border-radius:12px;background:${ROSE};background-image:linear-gradient(135deg,${ROSE},${GOLD});color:#ffffff;font:800 20px ${FONT};text-align:center;line-height:40px;">A</td>
          <td style="padding-left:10px;font:800 26px ${FONT};letter-spacing:-0.5px;color:${INK};">adu<span style="color:${ROSE};">ro</span></td>
        </tr>
      </table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin-top:22px;background:#ffffff;border-radius:26px;overflow:hidden;box-shadow:0 18px 50px -28px rgba(226,61,109,0.45);">
        <tr>
          <td style="padding:30px 32px 12px;text-align:center;">
            <!-- A short bar rather than a strip: mail clients do not clip a full-width one to the card's corners. -->
            <div style="width:72px;height:5px;border-radius:5px;background:${ROSE};background-image:linear-gradient(90deg,${ROSE},${GOLD});margin:0 auto 24px;font-size:0;line-height:0;">&nbsp;</div>
            <div style="font-size:44px;line-height:1;">${m.emoji}</div>
            <h1 style="margin:18px 0 0;font:800 27px/1.2 ${FONT};color:${INK};letter-spacing:-0.4px;">${m.heading}</h1>
            <p style="margin:14px 0 0;font:16px/1.6 ${FONT};color:${SOFT};">${m.body}</p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:24px 32px 8px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:999px;background:${ROSE};background-image:linear-gradient(100deg,${ROSE},${GOLD});">
                  <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:16px 36px;font:700 17px ${FONT};color:#ffffff;text-decoration:none;border-radius:999px;">${m.button}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 32px 34px;text-align:center;">
            <p style="margin:0;font:13px/1.6 ${FONT};color:${SOFT};">${m.after}</p>
            <p style="margin:16px 0 0;font:12px/1.6 ${FONT};color:#A8969E;">Button not working? Paste this into your browser:<br>
              <a href="{{ .ConfirmationURL }}" style="color:${ROSE};word-break:break-all;">{{ .ConfirmationURL }}</a>
            </p>
          </td>
        </tr>
      </table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr>
          <td style="padding:24px 20px 0;text-align:center;font:13px/1.6 ${FONT};color:${SOFT};">
            Dates, birthdays and days out in Accra, planned from real menus and real prices.<br>
            <a href="${APP_STORE}" style="color:${ROSE};font-weight:700;text-decoration:none;">Get aduro on the App Store &rarr;</a>
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>
</body>
</html>
`;
}

const out = path.join(process.cwd(), "supabase", "email");
fs.mkdirSync(out, { recursive: true });
for (const m of MAILS) {
  fs.writeFileSync(path.join(out, m.file), render(m));
  console.log(`  ${m.file}`);
}

const readme = `# The emails Supabase sends

Generated by \`npx tsx scripts/auth-emails.ts\`. Edit the script, not these files.

Supabase keeps these in its dashboard: **Authentication > Emails**. For each
template below, paste the subject into *Subject* and the whole file into
*Message body* (the Source tab), then save.

| Template in Supabase | Subject | File |
| --- | --- | --- |
${MAILS.map((m) => `| ${m.file === "confirm-signup.html" ? "Confirm signup" : m.file === "reset-password.html" ? "Reset password" : m.file === "magic-link.html" ? "Magic link" : "Change email address"} | ${m.subject} | \`${m.file}\` |`).join("\n")}

The \`{{ .ConfirmationURL }}\`, \`{{ .Email }}\` and \`{{ .NewEmail }}\` tags are
Supabase's own and are filled in when each email is sent.

## Who it comes from

Supabase's built-in sender sends as "Supabase Auth" from its own address, and
only a few emails an hour for the whole project. To send as aduro, set up
custom SMTP under **Authentication > Emails > SMTP settings** (Resend has a free
tier) with a sender like \`aduro <hello@yourdomain>\`.
`;
fs.writeFileSync(path.join(out, "README.md"), readme);
console.log("  README.md");
