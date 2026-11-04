# Reevo 2 — Piano Detection Engine: End-to-End Implementation Plan

Oct 22, 2026 · @sumit

## 1. Scope, decisions and success targets

Reevo 2 is one microphone-only engine for acoustic pianos and digital keyboards on iOS and Android. It keeps Reevo's structure, replaces its scoring core, and runs DSP, neural or both from one configuration.

### Decisions fixed in the discussion

| Topic | Decision | Reason |
| --- | --- | --- |
| Instruments | Acoustic pianos (88 keys) and digital keyboards through their own speakers. First device: Yamaha PSR-E343 (61 keys, C2–C7, MIDI 36–96) | User scope |
| Input | Microphone only. MIDI is used only in the lab, as ground truth | User scope |
| Platforms | iOS (minimum iPhone 13 Pro Max) and Android (minimum device still open). Built for both from the start; tested on iOS first | User scope |
| Engine scope | One full-size engine that listens to every key the instrument has. "Two octaves around middle C" is a lesson focus setting, not a separate engine | Every note's overtones span 3+ octaves, so a model with missing keys produces ghost notes (2.8) |
| Base | New evidence core inside Reevo's structure, on v1.2's proven capture code. v1.2 stays selectable as a legacy engine until the new one beats it | Both older scoring cores fail the maths (2.2) |
| Engine package | CoreEngine, a local native package in the app repository (packages/CoreEngine/), holds everything detection-related: the C++ core, its bindings, the iOS and Android audio code and the TypeScript API. It exports data and commands, never UI | Its C++ core still builds alone for the desktop harness (5.6) and Python (14.3); the app's screens wire it to the UI |
| Modes | Learning (no backing), Practice (30-second backing song; first song: Jingle Bells chorus), Free play. In the app they run as GuidedLesson, PracticeLesson and Free2Play | User scope |
| Grading | Right key first, then timing. Dynamics and note length optional. All declared in the configuration | User priority |
| Engines | DSP, neural, fused or legacy, chosen by one switch; all share one decision layer | Fair comparison and a safe fallback |
| Use | Personal and non-commercial | MAESTRO (CC BY-NC-SA 4.0) may be used for training; IDMT-PIANO-MM (CC BY-NC-ND 4.0, for evaluation) is used as a test set |

Note names use scientific pitch: middle C = C4 = MIDI 60 = 261.63 Hz (Yamaha manuals call it C3). Key index k = MIDI − 21, so A0 = 0 and C8 = 87.

### Success targets (release gates)

These are proposals. Phase 0 measures the baseline and Phase 8 confirms or adjusts them.

| Metric | Gate | Where the number comes from |
| --- | --- | --- |
| Notes detected, mf, phone ≤ 1 m, quiet room | ≥ 97% in every register | Checkable with ≥ 300 notes per register × loudness cell (±2% at 95% confidence) |
| False notes, quiet room | ≤ 6 per hour | Sets the detection threshold h = 16.1 nats for 88 keys (2.4) |
| Wrong-note reports that are themselves wrong (lessons) | ≤ 1 per 100 correctly played notes | Telling a student they were wrong when they were right costs more than missing one slip (11.1) |
| ±1-semitone mistakes caught (lessons) | ≥ 95% | The most common beginner mistake |
| Timestamp error against ground truth | 95th percentile ≤ 10 ms | One fifth of the strictest grading tolerance (±50 ms) |
| Time until the note shows on screen, mf and louder | 95th percentile ≤ 25 ms treble, ≤ 50 ms middle, ≤ 100 ms deep bass | How long each analysis window takes to fill (2.3). Softer notes without a hammer click, and simultaneous octaves, take longer (2.4, 2.8) |
| DSP processing time | 99th percentile ≤ 2 ms per 5.33 ms hop | 37% of the hop, leaving room for the neural thread |

Physics rules out perfection in four places. These are not graded, or are graded with a stated limit:

- Key release under the sustain pedal, and on keys without dampers.
- Key release where the room's echo decays as fast as the string itself.
- A much softer octave, twelfth or double octave struck at the same instant as its lower note, when both end before their shared partials complete one beat (2.8). In lessons it is graded as unclear, never as missed.
- Zero misses together with zero false notes (Neyman–Pearson: when signal and noise overlap, lowering one raises the other).

## 2. Mathematical foundations

Ten results decide every design choice in this plan. Each subsection ends with the decision it forces, and later phases point back here. Numbers in brackets, such as (9.3), point to a section and subsection of this plan.

### 2.1 What a piano note is

A struck string produces partials stretched sharp by the string's stiffness (Fletcher's law). Each key's tuning also carries its own offset in cents.

```latex
f_{k,h} = h\,f_0(k)\,\sqrt{1 + B_k\,h^2}, \qquad f_0(k) = f_{A4}\,2^{(m_k - 69 + c_k/100)/12}
```

For small B × h², partial h is stretched by about 865.6 × B × h² cents. With B = 4 × 10⁻⁴, partial 10 sits 34 cents sharp of 10 × f0, a third of the way to the next key.

**Decision:** every key is scored at its calibrated partial frequencies, never at whole-number multiples of f0.

### 2.2 Time–frequency limits

Neighbouring keys are 5.95% apart in frequency (2^(1/12) − 1). A Hann window's main lobe spans 2 bins either side, so two simultaneous tones closer than about 2/T cannot be separated by energy. One tone's frequency, however, can be measured far more finely (Cramér–Rao bound):

```latex
\sigma_f \;\ge\; \sqrt{\frac{12\,f_s^2}{(2\pi)^2\,\mathrm{SNR}\;N\,(N^2-1)}}
```

| Tier | N | Window | Bin | σ\_f at 20 dB SNR | Lowest key: gap to its neighbour |
| --- | --- | --- | --- | --- | --- |
| Treble (G4–C8) | 1024 | 21.3 ms | 46.9 Hz | 0.081 Hz | G4: 23.3 Hz = 289 σ |
| Middle (F♯2–F♯4) | 2048 | 42.7 ms | 23.4 Hz | 0.029 Hz | F♯2: 5.5 Hz = 193 σ |
| Bass (A0–F2) | 4096 | 85.3 ms | 11.7 Hz | 0.010 Hz | A0: 1.64 Hz = 162 σ |
| Bass refinement | 8192 | 170.7 ms | 5.9 Hz | 0.004 Hz | A0: 1.64 Hz = 458 σ |

In energy, the same neighbours sit 0.14–0.5 bins apart below G6, and A0 beats A♯0 by just 0.1 dB under Reevo's scoring rule. Energy separates A0 from A♯0 only from partial 15 up with N = 4096, or from partial 8 up with N = 8192.

**Decision:** a note is identified by the measured frequencies of its partials. Simultaneous neighbours are separated by the joint model (9.3) plus the 8192 refinement for A0–B1. Energy-at-bin scoring is retired.

### 2.3 How fast a window sees a new note

A window ending now weighs the newest samples by its right edge. A Hann window reaches half amplitude (−6 dB) for a new note only after N/2 samples. A low-delay window (the left half of a long Hann joined to a 256-sample right taper) gets there sooner but leaks more into distant bins.

| N | Hann: −6 dB after | Low-delay: −6 dB after | Hann leakage beyond 8 bins | Low-delay leakage beyond 8 bins |
| --- | --- | --- | --- | --- |
| 1024 | 10.7 ms | 8.1 ms | −65 dB | −52 dB |
| 2048 | 21.3 ms | 13.7 ms | −65 dB | −38 dB |
| 4096 | 42.7 ms | 25.0 ms | −65 dB | −30 dB |

Both windows keep about the same main lobe (2 bins full width at −6 dB). The low-delay window costs 13–35 dB of masking range, which matters for soft notes beside loud ones.

**Decision:** in the 2048 and 4096 tiers, both frames are computed every hop. Low-delay frames give the first detection (7.6 ms and 17.7 ms sooner); Hann frames confirm, track and resolve chords. The 1024 tier uses Hann only, because the low-delay version saves just 2.6 ms.

### 2.4 Thresholds from a false-alarm budget

Each key runs a CUSUM test on its log-likelihood ratio λ, measured in nats (9.9). For a given false-alarm rate, no detector reacts faster on average (Lorden; Moustakides).

```latex
S_t = \max(0,\; S_{t-1} + \lambda_t), \qquad \text{alarm when } S_t \ge h, \qquad h = \ln\!\left(\frac{K \cdot 675{,}000}{R_{FA}}\right)
```

K is the number of keys on the instrument, 675,000 is the number of 5.33 ms hops in an hour, and R\_FA is the allowed false notes per hour. Mean detection delay is about h/D hops, where D is the new evidence gained per hop, defined below.

| Keys K | False notes per hour | h | Delay, strong note (D = 5 nats/hop) | Delay, faint note (D = 1 nat/hop) |
| --- | --- | --- | --- | --- |
| 88 | 1 | 17.9 | 19.1 ms | 95.5 ms |
| 88 | 6 | 16.1 | 17.2 ms | 85.9 ms |
| 88 | 30 | 14.5 | 15.5 ms | 77.3 ms |
| 61 | 6 | 15.7 | 16.8 ms | 84.0 ms |

**Overlapping frames repeat evidence.** The bound behind h assumes each hop's λ is new information. With a 256-sample hop, a 4096-sample window shares 94% of its samples with the previous frame, so consecutive values of λ are strongly correlated. For bin powers of noise, the correlation m hops apart and the integrated autocorrelation time τ are:

```latex
\rho(m) = \left(\frac{\sum_n w(n)\,w(n+mH)}{\sum_n w(n)^2}\right)^{2}, \qquad \tau = 1 + 2\sum_{m \ge 1} \rho(m)
```

A sum of n such increments varies like n × τ independent ones, so the CUSUM's false-alarm exponent shrinks from h to about h/τ. Left uncorrected, the 16.1-nat threshold would behave like a much lower one:

| Frames | ρ(1) | τ | 16.1 nats behaves like |
| --- | --- | --- | --- |
| Click frames, 256 samples, no overlap | 0 | 1.00 | 16.1 nats |
| Hann 1024 | 0.43 | 1.92 | 8.4 nats |
| Hann 2048 | 0.81 | 3.85 | 4.2 nats |
| Hann 4096, and 8192 on a 512-sample hop | 0.95 | 7.70 | 2.1 nats |
| Low-delay 2048 and 4096 | 0.72 and 0.87 | 3.61 and 7.04 | 4.5 and 2.3 nats |

Dividing each evidence term by its own τ before it is added restores the exponent, so the formula for h holds in every register. This is the magnitude adjustment of composite likelihood (Chandler and Bate, 2007). Terms from the click frames keep τ = 1, and terms from tier frames take their tier's measured τ (9.9).

One shared τ would be wrong both ways: it would slow every hammer click to the pace of the bass frames, or leave the bass over-firing. D in the table above is evidence after this division, the information each hop really adds.

The cost is honest latency for faint notes. A faint bass note with no audible click, raising raw state evidence by 2 nats per hop in the 4096 tier, gains 0.26 nats per hop after division and needs about 62 hops (330 ms) to reach 16.1 nats. Uncorrected it would fire in 8 hops, and so would every noise excursion of the same size. As an expected note in a lesson (threshold 9.3 nats) it needs about 190 ms. Struck notes ride on the click, and grading uses timestamps, not decision times (2.10).

**Decision:** thresholds come from the false-alarm budget in the configuration (default 6 per hour), not from hand tuning. Every evidence term is divided by its measured τ before it is added. Phase 8 then checks h on recorded noise and trims it by at most ±1 nat (13.2); a larger error means a wrong τ or evidence model, which is fixed at its source.

### 2.5 Priors shift thresholds; they never delete keys

In Bayesian form the decision variable is prior log-odds plus accumulated evidence. A prior is therefore a shift of that key's threshold at that moment, relative to the free-play default π0 = 0.01:

```latex
h_k(t) = h - \left[\operatorname{logit}\pi_k(t) - \operatorname{logit}\pi_0\right]
```

| Situation | Prior π | Threshold change |
| --- | --- | --- |
| Expected note in a lesson | 0.9 | 6.8 nats lower: about 7 ms sooner for strong notes, 36 ms for faint ones |
| Typical mistake (±1 semitone, octave slip) | 0.03 | 1.1 nats lower |
| Any other key in a lesson | 0.002 | 1.6 nats higher |
| Key that does not exist on the instrument | 0 | Never detected |

The size of the answer space explains why lessons are more accurate. Up to 4 simultaneous notes from 88 keys gives 2.4 million combinations (21.2 bits); from 61 keys, 19.1 bits; from 25 keys, 13.9 bits. A lesson step with about 30 plausible outcomes needs only 4.9 bits.

**Decision:** lessons raise and lower thresholds but never mask keys, so a wrong note always stays reportable.

### 2.6 One scale for every threshold

For a Hann-windowed tone of amplitude A, |X|² × 8/N² equals the tone's power A²/2. White noise of variance σ² gives 3σ²/N per bin on the same scale, so a tone's per-bin SNR grows with N:

```latex
\mathrm{SNR}_{bin} = \frac{A^2/2}{3\sigma^2/N}, \qquad \text{gain} = 10\log_{10}(N/3) = 25.3,\ 28.3,\ 31.4,\ 34.4\ \mathrm{dB}
```

The gains are for N = 1024, 2048, 4096 and 8192. Every threshold is a ratio to the noise measured in the same bin, so a digital gain change cancels out and case 24 holds by construction. A noise spectrum averaged over M independent frames is accurate to about 4.34/√M dB: 3 s of silence gives 0.37 dB in the 1024 tier and 0.73 dB in the 4096 tier.

**Decision:** noise is a spectrum per tier, measured during calibration and tracked online. There is no single broadband loudness gate.

### 2.7 Decay, release and the room

A held note decays in two stages (prompt sound, then aftersound). The room's echo decays at 60/RT60 dB/s: 100–150 dB/s in a living room (RT60 0.4–0.6 s), 30 dB/s in a hall (2 s).

```latex
L(t) = 10\log_{10}\!\left(a\,10^{-\lambda_1 t/10} + b\,10^{-\lambda_2 t/10}\right), \qquad \Delta L_{release} = 10\log_{10}\!\left(1 + 10^{\mathrm{DRR}/10}\right)
```

When the damper stops the string, the direct sound vanishes and the level drops by ΔL, set by the direct-to-reverberant ratio (DRR) at the phone. DRR +10 dB gives a 10.4 dB step, 0 dB gives 3.0 dB, and −10 dB only 0.4 dB.

| Release evidence | Noise on it, at 0.5 dB level wobble | What it allows |
| --- | --- | --- |
| A step of S dB | Evidence S²/(2 × 0.5²) per hop: 18 nats for 3 dB, 2 nats for 1 dB | Release within one or two hops when the phone is close |
| A change of slope | Slope noise 66 dB/s over 3 hops, 6.2 dB/s over 14 hops (75 ms) | Release after about 75 ms, and only when the slopes differ by more than 20 dB/s |

A re-strike at the same loudness raises the level only by the decay since the last strike: 8 dB/s × 0.167 s = 1.3 dB at 6 notes per second.

**Decision:** release is detected as a step first and a slope change second, both judged against that key's calibrated decay. Where neither is detectable in a given room, the key is marked release-unobservable and its note length is not graded. Re-strikes are detected from attack evidence (hammer click, phase jump), not from level.

### 2.8 Why the engine models every key

What the phone hears is the sum of every sounding key's pattern, and each pattern spans three or more octaves (C2's first eight partials run from 65 to 523 Hz):

```latex
S(f) = \sum_{k \in \text{keys}} a_k\,T_k(f) + N(f)
```

Remove a key from the model and its energy is blamed on the keys that remain: a played C2 becomes ghost C3, G3, C4, E4 and G4. Partials sharing a bin also add as complex numbers, so two equal partials read anywhere from silence to 3 dB above their power sum. Tuners make octave partials coincide, so that phase stays fixed for the whole note and power subtraction errs systematically.

For the n:1 intervals (octave, 12 semitones; twelfth, 19; double octave, 24; and 28 and 31 above rich bass notes), every partial h of the upper key lies on partial n × h of the lower one. The upper key then has no partial of its own, and down-weighting shared bins would leave it no evidence at all. Full weight is safe: in the Itakura–Saito model (9.3) a bin's standard deviation equals its mean, P1 + P2, and the error that relative phase can cause, at most 2√(P1 P2), never exceeds it.

The added note shows in power, not in decibels. Averaged over relative phase, an upper partial r times the lower one in amplitude raises mean power by 10 log10(1 + r²) dB, but raises the mean dB level by exactly zero whenever r ≤ 1 (Jensen's formula). With the phase fixed for the whole note, that excess is weak evidence even over 8 shared partials, while beating is strong:

| Upper note against the lower partials | Mean power excess | z from the excess, σ\_T of 1–1.5 dB | Beat depth, peak to peak |
| --- | --- | --- | --- |
| Equal | 3.0 dB | 2.5–2.7 | Full, down to silence |
| 3 dB softer | 1.8 dB | 1.7–1.9 | 15.3 dB |
| 6 dB softer | 1.0 dB | 1.1–1.3 | 9.6 dB |
| 12 dB softer | 0.3 dB | 0.4–0.5 | 4.5 dB |
| 20 dB softer | 0.04 dB | 0.1 | 1.7 dB |

σ\_T is the template error of the lower note's partials. Beating needs time rather than loudness: stiffness sets shared partials slightly apart, by |f\_{k,h} − f\_{j,nh}|, which calibration predicts. For C2 + C3, with the octave tuned beatless at C3's partial 2 and B = 2 × 10⁻⁴, C3's partials 6 and 8 beat at 7.5 and 18.5 Hz: one beat in 134 and 54 ms. For C3 + C4 at B = 3 × 10⁻⁴, one beat takes 45 and 18 ms.

A single note's own beating, between its unison strings, runs at other rates and is measured as the test's null (9.5). An upper key struck even a few hops after the lower one also brings its own hammer click.

**Decision:** one joint model covers every key the instrument has. Shared bins keep full weight. A key covered by a sounding key's partials is judged by a harmonic-interval test (9.5): its own click, power excess, beating at calibrated rates and lesson priors. A simultaneous upper note needs about one beat of its fastest shared partial to confirm; a much softer one that ends sooner stays bounded. A focus range changes priors and grading only.

### 2.9 Velocity, distance and how many dynamic levels to show

Distance shifts the level at the phone by a session offset G (about 14 dB from 15 cm to 2.5 m in a typical living room, 24 dB in free field) but barely changes brightness β. So brightness estimates G, and level then supplies precision:

```latex
\hat G = \operatorname{median}_i\!\left[L_i - L_{cal}\!\left(k_i, \hat v_i(\beta_i)\right)\right], \qquad n_{levels} = \left\lfloor \frac{R}{3.29\,\sigma_v} \right\rfloor + 1
```

R is the calibrated pp-to-ff range and σ\_v the measured velocity error, both in dB. The factor 3.29 keeps misclassification of an inner level at or below 10%. With R = 35 dB, σ\_v = 2.5 dB allows 5 levels, 3 dB allows 4, and 4 dB allows 3.

**Decision:** the number of dynamic levels shown is computed from the measured σ\_v, not fixed at five.

### 2.10 Timing and grading error

A note's timestamp is its estimated onset sample, minus the device's input latency, minus the known delay of its register's analysis. If the timestamp has bias b and spread σ\_t, a note played u ms from the beat is misgraded with probability Q((T − |u| − |b|)/σ\_t), where T is the tolerance.

With σ\_t = 5 ms and b = 2 ms, a note 10 ms inside the tolerance edge is misgraded 5.5% of the time, and one 15 ms inside only 0.5%. In practice mode the student follows the backing track, so their timing error is:

```latex
\epsilon = t_{on} - t_{play} - L_{rt} - \frac{d_{piano} + d_{ear}}{343\ \mathrm{m/s}}
```

t\_play is when the app sent the beat to the speaker, and L\_rt is the measured speaker-to-microphone round trip.

**Decision:** timing is graded from timestamps, never from when the engine made its decision. Round-trip latency is measured for each audio route, and each register's bias is corrected.

## 3. Architecture: Reevo's structure with a new evidence core

Reevo 2 keeps Reevo's skeleton and replaces its scoring core. Audio flows through one shared front end into a DSP and a neural evidence engine, and one decision layer turns evidence into notes.

&#91;embedded content: Reevo 2 architecture · 8 stages, 3 side inputs\]

Audio flows top to bottom. The calibration profile, configuration and priors feed in from the right, and the engine switch decides whether DSP, neural or fused evidence reaches the single decision layer.

### 3.1 What Reevo 2 keeps from Reevo, and what changes

| Reevo element | In Reevo 2 | Why |
| --- | --- | --- |
| Three Hann tiers (1024, 2048, 4096) on a 256-sample hop | Kept, plus low-delay frames and an 8192 bass frame | 2.2, 2.3 |
| Energy over 3-bin footprints; greedy peeling of 4 notes per hop | Replaced by partial frequencies and the joint Itakura–Saito model | 2.2, 9.3 |
| Per-key states IDLE, PENDING, ACTIVE, RETRIGGER, RELEASE | Kept; transitions now driven by CUSUM on evidence in nats | 2.4, 10.1 |
| 539-float calibration profile with lock-free double-buffer swap | Kept as profile v2 (about 100 KB), same swap | 8.11 |
| Least-squares inharmonicity fit (f\_k/k)² = f0² + f0²B k² | Kept, with long windows, many partials, weights and a robust loss | 8.7 |
| Split-bridge log-linear B | Kept; the break is located rather than assumed at C3 | 8.8 |
| Fixed 12 dB/s decay and −30 dB/s release rule | Replaced by per-key two-slope decay and the observability map | 2.7, 8.6 |
| Whistle centroid gate and 50-cent clap test | Replaced by non-piano templates | 9.4 |
| Voice pool with an explicit NoteOff when a voice is stolen | Kept, raised from 10 to 32 voices | 10.5 |
| Lock-free ring, telemetry (avgUs, maxUs, lateHops), mic latency offset | Kept; catch-up replaces fast-forward, and latency is measured per route | 6.3, 6.6 |
| Atomic expected-notes bitmask | Kept as the transport, now carrying priors instead of a mask | 2.5, 11.1 |
| JSI host object with zero-copy event buffer | Replaced by Nitro HybridObjects written in C++ once a spike passes (12.1); the event ring stays, and DSP moved off the JavaScript thread | 12.1 |

### 3.2 The common currency: evidence frames

Every engine writes the same record for every key and hop: onset, sustain and release evidence in nats (log-likelihood ratios against "not in this state"), a validity flag and its source. Each value is already divided by its τ (2.4), so it means the same whichever engine wrote it. The decision layer reads nothing else.

That single contract is what makes the engine switch safe, lets fused mode simply add evidence (14.9), and makes comparisons fair: same thresholds, same false-alarm budget, only the evidence differs.

**The output contract.** What leaves the engine is just as fixed: four structures, each written only by the DSP thread and read without locks. The UI thread reads the tables every frame, and JavaScript follows the ring in batches (6.4, 12.1).

| Structure | Holds | Read by |
| --- | --- | --- |
| LiveKeys | One slot per MIDI key: down, strike count, velocity, cents, onset time, level (0 at the key's noise floor, 1 at its calibrated fortissimo), note id and confidence | The UI thread every frame |
| VerdictTable | One row per expected note: pending, correct, wrong, missed or unclear; the key played; how early or late in ms; perfect, good or late; whether a wrong key came first. Its header holds the lesson cursor and the loop pass, and a loop resets its section's rows at each pass | The UI thread every frame; JavaScript once more when the lesson finishes |
| Clock | Song time and stream time, each a straight line: a position, a rate and the host time of that position (6.2) | The UI thread every frame |
| Event ring | The last 256 events in order, as 48-byte records (12.2) | JavaScript, woken once per batch; the UI thread in free play |

LiveKeys and the VerdictTable each count their changes, so a reader that sees the same count skips all work, and a reader the ring has lapped rebuilds from the tables. setScore allocates the VerdictTable before the engine starts, so nothing is allocated while playing.

### 3.3 Threads

Four threads share data only through single-producer queues: the audio callback, the DSP thread, the neural thread and the JavaScript thread. The app's UI thread also reads the output structures (3.2) every frame, without locks. Their roles, priorities and wake-ups are in 6.4.

## 4. The single configuration

All behaviour comes from one versioned configuration object, shared by iOS and Android. Every default below traces to a formula in section 2 or to a measurement taken in Phase 0 or calibration.

How it works:

- The React Native side edits the configuration. The engine validates it against a schema (types and allowed ranges) and rejects invalid values with a reason.
- The engine applies a new configuration atomically at the next hop boundary, using Reevo's double-buffer swap, so audio never stops.
- The configuration is stored with the calibration profile it was used with, so every recorded result can be reproduced.
- **One registry in the app.** Every setting, the engine's and the app's own, is declared once and shown on one Settings page. A value starts at its default, then the lesson's JSON, then the student's choice, and each setting's setBy lists which of those layers may change it. Measured values show read-only, and screens send the engine plain values.

### Instrument (written by calibration, editable)

| Parameter | Default | Origin |
| --- | --- | --- |
| type | acoustic or digital, chosen at calibration | Selects the decay, release and timbre models (Phase 3) |
| rangeMidi | from the lowest and highest key strikes (PSR-E343: 36–96; acoustic: 21–108) | Keys outside the range get prior 0 (2.5) |
| transpose | detected, in semitones | A whole-semitone offset on a digital instrument is its transpose setting (8.3) |
| profileId | the active calibration profile | One profile per instrument and location |

### Mode

| Parameter | Default | Origin |
| --- | --- | --- |
| kind | learning, practice or free | User scope |
| focusRange | none; a lesson may set one, for example MIDI 48–72 | Changes priors and grading only, never the model (2.8) |
| waitForCorrect | on in learning for beginners | The staff flows at the lesson's tempo and stops at each note until it is played (11.1) |
| tempoFollow | on in learning, off in practice | The practice song's tempo is fixed |

### Grading (declarative)

| Parameter | Default | Origin |
| --- | --- | --- |
| key | always on | User priority 1 |
| timing.enabled | on | User priority 2 |
| timing.earlyMs, timing.lateMs | 100 each in the beginner preset, 50 in the advanced; a note's windowMs overrides both. The inner half of a window counts as perfect, the rest as good | Misgrading stays below 1% except within 15 ms of the edge (2.10). Windows sit on both sides of the onset and never overlap (11.5) |
| dynamics.enabled | off | Needs touch response on and a measured velocity error |
| dynamics.levels | auto, from the measured velocity error | n\_levels formula (2.9) |
| noteLength.enabled | off | Graded only on keys and rooms where release is observable (2.7) |
| wrongNotes.report | on | Lessons must show mistakes |
| wrongNotes.confirmPosterior | 0.9 | Report only when the wrong key is ≥ 90% likely: a false accusation is weighted 9 times a missed slip (11.1) |
| credit | perfect 1, good 0.75, late 0.5, at most 0.5 after a wrong key on the same note; wrong and missed 0; unclear not counted | The score is 100 × the average credit (11.5); the same in both presets |

### Engine

| Parameter | Default | Origin |
| --- | --- | --- |
| evidence | dsp until the neural model passes its gate, then fused | Decision rule in 14.11 |
| falseNotesPerHour | 6 | Gives h = 16.1 nats for 88 keys, 15.7 for 61 (2.4) |
| evidenceTau | measured per evidence term and tier in Phase 0; expected: click 1.0; Hann 1024, 2048, 4096: 1.92, 3.85, 7.70; low-delay 2048, 4096: 3.61, 7.04 | Each term is divided by its τ, so h keeps its meaning in every register (2.4, 9.9) |
| thresholdTrimNats | 0, limited to ±1 | Set by the check on recorded noise (13.2) |
| neuralBudgetMs | 80 | 64 ms look-ahead (90.5% note accuracy in published low-latency work) plus compute |
| retractPosterior | 0.1 | In fused mode a shown note is withdrawn if its combined probability falls below 10% |
| maxVoices | 32 | Matches the PSR-E343's own 32-note polyphony and dense pedalled passages |
| maxTemplates | 64 | 32 voices plus candidates, ringing tails and backing notes, affordable with sparse supports (9.3, 9.10) |
| predictedAmplitudeBand | 3 standard deviations of the measured prediction error (about ±6 dB) | Tails, backing notes and sympathetic ringing explain their own energy but never absorb a new note (9.3) |
| intervalTest | on | Keys covered by a sounding key's partials are judged once per strike (9.5) |
| tiers | 1024, 2048, 4096, plus 8192 for A0–B1 after an onset | Resolution limits (2.2) |
| lowDelayFrames | on for the 2048 and 4096 tiers | 7.6 ms and 17.7 ms sooner first detection (2.3) |
| legacyEngine | v1.2 available | A/B comparison until the new engine wins |
| transposeWatchRun | set in the harness (5.6) | A run of notes all off by the same whole number of semitones raises transpose suspected instead of wrong notes (11.1) |
| pianoMismatchWindow | set in the harness (5.6) | Confident notes that keep missing the profile's partials by more than 3σ over this window raise piano mismatch (10.7) |

### Priors

| Parameter | Default | Origin |
| --- | --- | --- |
| expected | 0.9 | 6.8 nats lower threshold (2.5) |
| typicalMistake | 0.03 each for ±1 and ±2 semitones and ±12 | 1.1 nats lower; later learned per student (11.1) |
| other | 0.002 | 1.6 nats higher |
| freePlayBase | 0.01 | Reference prior π0 |
| pieceHintNats | 0 (off) | Optional light hint in free play from the piece just practised |

### Calibration

| Parameter | Default | Origin |
| --- | --- | --- |
| anchors | quick: 7; full: 16 | Placed to minimise interpolation error (8.4) |
| loudnessLevels | acoustic: soft and loud (medium optional); digital: soft, medium and loud | Digital keyboards switch recorded samples between loudness layers (8.5) |
| silenceSeconds | 3 | Noise spectrum accurate to 0.73 dB in the 4096 tier (2.6) |
| holdSeconds | 1.5 per anchor, then release | Two-slope decay and release step need about 1 s of decay (8.6) |
| neuralAdaptation | normalize; options: condition, finetune | Per-piano adaptation levels (14.8) |

### Device (measured per audio route)

| Parameter | Default | Origin |
| --- | --- | --- |
| roundTripMs, inputLatencyMs | measured by the chirp test | Timing reference (2.10, 6.6) |
| inputSource | Android: UNPROCESSED when supported, else VOICE\_RECOGNITION; iOS: Measurement mode | Flattest response, no automatic gain (6.1) |
| refuseBluetoothInput | on | Bluetooth headset microphones are 8–32 kHz voice codecs |
| thermalFallback | neural to DSP at "serious" thermal state | Keeps timing stable when the phone throttles (14.10) |

### Practice

| Parameter | Default | Origin |
| --- | --- | --- |
| echoCanceller | on | The phone's speaker is centimetres from its microphone (11.3) |
| cancellerLengthMs | from the measured echo decay, 128–384 | The tail beyond the filter must sit 6 dB below what it cancels: about 60–90 ms is enough at RT60 0.5 s, 230–370 ms at 2 s (11.3) |
| knownBackingNotes | from the song's MIDI; amplitude bounded to the predicted residual; tails follow the room's decay | Explains the backing, including its echo tail, without absorbing the student's notes (11.3) |
| priorWindowMs | ±150 around each expected onset | Early or late notes still get the prior; grading reports the offset |

### Diagnostics

| Parameter | Default | Origin |
| --- | --- | --- |
| rejectionLog | on in development builds | Shows why each candidate note was rejected (Phase 0) |
| telemetry | on | Processing time, late hops, latency and false-note counters |

### Playhead and lesson (app)

Read only by the app, never by the engine; its defaults are design choices, not measurements.

| Parameter | Default | Origin |
| --- | --- | --- |
| fixPlayhead | on | On: the staff moves past a line fixed at playheadPosition. Off: the line moves over a still staff |
| playheadPosition | 0.30 of the screen width | 70% of the screen shows what's coming; the moving line lands here after each glide |
| turnAt | 0.80 | How far the moving line travels before the staff glides |
| turnGlideMs | 300 | 0 is an instant cut, used when Reduce Motion is on |
| freePlayWriteAt | 0.80 | Free play has nothing coming up, so notes are written near the right edge and scroll left (11.4) |
| checklist | off | Set by the lesson's JSON. On: all notes on a still staff, the playhead moving across, a tick on each; overrides fixPlayhead (11.1) |
| showNotes | on | Set by the lesson's JSON. Note names on the staff; the letters on the piano keys always show |
| looping | off | Set by the lesson's JSON. The student may repeat a section (11.2) |
| reduceMotion | system | Set by the student. On or off overrides the phone's Reduce Motion; each animation's calm version is in the motion settings file (12.3) |

## 5. Phase 0 — Measure first: corpus, ground truth, metrics, v1.2 baseline

Nothing is tuned until a labelled recording corpus and an offline test harness exist. Phase 0 builds both and measures v1.2, which becomes the bar every later phase must beat.

### 5.1 Metrics, defined once

| Metric | Definition | Reported per |
| --- | --- | --- |
| Note accuracy (F1) | Same key and onset within 50 ms (also 10, 20 and 30 ms), standard mir\_eval matching | Register, loudness, distance, instrument |
| Detection rate | Matched notes ÷ notes actually played | Same cells |
| False notes per hour | Detections with no matching played note, per hour of audio | Silence, speech, TV, playing |
| Wrong-note report precision | Correct wrong-note reports ÷ all wrong-note reports | Lesson type |
| Timestamp error | Detected onset − true onset after latency correction: bias, spread, 95th percentile | Register |
| Display latency | True onset to NoteOn event: 50th, 95th and 99th percentiles | Register |
| Release accuracy | NoteOff within 50 ms or 20% of the note's length, whichever is larger; release-observable keys only | Instrument, room |
| Velocity error | Mean absolute error in dB, plus the confusion table of dynamic levels | Distance |
| Processing time | Per hop, 50th and 99th percentiles; late hops per hour | Device |

### 5.2 The recording protocol

Each session records these takes, each opened and closed by a sync event (5.3):

1. **Noise:** 60 s of silence, then 60 s each of speech near the phone, TV or music, hand claps, whistling, coughing and door knocks.
2. **Loudness ladder:** 6 keys spread over the instrument (acoustic A0, E2, C4, A5, E7, C8; PSR-E343 C2, G3, C4, A5, E6, C7), 5 levels from ppp to ff, 3 strikes each, 2 s apart.
3. **Repetitions:** a bass, a middle and a treble key at mf, at 2, 4, 6 and 8 notes per second against a metronome, 8 strikes per rate.
4. **Soft under loud:** hold a loud C3 and play soft notes 1, 2, 4, 7, 12 and 19 semitones above, with and without the pedal.
5. **Scales:** two octaves legato, staccato and pedalled, in eighth notes at 60, 90 and 120 BPM.
6. **Chords:** triads in three registers, octaves (C2+C3, C3+C4), minor-second clusters (E4+F4; on the acoustic also B0+C1), and 6-note two-hand chords.
7. **Trills:** C4–D4 and C4–C♯4 at 8 and 12 notes per second, 3 s each.
8. **Glissando:** white keys, up and down.
9. **Jingle Bells chorus:** in learning mode (no backing) and practice mode (backing from the phone speaker).
10. **Velocity sweep (digital only):** one key, 20 strikes from softest to loudest.
11. **Free playing:** 2 minutes of improvisation.
12. **Harmonic intervals:** octave, twelfth and double octave above C2 and C3 (and C1 on the acoustic), struck together and 30 ms apart, with the upper note at the same, a softer and a much softer dynamic. On the PSR-E343 the dynamics are set by MIDI velocity, so the level ratio is known. Then the lower notes alone, with the upper key held down silently, pedal up and down.
13. **Backing alone:** the practice backing through the phone speaker for 5 minutes with no piano, in each room.

Conditions vary by take: phone at 0.3, 1 and 2 m; on the music stand, on the piano top, or on a table; iPhone 13 Pro Max plus at least two Android phones; at least two rooms (small, and larger or echoey); quiet, speech or TV background; pedal on or off.

Not every take runs in every condition. A strength-3 covering array (Microsoft PICT or NIST ACTS) over those 7 factors covers every combination of any 3 factor levels in about 30–40 configurations; its lower bound is 3 × 3 × 3 = 27. Directed stress tests for the 26 cases (15) are added on top.

### 5.3 Ground truth

**PSR-E343 (digital).** Its USB TO HOST port connects to a computer during recording only; the app itself stays microphone-only.

- The computer either records the MIDI the player produces, or sends a MIDI file so the keyboard plays itself. Self-play also feeds the neural training set (14.5).
- At the start and end of each take the computer sends a loud C7 sync note. It is found in the phone audio by matched filtering, and the clocks are aligned by a least-squares fit t\_phone = a × t\_midi + b.
- Two sync points are needed because device clocks drift 20–100 ppm: at 50 ppm a 10-minute take drifts 30 ms, three times the timestamp gate.
- The keyboard's MIDI-in-to-sound delay is measured once the same way and subtracted.
- MIDI velocity is the dynamics ground truth; sustain-pedal messages (with a pedal connected) are the pedal ground truth.

**Acoustic piano.**

- Takes follow a printed script against a metronome, so the expected notes are known in advance. A second device plays the click, which the phone records for beat alignment.
- An offline onset detector proposes onset times; a person checks them in a spectrogram editor (Sonic Visualiser) to ±5 ms.
- If a music school or showroom has a Disklavier or a silent/hybrid piano, one session there gives MIDI from real strings, synchronised the same way.

Every take's labels list key, onset, offset, velocity and pedal state, plus its condition metadata.

### 5.4 How much to record

```latex
n = \frac{1.96^2\,p\,(1-p)}{e^2} = \frac{3.84 \times 0.97 \times 0.03}{0.02^2} = 280, \qquad R_{upper,95\%} = \frac{3}{T}\ \text{per hour when no false note is seen in } T\ \text{hours}
```

- A 97% detection rate measured to ±2% needs 280 notes, so plan at least 300 notes per register × loudness cell. A ±1% claim would need 1,118.
- Showing at most 6 false notes per hour needs at least 0.5 h of clean audio per noise condition; at most 1 per hour needs 3 h.
- Engines are compared on the same notes with McNemar's paired test (13.5).

### 5.5 v1.2 rejection log and baseline

- Add a log to v1.2 recording, for every candidate onset and every expected note not detected, which gate rejected it and by how much (measured value against threshold).
- The gates are: energy gate, flux onset, McLeod pitch, Goertzel verification, the five fingerprint layers (range and ±22 cents, harmonic ratio, timbre similarity, dB window, stability) and 2-hop confirmation.
- Run v1.2 offline on the whole corpus. Publish its metrics (5.1) and a histogram of miss causes.
- The six suspects from the discussion each map to a gate: re-strikes (flux), soft notes under loud ones (single-pitch tracking), soft notes (dB window, energy gate), unstable attacks (±22 cents, stability), digital loudness layers (timbre similarity) and late or out-of-step notes (lesson timing).
- The histogram shows which problems these two instruments actually have, and sets the test priorities for Phases 4 and 5.

### 5.6 The evaluation harness

- The C++ engine core compiles for desktop as well as mobile. A command-line runner replays any recording through any engine and configuration and writes the events.
- A scorer computes every metric in 5.1, with bootstrap confidence intervals over takes.
- Runs are deterministic: the same audio and configuration always give identical events.
- Every change runs against the full corpus. A change that worsens a gate metric by more than its confidence interval fails.
- Each of the 26 cases has golden recordings with expected outcomes (15).

### 5.7 Exit criteria

- [ ] At least 300 notes per register × loudness cell on both instruments, and at least 0.5 h of audio per noise condition.
- [ ] Labels synchronised to within 2 ms, verified on sync notes.
- [ ] The harness reproduces v1.2's live results on the same recordings.
- [ ] v1.2 baseline metrics and miss-cause histogram published.

## 6. Phase 1 — Capture, sample clock and threading (Android and iOS)

Phase 1 delivers a capture layer that never loses a sample, stamps every sample with a 64-bit counter and measures each device's latency. v1.2's proven capture code is the starting point.

### 6.1 Audio session setup

| Setting | iOS | Android | Why |
| --- | --- | --- | --- |
| Audio path | RemoteIO AudioUnit | Oboe over AAudio, OpenSL ES fallback | Lowest-latency native paths |
| Session and sharing | PlayAndRecord, so practice mode can play the backing | Exclusive (MMAP) when available, else Shared | MMAP shortens the input path |
| System processing | Measurement mode | UNPROCESSED only when the device reports support for it (PROPERTY\_SUPPORT\_AUDIO\_SOURCE\_UNPROCESSED), else VOICE\_RECOGNITION | No automatic gain, high-pass or noise suppression; UNPROCESSED promises ±10 dB from 100 to 7,000 Hz |
| Format | 32-bit float, mono | Float, mono (converted if the device gives 16-bit) | Float cannot clip inside the pipeline |
| Sample rate | Ask for 48 kHz, read back the actual rate | Ask for 48 kHz, read back the actual rate; never force resampling | Tables are built for the delivered rate (6.2) |
| Buffer | Ask for 256 frames (5.33 ms), accept what is granted | Low-latency mode; callback size not forced | The ring buffer decouples callback size from the 256-sample hop |
| Output in practice mode | Speaker (default to speaker) or wired headphones | Same | The exact output buffer is the echo canceller's reference (11.3) |
| Bluetooth microphone | Refused, with a message | Refused | Headset microphones are 8–32 kHz voice codecs with processing |
| Other audio code | react-native-audio-api only decodes files: AudioManager.disableSessionManagement() at app start, and no AudioContext on microphone screens | No AudioContext on microphone screens | Only the engine sets the session and plays sound while the microphone is on (11.3) |

In practice mode every output buffer sent to the speaker is also copied into a reference ring, stamped with the same sample counter as the input.

### 6.2 The sample clock

- A 64-bit counter advances by the frame count in every input callback. Every timestamp in the engine is counter ÷ sample rate, and the counter never resets during a session.
- All tables (window bins, partial bins, hop durations) are built at start-up for the delivered rate. Window and hop lengths stay fixed in samples, so at 44.1 kHz windows are 8.8% longer. The detection threshold moves by only 0.09 nats, because hops per hour change from 675,000 to 620,156.
- The DSP path never resamples, since a resampling filter adds 1–2 ms of delay. When the delivered rate is not 48 kHz, the neural path resamples to 48 kHz in its own thread, so its features match training exactly (14.3).
- Platform timestamps map the counter onto the system clock (iOS AudioTimeStamp host time; Android AAudio stream timestamps). This links input to output samples in practice mode, and to the screen.
- **Clock for the screen (3.2):** song time (lessons) and stream time (the microphone's own timeline, for free play) are published as straight lines in host time, the clock CACurrentMediaTime counts on iOS and the monotonic clock on Android: a position, a rate and the host time of that position. They are re-anchored every hop and at every jump (start, pause, resume, a cursor move, a loop pass); practice runs at rate 1 from the output samples; a guided lesson runs at rate 1 between notes and 0 while waiting at a note; a paused lesson runs at rate 0. Each frame evaluates them at its own display time (iOS: CADisplayLink's targetTimestamp; Android: the frame's vsync plus a measured offset), so the staff shows what is heard.
- After a stream restart the counter jumps by the measured gap, and a discontinuity marker resets the onset trackers so the jump cannot look like an attack.

### 6.3 Ring buffer and catch-up

- A single-producer, single-consumer ring holds 2^16 = 65,536 samples: 1.37 s at 48 kHz, 256 KB. It survives any system stall up to a second without loss.
- The DSP thread processes every pending hop in order. A hop costs well under 1 ms of its 5.33 ms, so a 200 ms stall (37.5 hops) is cleared in about 37 ms, more than 5 times faster than real time.
- Only a stall longer than the ring (over 1.3 s) drops audio. The counter then advances by exactly the dropped samples and a discontinuity is emitted, so later timestamps stay true. This replaces Reevo's fast-forward, which dropped audio after 21 ms of backlog and shifted every later timestamp.
- The audio callback only copies samples and publishes the write counter. It takes no locks, allocates no memory and makes no system calls (a condition-variable notify can enter the kernel, so none is used).

### 6.4 Threads and scheduling

| Thread | Work | Priority | Wakes up |
| --- | --- | --- | --- |
| Audio callback | Copies input, and in practice mode the output reference, into rings | Operating-system real-time | On each hardware buffer |
| DSP | Front end, evidence, decisions and events for every hop | iOS: time-constraint thread policy; Android: urgent-audio priority | Polls every 2 ms |
| Neural | Feature frames, model, evidence frames | Below DSP | Every 2 frames (21.3 ms) |
| JavaScript | Records events and verdicts, reads telemetry, sends commands and configuration | Normal | Once per batch of new events, never per frame |
| UI (app) | Reads LiveKeys, the VerdictTable and the Clock in one frame callback, then draws (12.3) | Main thread, shared with all drawing | Every frame, up to 120 Hz |

Threads share data only through single-producer queues: input ring, reference ring, feature queue, neural evidence queue, event queue and the configuration double buffer, plus the output tables (3.2), which the UI thread reads every frame without locks. Polling every 2 ms adds at most 2 ms (1 ms on average) to a 5.33 ms hop and keeps the audio callback free of kernel calls.

### 6.5 Clipping and microphone overload

- Digital clipping: any raw sample with |x| ≥ 0.985 sets the clip flag, as in Reevo.
- The microphone capsule usually overloads first. UNPROCESSED maps 94 dB SPL to −36 dBFS, so full scale is about 130 dB SPL, while phone MEMS microphones overload between 120 and 135 dB SPL.
- Overload shows as flat-topped waveforms (4 or more consecutive samples within 0.1% of the hop's peak) or a jump in the hop's crest factor.
- The UI is told to suggest moving the phone further away, and evidence from the affected hops is down-weighted, because distortion creates fake partials.

### 6.6 Latency and echo-path test (chirp)

- The app plays a 100 ms chirp sweeping 1–8 kHz through the speaker and records it. A matched filter finds the arrival with 28.5 dB of processing gain (time × bandwidth = 700) and about 0.14 ms resolution.
- Round trip = arrival sample on the input timeline − emission sample on the output timeline, linked by platform timestamps. The test runs 5 times; the median is kept, and the result is rejected if the runs spread by more than 1 ms.
- Recording continues for 1 s after the chirp, enough to see the first 30 dB of decay even at RT60 = 2 s. The same recording gives the echo path's response: its gain, its energy decay curve, which sets the canceller's length, and the canceller's starting filter (11.3).
- It runs at calibration and after every route change, and results are stored per route.
- Wired headphones cannot be measured acoustically. The platform's reported output and input latencies are used (iOS output, input and buffer latencies; Android AAudio timestamps), validated once per test device with a loopback cable.
- Bluetooth headphones add 100–300 ms of variable output delay, so practice-mode timing grading is switched off on them, with a message.
- Input latency alone, used for timestamps in learning and free play, is the reported input latency, cross-checked against round trip minus reported output latency.

### 6.7 Route changes, interruptions and permissions

- Subscribe to route-change and interruption notifications (iOS audio session; Android audio device callbacks and stream disconnect errors).
- On any change: send NoteOff for every active note (no stuck keys), reset per-key states, reopen the stream, load that route's latency or rerun the chirp test, and tell the UI.
- Phone calls, voice assistants and permission revocation take the same path. The session resumes only when the user returns: a lesson pauses, and the student taps Resume. In practice mode, resume restarts the current bar with a count-in, so the backing re-locks to the audio clock (11.2).
- The microphone permission prompt states its purpose, and a refusal is handled in the UI, which explains how to allow it in the system settings (8.1).

### 6.8 Exit criteria

- [ ] 1-hour soak test under UI animation load: no lost samples and monotonic timestamps.
- [ ] Simulated 500 ms stall: no lost audio, events in order, timestamps exact to one sample.
- [ ] Chirp test: spread of 1 ms or less over 5 runs on each test phone.
- [ ] Clipping and overload warnings fire on a loud, close test and never during normal playing at 1 m.
- [ ] A route change during playing leaves no stuck notes.

## 7. Phase 2 — Front end: multi-resolution analysis, frequency estimation, noise, onsets

Phase 2 turns each 5.33 ms hop into the measurements every engine shares: multi-resolution spectra, the exact frequency of each partial, a noise spectrum and onset clues. The DSP and neural engines read these same features.

### 7.1 Pre-processing

- A first-order 10 Hz high-pass removes DC; it lowers A0's 27.5 Hz fundamental by only 0.54 dB.
- There is no other filter and no gain in the signal path, because thresholds are relative to noise (2.6).
- Hops flagged for clipping or overload (6.5) carry the flag forward.

### 7.2 Multi-resolution frames (Reevo's three tiers, extended)

| Tier | Keys scored | Frames every hop | Purpose |
| --- | --- | --- | --- |
| Treble | G4–C8 (MIDI 67–108) | Hann 1024 | All evidence |
| Middle | F♯2–F♯4 (MIDI 42–66) | Hann 2048 and low-delay 2048 | Low-delay gives the first detection; Hann confirms, tracks and resolves chords |
| Bass | A0–F2 (MIDI 21–41) | Hann 4096 and low-delay 4096 | As for the middle tier |
| Bass refinement | A0–B1 (MIDI 21–35), plus C2–B2 on the PSR-E343 | Hann 8192 every second hop, only while a bass note is a candidate or sounding | Separates neighbours from partial 8 up (2.2) |

- All frames end at the newest sample, so every tier describes the present.
- A key is scored, for all its partials, in its own tier's frames. The tier is chosen by the gap to the neighbouring key, not by the partial's frequency.
- The FFTs cost about 0.2 million butterfly operations per hop (39 million per second), a small share of one core with Accelerate or NEON, reusing Reevo's SIMD radix-2 code.
- Each spectrum is stored as power in tone units (divided by N²/8) together with its phase, which 7.3 and 7.5 need.

### 7.3 Partial frequency estimation (phase vocoder)

For each partial of each key under evaluation, the bin nearest its calibrated frequency is read in two consecutive frames of the same tier, one hop (H = 256 samples) apart. The phase advance between them gives the frequency inside the bin:

```latex
\hat f = f_b + \frac{f_s}{2\pi H}\,\operatorname{princarg}\!\left(\Delta\phi - \frac{2\pi f_b H}{f_s}\right)
```

- The unambiguous range is ±f\_s/(2H) = ±93.75 Hz around the bin centre, wider than the widest bin (46.9 Hz), so there is no ambiguity.
- It needs no extra FFT, because the frames already exist. Time–frequency reassignment would need a second FFT per frame for the same information.
- Each estimate carries its variance from the Cramér–Rao bound at that partial's own SNR (2.2), which later becomes its weight (9.2).
- Amplitude comes from quadratic interpolation of the log-magnitude peak, which also corrects the scalloping loss between bins.
- When partials of two candidate keys fall within 2 bins of each other, the estimate is biased. That partial is flagged as shared and down-weighted (9.2), and the joint model resolves it (9.3).

### 7.4 Noise spectrum tracking

- The starting point is the calibration noise spectrum for every tier bin (3 s of silence, 2.6).
- Online, a slow minimum-statistics tracker (Martin, 2001) updates each bin with a 5 s time constant. It updates a bin only in hops where no sounding note or backing note has a partial within 2 bins of it.
- The gate stops long piano notes being learned as noise. The 5 s constant still follows an air conditioner switching on within about 10 s.
- Per-bin SNR (observed power ÷ noise estimate) is the input to every evidence term.
- When noise in the 200–4,000 Hz band rises more than 10 dB above calibration, the UI warns that the room is too noisy for soft notes.

### 7.5 Onset clues

Three clues are computed per key, and each becomes a log-likelihood ratio in 9.5.

1. **Hammer click.** Log-compressed, adaptively whitened spectral flux (Stowell and Plumbley, 2007) in the 3–12 kHz band, on a short 256-sample frame every hop. A hammer impact lasts 1–4 ms and spreads energy well above most partials, while a ringing note only decays there. So the click marks the strike even when the note's level barely changes (2.7).
2. **Phase surprise.** For each bin on the key's partials, the next complex value is predicted from the previous two, assuming constant amplitude and constant phase advance (Bello et al., 2004). The normalised error shows something new arriving, even when power falls, for example an octave added over a ringing note (2.8).
3. **Rise against the decay prediction.** For a sounding key, the observed level minus the level its calibrated two-slope decay predicts (8.6). A re-strike leaves a positive residual.

```latex
\hat X_t = |X_{t-1}|\,e^{\,j(2\phi_{t-1} - \phi_{t-2})}, \qquad d_t = \frac{|X_t - \hat X_t|}{|X_{t-1}| + \epsilon}
```

### 7.6 Onset time inside the hop

- The decision only says an onset happened in the last few hops. The timestamp is refined in the raw waveform around those hops.
- A 1 ms-resolution energy envelope of the 3–12 kHz band is computed. The onset time is the first crossing of half the rise above the pre-onset level. For soft notes with no clear click, the envelope of the key's phase surprise is used instead.
- Target: bias ≤ 2 ms and spread ≤ 3 ms on mf notes, well inside the 10 ms timestamp gate.
- If that gate is missed, the upgrade is a per-sample resonator bank tuned to the calibrated partials (Resonate, ICMC 2025). Its open implementation reports about 42 ns per sample for 88 resonators on an Apple M2 Max.

### 7.7 Exit criteria

- [ ] Partial frequency error on single synthetic and recorded tones within twice the Cramér–Rao bound at 20 dB SNR.
- [ ] Noise estimate within 1 dB of the true noise after 3 s, and not raised by a 10 s sustained chord.
- [ ] Onset timing on the corpus: bias ≤ 2 ms and spread ≤ 3 ms for mf notes in every register.
- [ ] Front-end cost ≤ 0.5 ms per hop (99th percentile) on the iPhone 13 Pro Max and the mid-range Android phone.

## 8. Phase 3 — Calibration engine: protocol and estimation maths

Calibration measures the instrument, the room and the phone in about a minute, and writes one profile that both engines use. It has no latency budget, so it uses long windows and many partials, which the live engine cannot afford.

### 8.1 The protocol

**When it runs.** Before the first screen that plays the piano opens, a lesson or free play, rather than at launch; recalibration comes from Settings or when the engine asks (10.7). A screen first explains why the app listens, with a single Continue button; then the system asks for the microphone, and the student gives the keyboard size before the steps below. Only a run that completes and passes the quality check (8.10) creates a profile: an interrupted run resumes from its last completed step, and a failed one saves nothing.

The phone stays where it will sit while playing, because distance and room set the levels, decays and release steps.

1. Choose acoustic or digital.
2. Stay silent for 3 s.
3. Strike the lowest key, then the highest key, mf.
4. For each anchor key (8.4): strike once per loudness level (8.5), holding the last strike 1.5 s before releasing.
5. Acoustic only, when needed: 1 to 4 extra strikes to locate the bass break (8.8).
6. Chirp test for latency and echo path (6.6).
7. Quality check: strike 5 keys the app picks.

At about 2.5 s per strike, quick calibration takes about 62 s on an acoustic piano and 79 s on a digital keyboard. Full calibration takes about 106 s and 146 s.

### 8.2 Silence

- 3 s of silence gives the noise spectrum for every tier bin, accurate to 0.37–0.73 dB (2.6).
- If a transient appears (clap, voice, door), the hammer-click clue (7.5) fires and the step restarts.

### 8.3 Range, overall tuning and transpose

- The lowest and highest strikes give the key range. Their measured pitches also serve as two extra anchors at the very ends.
- The overall tuning offset is estimated first: c\_g = 1200 × log2(f0 measured ÷ f0 equal-tempered) for the key the app asked for, taken as the median over all anchors.
- **Digital instruments** are tuned exactly, so their offset is a whole number of semitones (the transpose setting) plus a fine tune. If c\_g sits within 10 cents of 100 × t with t ≠ 0, the app reports transpose t and maps each sounding pitch back to the key pressed.
- **Acoustic pianos** drift flat over the years, so any offset is accepted. Beyond ±50 cents the app suggests tuning, but detection still works, because every later check is relative to c\_g.
- **Wrong-key check:** an anchor strike is accepted if its pitch is within 35 cents of the expected pitch, including c\_g and the stretch fitted so far. 35 cents is half a semitone minus a 15-cent margin for stretch at the keyboard ends.
- **Range check:** the implied key count must be a standard size (25, 32, 37, 44, 49, 61, 73, 76 or 88); otherwise the step repeats.

### 8.4 Where the anchors go

The fitted curves across the keyboard are smooth. For smooth curves, interpolation error is smallest when anchors sit at Chebyshev nodes of the range, which avoid the large errors at the ends that equal spacing causes. The range strikes add the two ends themselves.

```latex
k_i = \frac{k_{lo}+k_{hi}}{2} + \frac{k_{hi}-k_{lo}}{2}\cos\!\left(\frac{(2i-1)\pi}{2n}\right), \qquad i = 1, \dots, n
```

Nodes are rounded to the nearest white key, which is easier to find, and the screen highlights each one.

| Instrument | Quick (7) | Full (16) |
| --- | --- | --- |
| Acoustic, 88 keys | B0, G1, A2, E4, B5, D7, B7 (+ A0, C8 from the range strikes) | A0, B0, D1, G1, C2, G2, E3, C4, A4, F5, D6, A6, D7, G7, B7, C8 |
| PSR-E343, 61 keys | C2, G2, F3, F4, G5, F6, B6 (+ C7 from the range strike) | C2, D2, E2, G2, B2, E3, A3, E4, A4, D5, A5, D6, F6, A6, B6, C7 |

### 8.5 Strikes, loudness levels and timbre templates

- **Acoustic:** a soft (p) and a loud (f) strike per anchor, with medium optional in full mode. A piano's timbre changes smoothly with hammer speed, so two levels plus interpolation are enough.
- **Digital:** soft, medium and loud. Sample-based keyboards switch recordings between loudness layers, so timbre jumps at layer boundaries, and three strikes catch the 2–3 layers typical of budget keyboards. The optional velocity sweep (5.2) finds the boundaries as jumps in brightness against level.
- A template is the shape of the partial magnitudes, normalised to sum to 1, for partials 1 to H: up to 30 in the bass, 16 in the middle, 8 in the treble. Each is measured twice: at the attack (30–80 ms after onset, what detection sees) and in the sustain (300–600 ms, what tracking sees).
- Brightness β = Σ h × P\_h ÷ Σ P\_h, Reevo's centroid in partial number, is stored per level with the level itself.
- To fill every key, each partial's log-magnitude is interpolated linearly in key index between anchors of the same segment, never across the bass break. Between loudness levels, templates are interpolated in β.

### 8.6 Decay, release and the observability map

- Over the 1.5 s hold, the two-slope model (2.7) is fitted by nonlinear least squares, starting from straight-line fits to the first 300 ms and the last 600 ms. This gives λ1, λ2 and their crossover time.
- After the release, the step ΔL in the first 20 ms and the slope over the next 200 ms are measured. Together they capture the damper, the room and, on digital keyboards, the built-in reverb and release samples. This replaces the clap test suggested in the discussion, which measured only the room.
- The level wobble during the hold, mainly beating between unison strings, is fitted by a short linear predictor. The spread σ\_L of its prediction error sets each key's release threshold (9.6).
- Decay rates are interpolated log-linearly in key index; step and post-release slope linearly.
- **Observability:** with a release threshold of 8 nats and σ\_L = 0.5 dB, a 1 dB step is detected in about 4 hops (21 ms) and a 3 dB step in 1 hop. A key is release-observable if its step is at least 1 dB, or its post-release slope is at least 20 dB/s steeper than its natural decay (2.7).
- Unobservable keys get no note-length grading in this setup. Keys without dampers show a step near zero, so the undamped range is measured rather than assumed (it varies from about 17 to 23 keys between pianos).

### 8.7 Partial frequencies, then f0 and B

- Each anchor is analysed with a 1.0 s Hann window starting 50 ms after onset (past the hammer transient), zero-padded 2×.
- Each partial is searched for within ±50 cents of its prediction (plus the model's uncertainty) and refined by quadratic interpolation of the log-magnitude. With 2× padding the interpolation bias is below 0.002 bins, 0.002 Hz for this window. The noise limit at 20 dB SNR is 0.00025 Hz, against 0.010 Hz for the live 85 ms window.
- Partials run from h = 1 (h = 2 for A0–B1, whose fundamental is weak) up to the highest with at least 10 dB SNR below 8 kHz: about 30 in the bass, 15–20 in the middle and 3–8 in the treble.
- f0 and B come from weighted least squares on Fletcher's law in linear form, with weights from propagated frequency variance:

```latex
\left(\frac{\hat f_h}{h}\right)^2 = f_0^2 + f_0^2 B\,h^2 \;\Rightarrow\; y_h = \alpha + \beta\,x_h,\quad x_h = h^2,\quad f_0 = \sqrt{\alpha},\quad B = \beta/\alpha,\quad w_h = \left[\left(\frac{2\hat f_h}{h^2}\right)^2 \operatorname{var}(\hat f_h)\right]^{-1}
```

- A robust Huber loss, solved by iterative reweighting, rejects phantom partials and longitudinal string modes. The fit's covariance gives standard errors for f0 and B.
- This is Reevo's least-squares idea, upgraded from 6 partials read 25 ms after onset to long windows, many partials and proper weights.

### 8.8 Across the keyboard, and the bass break

- **Inharmonicity:** log B is modelled as linear in key index on each side of the bass break, following the parametric approach of Rigaud, David and Daudet (2013). Each segment is fitted by robust least squares to its anchors.
- **Tuning stretch:** the deviation from equal temperament after removing c\_g is fitted as a smooth cubic in key index. With 7 anchors plus 2 range ends there are 9 points for 4 parameters, leaving 5 degrees of freedom to report the residual.
- **Bass break (acoustic):** if the B residuals jump between two adjacent bass anchors, the app asks for strikes between them. Each strike halves the interval, so a 12-key gap is located to ±1 key in ⌈log2 12⌉ = 4 strikes, or to ±3 keys in 2.
- **Digital keyboards:** B comes from the recorded samples, constant within each sample zone and jumping between zones, so a smooth curve can misfit. B is interpolated piecewise from the nearest anchor and corrected online (8.12). The effect is small: a 30% error in B moves partial 8 by about 7 cents and partial 16 by about 27 cents, against 100 cents to the neighbouring key.
- The output is f0, B and the cents offset for every key, each with its uncertainty, which becomes σ\_model in 9.2.

### 8.9 Latency and echo path

The chirp test (6.6) runs on the current route at the end of calibration. It stores the round trip, input latency, echo path gain, the echo's decay curve with the canceller length it implies, and the canceller's starting filter.

### 8.10 Quality check

- The app highlights 5 random keys in range. Each must be detected with the new profile, as the right key, with frequency residuals within 3 σ.
- The report covers noise level, SNR per register, fit residuals, observability coverage and clipping. The result is pass, pass with a warning ("move the phone closer", "the room is noisy"), or repeat a named step.

### 8.11 Profile layout and storage

Reevo's 539-float profile becomes a versioned, checksummed profile v2, still swapped into the engine lock-free through a double buffer.

| Part | Contents | Size |
| --- | --- | --- |
| Global | Version, instrument type, range, transpose, c\_g, sample rate, phone model, creation time, stretch and B-model parameters | under 100 floats |
| Per key (× 88) | f0, B and cents with uncertainties; λ1, λ2, crossover; release step, post-release slope, observable flag, σ\_L; level and brightness per loudness level; attack and sustain templates for 2–3 levels × up to 30 partials | about 193 floats per key, 68 KB in total |
| Noise | Spectrum for every bin of the four tiers (513 + 1,025 + 2,049 + 4,097) | 31 KB |
| Per route | Round trip, input latency, echo path gain, decay curve, canceller length and filter | under 10 KB |

The calibration strikes' audio is saved separately for neural adaptation (14.8). Profiles are stored by id, each tied to a phone model, so a user can keep several, such as "PSR at home" and "school piano". The app starts with one active profile, which recalibrating replaces; more pianos later need only a picker screen, not a migration.

### 8.12 Online refinement

- Every confident isolated note (one sounding key, high SNR, sustained at least 200 ms) gives fresh f0 and B estimates for that key, using 8.7 on its sustain.
- Notes the matcher judges correct in a lesson (11.5) are labelled samples too: the expected key is known, so they feed the same per-key refinement.
- A small Kalman filter per key folds each estimate in, with gain K = P ÷ (P + R): R comes from the estimate's Cramér–Rao variance, and process noise Q allows slow drift (about 1 cent per hour for acoustic, zero for digital).
- A shared global-drift state moves all keys together for temperature and humidity changes, so one confident note nudges every key's expected tuning (case 17).
- Over a few sessions every key is measured directly, and interpolation error from the anchors fades.

### 8.13 Exit criteria

- [ ] Quick calibration finishes within 90 s on the acoustic and 100 s on the PSR-E343 in a quiet room.
- [ ] Over 3 repeated calibrations, anchor f0 repeats within 0.5 cents and B within 10%.
- [ ] On 20 non-anchor keys, predicted partials 1–8 lie within 5 cents of measured.
- [ ] Transpose −2, 0 and +3 detected correctly on the PSR-E343.
- [ ] The observability map matches listening tests, including the undamped keys.

## 9. Phase 4 — DSP evidence engine

The DSP engine turns the front end's measurements into evidence: for every key and hop, how much more likely the sound is with that key's onset, sustain or release than without, in nats. Its scoring core replaces Reevo's energy-at-bin matching and greedy peeling.

### 9.1 Candidates, with no ranking cut

- Peaks are the local maxima in each tier's spectra with per-bin SNR of at least 6 dB.
- A key becomes a candidate when at least 2 of its first 8 calibrated partials match a peak within tolerance: 3 σ of its calibration uncertainty (8.8) plus the frequency estimate's own σ. In the top octave, where higher partials leave the microphone's useful band, 1 partial is enough.
- Also always included: every sounding key; the ±1, ±2 and ±12 neighbours of each candidate (the usual confusions); and, in lessons, the expected keys and their typical mistakes.
- That gives typically 10–30 keys per hop. Nothing is cut by rank: Reevo's and Apex v2's limit of 4 notes per hop is what caused chords to ping-pong at 4th to 6th place.

### 9.2 Frequency evidence

For key k, the partials not flagged as shared each have a measured frequency, its variance from the Cramér–Rao bound, and a model variance from calibration:

```latex
\ell_f(k) = -\sum_{h \in P_k} \frac{\left(\hat f_h - f_{k,h}\right)^2}{2\left(\sigma_h^2 + \sigma_{m,h}^2\right)}, \qquad \Lambda_f(k \text{ vs } j) = \ell_f(k) - \ell_f(j)
```

- The comparison is against the neighbours j = k ± 1 and k ± 2. This is where the separation of more than 100 σ between neighbours (2.2) does its work.
- Each measured partial is shared out among the keys it could belong to, in proportion to exp(−r²/2) of its normalised residual r, so no partial is counted twice.
- A missing partial (no peak within tolerance) is handled by the joint model (9.3), not here.

### 9.3 The joint model

In each tier, the power spectrum is modelled as a non-negative sum of key templates plus the measured noise ν. Each template places that key's partial weights at their frequencies, spread by the window's kernel W:

```latex
\mu_b = \sum_{k \in C} a_k\, T_k(b;\beta_k) + \nu_b, \qquad T_k(b;\beta) = \sum_h w_{k,h}(\beta)\,\left|W\!\left(b - \tfrac{f_{k,h} N}{f_s}\right)\right|^2
```

The amplitudes a\_k are fitted by minimising the Itakura–Saito divergence between observed powers Y and the model μ:

```latex
D_{IS}(Y\,|\,\mu) = \sum_b \left(\frac{Y_b}{\mu_b} - \log\frac{Y_b}{\mu_b} - 1\right), \qquad a_k \leftarrow a_k\,\frac{\sum_b T_{kb}\,Y_b\,\mu_b^{-2}}{\sum_b T_{kb}\,\mu_b^{-1}}
```

- **Why this divergence:** it is scale-invariant, D(λY | λμ) = D(Y | μ), so a soft note 30 dB below a loud one counts as much in relative terms. A least-squares fit would let loud notes dominate and lose soft ones (case 2). It is also the exact negative log-likelihood of spectral bins whose power fluctuates exponentially around μ, as noise and random-phase partials do.
- **Solving:** the multiplicative update (Févotte et al., 2009) keeps amplitudes non-negative. Warm-started from the previous hop, 5–10 iterations converge.
- **Sparse supports:** each template is stored as a short list of bins around each partial, as wide as the Hann window's leakage stays above the noise floor. Sidelobes fall 18 dB per octave from −31.5 dB, so that is ±2 bins up to 30 dB SNR, ±3.5 at 40 dB, ±5 at 50 dB and ±7.5 at 60 dB. A fixed ±2 bins would leave a loud partial's sidelobes unexplained, and they would reappear as evidence for soft neighbours (case 2). The fit uses Hann frames only, because the low-delay frames leak too far (2.3).
- **Loudness:** each key's template is interpolated between its calibrated levels at the brightness β that fits best (a search over 5 values), which also gives the brightness used for velocity (10.4).
- **Evidence:** a key's evidence is the drop in divergence when it is included, Λ\_J(k) = D\_IS(without k) − D\_IS(with k), in nats. The divergence is a sum over bins, so removing k changes only the templates whose supports overlap k's, typically 2–5. The refit without k updates just those, for 3 warm-started iterations, which is exact up to convergence.
- **Shared bins keep full weight:** where partials of two keys coincide, the error their relative phase can cause never exceeds the model's own standard deviation (2.8), so no bin is down-weighted. A key whose partials all lie on a sounding key's partials is judged by the harmonic-interval test (9.5).
- **Predicted amplitudes are bounded:** only keys under decision have free amplitudes. Backing notes (11.3), ringing tails of evicted voices (10.5) and sympathetic ringing (9.5) enter with amplitudes bounded to three standard deviations of their prediction's measured error, about ±6 dB. They explain their own energy but cannot absorb a new note, and any excess counts as evidence.

### 9.4 Non-piano explanations

Three alternative templates compete in the same fit:

| Template | Model | Explains |
| --- | --- | --- |
| Broadband transient | Flat spectrum across the tier, lasting at most 3 hops | Claps, knocks, pedal and key thumps, doors |
| Pure tone | One partial with no overtones, at any frequency | Whistles, beeps, notifications |
| Harmonic source | Exact harmonics (B = 0), free f0 from 70 to 1,000 Hz, allowed to glide | Speech, singing, counting aloud, other instruments |

- A key's evidence is its gain over the best alternative explanation of the same bins. A whistle at C5's pitch is better explained as a pure tone: no partials, no hammer click, no string decay. Speech is better explained by exact gliding harmonics than by stiff-string partials with B > 0.
- These replace the fixed gates of v1.2 and Reevo. Reevo's clap test alone rejected real notes on 71 of 88 keys.
- Two more piano-specific terms join the evidence: a hammer click at onset (9.5), and a decay over the first 100 ms that matches the key's calibrated λ1.
- Searched parameters are charged. An alternative that searches a parameter, such as the harmonic source's f0 or the pure tone's frequency, fits any spectrum slightly better by chance. Its gain is charged the log of the number of distinguishable settings it searched (an Occam factor), with the exact charge fitted in the evidence calibration (9.9). Without the charge the harmonic source would edge out real digital-keyboard notes, whose partials are nearly harmonic; with it, an alternative must explain the bins clearly better, not just as well.

### 9.5 Onset, re-strike and harmonic-interval evidence

- The three onset clues (7.5) are combined by a per-register logistic model fitted on the corpus (9.9) into λ\_on(k), in nats.
- For a silent key, onset evidence is λ\_on plus the joint-model gain Λ\_J, which says the pitch is present.
- For a sounding key, re-strike evidence uses the click, the phase surprise and the rise above the two-slope prediction. Level alone never triggers a re-strike, because beating unisons raise the level by several dB periodically.
- Same-key repeats at 6–8 per second are 125–167 ms apart, far longer than the 15–20 ms it takes to detect a strong note (2.4).
- A key thump (a 5–10 ms low knock) is explained by the transient template plus the click. It leaves no sustained partials, so it gives no key evidence once it passes, and its click is credited to the key whose partials rise at the same moment.

**Harmonic-interval test.** A candidate k is covered when every partial of k lies within one bin of a partial of a sounding key j: the n:1 intervals of 2.8, where j may be a played key, a backing note or a ringing tail. Its per-hop joint-fit gain then mostly measures j's template error, which lasts the whole note, so it is not accumulated. Instead, the key is judged by one test per strike, of j or of k, combining four cues, calibrated into nats like other evidence (9.9) on take 12 (5.2):

1. **Own attack:** a click and phase surprise of k at a moment when j is not starting. A click within 2 hops of j's onset belongs to j; any later strike of k is judged like a normal onset.
2. **Power excess** over j's template at the shared partials, in units of j's template spread σ\_T (measured per register in Phase 0, refined from confident isolated notes as in 8.12). It is computed on power, never in dB (2.8): z ≈ 2.5 for an equal upper note over 8 shared partials, 1.1–1.3 when it is 6 dB softer.
3. **Beating at calibrated rates:** with k sounding, shared partial h beats at |f\_{k,h} − f\_{j,nh}|, known from calibration, 9.6 dB deep peak to peak even when k is 6 dB softer. The cue is read after one beat of the fastest shared partial above noise, so the NoteOn can come one beat late, about 200 ms at 5 Hz, still carrying the attack's timestamp. In the bass refinement frames (9.7) the same gap shows directly as two peaks once it exceeds about 6 Hz.
4. **Priors:** expected keys in lessons shift the threshold as for any key (2.5).

The test must also beat three other causes of extra energy on j's partials, each bounded by measurement (9.3): sympathetic ringing of k's undamped string (no click, slow rise, at most the level measured in take 12), phantom partials of loud bass notes (part of the loud calibration template, 8.5), and microphone distortion (during overload, 6.5, the test is suspended and k is reported only with its own click).

### 9.6 Release evidence

- For a sounding key whose release is observable (8.6), a CUSUM watches the residual r = observed − predicted level (dB) for a drop of the key's calibrated step S:

```latex
\lambda^{off}_t = -\frac{S}{\sigma_L^2}\left(r_t + \frac{S}{2}\right)
```

- A second CUSUM watches for the slope change over a sliding 14-hop window.
- Correlated residuals: unison beating swings the level slowly, so a plain CUSUM would add up a beat's downswing as a release. Both CUSUMs therefore run on the residual's prediction error from the previous few hops, using a short linear predictor fitted on the calibration hold: slow beating is predictable, a damper's drop is not. Their increments are then divided by their τ, measured on held notes (2.4), and σ\_L is the spread of that prediction error.
- The release is declared when either reaches h\_off = 8 nats. Its timestamp is the change point, the hop where the CUSUM last left zero.
- Keys whose release is unobservable, and all keys while the pedal is down, end when their partial energy stays below noise + 3 dB for 50 ms. These are marked as acoustic ends and their length is not graded.

### 9.7 Bass refinement

- From the onset of any candidate in A0–B1 (and C2–B2 on the PSR-E343), the 8192 frame is computed every second hop. Once it covers the note, partials from 8 up separate neighbours by energy, and frequency precision reaches 0.004 Hz (2.2).
- The NoteOn is not held back: the first decision uses the 4096 and low-delay frames. If the 8192 frames later favour the neighbour by more than 6 nats, after division by their τ (2.4), the note is corrected with a revision event at the same timestamp (10.7). This should be rare, mostly soft bass notes.

### 9.8 Cluster fallback (built only if needed)

- When two adjacent keys both have strong evidence, a parametric estimator (ESPRIT or matrix pencil) on a narrow band around one shared partial checks whether two tones are really there.
- It can resolve tones closer than the window's resolution at high SNR, but degrades quickly at low SNR, so it confirms and never creates notes.
- It is built only if Phase 8 shows minor-second clusters missing their gate.

### 9.9 Evidence calibration: making every number a true log-likelihood ratio

- All evidence terms for a key and hop are combined by logistic regression trained on the labelled corpus, one model per register. Evidence is then Λ = logit P(event | features) − logit π\_train, which removes the training prior.
- **Correlation over hops:** the regression is linear in its terms, so each term's contribution is divided by that term's integrated autocorrelation time τ before it reaches the CUSUM (2.4). The click on non-overlapping frames has τ = 1; terms from tier frames have their tier's value. τ is measured on the Phase 0 silence takes, pooled over each tier's keys to a few per cent, clamped at 1 or more, and stored with the coefficients. This is what makes the thresholds in 2.4 mean what the formula says.
- **Context terms:** one feature is the share of the key's template power lying on partials of sounding keys, with interaction terms on the joint-fit gain and the attack terms. As the share grows, weight moves from the joint-fit gain, which then mostly measures the other key's template error, to the key's own click and phase surprise. At full coverage the harmonic-interval test (9.5) takes over.
- **Checks:** calibration is checked per hop, before the τ division, with reliability diagrams (predicted against observed frequency in 10 bins) and the Brier score; expected calibration error must be at most 2%. The division itself is checked by counting false notes on recorded noise (13.2).
- **Upgrade path:** if the division slows attacks measurably, each term is whitened instead, by subtracting its prediction from the previous hops. That keeps a sudden rise whole while removing repeated noise.
- The coefficients and τ values are refitted whenever features change. They belong to the engine build, not the user's profile.

### 9.10 Cost budget

| Part | Target per hop on the iPhone 13 Pro Max |
| --- | --- |
| FFTs, all tiers | ≤ 0.2 ms |
| Partial frequencies and noise tracking | ≤ 0.1 ms |
| Joint fit: up to 64 templates on sparse supports (about 5,000 template–bin pairs), 10 warm-started iterations and local leave-one-out refits; about 0.3 million operations, against 4.3 million for a dense fit over all 3,587 bins | ≤ 0.6 ms |
| Evidence with τ scaling, interval tests and CUSUM for every key | ≤ 0.1 ms |
| Echo canceller in practice mode, up to 384 ms long: about 0.35 million operations while adapting, 0.15 million when frozen | ≤ 0.1 ms |
| Total DSP | ≤ 1 ms typical, ≤ 2 ms at the 99th percentile |

### 9.11 Exit criteria

- [ ] Once a note is detected (mf, phone within 1 m), it is the right key at least 99.5% of the time in every register, A0–B1 included.
- [ ] Whistle, clap, speech and TV takes: at most 6 false notes per hour.
- [ ] Soft-under-loud takes: at least 90% of the soft notes detected.
- [ ] Same-key repeats at 6 per second: at least 97% detected.
- [ ] Evidence calibration error at most 2%.
- [ ] Processing time within the budget.
- [ ] Harmonic intervals struck together at equal level (take 12): at least 90% of upper notes confirmed; single lower notes: at most 1 false upper note per 100.
- [ ] Sparse and dense joint fits give the same evidence within 0.1 nats on the corpus.
- [ ] τ measured for every evidence term and tier; false notes on noise spread over registers in proportion to their keys.

## 10. Phase 5 — Decision layer: per-key states, thresholds, timestamps, velocity

Each key runs Reevo's five-state machine, now driven by CUSUM statistics on evidence in nats. A NoteOn carries the estimated onset time, never the moment the decision was made.

&#91;embedded content: Per-key state machine · 5 states, 9 transitions\]

Thresholds come from the false-alarm budget and the lesson priors (2.4, 2.5). The dashed veto exists only in fused mode.

### 10.1 States and transitions

| State | Meaning | Leaves when | Emits |
| --- | --- | --- | --- |
| IDLE | Key silent | Onset CUSUM rises above 0: to PENDING | — |
| PENDING | Onset evidence building | CUSUM reaches h\_on(k, t): to ACTIVE. CUSUM falls back to 0: to IDLE | NoteOn with the onset timestamp (10.3) |
| ACTIVE | Key sounding | Re-strike CUSUM reaches h\_re: to RETRIGGER. Release evidence reaches h\_off, or energy at the floor for 50 ms: to RELEASE. Fused veto: to IDLE | NoteRetract on veto |
| RETRIGGER | Struck again while sounding | Immediately: back to ACTIVE | NoteOff, then NoteOn, both at the re-strike time |
| RELEASE | Tail decaying after the key is released | Predicted tail below noise: to IDLE. New onset evidence: to PENDING | NoteOff on entry, with the release time |

In RELEASE the key stays in the joint model until its tail falls below noise, so a ringing tail cannot trigger ghost onsets on the same or related keys.

### 10.2 Thresholds

- **Onset:** h\_on(k, t) = h − \[logit π\_k(t) − logit π0\], with h = ln(K × 675,000 ÷ R\_FA) and K the number of keys in the instrument's range (2.4, 2.5).
- **Re-strike:** h\_re = h\_on, because a false re-strike is as wrong as a false note.
- **Release:** h\_off = 8 nats. A false release only affects note-length grading, so a lower threshold buys faster releases: a 1 dB step is detected in about 4 hops (8.6).
- **Fused veto:** a tentative note is withdrawn when its fused probability drops below 0.1, a log-odds of −2.2.
- **Hysteresis:** each CUSUM resets after its event, so states cannot chatter.

### 10.3 Timestamps

- t\_on = sub-hop onset estimate (7.6) − input latency (6.6) − register bias.
- The register bias is the mean of (estimated − true onset) per register on the corpus, measured in Phase 8 and subtracted.
- A NoteOff's time is its release CUSUM's change point (9.6).
- The screen shows a note when it is decided; grading uses t\_on (2.10).

### 10.4 Velocity and session gain

- 30–50 ms after the onset, once the attack template is reliable, the joint fit (9.3) gives the note's level L (dB relative to calibration) and brightness β.
- Session gain is the median, over the last 20 confident notes, of L minus the calibrated level predicted from brightness alone (2.9). With a 4 dB per-note error, the median of 20 is accurate to about 1.2533 × 4 ÷ √20 = 1.1 dB.
- Velocity comes from the calibrated mapping of (L − Ĝ, β) to 0–1, then to as many dynamic levels as the measured error allows (2.9).
- If touch response is off on a digital keyboard, the soft and loud calibration strikes land within 2 dB of each other, and dynamics grading switches off automatically.
- Observability follows the phone. The room's reverberant level does not depend on where the phone is, so a session-gain change ΔG moves only the direct sound, and the new ratio is 10^(DRR′/10) = (1 + 10^(DRR/10)) × 10^(ΔG/10) − 1. Whenever Ĝ moves by more than 2 dB, each key's release step (2.7) is rescaled and the observability map (8.6) is re-judged.

### 10.5 Voices

At most 32 keys can be in ACTIVE or RELEASE at once, matching the PSR-E343's polyphony and dense pedalled passages. When a 33rd starts, the key whose predicted level is closest to the noise floor ends with an explicit NoteOff, so no key can stick (case 14). Its sound has not ended, so it stays in the joint model as a tail-only template: its 8 strongest partials, with amplitude bounded by its predicted decay (9.3), until that prediction falls below noise. Otherwise its ringing would be blamed on related keys as ghost onsets (2.8). The joint model holds up to 64 templates; when it is full, the tail with the lowest predicted level leaves first.

### 10.6 Pedal

- The sustain pedal is not seen directly. The neural pedal head (14.2) estimates it, and in lessons the score's pedal marks act as a prior.
- While the pedal is judged down, NoteOff is the acoustic end of the note and note length is not graded.

### 10.7 Events and revisions

- Event types: NoteOn, NoteOff, NoteConfirm, NoteRetract, NoteCorrect, Verdict and Status (12.2). A Verdict is the matcher's judgment on one expected note (11.5).
- In fused mode a NoteOn stays tentative until confirmed; at most 2% may be withdrawn.
- Status events cover clipping, overload, a noisy room, route changes, interruptions, "transpose suspected" (a run of notes all off by the same whole number of semitones, 11.1), "piano mismatch" (confident notes that keep missing the profile's partials by more than 3σ, the quality check's own test, 8.10), and "calibration needed" when global drift passes 30 cents or noise rises 10 dB above calibration.

Each status has one of three tiers, which decides what a lesson does:

| Tier | Statuses | The lesson |
| --- | --- | --- |
| Pauses the lesson | Interrupted, route changed, microphone refused, transpose suspected | Pauses with every key already released; the student taps Resume (6.7) |
| Notice while playing | Noisy room, microphone overloaded, neural engine off for heat, timing off on Bluetooth | Shows a short message; playing continues |
| Message after the lesson | Calibration needed, piano mismatch | Shown on the results and chapter screens until resolved |

### 10.8 Exit criteria

- [ ] No NoteOff–NoteOn pairs closer than 30 ms on the same key except real re-strikes, checked against ground truth.
- [ ] Timestamp gate from section 1 met in every register.
- [ ] Session gain settles within 10 notes after the phone is moved 1 m.
- [ ] No stuck notes in an hour of pedalled free play.

## 11. Phase 6 — Modes and grading: learning, practice with Jingle Bells, free play

The three modes share one engine and differ only in their priors and in what they grade. Lessons get their accuracy from knowing what should come next: about 4.9 bits of uncertainty per step instead of 19–21 bits in free play (2.5).

### 11.1 Learning mode (no backing)

- **Score:** the lesson's timeline in JSON: for each expected note its startMs and durationMs, pitch, written value, hand, finger and lyric. Lessons are written as JSON rather than imported from MIDI or MusicXML, and each note's window (11.5) is computed once and sent with the score.
- **Position:** with wait-for-correct on, the lesson flows at its tempo and stops at each event not yet played; the expected set is that event, and its right key counts from earlyMs before it. A chord completes when each of its keys has been struck once, in any order. The engine moves the position itself and tells the app afterwards, so the next note never waits for JavaScript; while it waits, the clock's rate is 0 (6.2). Without it, an online score follower (online dynamic time warping, Dixon 2005) estimates position and tempo from the detected notes.
- **Strikes outside the windows:** a strike outside every window, the right key played too early included, is an extra note, and nothing turns red. The checklist look (4) changes only the screen, not this behaviour.
- **Priors (2.5):** expected keys 0.9; typical mistakes (±1, ±2 and ±12 from each expected key) 0.03 each; every other key 0.002.
- **Which key was played:** when an expected key k and a neighbour j both have evidence, the neighbour must out-score k by the prior gap ln(0.9 ÷ 0.03) = 3.4 nats. For a clean note the frequency evidence separating neighbours is usually far larger (2.2), so the prior decides only marginal cases.
- **Reporting a mistake:** a wrong note is reported only when its probability is at least 0.9. A false accusation is weighted 9 times a missed slip, and the optimal threshold is 9 ÷ (9 + 1). Below 0.9 the note counts as unclear: in wait mode the app simply keeps waiting, without accusing.
- **Learning each student's mistakes:** Beta counts of each mistake type (neighbour, octave, other) are kept per student. The typical-mistake prior becomes their posterior mean, held between 0.005 and 0.1, so a student who often slips to a neighbour gets slightly more sensitivity to that slip.
- **Transpose watch:** a run of notes all off by the same whole number of semitones is not reported as wrong notes. A transpose switched on after calibration makes every correct key sound as another key, perfectly in tune (8.3), so the lesson pauses and asks "Is Transpose on?" (status transpose suspected, 10.7). The run length is an engine setting (4).

### 11.2 Practice mode: the backing-song timeline

- A practice song consists of backing audio rendered from MIDI, the backing MIDI itself, the piano part the student plays, a tempo and a one-bar count-in.
- **First song: Jingle Bells** (James Lord Pierpont, 1857, public domain). The chorus in C major keeps the right hand in five-finger position, C4–G4. Played twice, it is 16 bars, which at 120 BPM is 32 s, after a 2 s count-in.
- **Arrangement rules for detectability:**
  - The backing never doubles the melody.
  - The bass line sits in C2–G2, where the phone speaker reproduces mostly overtones.
  - Chords are soft pads in C3–B3, without sharp attacks.
  - Sleigh bells and percussion are allowed, because their timing is known.
  - The backing uses no piano sound.
- Expected notes are locked to song time. Each expected onset on the output timeline is mapped onto the input timeline using the measured round trip (6.6), and the prior applies within ±150 ms of it.
- **The staff follows what is heard:** the playhead reads song time from the engine's clock (6.2), anchored to the output samples, so it matches the backing after output latency. A JavaScript timer would run ahead of the sound by tens of milliseconds on the speaker and 100–300 ms on Bluetooth (6.6).
- **The backing in memory:** before Ready, react-native-audio-api decodes the backing, a 16-bit 48 kHz mono FLAC, resampled to the engine's output rate, and loadBacking hands the samples to the engine, which keeps them in memory and plays them itself. FLAC is lossless and sample-exact, so the song starts exactly on its first beat. The backing MIDI arrives as a JSON note list made when content is built, so the app never parses MIDI.
- **End:** the lesson finishes when the last window closes or the backing ends, whichever is later.
- **Loops:** with looping on (4), the student repeats a section between two bar lines: a count-in before the first pass only, then the engine jumps back at the bar line itself (setLoop, 12.1). Each pass resets the section's verdicts; passes are practice, and only a full play-through counts as an attempt. Learning mode loops the same way, without the count-in.
- Each note's timing error is ε from 2.10.
- During the count-in's 4 clicks the echo canceller adapts while no piano plays, and the click arrival times re-check the round trip.

### 11.3 Echo canceller and known backing notes

- The phone's speaker sits centimetres from its microphone, so the backing reaches the microphone far louder than the room hears it. At about 5 cm, against a room's critical distance of roughly 0.3–1.3 m, the room's echo arrives 16–28 dB below the direct path, usually 20 dB or more.
- **Canceller:** a partitioned-block frequency-domain adaptive filter (Soo and Pang, 1990), using the exact output buffer as its reference. It starts from the echo response measured by the chirp test (6.6), so a long filter does not have to learn from zero.
- **Length from the measured decay:** the echo tail beyond the filter must sit at least 6 dB below what the filter leaves of the part it covers. With 25 dB of cancellation and the room's echo 20–24 dB below the direct path, the tail must fall 7–11 dB below its start: about 60–90 ms at RT60 = 0.5 s, 120–180 ms at 1 s and 230–370 ms at 2 s. The length is read off the chirp response's energy decay curve (Schroeder integration), rounded up to whole 256-sample partitions, between 128 and 384 ms. A fixed 128 ms fails rooms above an RT60 of about 0.7–1.1 s; any tail beyond 384 ms is left to the bounded templates below.
- **Adaptation:** fast during the chirp test and the count-in, then 10 times slower, and frozen in any hop with a sounding or candidate piano note. Freezing during double-talk stops the filter learning to cancel the piano.
- **Known notes, bounded:** phone speakers distort, so some backing remains. Each backing note enters the joint model (9.3) with its known timing and an amplitude bounded to the predicted residual (note level × echo path gain × measured cancellation), within three standard deviations, about ±6 dB. After the note ends, its template continues down the room's decay (60/RT60 dB per second) until it reaches noise, so the uncancelled tail is explained too. A free amplitude could absorb a student's note on the same pitch or an octave above; the bound stops that, and any excess counts for the student.
- **Interval partners:** backing notes count as sounding keys in the harmonic-interval test (9.5), because the pads in C3–B3 sit an octave below the melody (11.2).
- **Echo path watch:** if backing templates sit at their upper bound over several consecutive backing notes, the echo path has changed, usually because the phone moved. Adaptation runs fast again in the next piano-free hops, and the UI suggests rerunning the chirp test or using wired headphones.
- **Floor for grading:** during the song each bin's floor is its noise plus the predicted backing residual. Release observability (8.6) and soft-note detectability are judged against this floor note by note, so a release hidden by the backing is not graded.
- **No iOS voice processing:** its automatic gain and noise suppression are designed for speech and alter piano tone.
- **Backing volume:** the app sets it so the leftover backing at the microphone stays at least 10 dB below a typical mf note at the calibrated distance, using the calibration levels and the measured echo path gain.
- **Fallback:** if cancellation measures below 15 dB, or the backing raises false notes above the gate, the app recommends wired headphones. Bluetooth headphones switch timing grading off (6.6).

### 11.4 Free play

- Every key in the instrument's range gets prior 0.01; keys outside it get 0 (2.5).
- An optional hint adds 0.5 nats to the notes of the piece just practised. It is off by default.
- All 26 cases apply at full difficulty here, and this is where the neural model matters most (14).
- **What the student sees:** each note is written on a grand staff as it is played, at freePlayWriteAt (4), from the same read that lights its key. Free play has no tempo, so notes are placed by onset time rather than written as note values, with sharps by default. A tentative note is drawn faint until confirmed, erased if retracted and moved by NoteCorrect (12.3).

### 11.5 Grading engine (declarative)

- **Matching:** live, as notes arrive. Each expected note has a window on both sides of its onset (4), and windows on the same hand never overlap: each is cut to half the gap to the next note. A detection is judged against the expected note whose window holds it, so one strike never counts for two notes and the grade shown live is the final one; this replaces optimal assignment after the fact. Each expected note becomes correct (with its offset, perfect or good), wrong (with the key played) or missed; unmatched detections are extra notes.
- **Verdicts:** the right key inside the window is correct the moment it is heard, and stays final unless the engine withdraws the note (12.3). A wrong key is reported only at probability 0.9 or more (11.1), and turns correct if the right key comes before the window closes; below 0.9 the note is unclear, never wrong. A note with nothing played inside its window is missed when the window closes. With wait-for-correct on, the staff stops at a note not yet played: a sure wrong key is reported, and the right key is correct, on time within lateMs of the stop and late after it.
- **Key:** correct if the matched key equals the expected key, after transpose correction.
- **Timing:** on time if −earlyMs ≤ ε ≤ lateMs, from the configuration (4); the inner half of the window counts as perfect, the rest as good. The report also gives the mean and spread of ε, which show rushing or dragging.
- **Dynamics (if enabled, with touch response on):** the detected dynamic level is compared with the score's marking, using only as many levels as the measured velocity error allows (2.9).
- **Note length (if enabled):** held duration ÷ written duration, for release-observable keys without pedal only.
- **Summary:** a score from 0 to 100, the average credit per expected note: perfect 100%, good 75%, late 50%, at most 50% after a wrong key on the same note, and 0 for wrong or missed. Unclear notes are not counted, so uncertain notes are never penalised, and extra notes are listed without lowering the score. Dynamics and note length join with their own weights when they are enabled.

### 11.6 Exit criteria

- [ ] Learning mode, Jingle Bells chorus, 10 takes with deliberate mistakes: at least 95% of ±1-semitone mistakes reported, and at most 1 false accusation per 100 correct notes.
- [ ] Practice mode with backing from the phone speaker: at most 6 false notes per hour caused by the backing, and timing error 95th percentile ≤ 10 ms against ground truth.
- [ ] Echo cancellation of at least 15 dB on the test phones, speaker route.
- [ ] Free play meets the gates in section 1 on the corpus.

## 12. Phase 7 — Integration: JSI bridge, events, persistence, legacy toggle

Integration keeps Reevo's zero-copy event buffer and, once a spike passes, replaces its hand-written JSI host object with Nitro HybridObjects (12.1). Two principles hold: JavaScript only reads finished events and never runs DSP, and the screen never waits for JavaScript, because the UI thread reads the engine's tables itself. One C++ core serves iOS, Android and the desktop test harness.

### 12.1 The JSI surface

| Method | What it does |
| --- | --- |
| start(config), stop() | Open or close audio and start the DSP and neural threads; returns immediately. Stopping also releases every key |
| setConfig(config), getConfig() | Validate and swap the configuration at the next hop; read the current one |
| liveKeys, verdicts, clock | Read-only objects for the UI thread's frame callback: LiveKeys, the VerdictTable and the Clock (3.2). Calls take and return numbers, and changes are copied into a buffer each reader allocates once |
| Event listener | Wakes JavaScript once per batch of new events; each listener follows the ring with its own cursor, and a reader the ring has lapped rebuilds from the tables |
| setScore(score), setLessonPosition(note) | The expected notes with their windows (11.5), the bar start times and, in practice mode, the backing notes, sent before start or while paused, which also allocates the VerdictTable; the lesson cursor, moved on restart |
| startPractice(fromBar) | Lock the backing and the expected notes to song time from that bar: at Start, and on resume |
| pause(), resume() | Hold the clock, or re-anchor it (6.2) |
| loadBacking(samples, sampleRate) | Take the backing samples, decoded from FLAC by react-native-audio-api, into memory before Ready (11.2) |
| setLoop(fromBar, toBar), clearLoop() | Repeat a section between two bar lines; the engine jumps back itself (11.2) |
| beginCalibration(mode), calibrationStep(), getCalibrationState(), commitProfile() | Drive the calibration state machine (8) |
| runLatencyTest() | Chirp test (6.6) |
| loadProfile(id), exportProfile(), importProfile() | Profile management (8.11) |
| getTelemetry(), getDiagnostics() | Processing time, late hops, noise level, rejection log |

In Reevo, pollEvents ran the DSP inside the JavaScript animation frame. Here nothing is polled: the DSP thread writes the tables and the event ring (6.4), the UI thread reads the tables every frame, and JavaScript is woken once per batch.

The objects are Nitro HybridObjects written in C++ (12.6), callable from the UI thread's worklets as well as from JavaScript, with their TypeScript types generated from one spec. They replace the TurboModule and its hand-written host object once a spike on the iPhone passes (12.7); if it fails, the TurboModule stays, with the host object rewritten on jsi::NativeState.

### 12.2 Event format

| Field | Meaning |
| --- | --- |
| type | NoteOn, NoteOff, NoteConfirm, NoteRetract, NoteCorrect, Verdict, Status |
| noteId | Links a note's NoteOn, NoteOff and any revision |
| midi | The MIDI number; the key index (MIDI − 21) stays inside the engine |
| onsetSample, timeMs | 64-bit sample position and the latency-corrected time in ms (2.10) |
| velocity, dynamicLevel | 0–1, and the level index allowed by the velocity error (2.9) |
| confidence | Probability that the note is real and is this key |
| source | dsp, neural, fused or legacy |
| flags | Tentative, release observable, acoustic end, outside focus |
| expectedId, verdict, offsetMs, tier | Verdicts only: the lesson note judged; correct, wrong, missed or unclear; how early or late in ms; perfect, good or late; whether a wrong key came first; the loop pass |
| status | Status events only: the status code, whose tier is in 10.7 |

Events are fixed 48-byte records in a ring of the last 256 events. JavaScript is woken once per batch, never once per note, and each reader follows the ring with its own cursor; in free play the UI thread follows it too.

### 12.3 UI contract: tentative notes and revisions

- A DSP NoteOn shows at once. In fused mode it is drawn as tentative until NoteConfirm arrives (within about 80 ms) or NoteRetract withdraws it. The target retraction rate is at most 2% of shown notes.
- In lessons, an expected note turns green the moment its correct verdict lands, even while tentative, and red only for a wrong key at probability 0.9 or more (11.1), or as missed when its window closes (11.5). A key and its note change in the same frame, because both come from one read of the tables.
- NoteCorrect, from the bass refinement (9.7), swaps the key and keeps the timestamp.
- In free play the written staff follows the same revisions: a tentative note is drawn faint, a retracted one is erased, and NoteCorrect moves it (11.4).
- Grading uses confirmed notes only, and timing uses onset timestamps, never arrival time (2.10).
- **Key glow:** while a key is down, its yellow follows the level in LiveKeys: glow = floor + (1 − floor) × level, with the floor at mid yellow (0.55), so a soft note stays visible. It jumps on a strike, falls at most 2.0 per second, flashes back on a re-strike, fades out over 150 ms on release and stays lit at least 120 ms. When its note is judged, the key shows the result's green or red for 300 ms, then returns to its glow if still held. Until the joint model (9.3) runs, the level is approximated from velocity and a decay.
- **Results with shapes:** every result pairs its colour with a shape or movement, so colour-blind players can read it: a correct note pops, a wrong one shakes, a missed one shows a cross. The note to play now is indigo, so red only ever means wrong.

### 12.4 Configuration and persistence

- Configuration and profiles live in app storage (MMKV), versioned, with migrations when the schema changes.
- Per-student history stays on the device: mistake counts, sessions and AttemptRecords. An AttemptRecord is every verdict of one attempt, in order, as data (key, time and verdict), never audio; replayed through the replay engine, it becomes an automated test.
- Lesson content (chapters, lessons and media) is bundled with the app now and will come from Firebase later, behind one content source. A lesson's revision number marks saved results and caches as stale when its content changes.
- Calibration audio snippets are kept for neural adaptation (14.8), and the user can delete them.

### 12.5 Legacy engine toggle

- Setting evidence to legacy routes audio to v1.2 unchanged. Its events are converted to the format above, marked with source legacy.
- The user can A/B both engines on their own piano until Phase 8 shows the new engine wins (13.5). v1.2 is then removed.

### 12.6 One core, two platforms

- The shared C++ core holds the front end, evidence, decisions, calibration and grading. Platform shells handle only audio input and output (Oboe and AAudio on Android, RemoteIO on iOS), thermal state and storage.
- The bindings are C++ as well: Nitro HybridObjects shared by iOS and Android, with generated registration in place of the hand-written iOS provider and Android OnLoad.cpp. Only the bindings see React Native, and all of it lives in the CoreEngine package (1).
- Android builds with CMake and the NDK for arm64-v8a with NEON. iOS builds for arm64 with Accelerate (vDSP). Reevo's SIMD radix-2 FFT stays, with a scalar fallback for the desktop harness (5.6).

### 12.7 Exit criteria

- [ ] The screen never waits for JavaScript: all of the frame callback's reads (LiveKeys, the VerdictTable and the Clock) take at most 0.2 ms at the 99th percentile on the iPhone, in a Release build.
- [ ] Nitro spike: a C++ Clock HybridObject read from the frame callback on the iPhone works from the UI runtime, costs no more per frame than today's host object, and leaves the core's ThreadSanitizer tests unchanged.
- [ ] A configuration swap while playing causes no glitch and no stuck note.
- [ ] iOS, Android and the desktop harness give identical keys on the corpus, with timestamps within 1 sample.
- [ ] The legacy toggle switches engines without restarting the app.

## 13. Phase 8 — DSP validation and release gate

The DSP engine becomes the default only when it meets every gate in section 1 on held-out recordings and beats v1.2 in a paired test. Everything here runs automatically in the harness (5.6).

### 13.1 Fit the evidence models on a clean split

- The corpus is split by session and room, never by random hop or note. Neighbouring hops are strongly correlated, so a random split would put near-copies of test audio into training and overstate accuracy.
- The logistic evidence models (9.9) are fitted on the training split. Every number reported afterwards comes from the test split.

### 13.2 Verify the thresholds on recorded noise

- Run the noise takes (at least 0.5 h per condition, 5.4) and count false notes per hour.
- With every evidence term divided by its τ (2.4), the false-alarm rate again falls as e^(−h), so one correction step reaches the target: h\_new = h + ln(R\_observed ÷ R\_target). For example, 12 per hour observed against a target of 6 raises h by ln 2 = 0.69 nats. Without the division the rate would fall only as e^(−h/τ), and this step would under-correct by a factor of τ, up to 7.7 in the bass.
- The step is a trim of at most ±1 nat. A larger correction means a wrong τ or evidence model, which is fixed at its source; raising h instead would slow every note to hide one term's error.
- False notes must spread over registers in proportion to their keys (chi-square test). A pile-up in one register points to that tier's τ.
- Repeat until the observed rate's 95% upper bound is at or below the target.

### 13.3 Gate metrics

The gates from section 1 are measured in every register × loudness × distance cell, with 95% confidence intervals. A cell passes when its interval clears the gate, not merely its average.

### 13.4 Covering-array scenarios and directed stress tests

The covering-array configurations (5.2) test combinations; these directed tests target known physical edge cases:

| Test | Case |
| --- | --- |
| A0 and A♯0 alternating, mf and pp | 1, 11 |
| Octave C3+C4 struck under a loud C2 | 10, 20 |
| Octave, twelfth and double octave, struck together and 30 ms apart; upper note equal, softer and much softer (take 12) | 5, 10, 20 |
| Lower note with the upper key held silently, pedal up and down (take 12) | 10 |
| Trill at 12 notes per second across the bass break | 4, 16 |
| Chord change with the pedal held | 7, 14 |
| Pedalled glissando over 40 or more keys, forcing voice eviction | 10, 14 |
| Soft melody over a loud bass chord | 2, 5, 10 |
| Same key 8 times per second at one loudness | 4, 7 |
| Staccato notes in the echoey room | 2, 12 |
| Held undamped treble note | 12 |
| Glissando, rolled chord, grace notes | 4, 5, 20 |
| Whistle at a piano pitch; speech while playing | 13 |
| Backing song from the phone speaker | 19 |
| Backing alone for 5 minutes in the echoey room (take 13) | 19 |
| ff bass notes with the phone at 0.3 m: phantom partials and overload | 10, 15 |
| Phone lying on the piano top | 3, 15 |
| Route change mid-note; 500 ms system stall | 18 |
| PSR-E343 Tuning function set well flat (about 40 cents if its range allows), standing in for an out-of-tune piano | 8, 9, 17 |

### 13.5 A/B against v1.2 (paired)

Both engines run on exactly the same notes, so the right test is McNemar's on the notes where they disagree. b counts notes the new engine detected and v1.2 missed, and c the reverse:

```latex
\chi^2 = \frac{\left(|b - c| - 1\right)^2}{b + c}, \qquad \text{significant at } p < 0.05 \text{ when } \chi^2 > 3.84
```

- The new engine replaces v1.2 when it is significantly better on detection and not worse on false notes.
- False notes are compared with an exact conditional test: given the total count, the split between the two engines is binomial with p = 0.5 if their rates are equal.

### 13.6 Soak, thermal and battery

- One-hour continuous sessions on each test phone. The processing-time 99th percentile must stay stable, and DSP-only mode must not reach the serious thermal state.
- Battery drain per hour is measured and reported for each engine mode.

### 13.7 Regression

Every change reruns the full corpus and all directed tests. A change fails if any gate metric worsens by more than its confidence interval.

### 13.8 Exit: the DSP release

- [ ] All section 1 gates met on the test split, cell by cell, with confidence intervals.
- [ ] False notes per hour verified on recorded noise in every condition.
- [ ] Significantly better than v1.2 on detection (McNemar, p < 0.05) and not worse on false notes.
- [ ] Soak and thermal tests passed on all test phones.
- [ ] DSP becomes the default engine and v1.2 is removed.

## 14. Phase 9 — Neural model, step by step

The neural engine is trained before the app ships, adapts to each piano at calibration, and feeds the same decision layer as DSP. It becomes the default only in the modes where measurement shows it wins.

Why add it at all: hand-written likelihood models never fully match real rooms, phones and pianos. In published work, training with augmentation (more piano sources, room and phone responses, noise) raised note accuracy on real phone recordings from 78.8 to 93.2 F1 (Mobile-AMT on IDMT-PIANO-MM). DSP stays best at fast first detection, timestamps and calibration; the network is best at chords, ghost notes, noise and the pedal.

### 14.0 Build order

| Step | Work | Exit check |
| --- | --- | --- |
| N1 | Feature pipeline in C++, called from Python through bindings (14.3) | Golden vectors identical in training and on device |
| N2 | Data: MAESTRO prepared; PSR-E343 self-play recorded; acoustic takes labelled; splits frozen (14.5) | At least 20 h of PSR audio; splits disjoint by piece, session and room |
| N3 | Baseline: train on MAESTRO without augmentation (14.7) | Scores recorded on all three test sets as the reference |
| N4 | Add augmentation (14.6) | Clear gain on phone test sets over N3 |
| N5 | Fine-tune on own recordings | Further gain on held-out own sessions, no loss on MAESTRO test |
| N6 | Calibration conditioning and normalisation (14.8) | Gain on the held-out piano or room over N5 |
| N7 | Output calibration and prior removal: outputs become evidence in nats (14.9) | Calibration error at most 2% |
| N8 | Fusion weights and decision-layer integration in the harness (14.9) | Fused beats DSP on the test split (McNemar) |
| N9 | On-device deployment, quantisation, thermal fallback (14.10) | Real-time factor at most 0.3; int8 loss at most 0.5 F1 points |
| N10 | Evaluation and engine choice per mode (14.11) | Default engine chosen per mode by the decision rule |
| N11 | Improvement loop (14.12) | Each new model passes the full gate before replacing the old one |

### 14.1 Role and interface

- The network outputs the same evidence as DSP (onset, sustain and release for every key, in nats), every 10.67 ms, i.e. every second DSP hop. The configuration's engine switch changes only where evidence comes from (4).
- In neural-only mode the network decides what was played. The cheap DSP front end still supplies precise timestamps (7.6), or the network's own onset-offset head does.
- Latency: 64 ms of look-ahead plus at most 16 ms of compute gives evidence about 80 ms after the sound, the configuration's neuralBudgetMs. Published low-latency piano transcription keeps 90.5% note F1 at 64 ms against 93.4% at 160 ms.

### 14.2 Task formulation

- For every key and frame the network picks one of 5 mutually exclusive states: off, onset, sustain, re-onset, offset. These are Reevo's states and the decision layer's states, as in Kwon et al.'s multi-state formulation (2020).
- Output per key: a 5-way softmax, so probabilities sum to 1 and impossible combinations (onset with offset) cannot occur. Independent sigmoids would allow them.
- Extra heads: velocity, regressed on onset frames; the onset's position inside its frame (0 to 1), regressed as in Kong et al. (2021), for sub-frame timestamps in neural-only mode; and a global sustain-pedal probability.
- Labels come from MIDI. The onset frame holds the note-on; a re-onset is a note-on on a key already sounding; the offset is the key release with the pedal up, or the pedal release or acoustic end with it down, matching 9.6.

### 14.3 Input features, shared with the DSP front end

- The network reads the multi-resolution spectra the front end already computes (7.2), mapped onto one pitch axis at 4 bins per semitone over A0–C8 (352 bins). Each band takes its values from the tier that suits its frequency, as in Reevo's zones.
- Two channels per bin: (1) log power relative to that bin's calibrated noise, i.e. per-bin SNR, clipped to −10…80 dB; (2) the phase-vocoder frequency deviation from the band centre in cents (7.3), zeroed below 6 dB SNR. Magnitude alone throws away the frequency precision that separates neighbours by more than 100 σ (2.2); the second channel hands it to the network.
- **Calibration-aware harmonic stacking:** for harmonics h ∈ {0.5, 1, 2, 3, 4, 5, 6, 7, 8}, a copy of the axis is sampled at each key's calibrated partial frequency f\_{k,h} (8.8). Every partial of a key then lines up on that key's bins, so a small convolution sees the whole harmonic pattern (after Basic Pitch's harmonic stacking, Bittner et al. 2022). Plain h × f0 stacking would misalign partial 8 by 22 cents at B = 4 × 10⁻⁴ and far more in the treble.
- 9 harmonics × 2 channels = 18 input channels, one frame every 10.67 ms.
- When the device rate is not 48 kHz, audio is resampled to 48 kHz for these features only (6.2).
- The training pipeline calls the engine's own C++ feature code through Python bindings, so training and device features cannot drift apart.

### 14.4 Architecture: the key-wise model

This is the user's "small models working together" idea in its mathematically sound form: one small model per key with shared weights, specialised by conditioning, all reading one shared spectrum and each other.

1. **Harmonic front:** 4 causal 2-D convolutions over pitch × time. Layers 1–2 use 3 × 3 kernels; layer 3 is dilated by one semitone and layer 4 by one octave along pitch. The output is pooled from 4 bins to 1 per key.
2. **Cross-key layer:** for each key k and n = 2–6, the layer gathers the features at the point on the key axis whose partial n lands on k's fundamental: j\_n(k) = k − 12 log2 n − s\_n, where s\_n = 6 log2(1 + B n²) is the stretch of partial n in semitones, with B the calibrated value there (8.8). Features are interpolated between the two nearest keys. Fixed taps at 12 log2 n miss in the treble: at B = 6 × 10⁻³ partial 5 lies at 29.07 and partial 6 at 32.71 semitones, one to two keys from taps at 28 and 31. A ghost on key k comes from a real note at j\_n(k), so the gather lets every key see who could be causing it and explain it away. The positions are computed once per calibration, as a fixed sparse matrix of 88 × 5 × 2 weights, so they cost nothing at run time. A parallel width-3 kernel around the equal-tempered taps keeps the model working when calibration is poor, and training perturbs B (14.6). Training recordings get their B from the same calibration estimator (14.8).
3. **Key-wise recurrent core:** one GRU applied to every key with shared weights, 88 parallel copies. Sharing makes the model pitch-equivariant, so a pattern learned on C4 transfers to F♯5, with about 88 times fewer parameters than separate per-key models. That matters because personal training data is limited. Register differences enter through FiLM conditioning (14.8).
4. **Heads per key:** state softmax, velocity, onset position; plus the global pedal head.

All time operations are causal. Look-ahead is a 6-frame output delay (64 ms), trained with targets shifted by the same amount.

| Size | Conv channels, GRU units | Parameters | Compute | Weights (int8) | Intended for |
| --- | --- | --- | --- | --- | --- |
| Small | 24, 64 | 51 k | 0.70 GMAC/s | 0.05 MB | Mid-range Android |
| Base | 48, 128 | 187 k | 2.53 GMAC/s | 0.19 MB | iPhone 13 Pro Max and recent Android |
| Large | 96, 256 | 536 k | 8.16 GMAC/s | 0.54 MB | Only if Base underfits and the Neural Engine handles it |

The size is chosen on validation data within a compute budget of 3 GMAC/s (14.10), and can grow if more data supports it.

### 14.5 Data

| Source | Content | Labels | Use | Licence |
| --- | --- | --- | --- | --- |
| MAESTRO v3 | About 200 h of performances on Yamaha Disklavier grands | MIDI from the instrument, aligned to about 3 ms | Pre-training | CC BY-NC-SA 4.0; fine for personal, non-commercial use |
| PSR-E343 self-play | MIDI files played through USB, recorded by 3 phones at 0.3, 1 and 2 m in 3 rooms | The MIDI sent, clock-aligned (5.3) | Fine-tuning for digital-keyboard sound | Own |
| PSR-E343 live playing | Human playing with MIDI captured over USB | MIDI | Fine-tuning for human timing and dynamics | Own |
| Acoustic takes | Phase 0 protocol on the acoustic piano | Script with checked onsets | Fine-tuning and test | Own |
| IDMT-PIANO-MM | 432 recordings: 4 grands, 3 uprights, 1 stage piano; 8 rooms; phones and tablets | Score-aligned | Evaluation only, as its licence states | CC BY-NC-ND 4.0 |
| Noise and rooms | Speech, TV and household noise; room impulse responses measured in your rooms and simulated | — | Augmentation | Own and simulated |

- Self-play repertoire: public-domain MIDI (Bach, Mozart, Beethoven, Chopin, Joplin, Czerny), generated scales, arpeggios and chords, and Jingle Bells, with velocities varied ±20 and tempo scaled 0.7–1.3.
- Three phones record at once, so one hour of self-play gives three hours of labelled audio. About 2.5 h of playback in each of 3 rooms yields 22.5 h.
- Splits are disjoint by piece and by session and room, so the network cannot score by memorising repertoire or a room.
- Three test sets: a held-out PSR room, held-out acoustic sessions, and IDMT-PIANO-MM.

### 14.6 Augmentation

Noise is mixed at a chosen SNR by scaling it against the clean signal:

```latex
x_{aug} = x + n\,\frac{\lVert x \rVert}{\lVert n \rVert}\,10^{-\mathrm{SNR}/20}
```

| Augmentation | How | Range |
| --- | --- | --- |
| Room | Convolve with a room impulse response, measured with a sine sweep in your rooms or simulated by the image method (Allen and Berkley, 1979) | RT60 0.2–1.5 s (log-uniform), DRR −10 to +15 dB |
| Phone | Convolve with measured responses of your phones' microphones, plus a random high-pass | 20–120 Hz cut-off |
| Speaker playback | Band-pass and soft clipping applied to acoustic data, to imitate keyboard speakers | 80 Hz–12 kHz; drive 1–4; half of acoustic samples |
| Noise | Speech, TV and household noise mixed with the formula above | SNR 0–30 dB |
| Accompaniment | Non-piano music (bass, pads, drums) mixed in, labels unchanged | −10 to +5 dB relative to the piano |
| Gain | Overall level change | ±20 dB |
| Detune | Resample by 2^(c/1200) | c within ±10 cents |
| Clipping | Hard clip | −1 to −6 dBFS, 5% of samples |
| Calibration error | Partial positions for harmonic stacking (14.3) and the cross-key gather (14.4) computed from a perturbed B and f0 | B × (1 ± 0.3), f0 ± 5 cents |

- Priority follows the published ablation: variety of pianos and instruments mattered most (5.8 F1 points lost without it), then room responses (2.0), then noise (1.3).
- Augmentation probability ramps from 0 to 0.8 over the first 20% of training, which keeps early optimisation stable.

### 14.7 Training

- **Loss:** cross-entropy over the 5 states for every key and frame. At about 5 notes per second, a key's onset prior per frame is only 5 ÷ (88 × 93.75) ≈ 6 × 10⁻⁴, so classes are weighted by 1 ÷ √frequency. The weighting shifts the network's implied prior in a known way, and 14.9 removes it exactly.
- **Soft onset labels:** the frames either side of an onset get 0.25 of the label, because label times (about 3 ms accuracy) can fall on a frame boundary.
- **Other heads:** squared error for velocity and onset position (onset frames only); binary cross-entropy for the pedal.
- **Optimiser:** AdamW, learning rate 10⁻³ with cosine decay, weight decay 10⁻², batches of 16 segments of 20 s, gradient clipping at 1.0. About 150,000 pre-training steps, then about 30,000 fine-tuning steps at 10⁻⁴ on half own data and half MAESTRO, which prevents forgetting.
- **Why 20 s segments:** the GRU must hold a pedalled note for many seconds, so training segments must be longer than the notes it has to remember. Some batches also carry the GRU state across consecutive segments of a recording, as streaming does.
- **Early stopping** uses the own-phone validation set, not MAESTRO's, because phone recordings are the target.
- **Hardware:** one modern GPU; training time is measured in N3, and the model sizes above should train in hours to a few days.
- **Reproducibility:** fixed seeds, versioned data lists and configuration files, and the shared C++ features (14.3).

### 14.8 Adapting to each piano at calibration ("bias training")

| Level | What adapts | How | Risk |
| --- | --- | --- | --- |
| A. Normalise (always on) | Input features | Features are SNR relative to this room's noise, and the per-band mean of the calibration strikes' log features is subtracted. A fixed filter H(f) adds log abs H(f) to every frame, so subtracting the band mean removes the colour of phone, room and piano exactly | None |
| B. Condition (built into the model) | FiLM scale and offset in the recurrent core | A small network maps key index, calibrated B(k), λ1(k), release observability, instrument type, RT60 and DRR, and noise level to the scale γ and offset β | None at run time; the same calibration estimator must run on training recordings to produce these inputs |
| C. Recalibrate outputs (optional) | 16 numbers: a temperature and bias per register, 8 registers | Newton's method in C++ on the calibration strikes, which are labelled because the app knows which key it asked for and when; kept only if held-out anchors improve | Overfitting, prevented by a prior and the held-out check |

```latex
\tilde z = \gamma(c_k) \odot z + \beta(c_k), \qquad \hat\theta = \arg\min_\theta \; \mathcal{L}_{cal}(\theta) + \frac{\alpha}{2}\,\lVert \theta - \theta_0 \rVert^2
```

- The calibration strikes give about 700–1,000 informative frames. Adapting more than a few hundred parameters on that would overfit, so Level C adapts 16. The Gaussian prior (α term) pulls them back to the pretrained values θ₀ when the data are weak, and α is chosen by leaving one anchor out.
- Level C needs no on-device ML training framework and finishes in milliseconds.
- Deeper per-piano fine-tuning, such as the FiLM biases, runs offline on the desktop using that piano's lab recordings (14.12).

### 14.9 From network outputs to evidence, and fusion with DSP

The network's probabilities p′ reflect the class weighting used in training, whose effective prior π′ is known. Removing it gives evidence in nats on the same scale as DSP:

```latex
\Lambda_{nn} = \operatorname{logit} p'(c \mid x) - \operatorname{logit} \pi'_c, \qquad \Lambda_{fused} = w_{dsp}\,\Lambda_{dsp} + w_{nn}\,\Lambda_{nn} + b
```

- **Calibration first:** temperature scaling per register (Guo et al., 2017), fitted on validation data, brings expected calibration error to 2% or less.
- **Alignment:** each 10.67 ms frame's evidence is split evenly over its 2 DSP hops, which preserves its total for the CUSUM, and shifted back by the look-ahead. The decision layer waits up to neuralBudgetMs for it.
- **Correlation over time:** the network is recurrent, so its evidence in consecutive frames repeats itself, as overlapping DSP frames do. Its τ is measured on the noise takes like DSP's (2.4) and divided out before accumulation. Fusion weights handle correlation between the two engines at one moment; τ handles each engine's correlation with itself over time. Both are needed, or the same evidence is counted twice in two different ways.
- **Fusion weights:** fitted by logistic regression on held-out labelled data, per register. If the two engines' errors were independent, both weights would be 1, because independent log-likelihood ratios add. Correlated errors give weights below 1, which stops the same evidence being counted twice.
- **Two stages in fused mode:** DSP evidence alone creates a tentative NoteOn. When the network's evidence arrives, the fused value confirms it, or withdraws it if its probability falls below 0.1 (12.3). DSP's tentative threshold is set so that at most 2% of shown notes are withdrawn.

### 14.10 Deployment

| Item | iOS | Android |
| --- | --- | --- |
| Runtime | Core ML, converted with coremltools; all compute units, so the Neural Engine is used where supported | LiteRT (TensorFlow Lite) or ONNX Runtime Mobile; XNNPACK CPU first, GPU or NNAPI only after testing |
| Precision | fp16 | int8 post-training quantisation, per-channel weights |
| GRU state | Passed in and out as tensors on every call, which works on every OS version | Same |

- One call processes 2 frames (21.3 ms), amortising call overhead. The real-time factor must be at most 0.3, i.e. at most 6.4 ms of compute per call, on each test phone.
- int8 may cost at most 0.5 F1 points on the test set; otherwise quantisation-aware training is used.
- **Golden vectors:** the same audio through the training pipeline and the device pipeline must agree within 10⁻⁴ on features and 10⁻³ on outputs.
- **Thermal fallback:** at the serious thermal state the engine switches to DSP-only and tells the UI.
- **Packaging:** each model ships with its feature version, calibration-feature version and training-data manifest hash, all checked at load.

### 14.11 Evaluation and choosing the engine

- Every engine is compared with the same decision layer, the same false-alarm target (thresholds re-verified on noise for each, 13.2) and the same test splits, per instrument, register, loudness, distance and noise.
- Statistics: McNemar on paired notes (13.5) and bootstrap confidence intervals for F1 and timestamp error.
- **Decision rule, lessons:** maximise recall of ±1-semitone mistakes, subject to at most 1 false accusation per 100 notes and the latency gates.
- **Decision rule, free play:** maximise note F1 at 50 ms, subject to at most 6 false notes per hour and the latency gates.
- The best engine that passes becomes the default for that mode, and DSP remains the fallback. Doc 1's evidence suggests fused will win in free play and noisy rooms, and DSP may suffice for lessons; the data decide.

### 14.12 Improvement loop

- With the user's consent, the app keeps short snippets where the engines disagreed or the fused probability was most uncertain (highest entropy), which is where new labels teach the most.
- In lessons the score labels those snippets; on the PSR-E343, MIDI captured in the lab labels them exactly.
- Periodic offline fine-tuning (14.7) uses these snippets plus the base data. Every new model passes the full gate (13) before it replaces the old one, and the previous model stays available for rollback.

## 15. Coverage matrix: the 26 cases and beyond

Every one of the 26 cases has a mechanism, a section, a directed test and an honest ceiling. Ceilings: **full** means achievable by engineering; **good** means near-perfect in normal conditions; **bounded** means limited by physics or SNR; **not graded** means acoustically unobservable. The tables include the fixes from the five-critique review at the end of this section, and the interaction checks after it show how each fix is kept from making another case worse.

### The 26 cases

| # | Case | Mechanism | Sections | Test | Ceiling |
| --- | --- | --- | --- | --- | --- |
| 1 | Neighbour collision | Partial frequencies against the calibrated pattern; joint model with SNR-adaptive supports, so loud partials' leakage stays explained; 8192 bass refinement | 2.2, 7.3, 9.2, 9.3, 9.7 | A0/A♯0 alternation, minor-second clusters | Good for single notes; bounded for bass clusters |
| 2 | Soft to loud, short to long | Per-bin SNR; scale-invariant joint fit; CUSUM accumulates faint evidence at its true rate, each term divided by its τ | 2.4, 2.6, 7.4, 9.3, 10.2 | Loudness ladder | Bounded by SNR at distance; soft notes without a click show later, up to about 330 ms in the deep bass |
| 3 | Phone near or far | Calibrate in place; session gain; observability re-judged when the phone moves; distance augmentation | 8.1, 10.4, 14.6 | 0.3, 1 and 2 m takes | Good within 1 m |
| 4 | Fast playing, repeats | Per-key CUSUM; hammer click on non-overlapping frames (τ = 1) and phase surprise | 2.4, 7.5, 9.5 | Repetitions, trills | Good |
| 5 | Chords | No ranking cut; joint model; harmonic-interval test for doubled octaves; calibration-aware cross-key gather | 9.1, 9.3, 9.5, 14.4 | Triads, 6-note chords, take 12 | Good; dense clusters bounded |
| 6 | Streaming note life cycle | Per-key 5-state machine | 10.1 | Every take | Full |
| 7 | Re-strike while ringing | Click, phase surprise, rise above two-slope decay; tail templates bounded, so they never absorb a re-strike | 7.5, 8.6, 9.3, 9.5 | Same-key repeats | Good |
| 8 | Different pianos | Calibration; acoustic or digital profile; neural model trained with perturbed calibration | 8, 14.6 | Both instruments | Good |
| 9 | Calibration feeds the engine | Profile v2, lock-free swap | 8.11 | Quality check | Full |
| 10 | Octave ghosts, masking | Explaining away with shared bins at full weight; harmonic-interval test (own click, power excess, calibrated beating, priors); bounded sympathetic and phantom alternatives; calibration-aware cross-key gather | 2.8, 9.3, 9.5, 11.1, 14.4 | C2 alone; C3+C4 under loud C2; take 12 | Good when struck apart or held for one beat; a much softer simultaneous upper note that ends sooner is bounded, and graded as unclear in lessons |
| 11 | Missing fundamental (A0–B1) | Partials from h = 2; odd partials keep the lower key identified against its octave; 8192 refinement | 7.2, 8.7, 9.2, 9.5 | Bass ladder; PSR C2–B2 | Good; bass needs 40–80 ms |
| 12 | Room echo vs damper; undamped keys | Step and slope against calibrated decay, on the level's prediction error so unison beating cannot fake a release; observability re-judged against session gain and the backing floor | 2.7, 8.6, 9.6, 10.4, 11.3 | Staccato in echoey room; held undamped note | Good where observable; not graded elsewhere |
| 13 | Whistle, clap, speech, thump | Non-piano templates, charged for searched parameters; speech and noise augmentation | 9.4, 14.6 | Noise takes | Bounded by the false-alarm target |
| 14 | Pedal overflow, stuck keys | 32 voices with explicit NoteOff; evicted voices stay modelled as bounded tails; NoteOff for all on route change | 6.7, 9.6, 10.5 | Pedalled passages; pedalled glissando over 40 keys | Full; release under pedal not graded |
| 15 | Clipping | Clip flag and capsule-overload detection; interval test suspended during overload | 6.5, 9.5 | Loud, close takes | Full |
| 16 | Bass break, stretch, timbre | Two-segment B fit, break bisection, templates per level; calibrated partial positions in the neural gather | 8.5, 8.7, 8.8, 14.4 | Trill across the break | Good |
| 17 | Tuning drift | Per-key Kalman filter with a global drift state | 8.12 | Long sessions; PSR tuning offset | Full |
| 18 | OS stalls, threading | 1.37 s ring, catch-up, sample counter | 6.3, 6.4 | 500 ms stall | Full |
| 19 | Lesson vs free play | Priors, never masks; priors keep their designed weight because evidence is divided by τ | 2.4, 2.5, 11 | Jingle Bells takes | 93–99% in lessons, about 93% in free play |
| 20 | Block chords at the same instant | Per-key evidence, no ranking; doubled octaves through the harmonic-interval test | 9.1, 9.5, 10.1 | 6-note chords; take 12 | Full; doubled octaves as case 10 |
| 21 | 3-zone windows | Tiers plus low-delay frames plus 8192 refinement; τ measured per tier | 2.3, 2.4, 7.2 | Latency per register | Full |
| 22 | Velocity independent of distance | Session gain estimated from brightness | 2.9, 10.4 | Velocity sweep at 3 distances | Bounded: levels set by measured error |
| 23 | Fast calibration | Range strikes, Chebyshev anchors, relative wrong-key check | 8.1–8.4 | Calibration time | Full |
| 24 | Thresholds after gain | Thresholds relative to noise, so gain cancels | 2.6 | By construction | Full |
| 25 | dB scaling | N²/8 for tones, 3N/8 per bin for noise | 2.6, 7.2 | Synthetic level tests | Full |
| 26 | Latency, telemetry | Chirp per route; per-register bias correction; latency gates stated for mf and louder; telemetry | 2.4, 6.6, 10.3, 12.1 | Chirp repeatability | Full once measured |

Changed in the five-critique review: cases 1–5, 7, 8, 10–16, 19–21 and 26.

### Cases beyond the 26

| Case | Sections | Handling |
| --- | --- | --- |
| App's own backing track in the microphone | 6.6, 11.3 | Canceller sized from the measured echo decay (128–384 ms) and started from the chirp response; backing notes bounded to their predicted residual, with room-decay tails; wired-headphone fallback |
| Backing note an octave below the melody | 9.5, 11.3 | Backing notes are partners in the harmonic-interval test |
| Phone moved during the practice song | 10.4, 11.3 | Echo path watch: backing templates at their bound trigger fast re-adaptation and a prompt; observability re-judged |
| Digital loudness layers | 8.5 | Three calibration levels; the velocity sweep finds layer boundaries |
| Digital built-in reverb and release samples | 8.6 | Measured in the post-release decay |
| Digital speaker: weak bass, distortion | 8.7, 9.7, 14.6 | Partials from h = 2; speaker augmentation |
| Digital tones close to harmonic | 9.4 | Searched parameters of alternatives are charged, so the harmonic-source template cannot win by flexibility |
| Digital 32-note polyphony cutting notes | 9.6 | Treated as an acoustic end; length not graded |
| Engine's own voice limit reached | 9.3, 10.5 | The evicted key gets a NoteOff but stays modelled as a bounded tail until it fades, so its ringing makes no ghosts |
| Non-piano voice or auto-accompaniment left on | 8.10 | The quality check sees the timbre mismatch and asks the user to press PIANO and switch Style off |
| Keyboard transpose set | 8.3 | Detected as a whole-semitone offset and mapped back |
| Badly out-of-tune piano | 8.3 | Every check is relative to the measured offset |
| Beating unison strings | 8.6, 9.5, 9.6 | Release evidence runs on the level's prediction error; re-strikes never come from level alone; octave beating is told apart by its calibrated rate |
| Sympathetic ringing of undamped strings | 9.5, 14.4 | Bounded sympathetic alternative in the interval test (no click, slow rise, measured level); cross-key gather |
| Phantom partials of loud bass notes | 8.5, 9.5 | Part of the loud calibration template; template spread measured at ff |
| Microphone distortion adding harmonics | 6.5, 9.5 | Overload detected; interval test suspended; only keys with their own click are reported |
| Soft pedal (una corda) | 8.5, 14.6 | Brightness interpolation; una corda takes in the corpus |
| Pedal noise | 9.4 | Broadband transient template |
| Glissando, grace notes, rolled chords | 9.1, 10.1, 11.5 | Per-key decisions; grading tolerances |
| Counting aloud or singing | 9.4, 14.6 | Harmonic-source template; speech augmentation |
| TV or music in the room | 9.4, 14.6 | Alternative templates; accompaniment augmentation |
| Phone lying on the piano | 5.2, 6.5 | Tested; overload detection; music stand recommended |
| Sample rate other than 48 kHz | 6.2 | Tables built for the delivered rate |
| Route change, Bluetooth | 6.6, 6.7 | NoteOff for all; Bluetooth microphone refused; timing off on Bluetooth output |
| UNPROCESSED not supported | 6.1 | VOICE\_RECOGNITION fallback; calibration absorbs its response |
| Phone overheating | 14.10 | Fallback to DSP |
| Calls and voice assistants | 6.7 | Clean stop and resume |
| Calibration error seen by the neural model | 14.4, 14.6 | Training perturbs B by ±30% and f0 by ±5 cents; width-3 fallback path |

### Design review: five critiques

All five critiques hold. Two understate the problem (1 and 3), and three of the proposed remedies would have created a new one (1, 3 and 5), so each fix goes to the root cause instead and is written into the sections listed.

| # | Critique | Verdict | Root cause | Fix | Sections |
| --- | --- | --- | --- | --- | --- |
| 1 | Correlated hops break the CUSUM bound | Holds, and larger than stated: uncorrected, 16.1 nats behaves like 2.1 in the bass. Raising h from noise counts alone (the proposal) under-corrects by τ and slows every note | Evidence summed as if each hop were new | Each evidence term divided by its measured τ: 1 for the click, 1.9–7.7 for tier frames; release and neural evidence too; the noise check becomes a ±1-nat trim | 2.4, 9.6, 9.9, 13.2, 14.9 |
| 2 | Shared octave partials leave the upper key no evidence | Holds; the down-weighting rule was the cause. Moving weight to attack terms (the proposal) is kept as a context term, but alone it fails for simultaneous strikes | Shared bins down-weighted; the lower key's template error accumulated hop by hop | Shared bins at full weight; one harmonic-interval test per strike: own click, power excess, beating at calibrated rates, priors; alternatives with bounded amplitudes | 2.8, 9.3, 9.5, 9.9 |
| 3 | The dense Itakura–Saito fit is too costly | Holds: 4.3 million operations per hop, and leave-one-out evidence multiplies it. Fixed ±2-bin supports (the proposal) would leave loud partials' leakage unexplained | Fit over every bin; a full refit per key | Supports widened with SNR, on Hann frames only; local leave-one-out refits; about 0.3 million operations, which also pays for 64 templates | 9.3, 9.10, 10.5 |
| 4 | Fixed cross-key taps miss stretched partials | Holds: at B = 6 × 10⁻³ partial 6 lies at +32.7 semitones, not 31 | Taps at 12 log2 n ignore stiffness | Gather at calibrated fractional key positions; width-3 path as fallback; B and f0 perturbed in training | 14.4, 14.6 |
| 5 | A 128 ms echo canceller leaves the room tail | Holds in direction, smaller in size: the room's echo is about 20 dB under the direct path. Free-amplitude backing templates (the proposal) could absorb a student's note on the same pitch or an octave above | Fixed length; backing templates with free amplitudes that stop at note-off | Length from the measured decay, 128–384 ms, started from the chirp response; backing templates bounded, with room-decay tails; echo path watch | 4, 6.6, 11.3 |

### Cross-case interaction checks

A fix that helps one case can hurt another. Each change below lists the cases it improves, what it could make worse, and the guard that stops it; the directed tests in 13.4 check every guard.

| Change | Improves | Could make worse | Guard |
| --- | --- | --- | --- |
| Evidence divided by τ | 2, 13, 19, 21: false notes stay within budget in every register, and priors keep their designed weight | 2, 11: soft notes without a click show later | Click terms keep τ = 1; latency gates stated for mf and louder; grading uses timestamps (2.10); lesson priors shorten the wait |
| Release evidence on the level's prediction error | 12: unison beating cannot fake a release | 12: small release steps detected later | Observability judged with the measured prediction-error spread, so only detectable releases are graded |
| Shared bins at full weight, interval test | 5, 10, 20: simultaneous octaves become detectable | 10, 15: false upper octaves from template error, sympathetic ringing, phantoms or distortion | One test per strike against measured σ\_T; bounded alternatives; test suspended during overload; calibrated on take 12 |
| Sparse supports, local leave-one-out | Cost budget; room for 64 templates | 1, 2: ghost evidence from truncated sidelobes | Support width grows with SNR; Hann frames only; sparse and dense fits must agree within 0.1 nats (9.11) |
| Tail templates for evicted voices | 10, 14: no ghost re-onsets after eviction | 7: a tail absorbing a re-strike | Amplitude bounded by the predicted decay; re-strikes rely on the click and phase surprise |
| Bounded backing templates with room tails | 19 and the backing track: no false notes after backing note-offs | 19: false notes if the echo path changes | Echo path watch; fast re-adaptation; headphone advice |
| Longer echo canceller | 19 and the backing track: tail cancelled in echoey rooms | Processing time; slower convergence | Started from the chirp response; at most 0.35 million operations per hop (9.10) |
| Observability re-judged live | 3, 12, 22: no grading of releases the room or the backing hides | Fewer notes graded for length in practice mode | The UI states which notes were not graded and why |
| Charge for searched parameters | 10 and digital tones: real notes not explained away by flexible alternatives | 13: whistles or speech taken as notes slightly more often | Charge fitted on the noise takes, so false notes stay within 6 per hour (13.2) |
| Calibration-aware neural gather | 5, 10, 16: stretched partials explained away | 8: dependence on calibration accuracy | B ±30% and f0 ±5 cents in training; width-3 path; the same C++ code computes positions in training and on device (14.3) |

No change lowers a section 1 gate without a stated guard. The only gate that moves is display latency, now stated for mf and louder: faint notes without a click were fast before only because correlated evidence made the detector over-fire.

## 16. Risks, open items and order of work

The DSP engine ships first, through Phases 0–8. The neural lane starts once the shared features and the Phase 0 recording rig exist, and joins at its own gate.

&#91;embedded content: Roadmap · 3 lanes, 2 gates, not to scale\]

Phase boxes are equal in width, not durations. The DSP release gate is Phase 8 (13); the engine-choice gate is N10 (14.11).

### 16.1 Order of work

1. Build the Phase 0 rig and corpus, and add the rejection log to v1.2.
2. Harden capture (Phase 1) in parallel.
3. Build Phases 2–5 offline on recordings through the harness, then run them live.
4. Phase 6 in this order: learning mode, then practice mode with Jingle Bells, then free play.
5. Integrate (Phase 7) with the legacy toggle, so v1.2 and the new engine can be compared on the piano.
6. Pass the Phase 8 gate: DSP becomes the default and v1.2 is removed.
7. Run N1–N2 as soon as Phase 2 and the Phase 0 rig exist, then N3–N9, then the N10 gate.

### 16.2 Risks and fallbacks

| Risk | Effect | Fallback |
| --- | --- | --- |
| Android devices vary, and the minimum device is not chosen yet | Latency, UNPROCESSED support and CPU differ | Test at least two Android phones including a mid-range one; VOICE\_RECOGNITION fallback; Small neural model; DSP fallback |
| Backing bleed from the phone speaker is too strong in practice mode | False notes from the backing | Echo canceller plus known notes; wired headphones |
| PSR-E343 sample zones break the smooth B model | Small frequency-model errors | Piecewise B and online refinement (8.8, 8.12) |
| Too little acoustic ground truth | Evidence models lean towards the PSR-E343 | More scripted takes; a Disklavier or silent-piano session; IDMT-PIANO-MM for evaluation |
| The neural model does not beat DSP on own data | No gain from the neural lane | It stays optional with DSP as default; record more PSR self-play |
| Physics limits (release under pedal, live-room treble) | Some things cannot be graded | Not graded, and the UI says so |
| The app is ever published | MAESTRO and IDMT-PIANO-MM are non-commercial | Retrain on own data before any distribution |
| Phone overheating | Neural latency spikes | Automatic DSP fallback |
| Evidence correlation (τ) on some phone or room differs from Phase 0 | False notes pile up in one register | Per-register check (13.2); τ re-measured on each test phone |
| Interval cues weak on some instrument, such as near-exact digital octaves that barely beat | Simultaneous soft octaves stay unclear | Measured per instrument on take 12; graded as unclear, never as missed |

### 16.3 Open items

- [ ] Which Android phones are the minimum to support.
- [ ] Which acoustic piano will be recorded (grand or upright), and whether a Disklavier or silent piano can be reached.
- [ ] Jingle Bells backing arrangement in MIDI, following the rules in 11.2.
- [ ] Grading weights for dynamics and note length; key and timing are settled (11.5).
- [ ] Whether a sustain pedal is connected to the PSR-E343, which decides the pedal ground truth.
- [ ] Which Android phone to test on when Android testing starts, and how its frame offset is measured (6.2).
- [ ] How the Claude GitHub Action is set up: which Claude plan it runs on, and whether its fixes always arrive as reviewed pull requests.

## 17. References

### Pages opened for this plan

- [MAESTRO dataset (Magenta)](https://magenta.tensorflow.org/datasets/maestro): CC BY-NC-SA 4.0 licence.
- [IDMT-PIANO-MM (Fraunhofer IDMT)](https://idmt.fraunhofer.de/en/publications/datasets/piano-mm.html): contents and CC BY-NC-ND 4.0 evaluation licence.
- [Yamaha PSR-E343 specifications](https://dk.yamaha.com/da/products/musical_instruments/keyboards/portable_keyboards/psr-e343/specs.html): 61 keys, touch response, 32-note polyphony, USB TO HOST, transpose ±12, tuning, AWM sampling.
- [Apple Human Interface Guidelines: Privacy](https://developer.apple.com/design/human-interface-guidelines/privacy): ask for a permission when its feature is first used (8.1).
- [Nitro Modules: worklets](https://nitro.margelo.com/docs/worklets): HybridObjects callable from any JavaScript runtime, including worklets (12.1).
- [Margelo: How to make pure JSI code faster](https://margelo.com/blog/make-jsi-run-faster): jsi::NativeState compared with host objects (12.1).
- [osu! wiki: Accuracy](https://osu.ppy.sh/wiki/Accuracy): weighted accuracy from per-note judgements (11.5).
- [Casio Chordana Play for Piano: Scoring performances](https://web.casio.com/app/en/piano/manual/BONDSYivmhtcjb.html): Perfect, Good or Miss per strike, and a score from 0 to 100 (11.5).
- [Yousician: How song score is calculated](https://support.yousician.com/hc/en-us/articles/208014795-How-song-score-is-calculated): stars on top of the score (11.5).
- [Melodics: Lesson scoring](https://support.melodics.com/en/articles/15092017-lesson-scoring): timing judged per note, and stars (11.5).
- [Live Science: why colour blindness is more common in men](https://www.livescience.com/health/genetics/why-is-color-blindness-so-much-more-common-in-men-than-in-women): about 1 in 12 men and 1 in 200 women, citing the Cleveland Clinic (12.3).
- [react-native-audio-api: AudioManager](https://docs.swmansion.com/react-native-audio-api/docs/system/audio-manager): its session management, and turning it off (6.1).
- [react-native-audio-api: Decoding](https://docs.swmansion.com/react-native-audio-api/docs/utils/decoding): decodeAudioData and the formats it reads, FLAC included (11.2).
- [react-native-audio-api: Disabling prebuilt libraries](https://docs.swmansion.com/react-native-audio-api/docs/other/disabling-prebuilt-libraries): FFmpeg and the Ogg and Opus libraries, which FLAC does not need (11.2).

### Project documents

- Piano Note Detection Engines: Comparing Apex v1, Apex v2 and Reevo, With a Maths-First Hybrid Design (research report in this project): engine audit, mobile audio facts, published accuracy and latency figures.
- Ultimate Piano Detection Engine Design (earlier design conversation): the 26 cases, Reevo's structure and code.
- [UI Implementation Plan — Phase 1: Structure](https://claude.ai/artifact/KZJ7B9hdt1JBTQnBrSUdGX) (v1.5): the CoreEngine package, lesson JSON with millisecond timing, FeedbackDetection and the settings registry.
- [UI Implementation Plan — Phase 2: App flow](https://claude.ai/artifact/7cWZX9oLsfPML9rmjFWjic) (v1.2): screens, when the microphone runs, lesson states, calibration timing and the profile checks.
- [UI Implementation Plan — Phase 3: Engine to UI communication](https://claude.ai/artifact/XSQ9Tp8uiaZzkcAaf8iqGQ) (v1.3): the four output structures, the clock, the event record and the Nitro bindings.
- [UI Implementation Plan — Phase 4: Lesson internals](https://claude.ai/artifact/VsvkoSWSWpojhjb9AmHiJg) (v1.2): lesson controllers, flow and wait, looping, grading credit and the attempt record.
- [UI Implementation Plan — Phase 5: Visual and motion design](https://claude.ai/artifact/Wm4YFa1Nv93oVfAByzo3zQ) (v1.0): the lesson page frame, result colours and shapes, motion timings, transitions and Reduce Motion.

### Literature

- Fletcher, H. (1964). Normal vibration frequencies of a stiff piano string. JASA 36(1).
- Rigaud, F., David, B., Daudet, L. (2013). A parametric model and estimation techniques for the inharmonicity and tuning of the piano. JASA 133(5), 3107–3118.
- Rauhala, J., Välimäki, V. (2007). Fast automatic inharmonicity estimation algorithm. JASA.
- Weinreich, G. (1977). Coupled piano strings. JASA 62(6).
- Rife, D., Boorstyn, R. (1974). Single-tone parameter estimation from discrete-time observations. IEEE Transactions on Information Theory 20(5).
- Page, E. S. (1954). Continuous inspection schemes. Biometrika 41.
- Lorden, G. (1971). Procedures for reacting to a change in distribution. Annals of Mathematical Statistics 42(6).
- Moustakides, G. (1986). Optimal stopping times for detecting changes in distributions. Annals of Statistics 14(4).
- Chandler, R. E., Bate, S. (2007). Inference for clustered data using the independence loglikelihood. Biometrika 94(1), 167–183.
- Bello, J. P., Duxbury, C., Davies, M., Sandler, M. (2004). On the use of phase and energy for musical onset detection in the complex domain. IEEE Signal Processing Letters 11(6).
- Stowell, D., Plumbley, M. (2007). Adaptive whitening for improved real-time audio onset detection. ICMC.
- Martin, R. (2001). Noise power spectral density estimation based on optimal smoothing and minimum statistics. IEEE Transactions on Speech and Audio Processing 9(5).
- Févotte, C., Bertin, N., Durrieu, J.-L. (2009). Nonnegative matrix factorization with the Itakura–Saito divergence, with application to music analysis. Neural Computation 21(3).
- Abe, M., Smith, J. O. (2004). Design criteria for simple sinusoidal parameter estimation based on quadratic interpolation of FFT magnitude peaks. AES Convention.
- Dixon, S. (2005). Live tracking of musical performances using on-line time warping. DAFx.
- Soo, J.-S., Pang, K. K. (1990). Multidelay block frequency domain adaptive filter. IEEE Transactions on Acoustics, Speech and Signal Processing 38(2).
- Allen, J. B., Berkley, D. A. (1979). Image method for efficiently simulating small-room acoustics. JASA 65(4).
- Schroeder, M. R. (1965). New method of measuring reverberation time. JASA 37(3), 409–412.
- Kwon, T., Jeong, D., Nam, J. (2020). Polyphonic piano transcription using autoregressive multi-state note model. ISMIR.
- Kong, Q., Li, B., Song, X., Wan, Y., Wang, Y. (2021). High-resolution piano transcription with pedals by regressing onset and offset times. IEEE/ACM TASLP 29.
- Hawthorne, C. et al. (2019). Enabling factorized piano music modeling and generation with the MAESTRO dataset. ICLR.
- Bittner, R. M. et al. (2022). A lightweight instrument-agnostic model for polyphonic note transcription and multipitch estimation. ICASSP.
- Mobile-AMT: real-time polyphonic piano transcription for in-the-wild recordings. EUSIPCO 2024 (Yamaha); augmentation results as summarised in the research report.
- Hu et al. (2025). Causal piano transcription and low-delay asymmetric windows. ISMIR; as summarised in the research report.
- François (2025). Resonate: per-sample resonator analysis. ICMC; as summarised in the research report.
- Perez, E. et al. (2018). FiLM: visual reasoning with a general conditioning layer. AAAI.
- Guo, C. et al. (2017). On calibration of modern neural networks. ICML.
- Loshchilov, I., Hutter, F. (2019). Decoupled weight decay regularization. ICLR.
- McNemar, Q. (1947). Note on the sampling error of the difference between correlated proportions or percentages. Psychometrika 12(2).
- Kuhn, D. R., Kacker, R., Lei, Y. (2008). Combinatorial testing. CrossTalk, June 2008.
