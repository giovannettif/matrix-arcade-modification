<script>
	// det shapes rendered inside the original Threlte scene (v2)
	import { onMount, onDestroy } from "svelte";
	import { get } from "svelte/store";
	import { gsap, ScrollTrigger } from "$utils/gsap.js";
	import { HTML } from "@threlte/extras";
	import { T } from "@threlte/core";
	import * as THREE from "three";
	import {
		showPlayground,
		expandPlayground,
		cameraControls,
		cameraAutoRotate,
		sceneMounted,
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
		submitGuess
	} from "$stores/det.js";
	import { colorX, colorY } from "$data/variables";

	/* det shapes on the original grid (z-up, shapes in the xy plane) */

	const CYAN = "#04d4f0";
	const PINK = "#ff79c6";
	const YELLOW = "#f1fa8c";
	const PURPLE = "#bd93f9";
	const GREEN = "#50fa7b";
	const RED = "#ff5555";
	const Z = 0.05;

	const P1 = [0.5, 0.4];
	const P2 = [0.74, 0.28];

	// parallelogram geometry: 4 vertices written directly from the det matrix
	// v0=(0,0)  v1=M*e1=(a,c)  v2=M*(e1+e2)  v3=M*e2=(b,d)
	function makeQuadGeom() {
		const g = new THREE.BufferGeometry();
		g.setIndex([0, 1, 2, 0, 2, 3]);
		g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
		return g;
	}
	const fillGeom = makeQuadGeom();
	const edgeGeom = new THREE.BufferGeometry();
	edgeGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(16), 3));

	const fillMaterial = new THREE.MeshBasicMaterial({
		color: new THREE.Color(CYAN),
		transparent: true,
		opacity: 0.3,
		side: THREE.DoubleSide,
		depthWrite: false
	});
	const edgeMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color(CYAN) });

	$: writeQuad($detEntries);
	function writeQuad([a, b, c, d]) {
		const quad = [0, 0, a, c, a + b, c + d, b, d];
		const fp = fillGeom.attributes.position.array;
		const ep = edgeGeom.attributes.position.array;
		for (let i = 0; i < 4; i++) {
			fp[i * 3] = quad[i * 2];
			fp[i * 3 + 1] = quad[i * 2 + 1];
			fp[i * 3 + 2] = Z;
		}
		for (let i = 0; i < 4; i++) {
			const j = (i + 1) % 4;
			ep[i * 6] = quad[i * 2];
			ep[i * 6 + 1] = quad[i * 2 + 1];
			ep[i * 6 + 2] = Z;
			ep[i * 6 + 3] = quad[j * 2];
			ep[i * 6 + 4] = quad[j * 2 + 1];
			ep[i * 6 + 5] = Z;
		}
		fillGeom.attributes.position.needsUpdate = true;
		edgeGeom.attributes.position.needsUpdate = true;
		fillGeom.computeBoundingSphere();
		edgeGeom.computeBoundingSphere();
	}

	$: fillMaterial.color.set($detFlipped ? PINK : CYAN);
	$: fillMaterial.opacity = $detCollapsed ? 0 : 0.3;
	$: edgeMaterial.color.set($detFlipped ? PINK : CYAN);

	// column arrows: shaft + cone, rotated around z (the plane's normal)
	function arrowXform(x, y) {
		const len = Math.min(Math.hypot(x, y) || 1e-6, 4);
		const theta = Math.atan2(y, x);
		const shaftY = Math.max(len - 0.22, 0.01);
		return {
			shaftZ: theta - Math.PI / 2,
			shaftY,
			midX: (Math.cos(theta) * shaftY) / 2,
			midY: (Math.sin(theta) * shaftY) / 2,
			tipX: Math.cos(theta) * (len - 0.11),
			tipY: Math.sin(theta) * (len - 0.11)
		};
	}
	$: [a, b, c, d] = $detEntries;
	$: col1 = [a, c];
	$: col2 = [b, d];
	$: xformA = arrowXform(col1[0], col1[1]);
	$: xformB = arrowXform(col2[0], col2[1]);

	// sample images (collapse story)
	$: img1 = [a * P1[0] + b * P1[1], c * P1[0] + d * P1[1]];
	$: img2 = [a * P2[0] + b * P2[1], c * P2[0] + d * P2[1]];
	$: imagesConverged =
		$detStep >= 4 && $detStep <= 5 && $detCollapsed &&
		Math.hypot(img1[0] - img2[0], img1[1] - img2[1]) < 0.12;

	/* game markers */
	$: g = $detGame;
	$: gAsk = g.status === "asking";
	$: gPoint = g.round ? (g.mode === "forward" ? g.round.point : g.round.target) : null;
	$: gGuess = g.guess;
	$: gAnswer = g.result && g.result.answer ? g.result.answer : null;
	$: gPreimages = g.result && g.result.preimages ? g.result.preimages : null;
	// where the user's guess actually lands under the round's matrix — the
	// far end of the reveal connector on inverse rounds (shows the miss
	// against the still-marked target ring)
	$: gGuessImage =
		gGuess && g.result && g.mode === "inverse" && g.round
			? [
					g.round.matrix[0] * gGuess[0] + g.round.matrix[1] * gGuess[1],
					g.round.matrix[2] * gGuess[0] + g.round.matrix[3] * gGuess[1]
				]
			: null;
	// connector from the guess to what it actually maps to (forward: the
	// answer; inverse: the guess's own image) — the banner references this
	$: gConnector =
		g.result && gGuess
			? g.mode === "forward"
				? [gGuess, g.result.answer]
				: gGuessImage
		: null;
	// hover ghost: live pointer position on the story plane while a round is
	// asking — turns blind clicking into aimed plotting
	let hoverPt = null;
	$: if (!gAsk && hoverPt) hoverPt = null;
	// crosshair cursor while a round is asking (cleaned up on destroy below)
	$: if (typeof document !== "undefined") {
		document.body.classList.toggle("det-asking", gAsk);
	}
	const fmtG = (n) => (Math.round(n * 100) / 100).toFixed(2);

	/* reveal connector: from the guess to where it actually maps */
	const connectorGeom = new THREE.BufferGeometry();
	connectorGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
	const connectorMat = new THREE.LineBasicMaterial({ color: RED, transparent: true, opacity: 0.9 });
	$: writeConnector(gConnector, g.result);
	function writeConnector(pts, result) {
		const arr = connectorGeom.attributes.position.array;
		arr[0] = pts ? pts[0][0] : 0;
		arr[1] = pts ? pts[0][1] : 0;
		arr[2] = Z + 0.02;
		arr[3] = pts ? pts[1][0] : 0;
		arr[4] = pts ? pts[1][1] : 0;
		arr[5] = Z + 0.02;
		connectorGeom.attributes.position.needsUpdate = true;
		connectorGeom.computeBoundingSphere();
		if (result) {
			connectorMat.color.set(
				result.type === "correct" ? GREEN : result.type === "ambiguous" ? PURPLE : RED
			);
		}
	}

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
	// staleness, which matters when the render loop is throttled. The
	// clickPlane mesh raycast was dropped: it intersected the same z plane
	// with identical bounds, just less reliably.
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
			if (hoverPt) hoverPt = null;
			return;
		}
		hoverPt = planePointFromEvent(e);
	}
	function onCanvasPointerLeave() {
		hoverPt = null;
	}

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
		if (prev === n) return;
		detStep.set(n);
		if (prev === 0 && n >= 1) {
			// entering the det story: park the site's playground UI, slide the
			// story text into the reading column, settle the camera top-down
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
			grid3dToggled.set(false);
			gridToggled.set(true);
			transformedGridToggled.set(false);
			dataToggled.set(undefined);
			inputVectorToggled.set(false);
			if (get(cameraAutoRotate)) cameraAutoRotate.set(false);
			const cc = get(cameraControls);
			if (cc) {
				savedCamera = { azimuth: cc.azimuthAngle, polar: cc.polarAngle, distance: cc.distance };
				// polar ~0 is degenerate for the spherical camera, so stop just short
				assertStoryCamera(cc);
			} else {
				// camera-controls not ready yet (reload straight into the story)
				cameraPending = true;
			}
		}
		if (prev >= 1 && n === 0) {
			// back into the 3D playground section — restore its state
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
				cc.rotateTo(savedCamera.azimuth, savedCamera.polar, true);
				cc.dollyTo(savedCamera.distance, true);
				savedCamera = null;
			}
		}
		if (n === 6) {
			// try-it: identity sandbox + the original's expand-playground layout
			resetToIdentity();
			endRound();
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
			if (cc) {
				assertStoryCamera(cc);
			}
		}
		const m = STEP_MATRIX[n];
		if (m) setDetTarget(m, { duration: 1.4 });
	}

	function repairState() {
		// ScrollTrigger.refresh() (resize, layout shifts) re-fires the original
		// sections' callbacks, which can stomp the det story state — re-assert it
		const step = get(detStep);
		if (step < 1) return;
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
		if (!mounted) return;		// the original site is desktop-only: below the lg breakpoint the article
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
		window.addEventListener("scroll", detUpdate, { passive: true });
		window.addEventListener("scroll", scheduleScrubCatchup, { passive: true });
		window.addEventListener("resize", detUpdate);
		// click-to-guess and the hover ghost are DELEGATED on #canvas-wrapper:
		// attaching to the canvas itself races DetScene's mount against
		// Threlte's canvas creation, and a lost race silently killed the
		// prediction games for the whole session (found in RUN 30). The
		// wrapper is static DOM and the canvas is resolved per-event inside
		// the handlers.
		const wrapper = document.getElementById("canvas-wrapper");
		if (wrapper) {
			wrapper.addEventListener("pointerdown", onCanvasPointerDown);
			wrapper.addEventListener("pointermove", onCanvasPointerMove);
			wrapper.addEventListener("pointerleave", onCanvasPointerLeave);
		}
		const iv = setInterval(detUpdate, 300);
		detUpdate();
		onDestroy(() => {
			window.removeEventListener("scroll", detUpdate);
			window.removeEventListener("scroll", scheduleScrubCatchup);
			window.removeEventListener("resize", detUpdate);
			if (scrubCatchup) clearTimeout(scrubCatchup);
			if (wrapper) {
				wrapper.removeEventListener("pointerdown", onCanvasPointerDown);
				wrapper.removeEventListener("pointermove", onCanvasPointerMove);
				wrapper.removeEventListener("pointerleave", onCanvasPointerLeave);
			}
			document.body.classList.remove("det-asking");
			clearInterval(iv);
		});
	});
</script>

<!-- det shapes — visible while the det section is on screen (detStep ≥ 1) -->
{#if $detStep >= 1}
	<T is={THREE.Mesh} geometry={fillGeom} material={fillMaterial} />
	<T is={THREE.LineSegments} geometry={edgeGeom} material={edgeMaterial} />

	<!-- column vectors: shaft + cone, colored like the article's basis vectors -->
	{#if $detStep >= 2}
		<T is={THREE.Mesh} position={[xformA.midX, xformA.midY, Z + 0.01]} rotation={{ z: xformA.shaftZ }} scale={{ y: xformA.shaftY }}>
			<cylinderGeometry args={[0.02, 0.02, 1, 12]} />
			<meshBasicMaterial color={colorX} />
		</T>
		<T is={THREE.Mesh} position={[xformA.tipX, xformA.tipY, Z + 0.01]} rotation={{ z: xformA.shaftZ }}>
			<coneGeometry args={[0.075, 0.22, 12]} />
			<meshBasicMaterial color={colorX} />
		</T>
		<T is={THREE.Mesh} position={[xformB.midX, xformB.midY, Z + 0.01]} rotation={{ z: xformB.shaftZ }} scale={{ y: xformB.shaftY }}>
			<cylinderGeometry args={[0.02, 0.02, 1, 12]} />
			<meshBasicMaterial color={colorY} />
		</T>
		<T is={THREE.Mesh} position={[xformB.tipX, xformB.tipY, Z + 0.01]} rotation={{ z: xformB.shaftZ }}>
			<coneGeometry args={[0.075, 0.22, 12]} />
			<meshBasicMaterial color={colorY} />
		</T>

		<HTML position={[col1[0], col1[1], 0.3]} center>
			<span class="det-label" style:color={colorX}>T(e₁)</span>
		</HTML>
		<HTML position={[col2[0], col2[1], 0.3]} center>
			<span class="det-label" style:color={colorY}>T(e₂)</span>
		</HTML>
	{/if}

	<!-- collapse story: sample points + the ambiguity callout (steps 4-5) -->
	{#if $detStep >= 4 && $detStep <= 5}
		<T is={THREE.Mesh} position={[P1[0], P1[1], 0.08]}>
			<sphereGeometry args={[0.055, 16, 16]} />
			<meshBasicMaterial color={YELLOW} />
		</T>
		<T is={THREE.Mesh} position={[P2[0], P2[1], 0.08]}>
			<sphereGeometry args={[0.055, 16, 16]} />
			<meshBasicMaterial color={PINK} />
		</T>
		{#if $detCollapsed}
			<T is={THREE.Mesh} position={[img1[0], img1[1], 0.09]}>
				<sphereGeometry args={[0.07, 16, 16]} />
				<meshBasicMaterial color={YELLOW} />
			</T>
			<T is={THREE.Mesh} position={[img2[0], img2[1], 0.1]}>
				<sphereGeometry args={[0.075, 16, 16]} />
				<meshBasicMaterial color={PINK} />
			</T>
		{/if}
		{#if imagesConverged}
			<HTML position={[img1[0], img1[1], 0.4]} center>
				<div class="det-callout">
					Which point did this come from?
					<b>Ambiguous — no inverse exists.</b>
				</div>
			</HTML>
		{/if}
	{/if}

	<!-- game markers -->
	<!-- the round's reference point: the marked origin (forward) or the marked
	     image (inverse). Kept through the reveal — the result strip references
	     it, and the coordinate chip makes the round solvable by math rather
	     than by pixel-hunting -->
	{#if g.round && gPoint}
		<T is={THREE.Mesh} position={[gPoint[0], gPoint[1], 0.12]}>
			<torusGeometry args={[0.11, 0.02, 8, 32]} />
			<meshBasicMaterial color={YELLOW} />
		</T>
		<HTML position={[gPoint[0], gPoint[1] + 0.44, 0.4]} center>
			<span class="det-chip">({fmtG(gPoint[0])}, {fmtG(gPoint[1])})</span>
		</HTML>
	{/if}
	<!-- hover ghost: where the click would land right now (asking rounds) -->
	{#if gAsk && hoverPt}
		<T is={THREE.Mesh} position={[hoverPt[0], hoverPt[1], 0.11]}>
			<torusGeometry args={[0.07, 0.014, 8, 32]} />
			<meshBasicMaterial color={"#f8f8f2"} transparent opacity={0.85} />
		</T>
		<HTML position={[hoverPt[0], hoverPt[1] + 0.32, 0.4]} center>
			<span class="det-chip">({fmtG(hoverPt[0])}, {fmtG(hoverPt[1])})</span>
		</HTML>
	{/if}
	{#if gGuess}
		<T is={THREE.Mesh} position={[gGuess[0], gGuess[1], 0.12]}>
			<torusGeometry args={[0.08, 0.02, 8, 32]} />
			<meshBasicMaterial
				color={g.result
					? g.result.type === "correct"
						? GREEN
						: g.result.type === "ambiguous"
							? PURPLE
							: RED
					: "#f8f8f2"}
			/>
		</T>
	{/if}
	<!-- connector: guess → what it actually maps to -->
	{#if gConnector}
		<T is={THREE.Line} geometry={connectorGeom} material={connectorMat} />
	{/if}
	{#if gGuessImage}
		<T is={THREE.Mesh} position={[gGuessImage[0], gGuessImage[1], 0.12]}>
			<sphereGeometry args={[0.05, 12, 12]} />
			<meshBasicMaterial
				color={g.result && g.result.type === "correct"
					? GREEN
					: g.result && g.result.type === "ambiguous"
						? PURPLE
						: RED}
			/>
		</T>
	{/if}
	{#if gAnswer && g.result && g.result.type !== "ambiguous"}
		<T is={THREE.Mesh} position={[gAnswer[0], gAnswer[1], 0.12]}>
			<sphereGeometry args={[0.065, 16, 16]} />
			<meshBasicMaterial color={g.result.type === "correct" ? GREEN : YELLOW} />
		</T>
	{/if}
	{#if gPreimages}
		{#each gPreimages as p, i (i)}
			<T is={THREE.Mesh} position={[p[0], p[1], 0.12]}>
				<torusGeometry args={[0.2, 0.045, 8, 32]} />
				<meshBasicMaterial color={PURPLE} />
			</T>
		{/each}
	{/if}

	<!-- guess clicks land anywhere on the canvas: the pointer handler resolves
	     them analytically onto the story plane — no invisible mesh needed -->
{/if}
