# Reevo 2 Calibration Engine v1.0 (based on master v1.5)

Oct 29, 2026 · @sumit

**Version:** calibration design v1.0, based on master v1.5 (28 Oct 2026), the engine re-audit v1.0 and the two-octave strategy audit v1.0. It replaces master section 8 and the calibration parts of 2.4, 2.6, 6.6, 7.3, 7.4, 9.1–9.9, 10.4 and 10.7; nothing is merged until you agree (Merge into master).

## Verdict at a glance

Today's calibration measures the piano well and the room badly, and the room is where detection breaks: a fan that makes a band wobble by 1 dB between frames turns the 16.1-nat threshold into 8–10 nats. The new engine makes the noise part of the model, measures the false-alarm exponent in the user's own room, measures every key in place, and hands the engine honest uncertainty.

| What | Master v1.5 | This design | Where |
| --- | --- | --- | --- |
| Room noise model | One mean per bin from 3 s | Mean, dispersion, profiled gains, tonal lines, up to 4 states per room | 4 |
| Fan modulation of 1 dB between frames | θ\* 0.48–0.64: 330–4,700 × the false-note budget | θ\* 0.97–1.03 | 4.2 |
| A change in the noise followed in | About 10 s | 11 ms for 3 dB, 120 ms for 1 dB | 4.4 |
| A hum line 20 dB over the floor on F4 | The fundamental stays hidden | Removed to 15.5 dB under the floor (2048 tier) | 4.3 |
| Thresholds in the user's room | Lab values and a ±1-nat trim | θ\* measured per tier at calibration and in every session | 5 |
| Non-anchor keys outside their own window | 10–15%, if σ\_model is the curve's error | 0.03–0.24% | 6.1 |
| Template error per partial at 0 dB ratio | 6.4 dB with 7 anchors, 6.1 dB with 16 | About 1.5 dB measured key by key, and stated either way | 7.1 |
| Calibration time, acoustic | Quick 62 s, full 106 s | Quick 60.5 s; standard with the scan 104.5 s | 9.1 |
| A moved phone | Full recalibration | A 30–44 s re-scan, flagged by the health monitor | 10.2 |

**The five changes that matter most**

1. **Profile the noise gains out of the evidence (4.2).** The one fix for fan modulation and drifting noise, at a price of 2–4% of a key's evidence.
2. **Measure θ\* in the user's room (5).** Per tier, from 1.5 s of silence, at calibration and at the start of every session.
3. **Scan every key (7.1, 9.3).** 12–44 s removes interpolation from tuning and templates, which no number of anchors can.
4. **Hand the engine honest uncertainty (6.1, 6.2, 7.2).** Each key's own scatter, correlated partials and template variance.
5. **Four layers with targeted recalibration (3, 10, 11).** A fan, a moved phone or a new route costs seconds, not a new calibration.

Section numbers refer to this document; the master's are written as "master 9.3". Every number is a derivation or a simulation from calibration\_calcs.py (section 12); Phase 0 recordings set the real values.

## 1. What calibration does today

Master v1.5 measures the instrument carefully and the room barely at all. Long windows, robust fits and Chebyshev anchors give good f0 and B; one 3-second average decides how every bin is treated for the life of the profile, and the statistics behind every threshold come from the lab, not the user's room.

| # | Element | What it measures and how | Feeds | Master |
| --- | --- | --- | --- | --- |
| 1 | When it runs | Before the first screen that plays the piano; resumes after an interruption; only a run that passes the check saves a profile | Everything | 8.1 |
| 2 | Protocol | Acoustic or digital, 3 s silence, lowest and highest key, anchors at each loudness with the last strike held 1.5 s, bass-break strikes, chirp, 5-key check. Quick 62 s (acoustic) and 79 s (digital); full 106 s and 146 s | — | 8.1 |
| 3 | Noise | Mean power per bin in every tier (513 + 1,025 + 2,049 + 4,097 bins) over 3 s; a transient restarts the step. Stated accuracy 0.37 / 0.73 dB; 0.25 / 0.51 dB when overlapped frames are counted by τ (re-audit O2) | Every per-bin SNR, the joint model's noise term ν | 2.6, 8.2 |
| 4 | Range, tuning, transpose | Range from the end strikes; overall offset c\_g as the median over anchors; digital transpose when c\_g sits within 10 cents of a whole semitone; acoustic offsets accepted, tuning suggested beyond ±50 cents; wrong-key check at 35 cents; 9 standard key counts | Priors, key mapping | 8.3 |
| 5 | Anchors | Chebyshev nodes rounded to white keys: 7 quick, 16 full, plus the two range ends | Every curve across the keyboard | 8.4 |
| 6 | Loudness levels | Acoustic p and f (m optional); digital p, m and f. The velocity sweep exists only in the lab protocol | Templates, velocity | 8.5, 5.2 |
| 7 | Templates | Partial magnitudes normalised to sum 1, up to 30 / 16 / 8 partials; attack window 30–80 ms and sustain 300–600 ms; brightness β per level. Interpolated linearly in key index between anchors of one segment, and in β between levels | Joint model (9.3), velocity (10.4) | 8.5 |
| 8 | Decay | Two-slope least-squares fit over the 1.5 s hold: λ1, λ2 and their crossover, one envelope per key, interpolated log-linearly | Re-strike rise, tails, release | 8.6 |
| 9 | Release and observability | Step in the first 20 ms after release, slope over the next 200 ms; σ\_L from a linear predictor of the hold's level wobble; observable when the step is at least 1 dB or the slope 20 dB/s steeper; undamped range measured | Release CUSUM (9.6), note-length grading | 8.6 |
| 10 | Partial frequencies, f0 and B | 1.0 s Hann from 50 ms after onset, zero-padded 2×, ±50-cent search, quadratic interpolation; partials up to 10 dB SNR below 8 kHz; weighted least squares on Fletcher's linear form with Huber reweighting and standard errors | Every partial position | 8.7 |
| 11 | Across the keyboard | log B linear in key on each side of the bass break; stretch a cubic in key; break located by bisection; digital B piecewise from the nearest anchor; uncertainty passed on as σ\_model | Frequency evidence (9.2), candidates (9.1) | 8.8 |
| 12 | Latency and echo path | 100 ms chirp, 1–8 kHz, 5 runs, median kept; 1 s tail gives echo gain, decay curve, canceller length and starting filter, per route | Timestamps, echo canceller | 6.6, 8.9 |
| 13 | Quality check | 5 random keys must be detected as the right key with residuals within 3σ; report of noise, SNR per register, fit residuals, observability, clipping | Pass, warn or repeat | 8.10 |
| 14 | Profile v2 | About 100 KB: global part, about 193 floats per key, noise 31 KB, per-route part; one per instrument and location, tied to a phone model; strike audio kept for neural adaptation | Engine, lock-free swap | 8.11 |
| 15 | Online refinement | Confident isolated notes and lesson-correct notes update f0 and B per key through a Kalman filter (process noise about 1 cent per hour acoustic, 0 digital), plus one global drift state | Partial positions | 8.12 |
| 16 | Online noise tracking | Minimum statistics with a 5 s time constant, frozen within 2 bins of predicted partials; noisy-room warning at +10 dB in 200–4,000 Hz | ν between calibrations | 7.4 |
| 17 | Session gain | Median over 20 confident notes of level minus the level predicted from brightness; observability re-judged when it moves more than 2 dB; touch response off detected when soft and loud land within 2 dB | Velocity, release steps | 10.4 |
| 18 | Statuses | Calibration needed at 30 cents of drift or noise 10 dB above calibration; piano mismatch at 3σ misses; transpose suspected | UI | 10.7 |
| 19 | Evidence scale | Logistic evidence models, τ and the ±1-nat threshold trim are fitted on lab recordings, per engine build, never per user | Every threshold | 9.9, 13.2 |
| 20 | Template spread σ\_T | Per register in Phase 0, refined from confident notes | Harmonic-interval test | 9.5 |
| 21 | Neural adaptation | Features normalised by the calibration noise and band mean; FiLM inputs from calibration; Level C refit of 16 numbers on the strikes | Neural evidence | 14.8 |

**Unmerged audit additions** that this design keeps: silence cut to 1.5 s (re-audit O2), a 50 Hz–16 kHz sweep with bass and click-band SNR per route (D6), any key count from 25 to 88 (D10), a per-tier release bias (D3), and key-by-key calibration of a focus window with its octave and twelfth pairs (two-octave audit, section 7).

## 2. What it does not cover

Calibration misses 38 cases, 11 of them high severity, and most sit where it measures least: the room's noise, the room's acoustics and the uncertainty it hands the engine. Each row names the mechanism, what it costs and the section that fixes it; bench numbers come from calibration\_calcs.py (section 12).

### Room noise

| # | Gap | What goes wrong | Severity | Fixed in |
| --- | --- | --- | --- | --- |
| G1 | Noise is one mean spectrum | Three seconds become one average per bin. Spread, tones, modulation and steadiness are never measured, so a fan, a hum and a quiet room differ only in level | High | 4.1 |
| G2 | Common band modulation: fan blade-pass, air conditioner, traffic swells, an oscillating fan | The joint model holds noise fixed, so a band 1 dB louder in one frame lends evidence to every key in it at once. A 1 dB frame-to-frame wobble makes 16.1 nats act like 7.7–10.3, or 330–4,700 times the false-note budget | High | 4.2 |
| G3 | Steady tones: mains hum and its harmonics, inverter and transformer hum, motor whine, fan-regulator buzz | Counted as noise power, a tone hides the partial under it for good, and the exponential model misreads it because a tone's power barely fluctuates. The pure-tone alternative re-searches it every hop, and a nearby line biases phase-vocoder frequencies. On 50 Hz mains, 350, 700 and 1,400 Hz sit 3.8 cents above F4, F5 and F6 | High | 4.3 |
| G4 | Wind on the microphone: a ceiling fan's downdraft on a phone lying flat | Gusty low-frequency rumble with heavy tails that can overload the capsule. Nothing detects it; bass evidence and the noise tracker absorb it | High | 4.7 |
| G5 | Noise that changes after calibration: a fan switched on or re-speeded, a compressor cycling, an oscillating fan's sweep, rain | The 5 s minimum-statistics tracker takes about 10 s to follow (master 7.4), and thresholds in that band are wrong meanwhile. Nothing remembers noise states seen before | High | 4.4, 4.5 |
| G6 | Each session starts from the calibration day's noise | Noise is measured only at calibration, so every session begins with a stale spectrum until the tracker catches up | Medium | 4.6 |
| G7 | Continuous sound during the silence step: speech, TV, a fan turned on halfway | Only a transient restarts the step; continuous speech or TV is averaged in as noise and raises every floor | Medium | 4.1, 9.4 |
| G8 | The click band under room noise | Fans fill 3–12 kHz with broadband noise; the onset model was fitted on lab noise, so click evidence is mis-scaled in the room | Medium | 5.3, 8 |
| G9 | Thresholds assume the lab's null | τ, the evidence coefficients and the ±1-nat trim all come from Phase 0. Nothing checks the false-alarm exponent θ\* in the user's room, and the trim cannot absorb θ\* below about 0.9: at 0.7 the rate stays 62 times over budget | High | 5 |
| G10 | The tracker learns what it should not | It freezes bins near predicted partials but learns any sustained unmodelled sound (sympathetic ringing, backing residue, a 65th template) as noise; minimum statistics also run low without bias compensation | Medium | 4.5 |
| G11 | No per-key detectability | The only noise output is a broadband warning at +10 dB. In a room 15 dB noisier, a p note on a C4-like key goes from 5 ms to about 400 ms and pp is lost, with no warning naming those keys | Medium | 9.6 |

### Room and placement

| # | Gap | What goes wrong | Severity | Fixed in |
| --- | --- | --- | --- | --- |
| G12 | Room ripple in the templates | Reflections give every partial its own gain: a 5.1 dB spread at 0 dB direct-to-reverberant ratio, 2 dB at +10 dB. Neighbouring keys' partials sit tens of hertz apart, beyond the room's 4.4 Hz correlation bandwidth, so templates interpolated between anchors err by 6.4 dB per partial; 16 anchors still err by 6.1 dB | High | 7.1 |
| G13 | The phone moves, a lid opens, a case goes on | Only session gain (one broadband number) and observability follow; template shape and tilt do not. The echo-path watch runs only in practice mode | Medium | 7.4, 10.2 |
| G14 | Release judged on total level | The direct-to-reverberant ratio changes with frequency, so release steps differ by partial; the total level averages away the partials with the largest steps | Medium | 7.3 |
| G15 | Chirp band and path | 1–8 kHz misses the bass fundamentals and the top of the click band (re-audit D6), and the speaker's path is not the piano's | Medium | 8 |

### Instrument

| # | Gap | What goes wrong | Severity | Fixed in |
| --- | --- | --- | --- | --- |
| G16 | A key's own mistuning is not in its uncertainty | If σ\_model is the fitted curve's standard error, 10–15% of non-anchor keys fall outside their own 3σ window, at 1 cent of scatter as at 8. Such a key is never a candidate in free play, so online refinement never reaches it | High | 6.1 |
| G17 | Partial residuals treated as independent | A common cents offset or a B error moves every partial together; summed as independent, a key 8 cents sharp pays 22.6 nats instead of 0.89 | Medium | 6.2 |
| G18 | Unison strings | Two or three strings slightly apart make each partial a doublet: beating, double decay, a wandering phase-vocoder frequency. Only the level wobble σ\_L is measured | Medium | 6.3 |
| G19 | Attack pitch glide | Tension modulation raises pitch while a loud string swings wide. Calibration measures from 50 ms on; the live engine decides in the first 20–80 ms | Low | 6.3 |
| G20 | Phantom partials and longitudinal modes | Rejected by the robust fit and folded into the loud template, but their frequencies and level law (about 2 dB per dB of note level) are not kept, so at other dynamics they become ghost evidence | Medium | 6.4 |
| G21 | One decay per key | Upper partials die faster, so a ringing template darkens; tails and the rise-above-decay residual are wrong for upper partials | Medium | 6.5 |
| G22 | Dynamics beyond the calibrated strikes | Templates are interpolated in brightness between p and f; ppp and fff are extrapolated without a model | Low | 6.4 |
| G23 | Stretch as a free cubic | Ignores that tuners set octaves from B, and a cubic swings at the ends | Low | 6.1 |
| G24 | Seasonal drift is not uniform | One global state moves all keys together, but humidity does not move every register by the same amount | Low | 10.1 |
| G25 | Badly mistuned unisons | Not detected or modelled; on a rarely tuned piano each partial becomes a wide cluster | Medium | 6.3 |
| G26 | Pedal down, double strikes, early release, a soft strike played loud | Only the wrong key and the key count are checked; a pedal fills templates with sympathetic strings and erases the release step | Medium | 9.4 |
| G27 | Digital zones, effects and volume | B zones are handled, template zones are not; reverb, chorus, panel sustain or a volume change after calibration go unnoticed | Medium | 6.6 |
| G28 | Template error is not used | The joint model treats templates as exact; anchor-quality templates added 6–12 points of false notes on the two-octave bench | High | 7.2 |

### Device and route

| # | Gap | What goes wrong | Severity | Fixed in |
| --- | --- | --- | --- | --- |
| G29 | Automatic gain or noise suppression still active | Some devices process even the unprocessed sources; pumping and spectral gating corrupt every level and decay, and nothing checks | High | 8 |
| G30 | Sample-rate mislabel | A 44.1 kHz stream read as 48 kHz moves every partial by 147 cents; nothing checks | Low | 8 |
| G31 | Headroom | Overload is flagged only while playing; calibration never measures how close ff comes to the capsule's limit | Low | 8 |
| G32 | One microphone only | Two microphones could separate wind and diffuse noise from the piano by coherence; unused | Low | 8 |

### Process and statistics

| # | Gap | What goes wrong | Severity | Fixed in |
| --- | --- | --- | --- | --- |
| G33 | Fixed protocol | The same anchors and strikes in a quiet room and a noisy one, on a tuned piano and a neglected one; no stop rule tied to measured precision | Medium | 9.2 |
| G34 | Weak validation | 5 keys catch only gross failures; interpolation is never cross-validated, and reported uncertainties are never checked for coverage | Medium | 9.5 |
| G35 | One monolithic profile | A moved phone, a fan, a new route or a re-tuned piano all invalidate the same profile, and recovery is a full recalibration | High | 3, 11 |
| G36 | Online refinement covers f0 and B only | Templates, decay, release, noise states and the evidence scale never learn from play | Medium | 10.1 |
| G37 | Coarse recalibration triggers | 30 cents of drift or +10 dB of noise; nothing targets a single layer | Medium | 10.2 |
| G38 | Calibration audio kept only for the neural model | An engine update that changes an estimator forces a new calibration, though the stored audio could simply be re-analysed | Low | 11 |

## 3. Architecture: four layers with their own lifetimes

Calibration splits into four layers that live for different lengths of time, so a fan, a moved phone or a new route each costs only its own refresh instead of a full recalibration (G35).

&#91;embedded content: calibration architecture · 4 layers, the evidence engine, the health monitor\]

Each layer feeds the evidence engine through a fixed interface, and the health monitor sends each kind of drift back to the one layer it belongs to.

Four principles run through every section that follows:

1. **Interpolate only what is smooth; measure what is rough.** B, stretch, decay laws and timbre's change with dynamics are smooth across keys; room ripple and each key's own mistuning are not, so they are measured key by key.
2. **Uncertainty travels with every number.** Every estimate reaches the engine as a distribution, and validation checks that its stated coverage is true.
3. **The noise is part of the model.** Its gains, spread and tones are parameters of the fit, profiled out of each key's evidence rather than subtracted as a constant.
4. **Thresholds are checked where they are used.** The false-alarm exponent is measured in the user's room, at calibration and in every session.

## 4. Noise layer: a statistical model of the room

The noise layer replaces one mean spectrum with a model of how the room's noise behaves: its level, its spread, its tones, its common modulation and the states it switches between. The change that matters most for fans is to make the noise's gain a parameter of the joint fit, profiled out of every key's evidence, instead of a constant.

### 4.1 What the silence measures

- **Mean power** ν\_b per bin and tier, as now. From 3 s it is good to 0.25 / 0.36 / 0.51 dB per bin in the 1024 / 2048 / 4096 tiers; from 1.5 s, 0.36 / 0.51 / 0.72 dB.
- **Common band gain** g\_r(t): each noise component's gain frame by frame, fitted on all its bins. Its spread in dB and its modulation spectrum describe fan blade-pass, compressor cycling and swells.
- **Dispersion** D\_b = var(P) ÷ E\[P\]² per 9-bin band, after the common gain is divided out. Steady diffuse noise gives 1, modulated or impulsive noise more than 1, a steady tone less than 1. From 3 s it is good to ±0.05 / 0.08 / 0.11; from 1.5 s, ±0.08 / 0.11 / 0.15.
- **Tonal lines**: peaks with D below 0.5 that persist in at least 90% of frames at a stable frequency. Lines are grouped into harmonic families by a common fundamental (mains, a motor's rotation) and stored with frequency, level and spread.
- **Class**: steady, modulated, impulsive or wind (4.7), from the dispersion of the low band and the gain series.
- **Exclusions**: frames that the harmonic-source alternative (master 9.4) explains as gliding speech or TV are dropped. If more than half are dropped, the step asks for quiet rather than learning the voice as noise (G7).
- **Free extra noise**: the 300 ms before every strike, and bins far from any partial during holds, join the statistics at no cost in time.

| Noise | Dispersion of one bin, before the common gain is divided out |
| --- | --- |
| Steady diffuse noise | 1 |
| Band gain wobbling ±1 dB (log-normal) between frames | 1.11 |
| Sinusoidal modulation, 3.7 dB peak to trough | 1.16 |
| Steady tone 10 dB over the diffuse floor in its bin | 0.17 |
| Steady tone 20 dB over the floor | 0.02 |

Dividing out the common gain returns the two modulation rows to 1, because g\_r has taken them, while the tone rows stay below 1 and move to the line catalogue (4.3).

A slow sweep, such as an oscillating fan's 10–20 s cycle, needs two periods to measure; the silence step cannot wait that long, so the online tracker (4.5) and the noise states (4.4) learn it.

### 4.2 Noise as part of the model, profiled out of the evidence

In master v1.5 the noise term ν\_b is fixed. When a whole band is louder in one frame, every key whose template covers that band gains evidence at once, so the error does not average away across a key's bins; it adds up across them.

```latex
\operatorname{var}_0(z) = 1 + v + v\,n_{\mathrm{eff}}, \qquad n_{\mathrm{eff}} = \frac{\left(\sum_b t_b\right)^2}{\sum_b t_b^2}, \qquad \theta^* \approx \frac{1}{1 + v\,(1 + n_{\mathrm{eff}})}
```

Here z is a key's normalised evidence under noise alone, v the variance of the band gain between frames and t\_b the key's per-bin weights; real templates have n\_eff of 10–20. The false-alarm exponent θ\* falls with v, and 16.1 nats then behaves like 16.1 × θ\* (section 5):

| Band wobble between frames | Key with 8 partials (n\_eff 9.7) | 16 partials (14.4) | 30 partials (19.8) |
| --- | --- | --- | --- |
| 0.5 dB | θ\* 0.86: 10 × the false-note budget | 0.84: 13 × | 0.79: 30 × |
| 1 dB | 0.64: 331 × | 0.54: 1,718 × | 0.48: 4,698 × |
| 2 dB | 0.29: 97,000 × | 0.21: 332,000 × | 0.18: 588,000 × |

These are lower bounds: a modulation slower than a hop also correlates successive increments, which inflates them further.

**The fix.** Each tier's noise is a sum of R components with shapes N\_r(b), learned from the silence by Itakura–Saito factorisation, and gains g\_r(t) that are free in every hop under a log-normal prior from 4.1. The leave-one-out refit of master 9.3 re-optimises the gains with and without key k, so a key's evidence is a likelihood ratio with the noise gains profiled out:

```latex
\mu_b(t) = \sum_k a_k\,T_k(b) + \sum_{r=1}^{R} g_r(t)\,N_r(b) + \sum_l \hat L_l(b,t), \qquad \Lambda_J(k) = \min_{a,\,g}\, Q\!\left(\mu^{(-k)}\right) - \min_{a,\,g}\, Q(\mu), \qquad Q(\mu) = \sum_b \frac{d_{IS}(Y_b \mid \mu_b)}{D_{b}} + \sum_r \frac{(\ln g_r - \ln \bar g_r)^2}{2\sigma_r^2}
```

With the gain profiled, the null variance returns to 1 whatever the modulation: 0.97–1.03 in every cell of the table above (bench 3). The price is the part of a key's template that looks like a noise component, a share of about n\_eff ÷ B\_r of its evidence (2–4% at B\_r = 512 bins). So each component spans at least 10 × n\_eff bins, holding the price under 10%: at most 2 components in the 1024 tier, 4 in the 2048 and 8 in the 4096. Factorisation groups bins that rise and fall together, which is exactly the structure the gains must absorb; modulation that differs inside a component stays as residual dispersion, which the weights below handle.

```latex
z' = \frac{\sum_b t_b\left(\dfrac{Y_b}{\hat g\,\nu_b} - 1\right)}{\sqrt{\sum_b t_b^2 - \left(\sum_b t_b\right)^2 / B_r}}, \qquad \operatorname{var}_0(z') = 1, \qquad \text{evidence lost} \approx \frac{n_{\mathrm{eff}}}{B_r}
```

The gains come from the bins outside every candidate's support, one pass per hop of about 7,700 multiply-adds, well under the FFTs' cost; the refit adds R scalars per key.

**Dispersion weights.** What the common gain leaves, any bin-by-bin excess or deficit of spread, is handled by quasi-likelihood (Wedderburn 1974): each bin's Itakura–Saito term is divided by its effective dispersion, which mixes the noise's measured spread with the predicted partial's.

```latex
D_b = \frac{D_\nu\,\nu_b^2 + 2\,s_b\,\nu_b + D_s\,s_b^2}{(\nu_b + s_b)^2}, \qquad D_s = 1 + 2\left(e^{(\sigma_T \ln 10/10)^2} - 1\right)
```

s\_b is the predicted partial power in the bin and σ\_T its template error in dB (7.2). With steady noise (D\_ν = 1) and exact random-phase partials (D\_s = 1), D\_b = 1 and the master's fit is the special case; bins made noisier by wind or a rattle, or dominated by an uncertain template, count for less.

### 4.3 Tonal lines: catalogue, track, remove

Steady lines land on piano partials. On 50 Hz mains, harmonics 7, 14 and 28 sit 3.8 cents above F4, F5 and F6, harmonics 21 and 42 sit 5.8 cents above C6 and C7, 25 is 7.6 cents above D♯6 and 35 is 9.9 cents below A6. On 60 Hz, 660 and 1,320 Hz sit 2.0 cents above E5 and E6, 780 and 1,560 Hz 8.8 cents below G5 and G6. One 350 Hz line also lies within 15 cents of partials of eight keys: F4's fundamental, F3's 2nd, A♯2's 3rd, F2's 4th, A♯1's 6th, F1's 8th, D♯1's 9th and C♯1's 10th.

- **Version 1, bounded atoms (always on).** Each catalogued line enters the joint model as a predicted component at its tracked frequency, its amplitude bounded to three standard deviations of its measured spread, exactly like a backing note (master 11.3). It explains its own energy, is never searched and so never charged an Occam factor, and any excess on its bins counts as piano. Partials within 2 bins of a line are flagged as shared in the phase vocoder (master 7.3).
- **Version 2, coherent removal (where Phase 0 shows a line costing detection).** A lock-in tracker estimates each line's complex amplitude over T = 1 s and subtracts the rebuilt tone from the input before the tiers. What is left of the line sits N ÷ (1.5 f\_s T) below the bin's diffuse noise: 18.5, 15.5, 12.4 and 9.4 dB below it for N = 1024, 2048, 4096 and 8192 (simulated: 15.1 dB at 2048). A line 20 dB above the floor thus hands back up to 20 dB of SNR on F4's fundamental.
- **Freeze.** When a predicted partial (sounding, candidate or expected) lies within three lock-in bandwidths of a line, its tracker stops adapting, as the echo canceller does in double talk, and extrapolates the line at its tracked frequency. A line 20 dB above the noise in 1 Hz, tracked for 1 s, is known to 0.039 Hz; frozen for 0.25, 0.5 and 1 s, the phase error leaves the line 24, 18 and 12 dB down.
- **Families.** All lines of a family share one fundamental, f\_l = n\_l f\_family, so lines away from any partial keep tracking the grid's slow drift while a covered line is frozen.

```latex
\frac{P_{\text{left}}}{P_{\text{diffuse, bin}}} = \frac{N}{1.5\,f_s\,T}, \qquad \sigma_\phi(T_f) = 2\pi\,\sigma_f\,T_f, \qquad \frac{P_{\text{left, frozen}}}{P_{\text{line}}} \approx \sigma_\phi^2
```

### 4.4 Noise states, recognised in one hop

- Each room keeps up to 4 noise states (fan off, fan on, air conditioner and so on), each with the full model of 4.1. A new state is created when the noise-only residual stays outside every stored state, and it is saved with the profile.
- Each hop scores the noise-only bins under every stored state, and a sticky hidden Markov model over the states stops flicker. A switch swaps ν, the components and the lines at the next hop boundary through the existing double buffer.
- One hop carries a great deal of evidence, because hundreds of bins vote. Over 300–3,000 Hz a 1 dB change gives 0.4 nats per hop in every tier, 3 dB gives 4.7 and 6 dB gives 25. A 3 dB change is recognised in about 2 hops (11 ms) and a 1 dB change in about 120 ms, against about 10 s for minimum statistics (G5).

```latex
\ell_s(t) = -\sum_{b \in \text{noise-only}} \left[\frac{Y_b(t)}{N_s(b)} + \ln N_s(b)\right], \qquad \mathrm{KL}\ \text{per bin} = r - 1 - \ln r, \quad r = \frac{N_{\text{new}}(b)}{N_{\text{old}}(b)}
```

### 4.5 Online tracking from the model's own residual

Minimum statistics and its 2-bin gate are replaced by the expected noise power given the joint fit, the minimum-mean-square-error form of Gerkmann and Hendriks (2012) with the fit supplying what a speech-presence detector supplies there. A noise-only bin updates with what it sees; a partial-dominated bin keeps its estimate; nothing needs bias compensation.

```latex
\mathbb{E}\!\left[|N_b|^2 \mid X_b\right] = \left(\frac{\nu_b}{\mu_b}\right)^{2} |X_b|^2 + \nu_b\left(1 - \frac{\nu_b}{\mu_b}\right), \qquad \hat\nu_b(t) = \alpha\,\hat\nu_b(t-1) + (1 - \alpha)\,\mathbb{E}\!\left[|N_b|^2 \mid X_b\right]
```

- α follows the noise class: a 2 s time constant for steady noise, 0.5 s for modulated noise. The common gains (4.2) take the fast part, so the tracker only follows slow changes of shape.
- Energy that stays above the model in a partial-shaped pattern, such as sympathetic ringing or a backing residue, is held out as unexplained and logged instead of being learned as noise (G10).

### 4.6 Session-start check

Every microphone screen begins with 1.5 s of listening, during its intro or the count-in. It recognises the noise state (or saves a new one), refreshes ν, measures θ\* per tier (5.2) and checks for wind. Each session therefore starts from today's room, not the calibration day's (G6).

### 4.7 Wind on the microphone

A fan blowing on the phone produces turbulence at the microphone port, not sound in the room: low-frequency energy below a few hundred hertz with very high dispersion, sudden gain jumps, a slope far steeper than room noise and sometimes flat-topped samples (master 6.5).

- At calibration the app says so plainly: air is blowing on the phone; turn it out of the airflow or move it. That fix costs nothing and beats any algorithm.
- While playing, the dispersion weights (4.2) down-weight the gusty bins automatically, and the status "wind on microphone" shows as a notice.
- On phones that expose two built-in microphones, wind is incoherent between them while sound is coherent; section 8 keeps this as an optional spike.

## 5. Null calibration: thresholds that hold in the user's room

Every threshold in the master assumes that evidence behaves under noise as it did in the lab. Calibration now measures that assumption in the user's own room, per tier, and corrects what the noise model of section 4 leaves over. The quantity is the false-alarm exponent θ\*, of which the master's τ correction is the Gaussian special case.

### 5.1 The exponent θ\*

For a CUSUM the false-alarm rate falls as e^(−θ\* h), where θ\* is the positive root of the null cumulant generating function of its increments (Siegmund 1985). True log-likelihood ratios have θ\* = 1, which is why h = ln(K × 675,000 ÷ R\_FA) works. For Gaussian increments θ\* = 2|μ₀| ÷ σ²\_LR, and dividing by τ (master 2.4) is exactly what keeps that ratio at 1 when overlapping frames inflate the long-run variance.

```latex
\theta^* > 0:\ \lim_{n \to \infty} \frac{1}{n} \ln \mathbb{E}_0\!\left[e^{\theta^* \sum_{t=1}^{n} \lambda_t}\right] = 0, \qquad R_{FA} \propto e^{-\theta^* h}, \qquad \text{Gaussian increments: } \theta^* = \frac{2\,|\mu_0|}{\sigma_{LR}^2}
```

Fan modulation, bursts and mis-scaled click evidence push θ\* below 1. The master's ±1-nat trim cannot follow them:

| θ\* in the room | Threshold that restores 6 false notes per hour | False-note rate after the +1-nat trim |
| --- | --- | --- |
| 0.9 | 17.9 nats | 2 × the budget |
| 0.7 | 23.0 nats | 62 × |
| 0.5 | 32.2 nats | 1,908 × |

The order of repair matters. First the model is fixed (profiled gains, tonal lines and dispersion weights, section 4), which brings θ\* back towards 1 without slowing a single note. Only what remains is measured and corrected.

### 5.2 Measuring θ\* at calibration and at every session start

- After the profile is built, calibration replays the evidence pipeline over the stored silence; the templates are needed, so this happens at the end, in well under a second of compute. Each session check (4.6) repeats it on its own 1.5 s.
- Per tier, the mean and the batch-means long-run variance of the τ-divided null increments give θ̂\* = 2|μ̂₀| ÷ σ̂²\_LR.
- The correction rescales that tier's evidence to a true log-likelihood ratio, λ ← θ̂\* λ, shrunk towards 1 by the estimate's own precision. Rescaling the evidence rather than raising h keeps lesson priors at their designed weight, because the posterior is prior log-odds plus true evidence.

| Null in the tier (one tier, 40 keys) | True θ\* | Moments, 3 s | Moments, 1.5 s | CGF root, 3 s |
| --- | --- | --- | --- | --- |
| Gaussian, calibrated | 1.00 | 1.04 ± 0.08 | 1.04 ± 0.11 | 1.27 ± 0.31 |
| Gaussian, fan-like | 0.50 | 0.52 ± 0.04 | 0.53 ± 0.06 | 0.56 ± 0.08 |
| Rare bursts on a calibrated base | 0.36 | 0.56 ± 0.05 | 0.56 ± 0.08 | 0.42 ± 0.08 |

Moments measure a Gaussian-like null well from 1.5 s. Bursts fool them, and the root of the empirical cumulant generating function, which sees tails, is too noisy on a few seconds. So bursts are removed in the model, where the transient alternatives (master 9.4) absorb them, and watched while playing (5.4), not estimated from the silence.

### 5.3 Per-room evidence recalibration (optional, guarded)

- Like the neural model's Level C (master 14.8), each register gets a scale and an offset on its logistic evidence, Λ′ = a\_r Λ + c\_r: 16 numbers for 8 registers.
- They are fitted by penalised logistic regression on the calibration's labelled data. Positives are the struck key at each strike's onset hops; negatives are every key during silence and every key not struck during each strike, octave and twelfth partners included.
- A Gaussian prior centres both on the lab values, with its width chosen by leaving one anchor out, and the fit is kept only if held-out anchors improve.
- The click term gets its own room scale, because a fan's broadband noise changes the click detector's null more than any other term's (G8).

### 5.4 Watching it while playing

During quiet stretches, when no key is above IDLE, each tier runs shadow CUSUMs at a lowered threshold and counts their crossings. The calibrated model predicts that count from θ̂\* and μ̂₀, and a Poisson test on the excess tightens that tier's evidence scale before real false notes pile up. This is master 13.2's per-register check, run live in the user's room.

## 6. Instrument layer: the piano with honest uncertainty

The master's estimators stay (long windows, many partials, weighted robust fits); what changes is what they hand the engine. Each key gets a full posterior instead of a point and a standard error, with its own mistuning, the correlation across its partials, its unison doublets, its attack glide, a decay per partial and its phantom partials.

### 6.1 Keyboard model with each key's own scatter

```latex
\ln B_k = \beta_0 + \beta_1 (k - k_b)_- + \beta_2 (k - k_b)_+ + u_k, \qquad c_k = c_g + s(k;\,B,\rho) + e_k, \qquad u_k \sim \mathcal N(0, \sigma_u^2),\quad e_k \sim \mathcal N(0, \sigma_e^2)
```

- **Stretch from the tuner's octaves.** s(k; B, ρ) replaces the free cubic (G23): each octave is taken as set beatless on the partial pair 2ρ : ρ, so the curve follows from B, after Rigaud, David and Daudet (2013). The octave type ρ varies smoothly by register, and a small smooth residual absorbs what the rule misses; the ends no longer swing.

```latex
\frac{f_0(k+12)}{f_0(k)} = 2\,\sqrt{\frac{1 + 4\rho^2 B_k}{1 + \rho^2 B_{k+12}}}
```

- **Each key's own scatter** e\_k is the part no curve can predict: strings drift independently. σ\_e is estimated from the anchors' residuals about the curve, pooled with a population prior from the Phase 0 pianos; σ\_u likewise for B.
- **Prediction, not confidence.** An interpolated key carries the curve's uncertainty plus its own scatter, with Student-t tails for the uncertainty in σ\_e itself. The candidate tolerance of master 9.1 becomes this window.

```latex
\text{window}_k = t_{\nu,\,0.99865}\,\sqrt{\sigma^2_{\text{curve}}(k) + \hat\sigma_e^2} + \sigma_{\text{est}}
```

| Each key's scatter | Curve's standard error × 3 (a reading of master 8.8) | Prediction × 3 | Prediction × t, 5 dof | Prediction, population prior × t, 15 dof |
| --- | --- | --- | --- | --- |
| 1 cent | 10.2% of non-anchor keys outside their window | 1.70% | 0.14% | 0.03% |
| 3 cents | 14.2% | 2.58% | 0.24% | 0.05% |
| 8 cents | 15.3% | 2.74% | 0.20% | 0.06% |

The first column stays at 10–15% even on a well-tuned piano: that window is built from the same scatter it leaves out, so it narrows exactly as fast as the keys' own offsets do. A key outside its window is never a candidate in free play and so never refined online (G16).

- **Decision rule.** If σ̂\_e exceeds 3 cents, the planner proposes the chromatic scan (9.3): no number of anchors reduces a key's own scatter, but one 0.4 s note measures it.

### 6.2 Frequency evidence with correlated residuals

Calibration now delivers, for every key, the posterior of θ\_k = (c\_k, B\_k) as a mean and a 2 × 2 covariance Σ\_θ. The frequency evidence of master 9.2 marginalises it, so a common offset of all partials costs little while a pattern no (c, B) can produce costs a lot:

```latex
r = \hat f - f(\hat\theta_k), \qquad \Sigma_r = D + J\,\Sigma_{\theta}\,J^{\top}, \qquad J_h = \left[\frac{\ln 2}{1200}\,f_{k,h},\ \ \frac{f_0\,h^3}{2\sqrt{1 + B_k h^2}}\right], \qquad \ell_f(k) = -\tfrac12\, r^{\top}\Sigma_r^{-1} r - \tfrac12 \ln\lvert\Sigma_r\rvert
```

- D is diagonal: each partial's Cramér–Rao variance plus its expected jitter from beating (6.3). By the Woodbury identity the inverse costs one 2 × 2 solve per key per hop.
- A key 8 cents sharp on a piano with 5 cents of scatter pays 22.6 nats when its 8 partials are scored as independent, and 0.89 nats marginalised. Its neighbour, 92 cents away, still pays 118 nats, so neighbour separation is untouched (bench 7).
- The same matrices give online refinement (master 8.12) in closed form: after a confident note the posterior is the Kalman update with gain Σ\_θ Jᵀ Σ\_r⁻¹.

### 6.3 Unisons, doublets and attack glide

Calibration has no latency budget, so the 1.5 s hold is analysed per partial with a matrix pencil (Hua and Sarkar 1990) on the heterodyned, decimated band. Each partial is fitted as one, two or three damped exponentials, the order chosen by minimum description length and checked against the FFT fit.

- **What it resolves.** Two strings 0.6 Hz apart (2 cents at C5), decaying at 2 and 6 dB/s, sit inside one Hann peak (resolution 1.33 Hz on 1.5 s). The pencil measures their spacing as 0.600 ± 0.007 Hz at 25 dB baseband SNR and 0.601 ± 0.022 Hz at 15 dB, and their decays as 2.0 ± 0.2 and 6.0 ± 0.3 dB/s (bench 9).
- **What it feeds.** Per anchor partial: string spacing (the beat rate), both decay rates (the double decay) and their amplitude ratio, interpolated across keys like B. Beating gives each partial an expected phase-vocoder jitter σ\_jit,h, added to D in 6.2, so a beat minimum never looks like a wrong key. The same spacings set the release predictor's beat model (σ\_L) and the own-note beating null of the harmonic-interval test (master 9.5).
- **Unisons out of tune.** A spacing above about 3 cents on several anchors (a starting value, checked in Phase 0) raises "unisons need tuning" and widens those keys' partial kernels in the joint model (G25).
- **Attack glide.** The loud strike's attack window (30–80 ms) is compared with its sustain (300–600 ms), partial by partial. The offset is stored as a coefficient on the square of the attack's amplitude, since tension modulation grows with it, and applied to expected partial frequencies in a note's first 100 ms (G19). Digital keyboards measure zero, as they should.

### 6.4 Dynamics, phantom partials and longitudinal modes

- **Dynamics in measured intensity.** Per anchor partial, the log level is fitted as linear in the strike's measured intensity u, not in the requested label: ln P\_h(u) = a\_h + b\_h u. Upper partials rise faster, which is the brightening, and the line extrapolates sensibly to ppp and fff (G22).
- **Ratios travel, shapes do not.** The ratio P\_h(u) ÷ P\_h(u\_mf) is smooth from key to key, so anchors carry it, while each key's own shape at mf comes from the scan (7.2).
- **Extra lines.** In loud bass strikes, peaks off the stiff-string series are catalogued: phantom partials near sums f\_m + f\_n (Conklin 1999) and longitudinal modes at fixed frequencies (Bank and Sujbert 2005). Both are driven by the square of the transverse motion, so they rise about 2 dB per dB of note level. Each enters its key's template with that law, so a loud bass note's phantoms are explained at every dynamic instead of becoming evidence for the keys whose partials they hit (G20).

### 6.5 A decay rate per partial

The two-slope envelope stays, and each partial adds its own rate from the string's frequency-dependent loss (Bensa et al. 2003), fitted across all partials of the hold and interpolated across keys:

```latex
\alpha_{k,h} = b_1(k) + b_3(k)\,f_{k,h}^{2} \quad \text{(dB/s)}
```

Tail templates then darken as they ring, the rise-above-decay clue of master 7.5 is computed per partial, and evicted voices (master 10.5) and backing tails use the same law (G21).

### 6.6 Digital keyboards

- **Zones.** Template shape and B jump together at sample-zone boundaries. With the scan every key is measured, so zones need no model; without it, a jump in either marks a boundary, located by probabilistic bisection (Waeber, Frazier and Henderson 2013), which tolerates a noisy comparison where plain bisection does not.
- **Effects.** Reverb shows in the post-release slope, as now. Chorus shows as a slow periodic modulation of every partial's frequency and level during the hold, and raises σ\_jit. Panel sustain shows as release steps near zero on every key, and switches note-length grading off with a message.
- **Changes after calibration.** A volume change is session gain; a change of spectral tilt, as on keyboards whose tone control follows volume, is the tilt term (7.4); a voice change is piano mismatch (master 10.7); touch response off is caught as now, when soft and loud land within 2 dB.

## 7. Placement layer: templates as the phone hears them

Templates must be measured key by key where the phone sits, because the room gives every partial its own gain and that gain changes completely from one key to the next. The chromatic scan does this in 12–44 s; anchors keep the job they can do, carrying how timbre changes with dynamics.

### 7.1 Room ripple, and why anchors cannot carry it

- **The ripple.** Above the Schroeder frequency a room's transfer function at one point fluctuates at random across frequency, with a correlation bandwidth of about 2.2 ÷ RT60 (Schroeder 1962): 4.4 Hz at RT60 = 0.5 s. With a direct path at ratio K to the reverberant field, a partial's gain follows a Rician law, and its level spreads by 5.5, 5.1, 3.7 and 2.0 dB at direct-to-reverberant ratios of −5, 0, +5 and +10 dB.
- **Neighbours do not share it.** Partial 8 of C2 lies 31 Hz from C♯2's partial 8, and partial 4 of C4 lies 62 Hz from C♯4's: many correlation bandwidths apart. Only the lowest partials of the deep bass share the room's gain with a neighbour; A0's fundamental is 1.6 Hz from A♯0's.
- **So interpolation fails, and more anchors do not help.** Templates interpolated between anchors err by 6.4 dB per partial at 0 dB ratio with 7 anchors and 6.1 dB with 16, against 0.31 dB for the same interpolation without a room (bench 6). The two-octave bench found that 3 dB template errors already cost 4–6 points of pp detection and added 6–12 points of false notes.

&#91;embedded content: calibration\_calcs.py, bench 6 · 4 ratios × 2 anchor sets, 20 simulated rooms each\]

Doubling the anchors moves the error by a few tenths of a decibel; only a phone close enough for +10 dB brings it near 2.4 dB, still above what measuring each key gives.

### 7.2 Templates from the scan, with their uncertainty

- Each scanned key gives an attack template (30–80 ms) and an early-sustain template (100–450 ms) at mf, the room's ripple included. The previous key's ring, already measured, enters the fit as a bounded tail.
- Each partial carries a template variance σ²\_T,h: for a scanned key, the strike's own SNR plus strike-to-strike repeatability measured on the anchors' repeated strikes; for an unscanned key, the interpolation error above. The joint model then knows how far to trust each template.
- That variance enters the quasi-likelihood weights of 4.2 through D\_s. At σ\_T = 1.5 dB a partial-dominated bin keeps weight 0.80; at 6 dB, the anchors-only case at 0 dB ratio, it keeps 0.08. A loud note's uncertain partials stop lending evidence to its octave partners and neighbours (G28).
- Upgrade path, if Phase 0 shows the weights are not enough: the 8 strongest partials of each sounding key get free gains with a log-normal prior of width σ\_T, solved inside the joint fit.
- Unscanned keys converge online: each confident isolated note updates its key's template with a gain set by σ\_T (10.1).

### 7.3 Release per partial

The direct-to-reverberant ratio changes with frequency, so a damper's step is larger on some partials than others. From the anchors' releases, calibration stores each partial's step S\_h, its post-release slope and its own prediction-error spread σ\_L,h; the release evidence of master 9.6 then combines partials with matched weights:

```latex
\lambda^{\mathrm{off}}_t = -\sum_h \frac{S_h}{\sigma_{L,h}^2}\left(\tilde r_{h,t} + \frac{S_h}{2}\right), \qquad I_{\mathrm{off}} = \sum_h \frac{S_h^2}{\sigma_{L,h}^2}
```

r̃\_h,t is partial h's level residual after its beat predictor. Information adds across partials, so a key whose fundamental sits in a reverberant band but whose upper partials step clearly becomes release-observable (G14). Observability is judged on I\_off and re-judged with session gain, as master 10.4 does now.

### 7.4 Session gain, tilt and a moved phone

Each confident isolated note's log residual against its template is split into a broadband gain, a tilt and a remainder, by weighted least squares with weights 1 ÷ σ²\_T,h:

```latex
\ln P^{\mathrm{obs}}_h - \ln P^{\mathrm{pred}}_h = G + T \log_2\!\frac{f_h}{1\ \mathrm{kHz}} + e_h
```

- G feeds session gain, as now (master 10.4).
- T flags a covered microphone, a case or a closed lid once it leaves its own noise band (re-audit N16).
- e\_h correlated across keys at nearby frequencies means the room's ripple has changed, which means the phone has moved: the health monitor asks for a re-scan (10.2) instead of letting templates decay silently (G13).

## 8. Route layer: checks on the phone itself

Five checks run on audio that calibration already records, and a sixth is an optional spike; each turns a silent device problem into a measured flag.

| Check | How it is measured | When it fails |
| --- | --- | --- |
| Wide sweep (re-audit D6) | The chirp sweeps 50 Hz–16 kHz instead of 1–8 kHz; per route it stores the response at both ends and the SNR of the bass and of the 3–12 kHz click band | Click evidence is scaled by the click band's measured SNR, and that device's re-strike and latency ceilings are restated |
| Automatic gain | Noise level in 0.3 s windows before and after the loudest strike: over 200–4,000 Hz such a window reads to ±0.12 dB, so a 1 dB pump stands 8σ clear. Soft and loud strikes of one key must also decay alike, since gain recovery flattens loud decays | The next input source is tried; otherwise levels and decays are marked unreliable and the student is told |
| Noise suppression | In steady noise 9.5% of bin-frames fall below 0.1 × the local mean and 5.0% above 3 ×; 1.5 s measures these shares to ±0.38% and ±0.28%. Spectral gating piles bins near zero, and a converging suppressor shows a falling floor across the silence | As for automatic gain |
| Sample rate | A digital keyboard's offsets must sit near whole semitones; a cluster near ±147 cents (48 against 44.1 kHz) flags a mislabelled rate, and the chirp's length on the input timeline cross-checks output against input | The stream is reopened at the rate actually delivered |
| Headroom | Peak level and the flat-top detector of master 6.5 on the loudest strike; the margin to the capsule's estimated overload must leave 6 dB for fff | "Move the phone a little further away" before calibration continues |
| Two microphones (optional spike) | Where the platform exposes two built-in microphones, their coherence separates wind and diffuse noise, which are incoherent, from the piano's direct sound, which is coherent at low frequency | Kept only if the spike shows a gain; the mono path is complete without it |

## 9. Protocol: adaptive, still about a minute

Quick calibration stays at about a minute, and a standard mode adds a chromatic scan of 30–44 s that removes interpolation from frequencies and templates altogether. Every step now has an acceptance test, and a planner adds strikes only where measured precision falls short.

### 9.1 Modes and times

| Mode | Acoustic, 88 keys | PSR-E343, 61 keys | What it adds | When |
| --- | --- | --- | --- | --- |
| Session check | 1.5 s | 1.5 s | Noise state, θ\* per tier, wind (4.6) | Every microphone screen |
| Quick | 60.5 s | 77.5 s | Master 8.1's steps with 1.5 s of silence; every new check runs on the same audio | First run on a piano |
| Standard | 104.5 s | 90.5 s | Chromatic scan at mf; the digital protocol drops its 7 medium anchor strikes, which the scan covers | Once per placement (recommended) |
| Focus scan | 12 s per dynamic | 12 s per dynamic | The lesson window's 24 keys at mf and p, replacing the two-octave audit's 48 window strikes | Before lessons with a focus range |
| Full | 235 s | 208 s | 16 anchors, scans at mf and p, the 17 octave and twelfth pairs of the focus window | Once per piano (optional) |

Times start from master 8.1's totals (quick 62 and 79 s, full 106 and 146 s) at 2.5 s per strike, with scans at 2 notes per second.

### 9.2 The planner and its stop rules

- **Targets.** Every quantity carries a posterior, and the planner holds a target for each: every key's partial 8 predicted within 3 cents at 95%; templates within 2 dB for keys in the lesson window; decay and release measured on at least 3 anchors per register; noise statistics at their stated precision.
- **Next strike.** After each step it picks the strike that most reduces the largest shortfall. Under the Gaussian keyboard model of 6.1 the expected reduction needs no data, so the choice for each noise level is precomputed.
- **Stop.** The run stops when every target is met, or at a step limit, giving "pass with a warning" that names the shortfall.
- **What it changes in practice.** A noisy room gets a louder strike or an extra one where SNR failed; a piano with more than 3 cents of key scatter is offered the scan; a bass break gets probabilistic bisection; a quiet room on a tuned piano stops at the quick set.
- **Where anchors go.** Chebyshev nodes suit polynomial fits. Under the smooth model of 6.1, with both ends already measured by the range strikes, near-uniform interior anchors predict 8–15% better (bench 13), so the default sets move to near-uniform:

| Smoothness (length scale) | Chebyshev anchors | Greedy design | Near-uniform anchors |
| --- | --- | --- | --- |
| 12 keys | 0.99 cents | 0.87 cents | 0.84 cents |
| 20 keys | 0.76 | 0.69 | 0.69 |
| 30 keys | 0.65 | 0.61 | 0.60 |

Values are the mean predictive spread of the smooth curve over 88 keys, 7 interior anchors plus both ends. The differences are small; the planner earns its place through the stop rule, not the placement.

### 9.3 The chromatic scan

- **What the student does.** The app lights each key in turn, low to high, at about 2 notes per second, mf, one finger allowed, legato or detached.
- **How it is read.** Notes are segmented by onset and identified by order plus the frequency check: a wrong key is caught by its partials and the app waits. A missed key is asked again at the end.
- **What one 0.4 s note measures.** At A4 its frequency is good to 0.004–0.04 cents at 20–0 dB per-sample SNR, and its partials give f0 to 0.005 cents or better and B to 0.03% of its value or better (bench 8). That is far below any systematic limit, so each key's own tuning, B and template are measured rather than predicted.
- **Output.** Per key: the (c, B) posterior with no interpolation, attack and early-sustain templates with the room's ripple, mf level and click level (the voicing curve), and zone boundaries on digital keyboards.

### 9.4 An acceptance test for every step

| Step | Accepted when | Otherwise |
| --- | --- | --- |
| Silence | No transient; speech or TV in under half the frames; statistics at their precision; no wind | Extended up to 6 s, then the app asks for quiet and names the source: wind, speech, a fan just switched on |
| Range strikes | The implied key count lies between 25 and 88 and the student confirms it (re-audit D10) | The count is asked directly |
| Every strike | The right key within 35 cents (as now); one onset only, no second click within 300 ms; at least 3 partials at 10 dB SNR or more (1 in the top octave); no clipping or flat tops; fit residuals consistent (χ² per degree of freedom under 2) | Repeated, with the reason on screen: "play once", "a little louder", "too loud for the microphone" |
| Holds | Held at least 1 s; a release step present on damped keys | "Hold until the light goes out". Near-zero steps on several damped anchors ask "Is the sustain pedal down?" (G26) |
| Loudness pair | Soft and loud at least 6 dB apart on an acoustic piano | Asked again; on a digital keyboard within 2 dB means touch response is off, as now |
| Scan | Every key once, each passing the frequency check | Missed keys asked again at the end |
| Chirp | As master 6.6, swept 50 Hz–16 kHz (8) | As now |

### 9.5 Validation that measures itself

- **Leave one anchor out.** Each anchor is predicted from the others. The normalised residuals z = (measured − predicted) ÷ σ\_pred should be standard normal; when the mean of z² exceeds its χ² bound, every predictive spread is inflated by it, so reported uncertainties have the coverage they claim.
- **Coverage.** The report states the share of held-out partial frequencies and template levels inside their 90% intervals, against a target of 87–93%.
- **Live check.** The 5-key check stays as the end-to-end test of the whole path.
- **Report.** It adds the noise class and states, the tonal lines found, θ̂\* per tier, the detectability map (9.6), and which keys are graded at which dynamics.

### 9.6 The detectability map

For every key and dynamic, calibration predicts the evidence per hop, its fall with the key's decay, and the time to each threshold:

```latex
D_k(u,t) = \frac{1}{\tau_k}\sum_b \frac{s_b - \ln(1 + s_b)}{D_b}, \qquad s_b = \frac{T_k(b;u)\,10^{-\lambda_1 t/10}}{\nu_b}, \qquad t_{\mathrm{det}}:\ \sum_{t' \le t} D_k(u,t') = h_k
```

| Room | Dynamic | Evidence in the first hop | Free play (16.1 nats) | Expected note (9.3 nats) | Waiting, no attack cue (13.4 nats) |
| --- | --- | --- | --- | --- | --- |
| Quiet | mf | 403 nats | 5 ms | 5 ms | 5 ms |
| Quiet | p | 34 nats | 5 ms | 5 ms | 5 ms |
| Quiet | pp | 3.7 nats | 27 ms | 16 ms | 21 ms |
| Fan, +15 dB in band | mf | 8.9 nats | 11 ms | 11 ms | 11 ms |
| Fan, +15 dB in band | p | 0.36 nats | 405 ms | 176 ms | 293 ms |
| Fan, +15 dB in band | pp | 0.01 nats | Missed | Missed | Missed |

A C4-like key in the middle tier, its partials 28 dB down to −1 dB over the noise at mf, decaying 8 dB/s; the hammer click, which speeds struck notes, is left out; missed means not within 2 s (bench 10).

- **Coaching.** The map names the keys and dynamics the room loses and what would recover them: the phone closer (+6 dB for half the distance, inside the critical distance), the fan slower or off.
- **Grading.** A dynamic below a key's detectable floor is not graded on that key.
- **Lessons.** An expected note predicted to take longer than its window is graded unclear, never missed.

## 10. Keeping calibration true while playing

Every layer now learns from confident notes and silent stretches, not only f0 and B, and a health monitor turns each kind of drift into the smallest recalibration that fixes it.

### 10.1 Online refinement of every layer

| Quantity | Learns from | How |
| --- | --- | --- |
| Tuning and B per key | Confident isolated notes; lesson-correct notes | Kalman update with the matrices of 6.2; process noise about 1 cent per hour on acoustic pianos, zero on digital |
| Global drift | All keys together | A few drift shapes instead of one uniform state: a uniform term plus register shapes learned from the user's own sessions (the principal components of per-key drift), so humidity moves each register by its own amount (G24) |
| Templates | Confident isolated notes | Per-partial running update with a gain set by σ\_T; unscanned keys converge towards measured ones |
| Decay and release | Confident held notes and their releases | λ1, λ2, b1, b3 and the per-partial steps updated; observability re-judged |
| Noise | Silent stretches | Model-based tracker (4.5), noise states (4.4), common gains every hop (4.2) |
| Evidence scale | Quiet stretches | Shadow CUSUMs (5.4) |
| Session gain and tilt | Confident notes | The split of 7.4 |

### 10.2 Health monitor and targeted recalibration

Each statistic below runs its own CUSUM in units of its own noise, so a flag means a real change rather than a busy passage.

- **Frequency innovations** per key and register beyond the Kalman filter's process noise: tuning has drifted, or one key has.
- **Template remainder** e\_h correlated across keys: the phone has moved.
- **Tilt** T: the microphone is covered, cased or behind a closed lid.
- **Noise** outside every stored state for long enough: a new state, learned silently.
- **θ̂\* falling** in a tier: that tier's evidence scale tightens; below 0.8 the student is told the room is too noisy for soft notes in that register.
- **Decay residuals**: a damper change, or the soft pedal.

| Change seen | Smallest fix | Time |
| --- | --- | --- |
| A new noise state | Learned silently | 0 s |
| A new audio route | Chirp | About 5 s |
| The phone moved | Re-scan (placement layer) | 30–44 s |
| The piano was tuned, or drifted past 30 cents | Scan (frequencies refreshed) | 30–44 s |
| A new room | Re-scan, 3 holds and the chirp | About 1 min |
| A new phone on the same piano | Placement and route layers | About 1 min |
| A new piano | Quick or standard calibration | 1–2 min |

These replace master 10.7's single "calibration needed" at 30 cents of drift or 10 dB more noise. The tiers stay as the master sets them: a moved phone is a message after the lesson, wind and a noisy register are notices while playing.

## 11. Profile v3: four layers, re-estimable from stored audio

Profile v2's single block becomes four layers of about 216 KB in all, each versioned, checksummed and swapped on its own through the existing lock-free double buffer.

| Layer | Contents | Lives until | Size |
| --- | --- | --- | --- |
| Instrument | Per key: (c, B) mean and 2 × 2 covariance, σ\_e and σ\_u, unison spacing and jitter, glide coefficient, b1 and b3, the two-slope envelope, dynamics coefficients; zone and break locations; phantom and longitudinal lines of the bass keys | The piano is tuned or repaired | 26 KB |
| Placement | Per key: attack and sustain templates at mf, per-partial template variance, per-partial release steps, click level; direct-to-reverberant ratio by band, RT60, session-gain reference, observability map | The phone or the room changes | 36 KB |
| Noise | Per state: mean spectrum, dispersion per band, component shapes and gain priors, tonal lines and families, modulation; up to 4 states per room | The room changes; states are added as they are heard | 36 KB per state, 143 KB for 4 |
| Route | Latency, echo path, sweep response, processing flags, headroom, click-band SNR | The route changes | 12 KB |

- **Stored audio is the source of truth.** Calibration audio is kept as 16-bit FLAC (a few megabytes) together with the estimator version that read it. An engine update that changes an estimator recomputes the profile from that audio instead of asking for a new calibration (G38). The user can delete it, as now.
- **Layers travel separately.** A second phone on the same piano reuses the instrument layer and needs only placement and route; a re-tuned piano refreshes the instrument layer's frequencies and keeps the rest.
- **One profile per instrument and location** stays the unit the student sees (master 8.11); the layers are how the engine keeps it current.

## 12. Bench: how the numbers were made, and their limits

Every number in this document comes from calibration\_calcs.py, saved beside it in the Piano project; it runs in about 15 s with fixed seeds and prints its results in the order below. These are derivations and simulations on the master's own conventions (48 kHz, 256-sample hop, its τ values and thresholds), not measurements; Phase 0 recordings set the real values.

| Bench | Question | Method | Finding | Used in |
| --- | --- | --- | --- | --- |
| 1 | Which mains harmonics sit on piano keys? | Exact arithmetic, 50 and 60 Hz | Several land within 10 cents of treble fundamentals, and one line touches eight keys' partials | 4.3 |
| 2 | How well does silence measure the noise's spread? | Closed form, checked by simulation, with Hann bin correlation and τ | Dispersion is measurable per band from 1.5 s | 4.1 |
| 3 | What does a common band gain do to the null? | 20,000 simulated frames per cell; score statistic with and without the profiled gain | Large inflation without profiling; none with it | 4.2 |
| 4 | How fast is a noise state recognised? | Kullback–Leibler divergence per bin, bin correlation and τ | Milliseconds for 3 dB | 4.4 |
| 5 | How deep can a line be removed? | Formula, checked by simulating a 1 s least-squares fit and a 2048 frame | Within 0.4 dB of the formula | 4.3 |
| 6 | How large is room ripple, and can anchors interpolate it? | Rician spread; room responses from exponentially decaying noise (RT60 0.5 s), 20 rooms per cell; template weights from D\_s | Anchors cannot; more anchors barely help | 7.1, 7.2 |
| 7 | What happens to keys outside their window? | 4,000 simulated pianos per cell; cubic on 9 anchors | Confidence bands miss a fixed share of keys at any scatter | 6.1, 6.2 |
| 8 | What does one scan note measure? | Cramér–Rao bound; weighted least squares on Fletcher's law | Far below systematic limits | 9.3 |
| 9 | Can a doublet inside one FFT peak be resolved? | Matrix pencil, 400 runs per SNR | Spacing and both decays recovered | 6.3 |
| 10 | What does the room let through? | Expected Itakura–Saito evidence with decay, per threshold | Soft notes are lost in a fan room | 9.6 |
| 11 | Can θ\* be measured from seconds of silence? | 300 simulated silences per cell; moments and the cumulant root | Yes for Gaussian-like nulls; bursts need the model | 5.2 |
| 12 | Can processing be detected? | Binomial and level precision | Easily | 8 |
| 13 | Where should anchors go? | Gaussian-process predictive variance | Near-uniform beats Chebyshev slightly | 9.2 |
| 14 | How long does each mode take? | Master 8.1's totals and 2.5 s per strike | About a minute stays a minute | 9.1 |
| 15 | How big is profile v3? | Counting floats | About 216 KB | 11 |

**Limits.**

- No real room, phone or piano is involved. The simulated rooms lack discrete low-frequency modes and soundboard directivity; both add ripple, so the template finding is if anything conservative.
- The evidence model is the Itakura–Saito likelihood with known templates, not the full engine; the θ\* runs use Gaussian autoregressive increments; the detectability table leaves out the hammer click, which makes struck notes faster.
- The pooled scatter estimate in bench 7 centres its population prior on the true scatter, which flatters it; Phase 0's pianos supply the real prior.

## 13. Cases, tests, exit criteria, risks and build order

The new calibration changes 18 of the 26 cases, adds 10 directed tests to Phase 0, and replaces master 8.13's exit criteria.

### 13.1 What changes for the 26 cases

| # | Case | What calibration now adds |
| --- | --- | --- |
| 1 | Neighbour collision | Each key's own (c, B) from the scan; correlated frequency evidence tolerates common offsets and keeps over 100 nats between neighbours |
| 2 | Soft to loud | Profiled noise gains, dispersion weights and line removal keep soft-note evidence in noisy rooms; the map states each key's floor |
| 3 | Phone near or far | Placement layer re-measured on a move; tilt and ripple watched; coaching from the map |
| 5 | Chords | Per-key templates with their variance, so template error stops lending evidence to partners |
| 8 | Different pianos | Uneven tuning carried by each key's scatter; unison doublets and glide measured |
| 9 | Calibration feeds the engine | A posterior per key, not a point; four layers |
| 10 | Octave ghosts | Per-key templates, template variance and phantom lines remove the main source of ghost evidence |
| 11 | Missing fundamental | Wind and low-frequency noise flagged; bass templates measured per key |
| 12 | Room echo against damper | Release combined over partials; ratio per band |
| 13 | Whistle, clap, speech | Known tonal lines explained without a search; speech kept out of the noise estimate |
| 16 | Bass break, stretch, timbre | Stretch derived from B and octave type; break found by the scan or probabilistic bisection |
| 17 | Tuning drift | Drift in register shapes, not one uniform shift |
| 19 | Lesson against free play | Thresholds hold in the user's room (θ\*); a predicted miss is graded unclear |
| 21 | Three-zone windows | θ\* measured per tier |
| 22 | Velocity against distance | Dynamics in measured intensity; tilt separated from gain |
| 23 | Fast calibration | Quick stays at about a minute; standard adds the scan; the planner stops early |
| 24 | Thresholds after gain | Still exact by construction, now also after the noise changes |
| 26 | Latency and telemetry | Processing, sample-rate and headroom checks; the map and health statistics in telemetry |

### 13.2 New directed tests for Phase 0

1. A ceiling fan at low, medium and high speed with its regulator, and a table fan oscillating: noise takes, the loudness ladder and the Jingle Bells chorus.
2. A fan switched on and off mid-take, and an air-conditioner compressor cycling.
3. Mains hum from an inverter, a tube light or a transformer near the phone, with a lesson on F4–F5.
4. Wind: the phone lying flat under a ceiling fan, then on the stand turned away.
5. Speech and TV during the silence step.
6. The sustain pedal held during calibration.
7. After calibration: the phone moved 0.5 m, the lid opened, a case put on.
8. An unevenly tuned piano: on the PSR-E343, self-play notes re-rendered with a separate offset per key; on the acoustic, the piano as found.
9. Devices whose input source still processes, for the gain and suppression detectors.
10. Calibration repeated in every noise condition, for profile repeatability.

### 13.3 Exit criteria (replacing master 8.13)

- [ ] Quick calibration within 90 s on the acoustic and 100 s on the PSR-E343 in a quiet room, as now; standard within 120 s and 110 s.
- [ ] Fan and hum takes: at most 6 false notes per hour, the quiet-room gate, verified tier by tier.
- [ ] θ̂\* from 3 s of silence within ±0.15 of the value measured on 0.5 h of the same room's noise.
- [ ] A 3 dB noise change recognised within 50 ms; a stored state reused across sessions.
- [ ] Line removal: at least 12 dB more SNR on a catalogued line's bins in the 2048 tier, and no loss on a partial within 1 Hz of a line.
- [ ] Coverage: 90% intervals hold 87–93% of held-out keys' partial frequencies and template levels.
- [ ] With the scan, repeated mf templates agree within 1.5 dB rms per partial; without it, the reported σ\_T matches the measured interpolation error within 20%.
- [ ] A 0.5 m phone move flagged within 10 confident notes; no false re-scan prompt in 1 h of unchanged playing.
- [ ] Every processing source in test 9 flagged; no flag on UNPROCESSED or iOS Measurement mode.
- [ ] A profile recomputed from stored audio after an estimator change gives identical keys on the corpus.

### 13.4 Risks and guards

| Risk | Effect | Guard |
| --- | --- | --- |
| Profiled gains absorb a soft note | Lost evidence | Gains fitted outside every candidate's support; each component at least 10 × n\_eff bins wide, so the price stays under 10% |
| Line removal cancels a partial on the hum's pitch | A lost note | Freeze within three lock-in bandwidths of any predicted partial; bounded atoms first, removal only where Phase 0 shows a gain |
| Students skip the scan | Interpolation error remains | σ\_T carries it honestly; templates refine online; the focus scan takes 12 s |
| Evidence rescaling slows notes in noisy rooms | Later display | The model fixes come first and rescaling handles only what remains; the map tells the student why |
| More layers and states | Complexity and bugs | Each layer swaps alone through the existing double buffer, with its own checksum and exit test |
| The two-microphone spike fails on some phones | No coherence cue | Optional; the mono path is complete without it |

### 13.5 Build order

1. Noise statistics, the tonal-line catalogue and the processing checks, offline in the harness on Phase 0 audio.
2. Profiled noise gains and dispersion weights in the joint fit; θ\* measurement; tests 1–4.
3. The keyboard model with each key's scatter, correlated frequency evidence and the scan step.
4. Placement layer: templates with their variance, per-partial release, tilt.
5. Noise states, the model-based tracker and the session check.
6. Health monitor, targeted recalibration, profile v3 and re-estimation from stored audio.
7. Line removal, per-room evidence recalibration and the two-microphone spike, each only where Phase 0 shows its gain.

## Merge into master

Nothing below is applied yet: per the versioning rules the master changes only after a yes. Merging raises the master to v1.6, whether this design goes in alone or together with the engine re-audit and the two-octave audit.

| Master section | Change |
| --- | --- |
| 1, decisions | Calibration has four layers (instrument, placement, noise, route), each with its own lifetime and its own recalibration |
| 2.4 | θ\* as the general false-alarm exponent, with τ as its Gaussian case; θ\* measured per room and tier, and evidence rescaled to a true log-likelihood ratio |
| 2.6 | Noise becomes a model: mean, dispersion, components with profiled gains, tonal lines, states; quasi-likelihood weights per bin |
| 4, Calibration | New settings: mode (quick, standard, full, focus scan), sessionCheckSeconds 1.5, noiseStatesMax 4, noiseComponentMinBins 10 × n\_eff, lineRemoval (atoms or subtract), plannerTargets, scanNotesPerSecond 2, keyScatterScanCents 3 |
| 4, Diagnostics | The detectability map and the health statistics join telemetry |
| 6.6 | Sweep from 50 Hz to 16 kHz (with re-audit D6); gain, suppression, sample-rate and headroom checks |
| 7.3 | Partials within 2 bins of a catalogued line flagged as shared; each partial's beating jitter added to its measurement variance |
| 7.4 | Minimum statistics replaced by the model-based tracker, the noise states and the session check |
| 8 | Replaced by this design: protocol, layers, scan, planner, acceptance tests and validation; 8.13 replaced by 13.3 here |
| 9.1 | Candidate tolerance from the predictive spread, each key's own scatter included |
| 9.2 | Frequency evidence with (c, B) marginalised |
| 9.3 | Noise components with profiled gains; dispersion weights, template variance inside them; tonal atoms |
| 9.4 | Catalogued lines explained without a search or an Occam charge |
| 9.6 | Release evidence combined over partials |
| 9.9 | Per-room θ\*, optional per-room recalibration and shadow CUSUMs beside the lab calibration |
| 10.4 | Tilt beside session gain; a ripple change flags a moved phone |
| 10.7 | New statuses: wind on microphone, processing detected, noise state changed, phone moved (re-scan), unisons need tuning; "calibration needed" replaced by the targeted actions of 10.2 here |
| 11.3 | The backing floor adds the noise layer's components and lines |
| 13.2 | A per-room verification beside the check on lab noise |
| 13.4 | The 10 directed tests of 13.2 here |
| 14.8 | Normalisation and FiLM inputs read the noise layer: class, dispersion, state |
| 15 | Gaps G1–G38 added to the beyond-cases with their mechanisms; cases 1–3, 5, 8–13, 16, 17, 19, 21–24 and 26 updated as in 13.1 here |
| 16.2 | The risks of 13.4 here |

## Sources

**Project documents**

- [Reevo 2 — Piano Detection Engine: End-to-End Implementation Plan](https://claude.ai/artifact/FHiwgewYvGVz3CX6KBbjWH), master v1.5: sections 2, 4, 6–10, 13 and 15, read from the project snapshot of 28 Oct 2026.
- [Reevo 2 Engine Re-Audit v1.0](https://claude.ai/artifact/ECKQ3VBdurxDwTsogGotuo): D3, D6, D10, O2, O5 and N16.
- Two-Octave Strategy Audit v1.0 (based on master v1.5), in the Piano project: window calibration, pair strikes and the template-error bench.
- Master document and versioning rules, in the Piano project.
- calibration\_calcs.py, saved beside this design in the Piano project: every number here.

**Literature** (standard references, cited from the published papers and not re-opened for this design; the master's own list covers Martin 2001, Févotte et al. 2009, Weinreich 1977 and Chandler and Bate 2007)

- Rice, S. O. (1944). Mathematical analysis of random noise. Bell System Technical Journal 23(3).
- Schroeder, M. R. (1962). Frequency-correlation functions of frequency responses in rooms. JASA 34(12).
- Schroeder, M. R. (1996). The "Schroeder frequency" revisited. JASA 99(5).
- Wedderburn, R. W. M. (1974). Quasi-likelihood functions, generalized linear models, and the Gauss–Newton method. Biometrika 61(3).
- Siegmund, D. (1985). Sequential Analysis: Tests and Confidence Intervals. Springer.
- Hua, Y., Sarkar, T. K. (1990). Matrix pencil method for estimating parameters of exponentially damped/undamped sinusoids in noise. IEEE Transactions on Acoustics, Speech and Signal Processing 38(5).
- Conklin, H. A. (1999). Generation of partials due to nonlinear mixing in a stringed instrument. JASA 105(1).
- Tolonen, T., Välimäki, V., Karjalainen, M. (2000). Modeling of tension modulation nonlinearity in plucked strings. IEEE Transactions on Speech and Audio Processing 8(3).
- Bensa, J., Bilbao, S., Kronland-Martinet, R., Smith, J. O. (2003). The simulation of piano string vibration: from physical models to finite difference schemes and digital waveguides. JASA 114(2).
- Bank, B., Sujbert, L. (2005). Generation of longitudinal vibrations in piano strings: from physics to sound synthesis. JASA 117(4).
- Gerkmann, T., Hendriks, R. C. (2012). Unbiased MMSE-based noise power estimation with low complexity and low tracking delay. IEEE Transactions on Audio, Speech and Language Processing 20(4).
- Rigaud, F., David, B., Daudet, L. (2013). A parametric model and estimation techniques for the inharmonicity and tuning of the piano. JASA 133(5).
- Waeber, R., Frazier, P. I., Henderson, S. G. (2013). Bisection search with noisy responses. SIAM Journal on Control and Optimization 51(3).
