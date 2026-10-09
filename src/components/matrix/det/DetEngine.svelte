<script>
	// The determinant section's step engine, mounted at DOM level (Index.svelte)
	// rather than inside Threlte's <Canvas>. RUN 48 (G-A): on loads where the
	// WebGL canvas never initializes, components inside <Canvas> never mount —
	// the whole det story (poll, step machine, prediction games) died with it
	// while every timer kept running. The engine therefore lives OUTSIDE the
	// canvas subtree: it drives stores + DOM only, and DetScene (inside the
	// canvas) renders whatever the stores say whenever the canvas is healthy.
	import { onMount, onDestroy } from "svelte";
	import { browser } from "$app/environment";
	import { get } from "svelte/store";
	import { gsap, ScrollTrigger } from "$utils/gsap.js";
	import * as THREE from "three";
	import {
		showPlayground,
		expandPlayground,
		cameraControls,
		cameraAutoRotate,
		endMatrix,
		show3d,
		show2d,
		grid3dToggled,
		gridToggled,
		transformedGridToggled,
		dataToggled,
		inputVectorToggled
	} from "$stores";
	import {
		detStep,
		detEntries,
		detTarget,
		detPlayhead,
		detPlaying,
		detWriteLog,
		detFlipped,
		detCollapsed,
		detGame,
		detApproached,
		setDetTarget,
		skipDet,
		detTweenActive,
		clearDetMarks,
		endRound,
		submitCornerGuess,
		submitGuess,
		setDetPending,
		detTryExpanded,
		setDetFx,
		detFx,
		detScrubTo
	} from "$stores/det.js";
	import { det3dStep } from "$stores/det3.js";

	// REG-mode QA probe, DEV builds only (2D counterpart of __camdev /
	// __det3dev): reads the live world-layer stores so automation can tell
	// WHICH layer is wrong without pixel forensics — stripped from builds.
	// The `browser` guard is load-bearing: dev SSR evaluates component init,
	// and an unguarded window write here crashes server rendering into the
	// silent blank page (the F12 lesson, hit again by REG-2)
	if (import.meta.env.DEV && browser) {
		window.__detdev = {
			snap: () => ({
				detStep: get(detStep),
				det3dStep: get(det3dStep),
				grid: get(gridToggled),
				transformedGrid: get(transformedGridToggled),
				grid3d: get(grid3dToggled),
				data: get(dataToggled),
				inputVector: get(inputVectorToggled),
				showPlayground: get(showPlayground),
				expandPlayground: get(expandPlayground),
				endMatrix: get(endMatrix),
				entries: get(detEntries),
				// fire 72 (the entry-reset preemption diagnosis): the morph's
				// own state — target vs playhead names the writer instantly
				// (target == the story matrix => a writer superseded the
				// identity reset; target == identity with a frozen playhead =>
				// the tween died)
				detTarget: get(detTarget),
				detPlayhead: get(detPlayhead),
				detPlaying: get(detPlaying),
				// fire 72: the morph-writer log (det.js) — names the writer of
				// any entry-state preemption
				writes: detWriteLog.slice(-6),
					detFx: get(detFx),
					storyReveal,
					// fire 102: the approach hand-off flag — QA surface for the
					// crossing (the cube-gate + camera-glide windows read it)
					detApproached: get(detApproached),
					game: get(detGame).status,
				// fire 50 boot diagnostics: mounted=false on a load where the
				// mount flush aborted before the engine's onMount (the poll
				// never starts) — distinguishes a dead poll from a dead story
				mounted,
				// fire 92/93 (the pin QA): the module-side station-pin state
				pins: pinsSnapshot()
			})
		};
	}

	// P3.1: while the try-it is engaged, the toggle store owns the layout —
	// fires on step entry (detStep → 6) and on every toggle flip
	$: if (mounted && $detStep === 6) setTryLayout($detTryExpanded);

	/* step coupling — poll-based (robust in throttled environments) */

	// fire 93: canonical in $stores/detPins.js (the pin scrubs read the same objects)
	import {
		STEP_MATRIX,
		pinsLive as stationPinsLive,
		inDetSpan as stationInSpan,
		triggerCurrent as stationTriggerCurrent,
		killDetPins,
		lastSpanEnd,
		span1Progress,
		spanScrub2D,
		pinsSnapshot,
		retryCreateDetPins,
		assertDetReadingShift,
		assertDetReleased
	} from "$stores/detPins.js";

	let mounted = false;
	let savedCamera = null;
	let savedExpand = false;
	let savedEndMatrix = null;
	// set when the story engages before camera-controls exists (reload with
	// scroll restoration straight into the story) — repairState retries once
	let cameraPending = false;
	// the entry/exit cinematic: one killable gsap timeline owning the camera
	// glide and the sequenced grid fade-in / shape reveal
	let storyTl = null;
	let storyRevealTween = null;
	let storyReveal = 0;
	// wall-clock entry stamp — if the render loop is throttled, gsap's
	// rAF-driven timeline can't progress; repairState pops to the settled
	// story state once this goes stale
	let storyEnteredAt = 0;
	// the exit fades the shapes out BEFORE the {#if $detStep >= 1} markup
	// unmounts them — `exiting` parks that unmount on a short delay
	let exiting = false;
	let exitDelay = null;

	// fire 76 (H4): the det-approach hand-off — the original's section-2 entry
	// pattern (data fades, the grid stays, the warp unwinds, the camera
	// refocuses) applied while the det section approaches at detStep 0, so the
	// intro reads as a clean top-down 2D-plane chapter instead of the 3D
	// playground's leftover world (the frozen Maxwell model, the input vector,
	// the sheared grid). approachT drives DetScene's intro vector construction.
	let approachActive = false;
	let approachCamTl = null;
	let approachT = 0;
	let approachTween = null;

	/* entrance scalars (P1.2): every step change tweens in — nothing pops.
	   The locals are the engine's source of truth; syncFx() mirrors them into
	   the detFx store for DetScene's markup. */
	let stepInT = 1; // arrows/labels/spheres entrance (group scale + label fade)
	let edgeDrawT = 1; // edge draw-on progress (0 = no edges, 1 = full loop)
	let fillT = 0; // 0 = cyan, 1 = pink
	let collapsedT = 0; // 0 = fill visible, 1 = collapsed (fill faded out)
	let imgT = 0; // image spheres + ambiguity callout fade
	let stepInTl = null;
	let edgeDrawTween = null;
	let fillTween = null;
	let collapsedTween = null;
	let imgTween = null;
	// fire 102: true while span 1's pin scrub drives beat 1's entrance (see the
	// drive block in detUpdate) — the one-shot entrance tweens stand down
	let beat1SpanDrive = false;

	// hover ghost: live pointer position on the story plane while a round is
	// asking — turns blind clicking into aimed plotting
	let hoverPt = null;

	function syncFx() {
		setDetFx({ storyReveal, stepInT, edgeDrawT, fillT, collapsedT, imgT, hoverPt, approachT });
	}

	function tweenScalar(proxyObj, target, duration, onUpdate, ease = "power2.out") {
		return gsap.to(proxyObj, { v: target, duration, ease, onUpdate });
	}

	function runStepIn() {
		// fire 102: while span 1's scrub owns beat 1, its scroll mapping supersedes
		// the one-shot entrance (this only fires at step 1 — the flag is drive-gated)
		if (beat1SpanDrive) return;
		if (stepInTl) stepInTl.kill();
		const proxy = { v: 0 };
		stepInT = 0;
		stepInTl = tweenScalar(proxy, 1, 0.6, () => {
			stepInT = proxy.v;
			syncFx();
		});
	}

	function startEdgeDraw() {
		// fire 102: the storyTl call at 0.85s must not fight the span-1 scrub
		if (beat1SpanDrive) return;
		if (edgeDrawTween) edgeDrawTween.kill();
		edgeDrawT = 0;
		const proxy = { v: 0 };
		edgeDrawTween = tweenScalar(proxy, 1, 0.9, () => {
			edgeDrawT = proxy.v;
			syncFx();
		}, "power2.inOut");
	}

	$: if (mounted) tweenFill($detFlipped);
	function tweenFill(flipped) {
		if (fillTween) fillTween.kill();
		const proxy = { v: fillT };
		fillTween = tweenScalar(proxy, flipped ? 1 : 0, 0.5, () => {
			fillT = proxy.v;
			syncFx();
		});
	}

	$: if (mounted) tweenCollapsed($detCollapsed);
	function tweenCollapsed(collapsed) {
		if (collapsedTween) collapsedTween.kill();
		const proxy = { v: collapsedT };
		collapsedTween = tweenScalar(proxy, collapsed ? 1 : 0, 0.5, () => {
			collapsedT = proxy.v;
			syncFx();
		});
	}

	// sample images (collapse story) — the engine only needs their convergence
	// to time the callout fade; DetScene derives the positions for its markup
	$: [a, b, c, d] = $detEntries;
	$: img1 = [a * 0.5 + b * 0.4, c * 0.5 + d * 0.4];
	$: img2 = [a * 0.74 + b * 0.28, c * 0.74 + d * 0.28];
	$: imagesConverged =
		$detStep >= 4 && $detStep <= 5 && $detCollapsed &&
		Math.hypot(img1[0] - img2[0], img1[1] - img2[1]) < 0.12;

	$: if (mounted) tweenImg(imagesConverged);
	function tweenImg(shown) {
		if (imgTween) imgTween.kill();
		const proxy = { v: imgT };
		imgTween = tweenScalar(proxy, shown ? 1 : 0, 0.5, () => {
			imgT = proxy.v;
			syncFx();
		});
	}

	/* prediction games — click handling (canvas resolved per event) */

	// click-to-guess: a manual DOM-raycast path rather than Threlte's
	// on:pointerdown — the app never registered the interactivity plugin, and
	// its default target (renderer.domElement at plugin-creation time) is not
	// dependable when called from a child component. clientX/Y + the live
	// camera make this work for real clicks and automation alike.
	// fire 105: the listeners live on WINDOW now (see attachGameInput below) —
	// the wrapper delegation lost clicks to everything that paints over the
	// canvas (the game card's own box, the guide's spotlight fuzz, the
	// article's decorative SVGs), which is the "can't predict" bug.
	const guessRaycaster = new THREE.Raycaster();
	const guessNdc = new THREE.Vector2();
	// the det story lives on the z = 0.05 plane within |x|,|y| <= ~4 (grid span)
	const STORY_Z = 0.05;
	const STORY_SPAN = 4.2;
	// click position (CSS pixels) → story-plane grid coords via the live
	// camera. Analytic ray ∩ plane — independent of scene-graph matrix
	// staleness, which matters when the render loop is throttled.
	function planePointFromEvent(e) {
		// resolve the canvas at event time — the wrapper is static DOM
		const wrapper = document.getElementById("canvas-wrapper");
		const canvas = wrapper ? wrapper.querySelector("canvas") : null;
		if (!canvas) return null;
		const r = canvas.getBoundingClientRect();
		guessNdc.set(
			((e.clientX - r.left) / r.width) * 2 - 1,
			-(((e.clientY - r.top) / r.height) * 2 - 1)
		);
		const cc = get(cameraControls);
		if (!cc || !cc.camera) return null;
		// the raycast reads camera.matrixWorld — refresh it from the live
		// position/quaternion so a throttled render loop (which normally
		// updates matrices per frame) can't serve a stale pose
		if (cc.camera.updateMatrixWorld) cc.camera.updateMatrixWorld();
		guessRaycaster.setFromCamera(guessNdc, cc.camera);
		const o = guessRaycaster.ray.origin;
		const d = guessRaycaster.ray.direction;
		if (Math.abs(d.z) < 1e-6) return null;
		const t = (STORY_Z - o.z) / d.z;
		if (t <= 0) return null;
		// clamp to the story plane instead of rejecting: a click beyond the
		// plane's edge used to be silently dropped (no guess, no feedback) —
		// the hover ghost shows the clamped target before the click lands
		const px = Math.max(-STORY_SPAN, Math.min(STORY_SPAN, o.x + t * d.x));
		const py = Math.max(-STORY_SPAN, Math.min(STORY_SPAN, o.y + t * d.y));
		// P2.2: snap to the 0.5 grid — the hover ghost jumps between
		// half-grid points and every submission is an exact grid coordinate.
		// Round matrices keep the answers integer, so a correct aim matches
		// exactly instead of fighting decimal precision
		return [Math.round(px * 2) / 2, Math.round(py * 2) / 2];
	}
	// fire 105: window-level input must not steal real UI interactions — a
	// press on any control (buttons, spinners, sliders, the guide card) is
	// never a plot. Everything else plots, including clicks on decorative
	// overlays that merely PAINT above the canvas.
	function isGameUiTarget(e) {
		const t = e.target;
		return !!(t && t.closest && t.closest("button, a, input, select, textarea, .det-controls, .guide"));
	}
	function onCanvasPointerDown(e) {
		const game = get(detGame);
		if (game.status !== "asking") return;
		if (isGameUiTarget(e)) return;
		const pt = planePointFromEvent(e);
		if (!pt) return;
		// fire 78 (H5, user: "make it so user can plot a point first then hit
		// like accept"): a click PLOTS the candidate (re-click moves it), the
		// Accept button in DetGame commits it — no more instant lock-in. The
		// submission itself still goes through the same corner/inverse paths.
		setDetPending(pt);
	}
	function onCanvasPointerMove(e) {
		const asking = get(detGame).status === "asking";
		// fire 50 (user: "show a fake plot point as you move the mouse so the
		// user knows where it will end up"): the sandbox shows the snapped
		// ghost on hover even outside rounds — asking rounds always did
		if (!asking && get(detStep) !== 6) {
			if (hoverPt) {
				hoverPt = null;
				syncFx();
			}
			return;
		}
		if (asking && isGameUiTarget(e)) {
			if (hoverPt) {
				hoverPt = null;
				syncFx();
			}
			return;
		}
		hoverPt = planePointFromEvent(e);
		syncFx();
	}
	function onCanvasPointerLeave() {
		hoverPt = null;
		syncFx();
	}

	// crosshair cursor while a round is asking (cleaned up on destroy below)
	$: gAsk = $detGame.status === "asking";
	$: if (typeof document !== "undefined") {
		document.body.classList.toggle("det-asking", gAsk);
	}

	/* story layout helpers (DOM-owned; the article column and canvas slide) */

	// #article's transform is OWNED by the original's ScrollTrigger pin (its
	// cached x wins on every render inside the pin region), so the det story
	// slides the SECTION's own content instead. The column itself is kept at
	// the designed reading offset (translateX -65ch — normalized on entry and
	// guarded by repairState), so sliding the section to x: 0 puts the story
	// text exactly at the column's reading position in every regime; relative
	// offsets computed from a parked column would double-shift it.
	function sectionNaturalX(sec) {
		return sec.getBoundingClientRect().x - (gsap.getProperty(sec, "x") || 0);
	}
	function desktopLayout() {
		// mirrors the original's `hidden lg:flex` gate on the article — the
		// fallback notice shows and every det-st rect reads 0 below it
		if (window.innerWidth < 1024) return false;
		const article = document.getElementById("article");
		return !!article && getComputedStyle(article).display !== "none";
	}
	function storySlideIn() {
		const sec = document.getElementById("section-det");
		if (!sec) return;
		gsap.to(sec, { duration: 0.3, x: 0, overwrite: "auto" });
	}
	function storySlideHide() {
		// try-it: push the story text fully off the right edge
		const sec = document.getElementById("section-det");
		if (!sec) return;
		gsap.to(sec, { duration: 0.3, x: document.documentElement.clientWidth - sectionNaturalX(sec), overwrite: "auto" });
	}
	function storySlideRestore() {
		// back into the article's natural flow (the section is off-screen anyway
		// once the det story is exited)
		const sec = document.getElementById("section-det");
		if (sec) gsap.to(sec, { duration: 0.3, x: 0, overwrite: "auto" });
	}
	function slideCanvas(tx) {
		gsap.to("#canvas-wrapper", { duration: 0.3, translateX: tx, overwrite: "auto" });
	}
	// fire 100: #det-article is #article's sibling column now — it must ride
	// the SAME -65ch reading-shift dance (the flex row parks it right of the
	// canvas; the shift is what slides a column into the reading position).
	// Every #article layout tween below has this twin.
	function slideDetColumn(tx, duration = 0.3) {
		gsap.to("#det-article", { duration, translateX: tx, overwrite: "auto" });
	}

	/** P3.1: apply the try-it layout for the toggle state — full-canvas
	 *  sandbox (expanded) or split view with the det-st-6 text in the
	 *  reading column (collapsed). The floating toggle flips the store. */
	function setTryLayout(expanded) {
		expandPlayground.set(expanded);
		slideCanvas(expanded ? "0" : "-32.5ch");
		gsap.to("#article", {
			duration: 0.3,
			translateX: expanded ? "0" : "-65ch",
			overwrite: "auto"
		});
		slideDetColumn(expanded ? "0" : "-65ch");
		if (expanded) storySlideHide();
		else storySlideIn();
		gsap.set("#canvas-wrapper", { pointerEvents: "auto" });
	}

	function killStoryTl() {
		if (storyTl) {
			storyTl.kill();
			storyTl = null;
		}
	}

	// fire 93: the pin machinery lives in $stores/detPins.js — created in
	// Arcade's animate() batch (the original's own creation moment; the only
	// timing this page survives — see the module note for fires 81/92). The
	// engines keep thin local aliases so every gate below reads unchanged.
	function pinsLive() {
		return stationPinsLive();
	}
	function inDetSpan() {
		return stationInSpan();
	}
	function triggerCurrent() {
		return stationTriggerCurrent();
	}
	function killStationPins() {
		killDetPins();
	}

	// fire 100: the last 2D span's end scroll position (the try-it hand-off
	// anchor under pins), or null when the pins are off
	function stationTriggerEnd() {
		return lastSpanEnd();
	}
	function setStoryReveal(target, instant = false) {
		if (storyRevealTween) {
			storyRevealTween.kill();
			storyRevealTween = null;
		}
		if (instant) {
			storyReveal = target;
			syncFx();
			return;
		}
		const proxy = { v: storyReveal };
		storyRevealTween = gsap.to(proxy, {
			v: target,
			duration: 0.6,
			ease: "power2.out",
			onUpdate() {
				storyReveal = proxy.v;
				syncFx();
			}
		});
	}

	// shortest rotational path from the camera's current azimuth to `target`
	// (tweening the raw angle would send the camera the long way around)
	function shortestAzimuthTo(cc, target) {
		const TAU = Math.PI * 2;
		let diff = (target - cc.azimuthAngle) % TAU;
		if (diff > Math.PI) diff -= TAU;
		if (diff < -Math.PI) diff += TAU;
		return cc.azimuthAngle + diff;
	}

	// A3: the story pose dollies out a touch for the collapse beats — the
	// step-4/5 image reaches B′ = (3, 6), which fits d 15 with ~20px of
	// headroom under its label; d 17 buys the label room without changing
	// the feel of steps 1–3
	function storyDistance(step) {
		return step >= 4 && step <= 5 ? 17 : 15;
	}

	// assert the top-down story pose and apply it synchronously: the third
	// argument of rotateTo/dollyTo is enableTransition — with true the pose
	// only lands in camera-controls' rAF-driven update(), which never runs
	// in a throttled render loop (background tabs, slow machines), leaving
	// the camera at the 3D hero pose and skewing the whole sandbox
	function assertStoryCamera(cc, distance) {
		cc.rotateTo(0, 0.06, false);
		cc.dollyTo(distance ?? storyDistance(get(detStep)), false);
		// the original's triggers also leave a shifted look-at target and
		// focal offset behind — zero them or the sandbox orbits the wrong spot
		// (the ghost probes read grid (2.9, -3.4) at the viewport center)
		if (typeof cc.setTarget === "function") cc.setTarget(0, 0, 0, false);
		if (typeof cc.setFocalOffset === "function") cc.setFocalOffset(0, 0, 0, false);
		if (typeof cc.update === "function") cc.update(0);
		if (cc.camera && cc.camera.updateMatrixWorld) cc.camera.updateMatrixWorld();
	}

	// F9/F11: mid-story self-heal — the one-shot entry fallback only covers the
	// entry beat; a step CHANGE with a starved ticker (entries frozen at the
	// previous step's matrix) heals here instead. Fires only when no morph is
	// in flight (healthy-browser morphs are never cut) and the entries don't
	// already match this step's matrix.
	let lastHealedStep = -1;
	function healStepEntries(step) {
		if (scrubActive || inDetSpan()) return; // the scrubs own the entries mid-zone/span
		if (step < 1 || step > 5 || !STEP_MATRIX[step]) return;
		if (lastHealedStep === step) return;
		if (detTweenActive()) return;
		const [ta, tb, tc, td] = STEP_MATRIX[step];
		const [ea, eb, ec, ed] = get(detEntries);
		if (
			Math.abs(ea - ta) < 0.02 && Math.abs(eb - tb) < 0.02 &&
			Math.abs(ec - tc) < 0.02 && Math.abs(ed - td) < 0.02
		) {
			lastHealedStep = step; // already correct (morph completed) — just mark it
			return;
		}
		lastHealedStep = step;
		setDetTarget(STEP_MATRIX[step]);
		skipDet();
	}

	// fire 50 (user: "sliding animations of everything just like the
	// original has — the unit square into its shifted form, then when it
	// becomes negative again"): the story square now SLIDES WITH THE SCROLL
	// between stations, the original's scrub: 1 feel, instead of only playing
	// a 1.4s tween when a paragraph crosses center. While the next station
	// approaches within the scrub zone the scrub owns the entries (detScrubTo
	// kills any time tween); the discrete step machinery still fires at the
	// boundaries (entrances, camera, formula card), landing on exact matrices.
	let scrubActive = false;
	const SCRUB_ZONE = 520; // px of approach over which the morph plays

	// fire 105: the PINNED story's morph writer. The old pipeline rode the
	// rAF ticker twice (ScrollTrigger.progress -> scrub-tween render), so a
	// starved renderer froze the square mid-station and snapped it forward on
	// catch-up ticks. The scroll-path poll (rAF when alive, its 50ms timer
	// fallback when not) now writes the window-mapped morph directly — the
	// same "slide with the scroll" contract, no animation frames required.
	let lastSpanWrite = null;
	function updateSpanScrub() {
		if (!pinsLive() || get(detGame).status !== "idle") {
			lastSpanWrite = null;
			return;
		}
		const s = spanScrub2D();
		if (!s) {
			lastSpanWrite = null;
			return;
		}
		if (lastSpanWrite && lastSpanWrite.n === s.n && Math.abs(s.p - lastSpanWrite.p) < 0.002) {
			return; // same station, unmoved progress — don't spam tween-killing writes
		}
		lastSpanWrite = { n: s.n, p: s.p };
		detScrubTo(s.from, s.to, s.p);
	}
	function updateStoryScrub(current) {
		const step = get(detStep);
		if (
			pinsLive() || // fire 92: the span scrubs own the morph; this zone reads station rects, which lie under pins
			inDetSpan() ||
			current < 1 ||
			current > 4 ||
			step < 1 ||
			step > 5 ||
			get(detGame).status !== "idle"
		) {
			scrubActive = false;
			return;
		}
		const el = document.getElementById(`det-st-${current + 1}`);
		if (!el) {
			scrubActive = false;
			return;
		}
		const top = el.getBoundingClientRect().top;
		const center = window.innerHeight / 2;
		// fire 105 (the section-jump teleport, the user: "it shows instantly a
		// few steps ahead and then goes back"): the zone used to be a fixed
		// 520px — DEEPER than the ~290-360px gaps between the det stations, so
		// at every section switch the next station was already 30-90% inside
		// the zone and this scrub jumped the entries straight toward the NEXT
		// matrix in one frame (applyStep's own tween — later in the same poll
		// — then pulled them back: the ahead-then-back glitch). Derive the
		// zone from the LIVE gap to the station after next instead: p reads 0
		// exactly at a switch and 1 at the next one, so the morph owns the
		// travel BETWEEN text sections and is continuous across switches.
		let zone = SCRUB_ZONE;
		const elNext = document.getElementById(`det-st-${current + 2}`);
		if (elNext) {
			const gap = elNext.getBoundingClientRect().top - top;
			if (gap > 150) zone = Math.min(SCRUB_ZONE, gap);
		}
		const p = (center + zone - top) / zone;
		if (p > 0.001 && p < 0.999) {
			scrubActive = true;
			detScrubTo(STEP_MATRIX[current], STEP_MATRIX[current + 1], p);
		} else if (scrubActive) {
			// leaving the zone: land exactly on the nearer station's matrix
			scrubActive = false;
			detScrubTo(STEP_MATRIX[current], STEP_MATRIX[current + 1], p >= 0.999 ? 1 : 0);
		}
	}

	function healArticleColumn() {
		// A page loaded with restored scroll past section-1 pins #article
		// before the scrub renders, caching translateX 0 — the column then
		// stays parked off-screen right while the (unpinned) canvas sits at
		// its shifted reading offset, leaving the right quarter dark. The
		// scrub owns every scroll position past its range, so snap the
		// column to its designed -65ch there. Skipped on the hero/scrub
		// range (the scrub owns it) and in the expanded playground layout.
		if (get(expandPlayground) || !desktopLayout()) return;
		if (window.scrollY < 5000) return;
		const st = ScrollTrigger.getAll().find((t) => t.trigger && t.trigger.id === "section-1");
		if (st && window.scrollY <= st.end + 100) return;
		const art = document.getElementById("article");
		if (!art) return;
		const ax = gsap.getProperty(art, "translateX") || 0;
		if (ax > -100) gsap.to(art, { duration: 0.3, translateX: "-65ch", overwrite: "auto" });
	}

	function applyStep(n) {
		const prev = get(detStep);
		if (exiting) {
			if (n === 0) return; // an exit fade is already in flight
			// scrolled back in before the fade-out unmount landed — cancel it
			// and re-park the site UI the exit handed back
			if (exitDelay) {
				clearTimeout(exitDelay);
				exitDelay = null;
			}
			exiting = false;
			if (storyReveal < 1) setStoryReveal(1);
			document.body.classList.add("det-story");
			showPlayground.set(false);
			gsap.set("#inputs", { autoAlpha: 0 });
			savedExpand = get(expandPlayground);
			if (savedExpand) expandPlayground.set(false);
			slideCanvas("-32.5ch");
			gsap.to("#article", { duration: 0.3, translateX: "-65ch" });
			slideDetColumn("-65ch");
			killStoryTl();
			const ccBack = get(cameraControls);
			if (ccBack) assertStoryCamera(ccBack);
			if (prev === n) return;
		}
		if (prev === n) return;
		if (prev >= 1 && n === 0) {
			// leaving the story: run the restores now, but keep detStep at its
			// previous value so the shapes stay MOUNTED while they fade out —
			// setting detStep 0 here would pop them out in the same frame and
			// the fade would animate nothing. The unmount is parked below.
			exiting = true;
			storyEnteredAt = 0;
			killStoryTl();
			setStoryReveal(0);
			// a 6→0 exit skips the prev===6 branch below, so restore the
			// playground's saved matrix here (idempotent for story exits)
			if (savedEndMatrix) {
				endMatrix.set(savedEndMatrix);
				savedEndMatrix = null;
			}
			document.body.classList.remove("det-story");
			// fire 79 (I3): footer-aware exit — when the footer covers the
			// screen there is no playground to hand back to; restoring
			// showPlayground/#inputs here floated the toolbar + scrubber +
			// matrix panel (and TogglePlayground) over the footer while the
			// shell lingered its 500ms — the user's end-of-page glitch. The
			// clean-footer view parks ALL of it, and the exit lands fast.
			const footerElX = document.querySelector("footer");
			const atFooterCover =
				footerElX &&
				window.innerHeight + window.scrollY >
					footerElX.getBoundingClientRect().top + window.scrollY + window.innerHeight * 0.55;
			if (!atFooterCover) {
				showPlayground.set(true);
				gsap.set("#inputs", { autoAlpha: 1 });
			}
			gsap.set("#canvas-wrapper", { pointerEvents: "none" });
			if (!atFooterCover) {
				expandPlayground.set(savedExpand);
				slideCanvas(savedExpand ? "0" : "-32.5ch");
				// TogglePlayground is unmounted while the story runs (its mount
				// flag-skip swallows the first change), so nothing else restores
				// the column here — park it at the designed offset or it stays
				// off-screen right with the canvas shifted (right quarter dark)
				gsap.to("#article", { duration: 0.3, translateX: savedExpand ? "0" : "-65ch" });
			slideDetColumn(savedExpand ? "0" : "-65ch");
				slideDetColumn(savedExpand ? "0" : "-65ch");
			}
			storySlideRestore();
			savedExpand = false;
			const cc = get(cameraControls);
			if (cc && savedCamera) {
				const restore = savedCamera;
				storyTl = gsap.timeline();
				storyTl.to(
					cc,
					{
						azimuthAngle: shortestAzimuthTo(cc, restore.azimuth),
						polarAngle: restore.polar,
						distance: restore.distance,
						duration: 1.0,
						ease: "power2.inOut",
						// fire 76 (H4c): the original's scrubbed camera timelines
						// re-render their end pose after every scroll — without
						// overwrite the exit glide and the scrub fight for the
						// whole second (the reverse-scroll jitter)
						overwrite: "auto"
					},
					0
				);
				// fire 76 (H4c): the story zeroed the look-at target and the
				// focal offset — restore the pre-det ones or the restored pose
				// orbits the wrong spot ("zooming back up glitches the focus")
				storyTl.call(() => {
					if (typeof cc.setTarget === "function" && restore.target) {
						cc.setTarget(restore.target.x, restore.target.y, restore.target.z, false);
					}
					if (typeof cc.setFocalOffset === "function" && restore.focal) {
						cc.setFocalOffset(restore.focal.x, restore.focal.y, false);
					}
				});
				savedCamera = null;
			}
			if (exitDelay) clearTimeout(exitDelay);
			// plain setTimeout, not gsap.delayedCall: the unmount must land even
			// if the gsap ticker is stalled (throttled render loop) — timers are
			// the one clock that always runs here (detUpdate's interval relies
			// on the same property)
			if (atFooterCover) {
				// fire 79 (I3): the shell unmounts NOW at the footer — the
				// shapes are off-screen, there is nothing to fade out, and the
				// 500ms park is exactly the window the glitch screenshot caught
				exiting = false;
				detStep.set(0);
			} else {
				exitDelay = setTimeout(() => {
					exitDelay = null;
					exiting = false;
					detStep.set(0);
				}, 500);
			}
			return;
		}
		detStep.set(n);
		if (prev === 0 && n >= 1) {
			// entering the det story: park the site's playground UI and slide
			// the story text into the reading column, then refocus like the
			// rest of the page does — clear every grid, glide the camera
			// top-down, fade the clean 2D grid back in under the settling
			// camera, and only then reveal the shapes (mirrored on exit)
			document.body.classList.add("det-story");
			// fire 101 (the deep-restore finding): a load restored INSIDE the
			// story engages it WITHOUT the approach ever running — the Arcade
			// scene-clear gates (detApproached) and the world asserts never
			// fired, leaving section-2's cube/vectors visible behind the det
			// text. Run the hand-off here (idempotent with the approach).
			if (!get(detApproached)) {
				detApproached.set(true);
				assertApproachWorld();
			}
			showPlayground.set(false);
			gsap.set("#inputs", { autoAlpha: 0 });
			gsap.set("#canvas-wrapper", { pointerEvents: "none" });
			savedExpand = get(expandPlayground);
			if (savedExpand) expandPlayground.set(false);
			storySlideIn();
			slideCanvas("-32.5ch");
			// the article column belongs at the reading offset for the whole
			// story; a parked translateX 0 (reload straight into the story,
			// before the original's scrub rendered) would leave it off-screen
			// right with the canvas shifted — normalize to the designed value
			gsap.to("#article", { duration: 0.3, translateX: "-65ch", overwrite: "auto" });
			slideDetColumn("-65ch");
			// the story plays on the plain 2D plane: whatever section-2/the
			// playground left behind (3D grid, point field, input vector)
			// would clash with the det shapes. U1: the hand-off is CONTINUOUS —
			// the old world stays alive while the camera starts moving, then
			// its layers tween away with overlapping fades while the clean
			// grid crossfades in under the settling camera (no black wipe)
			show3d.set(false);
			show2d.set(true);
			if (get(cameraAutoRotate)) cameraAutoRotate.set(false);
			const cc = get(cameraControls);
			if (cc) {
				// fire 76 (H4): the approach already captured the pre-det pose —
				// keep it as the exit target; only capture when nothing did
				if (!savedCamera) {
					savedCamera = { azimuth: cc.azimuthAngle, polar: cc.polarAngle, distance: cc.distance };
				}
				// the intro vector construction hands off to the solid square
				tweenApproachT(0, 0.5);
				setStoryReveal(0, true);
				runStepIn();
				edgeDrawT = 0;
				syncFx();
				storyEnteredAt = Date.now();
				killStoryTl();
				storyTl = gsap.timeline();
				storyTl.to(
					cc,
					{
						azimuthAngle: shortestAzimuthTo(cc, 0),
						polarAngle: 0.06,
						distance: storyDistance(n),
						duration: 1.2,
						ease: "power2.inOut"
					},
					0
				);
				// U1 staggered hand-off, RETIMED (fire 37, user-reported: the
				// entry read as "goes black then reappears"): the old world's
				// layers fade while THE BRIGHT GRID STAYS — transformedGrid
				// remains ON (identity-pinned for detStep >= 1), so the same
				// bright grid the pre-det world used simply unshears in place
				// and the square draws on over it. No dark gap, no grid swap.
				// fire 50 (user: still saw a grid swap): the story is now
				// BRIGHT-GRID-ONLY — the dim slate grid fades OUT as the bright
				// one takes over (two identity grids would stack coplanar and
				// z-fight into patchy banding). One continuous ground plane
				// owns the whole det section from entry through the 3D chapter.
				storyTl.call(() => dataToggled.set(undefined), null, 0.35);
				storyTl.call(() => inputVectorToggled.set(false), null, 0.5);
				// fire 59: grid3d's shrink starts EARLY (the original's 3D→2D
				// return style — the wall grids deflate while the camera is
				// still swinging down, not after), so the wall-grid group
				// (whose visible gate came off in fire 59) deflates smoothly
				// instead of popping when detStep flips
				storyTl.call(() => grid3dToggled.set(false), null, 0.2);
				storyTl.call(
					() => {
						transformedGridToggled.set(true);
						gridToggled.set(false);
					},
					null,
					0.55
				);
				// the square draws on while the camera is still settling
				storyTl.call(
					() => {
						storyEnteredAt = 0;
						setStoryReveal(1);
						startEdgeDraw();
					},
					null,
					0.85
				);
			} else {
				// camera-controls not ready yet (reload straight into the story):
				// there is no transition to watch — settle instantly
				cameraPending = true;
				dataToggled.set(undefined);
				inputVectorToggled.set(false);
				gridToggled.set(false);
				transformedGridToggled.set(true);
				grid3dToggled.set(false);
				setStoryReveal(1, true);
				edgeDrawT = 1;
				syncFx();
			}
		}
		if (n === 6) {
			// try-it: identity sandbox + the original's expand-playground layout.
			// fire 66 (FIX-D, user: "it instantly like switches to showing the
			// full grid when reaching try it instead of staying in text"): the
			// entry used to SNAP the entries to the unit square (the step-5
			// shape popped in one frame) and the detTryExpanded default (true)
			// auto-expanded the canvas full-width, hiding the text. The
			// original's playground entry keeps the article visible and the
			// canvas in its story state — only the arrow expands. So: animate
			// the reset (the step-5 shape morphs home over 0.6s), clean the
			// scene overlays, and enter SPLIT view.
			clearDetMarks();
			setDetTarget([1, 0, 0, 1], { duration: 0.6 });
			detTryExpanded.set(false);
			endRound();
			// the sandbox needs the square and the grid NOW — cancel any
			// in-flight entry cinematic (its staggered hand-off calls die with
			// the timeline, so set the world state directly here — U1's
			// staggered flips included, or the playground layers would survive)
			killStoryTl();
			storyEnteredAt = 0;
			// fire 50: the try-it keeps the SAME bright grid as the story and
			// the 3D chapter — one continuous ground plane across the whole
			// det section (the old dim-grid sandbox made the grid swap again
			// at the story→try-it boundary)
			gridToggled.set(false);
			transformedGridToggled.set(true);
			grid3dToggled.set(false);
			dataToggled.set(undefined);
			inputVectorToggled.set(false);
			if (storyReveal < 1) setStoryReveal(1, true);
			// the sandbox needs the full square immediately — no entrance tweens
			edgeDrawT = 1;
			stepInT = 1;
			syncFx();
			// the try-it is a top-down 2D sandbox, but the original's section
			// triggers (st-9 "show third dimension") leave a tilted 3D camera
			// behind when the page is scrolled straight here — assert the story
			// pose on entry (the pre-story pose is already in savedCamera; the
			// user can still orbit freely DURING the try-it, repairState's
			// camera guard only applies at steps ≤ 5)
			const ccTry = get(cameraControls);
			if (ccTry) {
				assertStoryCamera(ccTry);
			}
			// the try-it shows the original's transformed grid again (it IS the
			// playground grid) — reset the original's matrix warp to identity
			// so a stale playground matrix can't render stray lines behind the
			// sandbox; restored on exit
			savedEndMatrix = get(endMatrix);
			endMatrix.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
			// fire 59: do NOT force detTryExpanded back to true on re-entry —
			// the original's expandPlayground is user-owned (the arrow state
			// persists across zone re-entries), and the persistent shell keeps
			// the controls visible either way
			return;
		}
		if (prev === 6) {
			// leaving the try-it back into the story: reading layout again,
			// and re-assert the story camera — the try-it lets the user orbit
			// and zoom freely, and repairState only guards steps ≤ 5 (issue-04)
			expandPlayground.set(false);
			if (savedEndMatrix) {
				endMatrix.set(savedEndMatrix);
				savedEndMatrix = null;
			}
			slideCanvas("-32.5ch");
			// restore the designed reading offset (NOT a captured translateX —
			// a value captured while the column was parked at 0 would leave it
			// off-screen right with the canvas shifted: right quarter dark)
			gsap.to("#article", { duration: 0.3, translateX: savedExpand ? "0" : "-65ch" });
			slideDetColumn(savedExpand ? "0" : "-65ch");
			storySlideIn();
			gsap.set("#canvas-wrapper", { pointerEvents: "none" });
			// fire 38: the story's bright-grid look must survive a 6→story
			// transition — this path skips the entry branch entirely (a jump
			// that transiently computed step 6 lands here on the way to a real
			// step), and without this the story fell back to the faint grid.
			// fire 50: bright-GRID-ONLY (see the entry comment)
			transformedGridToggled.set(true);
			gridToggled.set(false);
			const cc = get(cameraControls);
			// re-assert only when heading back INTO the story — an exit to 0
			// (n === 0) tweens the camera home via savedCamera instead
			if (cc && n > 0) {
				assertStoryCamera(cc);
			}
		}
		const m = STEP_MATRIX[n];
		if (m) {
			// every story-step change tweens its markers in (arrows grow from
			// the origin, labels/spheres fade-scale in) — nothing pops
			runStepIn();
			// fire 92: entering a span must NOT snap the morph to its end —
			// the span's scrub tween plays it with the scroll (scrub: 1)
			// fire 105: an ADJACENT story step is the scroll scrub's continuum
			// too (rect mode): the scrub's p is continuous across a switch —
			// the old pair lands at 1 exactly as the new pair starts at 0 — so
			// a time tween here would fight it and yank the shape back after
			// every section switch (the "goes back" half of the teleport).
			// Non-adjacent arrivals (fast-scroll jumps, story entry, try-it
			// returns) still morph on the clock.
			const adjacentStoryStep =
				prev >= 1 && prev <= 5 && n >= 1 && n <= 5 && Math.abs(n - prev) === 1;
			if (!inDetSpan() && !adjacentStoryStep) setDetTarget(m, { duration: 1.4 });
		}
	}

	function repairState() {
		// ScrollTrigger.refresh() (resize, layout shifts) re-fires the original
		// sections' callbacks, which can stomp the det story state — re-assert it
		const step = get(detStep);
		if (step < 1) return;
		// an exit fade is parking the unmount — its layout tweens own the
		// transitional state; re-asserting story layout here would fight them
		if (exiting) return;
		// the story engaged before camera-controls existed: apply the story
		// camera once it is ready (one-shot)
		if (cameraPending) {
			const ccEarly = get(cameraControls);
			if (ccEarly) {
				if (!savedCamera) {
					savedCamera = {
						azimuth: ccEarly.azimuthAngle,
						polar: ccEarly.polarAngle,
						distance: ccEarly.distance
					};
				}
				assertStoryCamera(ccEarly);
				cameraPending = false;
			}
		}
		// cinematic fallback: if the render loop is throttled, gsap's
		// rAF-driven entry timeline can't progress — pop to the settled
		// story state instead of leaving an empty plane on screen.
		// fire 81 (I5 fallback): fast scrolling also pops it — a user blowing
		// through the entry should land on the settled story, not wait 3s.
		if (
			step <= 5 &&
			storyEnteredAt &&
			(Date.now() - storyEnteredAt > 3000 || Math.abs(scrollVelocity) > 2600)
		) {
			storyEnteredAt = 0;
			killStoryTl();
			gridToggled.set(false);
			transformedGridToggled.set(true);
			grid3dToggled.set(false);
			// the U1 staggered hand-off may not have fired if the ticker was
			// stalled — the settled story world has no playground layers
			dataToggled.set(undefined);
			inputVectorToggled.set(false);
			// P4.1: the entries morph is a tween too — snap it to this step's
			// matrix or a throttled load leaves the square frozen at identity
			// (or mid-morph) with the story text already past the beat.
			// fire 81 (I5b): NOT inside a station span — the scrub owns the
			// entries there and a snap would fight it
			if (STEP_MATRIX[step] && !inDetSpan()) {
				setDetTarget(STEP_MATRIX[step]);
				skipDet();
			}
			lastHealedStep = step;
			// the entrance scalars are tweened too — a starved ticker leaves
			// stepInT/edgeDrawT at 0 forever, so labels/edges stay invisible
			// even with storyReveal settled; the settled state has them at 1
			stepInT = 1;
			edgeDrawT = 1;
			if (storyReveal < 1) setStoryReveal(1, true);
			syncFx();
			const ccStale = get(cameraControls);
			if (ccStale) assertStoryCamera(ccStale);
		}
		// F11: mid-story step changes heal here (see healStepEntries)
		healStepEntries(step);
		// fire 54: persistent story-grid guard (the 3D engine's fire-52
		// pattern) — the cinematic fallback's grid re-assert is one-shot, so a
		// narrative-trigger stomp mid-story (the sections' onEnter/onToggle
		// fire during scroll WITHOUT a refresh, so the refresh hook misses it)
		// could leave the dim grid back on top of the bright one with nothing
		// to heal it. Every poll re-asserts the settled story state; the
		// writes are idempotent and the fade tweens only fire on change.
		if (step >= 1 && step <= 5) {
			if (get(gridToggled) !== false) gridToggled.set(false);
			if (get(transformedGridToggled) !== true) transformedGridToggled.set(true);
			if (get(grid3dToggled) !== false) grid3dToggled.set(false);
		}
		if (get(showPlayground)) showPlayground.set(false);
		const inputs = document.getElementById("inputs");
		if (inputs && parseFloat(getComputedStyle(inputs).opacity) > 0.05) {
			gsap.set("#inputs", { autoAlpha: 0 });
		}
		const cw = document.getElementById("canvas-wrapper");
		// the try-it toggle owns the step-6 layout: full-bleed canvas when
		// expanded, split view with the det-st-6 text when collapsed — the
		// repair must re-assert the TOGGLED layout, not always-expanded
		const tryExpanded = get(detTryExpanded);
		if (cw) {
			const want = step === 6 ? "auto" : "none";
			if (getComputedStyle(cw).pointerEvents !== want) {
				gsap.set("#canvas-wrapper", { pointerEvents: want });
			}
			const canvasX = cw.getBoundingClientRect().x;
			if (step === 6 && tryExpanded && canvasX < -50) slideCanvas("0");
			if (step === 6 && !tryExpanded && canvasX > -50) slideCanvas("-32.5ch");
			if (step <= 5 && canvasX > -50) slideCanvas("-32.5ch");
		}
		// same guard for the article column: reading offset during the story,
		// cleared in the expanded try-it sandbox (kept at the reading offset in
		// the collapsed split view) — a parked wrong offset here is what leaves
		// the canvas shifted with no text covering the right quarter
		const ax = gsap.getProperty("#article", "translateX") || 0;
		// fire 100: the det column rides the same normalize (its own translate
		// can cache a parked value the same way after a restored-scroll load)
		const dax = gsap.getProperty("#det-article", "translateX") || 0;
		if (step <= 5 && ax > -100) {
			gsap.to("#article", { duration: 0.3, translateX: "-65ch", overwrite: "auto" });
		} else if (step === 6 && tryExpanded && ax < -100) {
			gsap.to("#article", { duration: 0.3, translateX: "0", overwrite: "auto" });
		} else if (step === 6 && !tryExpanded && ax > -100) {
			gsap.to("#article", { duration: 0.3, translateX: "-65ch", overwrite: "auto" });
		}
		if (step <= 5 && dax > -100) {
			slideDetColumn("-65ch");
		} else if (step === 6 && tryExpanded && dax < -100) {
			slideDetColumn("0");
		} else if (step === 6 && !tryExpanded && dax > -100) {
			slideDetColumn("-65ch");
		}
		const sec = document.getElementById("section-det");
		if (sec) {
			const secX = sec.getBoundingClientRect().x;
			const vw = document.documentElement.clientWidth;
			const slidIn = secX < vw - 200;
			const hidden = secX >= vw - 40;
			if (step <= 5 && !slidIn) storySlideIn();
			if (step === 6 && tryExpanded && !hidden) storySlideHide();
			if (step === 6 && !tryExpanded && !slidIn) storySlideIn();
		}
		const cc = get(cameraControls);
			if (
				step <= 5 &&
				cc &&
				// the entry/exit cinematic owns the camera while it runs —
				// snapping it to the story pose here would cut the glide short
				!(storyTl && storyTl.isActive()) &&
				(Math.abs(cc.polarAngle - 0.06) > 0.25 ||
					Math.abs(cc.distance - storyDistance(step)) > 0.5)
			) {
				assertStoryCamera(cc);
			}
	}

	function revealPassedSteps(center) {
		// the original attaches a paused gsap.from({opacity: 0}) entrance to
		// every child of every section.animate, played by a ScrollTrigger whose
		// pin-adjusted start never lines up with the det steps' scroll — force
		// the reveal for det content once it reaches the reading position
		const section = document.getElementById("section-det");
		if (!section) return;
		const revealed = [];
		for (const child of section.children) {
			if (child.getBoundingClientRect().top <= center + 80) revealed.push(child);
		}
		if (!revealed.length) return;
		gsap.set(revealed, { clearProps: "opacity,transform" });
		for (const child of revealed) {
			const lis = child.querySelectorAll("li");
			if (lis.length) gsap.set(lis, { clearProps: "opacity,transform" });
		}
	}

	// fire 76 (H4a): the approach hand-off — the Arcade ~1488 section-2 entry
	// pattern mirrored for the det section. Engage when the det section
	// visibly approaches while both stories idle; release with hysteresis
	// when it recedes. The original's own triggers re-own the world stores on
	// the way back up (st-13's onLeaveBack restores the model/grids/warp), so
	// the release only undoes what nothing else will: the camera pose. A fast
	// scroll-through releases WITHOUT touching anything the story entry owns.
	function tweenApproachT(target, duration = 0.9) {
		if (approachTween) approachTween.kill();
		const proxy = { v: approachT };
		approachTween = gsap.to(proxy, {
			v: target,
			duration,
			ease: "power2.inOut",
			onUpdate() {
				approachT = proxy.v;
				syncFx();
			}
		});
	}
	// fire 76: the approach owns the world while engaged — the original's
	// crossing callbacks (st-12's onLeave, st-13's family) fire DURING the
	// approach scroll and re-set their stores; re-assert every poll (all
	// writes idempotent — the fire-68 guard pattern) so the intro stays the
	// clean top-down 2D world the whole time
	function assertApproachWorld() {
		if (get(dataToggled) !== undefined) dataToggled.set(undefined);
		if (get(inputVectorToggled) !== false) inputVectorToggled.set(false);
		if (get(gridToggled) !== false) gridToggled.set(false);
		if (get(transformedGridToggled) !== true) transformedGridToggled.set(true);
		if (get(grid3dToggled) !== false) grid3dToggled.set(false);
		// fire 79 (I3): the approach zone also parks the playground chrome —
		// st-13's onEnter set showPlayground true for the rest of the page, so
		// the toolbar + scrubber + matrix panel floated over the det intro AND
		// over the footer (the user's end-of-page glitch). The release hands
		// them back (the original's own state there is show-true).
		if (get(showPlayground)) showPlayground.set(false);
		const inputsEl = document.getElementById("inputs");
		if (inputsEl && parseFloat(getComputedStyle(inputsEl).opacity) > 0.05) {
			gsap.set("#inputs", { autoAlpha: 0 });
		}
		// fire 104 (F1, the user's overlap report): the playground's interactive
		// canvas state must be fully dismissed when the det approach owns the
		// view — the original's #section-2 dismissal trigger does exactly this
		// (pointerEvents none + the camera reset). Without it the det overlays
		// slide over a still-interactive playground.
		const cwEl = document.getElementById("canvas-wrapper");
		if (cwEl && getComputedStyle(cwEl).pointerEvents !== "none") {
			gsap.set("#canvas-wrapper", { pointerEvents: "none" });
		}
		const em = get(endMatrix);
		const EM_IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
		if (em && em.some((v, i) => Math.abs(v - EM_IDENTITY[i]) > 1e-3)) {
			gsap.to(em, {
				endArray: [...EM_IDENTITY],
				duration: 0.6,
				ease: "power2.inOut",
				overwrite: "auto",
				onUpdate: () => {
					endMatrix.set(em);
				}
			});
		}
	}
	function updateApproach() {
		const sec = document.getElementById("section-det");
		if (!sec) return;
		const secTop = sec.getBoundingClientRect().top;
		const vh = window.innerHeight;
		// fire 102 (the heading pop-in): the -65ch reading shift used to wait for
		// the FULL approach gate (st-13 gone + secTop < 0.85vh + camera ready) —
		// measured live, that fired when the heading's slot was already ~120px
		// inside the viewport (top 686 vs vh 804) with the text parked at x 1629
		// (vw 1582), then the 0.3s slide dropped it to x 989: the user's "absent
		// then pops in at the boundary". On this calibration the secTop threshold
		// (not st-13-gone) is the binding constraint — st-13 is fully gone ~800px
		// before the heading scrolls in (the section top sits 1600px below it), so
		// the shift now keys on st-13 EXITING (its top past the viewport top) —
		// ~890px before the det heading enters the fold, the text is in its
		// reading position before it is ever visible. Idempotent per poll (slides
		// only while the column is still parked), detStep-0-gated so the story's
		// and try-it's own column layouts stay supreme, and it never re-parks on
		// release (the release band sits where the column is off-screen anyway —
		// the pre-fire-102 release semantics). The world/camera hand-off below
		// stays gated on st-13 GONE + secTop (fire 101: the glide must not fight
		// the section-2 story camera).
		if (get(detStep) === 0 && get(det3dStep) === 0) {
			const st13Early = document.getElementById("st-13");
			const st13Exiting = !st13Early || st13Early.getBoundingClientRect().top < 0;
			const colX = gsap.getProperty("#det-article", "translateX") || 0;
			if (st13Exiting && colX > -100) {
				slideDetColumn("-65ch");
			}
		}
		if (!approachActive) {
			// fire 101: also require the original's last station (st-13) to have
			// fully exited the viewport — the approach's camera glide must never
			// fight the section-2 story camera (the doubled-label/ghost fight
			// the user recorded at the boundary)
			const st13 = document.getElementById("st-13");
			const st13Gone = !st13 || st13.getBoundingClientRect().bottom < 0;
			if (secTop < vh * 0.85 && st13Gone && get(detStep) === 0 && get(det3dStep) === 0) {
				const cc = get(cameraControls);
				if (!cc) return; // retry next poll (the cameraPending pattern)
				approachActive = true;
				// fire 81 (I5a): Arcade's narrative-vector gates read this flag
				// so the intro clears to just the grid + our e1/e2 construction
				detApproached.set(true);
				// fire 102: the det column's -65ch reading shift fired HERE (fire
				// 100: the column parks right of the canvas flex row) — it moved
				// to the early block above (st-13 exiting, not gone) so the text
				// is in place before it scrolls into view
				// the pose the pre-det world had — reused as the story exit's
				// restore target (one capture, one restore, no double writers)
				if (!savedCamera) {
					savedCamera = {
						azimuth: cc.azimuthAngle,
						polar: cc.polarAngle,
						distance: cc.distance,
						target: typeof cc.getTarget === "function" ? cc.getTarget() : null,
						focal: typeof cc.getFocalOffset === "function" ? cc.getFocalOffset() : null
					};
				}
				// their stuff fades out (each store flip owns its tween)
				assertApproachWorld();
				// the camera refocuses onto the 2D plane (the house 2D pose)
				if (approachCamTl) approachCamTl.kill();
				approachCamTl = gsap.timeline();
				approachCamTl.to(
					cc,
					{
						azimuthAngle: shortestAzimuthTo(cc, 0),
						polarAngle: 0.06,
						// fire 101: 15 -> 10 — the original grid (10x10) must fill the
						// frame at this top-down pose or the viewport edges show the
						// scene's black background (the user's black rectangles)
						distance: 10,
						duration: 1.1,
						ease: "power2.inOut",
						overwrite: "auto"
					},
					0
				);
				approachCamTl.call(() => {
					// fire-22 pattern: pin the finished glide — but only while the
					// approach still owns the viewport (a story entry supersedes)
					if (approachActive && get(detStep) === 0) {
						const c2 = get(cameraControls);
						if (c2) {
							c2.rotateTo(0, 0.06, false);
							c2.dollyTo(10, false);
						}
					}
				}, null, 1.15);
				tweenApproachT(1);
			}
			return;
		}
		// engaged — keep the world asserted (the crossing callbacks fight back)
		if (get(detStep) === 0 && get(det3dStep) === 0) {
			assertApproachWorld();
		}
		// release?
		if (secTop > vh * 1.05 || get(detStep) >= 1 || get(det3dStep) >= 1) {
			approachActive = false;
			// fire 81 (I5a): the narrative vectors come back with the flag off
			detApproached.set(false);
			tweenApproachT(0, 0.45);
			if (approachCamTl) {
				approachCamTl.kill();
				approachCamTl = null;
			}
			// a story took over: it owns savedCamera and every world write now
			if (get(detStep) >= 1 || get(det3dStep) >= 1) return;
			// receded at detStep 0: glide the camera back to the pre-approach
			// pose (including the look-at target/focal offset the story family
			// zeroes), hand the capture back, and give the playground chrome
			// its original state back (st-13's onEnter leaves it shown above)
			const c3 = get(cameraControls);
			if (c3 && savedCamera) {
				const restore = savedCamera;
				approachCamTl = gsap.timeline();
				approachCamTl.to(
					c3,
					{
						azimuthAngle: shortestAzimuthTo(c3, restore.azimuth),
						polarAngle: restore.polar,
						distance: restore.distance,
						duration: 0.9,
						ease: "power2.inOut",
						overwrite: "auto"
					},
					0
				);
				approachCamTl.call(() => {
					if (typeof c3.setTarget === "function" && restore.target) {
						c3.setTarget(restore.target.x, restore.target.y, restore.target.z, false);
					}
					if (typeof c3.setFocalOffset === "function" && restore.focal) {
						c3.setFocalOffset(restore.focal.x, restore.focal.y, false);
					}
				});
			}
			savedCamera = null;
			showPlayground.set(true);
			gsap.set("#inputs", { autoAlpha: 1 });
		}
	}

	function detUpdate() {
		if (!mounted) return;
		// the original site is desktop-only: below the lg breakpoint the article
		// is display:none and Title shows its "better viewed on desktop" notice.
		// The hidden det section's rects all read 0 there, which would slam
		// detStep to 6 and float the try-it overlay over that notice — so the
		// whole story is gated the same way.
		if (!desktopLayout()) {
			// fire 92 (P1.7): the below-lg clear also tears the pins down —
			// the rect machine owns this layout; on the return to desktop the
			// settle gate re-arms from a clean calibration
			killStationPins();
			for (let n = 1; n <= 6; n++) {
				const el = document.getElementById(`det-st-${n}`);
				if (el) el.classList.remove("active");
			}
			if (get(detStep) !== 0) {
				// resized out of the desktop layout mid-story: clear the try-it
				// layout without re-enabling the playground UI (the original's
				// own triggers own that below the lg breakpoint)
				document.body.classList.remove("det-story");
				if (savedEndMatrix) {
					endMatrix.set(savedEndMatrix);
					savedEndMatrix = null;
				}
				detStep.set(0);
				endRound();
				expandPlayground.set(false);
				storySlideRestore();
				gsap.set("#canvas-wrapper", { pointerEvents: "none" });
				savedCamera = null;
				savedExpand = false;
			}
			return;
		}
		const center = window.innerHeight / 2;
		// fire 84 (P3): the settle-gated station pins arm here (the poll is
		// the natural ticker; the gate needs the scene mounted + a settled
		// calibration) — try-isolated like the other sub-steps
		// fire 76 (H4): the approach hand-off runs every poll at detStep 0 —
		// try-isolated like the other sub-steps
		// fire 101: the pin retry — a load restored deep into the page deferred
		// creation at animate() time; re-attempt from the poll until it passes
		// (idempotent; the viewport guard inside decides)
		try {
			retryCreateDetPins();
		} catch (e) {}
		try {
			updateApproach();
		} catch (e) {}
		// fire 105b (the fast-scroll leftover): a jump past the pin release
		// leaves gsap's cached y on the column (up to 6500 = 5 holds) — the
		// assert zeroes it; the ST hooks alone miss loads where no toggle or
		// refresh fires after the jump. Poll-side enforcement self-heals.
		try {
			if (pinsLive()) {
				assertDetReleased();
				assertDetReadingShift();
			}
		} catch (e) {}
		// fire 92 (the re-anchor): with the pins live the station triggers —
		// not the DOM rects — are the story state; the pinned rects NEVER
		// drive detStep (the fire-84 failure mode: the reflux parks them at
		// lying positions and the rect rule computed 0 mid-story)
		let current = 0;
		if (pinsLive()) {
			current = triggerCurrent();
		} else {
			for (let n = 1; n <= 6; n++) {
				const el = document.getElementById(`det-st-${n}`);
				if (!el) continue;
				if (el.getBoundingClientRect().top <= center) current = n;
			}
		}
		// fire 81 (I5 fallback): the scroll velocity (px/s) — fast scrolling
		// fast-forwards the entrance tweens ("I scroll so fast I miss half of
		// it": the settled state appears immediately instead of catch-up)
		const nowT = Date.now();
		if (lastVelY !== null) {
			scrollVelocity = ((window.scrollY - lastVelY) / Math.max(1, nowT - lastVelT)) * 1000;
		}
		lastVelY = window.scrollY;
		lastVelT = nowT;
		if (Math.abs(scrollVelocity) > 2600 && get(detStep) >= 1 && get(detStep) <= 5) {
			if (stepInT < 1 || edgeDrawT < 1) {
				if (stepInTl) stepInTl.kill();
				if (edgeDrawTween) edgeDrawTween.kill();
				stepInT = 1;
				edgeDrawT = 1;
				syncFx();
			}
		}
		// the fire-72 frozen-morph watchdog (see the note above the locals)
		if (get(detStep) === 6 && get(detPlaying)) {
			const ph = get(detPlayhead);
			if (Math.abs(ph - lastMorphPh) < 1e-6) frozenMorphPolls++;
			else frozenMorphPolls = 0;
			lastMorphPh = ph;
			if (frozenMorphPolls >= 3) {
				skipDet();
				frozenMorphPolls = 0;
			}
		} else {
			frozenMorphPolls = 0;
		}
		// fire 105 (the section-jump teleport, root cause): this second rect
		// loop used to run UNCONDITIONALLY and stomp the trigger-anchored
		// current above. Under live pins the article is PINNED on and off
		// around each span boundary — in-flow, the station rects sit only
		// ~290px apart while the trigger windows are 1300px apart — so in
		// every unpinned instant this loop computed a step or two AHEAD of
		// the story (their tops still above the viewport center) and the
		// trigger machinery then pulled the step back: the user's "it shows
		// instantly a few steps ahead and then goes back". The fire-92
		// contract (pinned rects NEVER drive detStep) is now actually
		// enforced: under pins only triggerCurrent() + the try-it/footer
		// rules below speak.
		if (!pinsLive()) {
			for (let n = 1; n <= 6; n++) {
				const el = document.getElementById(`det-st-${n}`);
				if (!el) continue;
				if (el.getBoundingClientRect().top <= center) current = n;
			}
		}
		// pin-spacer calibration varies between loads and can leave det-st-6
		// short of the viewport center at max scroll — the try-it is the page's
		// terminal state, so it engages on the scroll bottom. Anchored to the
		// FOOTER instead of raw max scroll: engage while the canvas is still
		// full-bleed (sticky in the article), and hand off to a clean footer
		// view once the footer covers the screen — otherwise the det overlay
		// floats over the footer content with nothing behind it (issue-05)
		const footerEl = document.querySelector("footer");
		const bottomNow = window.innerHeight + window.scrollY;
		if (footerEl) {
			const articleBottom =
				footerEl.getBoundingClientRect().top + window.scrollY;
			// fire 100: with the pins live the try-it engages at det-st-6's OWN
			// center-cross (the original's st-13 pattern) — the raw footer-40
			// threshold ate span 5's hold on the compact spacer layout
			if (pinsLive()) {
				// fire 100 iterate: st-6's live rect is a frozen-hold artifact
				// while the container is pinned (its "abs" rises with scroll) —
				// anchor to the LAST span's end instead: the container unpins
				// there and the travel to det-st-6 begins
				const lastTrigger = stationTriggerEnd();
				if (lastTrigger !== null) {
					// scroll-vs-scroll: bottomNow carries the viewport height, the
					// span end is a scroll position (the off-by-vh engaged the try-it
					// mid-span-5 on the first cut)
					// fire 104 (F5): the 3D story takes ownership the moment it
					// starts — detStep 6 must not ride over the 3D chapter (the
					// user's "2D try-it screen shows instead of the 3D grid")
					if (window.scrollY >= lastTrigger + 100 && get(det3dStep) === 0) current = 6;
				} else if (bottomNow >= articleBottom - 40 && get(det3dStep) === 0) current = 6;
			} else if (bottomNow >= articleBottom - 40 && get(det3dStep) === 0) current = 6;
			// fire 104 (F5, the mirror of the 3D yield): once the 3D story is
		// engaged (det3dStep 1-5) the 2D try-it screen releases — the user's
		// "2D try-it shows instead of the 3D grid" was this hold crossing the
		// whole 3D chapter
		if (get(det3dStep) >= 1 && get(det3dStep) <= 5 && get(detStep) === 6) {
			current = 0;
		}
		// fire 91 (adv-10 finding): on collapsed calibrations the +0.55vh
			// threshold can sit past max scroll (missed by 1px live) — the
			// clean-footer exit then NEVER fires and the terminal shell floats
			// over the footer. The absolute bottom is always clean-footer.
			if (
				bottomNow > articleBottom + window.innerHeight * 0.55 ||
				bottomNow >= document.documentElement.scrollHeight - 2
			) {
				current = 0;
			}
		} else if (
			bottomNow >=
			document.documentElement.scrollHeight - 500
		) {
			current = 6;
		}
		// fire 62 (N1/N3 root cause, diagnosed by the chk-N1 frames): the
		// parked-pin drift FREEZES the det paragraphs' rect tops on some loads
		// — the primary rule above then engages the story at completely wrong
		// scrolls (the det square captured over the HERO and over the 3D
		// chapter's text). Detector: live rects track scroll 1:1; frozen rects
		// don't move while the page scrolls. When frozen, the primary rule is
		// DEAD — force current to 0 so the footer-anchored band below becomes
		// the only driver (its range is calibration-proof), which also gates
		// the story visuals to the legitimate range: no engagement outside it,
		// and scrolling back up restores the pre-det world exactly there.
		const st1Probe = document.getElementById("det-st-1");
		if (st1Probe) {
			const top = st1Probe.getBoundingClientRect().top;
			if (lastRectScroll === null) {
				lastRectTop = top;
				lastRectScroll = window.scrollY;
		} else if (Math.abs(window.scrollY - lastRectScroll) > 600) {
			if (inDetSpan() || pinsLive()) {
				// fire 81 (I5b): inside our pin spans the det rects are SUPPOSED
				// to be frozen (the article is pinned) — a frozen rect is correct
				// here, not the parked-lie; keep the trackers fresh, never classify
				// fire 92: with the pins live that holds between spans too (the
				// post-reflux rects are pin-shifted by design, never classified)
				lastRectTop = top;
				lastRectScroll = window.scrollY;
			} else {
				// fire 62 fix 2: the RATIO test — live rects track scroll 1:1;
				// parked rects don't move at all, and DRIFTED rects move LESS
				// than the scroll (the pin spacer absorbs part of it — the
				// +5700px class the chk-N1 frames caught). Any mismatch beyond
				// 300px between "how far the page scrolled" and "how far the
				// paragraph moved" means the rects lie.
				const dScroll = Math.abs(window.scrollY - lastRectScroll);
				const dTop = Math.abs(top - lastRectTop);
				rectsFrozen = Math.abs(dTop - dScroll) > 300;
				lastRectTop = top;
				lastRectScroll = window.scrollY;
			}
		}
		}
		if (rectsFrozen && current >= 1 && footerEl && !pinsLive()) {
			// the frozen-rect lie — the band + the footer rules re-drive it
			// (fire 92: never while the pins own the story — a stale lie from
			// pre-arm polls must not zero a trigger-anchored current)
			current = 0;
		}
		// G-B rescue (RUN 47/48): on exploded-pin loads the article pin parks
		// the det paragraphs below the viewport for the whole lower page —
		// their rect tops freeze (measured 7508..10682 across scrollY
		// 11800→37500) and the viewport-center rule above can never fire. The
		// footer sits OUTSIDE the pinned article, so anchor a fallback band to
		// it and drive steps 1-5 by scroll fraction there (step 6 stays the
		// footer rule). On healthy loads the primary rule engages ~36px before
		// this band starts (det-st-1 crosses center at footerTop − 4536), so
		// the fallback only ever runs when the primary rule is dead.
		// fire 92: the G-B band is the fallback-of-the-fallback — with the
		// pins live the triggers own the step derivation and the band must
		// never run (its rect math reads pin-shifted stations)
		// fire 93: the band is rect-mode only — with the pins live the triggers own the steps
		if (current === 0 && footerEl && !stationPinsLive()) {
			const footerTop = footerEl.getBoundingClientRect().top + window.scrollY;
			// fire 49 (the REG-32 finding): on collapsed-pin loads (docH ~25k)
			// the true det stations sit 7500px+ ABOVE the footer — the fixed
			// 4500 span left a dead zone where the story could not engage.
			// Small documents widen the band proportionally; healthy loads
			// (docH ≥ 30000) keep the exact 4500 span, so the primary path is
			// untouched.
			const docH = document.documentElement.scrollHeight;
			const bandSpan = docH < 30000 ? Math.max(4500, Math.round(docH * 0.4)) : 4500;
			const bandStart = footerTop - bandSpan;
			const tryItAt = footerTop - 40;
			if (bottomNow >= bandStart && bottomNow < tryItAt) {
				const frac = (bottomNow - bandStart) / Math.max(1, tryItAt - bandStart);
				current = 1 + Math.min(4, Math.floor(frac * 5));
				if (!fallbackWarned) {
					fallbackWarned = true;
					console.warn(
						"[det] story fallback engaged — the det text never reached its reading position (pin calibration exploded, G-B). Steps driven from the footer-anchored band; the story text column may stay off-screen on this load."
					);
				}
			} else if (
				bottomNow >= tryItAt &&
				// fire 73 (H1): the band's step-6 branch ran unbounded, so after
				// the footer-cover exit above set current = 0 the band re-engaged
				// 6 at the very bottom — the issue-05 clean-footer hand-off has
				// been dead on every load since fire 66 (the terminal arrow floated
				// over the footer; the user's screenshot). The try-it owns only up
				// to the same threshold the primary rule exits at.
				bottomNow <= footerTop + window.innerHeight * 0.55
			) {
				// fire 66 (FIX-D): the band drove steps 1-5 but NEVER 6 — on
				// parked-rect loads the frozen-rect gate zeroes the primary
				// rule's footer branch too, leaving detStep 6 structurally
				// UNREACHABLE (the try-it could not open at all — six parked
				// rolls in a row never engaged it). Engage at the exact
				// threshold the healthy footer rule uses (footerTop - 40).
				// Healthy loads are untouched: their primary rule sets 6 at
				// the same threshold, so this block only runs when it died.
				current = 6;
			}
		}
		// fire 50/105: the morph writers, in order — the pinned-span scrub
		// first (window math), then the rect-mode approach scrub; a boundary
		// crossing lands on the exact matrix first, then the entrances play
		updateSpanScrub();
		updateStoryScrub(current);
		// fire 92: with the pins live the triggers' toggleClass owns the glow
		// (the original's exact mechanism); the manual toggle is rect-mode only
		if (!pinsLive()) {
			for (let n = 1; n <= 6; n++) {
				const el = document.getElementById(`det-st-${n}`);
				if (el) el.classList.toggle("active", n === current);
			}
		}
		revealPassedSteps(center);
		healArticleColumn();
		if (get(detStep) !== current) applyStep(current);
		// fire 102 (the static beat-1 hold): while the pins are live and span 1
		// owns the viewport at detStep 1, its ScrollTrigger progress DRIVES the
		// entrance scalars — stepInT plays over the first half of the ~1000px
		// hold, edgeDrawT (the square's frame draw-on) over the second — so the
		// beat animates THROUGH the hold instead of playing once in 0.6s and
		// leaving ~900px of dead scroll (the user's "keeps jumping up to the
		// text"). Placed after applyStep so the engaging poll drives immediately.
		// Stands down under fast scroll so the velocity fast-forward above still
		// lands the settled state instantly (its own catch-up contract).
		if (
			pinsLive() &&
			inDetSpan() &&
			get(detStep) === 1 &&
			Math.abs(scrollVelocity) <= 2600
		) {
			if (stepInTl) {
				stepInTl.kill();
				stepInTl = null;
			}
			if (edgeDrawTween) {
				edgeDrawTween.kill();
				edgeDrawTween = null;
			}
			const p1 = span1Progress();
			const sIn = Math.min(1, p1 * 2);
			const eDraw = Math.max(0, p1 * 2 - 1);
			if (sIn !== stepInT || eDraw !== edgeDrawT) {
				stepInT = sIn;
				edgeDrawT = eDraw;
				syncFx();
			}
			beat1SpanDrive = true;
		} else {
			beat1SpanDrive = false;
		}
		repairState();
	}

	let scrubCatchup = null;
	// G-A/G-B hardening (RUN 48): poll errors log once, the fallback warning
	// fires once per load, and the delegated-listener wrapper is remembered so
	// onDestroy removes from exactly the attached element
	let pollErrorLogged = false;
	let fallbackWarned = false;
	// fire 62: the frozen-rect detector state (see detUpdate)
	let lastRectTop = null;
	let lastRectScroll = null;
	let rectsFrozen = false;
	let detDestroyed = false;
	let detPollIv = null;
	let detPollIvBackup = null;
	// fire 81 (I5 fallback): the scroll velocity state (see detUpdate)
	let lastVelY = null;
	let lastVelT = 0;
	let scrollVelocity = 0;
	// fire 81 (the fire-72 preemption, NAMED by snap().writes on this roll):
	// the try-it entry morph targets identity but a dead gsap ticker never
	// advances the playhead — the entries strand at the story matrix with
	// detTarget already identity. A frozen playhead across consecutive polls
	// while a morph plays means the ticker is starved: complete it
	// synthetically (skipDet semantics — the settled try-it state).
	let frozenMorphPolls = 0;
	let lastMorphPh = -1;

	// lifecycle registered at INIT — nesting onDestroy inside onMount throws
	// "Function called outside component initialization" (latent since RUN 48:
	// it fired as an unhandled rejection every load and aborted the flush pass
	// behind it — with Det3DEngine's own instance stacked on top, that abort
	// started eating the pin-calibration pass, collapsing the document)
	onDestroy(() => {
		// SSR runs onDestroy callbacks at render end — every cleanup line
		// below touches window/DOM, so bail on the server
		if (!browser) return;
		detDestroyed = true;
		window.removeEventListener("scroll", onScrollDetUpdate);
		window.removeEventListener("scroll", scheduleScrubCatchup);
		window.removeEventListener("resize", detUpdate);
		window.removeEventListener("pointerdown", onCanvasPointerDown);
		window.removeEventListener("pointermove", onCanvasPointerMove);
		window.removeEventListener("pointerout", onWindowPointerOut);
		ScrollTrigger.removeEventListener("refresh", onRefreshRepair);
		if (scrubCatchup) clearTimeout(scrubCatchup);
		if (exitDelay) clearTimeout(exitDelay);
		document.body.classList.remove("det-asking");
		if (detPollIv) clearInterval(detPollIv);
		if (detPollIvBackup) clearInterval(detPollIvBackup);
	});

	// fire 105: click-to-guess and the hover ghost are WINDOW-level — the old
	// wrapper delegation lost every plot click to whatever painted above the
	// canvas (the game card's own box, the guide's spotlight fuzz, the
	// article's decorative SVGs; the lost-race variant silently killed the
	// games for a session — RUN 30). The window never races mount timing, and
	// isGameUiTarget keeps real controls interactive.
	function attachGameInput() {
		window.addEventListener("pointerdown", onCanvasPointerDown);
		window.addEventListener("pointermove", onCanvasPointerMove);
		window.addEventListener("pointerout", onWindowPointerOut);
	}
	// the window has no pointerleave; a pointerout whose relatedTarget died
	// (left the document) is the leave signal for the hover ghost
	function onWindowPointerOut(e) {
		if (!e.relatedTarget) onCanvasPointerLeave();
	}
	function scheduleScrubCatchup() {
		// the original's pin eases with scrub: 1 — the det sections' screen
		// positions keep drifting for ~1s AFTER a scroll event, so a single
		// detUpdate at event time can sample a pre-settle position. One
		// trailing re-check per scroll burst closes that gap (the interval
		// alone can be throttled on slow machines).
		if (scrubCatchup) clearTimeout(scrubCatchup);
		scrubCatchup = setTimeout(detUpdate, 550);
	}

	let scrollFramePending = false;
	function onScrollDetUpdate() {
		// P4.1: rAF-throttle the scroll-path detUpdate (the 300ms poll stays as
		// the safety net). Occluded-window starvation fallback: if rAF hasn't
		// released the gate within ~2 frames, run on the timer instead — scroll
		// must keep working in throttled panes, not freeze with the renderer
		if (scrollFramePending) return;
		scrollFramePending = true;
		const run = () => {
			if (!scrollFramePending) return;
			scrollFramePending = false;
			detUpdate();
		};
		requestAnimationFrame(run);
		setTimeout(run, 50);
	}
	// P4.1: one-shot camera/layout re-assert per ScrollTrigger refresh —
	// resize/layout shifts re-fire the original sections' callbacks which can
	// stomp the det story state; repairState is idempotent so hooking it
	// directly to refresh is the cheapest correct guard
	function onRefreshRepair() {
		try {
			repairState();
		} catch (err) {
			console.error("[det] repairState threw on refresh:", err);
		}
	}

	onMount(() => {
		mounted = true;
		// fire 93: the station pins are created by Arcade's animate() batch via detPins.js —
		// settle gate from the poll — never at mount (the fire-81 collapse)
		// the poll starts FIRST and is throw-safe: a failure anywhere in the
		// mount tail (or a later DOM hiccup) must not cost the det section its
		// step engine — RUN 47 G-A found loads where the poll never ran at all
		const iv = setInterval(() => {
			try {
				detUpdate();
			} catch (err) {
				if (!pollErrorLogged) {
					pollErrorLogged = true;
					console.error("[det] detUpdate threw inside the poll:", err);
				}
			}
		}, 300);
		detPollIv = iv;
		// fire 62: a BACKUP poll at a coprime period — the intermittent
		// instance-death class killed single polls mid-session (the stuck
		// states in fires 55-60); detUpdate is idempotent, so two independent
		// intervals are safe and one surviving keeps the machine alive
		const ivBackup = setInterval(() => {
			try {
				detUpdate();
			} catch (err) { /* the primary poll logs the first */ }
		}, 733);
		detPollIvBackup = ivBackup;
		detUpdate();
		window.addEventListener("scroll", onScrollDetUpdate, { passive: true });
		window.addEventListener("scroll", scheduleScrubCatchup, { passive: true });
		window.addEventListener("resize", detUpdate);
		ScrollTrigger.addEventListener("refresh", onRefreshRepair);
		// click-to-guess and the hover ghost ride the window (see
		// attachGameInput) — no element-resolution race, no occluder can
		// swallow a plot click
		attachGameInput();
		// G-A page failsafe (RUN 48): when the WebGL canvas init throws, the
		// abort in Svelte's mount flush also kills Index's own loading fade —
		// the page stays bricked behind the "Loading..." overlay forever
		// (measured: overlay opacity 1 + pointer-events auto on dead loads).
		// This engine mounts BEFORE the canvas, so it owns the failsafe:
		// if the legit fade hasn't run by 8s, force-release the shield.
		setTimeout(() => {
			const ov = document.getElementById("loading-overlay");
			if (ov && parseFloat(getComputedStyle(ov).opacity) > 0.05) {
				console.warn(
					"[det] loading overlay still up after 8s — force-releasing (canvas init likely failed; G-A page failsafe)"
				);
				gsap.set(ov, { autoAlpha: 0, pointerEvents: "none" });
			}
		}, 8000);
		// (cleanup moved to the INIT-level onDestroy above — the nested
		// onDestroy threw "outside component initialization" every load)
	});
</script>

<!-- the engine is logic-only: everything visual lives in DetScene (canvas)
     and DetOverlay (DOM), both driven by the shared stores -->
