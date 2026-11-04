# Reevo 2 Engine Re-Audit v1.0: Maths, Capabilities and Cases

Oct 28, 2026 · @sumit

**Version:** audit v1.0, based on master v1.5 (Reevo 2 — Piano Detection Engine: End-to-End Implementation Plan, 28 Oct 2026). It re-derives every number in sections 1–16 of the master, re-grades the 26 cases and the 28 cases beyond them, and adds the cases, combinations and physical limits the master does not yet name. Where the two pasted summaries disagree with the master, the master wins and the drift is listed in section 2.

## Verdict at a glance

The master's maths holds up: 40 of its 50 numeric claims reproduce exactly or err on the safe side, and all 26 cases have a working mechanism. Ten claims need correcting. Four defects (D1–D4) change engine behaviour or a release gate; none forces a redesign.

| Measure | Current score |
| --- | --- |
| 26 cases, master ceilings | 12 full · 10 good · 3 bounded · case 19 stated as a rate (93–99% in lessons, about 93% in free play) |
| 26 cases, audit grade | 20 A (verified as written) · 3 B (one number or rule to fix) · 3 C (a defect changes behaviour or a gate) |
| Cases beyond the 26 | 28 in the master · 18 added here (section 7) |
| Numeric claims re-derived | 50: 38 exact · 2 conservative · 10 to correct (section 4) |
| Findings | 12 defects (D1–D12) · 5 opportunities (O1–O5) |
| Release gates measured | 0 of 7: every gate is a proposal until Phase 0 and Phase 8 |
| Limits one microphone cannot cross | 12, each with a proof and the sensor or rule that answers it (section 9) |

**The four fixes that matter most**

1. **Phantom credit while a lesson waits (D1).** The 6.8-nat expected-note prior lets a silent expected key fire about once a minute, by the master's own threshold rule. Credit it only together with an attack cue.
2. **Release gates a good engine cannot pass (D2).** At 300 notes per cell, a truly 99%-accurate engine clears all 12 detection cells 0.5% of the time. Size cells from statistical power.
3. **Late NoteOffs (D3).** Release times lag by up to 36 ms in the bass because the Hann taper hides the damper, and nothing subtracts it.
4. **Dynamics grading (D4).** The 3.29σ rule keeps misgrading at 10% only for a note at a level's exact centre; across the level it averages 24%.

**The biggest step forward (O1).** Fitting known-frequency complex atoms instead of energy separates A0 from A♯0 from partial 4 in the 85 ms frame, instead of partial 15. Where those partials are above noise, bass clusters resolve in about half the time.

## Scope, sources and evidence grades

This audit checks master v1.5 against itself, against physics and against a re-derivation script; nothing in it is measured on recordings yet.

- **Audited:** sections 1–16 of the master (project snapshot, 28 Oct 2026), its 26-case table, its 28 beyond-cases and the versioning rules.
- **Re-derived:** every number in the master, by a Python script (numpy and scipy): windows, leakage, τ, Cramér–Rao bounds, CUSUM thresholds, priors, combinatorics, velocity levels, octave beating, release lag, gate statistics and covering arrays.
- **Looked up:** the Android compatibility rules for the VOICE\_RECOGNITION source, and whether 54-key keyboards are sold (Sources, end of section 11).
- **Not audited:** the v1.2 code in the GitHub repo, and the UI plans except where the master quotes them.

| Evidence grade | Meaning | In this audit |
| --- | --- | --- |
| Derived | Re-computed from the master's own formulas and stated assumptions | 50 claims |
| Target | A gate or ceiling that still needs Phase 0 or Phase 8 data | All 7 gates and every accuracy percentage |
| Measured | Confirmed on labelled recordings | None yet |

**Where the two pasted summaries drift from the master.** The master wins in every row.

| The summaries say | Master v1.5 says |
| --- | --- |
| A commercial app at $50 a year | Personal, non-commercial use, with MAESTRO for pre-training (section 1); retrain before any distribution (16.2) |
| DSP plus priors "already hits 98.5–99.5%" in lessons | 93–99% in lessons and about 93% in free play, all unmeasured (case 19) |
| Evidence divided by a window "overlap factor" | Divided by the integrated autocorrelation time τ: 1.92, 3.85 and 7.70, not N ÷ hop (2.4) |
| Shared octave bins down-weighted within 0.5 bin | Rule removed in v1.1; shared bins keep full weight and a harmonic-interval test decides (2.8, 9.5) |
| Fixed neural taps at 12, 19, 24, 28 and 31 semitones | Taps at calibrated, stretched positions, with a width-3 fallback (14.4) |
| A 128 ms echo canceller | 128–384 ms, sized from the measured echo decay (11.3) |
| A Goertzel front end and a JSI bridge | FFT tiers with a phase vocoder (7.2, 7.3); Nitro HybridObjects once a spike passes (12.1) |
| 8 keyboard sizes | 9 sizes accepted (8.3) |
| Four pillars covering 21 cases | All 26 cases have a mechanism; the pillar map left out cases 6, 9, 17, 19 and 22 |

## Current capability scorecard

Every capability the engine needs exists on paper, and every gate is still a proposal. Grades: **A** re-derived and sound; **B** one number or rule to fix; **C** a defect that changes behaviour or a gate.

### Release gates (master section 1)

| Metric | Gate | Basis in the master | Audit |
| --- | --- | --- | --- |
| Notes detected (mf, phone ≤ 1 m, quiet) | ≥ 97% in every register | ≥ 300 notes per cell, ±2% at 95% | C: the pass rule needs 950–1,850 notes per cell (D2) |
| False notes, quiet room | ≤ 6 per hour | h = 16.1 nats for 88 keys | A in free play (exactly 6.00 per hour); C in lessons, where waiting expected keys are not budgeted (D1) |
| Wrong-note reports that are themselves wrong | ≤ 1 per 100 correct notes | posterior ≥ 0.9, a 9:1 cost | A |
| ±1-semitone mistakes caught | ≥ 95% | priors 0.9 and 0.03 | B: two different margins in 2.5 and 11.1 (D9) |
| Timestamp error | 95th percentile ≤ 10 ms | sub-hop onset, register bias | A for onsets; NoteOffs carry no correction (D3) |
| Time until a note shows (mf and louder) | ≤ 25 / 50 / 100 ms | windows reach −6 dB after 10.7 / 13.7 / 24.9 ms | A |
| DSP time per hop | 99th percentile ≤ 2 ms | budget in 9.10 | A; the FFT count is conservative (about 0.10 M butterflies per hop, not 0.2 M) |

### Engine capabilities

| Capability | What it does | Key numbers | Audit |
| --- | --- | --- | --- |
| Capture and clock | Lock-free ring, 64-bit sample counter, catch-up after stalls | 2^16 samples = 1.37 s; a 200 ms stall clears in about 37 ms | A |
| Native sample rate | Tables built for 44.1 or 48 kHz; no resampling in DSP | Threshold moves 0.085 nats at 44.1 kHz | A |
| Microphone source | UNPROCESSED when supported, else VOICE\_RECOGNITION; iOS Measurement mode | VOICE\_RECOGNITION is specified flat only from 100 Hz to 4 kHz | B (D6) |
| Three tiers, low-delay frames, bass refinement | Hann 1024 / 2048 / 4096, low-delay 2048 / 4096, Hann 8192 for A0–B1 | Leakage beyond 8 bins −65.5 dB (Hann), −52.5 / −37.7 / −30.1 dB (low-delay) | A |
| One dB scale | Tones divided by N²/8, noise 3σ²/N per bin | Exact for Hann and low-delay frames alike (coherent gain 0.5, Σw² = 3N/8) | A |
| Partial frequencies | Phase vocoder per partial, weighted by its Cramér–Rao bound | Neighbours 162–458 σ apart at 20 dB SNR | A |
| Joint Itakura–Saito model | All candidate keys fitted at once on sparse supports | Up to 64 templates, about 0.3 M operations per hop | A; local refits are approximate (D11) |
| Non-piano alternatives | Transient, pure tone and harmonic source, charged for searched parameters | Replace v1.2's fixed gates | A |
| Harmonic-interval test | Own click, power excess, calibrated beating, priors | Beating 9.6 dB peak to peak with the upper note 6 dB softer | B: power-excess z overstated (D5) |
| Per-key CUSUM with τ | Evidence divided by τ; thresholds from a false-alarm budget | τ = 1.92 / 3.85 / 7.70; faint clickless bass note 330 ms | A |
| Priors | Threshold shifts, never masks | −6.8 / −1.1 / +1.6 nats | C (D1, D9) |
| Release detection | Step and slope CUSUMs on the level's prediction error | Step 10.4 / 3.0 / 0.4 dB at DRR +10 / 0 / −10 dB | C: timestamps lag (D3) |
| Bass refinement | 8192 frame; NoteCorrect keeps the timestamp | Energy separates A0 and A♯0 from partial 8 | A; upgrade O1 |
| Velocity and session gain | Brightness sets distance, level sets dynamics | Median of 20 notes accurate to 1.1 dB | C: level rule (D4) |
| Calibration | 7 or 16 Chebyshev anchors, B fit, observability map, chirp | 62–146 s; σ\_f = 0.00025 Hz on the 1 s window | A; key-count list (D10); silence can halve (O2) |
| Echo canceller | Partitioned-block filter sized from the measured decay; bounded backing notes | 128–384 ms | A; speaker intermodulation not modelled (O3) |
| Neural key-wise model | Shared GRU per key, calibrated cross-key gather, FiLM conditioning | 51 k / 187 k / 536 k parameters | B: gather stops at partial 6 (D7) |
| Fusion and decision layer | One evidence currency in nats; 5-state machine per key | Retractions ≤ 2% | A |
| Grading | A window per note; unclear never penalised | Misgrading 5.5% at 10 ms and 0.5% at 15 ms inside the edge | A |

## Line-by-line maths audit

38 of the master's 50 numeric claims reproduce exactly, 2 are conservative and 10 need correcting. Values come from the re-derivation script at 48 kHz and a 256-sample hop unless stated; section 5 explains each correction.

| § | Claim in the master | Re-derived | Verdict |
| --- | --- | --- | --- |
| 1, 6.3 | 256-sample hop = 5.33 ms; 675,000 hops per hour; 2^16 ring = 1.37 s | 5.333 ms; 675,000; 1.365 s | Exact |
| 1, 2.4 | h = 16.1 nats keeps 88 keys at ≤ 6 false notes per hour | 16.11 nats → 6.00 per hour | Exact |
| 2.1 | B = 4×10⁻⁴ stretches partial 10 by 34 cents | 34.0 cents | Exact |
| 2.2 | Cramér–Rao σ\_f at 20 dB: 0.081 / 0.029 / 0.010 / 0.004 Hz | 0.0808 / 0.0286 / 0.0101 / 0.0036 Hz | Exact |
| 2.2 | Neighbour gaps of 289 / 193 / 162 / 458 σ | 289 / 193 / 162 / 458 σ | Exact |
| 2.2 | Energy separates A0 and A♯0 from partial 15 (4096) and 8 (8192) | 15 and 8 (14 and 7 at 44.1 kHz) | Exact; a known-frequency fit does better (O1) |
| 2.2 | Neighbours sit "0.14–0.5 bins apart below G6" | Bass 0.14–0.44, middle 0.23–0.94, treble 0.50–1.88 bins | Correct the wording (D12) |
| 2.3 | Hann frames reach −6 dB after 10.7 / 21.3 / 42.7 ms | 10.67 / 21.33 / 42.67 ms | Exact |
| 2.3 | Low-delay frames reach −6 dB after 8.1 / 13.7 / 25.0 ms, saving 2.6 / 7.6 / 17.7 ms | 8.06 / 13.67 / 24.94 ms; 2.60 / 7.67 / 17.73 ms | Exact |
| 2.3 | Leakage beyond 8 bins: Hann −65 dB; low-delay −52 / −38 / −30 dB; 13–35 dB of masking range lost | −65.5; −52.5 / −37.7 / −30.1; 13.0–35.4 dB | Exact |
| 2.4 | h = 17.9 / 16.1 / 14.5 / 15.7 nats and the delay table | Same to 0.01 nat and 0.1 ms | Exact |
| 2.4 | ρ(1) and τ: Hann 0.43 / 1.92, 0.81 / 3.85, 0.95 / 7.70; low-delay 0.72 / 3.61, 0.87 / 7.04 | 0.434 / 1.92, 0.814 / 3.85, 0.950 / 7.70; 0.718 / 3.61, 0.866 / 7.04 | Exact |
| 2.4 | Faint clickless bass: 0.26 nats per hop, 62 hops (330 ms); 190 ms as an expected note; 8 hops uncorrected | 0.260; 62.0 hops = 331 ms; 191 ms; 8.1 hops | Exact |
| 2.5 | Prior shifts of −6.8 / −1.1 / +1.6 nats; notes 7 and 36 ms sooner | −6.79 / −1.12 / +1.62 nats; 7.2 and 36.2 ms | Exact |
| 2.5 | A 9.3-nat threshold for expected keys is safe | Lorden's bound gives only ≥ 59 s per key; about 61 false triggers per hour per waiting key | Correct it (D1) |
| 2.5, 11.1 | A neighbour must out-score the expected key by ln(0.9 ÷ 0.03) = 3.4 nats | The per-key thresholds of 2.5 imply logit(0.9) − logit(0.03) = 5.67 nats | Correct it (D9) |
| 2.5 | Up to 4 notes: 2.4 M combinations (21.2 bits); 61 keys 19.1; 25 keys 13.9; 30 outcomes 4.9 | 2,445,543 = 21.22 bits; 19.09; 13.90; 4.91 | Exact |
| 2.6 | Tones: \|X\|² × 8/N² = A²/2; noise 3σ²/N per bin | Exact for Hann and low-delay frames | Exact |
| 2.6 | Per-bin SNR gain of 25.3 / 28.3 / 31.4 / 34.4 dB | 25.33 / 28.34 / 31.35 / 34.36 dB | Exact |
| 2.6 | 3 s of silence gives the noise spectrum to 0.37 dB (1024) and 0.73 dB (4096) | 0.25 and 0.51 dB when overlapped frames are counted by τ; 1.45 s already gives 0.73 dB | Conservative (O2) |
| 2.7 | Release step 10.4 / 3.0 / 0.4 dB at DRR +10 / 0 / −10 dB | 10.41 / 3.01 / 0.41 dB | Exact |
| 2.7 | Step evidence 18 nats (3 dB) and 2 nats (1 dB); slope noise 66 and 6.2 dB/s | 18 / 2 nats; 66.3 / 6.2 dB/s | Exact |
| 2.7 | A re-strike at 6 notes per second rises 1.3 dB | 1.34 dB | Exact |
| 2.7, 8.6 | A 3 dB release step is detected in 1 hop, a 1 dB step in 4 | One hop after a full stop the Hann 4096 level moves 0.014 dB; half the step shows after 36 ms | Correct it (D3) |
| 2.8 | Two equal coherent partials read from silence to +3 dB over their power sum; phase error never exceeds the bin's standard deviation | \|1 + e^jθ\|² lies in \[0, 4\]; 2√(P1P2) ≤ P1 + P2 | Exact |
| 2.8 | The mean dB excess is zero for r ≤ 1 | Jensen's formula | Exact |
| 2.8 | Power-excess z of 2.5–2.7 / 1.7–1.9 / 1.1–1.3 / 0.4–0.5 / 0.1 | Matches only if the cross term's variance is r²; it is 2r², giving 1.94–1.97 / 1.34–1.38 / 0.90–0.95 / 0.36–0.42 / 0.08–0.10 | Correct it (D5) |
| 2.8 | Beat depth 15.3 / 9.6 / 4.5 / 1.7 dB | Same | Exact |
| 2.8 | C2+C3 partials 6 and 8 beat at 7.5 and 18.5 Hz; C3+C4 beats once in 45 and 18 ms | 7.5 / 18.5 Hz; 45 / 18 ms | Exact |
| 2.9 | R = 35 dB allows 5 / 4 / 3 levels at σ\_v = 2.5 / 3 / 4 dB | 5 / 4 / 3 | Exact |
| 2.9 | The factor 3.29 keeps an inner level's misclassification ≤ 10% | True only for a note at the level's centre; averaged over the level, 24.2% (inner) and 12.1% (end) | Correct it (D4) |
| 2.10 | 5.5% misgraded 10 ms inside the edge, 0.5% at 15 ms | 5.48% and 0.47% | Exact |
| 5.2 | A strength-3 array over 7 factors needs about 30–40 runs; bound 27 | Greedy construction: 37 runs; bound 27 | Exact |
| 5.3 | 50 ppm of drift over 10 minutes is 30 ms | 30 ms | Exact |
| 5.4 | 280 notes measure 97% to ±2%; ±1% needs 1,118 | 279.5; 1,118 | Exact |
| 13.3 with 5.4 | A cell passes when its interval clears the gate, with ≥ 300 notes | Needs ≤ 3 misses in 300; a true 99% engine passes all 12 cells 0.5% of the time | Correct it (D2) |
| 6.2 | At 44.1 kHz windows run 8.8% longer and the threshold moves 0.09 nats | 8.84%; 0.085 nats | Exact |
| 6.5 | UNPROCESSED full scale is about 130 dB SPL | 94 + 36 = 130 dB | Exact |
| 6.6 | Chirp: 28.5 dB of processing gain and 0.14 ms resolution | 28.45 dB; 0.143 ms | Exact |
| 7.1 | A 10 Hz high-pass lowers A0 by 0.54 dB | 0.54 dB | Exact |
| 7.2 | The FFTs cost about 0.2 M butterflies per hop | About 0.10 M radix-2 complex butterflies | Conservative |
| 7.3 | The phase vocoder is unambiguous to ±93.75 Hz | fs ÷ 2H = 93.75 Hz | Exact |
| 8.3 | The key count must be one of 9 standard sizes | 54-key keyboards are sold widely and would loop the step | Correct it (D10) |
| 8.4 | Quick anchors B0 G1 A2 E4 B5 D7 B7; PSR-E343 C2 G2 F3 F4 G5 F6 B6 | Identical | Exact |
| 8.7 | The 1 s calibration window measures frequency to 0.00025 Hz at 20 dB | 0.00025 Hz | Exact |
| 9.5 | Bass refinement frames show two peaks once the gap exceeds about 6 Hz | Two Hann peaks need about 2 bins: 11.7 Hz at 8192 | Correct the wording (D12) |
| 10.3, 9.6 | A NoteOff's time is its release CUSUM's change point | No input-latency or register-bias correction, unlike onsets | Correct it (D3) |
| 10.4 | The median of 20 notes at 4 dB error is accurate to 1.1 dB | 1.12 dB | Exact |
| 11.3 | Canceller 60–90 / 120–180 / 230–370 ms; room echo 16–28 dB below the direct path at 5 cm | 58–92 / 117–183 / 233–367 ms; 15.6–28.3 dB | Exact |
| 14.4 | At B = 6×10⁻³, partials 5 and 6 sit 29.07 and 32.71 semitones up | 29.07 / 32.71 | Exact |

## Defects found and their fixes

Twelve defects, two of them high severity; each fix names what it could make worse and the guard against it.

| ID | Severity | Sections | What is wrong | Fix |
| --- | --- | --- | --- | --- |
| D1 | High | 2.5, 11.1, 13.2 | A waiting expected key fires falsely about once a minute; no gate measures it | Full prior only with an attack cue; cap at 3.38 nats otherwise; add a phantom-credit gate |
| D2 | High | 1, 5.4, 13.3 | 300 notes per cell cannot meet "the interval clears the gate" | 950–1,850 notes per cell, or a pooled test with a no-cell-significantly-below rule |
| D3 | Medium | 2.7, 8.6, 9.6, 10.3 | NoteOffs land 9 / 18 / 36 ms late (DRR 0 dB) and skip latency correction | Time releases on low-delay frames; subtract input latency and a measured release bias per tier |
| D4 | Medium | 2.9, 11.5 | The 10% misgrade holds only at a level's centre; averaged over the level it is 24.2% | Call a dynamic wrong only 1.645σ past the boundary; unclear in between |
| D5 | Medium | 2.8, 9.5, 9.11 | Power-excess z overstated by up to 1.4× | Correct the table; make the equal-octave gate conditional on measured beating |
| D6 | Medium | 6.1, 6.6, 8.10 | VOICE\_RECOGNITION is flat only from 100 Hz to 4 kHz; the chirp spans 1–8 kHz | Sweep 50 Hz–16 kHz; measure bass and click-band SNR per route; weight the click by it |
| D7 | Medium | 14.4 | The neural gather reaches partial 6; deep-bass ghosts come from higher partials | Gather up to partial 16 for sources A0–B2 |
| D8 | Medium | 1, 14.0, 14.5, 16.2 | The summaries plan a paid app; the master pre-trains on non-commercial data | Decide the scope before N2; if paid, a commercial data path |
| D9 | Low | 2.5, 10.2, 11.1 | Which-key margin: 3.4 nats in 11.1, but 5.67 nats implied by 2.5 | One categorical rule among the candidates, at 3.4 nats |
| D10 | Low | 8.3 | Calibration accepts only 9 key counts | Accept any count from 25 to 88 and ask the student to confirm it |
| D11 | Low | 9.3, 9.11 | Leave-one-out refits (3 multiplicative steps) are approximate; the fit is non-convex | Damped Newton on the 2–5 local amplitudes; check against converged evidence |
| D12 | Low | 2.2, 9.5 | Two wording errors | 0.14–1.88 bins by tier; about 12 Hz for two peaks at 8192 |

### D1 · Phantom credit while a lesson waits

The master sets h from a false-alarm budget and says the false-note rate falls as e^(−h) (2.4, 13.2). The expected-note prior lowers one key's threshold to 9.32 nats, which multiplies that key's rate by e^6.79, about 890:

```latex
R_{\text{expected}} = \frac{6}{88}\,e^{\operatorname{logit}0.9-\operatorname{logit}0.01} \approx 61\ \text{per hour}, \qquad P(\text{phantom within } t) = 1-e^{-t/59\,\mathrm{s}}
```

- In practice mode the prior lasts ±150 ms, so a skipped note is credited 0.51% of the time.
- With wait-for-correct the prior lasts as long as the student hesitates, and 13.2 counts false notes only at free-play thresholds.

&#91;embedded content: Derived from master v1.5 §2.4, §2.5 and §13.2 (false-alarm rate falls as e^(−h)) · re-derivation script audit\_calcs.py\]

**Fix.** In wait mode, apply the full 6.79-nat shift only when the key's own attack cue (click or phase surprise, τ = 1) fires within ±2 hops. At 6 false attacks per hour, one lands in a given 26.7 ms window with probability 4.4×10⁻⁵, so phantom credits fall to about one per 370 hours. Without an attack cue, cap the shift at 3.38 nats (threshold 12.73), which allows one phantom per 30 minutes of waiting.

**Could make worse:** a faint clickless expected note now needs 12.73 nats, so it shows after 261 ms instead of 191 ms. **Guard:** a new gate of at most 1 phantom credit per hour of waiting, measured on the noise takes with lesson priors on, and a directed test of a child singing the expected melody without playing (N2).

### D2 · Release gates that a good engine cannot pass

5.4 sizes cells to estimate 97% within ±2%, but 13.3 passes a cell only when its 95% interval clears 97%. With 300 notes that means at most 3 misses: an observed 99.0%.

&#91;embedded content: Clopper–Pearson 95% intervals against a 97% gate, binomial misses per cell · re-derivation script audit\_calcs.py\]

The 12 cells assume gate 1 is split by 3 registers × 2 distances within 1 m × 2 instruments.

**Fix.** Either size cells for power: 950 notes when the engine is truly at 99%, 1,850 at 98.5%. Or test the pooled rate, where 3,600 notes clear 97% with 96% probability at a true 98%, and fail a cell only when it is significantly below the gate after a Holm correction. The PSR-E343 self-play rig labels 22,000 notes in about 1.5 h of playback, so the larger counts are affordable on the digital keyboard.

**Could make worse:** pooling can hide one weak register. **Guard:** the no-cell-significantly-below rule, plus 13.2's per-register spread test.

### D3 · NoteOffs arrive late

The release CUSUM reads the level from Hann frames, whose taper hides a damper for part of each window. One hop after a full stop, the Hann 4096 level has moved only 0.014 dB. The change point is where the residual first crosses half the step:

| Tier | Hann frames: half the step (90% of it) | Low-delay frames: half the step (90% of it) |
| --- | --- | --- |
| Treble, 1024 | 9.1 ms (13.3 ms) | 6.5 ms (11.0 ms) |
| Middle, 2048 | 18.2 ms (26.5 ms) | 10.3 ms (20.0 ms) |
| Bass, 4096 | 36.4 ms (53.1 ms) | 18.1 ms (38.0 ms) |

Values are for DRR 0 dB, a 3 dB step; at +10 dB the Hann bass lag grows to 43.5 ms. 10.3 subtracts input latency and a register bias from onsets only, so bass NoteOffs land about 36 ms plus the input latency late, against the 50 ms release tolerance of 5.1.

**Fix.** Read the release level from low-delay frames, which halves the lag; subtract input latency; subtract a per-tier release bias measured on PSR-E343 MIDI note-offs, as 10.3 does for onsets. Restate 8.6's detection speeds per tier.

**Could make worse:** low-delay frames leak 13–35 dB more. **Guard:** use them only for the level of a key already sounding, whose own partials dominate; the joint fit keeps Hann frames.

### D4 · Dynamic levels misgrade more than 10%

With levels 3.29σ apart, a note exactly at a level's centre is misgraded 10.0%, as 2.9 says. Real notes spread across the level, and averaged uniformly over it the rate is:

```latex
P_{\text{miss}}(W) = 2\,[1-\Phi(W)] + \frac{2}{W}\,[\varphi(0)-\varphi(W)], \qquad P_{\text{miss}}(3.29) = 24.2\%, \quad P_{\text{miss}}(7.98) = 10.0\%
```

W is the level's width in units of σ\_v. End levels fail on one side only (12.1%), so 3, 4 and 5 levels average 16.2%, 18.2% and 19.4%. Information theory agrees: at R = 35 dB a microphone carries at most ½ log2(1 + R²/12σ²) bits, worth 4.2 / 3.5 / 2.7 levels at σ\_v = 2.5 / 3 / 4 dB, against the 5 / 4 / 3 shown.

**Fix.** Keep the levels for display. In grading, call a dynamic wrong only when the estimate lies 1.645σ\_v beyond the target level's boundary, and unclear in between, as 11.1 does for keys. False "wrong dynamic" reports then stay at or below 5% wherever the true value sits inside the level.

**Could make worse:** fewer dynamics get graded. **Guard:** report the unclear share per session.

### D5 · Octave power excess is weaker than tabled

The 2.8 table is reproduced exactly when the cross term 2r cos θ is given variance r². For a uniformly random fixed phase its variance is 2r², confirmed numerically:

| Upper note | Mean power excess | z in 2.8 | z corrected | Beat depth, peak to peak |
| --- | --- | --- | --- | --- |
| Equal | 3.01 dB | 2.5–2.7 | 1.94–1.97 | Full |
| 3 dB softer | 1.76 dB | 1.7–1.9 | 1.34–1.38 | 15.3 dB |
| 6 dB softer | 0.97 dB | 1.1–1.3 | 0.90–0.95 | 9.6 dB |
| 12 dB softer | 0.27 dB | 0.4–0.5 | 0.36–0.42 | 4.5 dB |
| 20 dB softer | 0.04 dB | 0.1 | 0.08–0.10 | 1.7 dB |

z counts 8 shared partials with a template spread σ\_T of 1–1.5 dB. On its own, z ≈ 1.95 confirms only 35% of equal upper notes at 9.11's limit of 1 false upper note per 100, so the 90% gate rests on beating or the upper key's own click. Acoustic octaves beat fast enough (C3+C4 completes a beat in 18–45 ms); looped digital samples with harmonic sustains barely beat, so the gate cannot hold there.

**Fix.** Correct the table. Make the equal-octave part of 9.11 conditional on the beat rate measured on take 12, and grade simultaneous equal octaves as unclear elsewhere. Self-play records the PSR-E343's octave pairs exactly, so the neural model can learn their fixed pair spectra.

### D6 · The fallback microphone is not flat where the engine listens

Android requires VOICE\_RECOGNITION to switch off noise reduction and automatic gain, but asks for ±3 dB flatness only from 100 Hz to 4 kHz. Below 100 Hz it strongly recommends ±20 dB, and from 4 to 22 kHz ±30 dB ([Android CDD 5.4](https://android.googlesource.com/platform/compatibility/cdd/+show/refs/tags/android-platform-12.1.0_r10/5_multimedia/5_4_audio-recording.md)). The bass fundamentals A0–G2 and the 3–12 kHz click band sit outside the flat range, and the 1–8 kHz chirp (6.6) measures neither end. Calibration absorbs a fixed response, but not lost SNR: a band pushed into the noise floor stays lost.

**Fix.** Sweep 50 Hz–16 kHz; store the route's response at both ends; measure the click band's SNR on the calibration strikes and scale click evidence by it. Where the click band is weak, restate that device's re-strike and latency ceilings.

### D7 · The neural gather stops at partial 6

14.4 gathers partials n = 2–6, which sit 12–31 semitones above their source key. Deep-bass notes reach a phone mostly through upper partials (calibration fits up to 30 in the bass, 8.7), and those land further up: n = 7 at 33.69 semitones, 8 at 36.00, 12 at 43.02 and 16 at 48.00, each plus stretch (+0.22 to +0.84 semitones at n = 16 for B from 10⁻⁴ to 4×10⁻⁴). A treble key cannot see the bass note behind such a ghost. DSP's joint model covers it; neural-only mode does not.

**Fix.** Extend the gather to n ≤ 16 for source keys A0–B2: 88 × 15 × 2 = 2,640 fixed weights, computed at calibration.

### D8 · Personal or paid

The master fixes personal, non-commercial use and pre-trains on MAESTRO (CC BY-NC-SA 4.0), with IDMT-PIANO-MM (CC BY-NC-ND 4.0) as a test set; 16.2 says to retrain before any distribution. The pasted summaries plan a paid app.

If the app will be sold, settle it before N2: drop MAESTRO from the shipped model's training, use own self-play, live playing, acoustic takes and simulated rooms, and replace IDMT-PIANO-MM with an own held-out acoustic set. Count content separately from audio, because three phones triple the audio but not the music: 22.5 h of audio holds 7.5 h of distinct playback (O4). Licences are a legal question, and this is not legal advice.

### D9–D12 in one line each

- **D9.** 11.1's 3.4 nats is the Bayes margin for "which of these keys was played"; 2.5's per-key shifts imply 5.67 nats when each key's CUSUM decides alone, so faint ±1 slips need 2.3 nats more evidence than designed.
- **D10.** 54-key keyboards are sold widely ([example](https://www.smythstoys.com/uk/en-gb/toys/arts-crafts-and-music/musical-instruments-and-karaoke/musical-instruments/electronic-piano-keyboard-54-keys/p/211449)); the size check would repeat its step forever on one.
- **D11.** The fit's curvature in a bin is (2Y − μ)/μ³, negative wherever the model exceeds twice the data, so the fit is non-convex and three warm-started multiplicative steps only approximate the leave-one-out evidence. Check them against fully converged evidence within 0.1 nats, like the sparse-against-dense check in 9.11.
- **D12.** Fundamentals sit 0.14–0.44 bins apart in the bass tier, 0.23–0.94 in the middle and 0.50–1.88 in the treble below G6; two Hann peaks at 8192 need about 11.7 Hz, not 6.

### Opportunities

| ID | Opportunity | Gain |
| --- | --- | --- |
| O1 | A known-frequency complex fit for adjacent bass keys, tried before ESPRIT (9.8) | A0 and A♯0 separable from partial 4 in the 4096 frame and partial 2 in the 8192 frame: about half the wait |
| O2 | Count overlapped silence frames by τ | 1.5 s of silence gives the 0.73 dB that 3 s gives today |
| O3 | Intermodulation atoms for the phone's and the keyboard's speakers | Explains the N3 sum tones at D4–G4 before they reach the expected-key prior |
| O4 | Self-play content stratified by interval, cluster and register; content hours counted apart from audio hours | Hard combinations over-represented; no triple-counting of the same music |
| O5 | Coach the phone within 1 m | +6 dB of SNR gives about 7.7× the evidence per bin at 0 dB SNR |

## The 26 cases: coverage and grades

Every one of the 26 cases has a mechanism, a section and a directed test in the master; 20 pass the audit as written, 3 need one number or rule fixed, and 3 carry a defect that changes behaviour.

| # | Case | Master ceiling | Audit | What changes |
| --- | --- | --- | --- | --- |
| 1 | Neighbour collision | Good for single notes; bounded for bass clusters | A | O1: a known-frequency complex fit separates A0 and A♯0 from partial 4 in the 4096 frame and partial 2 in the 8192 |
| 2 | Soft to loud, short to long | Bounded; a faint clickless bass note can take 330 ms | A | Dividing by τ is already the most efficient rate for steady evidence; only SNR shortens it (section 8) |
| 3 | Phone near or far | Good within 1 m | A | O5: coach the phone closer; evidence grows about 7.7× for +6 dB at 0 dB SNR |
| 4 | Fast playing, repeats | Good | A | — |
| 5 | Chords | Good; dense clusters bounded | A | N4: the keyboard speaker's intermodulation on loud two-hand chords |
| 6 | Streaming note life cycle | Full | A | — |
| 7 | Re-strike while ringing | Good | A | D6 on VOICE\_RECOGNITION devices, where the click band may be weak |
| 8 | Different pianos | Good | B | D10: 54-key keyboards fail the size check; N14 reed instruments |
| 9 | Calibration feeds the engine | Full | A | — |
| 10 | Octave ghosts, masking | Good when struck apart or held one beat; bounded for a much softer simultaneous short upper note | B | D5: power-excess z corrected; the equal-octave gate depends on measured beating |
| 11 | Missing fundamental (A0–B1) | Good; bass needs 40–80 ms | A | D6: below 100 Hz VOICE\_RECOGNITION may be 20 dB down; O1 helps |
| 12 | Room echo against damper; undamped keys | Good where observable; not graded elsewhere | C | D3: release timestamps lag 9 / 18 / 36 ms on Hann frames, uncorrected |
| 13 | Whistle, clap, speech, thump | Bounded by the false-alarm target | A | N2: singing the expected melody in a lesson needs its own test |
| 14 | Pedal overflow, stuck keys | Full; release under pedal not graded | A | — |
| 15 | Clipping | Full | A | — |
| 16 | Bass break, stretch, timbre | Good | A | — |
| 17 | Tuning drift | Full | A | — |
| 18 | OS stalls, threading | Full | A | — |
| 19 | Lesson against free play | 93–99% in lessons, about 93% in free play | C | D1: phantom credit while waiting; D9: two margins |
| 20 | Block chords at the same instant | Full; doubled octaves as case 10 | A | — |
| 21 | Three-zone windows | Full | A | Every window number re-derived exactly |
| 22 | Velocity independent of distance | Bounded: levels set by measured error | C | D4: the level rule misgrades 16–19% on average |
| 23 | Fast calibration | Full | A | O2: the silence step can drop from 3 s to 1.5 s |
| 24 | Thresholds after gain | Full | A | — |
| 25 | dB scaling | Full | A | Exact for low-delay frames too |
| 26 | Latency, telemetry | Full once measured | B | D3: NoteOffs need the same latency and bias correction as onsets |

The master's own ceilings stand: 12 full, 10 good, 3 bounded and case 19 as a rate. The audit grades come to 20 A, 3 B and 3 C.

## Beyond the 26: new cases, combinations and the test plan

Eighteen cases join the master's 28 beyond-cases: 9 are solvable now, 1 needs an upgrade, 4 are bounded, 3 cannot be observed from one microphone and 1 is out of scope.

| # | Case | Physics | Status | Fix or test |
| --- | --- | --- | --- | --- |
| N1 | Phantom credit while a lesson waits | A lowered threshold held for as long as the student hesitates | Solvable now | D1: attack-gated credit and a phantom-credit gate |
| N2 | Singing or humming the expected melody without playing | A voice at the expected pitch meets a 6.8-nat prior | Solvable now | The harmonic-source template (9.4) plus D1's attack gate; a directed test in a lesson |
| N3 | Phone-speaker intermodulation of the backing pads | Sum tones of pad dyads: C3+E3 at 295.6 Hz (D4 +11.5 cents), C3+G3 (E4 −14.9), C3+A3 (F4 +7.8), F3+A3 (G4 +11.5), D3+B3 (G4 +7.8), all melody keys of the Jingle Bells chorus | Needs an upgrade | O3: bounded atoms at f\_i + f\_j for sounding backing pairs; a two-tone step in the chirp test; read take 13's false notes by pitch |
| N4 | Keyboard-speaker intermodulation of the student's loud chords | Sum tones form a harmonic series at f1 + f2, 8–16 cents off the nearest key | Solvable now | Frequency evidence (9.2) rejects them at good SNR; test two-hand ff chords on the PSR-E343 |
| N5 | Looped digital samples with harmonic sustains | Simultaneous octaves barely beat | Bounded | D5: unclear in lessons; learn the pair spectra from self-play |
| N6 | Sostenuto (middle) pedal on a grand | Some keys sustained, the rest damped | Bounded | Judge release observability per note from its own decay; a global pedal head cannot express it |
| N7 | Half-pedal and flutter pedal | Partial damping, a continuous quantity | Bounded | A pedal head that estimates damping; length ungraded while partial damping is detected |
| N8 | Practice mute or a hybrid's quiet mode | Click and brightness drop sharply | Solvable now | One calibration profile per mode; "piano mismatch" (10.7) catches a switch mid-session |
| N9 | No acoustic output: headphones in the keyboard, volume at zero | No sound reaches the phone | Unobservable | Detect "notes expected, nothing heard" and prompt the student |
| N10 | A classroom with several keyboards and phones | Identical instruments cannot be told apart | Unobservable for identical instruments | Headphones on the other keyboards; level helps only when instruments differ |
| N11 | A second player: a teacher's demonstration, four hands | One microphone cannot tell players apart | Unobservable | A "teacher plays" pause in lessons |
| N12 | Transpose switched on after calibration | Edge notes sound outside rangeMidi and get prior 0 | Solvable now | A small prior up to 12 semitones past the range, so edge notes reach the transpose watch |
| N13 | A keyboard size outside the list, such as 54 keys | The size check repeats forever | Solvable now | D10 |
| N14 | Reed instruments (harmonium, melodica) or organ voices | No hammer and no decay | Out of scope | A "piano mismatch" message; never graded |
| N15 | Phone vibration during a lesson | A steady buzz with no decay | Solvable now | Pure-tone or harmonic alternative (9.4); haptics off for the session |
| N16 | Microphone covered by a hand or a case | The upper bands drop suddenly | Solvable now | A spectral-tilt jump against calibration raises "microphone blocked" |
| N17 | Low-power or battery-saver mode | The CPU is throttled | Solvable now | Treat it like the thermal fallback (14.10) |
| N18 | Bass octaves such as A0+A1 | Beat rate scales with f0: about 2.4× slower than C2+C3 at the same partial and B | Bounded | Unclear until one beat is heard |

### Case combinations

Cases combine, and the 26 cases alone give 325 pairs, 2,600 triples and 67,108,864 subsets, far too many to test by name. A covering array covers them through their factors instead: every combination of any t factor levels appears in at least one run.

| Design | Factors | Combinations to cover | Runs | Full factorial |
| --- | --- | --- | --- | --- |
| Master 5.2, strength 3 | 7 conditions with 3, 3, 3, 2, 3, 2 and 2 levels (instrument taken as the seventh) | 584 triples | 37 (lower bound 27) | 648 |
| Extended, strength 2 | The 12 factors below | 528 pairs | 19 (lower bound 12) | 209,952 |
| Extended, strength 3 | The 12 factors below | 4,952 triples | 69 (lower bound 36) | 209,952 |

Run counts come from a greedy construction; PICT or ACTS usually need slightly fewer. The 12 factors add content to the master's conditions: instrument (acoustic, digital); phone (3); distance (0.3, 1, 2 m); placement (stand, piano top, table); room (small, echoey); background (quiet, speech, TV); pedal (up, down); mode (waiting lesson, practice with backing, free play); register (bass, middle, treble); dynamics (pp, mf, ff); texture (single note, n:1 interval, semitone cluster, 4–6-note chord); articulation (legato, staccato, fast repeat). Each run is one short take with its content and conditions fixed, so 69 takes hear every combination of any three levels at least once.

### Where risks multiply

These combinations stack two or more weaknesses; each needs a directed test on top of the array.

| Combination | Why it compounds | Guard |
| --- | --- | --- |
| Waiting lesson × expected-key prior × TV or speech | A lowered threshold held for as long as the student hesitates, on noisy evidence | D1's attack gate and phantom-credit gate |
| Waiting lesson × singing the melody | A harmonic voice at the expected pitch, boosted by 6.8 nats | D1's attack gate; test N2 |
| Practice backing × pad dyads × expected melody keys | Sum tones land 8–15 cents from D4–G4 exactly while those keys carry the 0.9 prior | O3 atoms; take 13 read by pitch |
| Looped digital samples × simultaneous octave × the 9.11 gate | No beating and no separate click leave z ≈ 1.95 | D5's conditional gate |
| Echoey room × bass key × note-length grading | A 0.4 dB step at −10 dB DRR plus a 36 ms window lag | D3 and the observability map |
| Transpose after calibration × keys near the range ends | The sounding pitch leaves rangeMidi and gets prior 0 | N12 |
| VOICE\_RECOGNITION device × soft re-strikes | The click band may sit 30 dB down, and re-strikes rely on the click | D6 |
| Phone at 2 m × clickless soft note × free play | Evidence per bin shrinks as SNR² at low SNR | O5 distance coaching |

## Bounded cases: ceilings and how close the engine can get

Each bounded case has a formula that sets its ceiling; the engine already sits on most of them, and two can still move (cases 1 and 11 through O1, case 2 through SNR).

| Case | Ceiling | Numbers | Lever |
| --- | --- | --- | --- |
| 2 · Faint clickless notes | Delay ≈ hτ ÷ D\_raw; for steady evidence, dividing by τ already reaches the best possible information rate | 330 ms in free play and 191 ms in a lesson at 2 nats per hop raw, bass tier | More evidence per hop: +3 dB of SNR gives 2.9×, +6 dB gives 7.7× at 0 dB SNR (O5) |
| 1, 11 · Bass neighbours sounding together | The correlation ρ of the two partials over the window | Energy separates from partial 15 (4096) and 8 (8192); a known-frequency fit reaches ρ ≤ 0.85 from partial 4 (variance × 2.97, 4.7 dB) and partial 2 | O1 moves separation from about 170 ms to about 85 ms where partials 4–14 rise above noise |
| 10 · Much softer simultaneous n:1 upper note | Power excess z = √8 r² ÷ √(2r² + σ\_lin²); beating needs one beat of the fastest shared partial | z = 0.36–0.42 at −12 dB and 0.08–0.10 at −20 dB; C3+C4 beats in 18–45 ms, C2+C3 in 54–134 ms | At the ceiling; graded unclear |
| 22 · Dynamic levels | ½ log2(1 + R²/12σ\_v²) bits | 4.2 / 3.5 / 2.7 levels at σ\_v = 2.5 / 3 / 4 dB | D4's grading rule; beyond it only MIDI velocity |
| 12 · Release in an echoey room | ΔL = 10 log10(1 + 10^(DRR/10)) | 10.4 / 3.0 / 0.4 dB at DRR +10 / 0 / −10 dB | At the ceiling; D3 fixes timing only |
| 19 · Free play | The answer space for up to 4 notes | 21.2 bits on 88 keys, 19.1 on 61, 18.4 on 54, 13.9 on 25; a lesson step needs 4.9 | Range scoping is already applied; the neural model and the improvement loop are the levers |
| 13 · Non-piano sounds | The false-alarm budget | 6 false notes per hour | At the budget by design |
| Echo cancellation | The room tail and the speaker's non-linearity | The tail must fall 7–11 dB: 58–92 ms at RT60 0.5 s, 233–367 ms at 2 s | O3 for intermodulation; headphones below 15 dB of cancellation |

**Why statistics cannot shorten the faint-note delay.** A steady evidence shift δ per hop, on hops whose long-run variance is τσ², carries a fixed amount of information per hop, and the τ-divided CUSUM collects all of it:

```latex
\frac{(\delta/\tau)^2}{\sigma^2/\tau} = \frac{\delta^2}{\tau\,\sigma^2} = I_{\text{GLS}}\ \text{per hop}, \qquad \mathrm{KL}(s) = s - \ln(1+s) \approx \tfrac{s^2}{2}
```

Whitening (the upgrade path in 9.9) helps sudden attacks, not steady clickless notes. The lever is SNR: evidence per bin grows like s² at low SNR, and inside the critical distance halving the phone's distance adds about 6 dB.

**Why known frequencies beat peak-picking for bass neighbours.** Peak-picking needs two separate hills, about 2 bins apart. Calibration already knows both partials' frequencies, so the fit needs only their two shapes to differ: with Hann weighting their correlation is 0.85 at half a bin and 0.50 at one bin.

## Unobservable from one microphone: proofs and answers

Twelve things leave no usable trace in the sound, so no algorithm can recover them; each is answered by the score, a sensor, or an honest "not graded". The master already names U1–U5; U6–U12 are added here.

| # | What cannot be known | Why (proof sketch) | Answer |
| --- | --- | --- | --- |
| U1 | When a finger leaves a key under the sustain pedal | The damper stays lifted either way, so the string's sound is identical; only faint key-return noise differs | Not graded (master); MIDI or a camera if added |
| U2 | Release on keys without dampers (the top 17–23) | No damper exists, so the string rings the same | Not graded; measured per piano (master) |
| U3 | Release where the room hides the step | ΔL falls to 0.41 dB at DRR −10 dB, and the information in a step scales with ΔL² | Not graded where unobservable (master) |
| U4 | A much softer simultaneous n:1 note that ends before one beat, with no click | z ≤ 0.10 at −20 dB, the same size as the lower note's own template error | Unclear in lessons (master) |
| U5 | Zero misses together with zero false notes | Neyman–Pearson: when the two distributions overlap, lowering one error raises the other | A stated false-alarm budget (master) |
| U6 | More than about 3–5 dynamic levels, let alone MIDI's 127 | Capacity ≤ ½ log2(1 + R²/12σ²) = 1.4–2.1 bits at R = 35 dB and σ = 2.5–4 dB; 127 levels need 7 bits | Levels from the measured error (2.9, D4); MIDI velocity |
| U7 | Which finger (1–5) or which hand pressed a key | The sound does not depend on the finger or the hand | The score's hand and finger marks act as priors; a camera |
| U8 | Which of two identical keyboards, or two players, made a note | A mixture of identical sources is symmetric in them | Headphones or MIDI per instrument; a "teacher plays" pause |
| U9 | Anything played without acoustic output | No sound carries no information | Detect it and prompt; MIDI |
| U10 | When a key was pressed silently, or too slowly to sound | No hammer contact; sympathetic ringing shows the key is held only once another note excites it | Not graded |
| U11 | The pressed key under an unknown transpose in free play | Sounding pitch = key + t, and every t fits equally well | Calibration's transpose value; the lesson's transpose watch |
| U12 | Half-pedal depth while nothing sounds | No ringing string shows the damping | Inferred later from decays; a pedal sensor |

## Forward roadmap

&#91;embedded content: audit roadmap · 4 phases, 4 gates\]

Phase A changes only rules and numbers, so it can merge into the master as soon as you agree. Phase B runs on the Phase 0 rig and gates Phase C, while the scope decision in Phase D must land before the neural data step N2.

## Merge into master

Nothing below is applied yet: per the versioning rules the master changes only after a yes, and this merge would raise it to v1.6.

| Master section | Change |
| --- | --- |
| 1, gates | Add a phantom-credit gate (≤ 1 per hour of waiting); state that every gate's cells are sized from statistical power (D1, D2) |
| 1, decisions | Settle personal or paid use; if paid, change the Use row and drop MAESTRO pre-training (D8) |
| 2.2 | Neighbour gaps 0.14–1.88 bins by tier; add the known-frequency criterion, ρ ≤ 0.85 from partial 4 at 4096 (D12, O1) |
| 2.5 | In wait mode, the full expected-key shift only with an attack cue, capped at 3.38 nats otherwise; one which-key rule at 3.4 nats (D1, D9) |
| 2.6 | Noise accuracy 0.25 and 0.51 dB from 3 s; 1.5 s gives 0.73 dB (O2) |
| 2.7, 8.6 | Release detection speeds per tier, including the window lag (D3) |
| 2.8 | Corrected power-excess table (D5) |
| 2.9, 11.5 | Dynamics graded wrong only 1.645σ past a boundary; misgrade figures averaged over the level (D4) |
| 4 | New settings: waitPriorCapNats 3.38, attackGateHops 2, cell sizes from power, release level from low-delay frames |
| 5.2, 13.4 | The 12-factor strength-3 array (69 takes); directed tests N2, N3, N4, N5 and N12 |
| 5.4, 13.3 | Cells sized for power (950–1,850 notes), or the pooled test with Holm-corrected cell checks (D2) |
| 6.1, 6.6, 8.10 | Chirp from 50 Hz to 16 kHz; bass and click-band SNR per route; click evidence weighted by it (D6) |
| 8.2 | Silence step 1.5 s (O2) |
| 8.3 | Accept any key count from 25 to 88, confirmed by the student (D10) |
| 9.3 | Leave-one-out refits checked against converged evidence; damped Newton if they miss (D11) |
| 9.5 | About 12 Hz for two visible peaks at 8192 (D12) |
| 9.6, 10.3 | Release level from low-delay frames; subtract input latency and a per-tier release bias (D3) |
| 9.8 | A known-frequency complex fit before ESPRIT (O1) |
| 9.11 | The equal-octave gate conditional on the measured beat rate (D5) |
| 10.6 | A pedal head that estimates damping depth; per-note observability under sostenuto (N6, N7) |
| 11.1 | Attack-gated credit in wait mode; a "teacher plays" pause (D1, N11) |
| 11.3 | Intermodulation atoms for sounding backing pairs; a two-tone test (O3, N3) |
| 14.4 | Cross-key gather up to partial 16 for sources A0–B2 (D7) |
| 14.5 | Content hours counted apart from audio hours; chords generated by interval and register strata (O4) |
| 15 | Grades and notes for cases 8, 10, 12, 19, 22 and 26; N1–N18 in the beyond table; U6–U12 beside section 1's physics limits |
| 16.2 | New risks: phantom credit, gate power, the VOICE\_RECOGNITION response |

### Sources

- [Reevo 2 — Piano Detection Engine: End-to-End Implementation Plan](https://claude.ai/artifact/FHiwgewYvGVz3CX6KBbjWH), master v1.5, and the Master document and versioning rules in the Piano project.
- [Android CDD 5.4, Audio Recording](https://android.googlesource.com/platform/compatibility/cdd/+show/refs/tags/android-platform-12.1.0_r10/5_multimedia/5_4_audio-recording.md): VOICE\_RECOGNITION flatness, noise-reduction and gain-control requirements (D6).
- [Electronic Piano Keyboard 54 Keys (Smyths)](https://www.smythstoys.com/uk/en-gb/toys/arts-crafts-and-music/musical-instruments-and-karaoke/musical-instruments/electronic-piano-keyboard-54-keys/p/211449): a 54-key keyboard on sale (D10).
- Re-derivation script audit\_calcs.py, saved beside this audit in the Piano project: every number in sections 4–9.
