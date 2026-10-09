<script>
	import Tex from "./Tex.svelte";
	import {
		matrixVectorFormulaColored,
		vectorAsLinearComb,
		matrixVectorFormulaEg,
		matrixVectorFormula3dEg
	} from "$data/tex";
	import Term from "./Term.svelte";
	import ColorText from "./ColorText.svelte";
	import Insight from "./Insight.svelte";
	import Intro from "./Intro.svelte";
	import P from "./P.svelte";
	import Spacer from "./Spacer.svelte";
	import Action from "./Action.svelte";
	import Section from "./Section.svelte";
	import B from "./B.svelte";
	import { Grab, Crosshair, Move3d } from "lucide-svelte";
	import ActionIcon from "./ActionIcon.svelte";
	import InteractionsList from "./InteractionsList.svelte";
	import { gsap, ScrollTrigger } from "$utils/gsap.js";
	import { onMount } from "svelte";
	import { arcadeMounted } from "$stores";

	// let mounted;

	// $: if (mounted && $arcadeMounted) animate();

	// onMount(() => {
	// 	mounted = true;
	// });

	// function animate() {
	// 	gsap.utils.toArray("#article section.animate > *").forEach((el) => {
	// 		let animation;

	// 		if (el.className === "exclude") {
  //       animation = gsap.timeline({ paused: true })
  //         .from(el, {
  //           opacity: 0,
  //           y: 100,
  //           duration: 0.6
  //         })
  //         .from(el.querySelectorAll('li'), {
  //           x: -40,
  //           opacity: 0,
  //           stagger: {
  //             amount: 0.3
  //           }
  //         })
	// 		} else {
	// 			animation = gsap.from(el, {
	// 				opacity: 0,
	// 				y: 20,
	// 				paused: true
	// 			});
	// 		}

	// 		ScrollTrigger.create({
	// 			trigger: el,
	// 			start: "top center",
	// 			animation,
	// 			pinnedContainer: "#article"
	// 		});
	// 	});
	// }
</script>

<div
	id="article"
	class="relative max-w-prose bg-gradient-to-l from-base-100 via-base-300 via-90% py-12"
>
	<div id="title-spacer" class="h-[2500px]" />

	<Intro />

	<div class="h-[500px]" />

	<!-- <section id="section-1" class="prose prose-xl [&>*]:px-10 [&>*]:rounded-xl"> -->
	<Section id="section-1" classNames="animate">
		<!-- <section class="prose prose-xl max-w-[50ch]"> -->
		<!-- <h2>Matrix as Linear Transformations</h2> -->

		<p>
			A vector multiplied by a matrix returns yet another vector — it <B
				>transforms</B
			> a vector into a new vector. Let's visualize this transformation with an example.
		</p>

		<!-- <h3>Vectors as a Linear Combination of Basis Vectors</h3> -->

		<Spacer />

		<P id="st-1">
			Let's first think about what the coordinates of a <ColorText color="in"
				>vector</ColorText
			> represent.
		</P>

		<!-- TODO: Animate the text decoration, syncing it with the rest of the animations -->
		<!-- TODO: On hover, highlights all the matching elements -->
		<P id="st-2">
			In the <Tex expr={"xy"} />-coordinate plane, any vector can be thought of
			as the sum of two scaled vectors: the unit vector in the
			<nobr><ColorText color="p"><Tex expr="x" />-direction</ColorText></nobr>,
			and the unit vector in the <ColorText color="s"
				><Tex expr="y" />-direction</ColorText
			>.
		</P>

		<!-- <P id="st-3">
			<Tex expr={vectorAsLinearComb} display color />
      The unit-vector in the x-direction is scaled by the x-coordinate of the vector, and the unit-vector in the y-direction is scaled by the y-coordinate of the vector.
    </P> -->

		<!-- <Tex
      expr={vectorAsLinearCombAlt}
      display
    /> -->

		<!-- TODO: Do text highlighting that syncs with the corresponding animation -->
		<P id="st-3">
			<Tex expr={vectorAsLinearComb} display color />
			These are also known as our <Term>standard basis vectors</Term>. The
			vector's coordinates encode the amount to scale each individual basis
			vector, before adding them up.
		</P>

		<p>
			This scaling and addition of vectors is called a <Term
				>linear combination</Term
			>, and every vector can be expressed as a linear combination of basis
			vectors.
		</p>

		<Spacer />

		<Tex expr={matrixVectorFormulaColored} display />

		<p>
			Did you notice anything similar with the expression for matrix-vector
			multiplication? A vector multiplied with a matrix can also be expressed as
			a linear combination; only this time the standard basis vectors are
			replaced by the columns of the matrix.
		</p>

		<Tex expr={matrixVectorFormulaEg} display color />

		<P id="st-4">
			In other words, a matrix can be viewed as a way of packaging information
			about the new basis vectors that we want. This is the core insight: a
			matrix transforms a vector by <B
				>transforming the original basis vectors</B
			>; creating an entirely new coordinate system.
		</P>

		<P id="st-5">
			Again, the transformed vector is a linear combination of the new basis
			vectors, which are scaled by the coordinates of the original vector.
		</P>

		<Spacer />

		<p>
			In that vein, a matrix transformation appears to warp and transform space.
			To get a visceral feel of this, let's visualize what happens to not just a
			single vector, but <B>a sample of vectors in space</B>, each multiplied by
			the same matrix.
		</p>

		<P id="st-6">
			In order to make the space less visually cluttered, we can represent each
			vector with just its tip as a point in space. We'll transform the grid
			lines along too, overlaying on top a copy of the original.
		</P>

		<P id="st-7">
			The transformation appears to rotate and stretch the space, accordingly
			with where the new basis vectors land.
		</P>

		<P>
			As we'll see when you have a chance to tinker around with different basis
			vectors, a matrix performs a particular kind of transformation, called a <Term
				>linear transformation</Term
			>. Visually, you'll notice that:
		</P>

		<ul class="ml-4 marker:text-info marker:text-2xl">
			<li>
				All lines in the original space remain as lines, without getting curved,
				and
			</li>
			<li>Origin remains fixed in place.</li>
		</ul>

		<p>
			As an example, all grid lines stay parallel and evenly spaced after the
			transformation.
		</p>

		<Spacer />

		<!-- TODO: Have a kind of recap at the end -->
		<div class="exclude">
			<Tex expr={matrixVectorFormulaColored} display />
			<Insight>
				<ul>
					<li>
						Any vector can be expressed as the addition of scaled basis vectors,
						i.e.
						<B>a linear combination of basis vectors</B>.
					</li>
					<li>
						A matrix can be viewed as a way to <B
							>package information about a linear transformation</B
						>. The columns of a matrix represent where the new basis vectors
						land after the transformation.
					</li>
					<li>
						Matrix-vector multiplication is a way to compute where a given
						vector lands after the transformation defined by a matrix.
					</li>
				</ul>
			</Insight>
		</div>

		<Spacer />

		<div class="exclude">
			<P id="st-8">
				With our understanding so far, try to tinker about and figure out what
				kinds of transformations are possible with matrices!
			</P>
			<p>
				What basis vectors should you choose in order to scale space uniformly
				in all directions? How about a reflection, rotation or a shear?
			</p>
			<Action>
				<!-- TODO: Allow users to grab the basis vectors too? -->
				<ul class="list-none">
					<InteractionsList />
				</ul>
			</Action>
		</div>
	</Section>

	<!-- TODO: How about 3D? -->
	<Section id="section-2" classNames="animate">
		<h2 class="text-neutral">Beyond Two-Dimensions</h2>

		<p>
			So far we've only been talking about matrix transformations in
			two-dimensions on the <Tex expr="xy" />-plane. Do the same intuitions
			carry over to <B>higher dimensions</B>?
		</p>

		<P id="st-9">
			To make up three dimensions, we have yet another standard basis vector —
			the unit vector in the <ColorText color="a"
				><Tex expr="z" />-direction</ColorText
			>. This also means we're now fiddling around with vectors of length <Tex
				expr="3"
			/> — representing the <Tex expr="xyz" /> coordinates — and matrices of size
			<nobr><Tex expr="3\times3" /></nobr>.
		</P>

		<P id="st-10">
			The concept of matrix transformations in 3D is exactly the same. The three
			basis vectors are transformed to their new locations, warping space along
			with them. These locations are completely determined by the columns of the
			matrix.
		</P>

		<Tex expr={matrixVectorFormula3dEg} display color />

		<P id="st-11">
			Originally, any vector is composed of a linear combination of these three
			standard basis vectors. To figure out the where the vector lands after the
			transformation, it is a linear combination of the transformed basis
			vectors, each scaled by the respective coordinates in the starting vector.
		</P>

		<P id="st-12">
			From these visually-focused examples we've seen thus far, the most obvious application
			of matrix transformations would be that of computer graphics. In fact,
			this is precisely how this article was built! Matrices provide a language
			to rotate, scale and translate vectors and points and consequently entire
			objects in 2D or 3D space.
		</P>

		<!-- <p>
			Talk about application in computer graphics... give a concrete example
			visually. Give other examples of applications of matrices... From the
			visual examples we've seen thus far, the most obvious application of
			matrix transformations would be that of computer. In fact,
		</p> -->
		<Spacer />
		<div class="exclude">
			<p id="st-13">
				Go forth and wrap your head around matrix transformations in 3D! Now you
				have a whole additional dimension to fidget around with.
			</p>
			<Action>
				<ul class="list-none">
					<InteractionsList />
					<li>
						<ActionIcon icon={Grab} />
						<B>Right click and drag</B> to rotate around the space
					</li>
				</ul>
			</Action>
		</div>
	</Section>

	<!-- fire 111 (VERBATIM EXTENSION): the det story sections live INSIDE
	     #article — the original's single pinned element + station chain drives
	     them. The det stations are plain extra triggers in the same stProps
	     pattern (detPins.js), the original's text-reveal loop
	     (#article section.animate > *) covers them for free, and the whole
	     fire-100..110 parallel pin machinery (the second column, the locks,
	     the watchdogs, the heals) is gone. The -65ch reading slide at story
	     entry already targets #article (the original's own try-it slide). -->

	<!-- tall runway so section-2's ending fully exits the viewport before
	     the det story's text arrives (issue-02) -->
	<div class="h-[800px]" />
	<Section id="section-det" classNames="animate bg-gradient-to-l from-base-100 via-base-300 via-90%">
		<h2 class="text-neutral">The Determinant: Area and Invertibility</h2>

		<p>
			Every matrix so far <B>moved vectors around</B>. But a transformation does something
			else, quietly, to the entire plane: it <B>rescales every area</B> by the same amount.
			That amount has a name — the <Term>determinant</Term> — and it decides whether the
			transformation can be undone at all.
		</p>

		<div class="h-[450px]" />

		<P id="det-st-1">
			Here is the <B>unit square</B> — the corner spanned by the two basis vectors. Its area
			is exactly <Tex expr="1" />. Every matrix transforms it into a parallelogram, and the
			<Term>determinant</Term> measures what happens to that area.
		</P>

		<!-- fire 92 (P2): the original travels ~64px of prose between stations while each station HOLDS ~1000px of pinned scroll -->
		<div class="h-[96px]" />

		<P id="det-st-2">
			Watch: this matrix stretches the square's area to <B>exactly double</B>. That factor is
			the determinant — <Tex expr={"\\det(A) = 2"} /> — and it doesn't just apply to the
			square: <B>every shape's area scales by the same amount</B>.
		</P>

		<!-- fire 92 (P2): the original travels ~64px of prose between stations while each station HOLDS ~1000px of pinned scroll -->
		<div class="h-[96px]" />

		<P id="det-st-3">
			The sign matters too. The area is scaled by the magnitude <Tex expr={"|\\det(A)|"} /> —
			the same factor whether <Tex expr={"\\det(A)"} /> is positive or negative — while the
			<B>sign</B> only records <B>orientation</B>: a <B>negative determinant</B> flips the
			plane over, so clockwise becomes counterclockwise.
		</P>

		<!-- fire 92 (P2): the original travels ~64px of prose between stations while each station HOLDS ~1000px of pinned scroll -->
		<div class="h-[96px]" />

		<P id="det-st-4">
			And when <Tex expr={"\\det(A) = 0"} />? The plane <B>collapses</B> — this example squashes
			it onto a single line, and a matrix can even collapse everything into a single point.
			Either way, every square becomes a segment or a point; every area becomes zero. Watch the
			two marked points: different inputs, <B>same output</B>.
		</P>

		<!-- fire 92 (P2): the original travels ~64px of prose between stations while each station HOLDS ~1000px of pinned scroll -->
		<div class="h-[96px]" />

		<P id="det-st-5">
			That is why a square matrix with <Tex expr={"\\det(A) = 0"} /> has no inverse: the
			transformation <B>throws information away</B>, so there is nothing left to undo.
			<Term>If det(A) = 0, the matrix has no inverse</Term>. (The determinant itself still
			exists — it is exactly <Tex expr={"0"} /> in this case.)
		</P>

		<!-- fire 100: the try-it hand-off needs its travel back — span 5's hold
		     ends here and det-st-6's center-cross must arrive AFTER it -->
		<div class="h-[950px]" />

		<div class="exclude">
			<p id="det-st-6">
				Now <B>make the plane misbehave yourself</B> — the controls are on the left. Try to
				find a matrix that collapses the plane, then take the prediction challenges: the
				origin round is <B>impossible</B> when det(A) = 0.
			</p>
			<Action>
				<ul class="list-none">
					<InteractionsList />
					<li>
						<ActionIcon icon={Crosshair} />
						<B>Predict</B> — use the round buttons on the left panel, then click the canvas
						where you think the answer is
					</li>
				</ul>
			</Action>
		</div>
	</Section>

	<!-- CS375 modification: the 3D determinant story (P5.1/P5.2) — the camera
	     swaps to the house 3D pose for this section; the dock appears at
	     det3d-st-6 (the try-it step), mirroring the 2D det pattern -->
	<div class="h-[700px]" />
	<Section id="section-det3d" classNames="animate bg-gradient-to-l from-base-100 via-base-300 via-90%">
		<h2 class="text-neutral">The Determinant in 3D: Volume and Invertibility</h2>

		<p>
			None of this is special to flatland. In three dimensions the determinant measures
			<B>volume</B>: the unit cube becomes a parallelepiped, and the determinant tells you
			how many times <B>bigger</B> it gets — and whether it got <B>flipped inside out</B>.
		</p>

		<div class="h-[450px]" />

		<P id="det3d-st-1">
			Here is the <B>unit cube</B> — volume exactly <Tex expr="1" />. Every 3×3 matrix
			transforms it into a slanted box, and the determinant measures what happens to that
			volume.
		</P>

		<!-- fire 92 (P2): the original travels ~64px of prose between stations while each station HOLDS ~1000px of pinned scroll -->
		<div class="h-[96px]" />

		<P id="det3d-st-2">
			This matrix <B>doubles the volume</B> — <Tex expr={"\\det(A) = 2"} />. Same rule as the
			plane, one dimension up: <B>every solid's volume scales by the same factor</B>.
		</P>

		<!-- fire 92 (P2): the original travels ~64px of prose between stations while each station HOLDS ~1000px of pinned scroll -->
		<div class="h-[96px]" />

		<P id="det3d-st-3">
			A <B>negative determinant</B> turns the box <B>inside out</B> — a mirror reflection. The
			volume scales by the magnitude <Tex expr={"|\\det(A)|"} />; the <B>sign</B> only records
			the <B>orientation</B> flip.
		</P>

		<!-- fire 92 (P2): the original travels ~64px of prose between stations while each station HOLDS ~1000px of pinned scroll -->
		<div class="h-[96px]" />

		<P id="det3d-st-4">
			And when <Tex expr={"\\det(A) = 0"} />? Space <B>collapses</B> — this example squashes the
			cube flat onto a plane, while other singular matrices can flatten it onto a line or even
			a point. In every case the volume becomes zero. Watch the two marked points inside it:
			different inputs, <B>same output</B>.
		</P>

		<!-- fire 92 (P2): the original travels ~64px of prose between stations while each station HOLDS ~1000px of pinned scroll -->
		<div class="h-[96px]" />

		<P id="det3d-st-5">
			Flat means <B>no inverse</B> in 3D too: whenever a square matrix has <Tex
				expr={"\\det(A) = 0"} />, the transformation <B>throws information away</B> — here, a
			whole dimension of it — so there is nothing left to undo. <Term
				>If det(A) = 0, the matrix has no inverse</Term
			>.
		</P>

		<div class="h-[950px]" />

		<div class="exclude">
			<p id="det3d-st-6">
				Now <B>break the cube yourself</B> — the 3×3 controls are on the left. When you can
				flatten it, take the prediction challenges: <B>click the floor</B> to place your
				guess, drag the <B>height slider</B> to finish it.
			</p>
			<Action>
				<ul class="list-none">
					<li>
						<ActionIcon icon={Crosshair} />
						<B>Predict</B> — use the round buttons on the left panel, click the floor for
						(x, y), then set the height with the slider and lock it in
					</li>
					<li>
						<ActionIcon icon={Move3d} />
						<B>Right-drag</B> to orbit the box and inspect it from any angle
					</li>
				</ul>
			</Action>
		</div>
	</Section>

	<!-- tail runway: room for the det3d try-it's hold to release and the
	     column to hand off to the footer cleanly (the fire-101 finding, kept
	     from the det column era; sized for the one-pin-per-story chain) -->
	<div class="h-[1500px]" />
</div>

<!-- TODO: Composition of matrices -->

