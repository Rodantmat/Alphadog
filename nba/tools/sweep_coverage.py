#!/usr/bin/env python3
"""
sweep_coverage.py - coverage instrumentation for the NBA transcript documentation sweep.

WHAT THIS IS
    The documentation effort reads 20 work transcripts and records everything they
    contain into the 12 mandated nba/NBA_*.md documents.  Until 2026-09-20 there was
    no way to answer two questions:
        1. how much of a transcript is already reflected in the documents?
        2. which parts are not, so they can be read next?
    This tool answers both, deterministically, in seconds.

WHAT IT DOES NOT DO
    It ranks; it never decides.  A high similarity score means "text like this exists
    in the documents" - NOT "the documents understood it correctly".  A segment that is
    mentioned shallowly scores as covered.  Coverage answers "did I read it?", not
    "did I get it right?".  A human judgment pass per transcript remains mandatory;
    see THE LOOP below.

MEASURED RECALL (backtest, 2026-09-20 - reproduce with the `backtest` subcommand)
    Ground truth: the 15 findings in GROUND_TRUTH below, each one something passes
    64-87 identified in T1 as undocumented.  Documents restored to their state at
    pass 63, then scored:
        threshold 0.30 -> 53% recall, 55% of segments to read
        threshold 0.35 -> 87% recall, 67%
        threshold 0.40 -> 100% recall, 78%          <- USE 0.40
    An earlier version scored 73% at 0.30.  The cause was SEGMENTATION, not ranking:
    tool_use inputs were JSON-stringified, so "\\n" hid real paragraph structure and
    loaded blocks were split wrongly.  flatten() below fixes that.  Re-run `backtest`
    after any change to flatten(), segments() or substance().

THE LOOP
    1. python3 nba/tools/sweep_coverage.py score            # whole corpus, ~20s
    2. python3 nba/tools/sweep_coverage.py tails --th 0.40  # per-transcript reading lists
    3. read each tail by stratum (owner -> reasoning -> output -> commands -> results),
       extract findings in bulk, write one consolidated entry per document
    4. ONE JUDGMENT PASS per transcript, in TWO directions, because the score is
       wrong in both:
         (a) HIGH band (>= 0.45) - segments this tool calls covered.  Check the
             documents got them RIGHT, not merely mentioned them.  On T1 this found
             2 defects in 97 segments, both "mentioned but incomplete" - including a
             live credential the documentation had quoted instead of referenced.
         (b) THE TAIL - a measured fraction of it is ALREADY DOCUMENTED and flagged
             uncovered anyway (see FALSE TAIL below).  So the tail question is not
             only "is this new?" but "is this already written up in different words,
             and is that write-up correct?"  A wrong cross-reference is caught here,
             never in the high band.
    5. A transcript is done when THE JUDGMENT PASS IS CLEAN.  Coverage decides what
       to READ; it does not decide when you are finished.  Reading the whole tail is
       necessary and not sufficient - see below for why the number cannot close it.

WHAT "UNCOVERED" ACTUALLY MEASURES - read before quoting any percentage
    doc_paragraphs() iterates DOCS - THE TWELVE MANDATED DOCUMENTS ONLY.  It does not
    read NBA_COMPASS.md, NBA_PROJECT_LOG.md, or the other 18 nba/*.md files.

    That is CORRECT for the task (the job is to get material into the twelve), but it
    means the number does NOT say "nobody has written this down".  It says "this is
    not in the twelve yet".  Material already analysed in COMPASS or PROJECT_LOG needs
    TRANSFER, not DISCOVERY - much cheaper work, and the percentage cannot tell them
    apart.

    MEASURED on the A2/N1 reliability-audit transcript, 2026-09-21:
        uncovered vs the twelve   813/821 = 99.0%
        uncovered vs all 30 *.md  762/821 = 92.8%
        difference                 51 segments = 6.2 points
    Small in segment count - and concentrated in exactly the high-value findings
    (the N1 status probabilities, the A2 held-out MAE table, the OREB k-sweep, the
    per-prop lift table).  So 6.2 points understates the practical effect: the segments
    already written up elsewhere are disproportionately the ones that matter.

    Quote the percentage as "not yet in the twelve".  Never as "undocumented".

STANDING RULES FOR THE READER - adopted 2026-09-21 after four self-corrections in nine passes

    RULE 1. COUNTS ARE EVIDENCE OF OUTCOMES, NEVER OF MECHANISMS.
        This is the most repeated failure mode in the whole sweep - four instances:
          pass 75  three crons read as two, because grep -A2 missed one behind comments
          pass 79  "four red steps", because `skipped` was counted as `failure`
          pass 86  "thirteen polling sleeps", because distinct durations were counted
                   instead of calls
          T3.5     "scheduleLeagueV2 returned both seasons", inferred from a 1400+1266
                   output count - the scraper had been rewritten to loop a seasons list,
                   and that code was three segments further down the same stratum
        A number tells you what happened. It never tells you why. Read the code that
        produced it before describing the mechanism, and if that code is not in hand,
        write the outcome and say the mechanism is unread.

    RULE 2. READ TO THE END OF A STRATUM BEFORE WRITING FINDINGS FROM IT.
        Segments are ordered by SIMILARITY SCORE, not chronology. A worker's first
        draft and its later rewrite sit adjacent in arbitrary order, so a finding
        written from the first half of a stratum can describe a version the transcript
        itself already superseded. Three of the four corrections had this cause.

    RULE 3. A PASS SPLIT ACROSS SESSIONS MARKS ITS ENTRIES **PROVISIONAL**.
        Resolve them in the pass that finishes the stratum. Pass 8 was the first to
        need no corrections after rules 1-3 were adopted.

    RULE 5. AN ENTRY'S ABSENCE IS NOT EVIDENCE THE ISSUE WAS NEVER SEEN.
        T3's differential worker was recorded in these documents as "built but never
        scheduled" - an outcome with no history. In fact T3 flagged it, wrote the
        caveat into NBA_PROJECT_LOG.md, and asked the owner "want me to wire that up
        now, or is this a good place to pause?" A later patch in the SAME SESSION took
        that exact paragraph as its old_str and replaced it with a what's-next list.
        The warning was overwritten, not answered.
        So when a document is silent on something that should obviously have been
        noticed, check whether it was noticed and REMOVED. github_patch_file old_str
        values are the record of what a session deleted, and they are in the tail.
        Corollary: a "next steps" paragraph that replaced something is worth reading
        for what it replaced, not only for what it says.

    RULE 4. REPORT FINDINGS-PER-SEGMENT FOR EVERY TRANSCRIPT.
        Measured so far: T2 closed at 1 per 34; T3 ran at 1 per 6 on the same kind of
        material. That gap was NOT a difference between the transcripts - it was a
        difference in how carefully their command strata were read, and it is why T2
        was reopened. TREAT ANY TRANSCRIPT COMING IN ABOVE ~1-PER-20 AS A SIGNAL THAT
        THE READING WAS SHALLOW, not that the transcript was thin.

THE THREE FALSE-TAIL MECHANISMS - all measured, read all three together
    A segment in the tail is NOT necessarily undocumented.  Three separate mechanisms
    put already-handled material below 0.40, and they compound:

    (0) CONTENT THAT CAN NEVER PROSE-MATCH.  web_search result dumps, verbatim code
        diffs in tool_use inputs, `sleep 90` calls.  On T1 that is ~143 of 309 tail
        segments (46%) - 50 web_search results, 69 code-writing tool calls, 24 bash
        sleeps.  It will never match prose documentation and it never should.  The
        substance filter passes it because search prose IS word-rich; it just is not
        transcript-specific.

    (1) PARAPHRASE vs QUOTATION.  See FALSE TAIL below.  Findings the documents quoted
        verbatim moved +0.39 to +0.55; findings named as a concept in the documents'
        own words moved -0.005 to +0.041.  5 of 15 documented findings stayed in the
        tail.  Pointer-style writing is this taken to its limit, not a separate cause
        (pointer phrases are only 2.8% of document paragraphs).

    (2) THE SCORER READS ONLY THE TWELVE.  See above.  6.2 points on A2/N1, and
        concentrated in the highest-value findings.

    (3) SELF-AUTHORSHIP.  A transcript that WROTE documentation matches that document
        at ~1.00 - because its github_put_file payload IS the file's content - but the
        twelve do not quote those files, so it scores as uncovered forever.  Measured
        on T1: 32 of 309 tail segments (10.4%), 28 of them matching NBA_PROJECT_LOG.md,
        most at exactly 1.00.  ZERO defects possible here: an exact self-match has no
        cross-reference that could point at the wrong place.
        EXPECT THIS TO DOMINATE T20 and T21, the documentation-sweep transcripts,
        whose payloads are these very documents.  Their tails will look enormous and
        will mostly be their own authorship.  Say so in their ledger rows.

FALSE TAIL - measured 2026-09-21, and it is why step 5 changed
    The 15 GROUND_TRUTH findings were undocumented at pass 63 and were written up by
    passes 64-87.  Scored against pass-63 documents vs CURRENT documents:
        mean +0.182, median +0.094
        10/15 crossed 0.40 - the metric CAN see documentation
         5/15 stayed below 0.40 DESPITE being documented
    So "uncovered" does not mean "undocumented".  On this sample a third of correctly
    documented findings sit in the tail permanently.

    WHAT SEPARATES THEM is not pointer-style writing - pointer phrases are only 2.8%
    of document paragraphs.  It is QUOTATION vs PARAPHRASE.  The big movers are
    findings the documents quoted verbatim (get/post invariant +0.548, no job_queue
    +0.507, web_fetch closed loop +0.391).  The non-movers are findings the documents
    named as a concept in their own words (self-identifying UA -0.004, honest failure
    -0.005, WNBA contamination +0.041).  A pointer is just paraphrase taken to its
    limit.

    CONFOUND, stated rather than ignored: the document corpus grew 3,941 -> 5,453
    paragraphs over the same period, and a larger corpus raises max-similarity for
    every segment regardless of content.  Part of the +0.182 mean is that drift.  The
    signal is the SPREAD, not the mean - corpus growth alone would lift all fifteen
    roughly equally, and instead they range from -0.005 to +0.548.

    CAVEAT: n=15, and these were chosen as distinctive strings, so they are not a
    random sample of documented material.  "About a third" is the right strength of
    claim; a precise false-tail rate is not supported by this sample.

USAGE
    index     structural index of every block in every transcript
    score     similarity of every transcript segment to the 12 documents
    tails     write per-transcript reading lists of the uncovered segments
    backtest  re-measure recall against the ground truth in GROUND_TRUTH

REPRODUCIBILITY LIMITATION - READ THIS FIRST
    This tool is committed; THE CORPUS IT OPERATES ON IS NOT.  The 20 transcript
    .txt exports are not in the repository (see the BLOCKER at the top of
    nba/NBA_OPEN_ITEMS.md), so from a clean checkout every subcommand fails until
    --transcripts is pointed at a local copy that only exists outside git.
    As of 2026-09-20 that means only the session that wrote this tool can actually
    run it.  It is NOT reproducible by anyone else yet.  Committing the transcripts
    - redacted, per the credential findings in the same BLOCKER - is what makes it so.

Additive, NBA-only, read-only: this tool never writes to the database, never deploys,
and never modifies a transcript or an MLB file.
"""
import argparse, json, os, re, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
DOC_DIR_DEFAULT = os.path.join(REPO, 'nba')
TRANSCRIPT_DIR_DEFAULT = os.path.join(REPO, 'nba', 'transcripts')

DOCS = ['NBA_MASTER_SUMMARY.md', 'NBA_GLOSSARY.md', 'NBA_RECIPE.md',
        'NBA_SYSTEM_ARCHITECTURE.md', 'NBA_DATABASE.md', 'NBA_WORKERS.md',
        'NBA_SYSTEM_DESIGN.md', 'NBA_OPEN_ITEMS.md', 'NBA_BASELINE_CALIBRATION.md',
        'NBA_FINAL_SCORING_CALIBRATION.md', 'NBA_MULTIPLIERS.md', 'NBA_GOBLIN_DEMON.md']

STRATA = {('human', 'text'): 'OWNER SAID',
          ('assistant', 'thinking'): 'ASSISTANT REASONING',
          ('assistant', 'text'): 'ASSISTANT OUTPUT',
          ('assistant', 'tool_use'): 'COMMANDS RUN',
          ('assistant', 'tool_result'): 'RESULTS RETURNED'}
STRATUM_ORDER = [('human', 'text'), ('assistant', 'thinking'), ('assistant', 'text'),
                 ('assistant', 'tool_use'), ('assistant', 'tool_result')]

HEX = re.compile(r'\b[0-9a-f]{16,}\b')
RECEIPT = re.compile(r'"(ok|status|commit sha|file sha|note)"\s*:')


# ---------------------------------------------------------------- normalisation
def norm(s):
    """Lowercase and strip markdown furniture and dash/width variants.

    Character n-grams over this are immune to the bold/case/en-dash differences
    that made naive phrase matching produce false misses (the 'pass 55' failure,
    where 26 of 26 sampled phrases were reported missing because the documents
    re-case and re-bold quoted text)."""
    s = s.lower()
    s = re.sub(r'[`*_#>|\[\]()]', ' ', s)
    s = re.sub(r'[‐-―−-]', '-', s)
    s = re.sub(r'\s+', ' ', s)
    return s.strip()


def substance(t):
    """0..1 - prose/knowledge vs machine receipt.

    Commit SHAs and HTTP envelopes are genuinely uncovered and genuinely not worth
    reading; without this filter they dominate the low-similarity tail."""
    if not t:
        return 0.0
    n = len(t)
    hexy = sum(len(m.group()) for m in HEX.finditer(t)) / n
    digits = sum(c.isdigit() for c in t) / n
    wordfrac = sum(len(w) for w in re.findall(r'[a-z]{3,}', t)) / n
    receipts = 1.0 if RECEIPT.search(t) and n < 1200 else 0.0
    return max(0.0, min(1.0, wordfrac - hexy - 0.5 * max(0, digits - 0.15) - 0.8 * receipts))


# ---------------------------------------------------------------- transcript parsing
def flatten(b):
    """Block -> real text with newlines intact.

    CRITICAL: tool_use inputs are rendered key-by-key with real newlines rather than
    json.dumps().  Stringifying them escaped every newline, which hid paragraph
    structure and cost 27 points of recall in the first backtest."""
    t = b.get('type')
    if t == 'text':
        return b.get('text') or ''
    if t == 'thinking':
        return b.get('thinking') or ''
    if t == 'tool_use':
        inp = b.get('input') or {}
        return "\n".join(f"{k}:\n{v}" if isinstance(v, str) else f"{k}: {json.dumps(v)}"
                         for k, v in inp.items())
    if t == 'tool_result':
        c = b.get('content')
        if isinstance(c, list):
            return "\n".join(x.get('text', '') for x in c if isinstance(x, dict))
        return str(c or '')
    return ''


def parse_turns(path):
    raw = open(path, encoding='utf-8', errors='replace').read()
    for chunk in re.split(r'\n=+\n', raw):
        i = chunk.find('[')
        if i < 0:
            continue
        role = 'human' if 'Human:' in chunk[:i] else 'assistant'
        try:
            obj = json.loads(chunk[i:].strip())
        except Exception:
            continue
        if isinstance(obj, list):
            yield role, obj


def segments(path, min_chars=60, window=1800):
    """Transcript -> scoreable segments, packing short paragraphs into windows."""
    out = []
    for role, obj in parse_turns(path):
        for b in obj:
            if not isinstance(b, dict):
                continue
            body = flatten(b)
            if not body:
                continue
            tool = str(b.get('name')).split(':')[-1] if b.get('name') else None
            buf = ""
            for p in re.split(r'\n\s*\n', body) + [None]:
                if p is None or (buf and len(buf) + len(p) > window):
                    n = norm(buf)
                    if len(n) >= min_chars:
                        out.append({'role': role, 'type': b.get('type'), 'tool': tool,
                                    'text': n[:4000], 'sub': substance(n)})
                    buf = p or ""
                else:
                    buf = (buf + "\n\n" + p) if buf else p
    return out


def doc_paragraphs(doc_dir):
    segs = []
    for d in DOCS:
        p = os.path.join(doc_dir, d)
        if not os.path.exists(p):
            print(f"  warning: missing document {d}", file=sys.stderr)
            continue
        for para in re.split(r'\n\s*\n', open(p, encoding='utf-8').read()):
            n = norm(para)
            if len(n) >= 60:
                segs.append(n)
    return segs


# ---------------------------------------------------------------- scoring
def score_all(transcript_dir, doc_dir, sub_min=0.40):
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import linear_kernel
    import numpy as np

    docs = doc_paragraphs(doc_dir)
    files = sorted(f for f in os.listdir(transcript_dir) if f.endswith('.txt') and f[0].isdigit())
    if not files:
        sys.exit(f"no transcripts found in {transcript_dir}\n"
                 "(the 20 .txt exports are not committed - see the BLOCKER at the top of "
                 "nba/NBA_OPEN_ITEMS.md; point --transcripts at a local copy)")
    allsegs = []
    for f in files:
        for s in segments(os.path.join(transcript_dir, f)):
            s['t'] = f
            allsegs.append(s)

    vec = TfidfVectorizer(analyzer='char_wb', ngram_range=(4, 5), min_df=3,
                          max_features=400000, sublinear_tf=True)
    X = vec.fit_transform(docs + [s['text'] for s in allsegs])
    D, S = X[:len(docs)], X[len(docs):]
    best = np.zeros(S.shape[0])
    for i in range(0, S.shape[0], 400):
        best[i:i + 400] = linear_kernel(S[i:i + 400], D).max(axis=1)
    for s, b in zip(allsegs, best):
        s['score'] = float(b)
    return docs, [s for s in allsegs if s['sub'] >= sub_min], allsegs


# ---------------------------------------------------------------- commands
def cmd_index(a):
    files = sorted(f for f in os.listdir(a.transcripts) if f.endswith('.txt') and f[0].isdigit())
    rows, tot = [], 0
    print(f"{'transcript':<60}{'blocks':>8}{'text':>7}{'think':>7}{'use':>7}{'result':>8}")
    for f in files:
        c = collections.Counter()
        n = 0
        for role, obj in parse_turns(os.path.join(a.transcripts, f)):
            for b in obj:
                if isinstance(b, dict):
                    c[b.get('type')] += 1
                    n += 1
        tot += n
        rows.append({'transcript': f, 'blocks': n, **{k: c[k] for k in
                     ('text', 'thinking', 'tool_use', 'tool_result')}})
        print(f"{f[:59]:<60}{n:>8}{c['text']:>7}{c['thinking']:>7}{c['tool_use']:>7}{c['tool_result']:>8}")
    print(f"\nTOTAL BLOCKS: {tot:,} across {len(files)} transcripts")
    if a.out:
        json.dump(rows, open(a.out, 'w'), indent=1)
        print(f"written {a.out}")


def cmd_score(a):
    import numpy as np
    docs, rich, allsegs = score_all(a.transcripts, a.docs)
    print(f"document paragraphs {len(docs):,} | segments {len(allsegs):,} | "
          f"substantive {len(rich):,} (machine-noise dropped {len(allsegs)-len(rich):,})\n")
    print("=== BY STRATUM ===")
    print(f"{'stratum':<22}{'segs':>7}{'median':>9}{'uncovered':>11}{'%':>7}")
    by = collections.defaultdict(list)
    for s in rich:
        by[STRATA.get((s['role'], s['type']), 'other')].append(s['score'])
    for k in [STRATA[x] for x in STRATUM_ORDER] + ['other']:
        v = by.get(k) or []
        if not v:
            continue
        arr = np.array(v); n = int((arr < a.th).sum())
        print(f"{k:<22}{len(v):>7}{np.median(arr):>9.3f}{n:>11}{100*n/len(v):>6.1f}%")
    print("\n=== BY TRANSCRIPT (read in this order: most uncovered last) ===")
    print(f"{'transcript':<56}{'segs':>6}{'median':>8}{'unc':>7}{'%':>7}")
    byt = collections.defaultdict(list)
    for s in rich:
        byt[s['t']].append(s['score'])
    rows = []
    for fn in byt:
        arr = np.array(byt[fn]); n = int((arr < a.th).sum())
        rows.append((fn, len(arr), float(np.median(arr)), n, 100 * n / len(arr)))
    for r in sorted(rows, key=lambda r: r[4]):
        print(f"{r[0][:55]:<56}{r[1]:>6}{r[2]:>8.3f}{r[3]:>7}{r[4]:>6.1f}%")
    tot = sum(r[3] for r in rows)
    print(f"\nUNCOVERED below {a.th}: {tot:,} of {len(rich):,} ({100*tot/len(rich):.1f}%)")
    json.dump([{k: s[k] for k in ('t', 'role', 'type', 'tool', 'score', 'sub', 'text')}
               for s in rich], open(a.out, 'w'))
    print(f"scored segments -> {a.out}")


def cmd_tails(a):
    segs = json.load(open(a.scored))
    by = collections.defaultdict(list)
    for s in segs:
        if s['score'] < a.th:
            by[s['t']].append(s)
    os.makedirs(a.outdir, exist_ok=True)
    for t, rows in sorted(by.items()):
        rows.sort(key=lambda s: (STRATUM_ORDER.index((s['role'], s['type']))
                                 if (s['role'], s['type']) in STRATUM_ORDER else 9, s['score']))
        p = os.path.join(a.outdir, t.replace('.txt', '') + '.tail.md')
        with open(p, 'w') as f:
            f.write(f"# UNCOVERED SEGMENTS - {t}\n\n{len(rows)} substantive segments below "
                    f"{a.th} similarity against the 12 documents.\n"
                    "Read by stratum, top to bottom. Extract findings in bulk.\n"
                    "REMEMBER: a high score means 'text like this exists in the docs', not\n"
                    "'the docs got it right' - the judgment pass still applies.\n")
            cur = None
            for s in rows:
                k = (s['role'], s['type'])
                if k != cur:
                    cur = k
                    f.write(f"\n## {STRATA.get(k, str(k))}\n\n")
                tool = f" [{s['tool']}]" if s['tool'] else ""
                f.write(f"- (sim {s['score']:.2f}){tool} {s['text'][:1200]}\n")
        print(f"{len(rows):>5} segs  {os.path.basename(p)}")


# Ground truth for the backtest: distinctive strings from findings that passes 64-87
# identified in T1 as undocumented. Add to this list as later passes find more.
GROUND_TRUTH = [
    ("p65 arena deferral", "defer arena assignment to a dedicated verification pass"),
    ("p65 effort budget", "given the low reasoning effort"),
    ("p65 additive judgement", "tolerance for minor changes as long as mlb isn't disrupted"),
    ("p65 no job_queue", "the mlb version exists specifically to support orchestrator dispatch"),
    ("p65 tool schema frozen", "my tool schema was fixed at the start of this conversation"),
    ("p77 handoff nba_control", "worker run log , job runs - own run history"),
    ("p79 tarpit ladder", "attempt 1/3 failed (proxy=yes)"),
    ("p82 wnba contamination", "toronto tempo"),
    ("p82 web_fetch closed loop", "this url was not in any prior search or fetch result"),
    ("p83 skip ci origin", "update nba teams json  skip ci"),
    ("p84 self-identifying ua", "alphadog-nba-staticteams"),
    ("p85 trigger_reason", "trigger reason:"),
    ("p85 proxy shared", "same secret mlb's prizepicks scraper uses"),
    ("p86 honest failure", "still gets committed"),
    ("p87 get post invariant", "body === null ?"),
]


def cmd_backtest(a):
    """Recall against GROUND_TRUTH using a chosen document snapshot.

    To reproduce the 2026-09-20 result, restore the pass-63 documents first:
        mkdir /tmp/docs63
        for d in nba/NBA_*.md; do git show <pass63-sha>:$d > /tmp/docs63/$(basename $d); done
        sweep_coverage.py backtest --docs /tmp/docs63 --transcript <T1 path>
    """
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import linear_kernel
    import numpy as np

    docs = doc_paragraphs(a.docs)
    segs = segments(a.transcript)
    vec = TfidfVectorizer(analyzer='char_wb', ngram_range=(4, 5), min_df=2,
                          max_features=300000, sublinear_tf=True)
    X = vec.fit_transform(docs + [s['text'] for s in segs])
    D, S = X[:len(docs)], X[len(docs):]
    best = np.zeros(S.shape[0])
    for i in range(0, S.shape[0], 200):
        best[i:i + 200] = linear_kernel(S[i:i + 200], D).max(axis=1)
    for s, b in zip(segs, best):
        s['score'] = float(b)
    rich = [s for s in segs if s['sub'] >= 0.40]
    print(f"doc paragraphs {len(docs):,} | segments {len(segs):,} | substantive {len(rich):,}\n")

    found = {}
    for label, needle in GROUND_TRUTH:
        n = norm(needle)
        c = [s for s in rich if n in s['text']]
        found[label] = min(c, key=lambda s: s['score'])['score'] if c else None
    absent = [l for l, v in found.items() if v is None]
    if absent:
        print("NOT LOCATED AS SEGMENTS (segmentation leak - investigate flatten()):")
        for l in absent:
            print("   ", l)
        print()
    present = [v for v in found.values() if v is not None]
    print(f"{'threshold':>10}{'recall':>9}{'to read':>10}{'workload':>10}")
    for th in (0.25, 0.30, 0.35, 0.40, 0.45, 0.50):
        rec = sum(1 for v in present if v < th) / len(present)
        n = sum(1 for s in rich if s['score'] < th)
        flag = "  <- 100% recall" if rec == 1.0 else ""
        print(f"{th:>10.2f}{100*rec:>8.0f}%{n:>10}{100*n/len(rich):>9.0f}%{flag}")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest='cmd', required=True)

    p = sp.add_parser('index'); p.set_defaults(fn=cmd_index)
    p.add_argument('--transcripts', default=TRANSCRIPT_DIR_DEFAULT)
    p.add_argument('--out', default='')

    p = sp.add_parser('score'); p.set_defaults(fn=cmd_score)
    p.add_argument('--transcripts', default=TRANSCRIPT_DIR_DEFAULT)
    p.add_argument('--docs', default=DOC_DIR_DEFAULT)
    p.add_argument('--th', type=float, default=0.40)
    p.add_argument('--out', default='scored.json')

    p = sp.add_parser('tails'); p.set_defaults(fn=cmd_tails)
    p.add_argument('--scored', default='scored.json')
    p.add_argument('--outdir', default='tails')
    p.add_argument('--th', type=float, default=0.40)

    p = sp.add_parser('backtest'); p.set_defaults(fn=cmd_backtest)
    p.add_argument('--docs', required=True, help='directory of the 12 documents to test against')
    p.add_argument('--transcript', required=True)

    a = ap.parse_args()
    a.fn(a)


if __name__ == '__main__':
    main()
