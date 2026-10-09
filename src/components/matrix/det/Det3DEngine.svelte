<script>
	// P5.1: the 3D story's step machine — DOM level (mirrors DetEngine's
	// placement rationale: survives dead-canvas loads). F12 ships the
	// foundation: the det3d-st paragraph poll (the paragraphs themselves land
	// with P5.2's section markup — until then this engine idles at step 0),
	// the 2D→3D camera choreography, the story morphs, and the entrance
	// scalars. The try-it dock/rounds arrive in P5.2.
	import { onMount, onDestroy } from "svelte";
	import { browser } from "$app/environment";
	import { get } from "svelte/store";
	import { gsap, ScrollTrigger } from "$utils/gsap.js";
	import * as THREE from "three";
	// fire 63: transformedGridToggled was missing from this import — the calls
	// at the entry/exit/poll sites threw ReferenceError on every 3D entry
	// (cube invisible, walls never on, camera repairs dead). Svelte compiles
	// undeclared identifiers as runtime globals, so nothing flagged it.
	import {
		cameraControls,
		grid3dToggled,
		gridToggled,
		show3d,
		transformedGridToggled
	} from "$stores";
	import { detStep } from "$stores/det.js";
	import {
		det3dStep,
		det3Entries,
		det3Playhead,
		det3Game,
		end3Round,
		set3Guess,
		set3Target,
		skip3Det,
		det3TweenActive,
		det3ScrubTo,
		set3DetFx,
		det3Fx
	} from "$stores/det3.js";

	// the story's matrices — same arc as the 2D beats (F12: the scene renders
	// whatever the entries say; the engine owns pushing these per step)
	// fire 93: canonical in $stores/detPins.js (the pin scrubs read the same objects)
	import {
		STEP3_MATRIX,
		pinsLive as stationPinsLive3,
		inDetSpan3 as stationInSpan3,
		triggerCurrent3 as stationTriggerCurrent3,
		killDetPins,
		lastSpanEnd3,
		retryCreateDetPins,
		kill3DSpans,
		detPinsSpans3,
		pins3Live as pins3LiveRaw,
		assertDetReadingShift,
		assertDetReleased
	} from "$stores/detPins.js";

	let mounted = false;
	let destroyed = false;
	let pollIv = null;
	let pollIvBackup = null;
	let engine3StoryReveal = 0;
	let engine3EdgeDrawT = 1;
	let engine3StepInT = 1;
	let engine3ImgT = 0;
	let camTl = null;
	// fire 50: wall-clock anchor for the poll's fx fallback (the 2D
	// repairState pattern) — a starved or killed entry window must never
	// leave the cube/labels invisible
	let engine3EnteredAt = 0;
	let edgeDrawTween3 = null;

	// fire 50 (user: "when we go 3d … text is all gone, its very messed up"):
	// the entry cinematic set edgeDrawT = 0 at 0.9s and NOTHING advanced it —
	// every scroll-driven 3D entry rendered the cube with drawRange 0 (no
	// edge lines at all; QA only ever saw the instant DEV-hook path). The
	// draw-on tween closes it, mirroring the 2D startEdgeDraw.
	function start3EdgeDraw() {
		if (edgeDrawTween3) edgeDrawTween3.kill();
		engine3EdgeDrawT = 0;
		const proxy = { v: 0 };
		edgeDrawTween3 = gsap.to(proxy, {
			v: 1,
			duration: 0.9,
			ease: "power2.inOut",
			onUpdate() {
				engine3EdgeDrawT = proxy.v;
				sync3Fx();
			}
		});
	}

	function sync3Fx() {
		set3DetFx({
			storyReveal: engine3StoryReveal,
			edgeDrawT: engine3EdgeDrawT,
			stepInT: engine3StepInT,
			imgT: engine3ImgT
		});
	}

	function killCamTl() {
		if (camTl) {
			camTl.kill();
			camTl = null;
		}
	}

	// house 3D pose (hard rule): polar π·0.35, azimuth π·0.3, d 15
	function assert3DCamera(cc) {
		cc.rotateTo(Math.PI * 0.3, Math.PI * 0.35, false);
		// fire 42 (user: the cube is tiny in a huge canvas): dolly in
		cc.dollyTo(10.5, false);
		if (typeof cc.setTarget === "function") cc.setTarget(0, 0, 0, false);
		if (typeof cc.setFocalOffset === "function") cc.setFocalOffset(0, 0, 0, false);
		if (typeof cc.update === "function") cc.update(0);
		if (cc.camera && cc.camera.updateMatrixWorld) cc.camera.updateMatrixWorld();
	}

	function apply3Step(n, instant = false) {
		const prev = get(det3dStep);
		if (prev === n) return;
		det3dStep.set(n);
		if (prev === 0 && n >= 1) {
			// entering the 3D story: swap the plane for the volume — camera
			// glides to the house pose while the 2D grid fades out and the 3D
			// grid fades in (store-flip fades, house pattern), then the cube
			// reveals. `instant` (DEV/QA path) settles everything synchronously.
			// P5.2: show3d true enables right-drag ORBIT for the whole story
			show3d.set(true);
			if (get(det3Game).status !== "idle") end3Round();
			const cc = get(cameraControls);
			if (cc && !instant) {
				killCamTl();
				camTl = gsap.timeline();
				camTl.to(
					cc,
					{
						azimuthAngle: Math.PI * 0.3,
						polarAngle: Math.PI * 0.35,
						distance: 10.5,
						duration: 1.2,
						ease: "power2.inOut"
					},
					0
				);
				// fire 22 QA: the original's scrubbed timeline re-renders its end
				// pose for ~1s after any scroll (much longer under a limping
				// ticker), stomping this glide's writes back to the top-down
				// pose — snap the finished glide to the house pose so the 3D
				// story never sits on the wrong camera
				camTl.call(() => {
					if (get(det3dStep) >= 1) assert3DCamera(cc);
				}, null, 1.25);
				camTl.call(() => gridToggled.set(false), null, 0.2);
				// fire 42: the bright transformed grid STAYS as the cube floor
				// (identity-pinned for detStep >= 1) instead of fading out
				camTl.call(() => transformedGridToggled.set(true), null, 0.2);
				camTl.call(() => grid3dToggled.set(true), null, 0.55);
				camTl.call(
					() => {
						engine3StoryReveal = 1;
						engine3StepInT = 1;
						start3EdgeDraw();
						sync3Fx();
					},
					null,
					0.9
				);
				// the cinematic is in flight — arm the poll's fx fallback clock
				engine3EnteredAt = Date.now();
			} else {
				// camera not ready (or instant): settle without the cinematic.
				// fire 63: arm the heal clock FIRST so a throw mid-block (the
				// missing-import class of bug) still gets recovered by the
				// 3s poll heal instead of stranding a half-settled entry
				engine3EnteredAt = Date.now();
				if (cc) assert3DCamera(cc);
				gridToggled.set(false);
				transformedGridToggled.set(true);
				grid3dToggled.set(true);
				engine3StoryReveal = 1;
				engine3StepInT = 1;
				engine3EdgeDrawT = 1;
				sync3Fx();
			}
		}
		// fire 43: mid-story step changes (1-to-2, 2-to-3, ...) carry no camera
	// work, so a scrub stomp that landed during the previous beat PERSISTS —
	// each new beat re-frames: if the pose is far from the house pose, glide
	// home over 0.6s. A user orbit within a step is untouched; only the step
	// CHANGE re-frames. prev >= 1 keeps the 0-to-n entry cinematic in charge.
	if (n >= 2 && n <= 5 && prev >= 1) {
		const cc = get(cameraControls);
		if (cc) {
			let azDiff = Math.abs(((cc.azimuthAngle - Math.PI * 0.3) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
			if (Math.abs(cc.polarAngle - Math.PI * 0.35) > 0.35 || azDiff > 0.5 || Math.abs(cc.distance - 10.5) > 3) {
				killCamTl();
				camTl = gsap.timeline();
				camTl.to(cc, {
					azimuthAngle: Math.PI * 0.3,
					polarAngle: Math.PI * 0.35,
					distance: 10.5,
					duration: 0.6,
					ease: "power2.inOut",
					overwrite: "auto"
				});
			}
		}
	}
	if (n === 0) {
			// exiting back above the 3D section: restore the 2D world
			killCamTl();
			show3d.set(false);
			if (get(det3Game).status !== "idle") end3Round();
			const cc = get(cameraControls);
			// fire 73 (H1): at the footer hand-off the 2D engine's own exit owns
			// the camera restore (savedCamera) — a second glide here would fight
			// it for the whole tween. The top-down return is only for the
			// 3D→2D boundary, where the det story is still live (detStep >= 1).
			if (cc && get(detStep) >= 1) {
				gsap.to(cc, {
					azimuthAngle: 0,
					polarAngle: 0.06,
					// fire 101: the 2D-return pose matches the story pose (10) —
					// the grid fills the frame
					distance: 10,
					duration: 0.9,
					ease: "power2.inOut",
					overwrite: "auto",
					// fire 22 QA: same scrub-stomp guard as the entry glide — pin
					// the finished return to the 2D pose if the 3D story is gone
					onComplete: () => {
						// fire 76 (H4c): only pin the 2D pose while the det region
						// is still on/near screen — a user who already scrolled up
						// into section-2's 3D world must not get snapped top-down
						// (the "zooming back up glitches the focus view" report)
						const detSec0 = document.getElementById("section-det");
						const det3Sec0 = document.getElementById("section-det3d");
						const vh0 = window.innerHeight;
						const inDetRegion =
							(detSec0 && detSec0.getBoundingClientRect().top < vh0) ||
							(det3Sec0 && det3Sec0.getBoundingClientRect().top < vh0);
						if (get(det3dStep) === 0 && inDetRegion) {
							cc.rotateTo(0, 0.06, false);
							cc.dollyTo(10, false);
						}
					}
				});
			}
			// fire 50: return to the 2D story's BRIGHT-GRID-ONLY state (the old
			// gridToggled=true stacked the dim grid coplanar under the bright
			// one — the same patchy double-render class as the 2D entry)
			grid3dToggled.set(false);
			transformedGridToggled.set(true);
			gridToggled.set(false);
			if (edgeDrawTween3) {
				edgeDrawTween3.kill();
				edgeDrawTween3 = null;
			}
			engine3EnteredAt = 0;
			engine3StoryReveal = 0;
			engine3ImgT = 0;
			sync3Fx();
			return;
		}
		if (n >= 2 && STEP3_MATRIX[n]) {
			// the beat's morph plays (healthy browsers); starved tickers heal
			// via healStepEntries below.
			// fire 92: entering a span must NOT snap the morph to its end —
			// the span's scrub tween plays it with the scroll (scrub: 1)
			if (!inDetSpan3()) set3Target(STEP3_MATRIX[n], { duration: 0.9 });
		}
		if (n >= 4) {
			engine3ImgT = 1;
		} else {
			engine3ImgT = 0;
		}
		sync3Fx();
	}

	// starved-ticker self-heal (the F9/F11 pattern): when no morph is in
	// flight and the entries don't match this step's matrix, snap them. A
	// fully-dead ticker leaves the morph tween "active" but frozen — detected
	// via a playhead that hasn't moved across consecutive polls — and such a
	// zombie is snapped too (healthy browsers: the playhead advances every
	// poll, so the tween is never touched mid-flight).
	let lastHealed3Step = -1;
	let lastSeen3Playhead = -1;
	let zombie3Polls = 0;
	function healStep3Entries(step) {
		if (step < 1 || step > 5 || !STEP3_MATRIX[step]) return;
		if (inDetSpan3()) return; // fire 81 (I5b): the span's scrub owns the entries
		if (det3TweenActive()) {
			const ph = get(det3Playhead);
			zombie3Polls = Math.abs(ph - lastSeen3Playhead) < 1e-6 ? zombie3Polls + 1 : 0;
			lastSeen3Playhead = ph;
			if (zombie3Polls < 4) return; // genuinely playing — hands off
		} else {
			zombie3Polls = 0;
			lastSeen3Playhead = -1;
		}
		if (lastHealed3Step === step) return;
		const t = STEP3_MATRIX[step];
		const e = get(det3Entries);
		const off = t.some((v, i) => Math.abs(e[i] - v) > 0.02);
		if (!off) {
			lastHealed3Step = step;
			return;
		}
		lastHealed3Step = step;
		set3Target(STEP3_MATRIX[step]);
		skip3Det();
		sync3Fx();
	}

	// fire 37: consecutive-read counters for the pose repairs (isTweening is
	// permanently true while the scrub tween targets cc — see det3Update)
	let topDownPolls = 0;
	let orphan3DPolls = 0;
	// fire 81 (I5 fallback): the scroll velocity state (see det3Update)
	let lastVelY3 = null;
	let lastVelT3 = 0;
	let scrollVelocity3 = 0;

	// fire 81 (I5b): the 3D story's per-station pin+scrub spans (the 2D
	// engine's twin) — fire 84 (P3): RE-ENABLED behind the same settle gate
	// + self-healing guard as the 2D side (see DetEngine's note).
	// fire 93: the pin machinery lives in $stores/detPins.js (created in
	// Arcade's animate() batch — the only timing this page survives). Thin
	// local aliases keep every gate below unchanged.
	function pinsLive3() {
		// fire 104 (F5): per-family — a disconnected 3D span set falls back to
		// the rect machine while the 2D pins stay live
		return pins3LiveRaw();
	}
	function inDetSpan3() {
		return stationInSpan3();
	}
	function triggerCurrent3() {
		return stationTriggerCurrent3();
	}
	// fire 104 (F5): the span windows for the disconnect watchdog
	function stationTriggerCurrent3Spans() {
		return detPinsSpans3();
	}
	let stale3Polls = 0;
	function killStationPins3() {
		killDetPins();
	}
	function det3Update() {
		if (!mounted || destroyed) return;
		if (!window.innerWidth || window.innerWidth < 1024) {
			// fire 92 (P1.7): the below-lg clear tears the pins down too —
			// the settle gate re-arms on the return to desktop
			killStationPins3();
			return;
		}
		// fire 81 (I5 fallback): the scroll velocity — fast scrolling
		// fast-forwards the cube's entrance scalars (the 2D twin)
		const nowT = Date.now();
		if (lastVelY3 !== null) {
			scrollVelocity3 = ((window.scrollY - lastVelY3) / Math.max(1, nowT - lastVelT3)) * 1000;
		}
		lastVelY3 = window.scrollY;
		lastVelT3 = nowT;
		if (Math.abs(scrollVelocity3) > 2600 && get(det3dStep) >= 1 && get(det3dStep) <= 5) {
			if (engine3StepInT < 1 || engine3EdgeDrawT < 1) {
				if (edgeDrawTween3) edgeDrawTween3.kill();
				engine3StepInT = 1;
				engine3EdgeDrawT = 1;
				sync3Fx();
			}
		}
		// fire 101: the pin retry (the 2D twin) — re-attempt deferred creation
		try {
			retryCreateDetPins();
		} catch (e) {}
		// fire 105b (the fast-scroll leftover, the 2D twin): a jump past the
		// release leaves gsap's cached y — or the whole fixed-pin inline
		// state — on the column; un-stick, then zero y
		try {
			if (stationPinsLive3()) {
				assertDetReleased();
				assertDetReadingShift();
			}
		} catch (e) {}
		// no section markup yet (it lands with P5.2): the poll owns no scroll
		// mapping (forcing step 0 would fight the DEV hook), but the current
		// step's morph still self-heals — the zombie-ticker snap below is what
		// makes markup-less DEV/QA verification deterministic
		if (!document.getElementById("det3d-st-1")) {
			healStep3Entries(get(det3dStep));
			return;
		}
		const center = window.innerHeight / 2;
		// fire 20 full-QA guard: mid-calibration loads momentarily report
		// impossible det3d rects (measured: st-1 at abs 44710 on a 44410-tall
		// document). Acting on them engages the 3D story and reverts it within
		// a poll, stranding the camera mid-glide between the 2D and 3D poses —
		// sanity-check the run and HOLD the current step while rects are garbage
		const docH = document.documentElement.scrollHeight;
		const tops = [];
		for (let n = 1; n <= 6; n++) {
			const el = document.getElementById(`det3d-st-${n}`);
			if (!el) continue;
			const abs = el.getBoundingClientRect().top + window.scrollY;
			tops.push(abs < -50 || abs > docH + 50 ? NaN : abs);
		}
		const anchorOk = (() => {
			// fire 82 (adv-1 finding): a coherent-but-STALE parked family (burst
			// scrolling freezes the rects at early positions) passed the
			// monotonic sanity and drove det3dStep 6 from the lie — the 3D dock
			// mounted ~1000px above the real try-it, shadowing the 2D game.
			// fire 84 (P1, USER-REPORTED regression): the original absolute
			// window [3800, 7000] overfit two calibration samples — a legitimate
			// load measured 1516 (the det3d stations sit deeper relative to the
			// footer there) and was rejected, holding det3dStep 0 forever: the
			// user could never reach the 3D section. The ROBUST anchor is
			// footer-RELATIVE: the det3d try-it must sit ABOVE the footer by at
			// least the tail runway (~200px+) and not absurdly deep (<8000).
			// Accepts 1516 / 5030 / 5349; still rejects the parked lie (the
			// family frozen BELOW the footer).
			const s6 = document.getElementById("det3d-st-6");
			const f = document.querySelector("footer");
			if (!s6 || !f) return true;
			const s6abs = s6.getBoundingClientRect().top + window.scrollY;
			const ftp = f.getBoundingClientRect().top + window.scrollY;
			return s6abs < ftp - 200 && s6abs > ftp - 8000;
		})();
		const rectsSane =
			anchorOk &&
			tops.length >= 3 &&
			tops.every((v, i) => Number.isFinite(v) && (i === 0 || v >= tops[i - 1] - 50));
		let current;
		// fire 92 (the re-anchor): with the pins live the station triggers are
		// the story state — the pre-flight/rect rule below reads pin-shifted
		// rects (expected under pins, not lies, but meaningless as step input)
		if (pinsLive3()) {
			// fire 104 (F5): the disconnect watchdog — measured live: the 3D
			// triggers can go stale (progress frozen at 0 with the scroll INSIDE
			// their windows; the 2D family unaffected). 4 consecutive stale polls
			// deep inside span3[0] -> kill the 3D spans; the rect machine and its
			// footer-anchored band take the 3D story back.
			const sp3 = detPinsSpans3();
			if (sp3.length && window.scrollY > sp3[0].start + 400 && sp3.every((x) => !x.active && x.progress === 0)) {
				stale3Polls++;
			} else {
				stale3Polls = 0;
			}
			if (stale3Polls >= 4) {
				console.error("[det3] the 3D station triggers are disconnected (progress frozen inside their windows) — reverting the 3D story to the rect machine");
				kill3DSpans();
				stale3Polls = 0;
			}
			current = triggerCurrent3();
			// fire 92: the try-it runway — the same footer-anchored engagement
			// the rect mode's st-6 rule provided (triggerCurrent caps at 5, and
			// the band/yield blocks below all assume current === 0)
			// fire 100 iterate: the last span's end (the frozen-hold-rect artifact
			// applies here too — see DetEngine's note)
			const lastEnd3 = lastSpanEnd3();
			if (lastEnd3 !== null) {
				if (window.scrollY >= lastEnd3 + 100) current = 6;
			} else {
				const footerElT = document.querySelector("footer");
				if (footerElT) {
					const ftT = footerElT.getBoundingClientRect().top + window.scrollY;
					if (window.innerHeight + window.scrollY >= ftT - 40) current = 6;
				}
			}
		} else if (rectsSane) {
			current = 0;
			for (let n = 1; n <= 6; n++) {
				const el = document.getElementById(`det3d-st-${n}`);
				if (!el) continue;
				if (el.getBoundingClientRect().top <= center) current = n;
			}
		} else {
			current = get(det3dStep); // hold — never revert from garbage rects
		}
		// exploded-pin loads freeze the det3d paragraphs' rects (the 2D G-B
		// pattern): anchor a footer-adjacent band so the 3D story + try-it
		// stay reachable — the same rescue DetEngine ships for the 2D family.
		// Gated on the 2D story having reached its try-it (detStep 6): the 2D
		// band starts HIGHER than this one, so ungated the two bands overlap
		// on exploded loads and the stories would fight over the camera
		if (current === 0 && get(detStep) === 6) {
			const footerEl = document.querySelector("footer");
			if (footerEl) {
				const footerTop = footerEl.getBoundingClientRect().top + window.scrollY;
				// fire 55 (the fire-51 residual, live-confirmed in fire 53): the
				// old tryItAt (footerTop - 40) EQUALLED the 2D rule's step-6
				// threshold, and the fraction branch then mapped the band to
				// steps 1-5 INSIDE the detStep-6 zone - the 3D story/dock
				// shadowed the 2D try-it overlay (game + guide + spotlight)
				// for the whole bottom of band-driven loads. Now the 3D try-it
				// engages 0.35 viewport-heights deeper and the band otherwise
				// YIELDS (current stays 0), so the 2D overlay owns its window
				// and re-owns it when scrolling back up from the 3D try-it.
				// Healthy loads are untouched - the band only runs when the
				// primary rect rule finds nothing, and on healthy loads the
				// 2D try-it sits far above this band.
				// fire 67 (FIX-E): the threshold could sit past the document's
				// own end (footer + tail shorter than 0.35vh leaves tryItAt
				// beyond max scroll) — det3dStep 6 was physically unreachable
				// on those loads and the dock never mounted
				const tryItAt = Math.min(
					footerTop + window.innerHeight * 0.35,
					document.documentElement.scrollHeight - 80
				);
				if (window.innerHeight + window.scrollY >= tryItAt) {
					current = 6;
				}
				// else: stay 0 - the 2D try-it overlay owns the window
			}
		}
		// fire 55/56/59: the 2D try-it zone rule. When detStep 6 is live and
		// bottomNow sits in the 2D try-it's footer-anchored band
		// [ft-40, ft+0.35vh), the 3D yields to 0 (the 2D overlay owns) —
		// UNLESS the 3D try-it's OWN text is on screen (|det3d-st-6 top| <
		// vh): on collapsed-pin calibrations the compressed geometry puts the
		// det3d-st-6 paragraph inside that band, and then the 3D dock is the
		// overlay matching the visible text. Healthy loads: the band sits
		// past the det3d-st-6 text (|top| just under vh at its start), so the
		// yield fires only in the true dead band and the deep threshold
		// re-engages 6 immediately after - no flapping; inside the live 3D
		// story the band is never reached (det3d-st-6 still below).
		const det3St6El = document.getElementById("det3d-st-6");
		const footerEl0 = document.querySelector("footer");
		if (footerEl0 && get(detStep) === 6) {
			const ft0 = footerEl0.getBoundingClientRect().top + window.scrollY;
			const bn0 = window.innerHeight + window.scrollY;
			const st6top = det3St6El ? det3St6El.getBoundingClientRect().top : 0;
			// fire 67 (FIX-E): the yield zone must END exactly where the
			// clamped 3D-try-it engagement begins — the band's threshold moved
			// earlier (the docH clamp), so an unclamped upper bound let the
			// yield revert the engagement inside the overlap
			const try3At = Math.min(
				ft0 + window.innerHeight * 0.35,
				document.documentElement.scrollHeight - 80
			);
			const inZone = bn0 >= ft0 - 40 && bn0 < try3At;
			if (inZone && Math.abs(st6top) > window.innerHeight) {
				current = 0;
				// fire 62/63 residual: the yielded window showed the 3D walls as
				// diagonal streaks — force the 2D bright-grid state HERE, not
				// just via apply3Step(0), so no flapping path can leave g3 true
				// over the 2D try-it
				grid3dToggled.set(false);
				transformedGridToggled.set(true);
				gridToggled.set(false);
			} else if (bn0 >= try3At) {
				current = 6;
			}
		}
		// fire 73 (H1): the footer-cover hand-off — the 2D engine's issue-05
		// exit (DetEngine's footerTop + 0.55vh rule) had no 3D twin, so
		// det3dStep held 6 at the footer and the dock + guide + arrow floated
		// over the page footer (user screenshot). This runs AFTER the band and
		// yield blocks and independent of the detStep gate: at the footer
		// detStep is already 0, which is exactly what disarms the yield and
		// let the band re-engage 6 down here.
		const footerElH = document.querySelector("footer");
		if (footerElH) {
			const ftH = footerElH.getBoundingClientRect().top + window.scrollY;
			// fire 91 (adv-10 finding): on collapsed calibrations the +0.55vh
			// threshold can sit past max scroll — the absolute bottom is always
			// the clean-footer zone (the 2D engine's clamp, 3D twin)
			if (
				window.innerHeight + window.scrollY > ftH + window.innerHeight * 0.55 ||
				window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
			) {
				current = 0;
			}
		}
		// fire 84 (P3): the active-station glow on the 3D story text (the 2D
		// engine's twin — the Section component's .active gradient marks the
		// paragraph being played, the "jumps to the next piece" marker)
		// fire 92: with the pins live the triggers' toggleClass owns the glow
		if (!pinsLive3()) {
			for (let n = 1; n <= 6; n++) {
				const el = document.getElementById(`det3d-st-${n}`);
				if (el) el.classList.toggle("active", n === current);
			}
		}
		if (get(det3dStep) !== current) apply3Step(current);
		healStep3Entries(Math.min(current, 5));
		// fire 64 (FIX-B, PLAN-FIRE63): the 3D story text rescue — try-isolated
		// like the other sub-steps
		try {
			reveal3dPassedSteps(center);
		} catch (e) {}
		// fire 63: each poll sub-step is try-isolated — the fire-62 root bug
		// (one throw silently killed every repair after it) stays impossible
		try {
			poll3SettleGuard();
		} catch (e) {}
		try {
			poll3CameraRepairs();
		} catch (e) {}
	}

	// fire 64 (FIX-B, PLAN-FIRE63): the 3D twin of DetEngine's
	// revealPassedSteps. The original attaches a paused gsap.from({opacity: 0,
	// y: 20}) entrance to every child of every #article section.animate —
	// including #section-det3d — and on drifted/parked loads its
	// ScrollTrigger never lines up, leaving the 3D story text invisible.
	// Mirror the 2D rescue (viewport-rect test), plus a step-based fallback:
	// on parked loads the det3d rects LIE (they park far below the viewport
	// while the text is what the band-driven step machine is driving), so
	// the engine's own step is the reliable "user is past this station"
	// signal there.
	function reveal3dPassedSteps(center) {
		const section = document.getElementById("section-det3d");
		if (!section) return;
		const revealed = [];
		for (const child of section.children) {
			if (child.getBoundingClientRect().top <= center + 80) revealed.push(child);
		}
		const step = get(det3dStep);
		if (step >= 1) {
			for (let n = 1; n <= Math.min(step, 6); n++) {
				const el = document.getElementById(`det3d-st-${n}`);
				if (el && !revealed.includes(el)) revealed.push(el);
			}
		}
		// fire 64: parked-rect loads freeze the section's rects far below the
		// viewport (live-confirmed this fire: scroll moves, rect tops do not,
		// and both engines compute step 0 there), so NEITHER test above can
		// ever fire. Drive the reveal by the footer-anchored fraction — the
		// one signal the scroll bands proved sane on every calibration
		// variant. The det3d section + its try-it tail occupy the last
		// ~quarter of the document; f > 0 means the region is at hand. Pacing
		// is deliberately coarse (all blocks at once): on these loads the
		// alternative is invisible story text, and off-screen blocks simply
		// scroll into view already visible.
		const footerEl = document.querySelector("footer");
		if (footerEl) {
			const footerTop = footerEl.getBoundingClientRect().top + window.scrollY;
			const span = Math.max(8000, Math.min(14000, footerTop * 0.25));
			const f = (window.innerHeight + window.scrollY - (footerTop - span)) / span;
			if (f > 0) {
				for (const child of section.children) {
					if (!revealed.includes(child)) revealed.push(child);
				}
				const st6 = document.getElementById("det3d-st-6");
				if (st6 && !revealed.includes(st6)) revealed.push(st6);
			}
		}
		if (!revealed.length) return;
		// fire 64: the entrance tweens are OWNED by ScrollTriggers
		// (ScrollTrigger.create({trigger: el, animation, ...})) — on every
		// refresh ScrollTrigger forces a never-entered trigger's animation
		// back to progress 0, re-applying opacity 0 (live-confirmed: the
		// station blocks' triggers never enter because their rects are the
		// frozen ones, and parked loads refresh constantly). Killing the
		// tweens is not enough — kill the owning triggers, then clear.
		for (const el of revealed) {
			for (const st of ScrollTrigger.getAll()) {
				if (st && st.trigger === el) st.kill();
			}
		}
		gsap.killTweensOf(revealed);
		gsap.set(revealed, { clearProps: "opacity,transform" });
		for (const child of revealed) {
			const lis = child.querySelectorAll("li");
			if (lis.length) {
				gsap.killTweensOf(lis);
				gsap.set(lis, { clearProps: "opacity,transform" });
			}
		}
	}

	// fire 50/52: persistent fx + grid guard (the 2D repairState pattern).
	// The old fallback was ONE-SHOT — a narrative-trigger stomp landing
	// after it (the original's section triggers re-fire on refresh) left
	// the bright floor flipped off with nothing to re-assert it. While
	// the 3D story owns the world, every poll re-asserts the settled
	// state; all writes are idempotent and the fade tweens only fire on
	// actual changes, so a healthy entry (settled by 3s) is untouched.
	function poll3SettleGuard() {
		if (!mounted || destroyed) return;
		// fire 68 (FIX-F): unconditional world assert — while the 3D story or
		// its try-it owns the canvas, the world must be the walls+floor state
		// no matter how the entry ran (a starved cinematic, a throttled
		// window, a mid-entry throw). The writes are idempotent (the stores
		// dedupe), so a healthy world costs nothing; the 2D-yield window
		// self-disables this guard (the yield forces det3dStep 0 — exactly
		// where g3 must be allowed false).
		if (get(det3dStep) >= 1) {
			if (get(gridToggled) !== false) gridToggled.set(false);
			if (get(transformedGridToggled) !== true) transformedGridToggled.set(true);
			if (get(grid3dToggled) !== true) grid3dToggled.set(true);
		}
		if (
			get(det3dStep) >= 1 &&
			engine3EnteredAt &&
			(Date.now() - engine3EnteredAt > 3000 || Math.abs(scrollVelocity3) > 2600)
		) {
			if (edgeDrawTween3 && engine3EdgeDrawT >= 1) {
				edgeDrawTween3.kill();
				edgeDrawTween3 = null;
			}
			if (engine3StoryReveal < 1 || engine3StepInT < 1 || engine3EdgeDrawT < 1) {
				engine3StoryReveal = 1;
				engine3StepInT = 1;
				engine3EdgeDrawT = 1;
				engine3ImgT = get(det3dStep) >= 4 ? 1 : 0;
				sync3Fx();
			}
		}
	}

	function poll3CameraRepairs() {
		if (!mounted || destroyed) return;
		// fire 23 QA: a crossing flap can leave the camera ON the 3D house pose
		// while the state is back in the 2D world (entry-assert vs exit-tween
		// race). The 2D sandbox cannot rotate (right-drag is NONE when show3d
		// is false), so a 3D-pose reading there is always an orphan. fire 37:
		// same consecutive-read treatment — isTweening is permanently true
		// (the scrub tween targets cc), so 4 consecutive orphaned polls force
		// the snap home.
		if (get(det3dStep) === 0 && get(detStep) >= 1) {
			const cc = get(cameraControls);
			if (
				cc &&
				Math.abs(cc.polarAngle - Math.PI * 0.35) < 0.3 &&
				Math.abs(cc.azimuthAngle - Math.PI * 0.3) < 0.3
			) {
				orphan3DPolls++;
				if (orphan3DPolls >= 4) {
					cc.rotateTo(0, 0.06, false);
					cc.dollyTo(10, false);
					if (typeof cc.setTarget === "function") cc.setTarget(0, 0, 0, false);
					if (typeof cc.update === "function") cc.update(0);
					orphan3DPolls = 0;
				}
			} else {
				orphan3DPolls = 0;
			}
		}
		// fire 37 QA (user-reported: the whole 3D chapter rendered top-down):
		// the old isTweening-gated repairs NEVER fired — the original's scrubbed
		// timeline targets the camera controls for the page's lifetime, so
		// gsap.isTweening(cc) is permanently true and the scrub re-renders its
		// top-down end pose after every scroll, stomping the entry glide.
		// Replacement: a consecutive-read assert — when the 3D story is live
		// and the camera reads near top-down across 4 consecutive polls
		// (~1.2s), force the house pose regardless of tween state. A user
		// orbit never sits within 0.3 of exact top-down for 4 polls, and the
		// assert stops once the pose is correct (the scrub has no new renders
		// without new scrolls, so the assert wins the last write).
		if (get(det3dStep) >= 1) {
			const cc = get(cameraControls);
			if (cc && cc.polarAngle < 0.3 && Math.abs(cc.azimuthAngle) < 0.3) {
				topDownPolls++;
				if (topDownPolls >= 4) {
					assert3DCamera(cc);
					topDownPolls = 0;
				}
			} else {
				topDownPolls = 0;
			}
		} else {
			topDownPolls = 0;
		}
	}

	// P5.2 guessing: while a round asks, a canvas click raycasts onto the floor
	// (the z = 0 plane) and sets the guess's (x, y) — the height comes from the
	// dock's slider, the ghost previews the full point, the dock confirms.
	const raycaster3 = new THREE.Raycaster();
	const floorPlane3 = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
	const ndc3 = new THREE.Vector2();
	const floorHit3 = new THREE.Vector3();
	function onCanvas3PointerDown(e) {
		if (destroyed || !mounted) return;
		const g = get(det3Game);
		if (g.status !== "asking" || !g.round) return;
		const cam = get(cameraControls);
		if (!cam || !cam.camera) return;
		const wrapper = document.getElementById("canvas-wrapper");
		if (!wrapper) return;
		const r = wrapper.getBoundingClientRect();
		if (
			e.clientX < r.left || e.clientX > r.right ||
			e.clientY < r.top || e.clientY > r.bottom
		) {
			return;
		}
		ndc3.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
		raycaster3.setFromCamera(ndc3, cam.camera);
		if (!raycaster3.ray.intersectPlane(floorPlane3, floorHit3)) return;
		const snap = (v) => Math.round(v * 2) / 2;
		set3Guess({ x: snap(floorHit3.x), y: snap(floorHit3.y) });
	}

	// lifecycle registered at INIT — nesting onDestroy inside onMount throws
	// "Function called outside component initialization" (it fired as an
	// unhandled rejection and aborted the flush pass behind it, which was
	// fatal to the page's pin calibration: docH collapsed 39122 → 19906)
	onDestroy(() => {
		// SSR runs onDestroy callbacks at render end — bail on the server
		if (!browser) return;
		destroyed = true;
		if (pollIv) clearInterval(pollIv);
		if (pollIvBackup) clearInterval(pollIvBackup);
		window.removeEventListener("resize", det3Update);
		document.getElementById("canvas-wrapper")?.removeEventListener("pointerdown", onCanvas3PointerDown);
		killCamTl();
		if (import.meta.env.DEV) delete window.__det3dev;
	});

	onMount(() => {
		mounted = true;
		pollIv = setInterval(() => {
			try {
				det3Update();
			} catch (err) {
				console.error("[det3] poll threw:", err);
			}
		}, 300);
		// fire 62: a BACKUP poll (the 2D engine's twin) — the intermittent
		// instance-death class killed single det3 polls mid-session (the
		// frozen d3 states); det3Update is idempotent and both polls are
		// try-guarded, so a survivor keeps the 3D machine alive
		pollIvBackup = setInterval(() => {
			try {
				det3Update();
			} catch (err) { /* the primary logs the first */ }
		}, 733);
		det3Update();
		window.addEventListener("resize", det3Update);
		// P5.2: floor-click guessing — delegated on #canvas-wrapper (the same
		// reason as the 2D game's delegation: the canvas races Threlte init)
		document.getElementById("canvas-wrapper")?.addEventListener("pointerdown", onCanvas3PointerDown);
		// DEV-only test hook: deterministic 3D verification (and QA fires)
		// without the section markup; stripped from production builds
		if (import.meta.env.DEV) {
			window.__det3dev = {
				setStep: (n, instant = false) => apply3Step(n, instant),
				setTarget: (m) => set3Target(m, { duration: 0.9 }),
				skip: () => skip3Det(),
				// fire 50: fx readout for QA — the cube/label entrance scalars
				// (the edgeDrawT starvation hole was invisible to every probe)
				fx: () => ({
					storyReveal: engine3StoryReveal,
					edgeDrawT: engine3EdgeDrawT,
					stepInT: engine3StepInT,
					imgT: engine3ImgT,
					enteredAt: engine3EnteredAt
				})
			};
		}
	});
</script>

<!-- logic-only: visuals live in Det3DScene (inside the canvas) -->
