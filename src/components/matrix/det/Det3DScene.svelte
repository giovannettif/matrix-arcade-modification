<script>
	// P5.1: the 3D determinant story's visuals — the unit cube draw-on, corner
	// labels, the 3×3 morph (cube → parallelepiped), and the det = 0 collapse
	// (two points → same image → ambiguous). Visuals ONLY, exactly like
	// DetScene: Det3DEngine (DOM level, outside the canvas) drives the shared
	// det3.js stores and this component renders whatever they say. World is
	// Z-up (house convention — DetScene's shapes live in the xy plane), so the
	// cube's math-z is height.
	import { HTML } from "@threlte/extras";
	import { T } from "@threlte/core";
	import * as THREE from "three";
	import { gsap } from "$utils/gsap.js";
	import { det3dStep, det3Entries, det3Collapsed, det3Fx, det3Game, det3GuessZ } from "$stores/det3.js";

	// game-state mirror for the round ghost (P5.2)
	$: g = $det3Game;
	$: gAsk3 = g.status === "asking";
	// fire 80 (I4): the corner being asked about (pulsed while asking)
	$: askedPt3 =
		gAsk3 && g.mode === "corners" && g.round && g.round.index < g.round.corners.length
			? g.round.corners[g.round.index]
			: null;

	// fire 80 (I4): the animated reveal — a marker flies from the committed
	// guess point to the true answer while the round is revealing
	const revealDotGeom3 = new THREE.SphereGeometry(0.075, 16, 16);
	const revealDotMat3 = new THREE.MeshBasicMaterial({
		color: new THREE.Color("#50fa7b"),
		transparent: true,
		opacity: 0
	});
	let revealPos3 = [0, 0, 0];
	let revealTl3 = null;
	let lastRevealResult3 = null;
	$: onReveal3($det3Game);
	function onReveal3(gg) {
		const res = gg.result;
		if (
			gg.status === "revealing" &&
			res &&
			res !== lastRevealResult3 &&
			gg.guess &&
			gg.mode === "corners"
		) {
			lastRevealResult3 = res;
			const from = [gg.guess.x, gg.guess.y, gg.guess.z ?? 0];
			const to = res.answer;
			if (![from[0], from[1], from[2], to[0], to[1], to[2]].every(Number.isFinite)) return;
			if (revealTl3) revealTl3.kill();
			revealDotMat3.color.set(res.type === "correct" ? "#50fa7b" : "#ff5555");
			revealDotMat3.opacity = 1;
			const proxy = { t: 0 };
			revealTl3 = gsap.to(proxy, {
				t: 1,
				duration: 0.8,
				ease: "power2.inOut",
				overwrite: "auto",
				onUpdate: () => {
					const t = proxy.t;
					revealPos3 = [
						from[0] + (to[0] - from[0]) * t,
						from[1] + (to[1] - from[1]) * t,
						from[2] + (to[2] - from[2]) * t
					];
				},
				onComplete: () => {
					gsap.to(revealDotMat3, { opacity: 0, duration: 0.3, overwrite: "auto" });
				}
			});
		} else if (gg.status !== "revealing" && revealTl3) {
			revealTl3.kill();
			revealTl3 = null;
			gsap.to(revealDotMat3, { opacity: 0, duration: 0.25, overwrite: "auto" });
		}
	}

	const CYAN = "#04d4f0";
	const PINK = "#ff79c6";
	const YELLOW = "#f1fa8c";
	const PURPLE = "#bd93f9";
	const WHITE = "#f8f8f2";
	const PINK_COL = new THREE.Color(PINK);
	const YELLOW_COL = new THREE.Color(YELLOW);

	const H = 0.05; // resting height above the grid (house convention)
	// the cube's 8 corners — (0|1, 0|1, 0|1), base on the floor
	const CORNERS = [
		[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
		[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]
	];
	// 12 edges as corner-index pairs
	const EDGE_PAIRS = [
		[0, 1], [1, 2], [2, 3], [3, 0], // base
		[4, 5], [5, 6], [6, 7], [7, 4], // top
		[0, 4], [1, 5], [2, 6], [3, 7] // pillars
	];
	// 6 faces as corner-index quads (two triangles each, non-indexed)
	const FACE_QUADS = [
		[0, 1, 2, 3], [4, 5, 6, 7], // base, top
		[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]
	];

	function makeGeom(n) {
		const g = new THREE.BufferGeometry();
		g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
		return g;
	}
	const edgeGeom = makeGeom(24); // 12 edges × 2 pts
	const faceGeom = makeGeom(36); // 6 faces × 2 tris × 3 pts
	const edgeMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color(CYAN), transparent: true });
	// fire 42 (user: the cube reads flat): per-face vertex colors — base
	// darkest, top brightest, the four sides graded — so the tilted camera
	// shows form instead of one flat teal slab
	const FACE_SHADES = [0.5, 1.0, 0.72, 0.8, 0.88, 0.95];
	const faceColors = new Float32Array(36 * 3);
	FACE_SHADES.forEach((shade, face) => {
		for (let v = 0; v < 6; v++) {
			faceColors[(face * 6 + v) * 3] = shade;
			faceColors[(face * 6 + v) * 3 + 1] = shade;
			faceColors[(face * 6 + v) * 3 + 2] = shade;
		}
	});
	faceGeom.setAttribute("color", new THREE.BufferAttribute(faceColors, 3));
	const faceMaterial = new THREE.MeshBasicMaterial({
		color: new THREE.Color(CYAN),
		vertexColors: true,
		transparent: true,
		opacity: 0.22,
		side: THREE.DoubleSide,
		depthWrite: false
	});

	$: writeCube($det3Entries, $det3Fx.edgeDrawT);
	let nanLogged = false;
	function writeCube([a, b, c, d, e, f, g, h, i], drawT = 1) {
		// image of every corner under the 3×3 (columns act on the vector)
		const img = CORNERS.map(([x, y, z]) => [
			a * x + b * y + c * z,
			d * x + e * y + f * z,
			g * x + h * y + i * z
		]);
		if (img.some((p) => !p.every(Number.isFinite))) {
			if (!nanLogged) {
				nanLogged = true;
				console.warn("[det3] non-finite corner image — skipping geometry write");
			}
			return;
		}
		nanLogged = false;
		const lift = (p) => [p[0], p[1], p[2] + H];
		const ep = edgeGeom.attributes.position.array;
		EDGE_PAIRS.forEach(([i0, i1], k) => {
			const p0 = lift(img[i0]);
			const p1 = lift(img[i1]);
			ep.set(p0, k * 6);
			ep.set(p1, k * 6 + 3);
		});
		edgeGeom.attributes.position.needsUpdate = true;
		// draw-on: reveal whole edges (2 verts each) up to the progress
		edgeGeom.setDrawRange(0, Math.floor(Math.min(Math.max(drawT, 0), 1) * 12) * 2);
		edgeGeom.computeBoundingSphere();
		const fp = faceGeom.attributes.position.array;
		let w = 0;
		const tri = (p0, p1, p2) => {
			fp.set(lift(p0), w); fp.set(lift(p1), w + 3); fp.set(lift(p2), w + 6);
			w += 9;
		};
		FACE_QUADS.forEach(([i0, i1, i2, i3]) => {
			tri(img[i0], img[i1], img[i2]);
			tri(img[i0], img[i2], img[i3]);
		});
		faceGeom.attributes.position.needsUpdate = true;
		faceGeom.computeBoundingSphere();
	}

	// material scalars (det3Fx-driven, like DetScene's applyShapeMaterials)
	$: applyMaterials($det3Fx.storyReveal, $det3Fx.faceT);
	function applyMaterials(reveal, faceT) {
		edgeMaterial.opacity = reveal;
		faceMaterial.opacity = 0.22 * reveal * Math.min(Math.max(faceT, 0), 1);
	}

	// the basis images + the far corner, for the labels and live chips
	$: detA = $det3Entries;
	$: colA = [detA[0], detA[3], detA[6]];
	$: colB = [detA[1], detA[4], detA[7]];
	$: colC = [detA[2], detA[5], detA[8]];
	$: colD = [detA[0] + detA[1] + detA[2], detA[3] + detA[4] + detA[5], detA[6] + detA[7] + detA[8]];
	// fire 42 (user: the 3D labels collide): the letters hug the corners and
	// the coordinate chips ride an outward ring away from the cube center —
	// the fire-20 2D pattern applied to the 3D scene
	$: cubeCenter = [colD[0] / 2, colD[1] / 2, colD[2] / 2];
	function outward3(p) {
		const vx = p[0] - cubeCenter[0], vy = p[1] - cubeCenter[1], vz = p[2] - cubeCenter[2];
		const len = Math.hypot(vx, vy, vz) || 1e-6;
		return [vx / len, vy / len, vz / len];
	}
	const fmt3 = (n) => (Math.round(n * 100) / 100).toFixed(2);
	const fmtV = (p) => `(${fmt3(p[0])}, ${fmt3(p[1])}, ${fmt3(p[2])})`;

	// the collapse beat's two marked points — inputs differ by a null-space
	// vector of the collapse matrix, so their images coincide exactly
	const P1 = [0.5, 0.4, 0.5];
	const P2 = [0.74, 0.64, 0.26];
	$: imgP1 = apply3($det3Entries, P1);
	$: imgP2 = apply3($det3Entries, P2);
	function apply3([a, b, c, d, e, f, g, h, i], [x, y, z]) {
		return [a * x + b * y + c * z, d * x + e * y + f * z, g * x + h * y + i * z];
	}
	$: imagesConverged =
		$det3dStep >= 4 && $det3dStep <= 5 && $det3Collapsed &&
		Math.hypot(imgP1[0] - imgP2[0], imgP1[1] - imgP2[1], imgP1[2] - imgP2[2]) < 0.12;
</script>

<!-- the cube story — visible while the 3D section is engaged (det3dStep ≥ 1) -->
{#if $det3dStep >= 1}
	<T is={THREE.LineSegments} geometry={edgeGeom} material={edgeMaterial} />
	<T is={THREE.Mesh} geometry={faceGeom} material={faceMaterial} />

	<!-- corner labels (P5.1): P1 at the origin, then the fire-78 I1 uniform
	     P-numbering BY INPUT CORNER — the label rides the image of the input
	     it names: P2 = e1's image, P4 = e2's image, P5 = e3's image, P7 the
	     far corner (the old O/A/B/C/D labels named basis slots that disagreed
	     with the game's input-corner names — the P-numbering unifies them) -->
	<HTML pointerEvents="none" position={[0, 0, H + 0.02]} center>
		<span class="det-corner-dot" style:opacity={$det3Fx.storyReveal} />
	</HTML>
	<HTML pointerEvents="none" position={[0, 0, H - 0.32]} center>
		<span class="det-corner" style:color={WHITE} style:opacity={$det3Fx.storyReveal}>P1</span>
	</HTML>
	{#each [{ n: "P2", p: colA, c: "#ff79c6" }, { n: "P4", p: colB, c: "#bd93f9" }, { n: "P5", p: colC, c: "#f1fa8c" }, { n: "P7", p: colD, c: WHITE }] as L (L.n)}
		{@const o = outward3(L.p)}
		<HTML pointerEvents="none" position={[L.p[0] + o[0] * 0.3, L.p[1] + o[1] * 0.3, L.p[2] + H + 0.28]} center>
			<span class="det-corner" style:color={L.c} style:opacity={$det3Fx.stepInT}>{L.n}</span>
		</HTML>
		<!-- fire 75 (H3): the chip ring went 1.05 -> 1.3 — at 1.05 the chips of
		     adjacent corners collided with each other and with the origin's O
		     letter on every geometry the frames checked (the beat-1/3 shots) -->
		<HTML pointerEvents="none" position={[L.p[0] + o[0] * 1.3, L.p[1] + o[1] * 1.3, L.p[2] + H + 0.72]} center>
			<span class="det-chip" style:opacity={$det3Fx.stepInT}>{fmtV(L.p)}</span>
		</HTML>
	{/each}

	<!-- P5.2 guessing: the floor-click ghost — previews the full 3D guess
	     point (floor x/y from the click, height from the dock slider) before
	     the player commits -->
	{#if g.mode === "corners" && g.status === "asking" && g.guess}
		{@const gz = $det3GuessZ}
		<T is={THREE.Mesh} position={[g.guess.x, g.guess.y, gz + H]} scale={Math.max($det3Fx.stepInT, 0.001)}>
			<sphereGeometry args={[0.08, 16, 16]} />
			<meshBasicMaterial color={WHITE} />
		</T>
		<T is={THREE.Mesh} position={[g.guess.x, g.guess.y, H + 0.01]}>
			<ringGeometry args={[0.06, 0.11, 24]} />
			<meshBasicMaterial color={WHITE} side={THREE.DoubleSide} transparent opacity={0.8} />
		</T>
		<HTML pointerEvents="none" position={[g.guess.x, g.guess.y, gz + H + 0.34]} center>
			<span class="det-chip" style:opacity={Math.max($det3Fx.stepInT, 0)}>
				({fmt3(g.guess.x)}, {fmt3(g.guess.y)}, {fmt3(gz)})
			</span>
		</HTML>
	{/if}

	<!-- fire 80 (I4): the asked corner pulses while the round asks — the
	     "know what you're answering" beat — and the reveal dot flies the truth
	     from the committed guess to the real landing during the reveal -->
	{#if askedPt3}
		<HTML pointerEvents="none" position={[askedPt3.point[0], askedPt3.point[1], askedPt3.point[2] + H + 0.32]} center>
			<span class="det-pulse-ring" />
		</HTML>
		<HTML pointerEvents="none" position={[askedPt3.point[0], askedPt3.point[1], askedPt3.point[2] + H + 0.66]} center>
			<span class="det-corner" style:color={YELLOW} style:opacity={Math.max($det3Fx.stepInT, 0.55)}>
				{askedPt3.name}?
			</span>
		</HTML>
	{/if}
	{#if g.mode === "corners"}
		<T
			is={THREE.Mesh}
			geometry={revealDotGeom3}
			material={revealDotMat3}
			position={[revealPos3[0], revealPos3[1], revealPos3[2]]}
		/>
	{/if}

	<!-- collapse beat: two marked inputs whose images coincide — the 3D
	     sibling of the 2D story's ambiguity moment -->
	{#if $det3dStep >= 4 && $det3dStep <= 5}
		<T is={THREE.Mesh} position={[P1[0], P1[1], P1[2] + H]} scale={Math.max($det3Fx.stepInT, 0.001)}>
			<sphereGeometry args={[0.055, 16, 16]} />
			<meshBasicMaterial color={YELLOW_COL} />
		</T>
		<T is={THREE.Mesh} position={[P2[0], P2[1], P2[2] + H]} scale={Math.max($det3Fx.stepInT, 0.001)}>
			<sphereGeometry args={[0.055, 16, 16]} />
			<meshBasicMaterial color={PINK_COL} />
		</T>
		{#if $det3Collapsed}
			<HTML pointerEvents="none" position={[imgP1[0], imgP1[1], imgP1[2] + H + 0.42]} center>
				<span class="det-chip" style:opacity={Math.max($det3Fx.imgT, 0)}>P9 → {fmtV(imgP1)}</span>
			</HTML>
			<HTML pointerEvents="none" position={[imgP2[0], imgP2[1], imgP2[2] + H - 0.5]} center>
				<span class="det-chip" style:opacity={Math.max($det3Fx.imgT, 0)}>P10 → {fmtV(imgP2)}</span>
			</HTML>
		{/if}
		{#if imagesConverged}
			<HTML pointerEvents="none" position={[imgP1[0], imgP1[1], imgP1[2] + H + 1.15]} center>
				<div class="det-callout" style:opacity={$det3Fx.imgT}>
					Which point did this come from?
					<b>Ambiguous — no inverse exists.</b>
				</div>
			</HTML>
		{/if}
	{/if}
{/if}
