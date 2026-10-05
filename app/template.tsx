// Unlike layout.tsx, a template re-mounts on every navigation — that's what
// replays the entrance animation so page changes feel like a transition
// instead of a hard swap.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
