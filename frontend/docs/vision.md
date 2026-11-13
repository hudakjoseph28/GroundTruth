# GroundTruth · Vision

*Draft 1 of 2 · Desktop web experience*

## What I want it to feel like

I open GroundTruth and it feels like a serious place to make a decision. The page is quiet. I see the name, one place to search, and a globe turning slowly in the background. Fine lines connect small points on the globe. A few of them light up as I watch. I get the feeling that land records, people, and payments are moving through the same system.

Then I type the address of the lot I’ve been looking at. Search is right where I expected it to be. I pick a result and the view takes me straight to the land. The boundary is clear. I can see what’s been checked, what’s still open, and who I need to contact. I can get that far even if I’ve never bought land before or used a crypto wallet.

What I want to feel by the end is simple. **I understand this lot, I know what I still need to find out, and I can tell who is responsible for the next step.**

## The homepage

Take the feeling of a well-designed macOS app. Controls sit where I expect them. Secondary information stays quiet. Typography and spacing tell me what to look at first. The design can feel contemporary through precision and restraint. Flat surfaces, subtle borders, and crisp focus states are enough. Use transparency only where it serves a purpose.

For this draft, the header has **GroundTruth** at the left and **How it works** and **Sign in** at the right. Those are starting points for review. The hero gives the buyer one obvious action.

> **Know the land. Know what comes next.**  
> Address or parcel ID · **Find parcel**

A buyer can start with a property address or a parcel ID. Results should show enough context, such as the county and township where available, to choose the correct lot. Vacant land can lack a street address, so the parcel ID path needs equal care. If the search comes up empty, explain whether the user can refine the query or whether coverage is missing. **Explore a sample parcel** is an optional second path for people arriving without an address.

### The globe

Picture a graphite globe formed from points and fine connections. It rotates slowly. A handful of pulses travel through the lines, suggesting a network of parcels, reviewers, and wallets. I want that moment of *whoa, all of this is connected* before my eyes settle back on the search field.

The globe sits behind or beside the search. A pointer can gently tilt it if that feels natural. Searching and selecting a parcel happens through the search control. Keep the movement subtle enough to type next to. Load the search immediately, keep a static version for reduced motion or slower devices, and keep the globe out of the keyboard tab order when it is decorative.

| Color | Meaning |
| --- | --- |
| Near-black, off-white, and gray | The surface, type, boundaries, and quiet network lines. |
| Gold | A point being viewed or selected. Gold can also lead the primary search action. |
| Green | A completed settlement in the network. On a parcel card, a text label states the specific check that passed. |
| Red | A blocked closing or payout. In the closing view, show the reason and next step in words. |

Keep the globe free of a legend. Its color is atmosphere. Anywhere a buyer has to act, pair color with plain-language status. Start the globe with clearly illustrative activity. If we connect it to real events later, use confirmed, aggregated activity and keep individual parcels, wallet identities, and browsing behavior out of the public animation. [W3C guidance on use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)

## Opening a parcel

I click a result and the globe gives way to a real map. The view settles on the lot with its boundary drawn. Next to it is a compact list of checks for zoning, flood exposure, road access, utilities, easements, and any closing approvals that apply. I can take in the status at a glance and open the evidence without losing my place on the map.

Each check should tell me **what we know, who can confirm it, and what I can do next**. When a record supports an observation, show the source and date. When someone actually signs off, show their role, name where appropriate, and when they signed. When a check is unresolved, name the office or professional to contact and give me a way to reach them when a verified public contact exists.

| Example | What the buyer sees |
| --- | --- |
| **Road access · Needs review** | “The parcel touches a mapped road. Legal access still needs review.” Open the map source or see who to contact about recorded access rights. |
| **Public sewer · Unknown** | “We couldn’t confirm service for this lot.” Show the utility or public-health office that can advise on the next step. |
| **Seller authority · Signed off** | Show the assigned title reviewer’s sign-off, date, and a link to the transaction when that decision was recorded on-chain. |

The parcel page should also distinguish research from an active closing. I can learn about a lot before starting a deal. Once a closing exists, the page should make it easy to get to the balance, the outstanding approvals, and the person who needs to act. A blocked payout needs a clear explanation of what happened and what I can do about it.

### Where the ledger belongs

Use the ledger where there is something worth independently checking, such as a signed closing approval, a hold, or a settlement receipt. A parcel record can link to the responsible agency. A private reviewer can inspect the supporting documents in the app. The closing view can link to the on-chain transaction for the decision or payment. This keeps sensitive evidence private and gives the buyer a way to verify what happened without making them read an explorer to understand the deal.

## What I’d challenge in draft 2

1. **Does the globe earn its space?** The first image gets the quiet layout and color palette right. The globe looks closer to a satellite render than a network built from nodes. I’d make the landmass itself out of points and fine edges, reduce the glowing arcs, and give the search more breathing room. Test whether someone who sees the page for five seconds knows where to start. [Swarms](https://swarms.world/) is a mood reference for the feeling of coordinated activity.
2. **Can someone actually find a vacant lot?** Put the address and parcel ID paths in front of someone who has a county listing, a screenshot, or a lot without a street number. Check how they recover from ambiguous results or missing coverage. That interaction deserves as much design time as the globe.
3. **Can someone tell a record from an approval?** Give the next reviewer a parcel with one sourced finding, one missing record, and one signed approval. Ask them to point to who can act next and explain why. If the cards make those states feel interchangeable, revise the labels and layout.
4. **Does the visual language hold up once money is involved?** Put the landing screen next to a parcel detail and a held closing. Keep the palette consistent while making the buyer’s next action obvious on each screen. The next mockup I’d make is the parcel detail with a real missing check and a visible contact.
5. **What should the phone do first?** Leave its visual design open for draft 2. Start from a different moment: I already know the lot and I’m checking what changed. The phone can lead with the latest closing update and the next action, with room to open the full report when I need it.