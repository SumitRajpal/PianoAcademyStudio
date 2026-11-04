# The Ultimate Piano Note Detection Engine: Comparing Apex v1, Apex v2 and Reevo, Auditing the 26 Cases, and a Maths-First Design

None of the three engines is the "ultimate" engine, and "0 flaw" cannot be reached because physics and detection theory forbid it. Reevo (Engine C) is the strongest base to build on. The best engine anyone can build today is a hybrid: a calibrated physical DSP front end and per-key decision logic (taken from Reevo and Apex v2), plus a small causal neural acoustic model trained on augmented real-world audio, plus score-informed priors in lesson mode.

## TL;DR
- **Winner and what it means:** Reevo has the best architecture of the three: a polyphonic per-key state machine, a least-squares inharmonicity calibration, telemetry and latency offset. Apex v2 has better detail in a few places (auto-gain, dual timbre templates, velocity, missing-fundamental gate). Apex v1 is monophonic, uses rectangular windows and is out of date. None of them truly "passes all 26". Both B and C have thresholds that are provably wrong (B's release slope is 10× off; C's fixed 12 dB/s decay model and −30 dB/s release rule clash with measured piano decay physics). Below about G6, adjacent keys sit inside the same Hann main lobe in every tier, so energy-at-bin detection cannot separate neighbours in clusters.
- **Hard limits:** At least six of the 26 requirements cannot be met perfectly. Key-release under the sustain pedal and on undamped treble keys is acoustically unobservable. Octave additions masked by a loud lower note are unidentifiable without priors. Neyman-Pearson forbids zero misses together with zero false alarms. Latency cannot fall below the time needed to see enough signal (one A0 period is 36 ms). Hardware latency is unknowable without per-device measurement.
- **What to build:** Keep the C++/JSI capture core. Replace bin-energy matching with phase/reassignment frequency estimation at calibrated inharmonic partials, using low-delay asymmetric windows plus a resonator bank for onsets. Add a causal neural model (Mobile-AMT-class, augmented with room/device impulse responses and noise) as a polyphony/ghost-note arbiter. Fuse everything in per-key CUSUM/HMM decoders using Rigaud's parametric inharmonicity/tuning model. Use score-informed priors in lessons, a MIDI bypass for digital pianos, and covering-array test suites. Published evidence suggests about 93% real-world note F1 for free play (Mobile-AMT on IDMT recordings) and about 93–99% in score-informed lesson mode. Those are the realistic ceilings, not 100%.

## Key Findings

### 1. Point-by-point comparison of the three engines

| Dimension | Apex v1 (A) | Apex v2 (B) | Reevo (C) | Verdict |
|---|---|---|---|---|
| Polyphony | Monophonic path; Klapuri estimator experimental | Goertzel bank + inter-hop subtraction + intra-hop peeling (4/hop), 10 voices | 3 FFTs, 8 partials, peeling 4/hop, 88 state machines | C ≥ B ≫ A |
| Window | Rectangular (−13 dB sidelobes) | Hann, 3 tiers | Hann, 3 tiers | A loses: rectangular leakage masks soft notes |
| Partials/key | Goertzel verification only | 6 | 8 (3-bin footprint) | C; but 8 partials is too few for A0–B1 neighbour discrimination (see §3) |
| Note lifecycle | 2-hop confirm | Per-key counters + voice subtraction | IDLE→PENDING→ACTIVE→RETRIGGER→RELEASE | C: explicit states match the neural multi-state literature (Kwon et al. 2020: off/onset/sustain/re-onset/offset) |
| Release logic | — | 1.55 dB/hop (= 291 dB/s, not 29 dB/s) | −30 dB/s for 3 hops; F6–C8 exempt | Both flawed; C closer to physics |
| Re-strike | — | Not explicit | Fixed 12 dB/s predicted decay + 6.5 dB | C concept right, constant wrong |
| Calibration | 7/16 keys, split-scale B, Railsback | Dual soft/loud templates | 539-float profile, LS on (f_k/k)² = f0² + f0²B k², split-bridge log-linear B | C best; upgrade to Rigaud 2013 model |
| Gain/normalisation | — | Auto gain to −10 dBFS, 0.125·N² | Input gain in profile | B's coherent-gain maths is correct for tones (see §4) |
| Velocity | — | 0.05+0.95(0.65·level+0.35·brightness) | Soft/loud level + centroid per key | B formula plausible; needs per-session distance normalisation |
| Noise rejection | Fingerprint gate | Transient tolerance for thump | Whistle centroid ≥1.10, clap 50-cent bin test | C more explicit; both heuristic |
| Timing/telemetry | Median latencies claimed | — | micLatencyOffsetMs, avgUs/maxUs/lateHops, clip warn at 0.985 | C only |
| Evidence base | 88/88 on synthetic tones | None stated | "Passes all 26" (asserted) | None validated on real recordings |

**Overall:** C is the best skeleton, B contributes four components worth keeping (auto-gain with threshold shift, dual soft/loud templates, missing-fundamental gate max(P1, 0.7(P2+P3)), atomic expected-note mask), and A should be retired except its trill comb-notch idea. Synthetic-tone accuracy (A's 88/88) does not predict real-room accuracy: Mobile-AMT trained only on MAESTRO scored 96.30 note F1 on MAESTRO but 78.84 on the real-world IDMT-PIANO-MM recordings (grand/upright/digital pianos, eight rooms, smartphones and tablets).

### 2. Errors found in the engine documents

- **Apex v2 release slope is mislabelled by 10×.** 1.55 dB per 256-sample hop at 48 kHz = 1.55 / 0.005333 s = **290.6 dB/s**, and 3.2 dB/hop = **600 dB/s**. Either the threshold should be ≈0.155 dB/hop (≈29 dB/s), or the "> 29 dB/s" description is wrong. As written, B will miss most damper releases whose decay is slower than ~290 dB/s.
- **Reevo's fixed 12 dB/s predicted decay ignores double decay.** Weinreich's measurement of E♭3 (311 Hz; "The coupled motion of piano strings", KTH Five Lectures on the Acoustics of the Piano, Fig. 1) shows a "prompt sound" falling at about 8 dB/s and an "aftersound" at less than one-quarter of that rate. On a spinet, measured decay rates of individual components ranged from 1 to 100 dB/s, depending mainly on frequency and string position. A single constant over-predicts decay in the aftersound (missed re-strikes) and under-predicts in the treble (false re-strikes). Decay must be a per-key, two-slope model fitted at calibration.
- **Reevo's −30 dB/s release threshold collides with natural treble decay.** If natural partial decay reaches up to ~100 dB/s in the upper register, held notes in C6–E6 can trip a −30 dB/s rule with no damper involved. Release must be judged relative to the key's own calibrated natural decay: release ⇔ slope < λ_nat(k) − Δ, with Δ set from calibration.
- **Reevo's "sub-hertz bass isolation" is estimation, not separation.** A 4096-point FFT at 48 kHz has 11.72 Hz bins and a Hann main lobe of ±23.4 Hz. Sub-hertz precision is achievable for one known sinusoid (see the Cramér-Rao bound, §4), but two components 1.64 Hz apart (A0 vs B♭0 fundamentals) cannot be separated by bin energies at any SNR with that window.
- **Reevo's dismissal of neural networks is partly outdated.** Its "32–64 ms frame latency" claim matches standard centred 2048-sample windows (64 ms at 16 kHz, per Hu et al. 2025), but asymmetric shifted windows cut this to 10–30 ms. Mobile-AMT ran at a real-time factor of 0.6 on a single Pixel 6 CPU core and 0.35 on a 2019 iPad Pro. "Cannot take a calibration bias" is false: networks can be conditioned (Kwon et al. use frequency-conditioned FiLM layers), or fed calibrated features.

### 3. The neighbour-collision theorem for bin-energy detectors

For a Hann window, the normalised magnitude response at an offset of δ bins is |W(δ)| = |sinc(δ)/(1−δ²)|. At δ = 0.5 this is 0.849 (−1.42 dB); at δ = 0.14 it is ≈ −0.1 dB. A semitone is a ratio of 2^(1/12) − 1 = 5.95%, so adjacent-key fundamentals are separated by 0.0595·f0. The two fundamentals are resolvable by energy only if 0.0595·f0 ≥ 2Δf_bin (Hann main-lobe half-width):

| Tier (C / B) | Bin Δf | Lowest key in tier | Semitone at that key | Offset (bins) | Partial number h needed for ≥2-bin separation |
|---|---|---|---|---|---|
| 4096 | 11.72 Hz | A0 27.5 Hz | 1.64 Hz | 0.14 | h ≥ 14.3 |
| 4096 | 11.72 Hz | A1 55 Hz | 3.27 Hz | 0.28 | h ≥ 7.2 |
| 2048 | 23.44 Hz | F#2 92.5 Hz | 5.50 Hz | 0.23 | h ≥ 8.5 |
| 2048 | 23.44 Hz | C4 261.6 Hz | 15.6 Hz | 0.67 | h ≥ 3 |
| 1024 | 46.88 Hz | G4 392 Hz | 23.3 Hz | 0.50 | h ≥ 4 |
| 1024 | 46.88 Hz | G6 1568 Hz | 93.3 Hz | 1.99 | h ≥ 1 |

**Consequences:** (1) In all three engines, every key below about G6 shares its fundamental's main lobe with its neighbours, so case 1 ("zero neighbour collision") rests entirely on higher partials or frequency estimation. (2) Reevo's 8 partials cannot reach the h ≈ 14 needed for A0/B♭0 by energy alone. (3) For single notes, the right fix is to estimate each partial's frequency (phase vocoder, reassignment or quadratic interpolation) and score keys by frequency residual against calibrated f_h(k) = h·f0(k)·√(1+B(k)h²), not by energy. For adjacent-key clusters (minor seconds), use longer windows after the onset (progressive refinement) or parametric methods.

### 4. Mathematical limits (formulas)

- **Gabor uncertainty:** σ_t·σ_f ≥ 1/(4π). Time and frequency resolution trade one-for-one; no transform beats this for a single atom.
- **Rayleigh resolution:** separating two sinusoids Δf apart needs an observation T ≳ c/Δf (c ≈ 1 rectangular, ≈ 2 Hann). For A0/B♭0 (Δf = 1.64 Hz): T ≥ 0.61 s (rectangular) to ≈ 1.2 s (Hann) using fundamentals; using partial h divides this by h.
- **Cramér-Rao bound for one sinusoid in white noise** (Rife & Boorstyn 1974): var(f̂) ≥ 12·fs² / ((2π)²·SNR·N(N²−1)). At SNR = 20 dB: N = 4096 gives σ_f ≈ 0.01 Hz; N = 1024 gives σ_f ≈ 0.08 Hz. Single-note pitch precision is therefore not the bottleneck. Model mismatch (unknown component count, inharmonicity, attack non-stationarity, low-frequency mic roll-off) is.
- **Algorithmic latency of a symmetric window** = N/2 samples (4096 @ 48 kHz → 42.7 ms; 1024 → 10.7 ms). Hu et al. (ISMIR 2025) show that shifting a 2048-sample window so that only 160 samples (10 ms) of "future" remain, with an asymmetric taper, raises spectral leakage by about 20 dB. Even so, it beat the centred window at strict 10–20 ms tolerances.
- **Physical latency floor:** pitch requires at least about one to two periods: A0 period = 36.4 ms, C4 = 3.8 ms. Bass identity therefore cannot be confirmed in under roughly 40–80 ms without relying on upper partials.
- **Neyman-Pearson:** for any threshold, P_D < 1 whenever P_FA > 0 and the class-conditional distributions overlap. "Zero misses and zero false alarms" is impossible under noise.
- **Quickest change detection (CUSUM; Page 1954, Lorden 1971, Moustakides 1986 optimality):** expected detection delay ≈ ln(γ)/D, with γ the mean time between false alarms (in hops) and D the per-hop Kullback-Leibler divergence. For 1 false alarm per hour per key: γ = 3600/0.005333 = 675,000 hops, so ln γ ≈ 13.4. Across 88 parallel keys the per-key γ must be 88× larger, giving ln γ ≈ 17.9. At D = 5 nats/hop that is about 3.6 hops ≈ 19 ms; at D = 1 nat/hop (soft, far notes) it is about 96 ms. This is the governing law for the speed-vs-false-alarm trade-off in cases 2, 3 and 4.
- **Coherent-gain normalisation (case 25):** a Hann-windowed sinusoid of amplitude A gives |X|² = A²N²/16, while its mean power is A²/2. The ratio is N²/8 = 0.125·N², so **Apex v2's normalisation is exactly right for tones**. Noise, however, scales with Σw² = 3N/8 (ENBW = 1.5 bins). Noise-floor thresholds must use the 0.375·N normalisation, not 0.125·N². Mixing the two misplaces SNR thresholds by 10·log10(N/3) dB (≈ 31 dB at N = 4096).

### 5. State of the art in piano transcription

| System | Note F1 (MAESTRO) | Note+offset F1 | +velocity F1 | Params | Latency / causality | On-device evidence |
|---|---|---|---|---|---|---|
| Onsets & Frames (Hawthorne 2018/2019) | 95.32 | 80.50 | 77.54 | 18.3M | Offline (bi-LSTM) | — |
| Kong et al. 2021 regression (with pedals) | 96.72 | 82.47 | 80.92 | 20.2M | Offline; pedal onset F1 91.86 | — |
| hFT-Transformer (Toyama 2023) | 97.44 (v3) | 90.53 | 89.48 | 5.5M | Offline | — ; MAPS note F1 85.14, w/ offset 66.34 |
| Yan & Duan 2024 (scoring time intervals) | Reported new SOTA on all subtasks (exact values not retrieved here) | — | — | — | Offline | — |
| Sparse-attention seq2seq (2025) | 96.86 (baseline repr.) | 83.71 | 83.08 | — | Offline | — |
| Kwon AR multi-state "five small" (2020) | 94.38 | 74.03 | — | 6.1M | Online, 160 ms | — |
| Kwon-based low-latency (JASK 2023) | 93.43 / 92.67 / 90.51 | — | — | — | 160 / 96 / 64 ms | — |
| Onsets & Velocities (Fernandez 2023) | 96.78 | — | — | 3.1M | Online; reported latency 4–9 s per later analysis | — |
| Streaming seq2seq with pedal (ISMIR 2024) | 96.52 | 89.44 | — | — | 380 ms | — |
| Mobile-AMT (Yamaha, EUSIPCO 2024) | 96.30 | 76.80 | 75.53 | 5.9M | Claimed 174 ms; Hu et al. show squeeze-excitation makes it ~10 s in practice | ONNX Runtime single core: RTF 0.25 MacBook, 0.35 iPad Pro 2019, 0.6 Pixel 6; 129 MB peak (Mac) |
| Causal-AMT (Hu et al., ISMIR 2025) | 31.55 @10 ms, 37.38 @30 ms tolerance (val.) | 5.03 @10 ms | — | ~160 GFLOPs/3 s | Strictly causal, 10 ms window delay | Open-source baseline |
| Basic Pitch (Spotify 2022) | Instrument-agnostic (not piano SOTA) | — | — | <17K | Offline batch | <20 MB peak memory; runs in browser |

**Interpretation:** offline transformers reach about 97% note F1, but every truly causal system under 30 ms loses most of that accuracy (Causal-AMT scores 37% F1 at a 30 ms tolerance). No published neural system yet gives piano-grade accuracy at under 30 ms latency. That is why a tutoring app's NoteOn path must remain DSP, with the neural model acting as a slightly delayed (≈64–100 ms) confirm/veto layer. The Korean low-latency work keeps 90.51% note F1 at 64 ms.

### 6. Robustness to real recording conditions

- Mobile-AMT: MAESTRO-only training gave 78.84 ± 14.23 note F1 on IDMT-PIANO-MM. Training with augmentation (piano-source sampling incl. Pianoteq, ±10-cent pitch shift, speech/environment noise at 0–20 dB SNR, room-IR convolution, device-IR convolution, clipping) lifted it to 93.15 ± 4.97, a 14.3-point gain.
- Ablation: dropping piano-source sampling cost the most (92.20 → 86.43). Dropping RIR convolution cost 2.0 points, and dropping environmental noise 1.26. With 10 dB speech noise added, the speech-augmented model kept 89.73 vs 79.47 without speech augmentation.
- Edwards et al. 2024 (IEEE SPL 31:681–685): re-recording MAESTRO through a Disklavier in a studio, plus augmentation, achieved 88.4 note-onset F1 on MAPS without seeing any MAPS training data. Models "can severely overfit to acoustic properties of the training data."
- **Implication for the 26 cases:** cases 3, 8, 12 and 13 (distance, piano type, room, noise) are where hand-tuned DSP thresholds fail. A data-trained model or data-fitted thresholds, validated on phone recordings of real pianos, is mandatory.

### 7. Score-informed detection and commercial apps

- Benetos, Klapuri & Dixon (EUSIPCO 2012): score-informed transcription of student performances reached a weighted F-measure of 93%, and comparing against a synthesized score rendition suppressed typical errors such as extra octave notes.
- RUMAA (Chang, Dixon, Benetos 2025): score-informed onset F1 99.1 on (n)ASAP, offline. That is the ceiling for lesson mode.
- MIREX multi-F0 accuracy for the best classical (non-neural) systems was only 0.47–0.57 in 2010–2011 (Benetos & Dixon), versus ≥ 0.85 note F1 for modern neural systems on MAPS. The metrics differ, but the gap is large and consistent.
- Simply (formerly JoyTunes) markets a "patented acoustic note recognition engine" (MusicSense) that recognises multiple notes "even with background noise". It combines "audio processing… and deep learning". Its US11670188B2 patent claims capturing "composite sound including the BGM and user-generated sound" and setting speaker/microphone parameters, i.e., it explicitly handles accompaniment leakage. JoyTunes' original 2009-priority US9492756B2 covers analysing a digitised performance. No vendor publishes accuracy or latency figures. A teacher review of Piano Maestro reports occasional "ghost notes" and dropped notes from interference, and "near 100% accurate" detection over MIDI.

### 8. Piano acoustics parameters

| Parameter | Value | Source / confidence |
|---|---|---|
| Inharmonicity law | f_h = h·f0·√(1+Bh²) | Fletcher 1964; standard |
| B along keyboard | 2-parameter whole-compass model plus bass-break discontinuity; "low/medium/high inharmonic" piano types; a few bass notes suffice to fix the bass segment | Rigaud, David & Daudet, JASA 133(5):3107–3118 (2013) and DAFx 2011 |
| Typical B magnitude | ≈1e-4 in bass tones (Rauhala's example B = 0.0001); rises steeply toward treble; uprights/spinets higher than grands (short strings) | Rauhala & Välimäki 2007; magnitude by register should be calibrated, not assumed |
| Tuning stretch | Octave type (2:1, 4:2, 6:3…) varies along compass; deviations from ET reach tens of cents at the extremes | Rigaud et al. 2013 |
| Decay (undamped) | Prompt ~8 dB/s, aftersound < ¼ of that (E♭3); components 1–100 dB/s, mainly a function of frequency/string position; dynamics have no significant effect on decay rate | Weinreich 1977/1979; spinet study (JASA 1960); Cheng, Dixon & Mauch ICASSP 2015 |
| Undamped top keys | Topmost ~18 keys (≈1.5 octaves) have no dampers and resonate sympathetically with lower strings regardless of pedal position (Kawai); 18–20 on Steinway/Mason & Hamlin grands; uprights typically 65 dampers (→ 23 undamped), some 70–75 | Kawai Musical Instruments FAQ; technician forums (lower confidence) |
| Hammer nonlinearity | Hertz-law exponent 2.3–3.6 for voiced hammers; contact time falls and force spectrum broadens with velocity, so brightness rises with dynamics | Russell & Rossing, Acustica 84 (1998); Hall & Askenfelt |
| Key/hammer timing | Key travel 25 ms (forte, ~5 m/s hammer) to 160 ms (piano, ~1 m/s); at piano touch the hammer strikes 12 ms before key-bottom contact, so the thump arrives after string onset | Askenfelt & Jansson 1991; Goebl et al. JASA 2005 |
| Striking point | ≈1/7 of string length (suppresses ~7th partial) | HyperPhysics (textbook level) |
| Stringing | ~10 lowest notes single wound string; next 18 two strings; top 60 three | HyperPhysics |

The research did not retrieve damper engagement time/decay rate numbers, phantom-partial magnitudes (Conklin 1999), una corda spectral change, or sympathetic-resonance levels, so these must be **measured during calibration** rather than hard-coded.

### 9. Mobile audio facts

- **Android UNPROCESSED** (CDD §5.11): when supported (reported via PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED; else null), ±10 dB 100–7000 Hz; ±20 dB 5–100 Hz; ±30 dB 7–22 kHz; 94 dB SPL at 1 kHz → −36 dBFS; SNR ≥ 60 dB; THD < 1% at 90 dB SPL; no AGC, HPF or echo cancellation. **Implications:** full scale sits at ≈ 130 dB SPL, so digital clipping is rare and acoustic overload of the MEMS capsule comes first. A0's fundamental may legally arrive 20 dB down.
- **VOICE_RECOGNITION** fallback: ±3 dB 100–4000 Hz; 90 dB SPL → RMS 2500 (16-bit). Flatter in the mid-band, but unspecified below 100 Hz.
- **Latency:** Android CDD pro-audio requires ≤ 20 ms continuous round-trip (SHOULD ≤ 10 ms); per the Android NDK "Audio latency" guide, android.hardware.audio.low_latency indicates a continuous output latency of 45 ms or less and android.hardware.audio.pro a continuous round-trip latency of 20 ms or less. Google's Android Developers Blog ("An update on Android's audio latency", March 2021) measured the 20 most popular phones: the average round-trip fell from 109 ms (range 36–258 ms) in 2017 to 39 ms (range 28–56 ms) in 2021, with audio input latency "typically 5ms". Pixel measured 18 ms round-trip on a 192-frame buffer. AAudio MMAP arrived in Android 8.1. These are fleet averages; per-device spread is large, so case 26 requires an in-app measurement.
- **MEMS microphones:** datasheet acoustic overload points span 120–135 dB SPL, and low-frequency roll-off (−3 dB) spans 10–60 Hz, typically 20–45 Hz (Knowles, TDK, Infineon, ST, ADI). Phones may add their own high-pass filtering.
- **iOS:** AVAudioSessionModeMeasurement minimises system-supplied signal processing. Developer reports say it disables a ~200 Hz high-pass filter and AGC on the built-in mic, and one Apple forum post measured 0.1 ms vs 58 ms reported input latency. Reported latency values may exclude converter delay, so measure loopback.
- **Bluetooth HFP microphones:** CVSD 8 kHz narrowband (mandatory), mSBC 16 kHz wideband (HFP 1.6+), LC3-SWB 32 kHz (HFP 1.9+). All are voice-processed. An 8 kHz route discards everything above 4 kHz, so **refuse BT-HFP input for detection.**
- **Real-time safety:** std::condition_variable::notify_one (and C++20 atomic notify) may make a system call with no real-time guarantees across platforms (Doumler). Do not call it from the audio callback. Use an SPSC ring plus atomic sequence counters polled by the DSP thread (e.g. every 2–5 ms), or a platform-specific wake mechanism verified per OS.

### 10. Combinatorial testing of the 26 cases

- For k binary factors, the minimum pairwise covering array is the smallest N with k ≤ C(N−1, ⌈N/2⌉). For k = 26, N = 8 (C(7,4) = 35 ≥ 26). Eight scenarios cover every pair of on/off conditions. For 1,000 binary factors only 19 tests are needed (NIST tables).
- Real factors are mixed-level (piano type 4 levels, distance 3, register 4, dynamic 3, tempo 3, pedal 2, route 3…). A strength-2 lower bound is the product of the two largest level counts (e.g. 4×4 = 16). Strength 3 is ≈ 4×4×3 = 48+. Generate with NIST ACTS or Microsoft PICT with constraints (e.g., "undamped register" excludes "staccato NoteOff" checks).
- NIST's Kuhn, Kacker & Lei (CrossTalk, June 2008) report that pairwise testing detects 70% to more than 90% of software faults; in NIST's NASA application, 93% of failures were triggered by 2-way combinations and 98% by 3-way, and every application studied reached 100% with 4- to 6-way interactions. **Recommendation:** strength-3 arrays over the ~12 most interacting factors, plus directed stress tests for known physical edge cases (A0–B♭0 alternation, C3/C4 octave under ff bass, trill at 12 notes/s near the C3 bridge break, pedal-down chord change).

## Details

### Audit of the 26 cases

| # | Case | A | B | C | Achievable? Governing limit / fix |
|---|---|---|---|---|---|
| 1 | Zero neighbour collision | ✗ | Partial | Partial | Not "zero" in clusters (§3, Neyman-Pearson); near-zero for single notes using frequency estimation |
| 2 | 5–100% intensity; 1–20 ms staccato to holds | Partial | Partial | Partial | Onset of a 1–20 ms key press is detectable (the hammer still strikes); exact NoteOff timing bounded by damper decay and window; softest notes at distance bounded by SNR |
| 3 | 15 cm–2.5 m+ | Partial | Partial (auto gain) | Partial | Free-field level drops 20·log10(2.5/0.15) = 24.4 dB; reverberation beyond critical distance; needs augmentation-trained model |
| 4 | Fast scales, trills, 6+/s repeats | Partial (comb notch) | Partial | ✓ (RETRIGGER) | CUSUM delay law (§4); 6/s = 167 ms spacing is ample |
| 5 | Chords any keys | ✗ | Partial (≤4/hop) | Partial (≤4/hop) | Peeling is greedy; error propagates; neural arbiter + NNLS |
| 6 | Streaming lifecycle, overlaps | Partial | ✓ | ✓ | — |
| 7 | Re-strike while ringing | ✗ | Partial | Partial | Needs per-key 2-slope decay model + onset flux/phase discontinuity |
| 8 | Grand/upright/spinet/digital | Partial | Partial | Partial | Calibrate B/tuning; piano-source augmentation was the largest robustness factor (−5.8 F1 if removed) |
| 9 | Calibration → bias profile | Partial | Partial | ✓ | Upgrade to Rigaud model |
| 10 | Octave ghosts; masking | Partial | Partial | Partial | Masked octave additions unidentifiable without priors (impossible to be perfect) |
| 11 | Missing fundamental A0–B1 | Partial | ✓ (gate) | ✓ (odd boost) | Fundamental may be ≥20 dB down (CDD/MEMS); needs partials up to h ≈ 14 for A0 neighbour discrimination |
| 12 | Echo vs damper drop; undamped treble | ✗ | Partial (wrong slope) | Partial | Undamped release unobservable; release relative to calibrated λ_nat(k) |
| 13 | Whistle/clap/cough/speech/thump | Partial | Partial | Partial | Heuristics brittle; speech augmentation worth +10 F1 under 10 dB speech noise |
| 14 | Pedal overflow, stuck keys | ✗ | Partial (10 voices) | Partial | Key-up under pedal unobservable; define NoteOff acoustically |
| 15 | Clipping guard | ✗ | Partial | ✓ | Also detect capsule overload (THD/flat-top), not only |x| ≥ 0.985 |
| 16 | C3 bridge break, stretch, soft/loud timbre | ✓ | Partial | ✓ | Rigaud's model includes the bass break |
| 17 | Live tuning drift | ✗ | ✗ | Partial (static) | Add Kalman tracking of cents offset from confident notes |
| 18 | OS stalls, DSP off JS thread | ✓ | ✓ | ✓ | Do not use notify_one in callback; handle lateHops by catch-up |
| 19 | Lesson vs free play | Partial | ✓ (mask) | Partial | Score-informed priors (93–99% evidence) |
| 20 | Block chords at t=0, no ping-pong | ✗ | Partial | Partial | Joint (not greedy) estimation per onset frame |
| 21 | 3-zone multi-rate Hann | ✗ (rect) | ✓ | ✓ | Add asymmetric low-delay windows and a progressive 8192 bass refinement |
| 22 | Distance-proof velocity | ✗ | Partial | Partial | Brightness is physically grounded (hammer nonlinearity); level must be distance-normalised per session |
| 23 | Fast 7/16-key calibration UX | Partial | ✗ | ✓ | Add wrong-key check by f0 estimate ±50 cents |
| 24 | Post-gain threshold alignment | ✗ | ✓ | Partial | — |
| 25 | Parseval/coherent-gain dB | ✗ | ✓ tones / ✗ noise | Partial | Use N²/8 for tones, 3N/8 for noise (§4) |
| 26 | Mic latency offset, CPU telemetry | Partial | ✗ | ✓ | Latency unknowable without per-device/route loopback measurement |

**No engine is ✓ on all 26.** Reevo's "passes all 26" claim is unsupported: on the evidence above it is at best partial on 16 of them.

### Recommended "ultimate" architecture (maths first, then implementation)

**Layer 0: Capture (keep the existing core, harden it).** Prefer Oboe/AAudio LowLatency + Exclusive (MMAP). Request UNPROCESSED only when the property is non-null; otherwise use VOICE_RECOGNITION. Verify the delivered sample rate, never assume 48 kHz, and resample to the internal rate if it differs. Subscribe to route changes; refuse Bluetooth HFP input; re-run latency and noise-floor calibration on each route change. iOS: measurement mode plus a loopback latency test.

**Layer 1: DSP front end (audio-adjacent thread, < 0.5 ms per hop).**
1. *Onset path (≤ 10 ms):* a per-sample exponentially weighted resonator bank (Resonate, François ICMC 2025 best paper; the open Rust implementation reports about 42 ns per sample for 88 bins on an Apple M2 Max). Tune it to calibrated partial frequencies f_h(k), with register-dependent time constants. Feed it to a log-compressed, adaptively whitened spectral-flux / complex-domain onset function with sub-hop peak interpolation for timing.
2. *Pitch path:* multi-resolution STFTs (1024/2048/4096, plus a progressive 8192 for A0–B1 after onset) with **asymmetric low-delay windows**, as Hu et al. (2025) showed is the best accuracy-latency trade. Estimate partial frequencies by phase-difference/reassignment, and score each key by a weighted frequency-residual + energy likelihood against the calibrated comb. This removes the §3 collision problem for single notes.
3. *Parametric fallback for clusters:* only when two adjacent keys are both candidates, run a small ESPRIT/matrix-pencil on the narrowband (decimated) partial region. It is affordable because it is rare and narrowband. It resolves below the Rayleigh limit at high SNR, but is fragile at low SNR, so it confirms only.

**Layer 2: Acoustic model, hybrid.**
- *DSP likelihoods:* a per-piano note dictionary (soft/loud spectral templates from calibration) solved by non-negative least squares per onset frame. This joint solve replaces greedy peeling and fixes case 20's ping-pong.
- *Neural arbiter:* a Mobile-AMT-class causal CNN+GRU, made strictly causal (no squeeze-excitation, binary targets, asymmetric window), pruned to about 1–3M parameters. Train with the full augmentation pipeline: Pianoteq/real pianos, RIR, device IR, noise, speech, clipping, ±10 cents. Run it on a background thread via Core ML / LiteRT / ONNX Runtime at a 10–20 ms hop. It outputs per-key onset/sustain/offset posteriors used to **confirm or veto** DSP NoteOns within about 64–100 ms. It has authority over octave ghosts, noise and sympathetic resonance, but never delays the first NoteOn.

**Layer 3: Decision and decoding.** For each key, run a Kwon-style 5-state HMM (off/onset/sustain/re-onset/offset). Transitions are driven by CUSUM statistics on the fused log-likelihood ratio, with thresholds set from the target false-alarm rate (§4 formula). Re-strike uses a per-key two-slope decay prediction fitted at calibration. Release requires slope < λ_nat(k) − Δ. Undamped keys (calibrated range, ~17–23 keys) end by energy floor or timeout. Pedal state is inferred from sympathetic-resonance broadening by the neural arbiter; NoteOff is defined acoustically when the pedal is down. Voice limit about 16, with steal-oldest-quietest plus an explicit NoteOff.

**Layer 4: Calibration.** Use the Rauhala PFD per anchor key to get (f0, B). Fit Rigaud's 2-parameter B model (+ bass break) and 4-parameter tuning/stretch model by robust least squares, interpolating all 88 keys. Use 7 anchors minimum and 16 for better fits. Capture the noise floor, per-key soft/loud templates, natural decay λ_nat(k) and undamped range, with a wrong-key check (estimated f0 within ±50 cents of the expected key). During sessions, Kalman-track a global cents offset (case 17).

**Layer 5: Lesson mode.** Run an online score follower (HMM/online DTW). Expected keys get a Bayesian prior that lowers their CUSUM threshold; unexpected keys get a raised threshold plus a mandatory neural confirmation. Report wrong notes only after confirmation. The app knows its own accompaniment, so subtract its known note templates (reference-informed masking) or use a linear adaptive filter with no nonlinear suppression. Avoid VoiceProcessingIO, whose AEC/AGC/noise suppression is designed for speech and alters piano timbre (developer reports). Better still, recommend headphones for accompaniment.

**Layer 6: Timing.** Timestamp = interpolated onset sample − measured input latency (loopback per device/route) − the front end's known group delay for that register. Publish timing bias per register in telemetry. Grade rhythm against bias-corrected times.

**DSP vs neural split:** DSP for everything on the latency-critical path (onset, pitch candidates, calibration, timing) because no published causal neural system is accurate under 30 ms. Neural for the decisions where data beats hand-tuned rules (polyphony arbitration, ghost notes, noise, rooms, pedal), because augmentation-trained models gained 14 F1 points on real-world recordings.

### Missing cases (not in the 26)

| Case | Status | Evidence / rationale |
|---|---|---|
| App's own audio (metronome, accompaniment) bleeding into mic | **Confirmed** | JoyTunes patent explicitly handles BGM in the captured composite sound |
| MIDI-connected digital pianos (USB/BLE) | **Confirmed** | Piano Maestro review: near-100% via MIDI; bypass audio entirely |
| Sample-rate mismatch (device ignores 48 kHz) | **Confirmed** | All bin/partial maths depends on fs; verify the delivered rate |
| Audio route changes (headset, BT, USB) | **Confirmed** | BT-HFP is 8/16/32 kHz and voice-processed; latency and response change per route |
| UNPROCESSED unsupported on device | **Confirmed** | CDD: property returns null; fallback source has different response |
| Glissandi | **Confirmed** | Onsets every ~10–30 ms violate per-key confirmation windows |
| Grace notes / ornaments | **Confirmed** | Sub-50 ms durations; lesson-mode scoring must allow them |
| Rolled/arpeggiated chords | **Confirmed** | Breaks the "block chord at t=0" assumption; score follower must accept spread |
| Sympathetic resonance (pedal and undamped strings) | **Confirmed** | Kawai: undamped treble strings ring sympathetically even without pedal → false NoteOns in top keys |
| Pedal mechanical noise | **Confirmed (no figures retrieved)** | Broadband transient; treat like thump |
| Speech/singing/counting aloud while playing | **Confirmed** | Speech augmentation worth +10.3 F1 under 10 dB speech noise |
| Out-of-tune unisons (beating) | **Confirmed** | Coupled-string detuning changes the decay envelope (Weinreich) → false re-strikes |
| Register-dependent timestamp bias | **Confirmed** | Window group delay differs by tier (10.7 ms vs 42.7 ms for symmetric windows) |
| Una corda (soft pedal) timbre shift | Likely | Changes the strings struck and the spectrum; templates may mismatch (no figures retrieved) |
| Digital piano speaker coloration / loudspeaker distortion | Likely | Digital pianos' sound passes through speakers; device-IR augmentation helps |
| Capsule acoustic overload before digital clipping | **Confirmed** | AOP 120–135 dB SPL vs ≈130 dB SPL full scale in UNPROCESSED |
| Thermal throttling / battery saver | Likely | Neural layer RTF 0.6 on one Pixel 6 core leaves little headroom on mid-range phones |
| Multiple instruments/students, TV/music in room | Likely | Background music is polyphonic and pitched; neural arbiter + lesson priors |
| Phone placement (on music stand vs on piano lid, vibration coupling) | Likely | Structure-borne coupling exaggerates bass and thump |
| Interrupted sessions (calls, Siri, permission revocation) | **Confirmed** (OS behaviour) | Must reset state machines cleanly |

### Evaluation metrics for a tutoring app

Report mir_eval note precision/recall/F1 at the standard 50 ms onset tolerance (offset: within the larger of 50 ms or 20% of the note's duration), and also at 10/20/30 ms, as Hu et al. argue 50 ms masks latency problems. Add product metrics: detection probability per register and dynamic; false alarms per hour of silence/noise/speech; NoteOn latency P50/P95/P99 per register; onset timing bias per register; and velocity error (MAE in MIDI units) per distance.

## Recommendations

1. **Adopt Reevo as the codebase base** and port in Apex v2's auto-gain threshold shift, dual templates, missing-fundamental gate and atomic expected-note mask. Retire Apex v1.
2. **Fix the provable bugs first:** B's release slope (×10 error), C's fixed 12 dB/s decay and absolute −30 dB/s release, and noise-floor normalisation (3N/8 for noise).
3. **Replace bin-energy key scoring with partial frequency estimation** (phase/reassignment) against calibrated inharmonic combs; extend bass analysis to h ≈ 15 and add progressive 8192-point refinement.
4. **Move calibration to Rigaud's parametric B/tuning model**, with Rauhala PFD per anchor and per-key two-slope decay fits.
5. **Add the causal neural arbiter** in phase 2. Record your own phone-mic dataset (≥ 3 piano types × 3 distances × 3 rooms × 5+ phones), as no public set matches the app's conditions; IDMT-PIANO-MM is the nearest.
6. **Ship a MIDI bypass** and a BT-HFP refusal now; they are cheap and remove whole failure classes.
7. **Test with strength-3 covering arrays** (ACTS/PICT) plus directed physical stress tests. Gate releases on per-register Pd, FA/hour and P95 latency, not on synthetic-tone accuracy.
8. **Rewrite the product promise:** "0 flaw" is impossible. Target concrete specs such as Pd ≥ 97% at mf within 1 m, ≤ 1 false NoteOn per 10 minutes in a quiet room, and treble NoteOn P95 ≤ 25 ms. These figures are proposals to validate, not measured results.

## Caveats

- Several metrics come from different MAESTRO versions and evaluation settings, and some latency claims are contested (Mobile-AMT's 174 ms vs ~10 s; Onsets & Velocities' online status). Yan & Duan 2024's exact scores were not retrieved.
- Commercial apps publish no accuracy data. Patent claims show intent, not performance.
- Piano-acoustics numbers for damper decay/engagement, phantom partials, una corda and sympathetic-resonance levels were not retrieved and must be measured in calibration. The undamped-key counts come partly from technician forums.
- The iOS measurement-mode behaviour and VoiceProcessingIO side effects are based on developer reports, not Apple specifications. Android latency figures are fleet averages from 2017–2021, and current devices vary.
- The CUSUM delay figures and proposed product specs are model-based estimates for design, not measurements of these engines.
- The engine descriptions were summarised for this research; the verdicts assume those summaries are accurate.
