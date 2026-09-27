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
		cameraControls,
		cameraAutoRotate,
		sceneMounted
	} from "$stores";
	import {
		detStep,
		detEntries,
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
		return {
			shaftZ: theta - Math.PI / 2,
			shaftY: Math.max(len - 0.22, 0.01),
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

	function guessFromEvent(e) {
		const p = e.detail && e.detail.intersection ? e.detail.intersection.point : null;
		if (!p) return;
		if (get(detGame).status === "asking") {
			submitGuess([p.x, p.y]);
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

	function applyStep(n) {
		const prev = get(detStep);
		if (prev === n) return;
		detStep.set(n);
		if (prev === 0 && n >= 1) {
			// entering the det story: hide the site's playground UI, settle the
			// camera, slide the article text into its reading position
			showPlayground.set(false);
			gsap.set("#inputs", { autoAlpha: 0 });
			gsap.set("#canvas-wrapper", { pointerEvents: "none" });
			gsap.set("#article", { x: "-65ch" });
			if (get(cameraAutoRotate)) cameraAutoRotate.set(false);
			const cc = get(cameraControls);
			if (cc) gsap.to(cc, { duration: 1, polarAngle: 0, azimuthAngle: 0, distance: 15 });
		}
		if (prev >= 1 && n === 0) {
			// back into the 3D playground section — restore its state
			showPlayground.set(true);
			gsap.set("#inputs", { autoAlpha: 1 });
		}
		if (n === 6) {
			// try-it: identity sandbox + the original's expand-playground translation
			resetToIdentity();
			endRound();
			gsap.to("#article", { duration: 0.3, translateX: 0 });
			gsap.to("#canvas-wrapper", { duration: 0.3, translateX: 0 });
			gsap.set("#canvas-wrapper", { pointerEvents: "auto" });
			return;
		}
		const m = STEP_MATRIX[n];
		if (m) setDetTarget(m, { duration: 1.4 });
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
		for (let n = 1; n <= 6; n++) {
			const el = document.getElementById(`det-st-${n}`);
			if (el) el.classList.toggle("active", n === current);
		}
		if (get(detStep) !== current) applyStep(current);
	}

	onMount(() => {
		mounted = true;
		window.addEventListener("scroll", detUpdate, { passive: true });
		window.addEventListener("resize", detUpdate);
		const iv = setInterval(detUpdate, 300);
		detUpdate();
		onDestroy(() => {
			window.removeEventListener("scroll", detUpdate);
			window.removeEventListener("resize", detUpdate);
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
		<T is={THREE.Mesh} on:pointerdown={guessFromEvent}>
			<planeGeometry args={[8, 8]} />
			<meshBasicMaterial transparent opacity={0} depthWrite={false} />
		</T>
	{/if}
{/if}
