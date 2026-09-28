<script>
	// det shapes rendered inside the original Threlte scene (v2)
	import { onMount, onDestroy } from "svelte";
	import { get } from "svelte/store";
	import { gsap } from "$utils/gsap.js";
	import { HTML } from "@threlte/extras";
	import { T } from "@threlte/core";
	import * as THREE from "three";
	import {
		showPlayground,
		expandPlayground,
		cameraControls,
		cameraAutoRotate,
		sceneMounted
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

	// click-to-guess: a manual DOM-raycast path rather than Threlte's
	// on:pointerdown — the app never registered the interactivity plugin, and
	// its default target (renderer.domElement at plugin-creation time) is not
	// dependable when called from a child component. clientX/Y + the live
	// camera make this work for real clicks and automation alike.
	let clickPlane;
	const guessRaycaster = new THREE.Raycaster();
	const guessNdc = new THREE.Vector2();
	// the det story lives on the z = 0.05 plane within |x|,|y| <= ~4 (grid span)
	const STORY_Z = 0.05;
	const STORY_SPAN = 4.2;
	function onCanvasPointerDown(e) {
		if (get(detGame).status !== "asking") return;
		const canvas = e.currentTarget;
		const r = canvas.getBoundingClientRect();
		guessNdc.set(
			((e.clientX - r.left) / r.width) * 2 - 1,
			-(((e.clientY - r.top) / r.height) * 2 - 1)
		);
		const cc = get(cameraControls);
		if (!cc || !cc.camera) return;
		guessRaycaster.setFromCamera(guessNdc, cc.camera);
		// mesh raycast first (exact when the plane's world matrix is current)
		if (clickPlane) {
			const hits = guessRaycaster.intersectObject(clickPlane, true);
			if (hits.length) {
				submitGuess([hits[0].point.x, hits[0].point.y]);
				return;
			}
		}
		// analytic ray ∩ story-plane fallback — independent of scene-graph
		// matrix staleness, which matters when the render loop is throttled
		const o = guessRaycaster.ray.origin;
		const d = guessRaycaster.ray.direction;
		if (Math.abs(d.z) < 1e-6) return;
		const t = (STORY_Z - o.z) / d.z;
		if (t <= 0) return;
		const px = o.x + t * d.x;
		const py = o.y + t * d.y;
		if (Math.abs(px) <= STORY_SPAN && Math.abs(py) <= STORY_SPAN) {
			submitGuess([px, py]);
		}
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
	let savedArticleX = 0;

	// #article's transform is OWNED by the original's ScrollTrigger pin (its
	// cached x wins on every render inside the pin region), so the det story
	// slides the SECTION's own content instead. Every slide is computed
	// RELATIVE to the article's live position: with real (smooth) scrolling
	// the original's scrubbed slide holds the article at translateX -65ch,
	// while after programmatic jumps it can sit parked at 0 — absolute
	// offsets double-shift in the first regime.
	function sectionNaturalX(sec) {
		return sec.getBoundingClientRect().x - (gsap.getProperty(sec, "x") || 0);
	}
	function storySlideIn() {
		const sec = document.getElementById("section-det");
		if (!sec) return;
		const readingX = document.documentElement.clientWidth - sec.offsetWidth;
		gsap.to(sec, { duration: 0.3, x: readingX - sectionNaturalX(sec) });
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

	function applyStep(n) {
		const prev = get(detStep);
		if (prev === n) return;
		detStep.set(n);
		if (prev === 0 && n >= 1) {
			// entering the det story: park the site's playground UI, slide the
			// story text into the reading column, settle the camera top-down
			showPlayground.set(false);
			gsap.set("#inputs", { autoAlpha: 0 });
			gsap.set("#canvas-wrapper", { pointerEvents: "none" });
			savedExpand = get(expandPlayground);
			if (savedExpand) expandPlayground.set(false);
			storySlideIn();
			slideCanvas("-32.5ch");
			if (get(cameraAutoRotate)) cameraAutoRotate.set(false);
			const cc = get(cameraControls);
			if (cc) {
				savedCamera = { azimuth: cc.azimuthAngle, polar: cc.polarAngle, distance: cc.distance };
				// polar ~0 is degenerate for the spherical camera, so stop just short
				cc.rotateTo(0, 0.06, true);
				cc.dollyTo(15, true);
			}
		}
		if (prev >= 1 && n === 0) {
			// back into the 3D playground section — restore its state
			showPlayground.set(true);
			gsap.set("#inputs", { autoAlpha: 1 });
			gsap.set("#canvas-wrapper", { pointerEvents: "none" });
			expandPlayground.set(savedExpand);
			slideCanvas(savedExpand ? "0" : "-32.5ch");
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
			expandPlayground.set(true);
			slideCanvas("0");
			// the original's expand also clears the article column
			// (TogglePlayground tweens #article to translateX 0) — without this
			// the dark 65ch column stays parked over the canvas (issue-03)
			savedArticleX = gsap.getProperty("#article", "translateX") || 0;
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
			slideCanvas("-32.5ch");
			gsap.to("#article", { duration: 0.3, translateX: savedArticleX });
			storySlideIn();
			gsap.set("#canvas-wrapper", { pointerEvents: "none" });
			const cc = get(cameraControls);
			if (cc) {
				cc.rotateTo(0, 0.06, true);
				cc.dollyTo(15, true);
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
			cc.rotateTo(0, 0.06, true);
			cc.dollyTo(15, true);
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
		const center = window.innerHeight / 2;
		let current = 0;
		for (let n = 1; n <= 6; n++) {
			const el = document.getElementById(`det-st-${n}`);
			if (!el) continue;
			if (el.getBoundingClientRect().top <= center) current = n;
		}
		// pin-spacer calibration varies between loads and can leave det-st-6
		// short of the viewport center at max scroll — the try-it is the page's
		// terminal state, so reaching the bottom always engages it
		if (
			window.innerHeight + window.scrollY >=
			document.documentElement.scrollHeight - 500
		) {
			current = 6;
		}
		for (let n = 1; n <= 6; n++) {
			const el = document.getElementById(`det-st-${n}`);
			if (el) el.classList.toggle("active", n === current);
		}
		revealPassedSteps(center);
		if (get(detStep) !== current) applyStep(current);
		repairState();
	}

	onMount(() => {
		mounted = true;
		window.addEventListener("scroll", detUpdate, { passive: true });
		window.addEventListener("resize", detUpdate);
		const canvasEl = document.querySelector("#canvas-wrapper canvas");
		if (canvasEl) canvasEl.addEventListener("pointerdown", onCanvasPointerDown);
		const iv = setInterval(detUpdate, 300);
		detUpdate();
		onDestroy(() => {
			window.removeEventListener("scroll", detUpdate);
			window.removeEventListener("resize", detUpdate);
			if (canvasEl) canvasEl.removeEventListener("pointerdown", onCanvasPointerDown);
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
	{#if gAsk && gPoint}
		<T is={THREE.Mesh} position={[gPoint[0], gPoint[1], 0.12]}>
			<torusGeometry args={[0.11, 0.02, 8, 32]} />
			<meshBasicMaterial color={YELLOW} />
		</T>
	{/if}
	{#if gGuess}
		<T is={THREE.Mesh} position={[gGuess[0], gGuess[1], 0.12]}>
			<torusGeometry args={[0.08, 0.02, 8, 32]} />
			<meshBasicMaterial color={g.result ? (g.result.type === "correct" ? GREEN : RED) : "#f8f8f2"} />
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
				<torusGeometry args={[0.075, 0.018, 8, 32]} />
				<meshBasicMaterial color={PURPLE} />
			</T>
		{/each}
	{/if}

	<!-- click plane for the prediction games (asking rounds only) -->
	{#if gAsk}
		<T is={THREE.Mesh} bind:ref={clickPlane}>
			<planeGeometry args={[8.4, 8.4]} />
			<meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
		</T>
	{/if}
{/if}
