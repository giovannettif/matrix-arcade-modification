<script>
	import Threlte from "$components/matrix/Threlte.svelte";
	import MatrixInput from "$components/matrix/MatrixInput.svelte";
	import ScrubberInput from "$components/matrix/ScrubberInput.svelte";
	import Article from "./matrix/Article.svelte";
	import Title from "./matrix/Title.svelte";
	import ToggleInput from "./matrix/ToggleInput.svelte";
	import { debug, showPlayground } from "$stores";
	import TogglePlayground from "./matrix/TogglePlayground.svelte";
	import { loaded, sceneMounted } from "$stores";
	import { gsap, ScrollTrigger } from "$utils/gsap.js";
import Footer from "./matrix/Footer.svelte";
import DetOverlay from "./matrix/det/DetOverlay.svelte";
import DetEngine from "./matrix/det/DetEngine.svelte";
import DetFormulaCard from "./matrix/det/DetFormulaCard.svelte";
import Det3DFormulaCard from "./matrix/det/Det3DFormulaCard.svelte";
import Det3DEngine from "./matrix/det/Det3DEngine.svelte";
	import mq from "$stores/mq.js";
	import { RingLoader } from "svelte-loading-spinners";
	import { colorVector } from "$data/variables";

	// CS375: hold the loading overlay until the 3D scene (and with it every
	// ScrollTrigger pin created by Arcade.animate on $sceneMounted) exists.
	// Fading at $loaded alone exposed a scrollable, uncalibrated page during
	// dev hydration — when the pins landed mid-scroll the text jumped.
	$: if ($mq.lg && $loaded && $sceneMounted) {
		// Release the shield BEFORE the fade runs: the fade is rAF-driven, so
		// a stalled render loop would otherwise leave the full-viewport
		// overlay blocking every click indefinitely (seen in a throttled
		// environment: opacity frozen mid-fade, page unclickable)
		gsap.set("#loading-overlay", {
			pointerEvents: "none"
		});

		gsap.to("#loading-overlay", {
			autoAlpha: 0,
			duration: 2
		});

		gsap.set("body", {
			overflowY: "visible",
			overflowX: "hidden"
		});

		ScrollTrigger.refresh();
	}
</script>

<!-- CS375 modification: determinant try-it overlay (the story text lives in Article.svelte).
     DetEngine is the step machine at DOM level (RUN 48, G-A): on loads where the WebGL
     canvas init throws, Svelte's mount flush aborts and everything AFTER <Threlte/>
     never mounts — so the engine and the overlay mount BEFORE the canvas, keeping the
     det story + games alive even on a dead-canvas load. -->
<DetEngine />
<Det3DEngine />
<DetOverlay />
<DetFormulaCard />
<Det3DFormulaCard />

{#if !$debug}
	<Title />
{/if}

<!-- TODO: Some fancy gradient? -->
<div
	id="loading-overlay"
	class="fixed inset-0 bg-base-300 place-content-center z-50 hidden lg:grid"
>
	<div class="flex flex-col items-center gap-5">
		<div class="inline-block font-displayAlt text-xl">Loading...</div>
		<RingLoader color={colorVector} />
	</div>
</div>

<!-- TODO: Update width? -->
<!-- {#if $mq.lg} -->
<article class="relative bg-base-300 w-[calc(100%+65ch)] hidden lg:flex">
	<div
		id="canvas-wrapper"
		class="sticky top-0 flex-1 min-w-0 h-screen bg-base-300 {!$debug
			? `pointer-events-none`
			: ``}"
	>
		<Threlte />
	</div>

	<div class="max-w-prose">
		<Article />
	</div>
</article>

<!-- CS375: DetEngine + DetOverlay moved ABOVE the canvas — see the note at the
     top of this template (RUN 48, G-A: a canvas mount throw aborts Svelte's
     mount flush, so anything after <Threlte/> would never mount) -->
<!-- {/if} -->

{#if $showPlayground}
	<TogglePlayground />
{/if}

<div
	id="inputs"
	class="fixed left-0 top-0 flex flex-col items-start px-8 py-8 gap-7 pointer-events-none invisible"
>
	<ToggleInput />
	<ScrubberInput />
	<div>
		<MatrixInput />
	</div>
</div>

<!-- ScrollTrigger progress bar -->
<!-- TODO: Shift to place near the canvas instead? -->
<div
	id="st-progress"
	class="fixed left-0 top-0 bottom-0 w-2 bg-neutral scale-y-0 rounded-full"
/>

<Footer />
