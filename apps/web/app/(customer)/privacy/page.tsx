import type { Metadata } from "next";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How College Crew LLC collects, uses, discloses, and protects personal information.",
};

const EFFECTIVE_DATE = "August 4, 2026";

function PolicySection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-line pt-7">
      <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
      <div className="mt-3 space-y-4 text-sm leading-7 text-ink-soft">
        {children}
      </div>
    </section>
  );
}

function Disclosure({
  name,
  information,
  purpose,
  method,
}: {
  name: string;
  information: string;
  purpose: string;
  method: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-court p-4">
      <h3 className="font-semibold text-ink">{name}</h3>
      <dl className="mt-3 space-y-3 text-sm leading-6 text-ink-soft">
        <div>
          <dt className="font-semibold text-ink">Information disclosed</dt>
          <dd>{information}</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">Why</dt>
          <dd>{purpose}</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">How</dt>
          <dd>{method}</dd>
        </div>
      </dl>
    </div>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Privacy Policy"
        description="How College Crew collects, uses, discloses, and safeguards personal information."
      />

      <Card pennant className="p-6 sm:p-8">
        <div className="space-y-4 text-sm leading-7 text-ink-soft">
          <p>
            <strong className="text-ink">Effective date:</strong>{" "}
            {EFFECTIVE_DATE}
          </p>
          <p>
            College Crew LLC, an Illinois limited liability company
            (&quot;College Crew,&quot; &quot;we,&quot; &quot;us,&quot; or
            &quot;our&quot;), operates a marketplace that connects customers
            with independent college-student service providers. This Privacy
            Policy applies to the College Crew website, accounts, booking and
            payment features, messaging, support, and related services
            (collectively, the &quot;Platform&quot;).
          </p>
          <p>
            This Policy explains the information we collect, where it comes
            from, how and why we use it, the parties to whom we disclose it,
            how disclosure occurs, the safeguards we use, and the choices
            available to you. Our{" "}
            <Link href="/legal" className="font-semibold text-crew-700 underline">
              Legal Terms
            </Link>{" "}
            govern your use of the Platform.
          </p>

          <nav
            aria-label="Privacy Policy sections"
            className="rounded-xl border border-line bg-court p-4"
          >
            <p className="font-semibold text-ink">Policy sections</p>
            <ol className="mt-2 grid gap-x-5 gap-y-1 sm:grid-cols-2">
              {[
                ["information-we-collect", "1. Information we collect"],
                ["sources", "2. Sources of information"],
                ["uses", "3. How we use information"],
                ["disclosures", "4. Disclosures and how they occur"],
                ["public-information", "5. Public information"],
                ["cookies", "6. Cookies and analytics"],
                ["retention", "7. Retention"],
                ["security", "8. Security"],
                ["choices", "9. Your choices and rights"],
                ["children", "10. Children and minors"],
                ["transfers", "11. Processing locations"],
                ["changes", "12. Changes to this Policy"],
                ["contact", "13. Contact us"],
              ].map(([href, label]) => (
                <li key={href}>
                  <a href={`#${href}`} className="text-crew-700 underline">
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <PolicySection id="information-we-collect" title="1. Information we collect">
            <p>We collect the following categories of information:</p>

            <div>
              <h3 className="font-semibold text-ink">
                Account and contact information
              </h3>
              <p>
                Name, email address, account role, authentication and account
                status, support contact information, and the content of
                account-recovery or support requests. Passwords are handled by
                our authentication provider and are stored in hashed form, not
                as readable passwords. If you choose Google sign-in, Google
                provides your name, email address, basic profile information,
                and an account identifier. We do not receive your Google
                password.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-ink">
                Address and location information
              </h3>
              <p>
                Home, business, student, service, and job addresses; city,
                state, postal code, and approximate coordinates derived from an
                address. We use this information for service-area matching,
                distance estimates, booking logistics, safety, and support.
                Exact home and job addresses are not displayed in the public
                provider directory.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-ink">
                Provider onboarding and verification information
              </h3>
              <p>
                Date of birth, school and .edu email information, school
                directory identifiers, government-issued identification images,
                provider type, business or display name, biography, profile and
                service photos, neighborhood, optional school-organization
                information, service offerings, rates, availability, and
                verification status. College Crew manually reviews government
                identification. We do not use facial-recognition technology or
                create biometric identifiers from identification images.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-ink">
                Booking and service information
              </h3>
              <p>
                Requested service, schedule and availability, job location,
                job instructions, photos and attachments, quotes, estimates,
                arrival and completion activity, cancellations, replacement
                requests, invoices, disputes, refunds, and related audit
                records. For services involving a minor, a customer may provide
                limited information such as allergies, medical considerations,
                emergency contacts, supervision expectations, or activity
                restrictions. Customers should provide only information that
                is necessary for the service and that they are authorized to
                provide.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-ink">
                Communications and user content
              </h3>
              <p>
                Messages between customers and providers, chat images and
                attachments, reviews, provider profile text and images, support
                submissions, moderation results, reports, and communications
                with College Crew. Messages and profile text are automatically
                scanned for safety, inappropriate content, and attempts to move
                contact or payment off the Platform. Flagged content may be
                redacted, logged, and reviewed by College Crew founders.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-ink">
                Payment and payout information
              </h3>
              <p>
                Transaction amounts and status, limited payment-method details
                supplied by Stripe (such as card brand and last four digits),
                Stripe customer and connected-account identifiers, payment,
                transfer, payout, refund, invoice, and dispute records. Stripe
                directly collects full card numbers, bank-account information,
                tax information, and additional identity information used for
                payment or provider onboarding. College Crew does not receive or
                store full card numbers or provider bank-account credentials.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-ink">
                Technical and usage information
              </h3>
              <p>
                IP address, browser and device information, request and error
                logs, timestamps, authentication sessions, security events,
                email-delivery status, webhook records, and cookies or similar
                identifiers needed to keep you signed in, preserve security,
                remember a selected booking location, and operate the Platform.
              </p>
            </div>
          </PolicySection>

          <PolicySection id="sources" title="2. Sources of information">
            <p>
              We receive information directly from you when you create or
              update an account, apply as a provider, upload content, make or
              manage a booking, send a message, pay, submit a review, or
              contact support.
            </p>
            <p>
              We also receive information from the customer or provider on the
              other side of a marketplace interaction, from Stripe concerning
              payments and connected-account readiness, from the U.S.
              Department of Education College Scorecard concerning schools,
              from the U.S. Census Bureau geocoder concerning address
              coordinates, and automatically from the device, browser, and
              infrastructure used to access the Platform.
            </p>
          </PolicySection>

          <PolicySection id="uses" title="3. How we use information">
            <p>We use personal information to:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Create, authenticate, secure, and administer accounts.</li>
              <li>
                Verify provider age, student status, identity, and onboarding
                readiness.
              </li>
              <li>
                Display provider profiles, services, rates, availability, and
                reviews.
              </li>
              <li>
                Match customers and providers, calculate approximate distance,
                facilitate bookings, and share necessary job logistics.
              </li>
              <li>
                Authorize and process payments, provider transfers and payouts,
                refunds, invoices, disputes, fraud controls, and financial
                reconciliation.
              </li>
              <li>
                Deliver transactional emails and account, booking, payment, and
                safety notices.
              </li>
              <li>
                Operate messaging and scan messages and profile text for safety,
                prohibited contact information, abuse, and policy violations.
              </li>
              <li>
                Provide support, investigate reports, resolve disputes, enforce
                our agreements, and protect users, College Crew, and the public.
              </li>
              <li>
                Debug, maintain, secure, measure, and improve the Platform.
              </li>
              <li>
                Comply with legal, tax, accounting, reporting, and regulatory
                obligations and respond to lawful requests.
              </li>
            </ul>
            <p>
              We do not sell personal information. We do not disclose personal
              information for cross-context behavioral advertising, and we do
              not currently use third-party advertising trackers.
            </p>
          </PolicySection>

          <PolicySection
            id="disclosures"
            title="4. Parties to whom we disclose information—and how"
          >
            <p>
              We disclose information only as reasonably necessary for the
              purposes described in this Policy. Disclosure generally occurs
              through encrypted web requests and authenticated application
              programming interfaces, restricted service dashboards,
              time-limited private-file links, or the marketplace interfaces
              visible to the people involved in a booking.
            </p>

            <div className="grid gap-4">
              <Disclosure
                name="Customers and providers"
                information="Profile and service information, names needed for a booking, messages, schedules, job instructions, service location when needed to perform an accepted job, photos, quotes, invoices, and booking status."
                purpose="To let the parties evaluate, arrange, perform, pay for, support, and resolve a service."
                method="Through authenticated Platform pages, booking records, messaging, and restricted database access. Public provider information is disclosed through provider profiles as described below."
              />
              <Disclosure
                name="Stripe"
                information="Account and contact details, transaction amounts, booking and payment metadata, connected-account information, and information entered directly into Stripe’s payment, identity, tax, bank, and payout interfaces."
                purpose="Payment authorization and processing, provider onboarding and payouts, refunds, disputes, fraud prevention, tax reporting, and financial compliance."
                method="Through Stripe-hosted forms, Stripe.js, authenticated Stripe APIs, and signed webhook events."
              />
              <Disclosure
                name="Supabase"
                information="Account records, database content, uploaded files, authentication sessions, realtime messages, request metadata, and operational logs."
                purpose="Authentication, database hosting, private and public file storage, realtime features, server functions, and access controls."
                method="Through encrypted Supabase client and server APIs, database connections, Storage, Auth, Realtime, and Edge Functions."
              />
              <Disclosure
                name="Google"
                information="Name, email address, basic Google profile information, an account identifier, and authentication events when you choose Google sign-in."
                purpose="To let you create or access your College Crew account using your Google account."
                method="Through Google's OAuth service and Supabase Auth. College Crew receives the approved profile details, not your Google password."
              />
              <Disclosure
                name="Vercel"
                information="Web requests, IP address, browser and device metadata, server logs, and information processed by the website’s server functions."
                purpose="Website hosting, delivery, security, reliability, and diagnostics."
                method="Automatically through the infrastructure that serves the Platform."
              />
              <Disclosure
                name="Resend"
                information="Email address, email content, delivery metadata, and identifiers needed to send and monitor account and transactional messages."
                purpose="Email verification, authentication, booking notices, payment notices, moderation alerts, and support communications."
                method="Through authenticated email APIs and signed delivery webhooks."
              />
              <Disclosure
                name="OpenAI"
                information="The message or provider-profile text being evaluated and limited surrounding conversation context when needed for moderation. We do not intentionally send payment credentials or government-identification images for this purpose."
                purpose="To assist with detecting prohibited contact channels, abusive or inappropriate content, and other safety concerns."
                method="Through an authenticated server-to-server API. Automated results may cause redaction or a flag for founder review; they do not determine payment, credit, employment, or legal eligibility."
              />
              <Disclosure
                name="U.S. Census Bureau geocoder"
                information="Street address, city, state, and postal code, without account credentials or payment information."
                purpose="To derive approximate coordinates for distance estimates and service-area matching."
                method="Through a server-to-server request to the Census Geocoding Services API when an address is saved or selected."
              />
              <Disclosure
                name="U.S. Department of Education College Scorecard"
                information="A school search term or selected public school identifier."
                purpose="To suggest and confirm recognized colleges and their public website domains."
                method="Through a server-to-server request to the College Scorecard API."
              />
              <Disclosure
                name="Brandfetch"
                information="A recognized school’s public website domain and ordinary web-request metadata such as IP address and browser information."
                purpose="To display a recognized school logo on provider profiles."
                method="Your browser may request the logo directly from Brandfetch’s content-delivery network when a recognized-school logo is displayed."
              />
            </div>

            <p>
              We may also disclose information to professional advisers,
              insurers, auditors, tax preparers, and contractors subject to
              confidentiality and security obligations; to government
              authorities or other parties when required by law or reasonably
              necessary to protect rights, safety, and security; and in
              connection with a merger, financing, acquisition, reorganization,
              bankruptcy, or sale of all or part of the business, subject to
              appropriate protections.
            </p>
          </PolicySection>

          <PolicySection id="public-information" title="5. Public information">
            <p>
              Approved provider profiles may publicly display the provider’s
              display or business name, profile and service photos, biography,
              provider type, general neighborhood, recognized school,
              school-organization information the provider chooses to add,
              offered services, rates or quote information, availability notes,
              completed-job counts, and ratings or reviews. Public review
              displays do not identify the customer or expose the underlying
              booking.
            </p>
            <p>
              Blog posts and other content intentionally submitted for public
              publication are also public. Public information may be viewed,
              copied, indexed, or redistributed by search engines and other
              people outside College Crew. Do not include sensitive or
              unnecessary personal information in public fields.
            </p>
          </PolicySection>

          <PolicySection id="cookies" title="6. Cookies and analytics">
            <p>
              We use essential cookies and similar browser storage for
              authentication, security, password recovery, administrator
              preview controls, remembering a selected booking origin, and
              dismissing certain account notices. The booking-origin cookie can
              contain an address and derived coordinates selected by the user
              and expires after approximately 30 days unless replaced or
              deleted earlier. Authentication cookies have durations controlled
              by our authentication provider and account activity.
            </p>
            <p>
              College Crew does not currently use third-party advertising
              cookies, behavioral advertising pixels, or third-party marketing
              analytics. Browser &quot;Do Not Track&quot; signals are not
              standardized; because we do not currently use cross-site
              behavioral advertising, we do not change Platform behavior in
              response to those signals.
            </p>
          </PolicySection>

          <PolicySection id="retention" title="7. How long we retain information">
            <p>
              We retain information for as long as reasonably necessary to
              provide the Platform, maintain an account, complete bookings and
              payments, support users, resolve disputes, prevent fraud and
              abuse, enforce agreements, and satisfy legal, tax, accounting,
              insurance, and reporting obligations. Different records therefore
              have different retention periods.
            </p>
            <p>
              Short-lived verification codes, payment drafts, session data, and
              operational leases expire or are cleaned up on shorter schedules.
              Account deletion removes the account and associated Platform
              records through our deletion workflow, but we or our service
              providers may retain limited transaction, legal-acceptance,
              dispute, fraud, backup, or security records when reasonably
              necessary or legally required. Information already made public or
              copied by another person may remain outside our control.
            </p>
            <p>
              When information is no longer reasonably needed, we delete it,
              de-identify it, or securely isolate it until deletion is
              practicable.
            </p>
          </PolicySection>

          <PolicySection id="security" title="8. Security practices">
            <p>
              We use administrative, technical, and organizational safeguards
              designed to protect personal information from unauthorized
              access, acquisition, destruction, use, modification, or
              disclosure. These practices include:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>HTTPS encryption for data transmitted to the Platform.</li>
              <li>
                Supabase database row-level security and role-based access
                controls that limit users to authorized records.
              </li>
              <li>
                Private storage for government-identification images, job
                photos, and chat attachments, with owner-restricted access or
                time-limited signed links.
              </li>
              <li>
                Restricted founder administration, server-only privileged
                credentials, environment-managed secrets, and audit records for
                sensitive booking and payment operations.
              </li>
              <li>
                Stripe-hosted handling of full card numbers, bank credentials,
                and provider payout onboarding so those credentials are not
                stored in College Crew’s database.
              </li>
              <li>
                Input validation, webhook signature verification, duplicate
                event protection, authentication controls, moderation, and
                operational monitoring.
              </li>
              <li>
                Service providers selected to support appropriate
                confidentiality, integrity, and security of the information
                they process for us.
              </li>
            </ul>
            <p>
              No system can guarantee absolute security. Please use a unique
              password, protect your email account and devices, and notify us
              promptly through{" "}
              <Link href="/support" className="text-crew-700 underline">
                Support
              </Link>{" "}
              if you believe your account or information has been compromised.
            </p>
          </PolicySection>

          <PolicySection id="choices" title="9. Your choices and privacy rights">
            <p>
              You can review and update many account and provider-profile fields
              in the Platform. You can manage public profile content, message
              and booking information before submission, and certain browser
              cookies through your browser or Platform controls.
            </p>
            <p>
              The account settings include an account-deletion workflow.
              Deleting an account can cancel active bookings and remove profile,
              message, review, and other associated Platform records, subject to
              the retention limitations above. You may also contact us to
              request access to, correction of, or deletion of personal
              information, or a portable copy where required by applicable law.
              We may need to verify your identity and may deny or limit a
              request where permitted by law, including to protect another
              person’s rights or preserve required financial, security, dispute,
              or legal records.
            </p>
            <p>
              Depending on where you live, applicable law may provide
              additional rights, including rights to know, access, correct,
              delete, or obtain a copy of personal information and to opt out of
              certain sales, targeted advertising, or profiling. College Crew
              does not sell personal information or use it for cross-context
              behavioral advertising. We will not discriminate against you for
              exercising an applicable privacy right.
            </p>
            <p>
              Submit a privacy request through{" "}
              <Link href="/support" className="text-crew-700 underline">
                our Support form
              </Link>{" "}
              and select the closest available account or payment category.
              State that your message is a privacy request and describe the
              request. An authorized agent may submit a request where allowed
              by law, but we may require proof of authority and direct identity
              confirmation from the account holder.
            </p>
          </PolicySection>

          <PolicySection id="children" title="10. Children and information about minors">
            <p>
              The Platform is a general-audience service intended for people
              who can arrange and pay for local services. It is not directed to
              children under 13, and we do not knowingly allow children under
              13 to create accounts or directly submit personal information.
              Providers must be at least 18 years old.
            </p>
            <p>
              An adult customer arranging babysitting, tutoring, youth sports
              coaching, or another service involving a minor may provide
              limited information about that minor when necessary for safety
              and performance of the service. The customer represents that they
              are authorized to provide that information. Do not submit a
              minor’s information unless it is necessary, and do not place
              highly sensitive information in public fields.
            </p>
            <p>
              If you believe a child under 13 has directly provided personal
              information through the Platform, contact us through{" "}
              <Link href="/support" className="text-crew-700 underline">
                Support
              </Link>{" "}
              so we can investigate and delete it as appropriate.
            </p>
          </PolicySection>

          <PolicySection id="transfers" title="11. Processing locations and third-party services">
            <p>
              College Crew is based in Illinois and the Platform is intended
              for use in the United States. We and our service providers may
              process information in the United States and other locations
              where they operate. Those locations may have privacy laws that
              differ from the laws where you live.
            </p>
            <p>
              Third-party services have their own privacy policies and security
              practices. This Policy describes College Crew’s use of those
              services but does not replace the privacy notices those parties
              provide when they collect information directly, including
              Stripe’s notices during payment and connected-account onboarding.
            </p>
          </PolicySection>

          <PolicySection id="changes" title="12. Changes to this Policy">
            <p>
              We may update this Privacy Policy as the Platform, our practices,
              or legal requirements change. We will post the revised Policy on
              this page and update the effective date. If a change materially
              affects how we use or disclose personal information, we will
              provide additional notice when reasonably required, such as
              through the Platform or by email.
            </p>
          </PolicySection>

          <PolicySection id="contact" title="13. Contact us">
            <p>
              College Crew LLC is responsible for the personal information
              described in this Policy. For privacy questions, requests, or
              complaints, contact us through our public{" "}
              <Link href="/support" className="font-semibold text-crew-700 underline">
                Feedback &amp; Support form
              </Link>
              . Include &quot;Privacy request&quot; in your message and provide
              the email address associated with your account so we can respond
              and verify the request.
            </p>
          </PolicySection>
        </div>
      </Card>
    </div>
  );
}
