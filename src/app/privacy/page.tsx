import { LEGAL, LegalPage, List, Section } from "@/components/app/legal-page";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          Movents (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is an event-planning tool for university clubs and societies, run by {LEGAL.operator} in Malaysia. This
          policy explains what personal data we collect, why, and your choices. We follow Malaysia&apos;s Personal Data Protection Act 2010 (PDPA).
        </p>
      }
    >
      <Section n={1} title="What we collect">
        <List>
          <li><b>Account:</b> your name, email address and, if you use it, your Google account email. Your role and department in each society you join.</li>
          <li><b>Society and event data:</b> what you and your committee enter: events, tasks, budgets, risks, meetings and minutes, speakers, suppliers, sponsors, files and posters.</li>
          <li><b>Event guests:</b> when someone registers on a public event page, their name, email, any dietary or accessibility needs they choose to share, check-in status and optional feedback.</li>
          <li><b>Emails sent through Movents:</b> recipient, subject, content and delivery status of emails the app sends for you (speaker invites, supplier quotes, sponsor outreach, reminders).</li>
          <li><b>Sponsor email opens:</b> sponsor outreach emails include a small tracking image so the team can see whether an email was opened.</li>
          <li><b>Security and usage data:</b> sign-in sessions (with device or browser and IP address), sign-in links, rate-limit counters by IP address, and an audit log of actions taken in each society.</li>
          <li><b>AI assistant connections:</b> if you connect an AI assistant (such as Claude, ChatGPT or Cursor), we store a hashed access token and record the actions it takes for you.</li>
        </List>
      </Section>

      <Section n={2} title="Why we use it">
        <p>
          To run the service: sign you in, keep each society&apos;s workspace private, plan and run events, send the emails you ask for, keep the records your
          university may require, prevent abuse, and fix problems. We do not sell personal data or use it for advertising.
        </p>
      </Section>

      <Section n={3} title="Cookies">
        <p>
          We use one essential cookie, <code>mv_session</code>, to keep you signed in (it expires after 30 days without use). We use no advertising or analytics
          cookies.
        </p>
      </Section>

      <Section n={4} title="Who processes data for us">
        <List>
          <li><b>Vercel:</b> hosting and file storage (Singapore region).</li>
          <li><b>Neon:</b> database (Singapore region).</li>
          <li><b>Our email delivery provider:</b> sending sign-in links, invites and the emails you send through Movents.</li>
          <li><b>Our error-monitoring provider:</b> reports of app errors, which may include technical details of the request that failed.</li>
          <li><b>Google:</b> only if you choose &ldquo;Continue with Google&rdquo;.</li>
          <li><b>Your AI assistant:</b> the data it reads or writes when you connect it, under that provider&apos;s own terms.</li>
          <li><b>Optional integrations</b> your society turns on (such as Luma, Meetup, Google Calendar, Stripe or image generation): only the data needed for that feature.</li>
        </List>
        <p>Some of these providers may process data outside Malaysia. We choose providers with appropriate safeguards.</p>
      </Section>

      <Section n={5} title="How long we keep it">
        <List>
          <li>Account and society data: while your account or society is active.</li>
          <li>Sign-in links, expired sessions, expired access tokens and rate-limit records: deleted automatically within about a day of expiring.</li>
          <li>
            When you delete your account, your memberships, sessions and tokens are removed and your name and email are anonymised. Audit history keeps its
            structure without your personal details.
          </li>
        </List>
      </Section>

      <Section n={6} title="Your rights">
        <p>
          In Settings you can view and correct your details, download a copy of your data (&ldquo;Download my data&rdquo;), delete your account, and revoke
          connected AI assistants and tokens at any time. For anything else, email <a className="underline underline-offset-2" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
          We reply within 21 days.
        </p>
      </Section>

      <Section n={7} title="Guests' and members' data">
        <p>
          Society committees are responsible for the guest and member data they collect through Movents and should collect only what they need.
        </p>
      </Section>

      <Section n={8} title="Security">
        <p>
          There are no passwords to leak: sign-in is by emailed link or Google. We hash all tokens, keep each society&apos;s data separate, store files
          privately and use encrypted (HTTPS) connections.
        </p>
      </Section>

      <Section n={9} title="Age">
        <p>Movents is meant for university students and staff aged 18 and over.</p>
      </Section>

      <Section n={10} title="Changes">
        <p>We&apos;ll post changes here and update the date above. For significant changes we&apos;ll let you know in the app or by email.</p>
      </Section>
    </LegalPage>
  );
}
