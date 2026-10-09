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
	import { gsap } from "$utils/gsap.js";
	import { detStep, detEntries, detCollapsed, detGame, detFx } from "$stores/det.js";
	import { det3dStep } from "$stores/det3.js";
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
	// REG-2 catch: this buffer was Float32Array(16) — not a multiple of 3 —
	// so writeQuad's 24 floats silently dropped their tail, three read a
	// ragged 6th vertex out of bounds and computeBoundingSphere logged NaN
	// on every single write (70+ per story walk), with only 2 of the 4
	// square edges ever rendered. 4 edges × 2 verts × 3 floats = 24.
	const edgeGeom = new THREE.BufferGeometry();
	edgeGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(24), 3));

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

	// U3: anchor each corner label OUTWARD along its own diagonal
	// (corner − parallelogram center), so labels sit outside the shape for
	// every matrix instead of using fixed vertical offsets that drop C's
	// label into the shape and leave A's floating in empty space. Degenerate
	// (det ≈ 0) images are segments: the interior corners' labels fan out on
	// opposite sides of the line and the end corners point away along it —
	// which also keeps them from stacking on collapse rounds.
	function outwardDir(x, y, fallback) {
		const len = Math.hypot(x, y);
		if (len < 0.25) return fallback;
		return [x / len, y / len];
	}
	$: cornerAnchor = (() => {
		// user polish (fire 20): corner DOTS sit exactly on the geometry and
		// the letters hug them — 0.5/0.55 left the letters reading as floating
		// far from their corners. Full-QA fire 20: the collapse fan went back
		// out to 0.55 — at 0.34 the A letter sat under the converged P₂ chip
		const hug = 0.3;
		const fanHug = 0.34;
		const fanOut = 0.55;
		const diagX = a + b;
		const diagY = c + d;
		const diagLen = Math.hypot(diagX, diagY) || 1e-6;
		const dir = [diagX / diagLen, diagY / diagLen];
		const perp = [-dir[1], dir[0]];
		if ($detCollapsed) {
			return {
				o: [-dir[0] * hug, -dir[1] * hug],
				a: [perp[0] * fanOut, perp[1] * fanOut],
				c: [-perp[0] * fanOut, -perp[1] * fanOut],
				b: [dir[0] * hug, dir[1] * hug]
			};
		}
		const sideX = a - b;
		const sideY = c - d;
		return {
			o: [-dir[0] * hug, -dir[1] * hug],
			a: outwardDir(sideX, sideY, perp).map((v) => v * fanHug),
			c: outwardDir(-sideX, -sideY, [-perp[0], -perp[1]]).map((v) => v * fanHug),
			b: [dir[0] * hug, dir[1] * hug]
		};
	})();

	// fire 20 full-QA: the ambiguity callout anchored straight above the
	// converged point and landed ON the C-corner cluster (100% cover of the
	// C letter, its chip, and the diagonal label). Anchor it on the line's
	// LEFT side instead (perpendicular 2.6 out) — always the empty flank
	// fire 20 full-QA: the collapse pushes A/C chips deeper (their hug ring sat
	// under the own-chip and the converged P-chips)
	$: chipRing = $detCollapsed ? 1.8 : 1.25;
	$: calloutAnchor = (() => {
		const diagX = a + b;
		const diagY = c + d;
		const len = Math.hypot(diagX, diagY) || 1e-6;
		let px = -diagY / len, py = diagX / len;
		if (px > 0) { px = -px; py = -py; } // keep the leftward normal
		return [img1[0] + px * 2.6, img1[1] + py * 2.6];
	})();

	// sample images (collapse story)
	$: img1 = [a * P1[0] + b * P1[1], c * P1[0] + d * P1[1]];
	$: img2 = [a * P2[0] + b * P2[1], c * P2[0] + d * P2[1]];
	$: imagesConverged =
		$detStep >= 4 && $detStep <= 5 && $detCollapsed &&
		Math.hypot(img1[0] - img2[0], img1[1] - img2[1]) < 0.12;

	// U6: story T-labels ride their arrows — half-way along each column
	// vector with a perpendicular offset (T(e₂) on the opposite flank), and
	// T(e₁)+T(e₂) 60% along the O→B′ diagonal, offset to its empty side
	$: tLabelA = (() => {
		const len = Math.hypot(a, c) || 1e-6;
		const ux = a / len, uy = c / len;
		return [a * 0.5 - uy * 0.34, c * 0.5 + ux * 0.34];
	})();
	$: tLabelB = (() => {
		const len = Math.hypot(b, d) || 1e-6;
		const ux = b / len, uy = d / len;
		// fire 20 full-QA: flipped to the upper flank — the lower flank sat
		// inside the collapse converged-chip zone at every ring tried
		return [b * 0.5 - uy * 0.34, d * 0.5 + ux * 0.34];
	})();
	$: tLabelDiag = (() => {
		const dx = a + b, dy = c + d;
		const len = Math.hypot(dx, dy) || 1e-6;
		const ux = dx / len, uy = dy / len;
		// fire 24: 75% along — at 60% the wide label reached A's hug anchor
		// (fire 20 brought the letters in) on every shape with a wide-B diagonal
		return [dx * 0.75 - uy * 0.36, dy * 0.75 + ux * 0.36];
	})();

	/* game markers (P2.3): per-corner round results + inverse-round markers */
	$: g = $detGame;
	$: gAsk = g.status === "asking";
	$: inverseRound = g.mode === "inverse";
	$: gPreimages = g.result && g.result.preimages ? g.result.preimages : null;
	// connector from the latest guess to the truth — colored by the check
	// result (green/red, purple for the ambiguous reveal)
	$: gConnector = g.result && g.guess ? [g.guess, g.result.answer] : null;
	const fmtG = (n) => (Math.round(n * 100) / 100).toFixed(2);

	// U6: the per-corner outward unit direction reused by the reveal chips —
	// they stack at 1.05 units out, beyond the letters (anchors hug the dots
	// at 0.3–0.34 since fire 20)
	$: cornerAnchorUnit = (() => {
		const parts = { a: cornerAnchor.a, b: cornerAnchor.b, c: cornerAnchor.c };
		const out = {};
		for (const k of Object.keys(parts)) {
			const len = Math.hypot(parts[k][0], parts[k][1]) || 1e-6;
			out[k] = [parts[k][0] / len, parts[k][1] / len];
		}
		out.o = out.a; // O results (never asked, safe fallback)
		return out;
	})();
	function resultOffset(name) {
		const u = cornerAnchorUnit[(name || "a").toLowerCase()] || cornerAnchorUnit.a;
		return [u[0] * 1.05, u[1] * 1.05];
	}

	/* U5: the INPUT shape ghost while a round asks. The question names input
	   points ("Where does A (1,0) land?"), so the original square (or the
	   shifted input shape, whose corners live in round.corners[].point) is
	   drawn as a faint outline with input-coord chips; the image shape's
	   letters prime to P2′/P3′/P4′ so input and image never blur together */
	const ghostGeom = new THREE.BufferGeometry();
	ghostGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
	const ghostMat = new THREE.LineBasicMaterial({
		color: new THREE.Color("#f8f8f2"),
		transparent: true,
		opacity: 0.35
	});
	$: ghostQuad = (() => {
		if (!g.round || !gAsk) return null;
		if (inverseRound) return [[0, 0], [1, 0], [1, 1], [0, 1]];
		if (g.round.corners) {
			const [A, B, C] = g.round.corners.map((c) => c.point);
			return [[0, 0], A, B, C];
		}
		return null;
	})();
	$: writeGhost(ghostQuad);
	function writeGhost(quad) {
		if (!quad) return;
		const arr = ghostGeom.attributes.position.array;
		for (let i = 0; i < 4; i++) {
			const [x, y] = quad[i];
			if (!Number.isFinite(x) || !Number.isFinite(y)) return; // NaN guard (RUN 48)
			arr[i * 3] = x;
			arr[i * 3 + 1] = y;
			arr[i * 3 + 2] = Z + 0.02;
		}
		ghostGeom.attributes.position.needsUpdate = true;
		ghostGeom.computeBoundingSphere();
	}
	$: ghostAnchors = (() => {
		if (!ghostQuad) return null;
		const [, A, , C] = ghostQuad;
		const diagX = A[0] + C[0];
		const diagY = A[1] + C[1];
		const diagLen = Math.hypot(diagX, diagY) || 1e-6;
		const dir = [diagX / diagLen, diagY / diagLen];
		const sideX = A[0] - C[0];
		const sideY = A[1] - C[1];
		return {
			o: [-dir[0] * 0.45, -dir[1] * 0.45],
			a: outwardDir(sideX, sideY, [-dir[1], dir[0]]).map((v) => v * 0.5),
			b: [dir[0] * 0.45, dir[1] * 0.45],
			c: outwardDir(-sideX, -sideY, [dir[1], -dir[0]]).map((v) => v * 0.5)
		};
	})();
	$: ghostLabels =
		ghostQuad && ghostAnchors
			? [
				{ name: "P1", x: ghostAnchors.o[0], y: ghostAnchors.o[1], color: "#f8f8f2", chip: null },
				{ name: "P2", x: ghostQuad[1][0] + ghostAnchors.a[0], y: ghostQuad[1][1] + ghostAnchors.a[1], color: colorX, chip: `(${fmtG(ghostQuad[1][0])}, ${fmtG(ghostQuad[1][1])})` },
				{ name: "P3", x: ghostQuad[2][0] + ghostAnchors.b[0], y: ghostQuad[2][1] + ghostAnchors.b[1], color: "#f8f8f2", chip: `(${fmtG(ghostQuad[2][0])}, ${fmtG(ghostQuad[2][1])})` },
				{ name: "P4", x: ghostQuad[3][0] + ghostAnchors.c[0], y: ghostQuad[3][1] + ghostAnchors.c[1], color: colorY, chip: `(${fmtG(ghostQuad[3][0])}, ${fmtG(ghostQuad[3][1])})` }
			]
			: [];

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

	/* named corners + parallelogram-law diagonal (P1.3) */
	// opacity shared by every corner/diagonal label: the entrance scalars own
	// it (storyReveal during the entry cinematic, stepInT on step changes and
	// the exit fade) — they appear and disappear with the shapes, never pop
	$: cornerOp = Math.min($detFx.storyReveal, $detFx.stepInT);

	// dashed diagonal O→B where B = T(e₁)+T(e₂): LineDashedMaterial needs a
	// lineDistance attribute, computed by hand for the two-point segment —
	// THREE.Line.computeLineDistances() is a method on the object, which the
	// declarative <T> markup path can't call per-tick
	const diagGeom = new THREE.BufferGeometry();
	diagGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
	diagGeom.setAttribute("lineDistance", new THREE.BufferAttribute(new Float32Array(2), 1));
	const diagMat = new THREE.LineDashedMaterial({
		color: new THREE.Color(PURPLE),
		dashSize: 0.16,
		gapSize: 0.1,
		transparent: true,
		opacity: 0
	});
	$: writeDiag(a + b, c + d, $detFx.stepInT);
	function writeDiag(x, y, t) {
		if (![x, y, t].every((v) => Number.isFinite(v))) return;
		const p = diagGeom.attributes.position.array;
		p[0] = 0;
		p[1] = 0;
		p[2] = Z + 0.012;
		p[3] = x;
		p[4] = y;
		p[5] = Z + 0.012;
		diagGeom.attributes.position.needsUpdate = true;
		const ld = diagGeom.attributes.lineDistance;
		ld.array[0] = 0;
		ld.array[1] = Math.hypot(x, y);
		ld.needsUpdate = true;
		diagGeom.computeBoundingSphere();
		diagMat.opacity = 0.75 * t;
	}

	// fire 76 (H4b): the intro construction — the unit-square outline draws on
	// with approachT (O -> e1 -> e1+e2 -> e2), so the solid square that arrives
	// at step 1 lands on a visible "spanned by the two basis vectors" build-up
	const introOutlineGeom = new THREE.BufferGeometry();
	introOutlineGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
	{
		const pts = [
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 1]
		];
		const arr = introOutlineGeom.attributes.position.array;
		pts.forEach(([x, y], i) => {
			arr[i * 3] = x;
			arr[i * 3 + 1] = y;
			arr[i * 3 + 2] = Z + 0.015;
		});
		introOutlineGeom.attributes.position.needsUpdate = true;
		introOutlineGeom.computeBoundingSphere();
	}
	const introOutlineMat = new THREE.LineBasicMaterial({
		color: new THREE.Color("#f8f8f2"),
		transparent: true,
		opacity: 0.55
	});
	$: introOutlineGeom.setDrawRange(0, Math.floor(Math.min(Math.max($detFx.approachT, 0), 1) * 4));
	/* fire 78 (H5): the plotted candidate + where it will land — a click now
	   PLOTS (setDetPending), the Accept button commits; the plot renders as a
	   solid ring with its image ghost + connector, and the hover ghost gains
	   the same image preview so the user aims at where the point ENDS UP */
	function mulM([a, b, c, d], [x, y]) {
		return [a * x + b * y, c * x + d * y];
	}
	$: pendingPt = $detGame.pending;
	$: pendingImg = pendingPt ? mulM($detEntries, pendingPt) : null;
	$: hoverImg = $detFx.hoverPt ? mulM($detEntries, $detFx.hoverPt) : null;
	const plotConnectorGeom = new THREE.BufferGeometry();
	plotConnectorGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
	const plotConnectorMat = new THREE.LineBasicMaterial({
		color: new THREE.Color(PURPLE),
		transparent: true,
		opacity: 0.6
	});
	$: writePlotConnector(pendingPt, pendingImg);
	function writePlotConnector(p, im) {
		if (!p || !im || !p.every(Number.isFinite) || !im.every(Number.isFinite)) {
			plotConnectorGeom.setDrawRange(0, 0);
			return;
		}
		const arr = plotConnectorGeom.attributes.position.array;
		arr[0] = p[0];
		arr[1] = p[1];
		arr[2] = Z + 0.02;
		arr[3] = im[0];
		arr[4] = im[1];
		arr[5] = Z + 0.02;
		plotConnectorGeom.setDrawRange(0, 2);
		plotConnectorGeom.attributes.position.needsUpdate = true;
		plotConnectorGeom.computeBoundingSphere();
	}

	/* fire 80 (I4): the asked point's pulse + the animated reveal. While a
	   corner round asks, the INPUT corner being asked about pulses (the
	   "know what you're answering" beat); on each Accept a marker flies from
	   that input point to where it really lands while the round is revealing */
	$: askedPt =
		gAsk && g.mode === "corners" && g.round && g.round.index < g.round.corners.length
			? g.round.corners[g.round.index]
			: null;
	const revealDotGeom = new THREE.SphereGeometry(0.075, 16, 16);
	const revealDotMat = new THREE.MeshBasicMaterial({
		color: new THREE.Color(YELLOW),
		transparent: true,
		opacity: 0
	});
	let revealPos = [0, 0];
	let revealTl = null;
	let lastRevealResult = null;
	$: onReveal($detGame);
	function onReveal(gg) {
		const res = gg.result;
		if (
			gg.status === "revealing" &&
			res &&
			res !== lastRevealResult &&
			gg.round &&
			gg.round.index > 0 &&
			gg.mode === "corners"
		) {
			lastRevealResult = res;
			const from = gg.round.corners[gg.round.index - 1].point;
			const to = res.answer;
			if (![from[0], from[1], to[0], to[1]].every(Number.isFinite)) return;
			if (revealTl) revealTl.kill();
			revealDotMat.color.set(res.type === "correct" ? GREEN : RED);
			revealDotMat.opacity = 1;
			const proxy = { t: 0 };
			revealTl = gsap.to(proxy, {
				t: 1,
				duration: 0.8,
				ease: "power2.inOut",
				overwrite: "auto",
				onUpdate: () => {
					const t = proxy.t;
					revealPos = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
				},
				onComplete: () => {
					gsap.to(revealDotMat, { opacity: 0, duration: 0.3, overwrite: "auto" });
				}
			});
		} else if (gg.status !== "revealing" && revealTl) {
			revealTl.kill();
			revealTl = null;
			gsap.to(revealDotMat, { opacity: 0, duration: 0.25, overwrite: "auto" });
		}
	}
</script>

<!-- det shapes — visible while the det section is on screen (detStep ≥ 1)
     and the 3D story has not taken the canvas over (fire 37: the 2D square,
     letters and chips used to render UNDER the 3D cube with a second naming
     system — the cube replaces the plane entirely). fire 76 (H4b): the intro
     construction shows during the approach (detStep 0, approachT > 0) -->
{#if $det3dStep === 0 && ($detStep >= 1 || $detFx.approachT > 0.001)}
	<T is={THREE.Mesh} geometry={fillGeom} material={fillMaterial} />
	<T is={THREE.LineSegments} geometry={edgeGeom} material={edgeMaterial} />

	<!-- named corners (P1.3; fire-78 I1 uniform P-numbering): the square reads
	     P1 P2 P3 P4 — P1 is the origin, P2 where e₁ lands, P4 where e₂ lands,
	     P3 the far corner (the game's corner names ARE these input corners).
	     The letters stay in the try-it (they identify which corner the game
	     asks about) and PRIME to P2′/P3′/P4′ while a round is live — the input
	     names belong to the ghost square (U5). The
	     coordinate chips are story content — during a round they'd print the
	     answers, so they end at step 5; the game gets its own labeling.
	     Fire 20 (user polish): a dot pins each corner exactly; the letter
	     anchors hug it (0.3–0.34 out) -->
	<HTML pointerEvents="none" position={[0, 0, 0.3]} center>
		<span class="det-corner-dot" style:opacity={cornerOp} />
	</HTML>
	<HTML pointerEvents="none" position={[col1[0], col1[1], 0.3]} center>
		<span class="det-corner-dot" style:opacity={cornerOp} style:background={colorX} />
	</HTML>
	<HTML pointerEvents="none" position={[col2[0], col2[1], 0.3]} center>
		<span class="det-corner-dot" style:opacity={cornerOp} style:background={colorY} />
	</HTML>
	<HTML pointerEvents="none" position={[a + b, c + d, 0.3]} center>
		<span class="det-corner-dot" style:opacity={cornerOp} />
	</HTML>
	<HTML pointerEvents="none" position={[cornerAnchor.o[0], cornerAnchor.o[1], 0.3]} center>
		<span class="det-corner" style:opacity={cornerOp}>P1</span>
	</HTML>
	<HTML pointerEvents="none" position={[col1[0] + cornerAnchor.a[0], col1[1] + cornerAnchor.a[1], 0.3]} center>
		<span class="det-corner" style:color={colorX} style:opacity={cornerOp}>{g.round ? "P2′" : "P2"}</span>
	</HTML>
	<HTML pointerEvents="none" position={[col2[0] + cornerAnchor.c[0], col2[1] + cornerAnchor.c[1], 0.3]} center>
		<span class="det-corner" style:color={colorY} style:opacity={cornerOp}>{g.round ? "P4′" : "P4"}</span>
	</HTML>
	<HTML pointerEvents="none" position={[a + b + cornerAnchor.b[0], c + d + cornerAnchor.b[1], 0.3]} center>
		<span class="det-corner" style:opacity={cornerOp}>{g.round ? "P3′" : "P3"}</span>
	</HTML>
	<!-- coord chips ride their own ring (chipRing out along - 1.25 story / 1.8 collapse the corner's outward
	     unit): at the hug distances the inline chips collided with the shape
	     edge and the mid-shaft T-labels, and B's wide chip clipped its letter
	     at 0.7 — chips are story-only so they can never meet the 1.05
	     reveal-chip ring -->
	{#if $detStep <= 5}
		<HTML pointerEvents="none" position={[col1[0] + cornerAnchorUnit.a[0] * chipRing, col1[1] + cornerAnchorUnit.a[1] * chipRing, 0.3]} center>
			<span class="det-chip" style:opacity={cornerOp}>({fmtG(col1[0])}, {fmtG(col1[1])})</span>
		</HTML>
		<HTML pointerEvents="none" position={[col2[0] + cornerAnchorUnit.c[0] * chipRing, col2[1] + cornerAnchorUnit.c[1] * chipRing, 0.3]} center>
			<span class="det-chip" style:opacity={cornerOp}>({fmtG(col2[0])}, {fmtG(col2[1])})</span>
		</HTML>
		<HTML pointerEvents="none" position={[a + b + cornerAnchorUnit.b[0] * chipRing, c + d + cornerAnchorUnit.b[1] * chipRing, 0.3]} center>
			<span class="det-chip" style:opacity={cornerOp}>({fmtG(a + b)}, {fmtG(c + d)})</span>
		</HTML>
	{/if}

	<!-- fire 76 (H4b): the column vectors anchor from the intro onward —
	     e₁/e₂ during the approach and at step 1 (identity), T(e₁)/T(e₂) from
	     step 2 as before (det-st-1's text: "the corner spanned by the two
	     basis vectors") -->
	{#if $detStep >= 1 || ($detStep === 0 && $detFx.approachT > 0.001)}
		<!-- parallelogram law (P1.3): the dashed O→B diagonal is T(e₁)+T(e₂) —
		     story content only, off the try-it board (U7) -->
		{#if $detStep >= 2 && $detStep <= 5}
			<T is={THREE.Line} geometry={diagGeom} material={diagMat} />
		{/if}
		<T.Group scale={Math.max($detStep === 0 ? $detFx.approachT : $detFx.stepInT, 0.001)}>
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

		<!-- T(e₁)/T(e₂)/T(e₁)+T(e₂) name labels are story content — steps 2–5
		     only (U7). U6: they anchor to the arrow MIDSHAFTS (and 60% along the
		     diagonal) with a perpendicular offset instead of stacking on the
		     corner labels; on collapse lines the midshafts are still spread
		     along the line, so the old vertical pile dissolves -->
		{#if $detStep === 0}
			<!-- the intro construction: the square outline draws on with
			     approachT and the basis vectors carry their own names -->
			<T is={THREE.LineLoop} geometry={introOutlineGeom} material={introOutlineMat} />
			<HTML pointerEvents="none" position={[tLabelA[0], tLabelA[1], 0.3]} center>
				<span class="det-label" style:color={colorX} style:opacity={$detFx.approachT}>e₁</span>
			</HTML>
			<HTML pointerEvents="none" position={[tLabelB[0], tLabelB[1], 0.3]} center>
				<span class="det-label" style:color={colorY} style:opacity={$detFx.approachT}>e₂</span>
			</HTML>
		{:else if $detStep === 1}
			<HTML pointerEvents="none" position={[tLabelA[0], tLabelA[1], 0.3]} center>
				<span class="det-label" style:color={colorX} style:opacity={$detFx.stepInT} style:transform={`translateY(${(1 - $detFx.stepInT) * 8}px)`}>e₁</span>
			</HTML>
			<HTML pointerEvents="none" position={[tLabelB[0], tLabelB[1], 0.3]} center>
				<span class="det-label" style:color={colorY} style:opacity={$detFx.stepInT} style:transform={`translateY(${(1 - $detFx.stepInT) * 8}px)`}>e₂</span>
			</HTML>
		{:else if $detStep <= 5}
			<HTML pointerEvents="none" position={[tLabelA[0], tLabelA[1], 0.3]} center>
				<span class="det-label" style:color={colorX} style:opacity={$detFx.stepInT} style:transform={`translateY(${(1 - $detFx.stepInT) * 8}px)`}>T(e₁)</span>
			</HTML>
			<HTML pointerEvents="none" position={[tLabelB[0], tLabelB[1], 0.3]} center>
				<span class="det-label" style:color={colorY} style:opacity={$detFx.stepInT} style:transform={`translateY(${(1 - $detFx.stepInT) * 8}px)`}>T(e₂)</span>
			</HTML>
			<HTML pointerEvents="none" position={[tLabelDiag[0], tLabelDiag[1], 0.3]} center>
				<span class="det-corner" style:color={PURPLE} style:opacity={cornerOp}>T(e₁)+T(e₂)</span>
			</HTML>
		{/if}
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
		<!-- named sample points (P1.3 + A1): the inputs keep name-only chips;
		     the COORD chips ride the image spheres so "different inputs, same
		     output" reads as two arrows converging to identical numbers -->
		<!-- fire 25: below the sphere — above collided with the T(e₂) mid-shaft
		     label at the collapse -->
		<!-- fire 75 (H3, user: "we can just use P1 p2 etc"): plain digits — the
		     unicode subscripts read as misaligned next to the coordinate chips -->
		<HTML pointerEvents="none" position={[P1[0], P1[1] - 0.4, 0.3]} center>
			<span class="det-chip" style:opacity={Math.max($detFx.stepInT, 0)}>P5</span>
		</HTML>
		<HTML pointerEvents="none" position={[P2[0] + 0.42, P2[1] - 0.34, 0.3]} center>
			<span class="det-chip" style:opacity={Math.max($detFx.stepInT, 0)}>P6</span>
		</HTML>
		{#if $detCollapsed}
			<T is={THREE.Mesh} position={[img1[0], img1[1], 0.09]} scale={Math.max($detFx.imgT, 0.001)}>
				<sphereGeometry args={[0.07, 16, 16]} />
				<meshBasicMaterial color={YELLOW} />
			</T>
			<T is={THREE.Mesh} position={[img2[0], img2[1], 0.1]} scale={Math.max($detFx.imgT, 0.001)}>
				<sphereGeometry args={[0.075, 16, 16]} />
				<meshBasicMaterial color={PINK} />
			</T>
			<HTML pointerEvents="none" position={[img1[0] + 0.62, img1[1] - 0.25, 0.4]} center>
				<span class="det-chip" style:opacity={Math.max($detFx.imgT, 0)}>P5 → ({fmtG(img1[0])}, {fmtG(img1[1])})</span>
			</HTML>
			<HTML pointerEvents="none" position={[img2[0] + 0.62, img2[1] - 0.85, 0.4]} center>
				<span class="det-chip" style:opacity={Math.max($detFx.imgT, 0)}>P6 → ({fmtG(img2[0])}, {fmtG(img2[1])})</span>
			</HTML>
		{/if}
		{#if imagesConverged}
			<HTML pointerEvents="none" position={[calloutAnchor[0], calloutAnchor[1], 0.4]} center>
				<div class="det-callout" style:opacity={$detFx.imgT}>
					Which point did this come from?
					<b>Ambiguous — no inverse exists.</b>
				</div>
			</HTML>
		{/if}
	{/if}

	<!-- U5: the input shape ghost + input-coord labels while a round asks —
	     the question's coordinates now name points that exist on screen -->
	{#if gAsk && g.round && ghostQuad}
		<T is={THREE.LineLoop} geometry={ghostGeom} material={ghostMat} />
		{#each ghostLabels as L (L.name)}
			<HTML pointerEvents="none" position={[L.x, L.y, 0.4]} center>
				<span class="det-corner" style:color={L.color} style:opacity={cornerOp}>{L.name}</span>
				{#if L.chip}<span class="det-chip" style:opacity={cornerOp}>{L.chip}</span>{/if}
			</HTML>
		{/each}
	{/if}

	<!-- corner-round markers (P2.1/P2.3): every submitted corner keeps its
	     guess ring and the true image marker through the round, so the
	     summary at the end reads against the full picture; the latest check
	     also gets a connector from the guess to the truth -->
	{#if g.round && g.mode === "corners"}
		{#each g.round.results as r, i (i)}
			<T is={THREE.Mesh} position={[r.guess[0], r.guess[1], 0.12]}>
				<torusGeometry args={[0.09, 0.022, 8, 32]} />
				<meshBasicMaterial color={r.type === "correct" ? GREEN : RED} />
			</T>
			<T is={THREE.Mesh} position={[r.answer[0], r.answer[1], 0.12]}>
				<sphereGeometry args={[0.065, 16, 16]} />
				<meshBasicMaterial color={r.type === "correct" ? GREEN : YELLOW} />
			</T>
			<!-- U6: result chips fan OUTWARD past their corner letter (which sits
			     at anchor·0.55) along the same diagonal — no more stacking on the
			     letter + corner chip + O cluster -->
			<HTML pointerEvents="none" position={[r.answer[0] + resultOffset(r.name)[0], r.answer[1] + resultOffset(r.name)[1], 0.4]} center>
				<span class="det-chip" style:color={r.type === "correct" ? GREEN : RED}>
					{r.name}′ ({fmtG(r.answer[0])}, {fmtG(r.answer[1])}) {r.type === "correct" ? "✓" : "✗"}
				</span>
			</HTML>
		{/each}
	{/if}

	<!-- inverse-round markers (P2.3): the marked image point while asking,
	     then the guess and its preimage — degenerate reveals circle every
	     origin that shares the image (the ambiguity IS the lesson) -->
	{#if inverseRound && g.round && g.status === "asking"}
		<T is={THREE.Mesh} position={[g.round.target[0], g.round.target[1], 0.12]}>
			<torusGeometry args={[0.16, 0.032, 8, 32]} />
			<meshBasicMaterial color={YELLOW} />
		</T>
		<HTML pointerEvents="none" position={[g.round.target[0], g.round.target[1] + 0.44, 0.4]} center>
			<span class="det-chip">landed at ({fmtG(g.round.target[0])}, {fmtG(g.round.target[1])})</span>
		</HTML>
	{/if}
	{#if inverseRound && g.status === "revealed" && g.guess && g.result}
		<T is={THREE.Mesh} position={[g.guess[0], g.guess[1], 0.12]}>
			<torusGeometry args={[0.09, 0.022, 8, 32]} />
			<meshBasicMaterial
				color={g.result.type === "correct" ? GREEN : g.result.type === "ambiguous" ? PURPLE : RED}
			/>
		</T>
		{#if g.result.type !== "ambiguous"}
			<T is={THREE.Mesh} position={[g.result.answer[0], g.result.answer[1], 0.12]}>
				<sphereGeometry args={[0.065, 16, 16]} />
				<meshBasicMaterial color={g.result.type === "correct" ? GREEN : YELLOW} />
			</T>
		{/if}
	{/if}
	{#if gPreimages}
		{#each gPreimages as p, i (i)}
			<T is={THREE.Mesh} position={[p[0], p[1], 0.12]}>
				<torusGeometry args={[0.2, 0.045, 8, 32]} />
				<meshBasicMaterial color={PURPLE} />
			</T>
		{/each}
	{/if}

	<!-- fire 80 (I4): the asked point pulses while a round asks — the "know
	     what you're answering" beat — and the reveal dot flies the truth from
	     the asked input point to its real landing during the reveal -->
	{#if askedPt}
		<HTML pointerEvents="none" position={[askedPt.point[0], askedPt.point[1], 0.32]} center>
			<span class="det-pulse-ring" />
		</HTML>
		<HTML pointerEvents="none" position={[askedPt.point[0], askedPt.point[1] + 0.46, 0.32]} center>
			<span class="det-corner" style:color={YELLOW} style:opacity={Math.max(cornerOp, 0.55)}>
				{askedPt.name}?
			</span>
		</HTML>
	{/if}
	{#if g.round && g.mode === "corners"}
		<T is={THREE.Mesh} geometry={revealDotGeom} material={revealDotMat} position={[revealPos[0], revealPos[1], 0.14]} />
	{/if}

	<!-- hover ghost: where the click would land right now — during asking
	     rounds AND all over the try-it sandbox (fire 50, user: "show a fake
	     plot point as you move the mouse so the user knows where it will end
	     up"); hoverPt is written by the engine's delegated pointermove
	     handler, gated to asking + detStep 6 there -->
	{#if (gAsk || $detStep === 6) && $detFx.hoverPt}
		<T is={THREE.Mesh} position={[$detFx.hoverPt[0], $detFx.hoverPt[1], 0.11]}>
			<torusGeometry args={[0.07, 0.014, 8, 32]} />
			<meshBasicMaterial color={"#f8f8f2"} transparent opacity={0.85} />
		</T>
		<!-- fire 78 (H5): the hover ghost's IMAGE — where the hovered point
		     will land under the current matrix (hollow ring) -->
		{#if hoverImg && hoverImg.every(Number.isFinite)}
			<T is={THREE.Mesh} position={[hoverImg[0], hoverImg[1], 0.11]}>
				<ringGeometry args={[0.05, 0.1, 24]} />
				<meshBasicMaterial color={"#f8f8f2"} transparent opacity={0.5} side={THREE.DoubleSide} />
			</T>
		{/if}
		<HTML pointerEvents="none" position={[$detFx.hoverPt[0], $detFx.hoverPt[1] + 0.32, 0.4]} center>
			<span class="det-chip">
				({fmtG($detFx.hoverPt[0])}, {fmtG($detFx.hoverPt[1])}){#if hoverImg && hoverImg.every(Number.isFinite)} → ({fmtG(hoverImg[0])}, {fmtG(hoverImg[1])}){/if}
			</span>
		</HTML>
	{/if}
	<!-- fire 78 (H5): the plotted candidate (solid purple ring) + its image
	     ghost + the connector — committed by the Accept button, moved by
	     re-clicking -->
	{#if gAsk && pendingPt && pendingImg}
		<T is={THREE.Line} geometry={plotConnectorGeom} material={plotConnectorMat} />
		<T is={THREE.Mesh} position={[pendingPt[0], pendingPt[1], 0.12]}>
			<torusGeometry args={[0.1, 0.022, 8, 32]} />
			<meshBasicMaterial color={PURPLE} />
		</T>
		<T is={THREE.Mesh} position={[pendingImg[0], pendingImg[1], 0.12]}>
			<torusGeometry args={[0.1, 0.022, 8, 32]} />
			<meshBasicMaterial color={PURPLE} transparent opacity={0.55} />
		</T>
	{/if}
	<!-- connector: latest guess → where that corner really lands -->
	{#if gConnector}
		<T is={THREE.Line} geometry={connectorGeom} material={connectorMat} />
	{/if}

	<!-- guess clicks land anywhere on the canvas: the engine's delegated
	     pointer handler resolves them analytically onto the story plane -->
{/if}
