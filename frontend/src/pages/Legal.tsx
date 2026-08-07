import { Link } from "react-router-dom";
import { Page } from "@/components/Page";
import { useAuth } from "@/lib/auth-context";
import { BILLING } from "@/lib/billing";

/**
 * The privacy policy and the terms, in the plainest language they can be written in.
 *
 * These say what actually happens rather than what a template says happens. Every claim
 * below is one the code supports: bookkeeping captures are discarded, payment evidence
 * is retained privately for review, Sentry runs with send_default_pii off, payment never
 * touches a card number, and a lapsed shop keeps its reads. A policy that promises more
 * than the software does is not a protection, it is a liability with a nice font.
 *
 * Reachable signed in or out. A shop that wants to know what it agreed to should not
 * have to sign out to read it, and a stranger should not have to sign up.
 */

const UPDATED = "7 August 2026";

interface Section {
  heading: string;
  body: string[];
  points?: string[];
}

export function Privacy() {
  return <LegalPage title="Privacy" sections={PRIVACY} />;
}

export function Terms() {
  return <LegalPage title="Terms of service" sections={TERMS} />;
}

const PRIVACY: Section[] = [
  {
    heading: "Who holds this",
    body: [
      `Glaux Ledger is run as a small business in Sri Lanka. Questions about anything on
       this page, including a request to see or delete your data, go to
       ${BILLING.supportEmail} and are answered by a person.`,
    ],
  },
  {
    heading: "What we hold",
    body: ["Four kinds of thing, and nothing else:"],
    points: [
      "Your account: the shop name, the email you signed in with, a one-way hash of your password, your currency and your timezone.",
      "Your ledger: the entries you record. Amounts, categories, notes, supplier names, how something was paid for, when it happened, when it is due, and any recurring bills you set up.",
      "Payment slips you upload to renew: the image or PDF of a bank transfer, the amount and date you said you paid, and the reference you used. These exist so a person can confirm the transfer and extend your subscription.",
      "Some ordinary server records: the address a request came from, kept briefly so that sign-in and sign-up cannot be attacked by brute force, and error reports when something breaks.",
    ],
  },
  {
    heading: "What we do not hold",
    body: [],
    points: [
      "No card numbers and no bank credentials. Payment is a bank transfer you make yourself, so there is nothing of that kind for us to lose.",
      "No voice clips and no receipt photographs used for bookkeeping. A recording or a receipt photo is read, turned into a suggested entry, and discarded in the same request. Nothing from those captures is written to disk.",
      "No advertising, no trackers, and no analytics that follow you to other sites.",
      "Nothing is sold, rented or shared for marketing. Not now, and not as a change of mind later. The only way this business makes money is the monthly fee.",
    ],
  },
  {
    heading: "Payment slips",
    body: [
      `When you renew by bank transfer you can upload a JPEG, PNG, or PDF of the slip.
       That file is stored privately in our database so staff can match it to the
       transfer and extend your paid-through date. It is not published, not given a
       public link, and not used for anything else.`,
      `Staff who review payments can see the slip, the amount and date you entered, your
       shop name, and the reference. They do not need your ledger entries to do that
       work, and routine payment review does not open your books.`,
      `Slips are kept with your account's billing records. If you close the account and
       ask for deletion, payment evidence goes with everything else within thirty days.`,
    ],
  },
  {
    heading: "Voice and photo entries",
    body: [
      `When voice and receipt-photo capture is enabled, the clip or image is sent to
       OpenAI, which turns it into text and suggests an entry. It is sent for that purpose
       only, we keep no copy, and the suggestion is never recorded until you confirm it.
       When no AI provider is configured those controls are hidden. This path is separate
       from payment slips: bookkeeping captures are still discarded.`,
      `If you would rather nothing left this system at all, type your entries instead. The
       app works exactly the same way, and nothing is sent anywhere.`,
    ],
  },
  {
    heading: "Where it lives",
    body: [
      `Your records sit in a PostgreSQL database, and the application runs on managed
       hosting. Both are protected in transit by TLS. Each shop's rows are isolated from
       every other shop's at the database itself, not only in application code.`,
    ],
  },
  {
    heading: "Who can look at it",
    body: [
      `You and anyone you give your password to. Nobody at Glaux Ledger reads a shop's
       ledger entries as a matter of routine, and error reports are configured to exclude
       the contents of requests, so amounts and notes do not end up in a diagnostics
       dashboard.`,
      `Payment slips are the deliberate exception: staff review them to confirm a bank
       transfer and apply your subscription. That access is limited to payment evidence
       and the details you submitted with it.`,
      `The other exception is a fault you have asked us to fix that cannot be diagnosed
       any other way. We will ask first, and say what we looked at.`,
    ],
  },
  {
    heading: "How long we keep it",
    body: [
      `For as long as your shop has an account, because that is what a ledger is for. If
       you close the account, tell us and we will delete everything within thirty days.
       Export your PDF reports first, because deletion is not reversible.`,
      `If a subscription lapses we do not delete anything. Your records stay readable and
       exportable, and we would write to you well before that ever changed.`,
    ],
  },
  {
    heading: "Your rights",
    body: [
      `Sri Lanka's Personal Data Protection Act gives you the right to see what is held
       about you, correct it, and have it erased. You can do the first two yourself inside
       the app at any time. For anything else, email ${BILLING.supportEmail} and you will
       get an answer within thirty days.`,
    ],
  },
  {
    heading: "Cookies",
    body: [
      `None for tracking. Signing in stores one token in your browser so that you are not
       asked for a password on every screen; signing out removes it.`,
    ],
  },
  {
    heading: "Changes",
    body: [
      `If this policy changes in a way that affects what is collected or who sees it, we
       will email every shop before it takes effect rather than quietly changing the date
       at the top.`,
    ],
  },
];

const TERMS: Section[] = [
  {
    heading: "What this is",
    body: [
      `Glaux Ledger records a shop's income and expenses and produces reports from them.
       It is a bookkeeping tool. It is not an accountant, and it does not file anything
       with anybody on your behalf.`,
    ],
  },
  {
    heading: "The trial and the fee",
    body: [
      `Every shop starts with ${BILLING.trialDays} days free. No card, and nothing happens
       automatically at the end of them.`,
      `After that it is ${BILLING.price}, ${BILLING.cadence}. You pay by bank transfer,
       upload a slip in the app (or email ${BILLING.supportEmail}), and we extend your
       subscription by hand after reviewing the proof. There is no recurring charge to
       cancel and no card on file to be leaked.`,
    ],
  },
  {
    heading: "If you stop paying",
    body: [
      `Recording new entries stops. Reading, searching and exporting to PDF keep working,
       permanently.`,
      `This is the important one, so it is worth being exact: these are your financial
       records, and in many cases records you are required by law to keep. Locking them
       behind a payment would not be a pricing tactic, it would be holding your own
       accounts to ransom. We will not do it. Pay again whenever you like and writing
       resumes where it left off.`,
    ],
  },
  {
    heading: "Your data is yours",
    body: [
      `We claim no ownership of anything you record. You can export it at any time,
       whether or not the subscription is current, and you can ask for it to be deleted.`,
    ],
  },
  {
    heading: "What you are responsible for",
    body: [],
    points: [
      "Keeping your password to yourself. Anyone who has it can read and change your ledger.",
      "The accuracy of what you record. Voice and photo entries are suggestions, shown to you for confirmation before anything is saved, and reading a receipt is not a perfect science.",
      "Your own tax and regulatory filings. The reports are a summary of what you entered, not professional advice.",
      "One subscription covers one shop. Several branches keeping separate books need one each.",
    ],
  },
  {
    heading: "What we are responsible for",
    body: [
      `Keeping the service running, keeping your records safe, and taking backups. We aim
       to be available whenever your shop is open, but this is a small operation at a
       small price and there is no uptime guarantee behind that. Where an outage is our
       fault and lasts more than a day, ask and we will credit the time.`,
      `Beyond that, and to the extent the law allows, our liability is limited to the fees
       you have paid in the three months before whatever went wrong. We are not liable for
       lost profits or for a business decision made from a report.`,
    ],
  },
  {
    heading: "Acceptable use",
    body: [
      `Do not attempt to reach another shop's data, do not attack or overload the service,
       and do not resell access to it. We can suspend an account that does, and if we do
       you will still be able to export your records.`,
    ],
  },
  {
    heading: "Ending it",
    body: [
      `Stop paying, or email ${BILLING.supportEmail} and say so. Time already paid for
       runs to the end of the period. We will not delete your records because you left;
       ask if you want them gone.`,
      `We would only close an account ourselves for the reasons above, and never without
       telling you first and giving you time to export.`,
    ],
  },
  {
    heading: "Changes and governing law",
    body: [
      `Changes to these terms are emailed to every shop at least thirty days before they
       take effect, and a price rise is never applied to a period already paid for. These
       terms are governed by the law of Sri Lanka.`,
    ],
  },
];

/**
 * Inside the shell when signed in, standalone when not. A signed-in shop reading the
 * terms is one tap from the rest of the app; a stranger gets the marketing chrome and a
 * way back to the landing page.
 */
function LegalPage({
  title,
  sections,
}: {
  title: string;
  sections: Section[];
}) {
  const { status } = useAuth();
  const document = <Document sections={sections} />;

  if (status === "authenticated") return <Page title={title}>{document}</Page>;

  return (
    <div className="min-h-dvh bg-paper">
      {/* Sticky, matching the landing page's scrolled header. These documents are long
          enough that the way back out should not depend on scrolling to the top. */}
      <header className="sticky top-0 z-30 border-b border-line bg-paper/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="font-display text-xl tracking-tight">
            Glaux Ledger
          </Link>
          <Link
            to="/register"
            className="sheen rounded-md bg-accent-fill px-4 py-2 text-sm font-medium
              text-nyx transition-colors hover:bg-accent-fill-hover"
          >
            Start free
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="font-display mb-6 text-3xl tracking-tight sm:text-4xl">
          {title}
        </h1>
        {document}
      </main>

      <footer className="border-t border-line px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2 text-sm text-mute">
          <Link to="/privacy" className="link-sweep hover:text-ink">
            Privacy
          </Link>
          <Link to="/terms" className="link-sweep hover:text-ink">
            Terms
          </Link>
          <a
            href={`mailto:${BILLING.supportEmail}`}
            className="link-sweep hover:text-ink"
          >
            {BILLING.supportEmail}
          </a>
        </div>
      </footer>
    </div>
  );
}

/** Stable enough for an anchor: these headings are prose, not identifiers. */
const anchor = (heading: string) =>
  heading.toLowerCase().replace(/[^a-z0-9]+/g, "-");

function Document({ sections }: { sections: Section[] }) {
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,42rem)_minmax(0,15rem)] lg:gap-14 xl:gap-20">
      <article>
        <p className="text-sm text-mute">Last updated {UPDATED}</p>

        <div className="mt-8 flex flex-col gap-9">
          {sections.map((section) => (
            // Offset so a heading jumped to from the contents clears the sticky header
            // rather than hiding behind it.
            <section
              key={section.heading}
              id={anchor(section.heading)}
              className="scroll-mt-24"
            >
              <h2 className="mb-2 text-lg font-semibold">{section.heading}</h2>
              {section.body.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 40)}
                  className="mt-2 leading-relaxed text-mute"
                >
                  {paragraph}
                </p>
              ))}
              {section.points && (
                <ul className="mt-3 flex flex-col gap-2.5">
                  {section.points.map((point) => (
                    <li
                      key={point}
                      className="flex gap-3 leading-relaxed text-mute"
                    >
                      <span
                        aria-hidden="true"
                        className="bg-accent-edge mt-2.5 size-1 shrink-0 rounded-full"
                      />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <p className="mt-10 border-t border-line pt-6 text-sm text-mute">
          Anything here you would like explained, in writing or otherwise, email{" "}
          <a
            href={`mailto:${BILLING.supportEmail}`}
            className="text-accent underline underline-offset-4"
          >
            {BILLING.supportEmail}
          </a>
          .
        </p>
      </article>

      <Contents sections={sections} />
    </div>
  );
}

/**
 * Both documents run to a dozen headings, and the thing a shop actually arrives wanting
 * is one of them: what happens if they stop paying, or whether the recordings are kept.
 * Making them scan the whole page for it is the sort of small unkindness that reads as
 * having something to hide.
 */
function Contents({ sections }: { sections: Section[] }) {
  return (
    <nav aria-label="Contents" className="hidden lg:block">
      <div className="sticky top-24">
        <p className="eyebrow eyebrow-dot">Contents</p>
        <ol className="mt-4 flex flex-col gap-2.5 text-sm">
          {sections.map((section) => (
            <li key={section.heading}>
              <a
                href={`#${anchor(section.heading)}`}
                className="link-sweep text-mute hover:text-ink"
              >
                {section.heading}
              </a>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}
