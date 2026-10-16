import { LEGAL, LegalPage, List, Section } from "@/components/app/legal-page";

export const metadata = { title: "Terms of Use" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Use"
      intro={<p>Movents is run by {LEGAL.operator} in Malaysia. By signing in to Movents you agree to these terms.</p>}
    >
      <Section n={1} title="The service">
        <p>Movents helps university clubs and societies plan and run events, on their own or through a connected AI assistant. It is provided &ldquo;as is&rdquo; and may change over time.</p>
      </Section>

      <Section n={2} title="Your account">
        <p>
          Keep your email account secure, since sign-in links are sent there. You&apos;re responsible for what happens under your account and for any AI
          assistant or token you connect.
        </p>
      </Section>

      <Section n={3} title="Your society's content">
        <p>
          You and your society own what you put into Movents. You give us permission to store and process it only to run the service for you. Only collect
          personal data about others (guests, speakers, sponsors) that you need and are allowed to collect.
        </p>
      </Section>

      <Section n={4} title="Acceptable use">
        <p>Don&apos;t use Movents to:</p>
        <List>
          <li>break the law or your university&apos;s rules;</li>
          <li>send spam or unwanted bulk email;</li>
          <li>upload harmful or infringing material;</li>
          <li>try to access other societies&apos; data or disrupt the service.</li>
        </List>
      </Section>

      <Section n={5} title="Approvals and outbound actions">
        <p>
          Some actions send real emails or publish real pages. You&apos;re responsible for checking them, including ones an AI assistant prepares for you.
          Approval steps help, but they don&apos;t replace your own judgement.
        </p>
      </Section>

      <Section n={6} title="Third-party services">
        <p>Integrations and AI assistants are run by other companies under their own terms. We&apos;re not responsible for them.</p>
      </Section>

      <Section n={7} title="No guarantees">
        <p>
          We work to keep Movents available and accurate, but we don&apos;t guarantee it will be uninterrupted or error-free. Budgets, deadlines and SOP checks
          are aids, not official approvals. Always confirm with your university.
        </p>
      </Section>

      <Section n={8} title="Liability">
        <p>
          To the extent the law allows, we&apos;re not liable for indirect losses, or for lost data or profits. Our total liability is limited to what you paid
          us in the 12 months before the claim. Movents is currently free.
        </p>
      </Section>

      <Section n={9} title="Ending use">
        <p>You can delete your account at any time in Settings. We may suspend accounts that break these terms.</p>
      </Section>

      <Section n={10} title="Changes and governing law">
        <p>We may update these terms and will post changes here. These terms are governed by the laws of Malaysia.</p>
      </Section>
    </LegalPage>
  );
}
