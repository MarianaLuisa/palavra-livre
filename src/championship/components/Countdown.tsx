import { formatCountdown } from "../format";

type CountdownProps = {
  remainingMs: number;
  label: string;
  hint?: string;
};

export function Countdown({ remainingMs, label, hint }: CountdownProps) {
  const finished = remainingMs <= 0;

  return (
    <div className="countdown" role="timer" aria-live="polite">
      <span className="countdown-label">{label}</span>
      <strong className={finished ? "countdown-value finished" : "countdown-value"}>
        {finished ? "00:00" : formatCountdown(remainingMs)}
      </strong>
      {hint !== undefined ? <small className="countdown-hint">{hint}</small> : null}
    </div>
  );
}
