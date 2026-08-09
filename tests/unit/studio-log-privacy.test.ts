import { parseStudioLog, parseStudioLogLine } from '../../src/studio/logline.js';
import {
  publishStudioText,
  screenLine,
  screenStudioLog,
  withheldAny,
} from '../../src/studio/privacy.js';

const OWN = ['mytest0', 'mytest1'];

const LOG = [
  '20/06 21:50:56 [info] [T403] [4/mytest0] /cinco/cinco/exchange4Cards.html?id=4&table=403&testuser=4',
  '20/06 21:50:56 [notice] [T403] [4/mytest0] OK-0 169 d141 c8 e0 I9 A158 V0 T0',
  "20/06 21:50:57 [info] [T403] [5/mytest1] 0.26 SELECT player_tokenColor FROM player WHERE player_id ='5'",
  '20/06 21:51:02 [info] [T998] [77/RealPlayer] /cinco/cinco/playCard.html?id=77',
  'something that is not a log line at all',
].join('\n');

describe('studio log lines', () => {
  it('[UNIT-STUDIO-LOG-PARSE] reads the documented shape, including the actor', () => {
    const line = parseStudioLogLine(
      "20/06 21:50:56 [info] [T403] [4/mytest0] 0.26 SELECT player_tokenColor FROM player WHERE player_id ='4'",
    );
    expect(line).toMatchObject({
      timestamp: '20/06 21:50:56',
      level: 'info',
      tableId: '403',
      actorId: '4',
      actorName: 'mytest0',
    });
    expect(line.message).toContain('SELECT player_tokenColor');
  });

  it('[UNIT-STUDIO-LOG-PARSE] keeps a line it cannot read, with no actor', () => {
    const line = parseStudioLogLine('PHP Fatal error: something exploded');
    // Unparseable is not discarded, because the screening rule must still see
    // it — and it has no actor, which is what makes it unattributable.
    expect(line.actorName).toBeNull();
    expect(line.raw).toContain('PHP Fatal error');
    expect(parseStudioLog(LOG)).toHaveLength(5);
  });
});

describe('studio log privacy screen', () => {
  it('[UNIT-STUDIO-LOG-PRIVACY] keeps only lines about the developer own accounts', () => {
    const result = screenStudioLog(parseStudioLog(LOG), OWN);

    expect(result.kept.map((line) => line.actorName)).toEqual(['mytest0', 'mytest0', 'mytest1']);
    // A real player's line is withheld entirely, not redacted and returned: a
    // partially scrubbed line about a stranger is still a line about a stranger.
    expect(result.withheld.foreign).toBe(1);
    expect(result.withheld.unattributable).toBe(1);
    expect(withheldAny(result)).toBe(true);
    expect(JSON.stringify(result.kept)).not.toContain('RealPlayer');
  });

  it('[UNIT-STUDIO-LOG-PRIVACY] returns nothing when it cannot tell what is yours', () => {
    // No declared accounts means no way to distinguish, and the guarantee is
    // "only your own data", so the honest answer is nothing.
    const result = screenStudioLog(parseStudioLog(LOG), []);
    expect(result.kept).toEqual([]);
    expect(result.withheld.foreign).toBe(4);
  });

  it('[UNIT-STUDIO-LOG-PRIVACY] never returns a credential or an address, even the developer own', () => {
    const withLock = parseStudioLogLine(
      '20/06 21:50:56 [info] [T403] [4/mytest0] /cinco/exchange.html?lock=97d1c7a1-903a-4d1f-8206-de39ce8204fc',
    );
    expect(screenLine(withLock, OWN)).toBe('sensitive');

    const withEmail = parseStudioLogLine(
      '20/06 21:50:56 [info] [T403] [4/mytest0] contact dev@example.com about this',
    );
    expect(screenLine(withEmail, OWN)).toBe('sensitive');

    const session = parseStudioLogLine('20/06 21:50:56 [info] [T403] [4/mytest0] PHPSESSID abc123');
    expect(screenLine(session, OWN)).toBe('sensitive');
  });

  it('[UNIT-STUDIO-PUBLISH-SCREEN] keeps every withheld value, so publication can prove it left', () => {
    const result = screenStudioLog(parseStudioLog(LOG), OWN);

    // The screen decides; this is what lets the publication boundary check that
    // the decision survived being formatted into a sentence.
    expect(result.withheldValues).toContain('RealPlayer');
    expect(result.withheldValues.some((value) => value.includes('playCard.html'))).toBe(true);
    expect(result.withheldValues.some((value) => value.includes('mytest0'))).toBe(false);
  });

  it('[UNIT-STUDIO-PUBLISH-SCREEN] removes a withheld value from any text about to be published', () => {
    const result = screenStudioLog(parseStudioLog(LOG), OWN);
    const leaky = 'The page shows lines for: RealPlayer. Check --studio-dev-account.';

    const published = publishStudioText(leaky, result.withheldValues);
    expect(published).not.toContain('RealPlayer');
    expect(published).toContain('[withheld]');
    // The rest of the sentence still says what to do about it.
    expect(published).toContain('--studio-dev-account');
  });

  it('[UNIT-STUDIO-PUBLISH-SCREEN] removes a whole withheld line rather than its name alone', () => {
    const foreign = '20/06 21:51:02 [info] [T998] [77/RealPlayer] /cinco/cinco/playCard.html?id=77';
    const result = screenStudioLog(parseStudioLog(foreign), OWN);

    // Replacing the shortest match first would leave the surrounding line
    // behind, which is the leak with the name filed off.
    const published = publishStudioText(`saw: ${foreign}`, result.withheldValues);
    expect(published).toBe('saw: [withheld]');
  });

  it('[UNIT-STUDIO-PUBLISH-SCREEN] leaves text alone when nothing was withheld', () => {
    const own = '20/06 21:50:56 [info] [T403] [4/mytest0] OK-0 169';
    const result = screenStudioLog(parseStudioLog(own), OWN);

    expect(result.withheldValues).toEqual([]);
    expect(publishStudioText(own, result.withheldValues)).toBe(own);
  });

  it('[UNIT-STUDIO-LOG-PRIVACY] matches an account name exactly, not by prefix', () => {
    const impostor = parseStudioLogLine(
      '20/06 21:50:56 [info] [T403] [9/mytest0evil] /cinco/play.html',
    );
    // mytest0evil is not mytest0. A prefix match here would hand over a
    // stranger's line to anyone who picked a similar name.
    expect(screenLine(impostor, OWN)).toBe('foreign');
    expect(screenLine(parseStudioLogLine('20/06 21:50:56 [info] [T403] [4/MyTest0] x'), OWN)).toBe(
      'own',
    );
  });
});
