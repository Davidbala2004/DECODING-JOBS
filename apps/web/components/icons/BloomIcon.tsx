/**
 * The AI Assistant nav mark — a 5-petal bloom with a small neural-node
 * cluster at its center, in the same spirit as the vaagaivision.ai
 * reference mark the user shared (flower silhouette + circuit nodes
 * converging on one core point), redrawn in the app's own green and sized
 * for an 18px nav icon instead of a large logo mark.
 *
 * The center node pulses (Tailwind's animate-pulse) so it reads as
 * "live/thinking," matching the pulse already used elsewhere in the app
 * for "hiring now" indicators — same animation language, not a new one.
 */

const PETAL_ANGLES = [0, 72, 144, 216, 288];

function Petal({ angle }: { angle: number }) {
  return (
    <path
      d="M12,12 C8.3,10.2 8,6.3 12,3 C16,6.3 15.7,10.2 12,12 Z"
      transform={`rotate(${angle} 12 12)`}
      fill="none"
    />
  );
}

export function BloomIcon({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      stroke="currentColor"
      strokeWidth={active ? 1.5 : 1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PETAL_ANGLES.map((angle) => (
        <Petal key={angle} angle={angle} />
      ))}

      {/* Compact neural-node cluster at the core, branching toward the
          upper petals only (matches the reference's density) rather than
          one branch per petal, which would turn to mud at 18px. */}
      <g strokeWidth="1">
        <line x1="12" y1="12" x2="12" y2="7.8" />
        <line x1="12" y1="12" x2="9" y2="9" />
        <line x1="12" y1="12" x2="15" y2="9" />
        <circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="9" cy="9" r="0.75" fill="currentColor" stroke="none" />
        <circle cx="15" cy="9" r="0.75" fill="currentColor" stroke="none" />
      </g>

      {/* Always pulses, not just when active — this is the "alive/thinking"
          signal the mark exists to give, not a selected-state indicator. */}
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" className="animate-pulse" />
    </svg>
  );
}
