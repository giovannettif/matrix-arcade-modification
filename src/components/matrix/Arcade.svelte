<script>
	// import Grid from "./Grid.svelte";
	import { Grid, useGltf, useTexture } from "@threlte/extras";
	import { useTweakpane } from "$utils/useTweakpane";
	import { T, useThrelte } from "@threlte/core";
	import Points from "./Points.svelte";
	import Sphere from "./Sphere.svelte";
	import Circle from "./Circle.svelte";
	import Planes from "./Planes.svelte";
	import Plane from "./Plane.svelte";
	import Grid3d from "./Grid3d.svelte";
	import Sky from "./Sky.svelte";
	import Gridlines from "./Gridlines.svelte";
	import {
		endMatrix,
		playhead,
		playToggle,
		matrixTween,
		gridToggled,
		grid3dToggled,
		transformedGridToggled,
		dataToggled,
		showHero,
		heroMatrix,
		afterImageEnabled,
		cameraAutoRotate,
		show3d,
		showPlayground,
		customMatrix,
		debug,
		inputVectorToggled,
		rgbShiftEnabled,
		resetViewToggle,
    show2d
	} from "$stores";
	import Vector from "./Vector.svelte";
	import { ScrollTrigger, gsap } from "$utils/gsap.js";
	import { onMount } from "svelte";
	import {
		sceneMounted,
		titleMounted,
		loaded,
		cameraProps,
		cameraControls,
		playgroundSt,
		vectorCoordsInput
	} from "$stores";
	// CS375: det story step — Maxwell is hidden while the determinant section plays
	import { detStep } from "$stores/det.js";
	import { createDetStations } from "$stores/detPins.js";
	// fire 65 (FIX-C): the 3D det chapter's step — every "hide when the det
	// section owns the canvas" gate below keyed only on the 2D detStep, so
	// the original's content (near-black backdrop planes, cat, narrative
	// vectors, data fields, lattice) showed through the whole 3D det story
	import { det3dStep } from "$stores/det3.js";
	import { detApproached } from "$stores/det.js";
	import {
		colorVector,
		colorX,
		colorY,
		colorZ,
		egVector,
		egMatrixX,
		egMatrixY,
		egOutputVector,
		eg3dMatrix,
		eg3dMatrixX,
		eg3dMatrixY,
		eg3dMatrixZ,
		eg3dVector,
		eg3dOutputVector,
		egEndMatrix,
		initMatrix,
		colorGrid,
		colorGridAlt
	} from "$data/variables";
	import colors from "tailwindcss/colors";
	import CameraControls from "camera-controls";
	import {
		Color,
		MeshBasicMaterial,
		PlaneGeometry,
		SRGBColorSpace,
		sRGBEncoding
	} from "three";
	import Hero from "./Hero.svelte";
	import { spring } from "svelte/motion";
	import { base, assets } from "$app/paths";
	import Vectors from "./Vectors.svelte";

	export let mathbox;

	// const map = useTexture("/maxwell.jpg");
	const map = useTexture(`${assets}/maxwell.jpg`);
	$: if ($map) $map.encoding = sRGBEncoding;

	let mounted;

	// Set this to the z-position of the camera
	// mathbox.set("focus", 15);
	mathbox.set("focus", 20);

	// Set up coordinate system
	const dim = 1;
	const range = [
		[-dim, dim],
		[-dim, dim],
		[-dim, dim]
	];
	const view = mathbox.cartesian({
		range
	});

	const planeDim = 10;

	// States
	const startMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
	// Object that gets animated
	let matrix = [...startMatrix];
	// `$endMatrix` records the final state of the matrix

	// const transformedView = view.transform();
	// FIXME: Or should I just set manually?
	// const transformedView = view.transform({}, { matrix: () => matrix });
	const transformedView = view.transform();

	// Matrix animation
	// TODO: Make the ease linear
	// So that the playhead corresponds to the animation progress
	// Tween the animation's progress separately instead
	$matrixTween = gsap.to(matrix, {
		ease: "linear",
		duration: 2,
		paused: true,
		endArray: $endMatrix,
		onUpdate() {
			// Sync playhead with animation progress
			$playhead = this.progress();
			matrix = matrix;
		},
		onComplete() {
			// Toggle play icon
			$playToggle = true;
			// FIXME:
			this.pause();
		}
	});
	// $matrixTween.progress(1);

	// FIXME: Setting $endMatrix directly doesn't work for some reason
	// FIXME: Use different matrix transformation states during narrative, and during interaction time
	$: onMatrixChange($endMatrix);

	let nudgeFlag = true;

	// FIXME: This has to run first!!
	function onMatrixChange(endMatrix) {
		// Reset matrix
		matrix.forEach((_, i) => {
			matrix[i] = startMatrix[i];
		});

		// Update tween
		$matrixTween.invalidate();

		// HACK: Nudge
		const nudgeAmt = nudgeFlag ? 0.0001 : -0.0001;
		$matrixTween.progress($matrixTween.progress() + nudgeAmt);
		nudgeFlag = !nudgeFlag;

		// FIXME: Stays the same
		matrix = matrix;
	}

	// Use different states during interaction and during narrative
	const matrixTransform = spring(initMatrix);
	$: {
		if ($showHero) {
			$matrixTransform = $heroMatrix;
			// } else if (!$showPlayground) {
			// 	$matrixTransform = $customMatrix;
		} else if ($detStep >= 1) {
			// REG-2: the det story and try-it own the canvas, and the transformed
			// grid group is visible BY DESIGN at the try-it (detStep 6) as the
			// identity-warped playground grid. A load that jumps past the
			// original's narrative tweens leaves the local `matrix` spring at a
			// mid-narrative shear, which then rendered over the sandbox as a
			// diagonal line lattice — pin the warp to identity for every det step.
			$matrixTransform = initMatrix;
		} else {
			$matrixTransform = matrix;
		}
	}

	// Update transformed view
	$: transformedView.set("matrix", $matrixTransform);

	// $: console.log(matrixTransform)

	// Grid props
	const gridCellSize = 1;
	const gridSectionSize = 5;

	const defaultGridProps = {
		cellSize: gridCellSize,
		cellColor: colors.slate["700"],
		cellThickness: 1.5,
		sectionSize: gridSectionSize,
		sectionColor: colors.slate["700"],
		sectionThickness: 3,
		infiniteGrid: true
	};

	$: gridSettings = $show3d
		? {
				fadeDistance: 150,
				fadeStrength: 4
		  }
		: {
				fadeDistance: 50,
				fadeStrength: 5
		  };

	$: transformedGridSettings = $show3d
		? {
				fadeDistance: 150,
				fadeStrength: 4
		  }
		: {
				// fadeDistance: 50,
				// fadeStrength: 9
				fadeDistance: 100,
				fadeStrength: 8
		  };

	let gridProps = {
		...defaultGridProps,
		// sectionThickness: 2.5,
		...gridSettings
	};

	let transformedGridProps = {
		...defaultGridProps,
		cellColor: colorGridAlt,
		sectionColor: colorGrid,
		...transformedGridSettings
	};

	let grid3dProps = {
		...defaultGridProps,
		infiniteGrid: false,
		cellColor: colorGridAlt,
		sectionColor: colorGrid,
		gridSize: [10, 10],
		cellThickness: 0,
		sectionThickness: 0,
		t: 0
	};

	let gridVars = {
		fadeDistance: gridProps.fadeDistance,
		transformedFadeDistance: 0,
		fadeStrength: gridProps.fadeStrength,
		transformedFadeStrength: transformedGridProps.fadeStrength
	};

	// let grid3dProps = {
	// 	t: 0
	// };

	$: onGridToggle($gridToggled);
	function onGridToggle(toggled) {
		if (toggled) {
			gsap.to(gridProps, {
				fadeDistance: gridSettings.fadeDistance,
				onUpdate: function () {
					gridProps = gridProps;
				}
			});
		} else {
			gsap.to(gridProps, {
				fadeDistance: 0,
				onUpdate: function () {
					gridProps = gridProps;
				}
			});
		}
	}

	$: onTransformedGridToggle($transformedGridToggled);
	function onTransformedGridToggle(toggled) {
		if (toggled) {
			gsap.to(transformedGridProps, {
				fadeDistance: transformedGridSettings.fadeDistance,
				onUpdate: function () {
					transformedGridProps = transformedGridProps;
				}
			});
		} else {
			gsap.to(transformedGridProps, {
				fadeDistance: 0,
				onUpdate: function () {
					transformedGridProps = transformedGridProps;
				}
			});
		}
	}

	$: onGrid3dToggle($grid3dToggled);
	function onGrid3dToggle(toggled) {
		if (toggled) {
			gsap.to(grid3dProps, {
				t: 1,
				cellThickness: defaultGridProps.cellThickness,
				sectionThickness: defaultGridProps.sectionThickness,
				onUpdate: function () {
					grid3dProps = grid3dProps;
				}
			});
		} else {
			gsap.to(grid3dProps, {
				t: 0,
				cellThickness: 0,
				sectionThickness: 0,
				onUpdate: function () {
					grid3dProps = grid3dProps;
				}
			});
		}
	}

	const cachePlaygroundSettings = {
		dataToggled: undefined,
		gridToggled: true,
		transformedGridToggled: true
	};

	let prevDataToggled;
	$: onDataToggle($dataToggled);
	function onDataToggle(toggled) {
		// Animate out
		if (prevDataToggled == "points") {
			gsap.to(pointsProps, {
				t: 0,
				onUpdate: function () {
					pointsProps = pointsProps;
				}
			});
		} else if (prevDataToggled == "3d points") {
			gsap.to(points3dProps, {
				t: 0,
				onUpdate: function () {
					points3dProps = points3dProps;
				}
			});
		} else if (prevDataToggled == "planes") {
			gsap.to(planesProps, {
				t: 0,
				onUpdate: function () {
					planesProps = planesProps;
				}
			});
		} else if (prevDataToggled == "3d planes") {
			gsap.to(planes3dProps, {
				t: 0,
				onUpdate: function () {
					planes3dProps = planes3dProps;
				}
			});
		} else if (prevDataToggled == "model") {
			gsap.to(modelProps, {
				scale: 0,
				onUpdate: function () {
					modelProps = modelProps;
				}
			});
		} else if (prevDataToggled == "image") {
			gsap.to(imageProps, {
				scale: 0,
				onUpdate: function () {
					imageProps = imageProps;
				}
			});
		}

		// Animate in
		if (toggled == "points") {
			gsap.to(pointsProps, {
				t: 1,
				onUpdate: function () {
					pointsProps = pointsProps;
				}
			});
		} else if (toggled == "3d points") {
			gsap.to(points3dProps, {
				t: 1,
				onUpdate: function () {
					points3dProps = points3dProps;
				}
			});
		} else if (toggled == "planes") {
			gsap.to(planesProps, {
				t: 1,
				onUpdate: function () {
					planesProps = planesProps;
				}
			});
		} else if (toggled == "3d planes") {
			gsap.to(planes3dProps, {
				t: 1,
				onUpdate: function () {
					planes3dProps = planes3dProps;
				}
			});
		} else if (toggled == "model") {
			gsap.to(modelProps, {
				scale: 0.25,
				onUpdate: function () {
					modelProps = modelProps;
				}
			});
		} else if (toggled == "image") {
			gsap.to(imageProps, {
				scale: 1,
				onUpdate: function () {
					imageProps = imageProps;
				}
			});
		}

		// Update prev value
		prevDataToggled = toggled;
	}

	// Have a show 3d trigger?
	$: toggle3d($show3d);
	function toggle3d(toggle) {
		if ($gridToggled) {
			gsap.to(gridProps, {
				duration,
				fadeDistance: gridSettings.fadeDistance,
				fadeStrength: gridSettings.fadeStrength,
				onUpdate: () => (gridProps = gridProps)
			});
		}

		if ($transformedGridToggled) {
			gsap.to(transformedGridProps, {
				duration,
				fadeDistance: transformedGridSettings.fadeDistance,
				fadeStrength: transformedGridSettings.fadeStrength,
				onUpdate: () => (transformedGridProps = transformedGridProps)
			});
		}

		if ($showPlayground) {
			if (!$show3d) {
				// Hide any toggled 3d objects
				$dataToggled = undefined;
				onDataToggle(undefined);

				// Reset camera to 2d view
				$resetViewToggle = !$resetViewToggle;

				// Hide z basis vector
				basisAltProps.zVisible = false;

				// Remove z-coord of input vector
				$vectorCoordsInput[2] = 0;
				// $vectorCoordsInput = $vectorCoordsInput

				// $endMatrix[2] = 0
				// $endMatrix[6] = 0
				// $endMatrix[8] = 0
				// $endMatrix[9] = 0
				// $endMatrix[10] = 1
				gsap.to($endMatrix, {
					endArray: initMatrix,
					onUpdate: () => {
						$endMatrix = $endMatrix;
					},
					duration
				});

				$grid3dToggled = false;
				onGrid3dToggle(false);
			} else {
				basisAltProps.zVisible = true;
			}
		}
	}

	// ScrollTrigger
	const delay = 0.1;
	const transitionDuration = 0.1;

	let vectorCoords = [0, 0, 0, 0, 0, 0];
	let xCoords = [0, 0, 0, 0, 0, 0];
	let yCoords = [0, 0, 0, 0, 0, 0];
	let zCoords = [0, 0, 0, 0, 0, 0];

	const vectorCoordsSpring = spring([0, 0, 0]);
	$: $vectorCoordsSpring = $vectorCoordsInput;

	// FIXME: Do we have to set visibility to false?
	// Hide vector input on toggle
	$: onInputVectorToggle($inputVectorToggled);
	function onInputVectorToggle(toggled) {
		if (toggled) {
			$vectorCoordsSpring = $vectorCoordsInput;
		} else {
			$vectorCoordsSpring = [0, 0, 0];
		}
	}

	// TODO: Separate this?
	let props = {
		vectorTexOpacity: 0,
		xTexOpacity: 0,
		yTexOpacity: 0,
		zTexOpacity: 0,
		xScalar: 1,
		yScalar: 1,
		zScalar: 1,
		xScalarOpacity: 0,
		yScalarOpacity: 0,
		zScalarOpacity: 0,
		xScalarAlign: "top",
		yScalarAlign: "left",
		zScalarAlign: "bottom",
		vectorVisible: false,
		xVisible: true,
		yVisible: true,
		zVisible: true,
		xDim3: false,
		yDim3: false,
		zDim3: false,
		vectorDim3: false
	};

	let pointsProps = {
		t: 0
	};

	let planesProps = {
		t: 0
	};

	let points3dProps = {
		t: 0
	};

	let planes3dProps = {
		t: 0
	};
	let modelProps = {
		scale: 0
	};
	let imageProps = {
		scale: 0
	};
	let vectorsProps = {
		enter: 0,
		exit: 1
	};

	let basisAltProps = {
		vectorVisible: true,
		xVisible: false,
		yVisible: false,
		zVisible: false
	};

	$: if ($debug) {
		basisAltProps.xVisible = true;
		basisAltProps.yVisible = true;
		basisAltProps.zVisible = true;
	}

	// $: basisAltProps.zVisible = $show3d;

	const stProps = {
		fastScrollEnd: true,
		pin: "#article",
		pinnedContainer: "#article",
		start: "center center",
		scrub: 1,
		pinSpacing: true,
		toggleClass: "active",
		invalidateOnRefresh: true,
		onEnter: function () {
			animateInStProgress();
		},
		onLeave: function () {
			animateOutStProgress();
		},
		onEnterBack: function () {
			animateInStProgress();
		},
		onLeaveBack: function () {
			animateOutStProgress();
		}
	};

	const stPropsAlt = {
		start: "bottom center",
		pinnedContainer: "#article",
		toggleActions: "play none none reverse",
		fastScrollEnd: true,
		end: 200
	};

	const timelineProps = {
		onUpdate: function () {
			updateStProgress(this.progress());
		}
	};

	const timelinePropsAlt = {
		ease: "power2.in"
	};

	const duration = 0.3;

	const scrollUnit = 1_000;

	function animate() {
		// FIXME: Review scroll amounts

		// Animate in vector
		gsap
			.timeline({
				...timelineProps,
				scrollTrigger: {
					...stProps,
					trigger: "#st-1",
					end: `+=${scrollUnit * 1}`
					// onEnter: () => {
					// 	stProps.onEnter();

					// 	($gridToggled = true), ($transformedGridToggled = false);

					// 	// $rgbShiftEnabled = false;
					// },
					// onLeaveBack: () => {
					// 	stProps.onLeaveBack();

					// 	($gridToggled = false), ($transformedGridToggled = true);

					// 	// $rgbShiftEnabled = true;
					// }
				}
			})
			.to(vectorCoords, {
				endArray: [0, 0, 0, ...egVector, 0],
				onUpdate: function () {
					vectorCoords = vectorCoords;
				}
			})
			.to(props, {
				vectorTexOpacity: 1,
				onUpdate: function () {
					props = props;
				}
			})
			.to(
				{},
				{
					duration: delay
				}
			);

		// Animate in basis vectors
		gsap
			.timeline({
				...timelineProps,
				scrollTrigger: {
					...stProps,
					trigger: "#st-2",
					end: `+=${scrollUnit * 1}`
				}
			})
			.to(xCoords, {
				endArray: [0, 0, 0, 1, 0, 0],
				onUpdate: function () {
					xCoords = xCoords;
				},
				delay
			})
			.to(
				yCoords,
				{
					endArray: [0, 0, 0, 0, 1, 0],
					onUpdate: function () {
						yCoords = yCoords;
					}
				},
				"<"
			)
			.to(props, {
				xTexOpacity: 1,
				onUpdate: function () {
					props = props;
				}
			})
			.to(
				props,
				{
					yTexOpacity: 1,
					onUpdate: function () {
						props = props;
					}
				},
				"<"
			)
			.to(
				{},
				{
					duration: delay
				}
			);

		// Scale basis vectors to example vector
		gsap
			.timeline({
				...timelineProps,
				scrollTrigger: {
					...stProps,
					trigger: "#st-3",
					end: `+=${scrollUnit * 3}`,
					preventOverlaps: true
				}
			})
			// Animate out Tex
			.to(props, {
				xTexOpacity: 0,
				onUpdate: function () {
					props = props;
				}
			})
			.to(
				props,
				{
					yTexOpacity: 0,
					onUpdate: function () {
						props = props;
					}
				},
				"<"
			)
			// Scale basis vectors
			.add("step-2")
			.to(
				props,
				{
					duration: 0.2,
					xScalarOpacity: 1,
					onUpdate: function () {
						props = props;
					}
				},
				"step-2"
			)
			.to(
				props,
				{
					duration: 0.2,
					yScalarOpacity: 1,
					onUpdate: function () {
						props = props;
					}
				},
				"step-2"
			)
			.to(
				xCoords,
				{
					endArray: [0, 0, 0, egVector[0], 0, 0],
					onUpdate: function () {
						xCoords = xCoords;
					}
				},
				"step-2"
			)
			.to(
				yCoords,
				{
					endArray: [0, 0, 0, 0, egVector[1], 0],
					onUpdate: function () {
						yCoords = yCoords;
					}
				},
				"step-2"
			)
			.to(
				props,
				{
					xScalar: egVector[0],
					onUpdate: function () {
						props = props;
					}
				},
				"step-2"
			)
			.to(
				props,
				{
					yScalar: egVector[1],
					onUpdate: function () {
						props = props;
					}
				},
				"step-2"
			)
			.to({}, { duration: delay })
			// Shift y basis vector
			.add("step-3")
			.to(
				props,
				{
					duration: 0.2,
					xScalarOpacity: 0,
					onUpdate: function () {
						props = props;
					}
				},
				"step-3"
			)
			.to(
				props,
				{
					duration: 0.2,
					yScalarOpacity: 0,
					onUpdate: function () {
						props = props;
					}
				},
				"step-3"
			)
			.to(
				yCoords,
				{
					endArray: [egVector[0], 0, 0, ...egVector, 0],
					onUpdate: function () {
						yCoords = yCoords;
					}
				},
				"step-3"
			)
			.to({}, { duration: delay });

		// Animate basis vectors back
		gsap
			.timeline({
				scrollTrigger: {
					...stPropsAlt,
					trigger: "#st-3"
				},
				timelinePropsAlt
			})
			.add("step-1")
			// Reset scalar values
			.to(
				props,
				{
					duration,
					xScalar: 1,
					yScalar: 1
				},
				"step-1"
			)
			.to(
				xCoords,
				{
					duration,
					endArray: [0, 0, 0, 1, 0, 0],
					onUpdate: function () {
						xCoords = xCoords;
					}
				},
				"step-1"
			)
			.to(
				yCoords,
				{
					duration,
					endArray: [0, 0, 0, 0, 1, 0],
					onUpdate: function () {
						yCoords = yCoords;
					}
				},
				"step-1"
			)
			.to(props, {
				duration,
				xTexOpacity: 1,
				onUpdate: function () {
					props = props;
				}
			})
			.to(
				props,
				{
					duration,
					yTexOpacity: 1,
					onUpdate: function () {
						props = props;
					}
				},
				"<"
			);

		// Transform to new basis vectors
		gsap
			.timeline({
				...timelineProps,
				scrollTrigger: {
					...stProps,
					trigger: "#st-4",
					end: `+=${scrollUnit * 1}`
				}
			})
			// Animate to new basis vectors
			.to(xCoords, {
				endArray: [0, 0, 0, ...egMatrixX, 0],
				onUpdate: function () {
					xCoords = xCoords;
				}
			})
			.to(
				yCoords,
				{
					endArray: [0, 0, 0, ...egMatrixY, 0],
					onUpdate: function () {
						yCoords = yCoords;
					}
				},
				"<"
			)
			// Animate to output vector
			.to(
				vectorCoords,
				{
					endArray: [0, 0, 0, ...egOutputVector, 0],
					onUpdate: function () {
						vectorCoords = vectorCoords;
					}
				},
				"<"
			)
			.to(
				{},
				{
					duration: delay
				}
			);

		// Scale the basis vectors to the transformed vector
		gsap
			.timeline({
				...timelineProps,
				scrollTrigger: {
					...stProps,
					trigger: "#st-5",
					end: `+=${scrollUnit * 3}`
				}
			})
			.add("step-1")
			.to(
				props,
				{
					xScalarAlign: "left",
					yScalarAlign: "top"
				},
				"step-1"
			)
			// Animate out Tex
			.to(
				props,
				{
					xTexOpacity: 0,
					onUpdate: function () {
						props = props;
					}
				},
				"step-1"
			)
			.to(
				props,
				{
					yTexOpacity: 0,
					onUpdate: function () {
						props = props;
					}
				},
				"step-1"
			)
			// Scale basis vectors
			.add("step-2")
			.to(
				props,
				{
					duration: 0.2,
					xScalarOpacity: 1,
					onUpdate: function () {
						props = props;
					}
				},
				"step-2"
			)
			.to(
				props,
				{
					duration: 0.2,
					yScalarOpacity: 1,
					onUpdate: function () {
						props = props;
					}
				},
				"step-2"
			)
			.to(
				xCoords,
				{
					endArray: [
						0,
						0,
						0,
						egVector[0] * egMatrixX[0],
						egVector[0] * egMatrixX[1],
						0
					],
					onUpdate: function () {
						xCoords = xCoords;
					}
				},
				"step-2"
			)
			.to(
				yCoords,
				{
					endArray: [
						0,
						0,
						0,
						egVector[1] * egMatrixY[0],
						egVector[1] * egMatrixY[1],
						0
					],
					onUpdate: function () {
						yCoords = yCoords;
					}
				},
				"step-2"
			)
			.to(
				props,
				{
					xScalar: egVector[0],
					onUpdate: function () {
						props = props;
					}
				},
				"step-2"
			)
			.to(
				props,
				{
					yScalar: egVector[1],
					onUpdate: function () {
						props = props;
					}
				},
				"step-2"
			)
			.to({}, { duration: delay })
			// Shift y basis vector
			.add("step-3")
			.to(
				props,
				{
					duration: 0.2,
					xScalarOpacity: 0,
					onUpdate: function () {
						props = props;
					}
				},
				"step-3"
			)
			.to(
				props,
				{
					duration: 0.2,
					yScalarOpacity: 0,
					onUpdate: function () {
						props = props;
					}
				},
				"step-3"
			)
			.to(
				yCoords,
				{
					endArray: [
						egVector[0] * egMatrixX[0],
						egVector[0] * egMatrixX[1],
						0,
						...egOutputVector,
						0
					],
					onUpdate: function () {
						yCoords = yCoords;
					}
				},
				"step-3"
			)
			.to({}, { duration: delay });

		// Animate basis vectors back
		gsap
			.timeline({
				scrollTrigger: {
					...stPropsAlt,
					trigger: "#st-5"
				},
				timelinePropsAlt
			})
			.add("step-1")
			// Remove example vector
			.to(
				props,
				{
					duration,
					vectorTexOpacity: 0,
					onUpdate: function () {
						props = props;
					}
				},
				"step-1"
			)
			.to(
				vectorCoords,
				{
					duration,
					endArray: [0, 0, 0, 0, 0, 0],
					onUpdate: function () {
						vectorCoords = vectorCoords;
					}
				},
				"step-1"
			)
			// Animate back x basis
			.to(
				xCoords,
				{
					duration,
					endArray: [0, 0, 0, 1, 0, 0],
					onUpdate: function () {
						xCoords = xCoords;
					}
				},
				"step-1"
			)
			// Animate back y basis
			.to(
				yCoords,
				{
					duration,
					endArray: [0, 0, 0, 0, 1, 0],
					onUpdate: function () {
						yCoords = yCoords;
					}
				},
				"step-1"
			)
			.add("step-2")
			.to(
				props,
				{
					duration,
					xTexOpacity: 1,
					onUpdate: function () {
						props = props;
					}
				},
				"step-2"
			)
			.to(
				props,
				{
					duration,
					yTexOpacity: 1,
					onUpdate: function () {
						props = props;
					}
				},
				"step-2"
			);

		// Animate in points
		// FIXME: Animate vectors too?
		gsap
			.timeline({
				...timelineProps,
				scrollTrigger: {
					...stProps,
					trigger: "#st-6",
					end: `+=${scrollUnit * 4}`,
					onLeaveBack: () => {
						stProps.onLeaveBack();

						$dataToggled = undefined;
						$transformedGridToggled = false;
					}
				}
			})
			.add("step-1")
			// Animate in vectors
			.to(
				vectorsProps,
				{
					enter: 1,
					onUpdate: function () {
						vectorsProps = vectorsProps;
					}
				},
				"step-1"
			)
			// Animate out vectors
			.to(
				vectorsProps,
				{
					exit: 0,
					onUpdate: function () {
						vectorsProps = vectorsProps;
					}
				},
				"step-1+=0.1"
			)
			// Animate in points
			.to(
				pointsProps,
				{
					t: 1,
					onUpdate: function () {
						pointsProps = pointsProps;
					}
				},
				"step-1+=0.15"
			)
			// Animate in transformed grid
			.to(
				gridVars,
				{
					transformedFadeDistance: gridProps.fadeDistance,
					onUpdate: function () {
						gridVars = gridVars;
					}
				},
				"step-1+=0.15"
			)
			.to(
				{},
				{
					duration: delay
				}
			);

		// Perform linear transformation
		// TODO: Use afterimage for animation of points?
		gsap
			.timeline({
				...timelineProps,
				scrollTrigger: {
					...stProps,
					trigger: "#st-7",
					end: `+=${scrollUnit * 1}`,
					onToggle: (self) => {
						// $dataToggled = self.isActive ? "points" : undefined;
						$dataToggled = "points";
						$transformedGridToggled = true;
					}
				}
			})
			.add("step-1")
			// Perform linear transformation
			.to(
				$matrixTween,
				{
					progress: 1.0
				},
				"step-1"
			)
			// .fromTo(
			// 	$customMatrix,
			// 	{
			// 		endArray: initMatrix
			// 	},
			// 	{
			// 		endArray: egEndMatrix,
			// 		onUpdate: () => {
			// 			$matrixTransform = $customMatrix;
			// 		},
			// 	},
			// 	"step-1"
			// )
			// .to(
			// 	$customMatrix,
			// 	{
			// 		endArray: egEndMatrix,
			// 		onUpdate: () => {
			// 			$customMatrix = $customMatrix;
			// 		}
			// 	},
			// 	"step-1"
			// )
			// Animate to new basis vectors
			.to(
				xCoords,
				{
					endArray: [0, 0, 0, ...egMatrixX, 0],
					onUpdate: function () {
						xCoords = xCoords;
					}
				},
				"step-1"
			)
			.to(
				yCoords,
				{
					endArray: [0, 0, 0, ...egMatrixY, 0],
					onUpdate: function () {
						yCoords = yCoords;
					}
				},
				"step-1"
			)
			.to(
				{},
				{
					duration: delay
				}
			);

		// Let users do some input!
		gsap
			.timeline({
				scrollTrigger: {
					...stPropsAlt,
					trigger: "#st-8",
					start: "top center",
					onEnter: () => {
						$showPlayground = true;

						$inputVectorToggled = true;
					},
					onLeaveBack: () => {
						// When going back from playground to interactive

						$showPlayground = false;

						$cameraControls.reset(true);

						// FIXME: Cache settings!
						// Reset input settings
						$dataToggled = "points";
						$gridToggled = true;
						$transformedGridToggled = true;
						$inputVectorToggled = false;

						// Reset playhead
						$matrixTween.progress(1);

						// Reset matrix transform
						gsap.to($endMatrix, {
							endArray: egEndMatrix,
							onUpdate: () => {
								$endMatrix = $endMatrix;
							},
							duration
						});
					}
				},
				timelinePropsAlt
			})
			.add("step-1")
			// Make canvas interactable
			.to(
				"#canvas-wrapper",
				{
					pointerEvents: "auto",
					// cursor: "move",
					duration
				},
				"step-1"
			)
			// Show input
			.from(
				"#inputs",
				{
					autoAlpha: 0,
					x: -40,
					duration
				},
				"step-1"
			)
			// Animate basis vectors to interactive position
			.fromTo(
				xCoords,
				{
					endArray: [0, 0, 0, ...egMatrixX, 0]
				},
				{
					endArray: () => [0, 0, 0, matrix[0], matrix[4], 0],
					onUpdate: () => {
						xCoords = xCoords;
					},
					immediateRender: false,
					duration
				},
				"step-1"
			)
			.fromTo(
				yCoords,
				{
					endArray: [0, 0, 0, ...egMatrixY, 0]
				},
				{
					endArray: () => [0, 0, 0, matrix[1], matrix[5], 0],
					onUpdate: () => {
						yCoords = yCoords;
					},
					immediateRender: false,
					duration
				},
				"step-1"
			)
			// Hide basis vectors
			// FIXME: Animate opacity of vectors
			.to(
				props,
				{
					duration,
					xTexOpacity: 0,
					yTexOpacity: 0,
					// xVisible: false,
					// yVisible: false,
					onUpdate: function () {
						props = props;
					}
				},
				"step-1"
			)
			// Show alt basis vectors
			.to(
				basisAltProps,
				{
					duration: 0.001,
					xVisible: true,
					yVisible: true,
					onUpdate: function () {
						basisAltProps = basisAltProps;
					}
				},
				"step-1"
			)
			.to(
				props,
				{
					duration: 0.001,
					xVisible: false,
					yVisible: false,
					onUpdate: function () {
						props = props;
					}
				},
				"step-1"
			);
		// Show example vector

		// Animate back
		gsap
			.timeline({
				scrollTrigger: {
					...stPropsAlt,
					trigger: "#section-2",
					start: "top center",
					// FIXME:
					// onToggle: () => {
					onEnter: () => {
						// stProps.onEnter();

						$showPlayground = false;

						// Return to default camera position
						$cameraControls.reset(true);

						// Reset input settings
						// cachePlaygroundSettings.dataToggled = $dataToggled;
						$dataToggled = undefined;
						$gridToggled = true;
						$transformedGridToggled = false;
						$inputVectorToggled = false;

						// Reset playhead
						$matrixTween.progress(1);

						// Reset matrix transform
						gsap.to($endMatrix, {
							endArray: initMatrix,
							onUpdate: () => {
								$endMatrix = $endMatrix;
							},
							duration
						});
					},
					onLeaveBack: () => {
						// stProps.onLeaveBack();

						$showPlayground = true;

						// $vectorCoordsInput[0] = egVector[0];
						// $vectorCoordsInput[1] = egVector[1];
						// $vectorCoordsInput[2] = 0;

						// $inputVectorToggled = false;
						// onInputVectorToggle(false);
						basisAltProps.vectorVisible = true;

						// $dataToggled = cachePlaygroundSettings.dataToggled;
					}
				},
				timelinePropsAlt
			})
			.add("step-1")
			// Change grid settings
			.to(
				gridVars,
				{
					duration,
					fadeDistance: grid3dProps.fadeDistance,
					onUpdate: () => {
						gridVars = gridVars;
					}
				},
				"step-1"
			)
			// Disable inputs
			.to(
				"#canvas-wrapper",
				{
					pointerEvents: "none",
					duration
				},
				"step-1"
			)
			.to(
				"#inputs",
				{
					autoAlpha: 0,
					x: -40,
					duration
				},
				"step-1"
			)
			// Reset basis vectors
			.to(
				xCoords,
				{
					endArray: () => [0, 0, 0, 1, 0, 0],
					onUpdate: () => {
						xCoords = xCoords;
					},
					duration: 0.001
				},
				"step-1"
			)
			.to(
				yCoords,
				{
					endArray: () => [0, 0, 0, 0, 1, 0],
					onUpdate: () => {
						yCoords = yCoords;
					},
					duration: 0.001
				},
				"step-1"
			)
			.add("step-2")
			.to(
				basisAltProps,
				{
					duration: 0.001,
					xVisible: false,
					yVisible: false,
					onUpdate: function () {
						basisAltProps = basisAltProps;
					}
				},
				"step-2"
			)
			.to(
				props,
				{
					duration: 0.001,
					xVisible: true,
					yVisible: true,
					onUpdate: function () {
						props = props;
					}
				},
				"step-2"
			);

		// Show third dimension
		gsap
			.timeline({
				...timelineProps,
				scrollTrigger: {
					...stProps,
					trigger: "#st-9",
					end: `+=${scrollUnit * 3}`,
					onEnter: () => {
						stProps.onEnter();

						$show3d = true;
            $show2d = false
						basisAltProps.zVisible = false;

						// // Update matrix transform
						// gsap.to($endMatrix, {
						// 	endArray: eg3dMatrix,
						// 	onUpdate: () => {
						// 		$endMatrix = $endMatrix;
						// 	},
						// 	duration
						// });

						basisAltProps.vectorVisible = false;

						// $inputVectorToggled = true;

						// $vectorCoordsInput[0] = eg3dVector[0];
						// $vectorCoordsInput[1] = eg3dVector[1];
						// $vectorCoordsInput[2] = eg3dVector[2];
					},
					onLeaveBack: () => {
						stProps.onLeaveBack();

						$show3d = false;
            $show2d = true
						$grid3dToggled = false;

						$inputVectorToggled = false;
						onInputVectorToggle(false);

						// basisAltProps.vectorVisible = true;

						// $vectorCoordsInput = egVector;
						// $vectorCoordsInput[0] = egVector[0];
						// $vectorCoordsInput[1] = egVector[1];
						// $vectorCoordsInput[2] = 0;

						// $inputVectorToggled = false;

						// // Reset matrix transform
						// gsap.to($endMatrix, {
						// 	endArray: initMatrix,
						// 	onUpdate: () => {
						// 		$endMatrix = $endMatrix;
						// 	},
						// 	duration
						// });
					},
					onLeave: () => {
						stProps.onLeave();

						$cameraAutoRotate = true;
						$grid3dToggled = true;
					},
					onEnterBack: () => {
						stProps.onEnterBack();

						$cameraAutoRotate = false;
						gsap.to($cameraControls, {
							azimuthAngle: Math.PI * 0.3
						});
					}
				}
			})
			.add("step-0")
			.to(
				$cameraControls.mouseButtons,
				{
					right: CameraControls.ACTION.ROTATE,
					duration: 0.001
				},
				"step-0"
			)
			// Update matrix
			.to(
				{},
				{
					duration: delay
				},
				"step-0"
			)
			.add("step-1")
			// Change camera position
			.to(
				$cameraControls,
				{
					// distance: 8.5,
					distance: 15,
					polarAngle: Math.PI * 0.35,
					// azimuthAngle: `+=${Math.PI * 0.3}`
					azimuthAngle: Math.PI * 0.3
				},
				"step-1"
			)
			// Animate in z basis
			.to(
				zCoords,
				{
					endArray: [0, 0, 0, 0, 0, 1],
					onUpdate: function () {
						zCoords = zCoords;
					}
				},
				"step-1"
			)
			.to(
				props,
				{
					xTexOpacity: 1,
					yTexOpacity: 1,
					xDim3: true,
					yDim3: true,
					zDim3: true,
					vectorDim3: true,
					onUpdate: function () {
						props = props;
					}
				},
				"step-1"
			)
			// Animate in example vector
			.to(
				vectorCoords,
				{
					endArray: [0, 0, 0, ...eg3dVector],
					onUpdate: function () {
						vectorCoords = vectorCoords;
					}
				},
				"step-1"
			)
			// .to(
			// 	$vectorCoordsInput,
			// 	{
			// 		endArray: eg3dVector,
			// 		onUpdate: function () {
			// 			$vectorCoordsInput = $vectorCoordsInput;
			// 		}
			// 	},
			// 	"step-1"
			// )
			.add("step-2")
			.to(
				$matrixTween,
				{
					progress: 0,
					duration: 0.001
				},
				"step-2"
			)
			.to(
				$endMatrix,
				{
					endArray: eg3dMatrix,
					duration: 0.001,
					onUpdate: function () {
						$endMatrix = $endMatrix;
					}
				},
				"step-2"
			)
			.to(
				props,
				{
					zTexOpacity: 1,
					onUpdate: function () {
						props = props;
					}
				},
				"step-2"
			)
			.to(
				props,
				{
					vectorTexOpacity: 1,
					onUpdate: function () {
						props = props;
					}
				},
				"step-2"
			)
			// Animate in 3d grid
			.to(
				grid3dProps,
				{
					cellThickness: defaultGridProps.cellThickness,
					sectionThickness: defaultGridProps.sectionThickness,
					onUpdate: function () {
						grid3dProps = grid3dProps;
					}
				},
				"step-2"
			)
			.add("step-3")
			.to(
				grid3dProps,
				{
					t: 1,
					onUpdate: function () {
						grid3dProps = grid3dProps;
					}
				},
				"step-3"
			)
			.to(
				{},
				{
					duration: delay
				}
			);

		// Perform linear transformation; in 3D!
		gsap
			.timeline({
				...timelineProps,
				scrollTrigger: {
					...stProps,
					trigger: "#st-10",
					end: `+=${scrollUnit * 1}`,
					onEnter: () => {
						stProps.onEnter();

						$vectorCoordsInput[0] = eg3dVector[0];
						$vectorCoordsInput[1] = eg3dVector[1];
						$vectorCoordsInput[2] = eg3dVector[2];
					},
					onLeaveBack: () => {
						stProps.onLeaveBack();

						$vectorCoordsInput[0] = egVector[0];
						$vectorCoordsInput[1] = egVector[1];
						$vectorCoordsInput[2] = 0;
					}
				}
			})
			.add("step-1")
			.to(
				$matrixTween,
				{
					progress: 1.0
				},
				"step-1"
			)
			// Animate to new basis vectors
			.to(
				xCoords,
				{
					endArray: [0, 0, 0, ...eg3dMatrixX],
					onUpdate: function () {
						xCoords = xCoords;
					}
				},
				"step-1"
			)
			.to(
				yCoords,
				{
					endArray: [0, 0, 0, ...eg3dMatrixY],
					onUpdate: function () {
						yCoords = yCoords;
					}
				},
				"step-1"
			)
			.to(
				zCoords,
				{
					endArray: [0, 0, 0, ...eg3dMatrixZ],
					onUpdate: function () {
						zCoords = zCoords;
					}
				},
				"step-1"
			)
			// Animate output vector
			.to(
				vectorCoords,
				{
					endArray: [0, 0, 0, ...eg3dOutputVector],
					onUpdate: function () {
						vectorCoords = vectorCoords;
					}
				},
				"step-1"
			)
			.to(
				{},
				{
					duration: delay
				}
			);

		// TODO: What is the best way to show transformations of space in 3D?
		// FIXME: Do we need this animation again?
		// Show linear combination;  Scale the basis vectors to the transformed vector
		// gsap
		// 	.timeline({
		// 		...timelineProps,
		// 		scrollTrigger: {
		// 			...stProps,
		// 			trigger: "#st-11",
		// 			end: `+=${scrollUnit * 3}`
		// 		}
		// 	})
		// 	.add("step-1")
		// 	// Animate out Tex
		// 	.to(
		// 		props,
		// 		{
		// 			xTexOpacity: 0,
		// 			yTexOpacity: 0,
		// 			zTexOpacity: 0,
		// 			onUpdate: function () {
		// 				props = props;
		// 			}
		// 		},
		// 		"step-1"
		// 	)
		// 	.add("step-2")
		// 	// Show scalars
		// 	.to(
		// 		props,
		// 		{
		// 			duration: 0.2,
		// 			xScalarOpacity: 1,
		// 			yScalarOpacity: 1,
		// 			zScalarOpacity: 1,
		// 			onUpdate: function () {
		// 				props = props;
		// 			}
		// 		},
		// 		"step-2"
		// 	)
		// 	// Scale basis vectors
		// 	.to(
		// 		xCoords,
		// 		{
		// 			endArray: [
		// 				0,
		// 				0,
		// 				0,
		// 				eg3dVector[0] * eg3dMatrixX[0],
		// 				eg3dVector[0] * eg3dMatrixX[1],
		// 				eg3dVector[0] * eg3dMatrixX[2]
		// 			],
		// 			onUpdate: function () {
		// 				xCoords = xCoords;
		// 			}
		// 		},
		// 		"step-2"
		// 	)
		// 	.to(
		// 		yCoords,
		// 		{
		// 			endArray: [
		// 				0,
		// 				0,
		// 				0,
		// 				eg3dVector[1] * eg3dMatrixY[0],
		// 				eg3dVector[1] * eg3dMatrixY[1],
		// 				eg3dVector[1] * eg3dMatrixY[2]
		// 			],
		// 			onUpdate: function () {
		// 				yCoords = yCoords;
		// 			}
		// 		},
		// 		"step-2"
		// 	)
		// 	.to(
		// 		zCoords,
		// 		{
		// 			endArray: [
		// 				0,
		// 				0,
		// 				0,
		// 				eg3dVector[2] * eg3dMatrixZ[0],
		// 				eg3dVector[2] * eg3dMatrixZ[1],
		// 				eg3dVector[2] * eg3dMatrixZ[2]
		// 			],
		// 			onUpdate: function () {
		// 				zCoords = zCoords;
		// 			}
		// 		},
		// 		"step-2"
		// 	)
		// 	// Animate scalar text too
		// 	.to(
		// 		props,
		// 		{
		// 			xScalar: eg3dVector[0],
		// 			yScalar: eg3dVector[1],
		// 			zScalar: eg3dVector[2],
		// 			onUpdate: function () {
		// 				props = props;
		// 			}
		// 		},
		// 		"step-2"
		// 	)
		// 	.to({}, { duration: delay });

		// Maxwell the carryable cat
		gsap
			.timeline({
				...timelineProps,
				scrollTrigger: {
					...stProps,
					trigger: "#st-12",
					end: `+=${scrollUnit * 1}`,
					onLeave: () => {
						stProps.onLeave();

						$dataToggled = "model";

						$inputVectorToggled = true;
					},
					onLeaveBack: () => {
						stProps.onLeaveBack();

						$dataToggled = undefined;
					}
				}
			})
			.to(modelProps, {
				scale: 0.25,
				onUpdate: function () {
					modelProps = modelProps;
				}
			})
			.to(
				{},
				{
					duration: delay
				}
			);

		// Show playground
		const playgroundTl = gsap
			.timeline({
				scrollTrigger: {
					...stPropsAlt,
					trigger: "#st-13",
					start: "top center",
					onEnter: () => {
						$cameraAutoRotate = false;

						$showPlayground = true;

						basisAltProps.vectorVisible = true;
						props.vectorVisible = true;
					},
					onLeaveBack: () => {
						$cameraAutoRotate = true;

						$showPlayground = false;

						// Reset
						$dataToggled = "model";
						$grid3dToggled = true;
						$gridToggled = true;
						$transformedGridToggled = false;

						$show3d = true;

						// Reset playhead
						$matrixTween.progress(1);

						// Reset matrix transform
						gsap.to($endMatrix, {
							endArray: eg3dMatrix,
							onUpdate: () => {
								$endMatrix = $endMatrix;
							},
							duration
						});

						basisAltProps.vectorVisible = false;
						props.vectorVisible = false;
					}
				},
				timelinePropsAlt
			})
			.add("step-1")
			// Make canvas interactable
			.to(
				"#canvas-wrapper",
				{
					pointerEvents: "auto",
					// cursor: "move",
					duration
				},
				"step-1"
			)
			// Show input
			.to(
				"#inputs",
				{
					autoAlpha: 1,
					x: 0,
					duration
				},
				"step-1"
			)
			// Hide basis vectors
			.to(
				props,
				{
					duration,
					xTexOpacity: 0,
					yTexOpacity: 0,
					zTexOpacity: 0,
					vectorTexOpacity: 0,
					xVisible: false,
					yVisible: false,
					zVisible: false,
					onUpdate: function () {
						props = props;
					}
				},
				"step-1"
			)
			// Show alt basis vectors
			.to(
				basisAltProps,
				{
					duration,
					xVisible: true,
					yVisible: true,
					zVisible: true,
					onUpdate: function () {
						basisAltProps = basisAltProps;
					}
				},
				"step-1"
			);

		// $playgroundSt = playgroundTl.scrollTrigger;

		// ScrollTrigger.create({
		// 	trigger: "#article",
		// 	start: "bottom bottom",
		// 	onEnter: () => {
		// 		console.log("enter");
		// 		$showPlayground = false;
		// 	},
		// 	onLeaveBack: () => {
		// 		$showPlayground = true;
		// 	}
		// });

		const test = gsap
			.timeline({
				scrollTrigger: {
					...stPropsAlt,
					trigger: "#article",
					start: "bottom bottom",
					onEnter: () => {
						$showPlayground = false;
					},
					onLeaveBack: () => {
						$showPlayground = true;
					}
				},
				timelinePropsAlt
			})
			.to(
				"#inputs",
				{
					autoAlpha: 0,
					x: -40,
					duration
				},
				"step-1"
			);

		$playgroundSt = test.scrollTrigger;

		// ScrollTrigger.refresh()

		// $arcadeMounted = true

		// Text animations
		gsap.utils.toArray("#article section.animate > *").forEach((el) => {
			let animation;

			if (el.className === "exclude") {
				animation = gsap
					.timeline({ paused: true })
					.from(el, {
						opacity: 0,
						y: 100,
						duration: 0.6
					})
					.from(el.querySelectorAll("li"), {
						x: -40,
						opacity: 0,
						stagger: {
							amount: 0.3
						}
					});
			} else {
				animation = gsap.from(el, {
					opacity: 0,
					y: 20,
					paused: true
				});
			}

			ScrollTrigger.create({
				trigger: el,
				start: "top center",
				animation,
				pinnedContainer: "#article"
			});
		});

		// fire 100 (PLAN-FIRE100): the det spans pin #det-article — their OWN
		// container — so this is no longer 23 pins of one element (the four
		// failures in fires 81/92/93 all shared that premise). Same batch as
		// st-1..13, the proven creation moment. The health guard in detPins.js
		// (collapse OR scroll-flow detach) falls back to rect mode if anything
		// still corrupts.
		// fire 110: the batch call routes through the docH SETTLE gate now.
		// The story pins' function windows measure station crosses at creation
		// (measured live: det-st-1's cross read 14630 mid-cascade vs its true
		// 32392 once the original's 19000 of spacing had applied) and a
		// refresh-robust frozen measurement engages the pin at the wrong
		// scroll from the load. The polls re-attempt every 300ms, so this
		// call simply becomes the retry loop's first attempt; creation lands
		// ~1s later on the settled layout.
		try {
			createDetStations();
		} catch (err) {
			console.error("[det] createDetStations threw:", err);
		}
	}

	function updateStProgress(progress) {
		gsap.set("#st-progress", {
			scaleY: progress
		});
	}
	function animateInStProgress() {
		gsap.to("#st-progress", {
			opacity: 1,
			duration: 0.5
		});
	}
	function animateOutStProgress() {
		gsap.to("#st-progress", {
			opacity: 0,
			duration: 0.5
		});
	}

	// TODO: Make sure ScrollTriggers are in order
	// DOM / Layout is already mounted
	$: if (!$debug && mounted && $sceneMounted) animate();

	onMount(() => {
		mounted = true;
	});
</script>

{#if $showHero}
	<Hero />
{/if}

<!-- TODO: Shadows? -->

<!-- TODO: Add sky? -->
<!-- <Sky /> -->

<!-- Peripherals -->
<!-- <Grid {view} {dim} opacity={0.2} {gridColor} {axisColor} />
<Grid view={transformedView} {dim} {gridColor} {axisColor} /> -->

<!-- Example vector -->
<Vector
	{view}
	coords={vectorCoords}
	color={colorVector}
	texOpacity={props.vectorTexOpacity}
	visible={props.xVisible && $detStep === 0 && $det3dStep === 0 && !$detApproached}
	dim3={props.vectorDim3}
/>

<!-- Example vector that animates on input -->
<Vector
	view={transformedView}
	coords={[0, 0, 0, ...$vectorCoordsSpring]}
	color={colorVector}
	tex={false}
	visible={basisAltProps.vectorVisible && $detStep === 0 && $det3dStep === 0 && !$detApproached}
/>

<!-- Basis vectors -->
<Vector
	{view}
	coords={xCoords}
	color={colorX}
	texOpacity={props.xTexOpacity}
	scalar={props.xScalar}
	scalarOpacity={props.xScalarOpacity}
	scalarAlign={props.xScalarAlign}
	visible={props.xVisible && $detStep === 0 && $det3dStep === 0 && !$detApproached}
	dim3={props.xDim3}
/>
<Vector
	{view}
	coords={yCoords}
	color={colorY}
	texOpacity={props.yTexOpacity}
	scalar={props.yScalar}
	scalarOpacity={props.yScalarOpacity}
	scalarAlign={props.yScalarAlign}
	visible={props.yVisible && $detStep === 0 && $det3dStep === 0 && !$detApproached}
	dim3={props.yDim3}
/>
<Vector
	{view}
	coords={zCoords}
	color={colorZ}
	texOpacity={props.zTexOpacity}
	scalar={props.zScalar}
	scalarOpacity={props.zScalarOpacity}
	scalarAlign={props.zScalarAlign}
	visible={props.zVisible && $detStep === 0 && $det3dStep === 0 && !$detApproached}
	dim3={props.zDim3}
/>

<!-- Basis vectors (that animate on input) -->
<Vector
	view={transformedView}
	coords={[0, 0, 0, 1, 0, 0]}
	color={colorX}
	tex={false}
	visible={basisAltProps.xVisible && $detStep === 0 && $det3dStep === 0 && !$detApproached}
/>
<Vector
	view={transformedView}
	coords={[0, 0, 0, 0, 1, 0]}
	color={colorY}
	tex={false}
	visible={basisAltProps.yVisible && $detStep === 0 && $det3dStep === 0 && !$detApproached}
/>
<Vector
	view={transformedView}
	coords={[0, 0, 0, 0, 0, 1]}
	color={colorZ}
	tex={false}
	visible={basisAltProps.zVisible && $detStep === 0 && $det3dStep === 0 && !$detApproached}
/>

<!-- FIXME: Change blending mode of grid? -->
<T.Group renderOrder={-3}>
	<Grid {...gridProps} axes={"xyz"} />
</T.Group>

<!-- Transformed elements -->
<!-- TODO: Overlay another grid in the hero for a cool effect? -->
<!-- fire 50 (user: entering the det section swapped the grid): this group is
     ALWAYS mounted — visibility is owned purely by the transformedGridToggled
     fade (fadeDistance), the house pattern. The old visible={$detStep === 0
     || $detStep === 6} gate hard-hid the bright grid during story steps 1-5,
     so the engines' transformedGridToggled=true flips never rendered and the
     story played over the dim slate grid — the "grid disappears and a new
     one appears" the user saw. -->
<T.Group renderOrder={-2} matrix={$matrixTransform} matrixAutoUpdate={false}>
	<!-- Grids -->
	<!-- FIXME: Don't do infinite grid? A bit confusing -->

	<Grid {...transformedGridProps} axes={"xyz"} />
</T.Group>

<!-- fire 59: the wall grids now play the ORIGINAL's 2D<->3D choreography in
     the det section too — they deflate/grow with grid3dProps.t + thickness
     (the visible gate is gone, matching the original which has none). The
     engines stage the store flips so the walls shrink while the camera
     swings down into the det story and grow as the 3D chapter swings up;
     by the time any top-down camera rests, t is already 0 (no streaks).
     fire 102 (the section-2 cube bleed): these two walls ARE the cube
     geometry st-9..st-12 build, and st-9's SCRUBBED timeline re-renders its
     end pose (t 1 + full thickness) on every scroll tick even past its range
     (the fire-100 scrub finding) — so the engines' grid3dToggled=false flips
     lost the fight and the walls bled through the det approach and story.
     The thickness gates below mirror the fire-81 house gates: while the det
     region owns the canvas the walls render at 0 regardless of what the
     scrub writes back into grid3dProps; outside it the original's own
     choreography applies untouched. -->
<T.Group renderOrder={-4} matrix={$matrixTransform} matrixAutoUpdate={false}>
	<!-- 3d grid -->
	<Grid
		axes={"xzy"}
		position.z={gridSectionSize * 0}
		position.y={gridSectionSize}
		{...grid3dProps}
		cellThickness={$detStep === 0 && $det3dStep === 0 && !$detApproached ? grid3dProps.cellThickness : 0}
		sectionThickness={$detStep === 0 && $det3dStep === 0 && !$detApproached ? grid3dProps.sectionThickness : 0}
	/>
	<Grid
		axes={"zyx"}
		position.z={gridSectionSize * 0}
		position.x={-gridSectionSize}
		{...grid3dProps}
		cellThickness={$detStep === 0 && $det3dStep === 0 && !$detApproached ? grid3dProps.cellThickness : 0}
		sectionThickness={$detStep === 0 && $det3dStep === 0 && !$detApproached ? grid3dProps.sectionThickness : 0}
	/>
</T.Group>

<!-- Maxwell the carryable cat -->
<T.Group renderOrder={-4} matrix={$matrixTransform} matrixAutoUpdate={false} visible={$detStep === 0 && $det3dStep === 0 && !$detApproached}>
	{#await useGltf(`${assets}/maxwell.glb`) then model}
		<T
			is={model.scene}
			position.z={0}
			rotation={[Math.PI / 2, 0, 0]}
			{...modelProps}
		/>
	{/await}

	<T.Mesh {...imageProps}>
		<T.PlaneGeometry args={[6, 6]} />
		<!-- {#await useTexture("/maxwell.jpg") then texture}
			<T.MeshBasicMaterial map={texture}>
				<T.DoubleSide attach="side" />
			</T.MeshBasicMaterial>
		{/await} -->
		{#await map then value}
			<T.MeshBasicMaterial map={value}>
				<T.DoubleSide attach="side" />
			</T.MeshBasicMaterial>
		{/await}
	</T.Mesh>
</T.Group>

<!-- Add a plane -->
<!-- <T.Mesh position.z={-0.02}>
	<T.PlaneGeometry args={[40, 40]} />
	<T.MeshStandardMaterial
		color={new Color("hsl(231, 15%, 18%)")}
		opacity={0.8}
		transparent={true}
	>
		<T.DoubleSide attach="side" />
	</T.MeshStandardMaterial>
</T.Mesh> -->

<!-- TODO: Remove objects that are not visible? -->
<!-- Data — the original's chapter-1 dot/vector/plane fields are MATHBOX
     primitives: {#if}-unmounting strands their WebGL objects in the mathbox
     scene graph (frozen mid-reveal ghosts, duplicated on every re-mount), so
     they stay mounted and hide through their own reveal transitions whenever
     the det story owns the canvas (user: "a bunch of clutter that hides what
     we are trying to explain") -->
<Planes view={transformedView} t={$detStep === 0 && $det3dStep === 0 && !$detApproached ? planesProps.t : 0} />
<Points view={transformedView} t={$detStep === 0 && $det3dStep === 0 && !$detApproached ? pointsProps.t : 0} />
<Planes view={transformedView} t={$detStep === 0 && $det3dStep === 0 && !$detApproached ? planes3dProps.t : 0} dim3 />
<Points view={transformedView} t={$detStep === 0 && $det3dStep === 0 && !$detApproached ? points3dProps.t : 0} dim3 />
<!-- <Sphere view={transformedView} /> -->
<!-- <Circle view={transformedView} /> -->

<!-- <Plane
	view={transformedView}
	dim={planeDim}
	position={[-planeDim / 2 - 0.5, -planeDim / 2, -planeDim / 2]}
	rotation={[0, -Math.PI / 2, 0]}
	t={grid3dProps.t}
/>
<Plane
	view={transformedView}
	dim={planeDim}
	position={[-planeDim / 2, planeDim / 2 + 0.5, planeDim / 2]}
	rotation={[-Math.PI / 2, 0, 0]}
	t={grid3dProps.t}
/> -->
<!-- fire 50 (user: "patches of black in the grid"): these near-black mathbox
     backdrop surfaces ride grid3dProps.t — the det3d story's grid3dToggled
     flip faded them back IN over the bright floor grid, painting dark
     patches. They hide through their own reveal whenever the det section
     owns the canvas (the same pattern as the data fields above). -->
<Plane
	view={transformedView}
	dim={planeDim}
	position={[-planeDim / 2, -planeDim / 2, -planeDim / 2]}
	rotation={[0, -Math.PI / 2, 0]}
	t={$detStep === 0 && $det3dStep === 0 && !$detApproached ? grid3dProps.t : 0}
/>
<Plane
	view={transformedView}
	dim={planeDim}
	position={[-planeDim / 2, planeDim / 2, planeDim / 2]}
	rotation={[-Math.PI / 2, 0, 0]}
	t={$detStep === 0 && $det3dStep === 0 && !$detApproached ? grid3dProps.t : 0}
/>

<!-- mathbox vector lattice — same reveal-driven hiding as the data fields:
     the original's st-6 scrub leaves enter: 1 / exit: 0 past its range, which
     would otherwise float the lattice over the det story and try-it -->
<Vectors
	view={transformedView}
	enter={$detStep === 0 && $det3dStep === 0 && !$detApproached ? vectorsProps.enter : 0}
	exit={$detStep === 0 && $det3dStep === 0 && !$detApproached ? vectorsProps.exit : 1}
/>
