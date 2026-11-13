import type { QuestionIconName } from "../content/home";

/** Small line icons for the three buyer questions. Decorative. */
export function QuestionIcon({ name }: { name: QuestionIconName }) {
  return (
    <svg
      className="question-icon"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {name === "parcel" ? (
        <>
          {/* A lot, and a road that stops short of it. */}
          <path d="M8 6.5 17.5 4l3 9.5-10 4z" />
          <path d="M2.5 21.5 7 17" strokeDasharray="2 2.5" />
        </>
      ) : null}
      {name === "seller" ? (
        <>
          {/* A person whose authority still needs a check. */}
          <circle cx="10" cy="8" r="3.25" />
          <path d="M3.75 19.5c.6-3.4 3.1-5.25 6.25-5.25 1.15 0 2.2.25 3.1.7" />
          <path d="m14.75 18 2 2 3.75-4.25" />
        </>
      ) : null}
      {name === "escrow" ? (
        <>
          {/* Funds locked until the conditions are met. */}
          <rect x="5" y="10.5" width="14" height="9.5" rx="1.5" />
          <path d="M8.25 10.5V8a3.75 3.75 0 0 1 7.5 0v2.5" />
          <path d="M12 14.25v2.25" />
        </>
      ) : null}
    </svg>
  );
}
