import { Hero } from "../home/Hero";
import { HowItWorks } from "../home/HowItWorks";
import { Reviewers } from "../home/Reviewers";
import { Seats } from "../home/Seats";
import "../home/home.css";

/**
 * The product homepage. The first screen is the search beside a parcel whose
 * record rises out of it; under it, how a purchase runs, what reviewers do,
 * and who it is for.
 */
export function HomePage() {
  return (
    <div className="home">
      <Hero />
      <HowItWorks />
      <Reviewers />
      <Seats />
    </div>
  );
}
