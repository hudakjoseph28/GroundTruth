import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  stagedRehearsalV2Deal,
  type Deal,
  type ReviewerRole,
  type TimelineEvent,
} from "@groundtruth/shared";
import { viewDeal } from "../../data/dealView";
import { StageReviewers, StageView } from "./StageScreen";
import { arrivedRoles, payoutOf, wantsStage } from "./stageView";

// A simulated run of the rehearsal deal (staged-devnet-deal-rehearsal-v2)
// through stage mode, one API read per step. The wallets, amount, and escrow
// come from the shared fixture. The fund and approval signatures are the
// deal's real devnet transactions (escrow/demo-results/
// devnet-stage-rehearsal-v2.json and the deal PDA's signature list). The
// deal has not been released on devnet, so the release signature below is a
// placeholder that exists only in this test.

const SIGNATURES = {
  fund: "2vha8dsDDk5HRG72UXBy6KosU5C2NWAtzmdMKczDbYx91na4NTBasBz2EANE7QQGrQRaaZvvwxHh4v6YHmMocD3D",
  title:
    "XqiiMvzexcsrSCCFxEmEcufBVzX29jsUK28nC6ARrKUV5GHQNwbBRjZCsacWppiHhmSvXnT4eSuGNuRnRy6axnW",
  survey:
    "2ZuVbvFTBXztdK8Qw2m1DoVd1x4TZZKnaaQ46PAsLRvig2V4zf7NdF4JA5cuTBugwz8iT9CGvquvU5GvuspXmmQ7",
  septic:
    "3WEAsdUEaYQsBiB4eY39mDJ2kSS82fpB8tnTwS5tGV7yo1CkjrNAx1rBsmma45BUr6gF2Zv7PdQFSEz5D5cj9Q9w",
  release: "SIMULATED-RELEASE-NOT-ON-CHAIN",
} as const;

const APPROVED_AT: Record<ReviewerRole, string> = {
  title: "2026-11-19T02:48:38.000Z",
  survey: "2026-11-19T02:48:42.000Z",
  septic: "2026-11-19T02:56:24.000Z",
};

type Step = "funded" | ReviewerRole | "released";
const STEPS: readonly Step[] = [
  "funded",
  "title",
  "survey",
  "septic",
  "released",
];

/** The deal and timeline the API would return after `step`. */
function rehearsalAt(step: Step): { deal: Deal; timeline: TimelineEvent[] } {
  const reached = STEPS.indexOf(step);
  const done = (s: Step) => STEPS.indexOf(s) <= reached;
  const timeline: TimelineEvent[] = [
    ...stagedRehearsalV2Deal.timeline,
    {
      id: "funded",
      at: "2026-11-19T02:48:37.000Z",
      type: "funded",
      actorRole: "buyer",
      buyerMessage: "The buyer deposited 10 test USDC into escrow.",
      transactionSignature: SIGNATURES.fund,
      confirmationStatus: "confirmed",
    },
  ];
  for (const role of ["title", "survey", "septic"] as const) {
    if (!done(role)) continue;
    timeline.push({
      id: `approval-${role}`,
      at: APPROVED_AT[role],
      type: "approvalSigned",
      actorRole: role,
      buyerMessage: `The ${role} reviewer signed their approval.`,
      transactionSignature: SIGNATURES[role],
      confirmationStatus: "confirmed",
    });
  }
  if (done("released")) {
    timeline.push({
      id: "released",
      at: "2026-11-19T03:00:00.000Z",
      type: "released",
      buyerMessage: "The escrow paid 10 test USDC to the seller.",
      transactionSignature: SIGNATURES.release,
      confirmationStatus: "confirmed",
    });
  }
  const deal: Deal = {
    ...stagedRehearsalV2Deal,
    state: done("released") ? "released" : "funded",
    reviewers: stagedRehearsalV2Deal.reviewers.map((reviewer) =>
      done(reviewer.role)
        ? {
            ...reviewer,
            approvedAt: APPROVED_AT[reviewer.role],
            approvalTransaction: SIGNATURES[reviewer.role],
          }
        : { ...reviewer },
    ),
    timeline,
  };
  return { deal, timeline };
}

function render(step: Step, liveState: Deal["state"] | null = null): string {
  const { deal, timeline } = rehearsalAt(step);
  return renderToStaticMarkup(
    <MemoryRouter>
      <StageView
        deal={deal}
        timeline={timeline}
        liveState={liveState}
        updatedAt={new Date("2026-11-19T03:00:02Z")}
        stale={false}
        phoneUrl="https://groundtruth-lac.vercel.app/deals/staged-devnet-deal-rehearsal-v2"
      />
    </MemoryRouter>,
  );
}

const text = (html: string) =>
  html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");

function badge(html: string, role: string): string {
  const match = new RegExp(
    `<li class="stage-badge" data-status="(\\w+)" data-arrived="(\\w+)"><span[^>]*>[^<]*</span><strong class="stage-badge-role">${role}</strong>`,
  ).exec(html);
  if (!match) throw new Error(`no ${role} badge`);
  return match[1] ?? "";
}

describe("stage mode on the rehearsal deal", () => {
  it("walks funded → title → survey → septic → released", () => {
    const expected: Record<Step, [string, string, string, string]> = {
      funded: ["waiting", "waiting", "waiting", "0 of 3 signed"],
      title: ["signed", "waiting", "waiting", "1 of 3 signed"],
      survey: ["signed", "signed", "waiting", "2 of 3 signed"],
      septic: ["signed", "signed", "signed", "3 of 3 signed"],
      released: ["signed", "signed", "signed", "3 of 3 signed"],
    };
    for (const step of STEPS) {
      const html = render(step);
      const [title, survey, septic, count] = expected[step];
      expect([
        badge(html, "Title"),
        badge(html, "Survey"),
        badge(html, "Septic"),
      ]).toEqual([title, survey, septic]);
      expect(text(html)).toContain(count);
      // Staged roles and test funds stay labeled on every screen.
      expect(text(html)).toContain(
        "Solana devnet · test USDC · staged reviewer wallets",
      );
    }
  });

  it("names what is still missing until the payout", () => {
    expect(text(render("survey"))).toContain("Waiting on 1 sign-off");
    expect(text(render("septic"))).toContain("Ready to release");
    expect(text(render("septic"))).not.toContain("Paid to seller");
  });

  it("shows the payout, its Explorer link, and the money at the seller on release", () => {
    const html = render("released", "released");
    expect(text(html)).toContain("Paid to seller: 10 test USDC");
    expect(html).toContain(
      `https://explorer.solana.com/tx/${SIGNATURES.release}?cluster=devnet`,
    );
    expect(html).toContain('data-location="seller"');
    // The release arrived live: one burst.
    expect(html).toContain('class="stage-confetti"');
  });

  it("does not burst for a deal that was already released when the page opened", () => {
    const html = render("released", null);
    expect(text(html)).toContain("Paid to seller: 10 test USDC");
    expect(html).not.toContain("stage-confetti");
  });

  it("falls back to the escrow account when the release row has no signature yet", () => {
    const { deal } = rehearsalAt("released");
    const payout = payoutOf(deal, "10", rehearsalAt("septic").timeline);
    expect(payout).toEqual({ amount: "10" });
    expect(payoutOf(rehearsalAt("septic").deal, "10", [])).toBeNull();
  });

  it("puts the phone QR on the page", () => {
    expect(render("funded")).toContain(
      'aria-label="QR code for https://groundtruth-lac.vercel.app/deals/staged-devnet-deal-rehearsal-v2"',
    );
  });
});

describe("arrivals between polls", () => {
  it("lights each badge once, as its approval arrives", () => {
    let before: ReturnType<typeof viewDeal>["reviewers"] | null = null;
    const lit: ReviewerRole[][] = [];
    for (const step of STEPS) {
      const after = viewDeal(rehearsalAt(step).deal).reviewers;
      lit.push(arrivedRoles(before, after));
      before = after;
    }
    expect(lit).toEqual([[], ["title"], ["survey"], ["septic"], []]);
  });

  it("does not light badges that were already signed when the page opened", () => {
    expect(
      arrivedRoles(null, viewDeal(rehearsalAt("survey").deal).reviewers),
    ).toEqual([]);
  });

  it("marks an arrived badge in the markup", () => {
    const reviewers = viewDeal(rehearsalAt("septic").deal).reviewers;
    const html = renderToStaticMarkup(
      <StageReviewers
        reviewers={reviewers}
        signed={3}
        required={3}
        arrived={new Set(["septic"])}
      />,
    );
    expect(html).toContain('data-status="signed" data-arrived="true"');
    expect(text(html)).toContain("Septic reviewer: Signed.");
  });

  it("lights a hold too", () => {
    const { deal } = rehearsalAt("title");
    const held: Deal = {
      ...deal,
      state: "held",
      hold: {
        role: "survey",
        placedByWallet: deal.reviewers[1]!.wallet,
        reasonCode: "TITLE_EXCEPTION",
        buyerMessage: "Simulated hold.",
        placedAt: "2026-11-19T02:50:00.000Z",
        transactionSignature: "SIMULATED-HOLD",
      },
    };
    expect(
      arrivedRoles(viewDeal(deal).reviewers, viewDeal(held).reviewers),
    ).toEqual(["survey"]);
  });
});

describe("wantsStage", () => {
  it.each([
    ["?stage=1", true],
    ["?stage", true],
    ["?stage=true", true],
    ["?stage=0", false],
    ["?stage=false", false],
    ["", false],
  ])("%s → %s", (search, expected) => {
    expect(wantsStage(new URLSearchParams(search))).toBe(expected);
  });
});
