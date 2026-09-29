<script>
	// det shapes rendered inside the original Threlte scene (v2).
	// VISUALS ONLY since RUN 48 (G-A): every bit of step-machine logic (poll,
	// applyStep, repairState, games input, camera, layout slides) moved to
	// DetEngine.svelte, which mounts OUTSIDE the <Canvas> subtree so the det
	// story survives loads where the WebGL canvas never initializes. This
	// component reacts to the shared stores (det.js): detStep gates the
	// markup, detEntries morphs the quad, detFx carries the entrance scalars
	// tweened by the engine.
	import { HTML } from "@threlte/extras";
	import { T } from "@threlte/core";
	import * as THREE from "three";
	import { detStep, detEntries, detCollapsed, detGame, detFx } from "$stores/det.js";
	import { colorX, colorY } from "$data/variables";

	/* det shapes on the original grid (z-up, shapes in the xy plane) */

	const CYAN = "#04d4f0";
	const PINK = "#ff79c6";
	const CYAN_COL = new THREE.Color(CYAN);
	const PINK_COL = new THREE.Color(PINK);
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
	const edgeMaterial = new THREE.LineBasicMaterial({
		color: new THREE.Color(CYAN),
		transparent: true
	});

	$: writeQuad($detEntries, $detFx.edgeDrawT);
	let nanLogged = false;
	function writeQuad([a, b, c, d], drawT = 1) {
		// NaN guard (RUN 48): computeBoundingSphere() on non-finite positions
		// poisons the bounding sphere (radius NaN → frustum culling breaks and
		// the shape can vanish permanently). Sanitize instead of rendering junk.
		const finite = [a, b, c, d, drawT].every((v) => Number.isFinite(v));
		if (!finite) {
			if (!nanLogged) {
				nanLogged = true;
				console.warn("[det] non-finite detEntries/edgeDrawT — skipping quad write");
			}
			return;
		}
		const quad = [0, 0, a, c, a + b, c + d, b, d];
		const fp = fillGeom.attributes.position.array;
		const ep = edgeGeom.attributes.position.array;
		for (let i = 0; i < 4; i++) {
			fp[i * 3] = quad[i * 2];
			fp[i * 3 + 1] = quad[i * 2 + 1];
			fp[i * 3 + 2] = Z;
		}
		// edges draw on: each of the 4 sides grows from its start corner,
		// paced so the whole loop completes at drawT = 1 (0 = no edges)
		const total = drawT * 4;
		for (let i = 0; i < 4; i++) {
			const seg = Math.max(0, Math.min(1, total - i));
			const j = (i + 1) % 4;
			const x0 = quad[i * 2];
			const y0 = quad[i * 2 + 1];
			ep[i * 6] = x0;
			ep[i * 6 + 1] = y0;
			ep[i * 6 + 2] = Z;
			ep[i * 6 + 3] = x0 + (quad[j * 2] - x0) * seg;
			ep[i * 6 + 4] = y0 + (quad[j * 2 + 1] - y0) * seg;
			ep[i * 6 + 5] = Z;
		}
		fillGeom.attributes.position.needsUpdate = true;
		edgeGeom.attributes.position.needsUpdate = true;
		fillGeom.computeBoundingSphere();
		edgeGeom.computeBoundingSphere();
	}

	// shape visibility is owned by the entry/exit cinematic (engine-tweened
	// detFx.storyReveal): the shapes only appear after the camera settles into
	// the story pose and fade out before the markup unmounts. The color flip
	// (cyan↔pink) and the collapse fade are TWEENED (fillT / collapsedT) —
	// nothing about the materials snaps anymore
	$: applyShapeMaterials($detFx.storyReveal, $detFx.fillT, $detFx.collapsedT);
	function applyShapeMaterials(reveal, fillT_, collapsedT_) {
		fillMaterial.color.copy(CYAN_COL).lerp(PINK_COL, fillT_);
		edgeMaterial.color.copy(CYAN_COL).lerp(PINK_COL, fillT_);
		fillMaterial.opacity = 0.3 * reveal * (1 - collapsedT_);
		edgeMaterial.opacity = reveal;
	}

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
	const fmtG = (n) => (Math.round(n * 100) / 100).toFixed(2);

	/* reveal connector: from the guess to where it actually maps */
	const connectorGeom = new THREE.BufferGeometry();
	connectorGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
	const connectorMat = new THREE.LineBasicMaterial({ color: RED, transparent: true, opacity: 0.9 });
	$: writeConnector(gConnector, g.result);
	function writeConnector(pts, result) {
		// NaN guard (RUN 48): see writeQuad
		if (
			pts &&
			!(pts[0][0] + pts[0][1] + pts[1][0] + pts[1][1] >= Number.NEGATIVE_INFINITY &&
				pts[0][0] + pts[0][1] + pts[1][0] + pts[1][1] <= Number.POSITIVE_INFINITY)
		) {
			return;
		}
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
</script>

<!-- det shapes — visible while the det section is on screen (detStep ≥ 1) -->
{#if $detStep >= 1}
	<T is={THREE.Mesh} geometry={fillGeom} material={fillMaterial} />
	<T is={THREE.LineSegments} geometry={edgeGeom} material={edgeMaterial} />

	<!-- column vectors grow out of the origin on step entry (group scale) -->
	{#if $detStep >= 2}
		<T.Group scale={Math.max($detFx.stepInT, 0.001)}>
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
		</T.Group>

		<HTML position={[col1[0], col1[1], 0.3]} center>
			<span class="det-label" style:color={colorX} style:opacity={$detFx.stepInT} style:transform={`translateY(${(1 - $detFx.stepInT) * 8}px)`}>T(e₁)</span>
		</HTML>
		<HTML position={[col2[0], col2[1], 0.3]} center>
			<span class="det-label" style:color={colorY} style:opacity={$detFx.stepInT} style:transform={`translateY(${(1 - $detFx.stepInT) * 8}px)`}>T(e₂)</span>
		</HTML>
	{/if}

	<!-- collapse story: sample points + the ambiguity callout (steps 4-5) -->
	{#if $detStep >= 4 && $detStep <= 5}
		<T is={THREE.Mesh} position={[P1[0], P1[1], 0.08]} scale={Math.max($detFx.stepInT, 0.001)}>
			<sphereGeometry args={[0.055, 16, 16]} />
			<meshBasicMaterial color={YELLOW} />
		</T>
		<T is={THREE.Mesh} position={[P2[0], P2[1], 0.08]} scale={Math.max($detFx.stepInT, 0.001)}>
			<sphereGeometry args={[0.055, 16, 16]} />
			<meshBasicMaterial color={PINK} />
		</T>
		{#if $detCollapsed}
			<T is={THREE.Mesh} position={[img1[0], img1[1], 0.09]} scale={Math.max($detFx.imgT, 0.001)}>
				<sphereGeometry args={[0.07, 16, 16]} />
				<meshBasicMaterial color={YELLOW} />
			</T>
			<T is={THREE.Mesh} position={[img2[0], img2[1], 0.1]} scale={Math.max($detFx.imgT, 0.001)}>
				<sphereGeometry args={[0.075, 16, 16]} />
				<meshBasicMaterial color={PINK} />
			</T>
		{/if}
		{#if imagesConverged}
			<HTML position={[img1[0], img1[1], 0.4]} center>
				<div class="det-callout" style:opacity={$detFx.imgT}>
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
			<!-- 0.16/0.032 (RUN 48, G-D): the old 0.11/0.02 ring was ~14px at
			     story zoom and vanished against the grid — same class of fix
			     as the RUN 33 ambiguity-ring enlargement -->
			<torusGeometry args={[0.16, 0.032, 8, 32]} />
			<meshBasicMaterial color={YELLOW} />
		</T>
		<HTML position={[gPoint[0], gPoint[1] + 0.44, 0.4]} center>
			<span class="det-chip">({fmtG(gPoint[0])}, {fmtG(gPoint[1])})</span>
		</HTML>
	{/if}
	<!-- hover ghost: where the click would land right now (asking rounds);
	     hoverPt is written by the engine's delegated pointermove handler -->
	{#if gAsk && $detFx.hoverPt}
		<T is={THREE.Mesh} position={[$detFx.hoverPt[0], $detFx.hoverPt[1], 0.11]}>
			<torusGeometry args={[0.07, 0.014, 8, 32]} />
			<meshBasicMaterial color={"#f8f8f2"} transparent opacity={0.85} />
		</T>
		<HTML position={[$detFx.hoverPt[0], $detFx.hoverPt[1] + 0.32, 0.4]} center>
			<span class="det-chip">({fmtG($detFx.hoverPt[0])}, {fmtG($detFx.hoverPt[1])})</span>
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

	<!-- guess clicks land anywhere on the canvas: the engine's delegated
	     pointer handler resolves them analytically onto the story plane -->
{/if}
