// Utils https://assets.codepen.io/573855/utils-v3.js

gsap.registerPlugin(ScrollTrigger, ScrollSmoother);

ScrollTrigger.config({
	limitCallbacks: true,
	ignoreMobileResize: true,
	autoRefreshEvents: "DOMContentLoaded,load"
});

const scroller = (() => {
	if (
		typeof gsap === "undefined" ||
		typeof ScrollSmoother === "undefined" ||
		utils.device.isTouch()
	) {
		document.body.classList.add("normalize-scroll");
		return null;
	}

	return {
		initialize: (
			contentSelector = ".content-scroll",
			wrapperSelector = ".viewport-wrapper"
		) =>
			ScrollSmoother.create({
				content: contentSelector,
				wrapper: wrapperSelector,
				smooth: 2,
				effects: false,
				normalizeScroll: true,
				preventDefault: true
			})
	};
})();

const createCarousel = () => {
	let DOM = {};
	let swiper = null;
	let swiperInitialized = false;
	let gsapAnimation = null;

	let isScrubActive = false;
	let isSwiperNavigation = false;
	let centeredSlides = true;
	let currentActiveSlideIndex = 0;
	let options = {};
	let slidesInteraction = false;
	let isTouching = false;
	let slideOpacity = true;

	const defaultOptions = {
		selector: null,
		centeredSlides: true,
		slideOpacity: true,
		isScrubActive: false,
		isScrubOnTouchActive: false,
		scrubDir: 1
	};

	const _initializeSwiper = (selectorEl) => {
		if (!selectorEl) return;

		const swiperOptions = {
			init: false,
			runCallbacksOnInit: true,
			direction: "horizontal",
			slidesPerView: "auto",
			centeredSlides,
			centeredSlidesBounds: false,
			slidesOffsetBefore: _getSlidesOffset(),
			slidesOffsetAfter: _getSlidesOffsetAfter(),
			spaceBetween: 0,
			initialSlide: currentActiveSlideIndex,
			loop: false,
			speed: 700,
			roundLengths: false,
			preloadImages: false,
			touchMoveStopPropagation: false,
			threshold: utils.device.isTouch() ? 10 : 6,
			passiveListeners: true,
			preventClicks: true,
			watchSlidesProgress: slideOpacity,
			watchSlidesVisibility: false,
			grabCursor: !utils.device.isTouch(),
			customTransition: true,
			slideToClickedSlide: false,
			virtualTranslate: false,
			watchOverflow: false,
			resistanceRatio: 0.85,
			on: {
				init: _onSwiperInit,
				setTransition: _onSetTransition,
				progress: _onSwiperProgress,
				touchStart: _onTouchStart
			}
		};

		// Add scrub-specific config
		if (isScrubActive) {
			swiperOptions.updateOnWindowResize = false;
			swiperOptions.grabCursor = false;
			utils.dom.addClass(DOM.swiper, "swiper-no-swiping");
		} else {
			// Attach pagination only if it exists
			if (DOM.swiperPagination) {
				swiperOptions.pagination = {
					el: DOM.swiperPagination,
					type: "bullets",
					clickable: true
				};
			}

			// Setup navigation buttons if available and non touch
			if (!utils.device.isTouch()) _setupNavigation();

			// Attach bounds-checking callbacks
			swiperOptions.on.touchMove = _onTouchMove;
			swiperOptions.on.touchEnd = _onTouchEnd;
			swiperOptions.on.transitionStart = _checkBounds;
			swiperOptions.on.transitionEnd = _checkBounds;
		}

		swiper = new Swiper(selectorEl, swiperOptions);

		utils.system.nextTick(() => {
			swiper.init();
			_updateSwiperStateByProgress(0);
			_update();
		});
	};

	/**
	 * Gets the spacing between Swiper slides based on the `.swiper-column-gap` element.
	 * @returns {number}
	 */

	const _getSlideSpacing = () => {
		return DOM.cachedSlideSpacing ?? 0;
	};

	/**
	 * Calculates horizontal offset before the first Swiper slide,
	 * based on layout breakpoints and centered slide settings.
	 * @returns {number}
	 */
	const _getSlidesOffset = () => {
		const spacingOffset = _getSlideSpacing(); // already cached
		const bodyWidth = document.body.clientWidth;
		const maxWrapperSize = _getMaxWrapperSize();
		const adjustedMax = maxWrapperSize + 0.5;
		const viewportWidth = window.innerWidth;

		if (viewportWidth < adjustedMax) {
			return centeredSlides && viewportWidth > DOM.mdBreakpoint
				? 0
				: spacingOffset;
		}

		if (centeredSlides) return 0;

		//const additionalSpacing = spacingOffset// * 2;
		const wrapperWidth = maxWrapperSize - spacingOffset;
		const padding = (bodyWidth - wrapperWidth) * 0.5;

		return Math.max(padding, spacingOffset);
	};

	/**
	 * Calculates horizontal offset after the last Swiper slide.
	 * Adjusts for cases where there are too few slides to fill the width.
	 * @returns {number}
	 */
	const _getSlidesOffsetAfter = () => {
		const beforeOffset = _getSlidesOffset();

		if (centeredSlides || !swiperInitialized || !swiper) {
			return beforeOffset;
		}

		const slides = swiper.slides || [];
		const spacing = _getSlideSpacing();
		const slideCount = slides.length;

		let totalSlideWidth = 0;
		for (let i = 0; i < slideCount; i++) {
			totalSlideWidth += slides[i]?.offsetWidth || 0;
		}

		const containerWidth = swiper.width;
		const remainingSpace = containerWidth - beforeOffset - totalSlideWidth;

		if (remainingSpace > 0) {
			const compensation =
				Math.round(remainingSpace + spacing * (slideCount - 1)) + 1;
			return -compensation;
		}

		return beforeOffset;
	};

	/**
	 * Checks swiper bounds (start/end) and updates navigation arrow visibility.
	 */
	const _checkBounds = () => {
		if (!swiper || !swiperInitialized || !isSwiperNavigation) return;

		const isBeginning = swiper.isBeginning;
		const isEnd = swiper.isEnd;

		_updateSwiperNavigation(isBeginning, isEnd);
	};

	/**
	 * Configures Swiper pagination if available and scrub mode is off.
	 */
	const _setupPagination = () => {
		if (!DOM.swiperPagination) return;

		swiper.params.pagination = {
			el: DOM.swiperPagination,
			type: "bullets",
			clickable: true
		};
	};

	const _setupNavigation = () => {
		const container = DOM.swiperNavigationContainer;
		if (!container) return;

		DOM.swiperNext = container.querySelector(".swiper-next");
		DOM.swiperPrev = container.querySelector(".swiper-prev");
		isSwiperNavigation = true;

		if (DOM.swiperNext) {
			DOM.swiperNext.addEventListener("click", () => {
				swiper.slideTo(swiper.activeIndex + 1);
			});
		}

		if (DOM.swiperPrev) {
			DOM.swiperPrev.addEventListener("click", () => {
				swiper.slideTo(swiper.activeIndex - 1);
			});
		}
	};

	const _onSwiperInit = () => {
		swiperInitialized = true;
		_toggleSlidesInteraction(true);
	};

	const _toggleSlidesInteraction = (enabled = true) => {
		if (!swiperInitialized || !swiper || slidesInteraction == enabled) return;
		const slides = swiper.slides;
		const len = slides.length;
		let slide;
		for (let i = 0; i < len; i++) {
			slide = slides[i];
			if (!slide) continue;
			!enabled
				? utils.dom.addClass(slide, "no-interaction")
				: utils.dom.removeClass(slide, "no-interaction");
		}

		slidesInteraction = enabled;
	};

	/**
	 * Callback to apply transition duration to all slides manually.
	 * @param {number} speed - Transition duration in milliseconds.
	 */

	const _onSetTransition = (speed) => {
		if (!swiperInitialized || !swiper) return;

		const slides = swiper.slides;
		const len = slides.length;
		let slide;

		for (let i = 0; i < len; i++) {
			slide = slides[i];
			if (slide && slide.style) {
				slide.style.transition = `${speed}ms`;
			}
		}
	};

	/**
	 * Callback to apply visual effects based on Swiper progress.
	 * Primarily controls per-slide opacity
	 * @param {number} progress - Overall progress of Swiper (0–1).
	 */
	// Constants for Swiper slide opacity effect
	const OPACITY_THRESHOLD = 0.6; // Threshold below which we disable interaction
	const OPACITY_DIFF_THRESHOLD = 0.01; // Skip if opacity hasn't changed significantly
	const OPACITY_MIN_PROGRESS = 0.25; // Minimum slide progress to begin fading
	const OPACITY_MAX_PROGRESS = 0.85; //1; // Max slide progress
	const OPACITY_MIN_VALUE = 0.25; // Faded-out opacity
	const OPACITY_MAX_VALUE = 1; // Fully visible opacity

	const _onSwiperProgressNotInUse = (progress) => {
		if (!swiperInitialized || !swiper || !slideOpacity) return;

		const slides = swiper.slides;
		const len = slides.length;

		let i = 0,
			slide,
			slideProgress,
			absProgress,
			opacity,
			currentOpacity,
			hasClass;

		while (i < len) {
			slide = slides[i++];
			if (!slide) continue;

			slideProgress = utils.math.clamp(slide.progress ?? -1, -1, 1);
			absProgress = utils.math.clamp(
				Math.abs(slideProgress),
				OPACITY_MIN_PROGRESS,
				OPACITY_MAX_PROGRESS
			);
			opacity = utils.math.interpolateRange(
				absProgress,
				OPACITY_MIN_PROGRESS,
				OPACITY_MAX_PROGRESS,
				OPACITY_MAX_VALUE,
				OPACITY_MIN_VALUE
			);
			opacity = ((opacity * 1000) | 0) / 1000; // Fast toFixed(3)

			//Use custom property instead of style.opacity
			slide.style.setProperty("--swiper-slide-opacity", (1 - opacity).toFixed(3));

			if (!isTouching) {
				hasClass = slide.classList.contains("no-interaction");
				opacity < OPACITY_THRESHOLD
					? !hasClass && utils.dom.addClass(slide, "no-interaction")
					: hasClass && utils.dom.removeClass(slide, "no-interaction");
			}
		}
	};

	const _onSwiperProgress = (progress) => {
		if (!swiperInitialized || !swiper || !slideOpacity) return;

		const slides = swiper.slides;
		const len = slides.length;

		let i = 0,
			slide,
			slideProgress,
			absProgress,
			opacity,
			currentOpacity,
			hasClass;

		while (i < len) {
			slide = slides[i++];
			if (!slide) continue;

			slideProgress = utils.math.clamp(slide.progress ?? -1, -1, 1);
			absProgress = utils.math.clamp(
				Math.abs(slideProgress),
				OPACITY_MIN_PROGRESS,
				OPACITY_MAX_PROGRESS
			);
			opacity = utils.math.interpolateRange(
				absProgress,
				OPACITY_MIN_PROGRESS,
				OPACITY_MAX_PROGRESS,
				OPACITY_MAX_VALUE,
				OPACITY_MIN_VALUE
			);
			//  opacity = Math.pow(opacity, 1.1);
			opacity = ((opacity * 1000) | 0) / 1000; // Fast toFixed(3)

			currentOpacity = parseFloat(slide.style.opacity || 1);
			if (Math.abs(currentOpacity - opacity) > OPACITY_DIFF_THRESHOLD) {
				slide.style.opacity = opacity;
			}

			if (!isTouching) {
				hasClass = slide.classList.contains("no-interaction");
				opacity < OPACITY_THRESHOLD
					? !hasClass && utils.dom.addClass(slide, "no-interaction")
					: hasClass && utils.dom.removeClass(slide, "no-interaction");
			}
		}
	};

	/**
	 * Callback triggered when user starts interacting with Swiper (touch/drag).
	 * Clears all transition styles to allow natural dragging.
	 */
	const _onTouchStart = () => {
		if (!swiperInitialized || !swiper || isScrubActive) return;

		const slides = swiper.slides;
		const len = slides.length;
		let slide;

		for (let i = 0; i < len; i++) {
			slide = slides[i];
			if (slide && slide.style) {
				slide.style.transition = "";
			}
		}
	};

	const _onTouchMove = () => {
		if (!swiperInitialized || !swiper || isScrubActive) return;
		isTouching = true;
		if (!utils.device.isTouch()) {
			_toggleSlidesInteraction(false);
		}
	};

	const _onTouchEnd = () => {
		if (!swiperInitialized || !swiper || isScrubActive) return;
		isTouching = false;
		_checkBounds();
		if (!utils.device.isTouch()) {
			_toggleSlidesInteraction(true);
		}
	};

	/**
	 * Recalculates Swiper layout, navigation, and associated content positioning.
	 */
	const _update = () => {
		_updateSwiper();
		_updateTextBeforeWrapper();
		_updateSwiperNavigationContainer();
	};

	const _getSlideSpacingFromDOM = () => {
		const spacingEl = DOM.swiperSpacing;
		return spacingEl ? Math.ceil(spacingEl.offsetWidth) : 0;
	};

	/**
	 * Updates Swiper layout dynamically: offsets, spacing, centering.
	 * Also updates pagination and visual effects.
	 */
	const _updateSwiper = () => {
		if (!swiperInitialized || !swiper) return;

		// Call to ensure transition is fully cleared before layout updates
		swiper.transitionEnd?.();

		// Re-evaluate `centeredSlides` based on screen size
		const isSmallScreen = window.innerWidth < DOM.mdBreakpoint;
		centeredSlides = isSmallScreen ? false : options.centeredSlides;

		DOM.cachedSlideSpacing = _getSlideSpacingFromDOM();

		swiper.params.slidesOffsetBefore = _getSlidesOffset();
		swiper.params.slidesOffsetAfter = _getSlidesOffsetAfter();
		swiper.params.spaceBetween = _getSlideSpacing();
		swiper.params.centeredSlides = centeredSlides;

		swiper.update();
		swiper.pagination?.update?.();

		_onSwiperProgress(swiper.progress);
	};

	/**
	 * Toggles visibility of Swiper navigation buttons based on scroll bounds.
	 * @param {boolean} isBeginning - True if at the first slide.
	 * @param {boolean} isEnd - True if at the last slide.
	 */

	const _updateSwiperNavigation = (isBeginning, isEnd) => {
		if (!isSwiperNavigation) return;

		if (DOM.swiperNext) {
			const nextClassList = DOM.swiperNext.classList;
			const shouldBeHidden = isEnd;
			if (nextClassList.contains("hide") !== shouldBeHidden) {
				nextClassList.toggle("hide", shouldBeHidden);
			}
		}

		if (DOM.swiperPrev) {
			const prevClassList = DOM.swiperPrev.classList;
			const shouldBeHidden = isBeginning;
			if (prevClassList.contains("hide") !== shouldBeHidden) {
				prevClassList.toggle("hide", shouldBeHidden);
			}
		}
	};

	/**
	 * Updates custom CSS vars for aligning text before the Swiper.
	 * Based on current wrapper width, offset, and slide layout.
	 */

	const _updateTextBeforeWrapper = () => {
		const { textBefore, mediaContainerRef } = DOM;
		if (!swiper || !textBefore || !mediaContainerRef) return;

		const bodyWidth = document.body.clientWidth;
		const slideWidth = mediaContainerRef.offsetWidth;
		const wDiff = Math.max(0, (bodyWidth - _getMaxWrapperSize()) * 0.5);

		const slideOffset = centeredSlides
			? (bodyWidth - slideWidth) * 0.5 + _getSlidesOffset()
			: _getSlidesOffset();

		const beforeWidth = bodyWidth - slideOffset - wDiff;
		const marginLeft = slideOffset;

		textBefore.style.cssText = `--swiper-text-before-width: ${beforeWidth}px; --swiper-text-before-margin-left: ${marginLeft}px;`;
	};

	/**
	 * Updates CSS variable for Swiper navigation container height
	 * to match the current media (slide) container height.
	 */

	let lastNavigationHeight = -1;

	const _updateSwiperNavigationContainer = () => {
		const { swiperNavigationContainer, mediaContainerRef } = DOM;
		if (!swiper || !swiperNavigationContainer || !mediaContainerRef) return;

		const height = mediaContainerRef.offsetHeight;
		if (height === lastNavigationHeight) return; // Skip if no change

		swiperNavigationContainer.style.setProperty(
			"--swiper-navigation-height",
			`${height}px`
		);
		lastNavigationHeight = height;
	};

	/**
	 * Sets up a GSAP ScrollTrigger that scrubs Swiper based on scroll progress.
	 */

	const _proxy = {
		set _updateSwiperStateByProgress(value) {
			_updateSwiperStateByProgress(value);
		}
	};

	const _initializeGsapAnimation = () => {
		if (!isScrubActive || gsapAnimation) return;

		const slowDownFactor = 0.5;
		const getLVH = utils.css.getLVH;

		let cachedWrapperWidth = DOM.swiperWrapper?.offsetWidth || 0;
		let cachedSlideHeight =
			(swiper?.slides.length || 0) * getLVH() * slowDownFactor;

		gsapAnimation = gsap.to(_proxy, {
			_updateSwiperStateByProgress: 1,
			duration: 1,
			ease: "none",
			scrollTrigger: {
				id: `pin-${options.selector?.replace("#", "")}`,
				trigger: DOM.trigger,
				pin: DOM.pin,
				pinSpacing: true,
				scrub: true,
				invalidateOnRefresh: true,

				start: () => `${DOM.trigger.offsetHeight * 0.5}px ${getLVH() * 0.5}px`,

				end: () => `+=${Math.max(cachedWrapperWidth, cachedSlideHeight)}px`,

				//onUpdate: (self) => _updateSwiperStateByProgress(self.progress),

				onRefreshInit: () => {
					if (swiper && swiperInitialized) {
						swiper.updateSize();
						_update();
					}

					cachedWrapperWidth = DOM.swiperWrapper?.offsetWidth || 0;
					cachedSlideHeight =
						(swiper?.slides.length || 0) * getLVH() * slowDownFactor;
				},

				onRefresh: () => {
					if (swiper && swiperInitialized) {
						_update();
					}
				}
			}
		});
	};

	/**
	 * Applies scroll progress (0–1) to Swiper's internal translate state.
	 * Used for ScrollTrigger-based scrubbing.
	 * @param {number} progress - Normalized scroll progress (0 to 1)
	 */

	//let lastScrubProgress = -1;

	const _updateSwiperStateByProgress = (progress) => {
		if (!swiper || !swiperInitialized) return;

		const clamped = utils.math.clamp(isNaN(progress) ? 0 : progress, 0, 1);

		// Avoid unnecessary state updates for small changes
		//if ((clamped * 1000 | 0) === (lastScrubProgress * 1000 | 0)) return;
		//lastScrubProgress = clamped;

		const directionAdjusted = options.scrubDir === -1 ? 1 - clamped : clamped;

		const min = swiper.minTranslate();
		const max = swiper.maxTranslate();
		const translate = (max - min) * directionAdjusted + min;

		swiper.translateTo(translate, 0); // 0 = no duration
		swiper.updateActiveIndex();
		swiper.updateSlidesClasses();
	};

	const _getMaxWrapperSize = () => {
		const val = DOM.maxWrapperSize;
		return Number.isFinite(val) && val > 0 ? val : document.body.clientWidth;
	};

	/**
	 * Resets internal state and cached references
	 */

	const _reset = () => {
		DOM = Object.create(null); // avoids prototype inheritance issues
		swiper = null;
		swiperInitialized = false;
		gsapAnimation = null;

		isScrubActive = false;
		isSwiperNavigation = false;
		centeredSlides = true;
		slideOpacity = true;
		currentActiveSlideIndex = 0;

		options = { ...defaultOptions };
	};

	/**
	 * Applies `loading="lazy"` and `decoding="async"` to images
	 * if Swiper is outside the initial viewport.
	 */
	const _maybeLazyLoadImages = () => {
		const swiperEl = DOM.swiper;
		if (!swiperEl) return;

		const { top, bottom } = swiperEl.getBoundingClientRect();
		const viewportHeight = window.innerHeight;

		if (top < viewportHeight && bottom > 0) return; // Swiper is in view

		const images = swiperEl.querySelectorAll("img");
		let img;
		for (let i = 0; i < images.length; i++) {
			img = images[i];
			if (!img.hasAttribute("loading")) img.setAttribute("loading", "lazy");
			if (!img.hasAttribute("decoding")) img.setAttribute("decoding", "async");
		}
	};

	/**
	 * Main initializer: sets up swiper instance and (optionally) ScrollTrigger.
	 * @param {Object} opts
	 */
	const initialize = (opts = {}) => {
		_reset();
		options = { ...defaultOptions, ...opts };

		const el = utils.dom.resolveElement(options.selector);
		if (!el) {
			console.warn("[gsapSwiper] Invalid or missing selector.");
			return;
		}

		const swiperEl = el.querySelector(".swiper-container");
		const wrapperEl = swiperEl?.querySelector(".swiper-wrapper") || null;
		const spacingEl = swiperEl?.querySelector(".swiper-column-gap") || null;

		DOM.el = el;
		DOM.mediaContainerRef = el.querySelector(".media-container");
		DOM.textBefore = el.querySelector(".text-before");
		DOM.swiper = swiperEl;
		DOM.swiperSpacing = spacingEl;
		DOM.swiperWrapper = wrapperEl;

		DOM.cachedSlideSpacing = null;

		centeredSlides = options.centeredSlides;
		slideOpacity = options.slideOpacity;

		DOM.maxWrapperSize = utils.css.getCssVarValue(el, "--max-wrapper-size", true);
		DOM.mdBreakpoint =
			utils.css.getCssVarValue(el, "--md-breakpoint", true) + 0.5;

		isScrubActive = !utils.device.isTouch() && options.isScrubActive;
		if (utils.device.isTouch() && options.isScrubOnTouchActive) {
			isScrubActive = true;
		}

		if (!DOM.swiper) {
			console.warn(
				`[gsapSwiper] Could not find .swiper-container in ${options.selector}`
			);
			return;
		}

		if (isScrubActive) {
			el.dataset.scrub = "true";
			DOM.pin = swiperEl;
			DOM.trigger = wrapperEl;
			_initializeGsapAnimation();
		} else {
			DOM.swiperPagination = el.querySelector(".swiper-pagination");
			DOM.swiperNavigationContainer = el.querySelector(
				".swiper-navigation-container"
			);
		}

		//_maybeLazyLoadImages();
		_initializeSwiper(swiperEl);
	};

	return {
		initialize,
		update: () => {
			if (swiperInitialized && swiper) _update();
		},
		isScrubbing: () => isScrubActive
	};
};

document.addEventListener("DOMContentLoaded", () => {
	if (scroller) scroller.initialize();

	const carousels = [];

	const carousel1 = createCarousel();
	carousel1.initialize({
		selector: "#carousel_1",
		isScrubActive: true,
		isScrubOnTouchActive: true
	});
	carousels.push(carousel1);

	const carousel2 = createCarousel();
	carousel2.initialize({
		selector: "#carousel_2",
		isScrubActive: false,
		slideOpacity: false
	});
	carousels.push(carousel2);

	const carousel3 = createCarousel();
	carousel3.initialize({
		selector: "#carousel_3",
		isScrubActive: true,
		isScrubOnTouchActive: true,
		slideOpacity: false,
		scrubDir: -1
	});
	carousels.push(carousel3);

	const globalRefresh = () => {
		carousels.forEach((instance) => {
			if (!instance.isScrubbing()) {
				instance.update();
			}
		});

		ScrollTrigger.refresh();
	};

	const hideBlocker = () => {
		const blocker = document.getElementById("app_blocker");
		if (!blocker) return;

		blocker.classList.add("hide");

		// Remove after transition ends (or fallback timeout)
		const cleanup = () => {
			blocker.removeEventListener("transitionend", cleanup);
			blocker.remove();
		};

		blocker.addEventListener("transitionend", cleanup);
		setTimeout(() => {
			if (document.body.contains(blocker)) blocker.remove();
		}, 350);
	};

	if (utils.device.isTouch()) {
		window.addEventListener("orientationchange", () => {
			utils.system.nextTick(globalRefresh, null, 500);
		});
	} else {
		window.addEventListener("resize", () => {
			utils.system.nextTick(globalRefresh);
		});
	}

	const isCodePen = document.referrer.includes("codepen.io");
	const hostDomains = isCodePen ? ["codepen.io"] : [];
	hostDomains.push(window.location.hostname);

	const links = document.getElementsByTagName("a");
	utils.url.validateLinks(links, hostDomains);

	utils.system.nextTick(
		() => {
			globalRefresh();
		hideBlocker();
		},
		null,

		300
	);

	// Project Data (Embedded to avoid CORS issues with local files)
	const projectsData = {
		"game_yzr": {
			"title": "影之刃.断罪者",
			"description": "• 负责登录、支付模块的开发以及 SDK 接入\n• 负责系统功能的开发维护，包括新手引导、创角、抽卡、心法升级、副本组队、公告、线上活动更新等功能\n• 负责网络通信功能优化，解决网络延迟卡顿、优化网络断线重连的问题\n• 负责资源管理功能的维护开发，使用 Addressable 优化资源管理\n• 负责渲染效果优化，包括场景天气、描边、X-Ray 等基础 Shader 效果\n• 负责移动平台出包优化适配，处理 Android 和 iOS 底层问题\n• 负责 PS、Epic 平台适配，通过 Ps 平台 TRC 规则上线测试\n• 负责多语言本地化开发、字幕音频匹配系统的开发和维护\n• 负责PC、PS 端手柄适配接入\n• 负责 Jenkins 自动化出包",
			"tags": ["2D", "ARPG", "Unity", "水墨风"],
			"images": [
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/yzrnew1024.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/yzr435.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/yzr300.png"
			]
		},
		"game_dw": {
			"title": "大王不开心",
			"description": "2D 回合制卡牌手游，负责系统开发维护。该项目改编自同名人气漫画，拥有丰富的角色养成系统和策略性的战斗体验。在核心系统开发、UI 性能表现、日常玩法模块上持续迭代优化。",
			"tags": ["2D", "回合制", "卡牌", "Unity"],
			"images": [
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/dwnew1024.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/dw435.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/dw300.png"
			]
		},
		"game_roc": {
			"title": "Origin of Conquerors",
			"description": "• 负责 SLG 手游的核心系统功能开发与迭代。\n• 开发与优化大地图（World Map）视野裁剪与网格加载机制，大幅减少了地图上的 Draw Call 和内存消耗。\n• 负责行军路线动态计算、行军特效以及城建系统的底层架构逻辑。\n• 处理多玩家同屏时的帧率卡顿问题，实现了动态帧率控制和网格合并优化。",
			"tags": ["Unity", "SLG", "3D", "大地图优化"],
			"images": [
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/roknew1024.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/rok435.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/rok300.png"
			]
		},
		"game_dl": {
			"title": "斗罗大陆手游",
			"description": "• 负责 3D MMO RPG 手游的核心日常任务、副本系统、组队逻辑开发。\n• 优化场景加载 and 视锥体裁剪（Frustum Culling），有效提升在复杂多人战斗场景中的帧率稳定性。\n• 协助实现基于状态机（FSM）的玩家技能与怪物 AI 行为逻辑，提升了战斗的流畅性与操作打击感。\n• 针对中低端机型进行包体适配 and LOD 优化。",
			"tags": ["MMORPG", "Unity", "3D", "场景优化"],
			"images": [
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/dlnew1024.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/dl435.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/dl300.png"
			]
		},
		"game_ro": {
			"title": "Ragnarok Origin",
			"description": "• 参与大型多人在线角色扮演游戏（MMORPG）的玩法开发及本地化迭代。\n• 负责社交系统（公会、好友、聊天）、纸娃娃时装系统（Avatar System）的优化与重构，优化动态合图，减少因玩家换装带来的瞬时卡顿。\n• 处理海外版本适配，解决特殊分辨率适配、右反向排版、字形缓存爆满问题。\n• 优化资源打包与更新流，降低初始安装包大小。",
			"tags": ["MMORPG", "Unity", "3D", "纸娃娃系统"],
			"images": [
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/ronew1024.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/rok435.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/rok300.png"
			]
		},
		"game_qq": {
			"title": "飞车手游",
			"description": "• 负责 3D 赛车竞速类游戏的游戏玩法、车辆物理参数微调系统及成就系统的开发。\n• 优化赛车碰撞检测及刚体（Rigidbody）动力学计算，解决高速移动时的穿墙与同步抖动问题。\n• 核心竞速 UI 界面及动态特效衔接，优化 UGUI 渲染批次（Canvas Rebuild），确保竞速过程中的高帧率响应。\n• 支持手柄及重力感应操作的适配工作。",
			"tags": ["3D", "竞速", "Unity", "物理引擎"],
			"images": [
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/qq1024.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/qq435.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/qq300.png"
			]
		},
		"game_gf": {
			"title": "遗失的金羽毛",
			"description": "• 负责休闲三消（Match-3）+ 解谜玩法设计与核心逻辑开发。\n• 编写高效的三消棋盘匹配算法，实现多消、特殊元素爆炸效果及连消时的级联掉落逻辑。\n• 开发关卡编辑器（Level Editor），支持关卡策划快速配置关卡障碍物、目标分值和步数。\n• 深度优化连消时的粒子特效与物理动画，确保游戏画面的丝滑流畅。",
			"tags": ["2D", "三消", "解谜", "算法优化"],
			"images": [
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/gfnew1024.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/gf435.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/gf300.png"
			]
		},
		"game_cf": {
			"title": "咯咯农场",
			"description": "• 负责三消玩法与模拟经营（Farming Simulation）玩法的结合开发。\n• 负责农场作物的生长状态机、仓库系统、交易集市及任务系统的完整逻辑闭环。\n• 使用对象池（Object Pool）管理频繁创建与销毁的作物实体及三消特效，杜绝了长时间游玩导致的 GC 卡顿问题。\n• 实现离线收益计算及本地数据加密存储，防范作弊。",
			"tags": ["2D", "三消", "模拟经营", "对象池"],
			"images": [
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/cfnew1024.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/cf435.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/cf300.png"
			]
		},
		"game_m": {
			"title": "回到明朝2048",
			"description": "• 负责历史趣味 2048 休闲小游戏的全栈式开发。\n• 重新设计了 2048 的数字合并逻辑，支持朝代更替（从明太祖到崇祯皇帝）的趣味文本与卡牌升级特效。\n• 负责成就系统、明朝百科卡片收集系统及分享卡片自动生成功能。\n• 精准适配各种全面屏及折叠屏设备，优化轻量级包体大小，首包仅 10MB，加载速度极快。",
			"tags": ["2D", "2048", "休闲", "全面屏适配"],
			"images": [
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/mnew1024.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/m435.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/m300.png"
			]
		},
		"game_cat": {
			"title": "Cat Tactics",
			"description": "• 负责四子棋（Connect Four）益智休闲游戏的开发。\n• 基于极大极小值算法（Minimax）与 Alpha-Beta 剪枝技术，开发了具有高、中、低多级难度的 AI 人机对战模块。\n• 负责本地局域网联机对战（蓝牙/Wi-Fi）的连接管理及数据同步机制。\n• 加入猫咪主题音效、活泼的角色立绘与趣味特效，提升年轻用户群体的游玩体验。",
			"tags": ["2D", "棋类", "AI算法", "联机对战"],
			"images": [
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/catnew1024.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/cat435.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/cat300.png"
			]
		},
		"app_bingo": {
			"title": "Bingo AR儿童教育App",
			"description": "• 负责基于 AR Foundation 的绘本互动教育 APP 核心架构开发。\n• 运用图像识别追踪技术，实现当扫描特定实体绘本时，屏幕中自动渲染动态的 3D 模型和语音配音。\n• 实现多指触控缩放、旋转 3D 虚拟模型及有趣的互动动画效果。\n• 优化渲染以减少发热问题，保证在低端平板设备上的流畅度与安全性。",
			"tags": ["AR", "AR Foundation", "教育", "移动适配"],
			"images": [
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/bingonew1024.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/bingo435.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/bongo300.png"
			]
		},
		"app_pico": {
			"title": "VR 教育应用管理平台",
			"description": "• 参与三端统一（WEB 管理后台、Android 平板端、VR 硬件客户端）的 SaaS 级 VR 教育资源管理平台开发。\n• 负责 VR 终端应用更新检测、静默下载及安装管理功能（基于 Pico SDK 与 Android System App 服务）。\n• 实现多台 VR 设备之间的内容集中群控分发与数据上报功能，支持教师一键向全班推送课程场景。\n• 实现视频流传输与网络同步机制，保证全班 VR 视角基本对齐。",
			"tags": ["VR", "Pico", "SaaS", "群控系统"],
			"images": [
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/piconew1024.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/pico435.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/pico300.png"
			]
		},
		"app_vr": {
			"title": "VR应用内容开发",
			"description": "• 负责自然科学 K12 课程的多场景 VR 交互内容制作，包含活火山喷发模拟、海底生态观察、太阳系天体运动及人体微观血液循环等。\n• 配合主流 VR 硬件（HTC Vive / Quest 2），通过 Input System 规范手柄射线和物理抓取（Grab）交互。\n• 优化大型 3D 场景的材质与多边形（Polygon），使用遮挡剔除（Occlusion Culling）和烘焙光照贴图（Lightmap）降低硬件功耗，防止晕动症（Motion Sickness）。",
			"tags": ["VR", "Quest", "交互设计", "性能优化"],
			"images": [
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/vr1024.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/vr435.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/vr300.png"
			]
		},
		"app_hk": {
			"title": "虚拟仿真内容开发",
			"description": "• 负责物理、化学、生物等理科模拟实验的虚拟仿真系统逻辑与算法编写。\n• 开发了“动态液体化学反应模型”，支持不同酸碱度液体混合颜色渐变及沉淀特效生成。\n• 编写物理天平称重、滑动变阻器电路联通与电流表刻度偏移的精确物理公式计算引擎。\n• 实现高度灵活的连线系统（Wire Connection System），允许学生在 3D 面板里随意布线、断线并实时进行短路保护验证。",
			"tags": ["虚拟仿真", "K12", "物理引擎", "逻辑开发"],
			"images": [
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/hk1024.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/hk435.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/hk300.png"
			]
		},
		"app_holo": {
			"title": "MR应用内容开发",
			"description": "• 负责基于 HoloLens 2、Kinect 深度相机等高级硬件的混合现实交互开发。\n• 依托 MRTK（Mixed Reality Toolkit）开发精准的手部手势追踪（Hand Tracking）与眼球注视选择交互系统。\n• 开发基于 Kinect 的人体骨骼追踪与动作识别模块，应用于物理科普馆的大屏幕人机交互游戏。\n• 优化实时点云（Point Cloud）着色器渲染速度，处理大体积数据采集下的卡顿现象。",
			"tags": ["MR", "HoloLens2", "Kinect", "MRTK"],
			"images": [
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/holo1024.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/holo435.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/holo300.png"
			]
		},
		"app_qx": {
			"title": "全息盒子应用开发",
			"description": "• 负责全息投影盒子（Pyramid Hologram）的内容制作与四视角渲染相机的开发。\n• 通过设置四个呈十字形排布的 3D 摄像机（正、后、左、右）并将画面投射到四个划分区域，生成适合全息棱镜玻璃折射的视频流。\n• 开发针对精细模型（如珍稀文物、机械齿轮结构）的 3D 自动旋转、手势悬空控制缩放及内部构造解构演示。\n• 调整高对比度背景及发光材质，使全息悬浮视觉效果更加通透逼真。",
			"tags": ["全息投影", "4D", "三维视口", "材质优化"],
			"images": [
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/qx1024.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/qx435.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/qx300.png"
			]
		},
		"tech_jenkins": {
			"title": "Jenkins 自动化打包",
			"description": "• 搭建并维护团队的 Jenkins CI/CD 自动化流水线。\n• 编写 Jenkins Pipeline 脚本，支持 Android、iOS、PC 及 PS 平台的定时与一键自动打包。\n• 结合 Git、Unity Batchmode 命令行工具，集成代码自动拉取、自动编译、自动化单元测试及首包资源打包。\n• 配置打包完成后自动上传蒲公英（PGYER）或内网 FTP 部署，并通过企业微信/飞书群机器人发送出包通知与日志。",
			"tags": ["CI/CD", "Jenkins", "Pipeline", "自动化部署"],
			"images": [
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/jb1024.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/jb435.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/jb300.png"
			]
		},
		"tech_gameplay": {
			"title": "GamePlay玩法",
			"description": "• 深入理解各种游戏类型（动作、回合制、卡牌、SLG、休闲）的 GamePlay 系统架构设计。\n• 熟练实现基于行为树（Behavior Tree）、状态机（FSM）的游戏 AI 逻辑以及技能编辑器框架。\n• 负责战斗系统数值计算公式的客户端实现与边界校验，支持各种伤害飘字、状态同步与缓冲逻辑。\n• 专注提供极致的输入响应（Input Latency Optimization）和操作反馈特效，提升用户手感。",
			"tags": ["Gameplay", "AI", "战斗系统", "系统架构"],
			"images": [
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/gp1024.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/gp435.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/gp300.png"
			]
		},
		"tech_memory": {
			"title": "内存优化",
			"description": "熟悉 Unity 相关内存管理与优化。包括堆内存、非堆内存的监控，以及如何通过 Profiler 定位内存泄漏并进行针对性优化。开发了垃圾回收（GC）开销优化方案，有效应对由于频繁 Instantiate 或配置解析导致的 GC Spike。",
			"tags": ["Performance", "Optimization", "Unity", "Memory"],
			"images": [
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/nc1024.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/nc435.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/nc300.png"
			]
		},
		"tech_resource": {
			"title": "资源管理",
			"description": "熟悉 Addressable、Assetbundle 的运用。实现高效的资源加载、卸载和热更新流程，确保游戏包体大小可控且加载流畅。掌握资源预加载策略与依赖项解析，防止资产冗余与内存重复加载。",
			"tags": ["Addressables", "AssetBundle", "Resource Management"],
			"images": [
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/ab1024.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/ab435.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/ab300.png"
			]
		},
		"tech_network": {
			"title": "网络通信",
			"description": "• 熟悉前后端的 TCP 与 UDP 网络通信网络层封装。\n• 深入理解 Protobuf 数据序列化协议，编写轻量级的长连接网络客户端框架。\n• 掌握基于帧同步（Frame Synchronization）与状态同步（State Synchronization）的网络游戏同步模型。\n• 开发了稳定的断线重连（Reconnection）、心跳包检测以及网络抖动延迟平滑插值逻辑，减少高延迟环境下的角色瞬移现象。",
			"tags": ["TCP/UDP", "Protobuf", "断线重连", "同步模型"],
			"images": [
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/wl1024.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/wl435.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/wl300.png"
			]
		},
		"tech_graphics": {
			"title": "图形学",
			"description": "• 熟悉 Unity 的渲染管线，包括 Built-in 管线、URP（Universal Render Pipeline）的自定义配置。\n• 熟练使用 HLSL 编写着色器（Shader），实现描边（Toon Shading）、水面折射反射、天气雨雪积累以及 X-Ray 遮挡半透显示等基础和高级视觉效果。\n• 理解 Draw Call、Batches 优化原理，合理使用 Static/Dynamic Batching、GPU Instancing 以及 SRP Batcher 提升渲染性能。",
			"tags": ["URP", "HLSL", "Shader", "GPU Instancing"],
			"images": [
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/shader1024.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/shader435.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/shader300.png"
			]
		},
		"tech_language": {
			"title": "编程语言",
			"description": "• 精通 C# 语言，熟悉其垃圾回收（GC）机制、反射、协程、多线程编程及异步任务（Task）。\n• 熟练运用 Lua 语言进行游戏逻辑的热更和系统开发。\n• 拥有前端开发经验（TypeScript/JavaScript/CSS），熟悉原生 C++ 的内存管理，有 Android (Java/Kotlin) 和 iOS (Objective-C/Swift) 原生平台 SDK 混编适配经历。",
			"tags": ["C#", "Lua", "TypeScript", "C++", "SDK接入"],
			"images": [
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/dm1024.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/dm435.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/dm300.png"
			]
		},
		"tech_hotfix": {
			"title": "热更新",
			"description": "• 了解并实践过多种主流 Unity 热更新技术方案，包括 XLua、ToLua、HybridCLR（金属人）、ILRuntime 及 Puerts。\n• 熟练使用 HybridCLR（原 Huatuo）实现客户端全 C# 代码热更新，掌握元数据 AOT 泛型补充原理。\n• 负责搭建热更新资源与代码的打包分包流程，集成 MD5 对比、分包静默下载、网络异常续传等热更逻辑。",
			"tags": ["Hotfix", "HybridCLR", "xLua", "资源分包"],
			"images": [
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/rgx1024.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/rgx435.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/rgx300.png"
			]
		},
		"tech_fgui": {
			"title": "FairyGUI",
			"description": "• 深入理解 FairyGUI（FGUI）的工作流与 UI 架构原理。\n• 熟练使用 FGUI 关联关系（Relation）实现 UI 界面的自动屏幕适配，避免代码层写复杂的计算公式。\n• 掌握基于 FGUI 的虚拟列表（Virtual List）渲染技术，支持海量行项目滚动，优化 Draw Call 和顶点数量。\n• 负责封装统一的 UI 管理组件与生命周期，集成常用弹窗动效。",
			"tags": ["FairyGUI", "UI架构", "适配原理", "虚拟列表"],
			"images": [
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/fgui1024.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/fgui435.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/fgui300.png"
			]
		},
		"tech_ugui": {
			"title": "UGUI",
			"description": "• 熟悉 Unity 官方 UGUI 系统的底层工作原理。\n• 专注于 UGUI 性能优化，包括避免无意义 of Canvas Rebuild、动静 Canvas 分离、禁用不需要 Raycast Target 的 UI 组件。\n• 熟练实现 UI 图集（Atlas）的合理划分，降低因为 UI 重叠或频繁换图导致的 Draw Call 翻倍和纹理显存泄漏问题。\n• 编写自定义布局组件和图文混排组件。",
			"tags": ["UGUI", "Canvas Rebuild", "图集优化", "性能监测"],
			"images": [
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/ugui1024.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/ugui435.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/ugui300.png"
			]
		},
		"tech_ai": {
			"title": "Unity AI",
			"description": "• 熟悉 Unity 环境下的 AI 开发工作流。\n• 熟练使用 Unity NavMesh 寻路系统，实现多重高度、障碍物动态规避（NavMesh Obstacle）以及多人动态避碰（RVO/ORCA）。\n• 负责实现复杂敌人的状态管理（使用行为树 Behavior Designer / NodeCanvas 插件），设计警戒、追击、巡逻、逃跑等行为节点。\n• 了解简单的游戏内寻路寻优启发式算法（如 A* 算法）的底层编写与多线程计算。",
			"tags": ["AI", "NavMesh", "行为树", "寻路算法"],
			"images": [
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/ai1024.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/ai435.png",
				"https://xiaofengimg.oss-cn-beijing.aliyuncs.com/images/ai300.png"
			]
		}
	};

	// Stapel Grid Logic
	$(function () {
		var $grid = $('#tp-grid');
		var stapelInstance;

		function initStapel() {
			stapelInstance = $grid.stapel({
				delay: 50,
				gutter: 20,
				pileAngles: 3,
				onBeforeOpen: function (pileName) {
					$('#modal-title').html(pileName);
				},
				onAfterOpen: function () {
					$('#tp-grid-collapse').fadeIn();
				},
				onAfterClose: function () {
					$('#tp-grid-collapse').fadeOut();
				}
			});
		}

		$(document).on('click', '.cta-button', function (e) {
			e.preventDefault();
			var projectId = $(this).attr('data-project-id');
			console.log('Project Clicked:', projectId); // Debug log

			var project = projectsData[projectId];

			if (!project) {
				console.warn('No data found for project ID:', projectId);
				// Fallback to DOM parsing
				var $card = $(this).closest('.card');
				project = {
					title: $card.find('h3.title').text() || $card.find('h3').text() || "Project Detail",
					description: $card.find('p').text() || "Explore our latest UI design concepts...",
					tags: ["Project"],
					images: []
				};
			}

			// Update modal text
			$('#modal-title').text(project.title);
			$('#info-title').text(project.title);
			$('#info-description').text(project.description).css('white-space', 'pre-line');

			// Update tags
			var $tagContainer = $('.project-tags');
			$tagContainer.empty();
			if (project.tags) {
				project.tags.forEach(function (tag) {
					$tagContainer.append('<span>' + tag + '</span>');
				});
			}

			// Update gallery images
			if (project.images && project.images.length > 0) {
				$grid.empty();
				project.images.forEach(function (imgUrl) {
					$grid.append('<li data-pile="' + project.title + '"><a href="#"><img src="' + imgUrl + '" /></a></li>');
				});

				// Force clear Stapel data to allow fresh init
				$grid.removeData('stapel');
				stapelInstance = null;
			}

			$('#project-modal').addClass('active');
			$('body').addClass('modal-open');

			// Initialize stapel
			if (!stapelInstance) {
				initStapel();
			} else {
				stapelInstance.closePile();
			}

			// Automatically trigger the first pile to show content
			setTimeout(function () {
				var $firstItem = $grid.find('li').first();
				if ($firstItem.length) {
					$firstItem.trigger('click');
				}
				// Force a resize check for layout
				$(window).trigger('debouncedresize');
			}, 400);
		});

		$('#tp-grid-collapse').on('click', function () {
			if (stapelInstance && stapelInstance.spread) {
				$('.tp-grid li').removeClass('is-magnified');
				recalculateGridLayout();

				setTimeout(function () {
					// Clear GSAP inline styles so Stapel can control the collapse
					gsap.set('.tp-grid li', { clearProps: "width,height,left,top,zIndex" });
					stapelInstance.closePile();
				}, 700);
			}
		});

		// Dynamic Grid Interaction
		$(document).on('click', '.tp-grid li', function () {
			if (!stapelInstance || !stapelInstance.spread) return;

			var $clickedItem = $(this);
			var isMagnified = $clickedItem.hasClass('is-magnified');

			$('.tp-grid li').removeClass('is-magnified');

			if (!isMagnified) {
				$clickedItem.addClass('is-magnified');
			}

			recalculateGridLayout();
		});

		function recalculateGridLayout() {
			var $items = $grid.find('li');
			var containerWidth = $('.grid-wrapper').width();
			var gutter = 20;
			var baseW = 200;
			var baseH = 150;
			var cols = Math.floor((containerWidth + gutter) / (baseW + gutter));

			if (cols < 1) cols = 1;

			var gridSlots = []; // 2D array to track occupied slots
			function isSlotAvailable(r, c, w, h) {
				for (var i = r; i < r + h; i++) {
					for (var j = c; j < c + w; j++) {
						if (j >= cols) return false;
						if (gridSlots[i] && gridSlots[i][j]) return false;
					}
				}
				return true;
			}

			function occupySlots(r, c, w, h) {
				for (var i = r; i < r + h; i++) {
					if (!gridSlots[i]) gridSlots[i] = [];
					for (var j = c; j < c + w; j++) {
						gridSlots[i][j] = true;
					}
				}
			}

			var maxRow = 0;

			$items.each(function (index) {
				var $item = $(this);
				var isLarge = $item.hasClass('is-magnified');
				var itemW = isLarge ? 2 : 1;
				var itemH = isLarge ? 2 : 1;

				var found = false;
				for (var r = 0; !found; r++) {
					for (var c = 0; c < cols; c++) {
						if (isSlotAvailable(r, c, itemW, itemH)) {
							var left = c * (baseW + gutter);
							var top = r * (baseH + gutter);

							gsap.to($item, {
								left: left,
								top: top,
								width: isLarge ? (baseW * 2 + gutter) : baseW,
								height: isLarge ? (baseH * 2 + gutter) : baseH,
								duration: 0.6,
								ease: "expo.out",
								zIndex: isLarge ? 100 : 1
							});

							occupySlots(r, c, itemW, itemH);
							if (r + itemH > maxRow) maxRow = r + itemH;
							found = true;
							break;
						}
					}
				}
			});

			// Update container height
			gsap.to($grid, {
				height: maxRow * (baseH + gutter),
				duration: 0.6,
				ease: "expo.out"
			});
		}

		$('#tp-close').on('click', function () {
			if (stapelInstance && stapelInstance.spread) {
				$('.tp-grid li').removeClass('is-magnified');
				gsap.set('.tp-grid li', { clearProps: "width,height,left,top,zIndex" });
				stapelInstance.closePile();
			}
			$('#project-modal').removeClass('active');
			$('body').removeClass('modal-open');
		});
	});
});