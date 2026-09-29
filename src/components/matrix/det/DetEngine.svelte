<script>
	// The determinant section's step engine, mounted at DOM level (Index.svelte)
	// rather than inside Threlte's <Canvas>. RUN 48 (G-A): on loads where the
	// WebGL canvas never initializes, components inside <Canvas> never mount —
	// the whole det story (poll, step machine, prediction games) died with it
	// while every timer kept running. The engine therefore lives OUTSIDE the
	// canvas subtree: it drives stores + DOM only, and DetScene (inside the
	// canvas) renders whatever the stores say whenever the canvas is healthy.
	import { onMount, onDestroy } from "svelte";
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
		detFlipped,
		detCollapsed,
		detGame,
		setDetTarget,
		resetToIdentity,
		endRound,
		submitGuess,
		setDetFx
	} from "$stores/det.js";

	/* step coupling — poll-based (robust in throttled environments) */

	const STEP_MATRIX = {
		1: [1, 0, 0, 1],
		2: [2, 1, 0, 1],
		3: [-2, 1, 0, 1],
		4: [1, 2, 2, 4],
		5: [1, 2, 2, 4]
	};

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

	// hover ghost: live pointer position on the story plane while a round is
	// asking — turns blind clicking into aimed plotting
	let hoverPt = null;

	function syncFx() {
		setDetFx({ storyReveal, stepInT, edgeDrawT, fillT, collapsedT, imgT, hoverPt });
	}

	function tweenScalar(proxyObj, target, duration, onUpdate, ease = "power2.out") {
		return gsap.to(proxyObj, { v: target, duration, ease, onUpdate });
	}

	function runStepIn() {
		if (stepInTl) stepInTl.kill();
		const proxy = { v: 0 };
		stepInT = 0;
		stepInTl = tweenScalar(proxy, 1, 0.6, () => {
			stepInT = proxy.v;
			syncFx();
		});
	}

	function startEdgeDraw() {
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
	const guessRaycaster = new THREE.Raycaster();
	const guessNdc = new THREE.Vector2();
	// the det story lives on the z = 0.05 plane within |x|,|y| <= ~4 (grid span)
	const STORY_Z = 0.05;
	const STORY_SPAN = 4.2;
	// click position (CSS pixels) → story-plane grid coords via the live
	// camera. Analytic ray ∩ plane — independent of scene-graph matrix
	// staleness, which matters when the render loop is throttled.
	function planePointFromEvent(e) {
		// resolve the canvas at event time: listeners are delegated on the
		// stable wrapper (see onMount), so e.currentTarget is #canvas-wrapper
		const canvas =
			e.currentTarget && e.currentTarget.querySelector
				? e.currentTarget.querySelector("canvas")
				: e.currentTarget;
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
		return [px, py];
	}
	function onCanvasPointerDown(e) {
		if (get(detGame).status !== "asking") return;
		const pt = planePointFromEvent(e);
		if (pt) submitGuess(pt);
	}
	function onCanvasPointerMove(e) {
		if (get(detGame).status !== "asking") {
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
		gsap.to(sec, { duration: 0.3, x: 0 });
	}
	function storySlideHide() {
		// try-it: push the story text fully off the right edge
		const sec = document.getElementById("section-det");
		if (!sec) return;
		gsap.to(sec, { duration: 0.3, x: document.documentElement.clientWidth - sectionNaturalX(sec) });
	}
	function storySlideRestore() {
		// back into the article's natural flow (the section is off-screen anyway
		// once the det story is exited)
		const sec = document.getElementById("section-det");
		if (sec) gsap.to(sec, { duration: 0.3, x: 0 });
	}
	function slideCanvas(tx) {
		gsap.to("#canvas-wrapper", { duration: 0.3, translateX: tx });
	}

	function killStoryTl() {
		if (storyTl) {
			storyTl.kill();
			storyTl = null;
		}
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

	// assert the top-down story pose and apply it synchronously: the third
	// argument of rotateTo/dollyTo is enableTransition — with true the pose
	// only lands in camera-controls' rAF-driven update(), which never runs
	// in a throttled render loop (background tabs, slow machines), leaving
	// the camera at the 3D hero pose and skewing the whole sandbox
	function assertStoryCamera(cc) {
		cc.rotateTo(0, 0.06, false);
		cc.dollyTo(15, false);
		// the original's triggers also leave a shifted look-at target and
		// focal offset behind — zero them or the sandbox orbits the wrong spot
		// (the ghost probes read grid (2.9, -3.4) at the viewport center)
		if (typeof cc.setTarget === "function") cc.setTarget(0, 0, 0, false);
		if (typeof cc.setFocalOffset === "function") cc.setFocalOffset(0, 0, 0, false);
		if (typeof cc.update === "function") cc.update(0);
		if (cc.camera && cc.camera.updateMatrixWorld) cc.camera.updateMatrixWorld();
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
		if (ax > -100) gsap.to(art, { duration: 0.3, translateX: "-65ch" });
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
			showPlayground.set(true);
			gsap.set("#inputs", { autoAlpha: 1 });
			gsap.set("#canvas-wrapper", { pointerEvents: "none" });
			expandPlayground.set(savedExpand);
			slideCanvas(savedExpand ? "0" : "-32.5ch");
			// TogglePlayground is unmounted while the story runs (its mount
			// flag-skip swallows the first change), so nothing else restores
			// the column here — park it at the designed offset or it stays
			// off-screen right with the canvas shifted (right quarter dark)
			gsap.to("#article", { duration: 0.3, translateX: savedExpand ? "0" : "-65ch" });
			storySlideRestore();
			savedExpand = false;
			const cc = get(cameraControls);
			if (cc && savedCamera) {
				storyTl = gsap.timeline();
				storyTl.to(
					cc,
					{
						azimuthAngle: shortestAzimuthTo(cc, savedCamera.azimuth),
						polarAngle: savedCamera.polar,
						distance: savedCamera.distance,
						duration: 1.0,
						ease: "power2.inOut"
					},
					0
				);
				savedCamera = null;
			}
			if (exitDelay) clearTimeout(exitDelay);
			// plain setTimeout, not gsap.delayedCall: the unmount must land even
			// if the gsap ticker is stalled (throttled render loop) — timers are
			// the one clock that always runs here (detUpdate's interval relies
			// on the same property)
			exitDelay = setTimeout(() => {
				exitDelay = null;
				exiting = false;
				detStep.set(0);
			}, 500);
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
			gsap.to("#article", { duration: 0.3, translateX: "-65ch" });
			// the story plays on the plain 2D plane: whatever section-2/the
			// playground left behind (3D grid, point field, input vector)
			// would clash with the det shapes
			show3d.set(false);
			show2d.set(true);
			dataToggled.set(undefined);
			inputVectorToggled.set(false);
			if (get(cameraAutoRotate)) cameraAutoRotate.set(false);
			const cc = get(cameraControls);
			if (cc) {
				savedCamera = { azimuth: cc.azimuthAngle, polar: cc.polarAngle, distance: cc.distance };
				grid3dToggled.set(false);
				transformedGridToggled.set(false);
				gridToggled.set(false);
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
						distance: 15,
						duration: 1.2,
						ease: "power2.inOut"
					},
					0
				);
				// bring the clean grid back while the camera is still settling
				storyTl.call(() => gridToggled.set(true), null, 0.6);
				storyTl.call(
					() => {
						storyEnteredAt = 0;
						setStoryReveal(1);
						startEdgeDraw();
					},
					null,
					1.2
				);
			} else {
				// camera-controls not ready yet (reload straight into the story):
				// there is no transition to watch — settle instantly
				cameraPending = true;
				gridToggled.set(true);
				transformedGridToggled.set(false);
				grid3dToggled.set(false);
				setStoryReveal(1, true);
				edgeDrawT = 1;
				syncFx();
			}
		}
		if (n === 6) {
			// try-it: identity sandbox + the original's expand-playground layout
			resetToIdentity();
			endRound();
			// the sandbox needs the square and the grid NOW — cancel any
			// in-flight entry cinematic (its delayed grid restore dies with
			// the timeline, so set the grid state directly here)
			killStoryTl();
			storyEnteredAt = 0;
			gridToggled.set(true);
			transformedGridToggled.set(false);
			grid3dToggled.set(false);
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
			expandPlayground.set(true);
			slideCanvas("0");
			// the original's expand also clears the article column
			// (TogglePlayground tweens #article to translateX 0) — without this
			// the dark 65ch column stays parked over the canvas (issue-03)
			gsap.to("#article", { duration: 0.3, translateX: 0 });
			storySlideHide();
			gsap.set("#canvas-wrapper", { pointerEvents: "auto" });
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
			storySlideIn();
			gsap.set("#canvas-wrapper", { pointerEvents: "none" });
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
			setDetTarget(m, { duration: 1.4 });
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
		// story state instead of leaving an empty plane on screen
		if (step <= 5 && storyEnteredAt && Date.now() - storyEnteredAt > 3000) {
			storyEnteredAt = 0;
			killStoryTl();
			gridToggled.set(true);
			transformedGridToggled.set(false);
			grid3dToggled.set(false);
			if (storyReveal < 1) setStoryReveal(1, true);
			const ccStale = get(cameraControls);
			if (ccStale) assertStoryCamera(ccStale);
		}
		if (get(showPlayground)) showPlayground.set(false);
		const inputs = document.getElementById("inputs");
		if (inputs && parseFloat(getComputedStyle(inputs).opacity) > 0.05) {
			gsap.set("#inputs", { autoAlpha: 0 });
		}
		const cw = document.getElementById("canvas-wrapper");
		if (cw) {
			const want = step === 6 ? "auto" : "none";
			if (getComputedStyle(cw).pointerEvents !== want) {
				gsap.set("#canvas-wrapper", { pointerEvents: want });
			}
			const canvasX = cw.getBoundingClientRect().x;
			if (step === 6 && canvasX < -50) slideCanvas("0");
			if (step <= 5 && canvasX > -50) slideCanvas("-32.5ch");
		}
		// same guard for the article column: reading offset during the story,
		// cleared in the try-it sandbox — a parked 0 here is what leaves the
		// canvas shifted with no text covering the right quarter
		const ax = gsap.getProperty("#article", "translateX") || 0;
		if (step <= 5 && ax > -100) {
			gsap.to("#article", { duration: 0.3, translateX: "-65ch" });
		} else if (step === 6 && ax < -100) {
			gsap.to("#article", { duration: 0.3, translateX: "0" });
		}
		const sec = document.getElementById("section-det");
		if (sec) {
			const secX = sec.getBoundingClientRect().x;
			const vw = document.documentElement.clientWidth;
			const slidIn = secX < vw - 200;
			const hidden = secX >= vw - 40;
			if (step <= 5 && !slidIn) storySlideIn();
			if (step === 6 && !hidden) storySlideHide();
		}
		const cc = get(cameraControls);
		if (
			step <= 5 &&
			cc &&
			// the entry/exit cinematic owns the camera while it runs —
			// snapping it to the story pose here would cut the glide short
			!(storyTl && storyTl.isActive()) &&
			(Math.abs(cc.polarAngle - 0.06) > 0.25 || Math.abs(cc.distance - 15) > 0.5)
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

	function detUpdate() {
		if (!mounted) return;
		// the original site is desktop-only: below the lg breakpoint the article
		// is display:none and Title shows its "better viewed on desktop" notice.
		// The hidden det section's rects all read 0 there, which would slam
		// detStep to 6 and float the try-it overlay over that notice — so the
		// whole story is gated the same way.
		if (!desktopLayout()) {
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
		let current = 0;
		for (let n = 1; n <= 6; n++) {
			const el = document.getElementById(`det-st-${n}`);
			if (!el) continue;
			if (el.getBoundingClientRect().top <= center) current = n;
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
			if (bottomNow >= articleBottom - 40) current = 6;
			if (
				bottomNow >
				articleBottom + window.innerHeight * 0.55
			) {
				current = 0;
			}
		} else if (
			bottomNow >=
			document.documentElement.scrollHeight - 500
		) {
			current = 6;
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
		if (current === 0 && footerEl) {
			const footerTop = footerEl.getBoundingClientRect().top + window.scrollY;
			const bandStart = footerTop - 4500;
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
			}
		}
		for (let n = 1; n <= 6; n++) {
			const el = document.getElementById(`det-st-${n}`);
			if (el) el.classList.toggle("active", n === current);
		}
		revealPassedSteps(center);
		healArticleColumn();
		if (get(detStep) !== current) applyStep(current);
		repairState();
	}

	let scrubCatchup = null;
	// G-A/G-B hardening (RUN 48): poll errors log once, the fallback warning
	// fires once per load, and the delegated-listener wrapper is remembered so
	// onDestroy removes from exactly the attached element
	let pollErrorLogged = false;
	let fallbackWarned = false;
	let detWrapper = null;
	let detDestroyed = false;
	function attachWrapper(attempt = 0) {
		if (detDestroyed || detWrapper) return;
		const wrapper = document.getElementById("canvas-wrapper");
		if (wrapper) {
			detWrapper = wrapper;
			wrapper.addEventListener("pointerdown", onCanvasPointerDown);
			wrapper.addEventListener("pointermove", onCanvasPointerMove);
			wrapper.addEventListener("pointerleave", onCanvasPointerLeave);
		} else if (attempt < 10) {
			// the wrapper is static DOM, but if the engine ever mounts before it
			// exists, retry briefly instead of losing the games for the session
			setTimeout(() => attachWrapper(attempt + 1), 500);
		}
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

	onMount(() => {
		mounted = true;
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
		detUpdate();
		window.addEventListener("scroll", detUpdate, { passive: true });
		window.addEventListener("scroll", scheduleScrubCatchup, { passive: true });
		window.addEventListener("resize", detUpdate);
		// click-to-guess and the hover ghost are DELEGATED on #canvas-wrapper:
		// attaching to the canvas itself races Threlte's canvas creation, and a
		// lost race silently killed the prediction games for the whole session
		// (found in RUN 30). The wrapper is resolved per-event inside the
		// handlers; attachWrapper retries if it does not exist yet.
		attachWrapper();
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
		onDestroy(() => {
			detDestroyed = true;
			window.removeEventListener("scroll", detUpdate);
			window.removeEventListener("scroll", scheduleScrubCatchup);
			window.removeEventListener("resize", detUpdate);
			if (scrubCatchup) clearTimeout(scrubCatchup);
			if (exitDelay) clearTimeout(exitDelay);
			if (detWrapper) {
				detWrapper.removeEventListener("pointerdown", onCanvasPointerDown);
				detWrapper.removeEventListener("pointermove", onCanvasPointerMove);
				detWrapper.removeEventListener("pointerleave", onCanvasPointerLeave);
			}
			document.body.classList.remove("det-asking");
			clearInterval(iv);
		});
	});
</script>

<!-- the engine is logic-only: everything visual lives in DetScene (canvas)
     and DetOverlay (DOM), both driven by the shared stores -->
