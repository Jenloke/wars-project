import {
  commanderProfile,
  describeCommander,
  ruleset as rawRuleset,
  type ChargePace,
  type CommanderSummary,
} from '@tactics/content';

const PACE_PIPS: Readonly<Record<ChargePace, number>> = { fast: 3, steady: 2, slow: 1, none: 0 };
const PACE_WORDS: Readonly<Record<ChargePace, string>> = {
  fast: 'fast',
  steady: 'steady',
  slow: 'slow',
  none: 'not at all',
};

const summaries = new Map<string, CommanderSummary>();

/** What a commander does, described from its rules data. Cached per commander. */
export function summaryOf(commander: string): CommanderSummary {
  let summary = summaries.get(commander);
  if (summary === undefined) {
    summary = describeCommander(rawRuleset, commander);
    summaries.set(commander, summary);
  }
  return summary;
}

interface CommanderDetailsProps {
  readonly commander: string;
  /** Army name and accent colour, as this commander would play in the game being set up. */
  readonly army: string;
  readonly color: string;
}

/** A commander's briefing: who they are, their innate ability, power and meter. */
export function CommanderDetails({ commander, army, color }: CommanderDetailsProps) {
  const profile = commanderProfile(commander);
  const summary = summaryOf(commander);
  const { power } = summary;
  return (
    <article className="commander-details" style={{ borderColor: color }} aria-live="polite">
      <header>
        <h3>{summary.name}</h3>
        <p className="muted">
          {profile.title} · <span style={{ color }}>{army}</span>
        </p>
      </header>
      <p className="commander-bio">{profile.bio}</p>
      <div className="commander-abilities">
        <section>
          <h4>
            Innate
            {profile.innate !== undefined && <span className="muted"> · {profile.innate}</span>}
          </h4>
          {summary.innate.length === 0 ? (
            <p className="muted">None</p>
          ) : (
            <ul>
              {summary.innate.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h4>
            Power
            {power !== null && (
              <span className="muted">
                {' '}
                · {power.name} · {power.cost.toLocaleString()} charge
              </span>
            )}
          </h4>
          {power === null ? (
            <p className="muted">None</p>
          ) : (
            <ul>
              {power.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
              <li className="muted">Lasts until your next turn</li>
            </ul>
          )}
        </section>
        {power !== null && (
          <section>
            <h4>Meter fills from</h4>
            <ul className="charge-list">
              {summary.charge.map((line) => (
                <li key={line.source} className={`pace-${line.pace}`}>
                  <span>{line.label}</span>
                  <span
                    className="pace"
                    role="img"
                    aria-label={PACE_WORDS[line.pace]}
                    title={PACE_WORDS[line.pace]}
                  >
                    {[1, 2, 3].map((pip) => (
                      <span
                        key={pip}
                        className="pace-pip"
                        style={pip <= PACE_PIPS[line.pace] ? { background: color } : undefined}
                      />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </article>
  );
}
