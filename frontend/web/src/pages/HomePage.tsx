import { LiveActivity } from "../activity/LiveActivity";
import { BuiltWith } from "../home/BuiltWith";
import { FinalCta } from "../home/FinalCta";
import { Hero } from "../home/Hero";
import { HowItWorks } from "../home/HowItWorks";
import { ProofStrip } from "../home/ProofStrip";
import { Reviewers } from "../home/Reviewers";
import { Seats } from "../home/Seats";
import "../home/home.css";

/**
 * The product homepage. The first screen is the search beside a parcel whose
 * record rises out of it; under it, the live devnet feed, how a purchase
 * runs, what reviewers do, who it is for, and the sourced numbers behind it.
 */
export function HomePage() {
  return (
    <div className="home">
      <Hero />
      <LiveActivity />
      <HowItWorks />
      <Reviewers />
      <Seats />
      <ProofStrip />
      <FinalCta />
      <BuiltWith />
    </div>
  );
}
